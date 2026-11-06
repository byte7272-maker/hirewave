import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api";
import { getAccess } from "@/lib/tokens";
import {
  chunkForSpeech,
  clampRate,
  fetchNarrationPrefs,
  fetchNarrationVoices,
  readNarrationAutoRead,
  readNarrationEnabled,
  readNarrationRate,
  readNarrationVoice,
  saveNarrationPrefs,
  splitSentences,
  synthesizeSpeech,
  toPlainSpeech,
  writeNarrationAutoRead,
  writeNarrationEnabled,
  writeNarrationRate,
  writeNarrationVoice,
  type NarrationVoiceOption,
} from "@/lib/narration";

export interface NarrationError {
  id: string;
  message: string;
}

interface NarrationContextValue {
  voices: NarrationVoiceOption[];
  /** True when the backend provides neural voices. */
  serverTts: boolean;
  /** The browser Web Speech fallback is (almost) always available. */
  browserFallback: boolean;
  voiceId: string;
  setVoiceId: (id: string) => void;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  /** Playback speed (1 = normal). */
  rate: number;
  setRate: (value: number) => void;
  /** Whether newly-generated summaries auto-read (hands-free). */
  autoRead: boolean;
  setAutoRead: (value: boolean) => void;
  /** Id of the summary currently being read. */
  activeId: string | null;
  /** Id of the summary whose audio is being generated (request in flight). */
  busyId: string | null;
  /** Index of the sentence currently being spoken (karaoke tracking). -1 when idle. */
  spokenIndex: number;
  error: NarrationError | null;
  speak: (id: string, text: string) => void;
  stop: () => void;
  stopIfActive: (id: string) => void;
  toggle: (id: string, text: string) => void;
  /** Load the voice catalog once (no-op after the first successful load). */
  ensureLoaded: () => void;
}

const NarrationContext = createContext<NarrationContextValue | null>(null);

/** Ignore repeat taps within this window. */
const CLICK_DEBOUNCE_MS = 250;

/**
 * Owns the voice catalog and a single shared playback engine, so starting one
 * summary stops the previous one and the "speaking" indicator is unambiguous.
 *
 * Playback runs sentence by sentence so the UI can highlight (karaoke-style) the
 * exact sentence the voice is reading.
 */
export function NarrationProvider({ children }: { children: ReactNode }) {
  const [voices, setVoices] = useState<NarrationVoiceOption[]>([]);
  const [serverTts, setServerTts] = useState(false);
  const [browserFallback, setBrowserFallback] = useState(true);
  const [voiceId, setVoiceIdState] = useState("");
  const [enabled, setEnabledState] = useState(() => readNarrationEnabled());
  const [rate, setRateState] = useState(() => readNarrationRate());
  const [autoRead, setAutoReadState] = useState(() => readNarrationAutoRead());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [spokenIndex, setSpokenIndex] = useState(-1);
  const [error, setError] = useState<NarrationError | null>(null);

  const loadedRef = useRef(false);
  const runIdRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const activeCancelRef = useRef<(() => void) | null>(null);
  const lastClickRef = useRef(0);
  const serverTtsRef = useRef(false);
  const voiceIdRef = useRef("");
  const activeIdRef = useRef<string | null>(null);
  const rateRef = useRef(rate);
  /** Voice chosen on the server — wins over the localStorage cache once known. */
  const serverVoiceRef = useRef("");

  useEffect(() => {
    serverTtsRef.current = serverTts;
  }, [serverTts]);
  useEffect(() => {
    voiceIdRef.current = voiceId;
  }, [voiceId]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Persist the chosen voice + toggles. localStorage is only a cache — the
  // server is the source of truth (see ensureLoaded + the setters below).
  useEffect(() => {
    if (voiceId) writeNarrationVoice(voiceId);
  }, [voiceId]);
  useEffect(() => {
    writeNarrationEnabled(enabled);
  }, [enabled]);
  useEffect(() => {
    writeNarrationAutoRead(autoRead);
  }, [autoRead]);
  // Keep the live speed in a ref and apply it to any blob already playing.
  useEffect(() => {
    rateRef.current = rate;
    writeNarrationRate(rate);
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.playbackRate = rate;
      } catch {
        // Ignore — not all engines expose playbackRate.
      }
    }
  }, [rate]);

  const setVoiceId = useCallback((value: string) => {
    setVoiceIdState(value);
    // Persist the change server-side so it follows the user across devices.
    void saveNarrationPrefs({ voice: value }).catch(() => {});
  }, []);
  const setEnabled = useCallback((value: boolean) => setEnabledState(value), []);
  const setRate = useCallback((value: number) => setRateState(clampRate(value)), []);
  const setAutoRead = useCallback((value: boolean) => {
    setAutoReadState(value);
    // The auto-play switch persists `auto_play` server-side.
    void saveNarrationPrefs({ auto_play: value }).catch(() => {});
  }, []);

  const cleanupAudio = useCallback(() => {
    activeCancelRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        // Rewind so a stopped clip can never resume mid-sentence.
        audio.currentTime = 0;
      } catch {
        // Ignore — the element may already be detached.
      }
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    runIdRef.current += 1;
    const cancel = activeCancelRef.current;
    if (cancel) cancel();
    cleanupAudio();
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        // cancel() clears the queue; resume() unsticks engines (Chrome/Safari)
        // that can otherwise keep talking after a cancel.
        synth.cancel();
        synth.resume();
      }
    } catch {
      // Ignore — speech synthesis may be unavailable.
    }
    setActiveId(null);
    setBusyId(null);
    setSpokenIndex(-1);
  }, [cleanupAudio]);

  // Esc halts the current read no matter where focus is, so playing audio is
  // never left running without an obvious way to stop it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activeIdRef.current) stop();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stop]);

  // Stop everything when the provider unmounts / the app tears down.
  useEffect(
    () => () => {
      runIdRef.current += 1;
      activeCancelRef.current?.();
      const audio = audioRef.current;
      if (audio) {
        try {
          audio.pause();
        } catch {
          // Ignore.
        }
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // Ignore.
      }
    },
    []
  );

  /** Fill the picker from the browser's own voices (async on most browsers). */
  const populateBrowserVoices = useCallback((preferred?: string) => {
    const synth = window.speechSynthesis;
    if (!synth || typeof synth.getVoices !== "function") {
      setVoices([]);
      return;
    }
    const apply = (): boolean => {
      const list = synth.getVoices() ?? [];
      if (!list.length) return false;
      const mapped: NarrationVoiceOption[] = list.map((v) => ({
        id: v.voiceURI,
        name: v.name,
        kind: v.lang,
        source: "browser",
      }));
      setVoices(mapped);
      // The server's voice wins, then the cached pick, then the first voice.
      const stored = preferred || readNarrationVoice();
      setVoiceIdState((prev) => {
        if (stored && mapped.some((v) => v.id === stored)) return stored;
        if (prev && mapped.some((v) => v.id === prev)) return prev;
        return mapped[0].id;
      });
      return true;
    };
    if (apply()) return;

    let done = false;
    const onChanged = () => {
      if (done) return;
      if (apply()) {
        done = true;
        synth.onvoiceschanged = null;
      }
    };
    synth.onvoiceschanged = onChanged;
    window.setTimeout(() => {
      if (done) return;
      done = true;
      synth.onvoiceschanged = null;
    }, 2000);
  }, []);

  const ensureLoaded = useCallback(async () => {
    if (loadedRef.current) return;
    // Voices + prefs need an access token — retry once the user is signed in.
    if (!getAccess()) return;
    loadedRef.current = true;

    // Prefs and the voice catalog load together; neither blocks the other.
    const [prefsResult, voicesResult] = await Promise.allSettled([
      fetchNarrationPrefs(),
      fetchNarrationVoices(),
    ]);

    // The saved prefs win over the localStorage cache (they follow the user).
    if (prefsResult.status === "fulfilled" && prefsResult.value) {
      const prefs = prefsResult.value;
      if (typeof prefs.auto_play === "boolean") setAutoReadState(prefs.auto_play);
      if (typeof prefs.voice === "string" && prefs.voice) serverVoiceRef.current = prefs.voice;
    }

    try {
      if (voicesResult.status !== "fulfilled") throw new Error("voices unavailable");
      const data = voicesResult.value;
      const srv = Boolean(data?.server_tts);
      setBrowserFallback(data?.browser_fallback ?? true);
      const list = Array.isArray(data?.voices) ? data.voices : [];
      if (srv && list.length) {
        const mapped: NarrationVoiceOption[] = list.map((v) => ({
          id: String(v.id),
          name: v.name,
          gender: v.gender,
          kind: v.kind,
          source: "server",
        }));
        setServerTts(true);
        setVoices(mapped);
        const stored = serverVoiceRef.current || readNarrationVoice();
        const def = data?.default_voice ?? "";
        setVoiceIdState((prev) => {
          if (stored && mapped.some((v) => v.id === stored)) return stored;
          if (def && mapped.some((v) => v.id === def)) return def;
          if (prev && mapped.some((v) => v.id === prev)) return prev;
          return mapped[0].id;
        });
        return;
      }
    } catch {
      // Fall through to browser voices.
    }
    setServerTts(false);
    setBrowserFallback(true);
    populateBrowserVoices(serverVoiceRef.current || undefined);
  }, [populateBrowserVoices]);

  // Load once on app/page load (no-ops until signed in).
  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  /** Play a single audio blob; resolves false when stopped/superseded early. */
  const playBlob = useCallback((blob: Blob, runId: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      try {
        audio.playbackRate = rateRef.current;
      } catch {
        // Ignore — not all engines expose playbackRate.
      }
      audioRef.current = audio;
      urlRef.current = url;
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        audio.onended = null;
        audio.onerror = null;
        activeCancelRef.current = null;
        if (audioRef.current === audio) audioRef.current = null;
        if (urlRef.current === url) {
          URL.revokeObjectURL(url);
          urlRef.current = null;
        }
        resolve(ok);
      };
      activeCancelRef.current = () => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // Ignore.
        }
        done(false);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      void audio.play().catch(() => done(false));
    });
  }, []);

  /** Speak sentence-by-sentence via the browser's Web Speech API (fallback path). */
  const speakBrowser = useCallback(
    (sentences: string[], id: string, runId: number) => {
      const synth = window.speechSynthesis;
      if (!synth || typeof window.SpeechSynthesisUtterance !== "function") {
        setActiveId(null);
        setBusyId(null);
        setSpokenIndex(-1);
        setError({ id, message: "Speech isn't supported on this device." });
        return;
      }
      const list = synth.getVoices() ?? [];
      const chosen = list.find((v) => v.voiceURI === voiceIdRef.current) ?? null;
      const finish = () => {
        if (runIdRef.current !== runId) return;
        setActiveId(null);
        setBusyId(null);
        setSpokenIndex(-1);
      };
      sentences.forEach((sentence, index) => {
        const utter = new SpeechSynthesisUtterance(sentence);
        if (chosen) utter.voice = chosen;
        utter.rate = rateRef.current;
        utter.onstart = () => {
          if (runIdRef.current === runId) setSpokenIndex(index);
        };
        if (index === sentences.length - 1) {
          utter.onend = finish;
          utter.onerror = finish;
        }
        synth.speak(utter);
      });
    },
    []
  );

  /** Speak sentence-by-sentence via the neural backend, splitting on 413. */
  const speakServer = useCallback(
    async (sentences: string[], _id: string, runId: number): Promise<void> => {
      const voice = voiceIdRef.current;
      for (let index = 0; index < sentences.length; index += 1) {
        if (runIdRef.current !== runId) return;
        // A single sentence can still be too large — split it further on demand.
        const queue: string[] = [sentences[index]];
        while (queue.length) {
          if (runIdRef.current !== runId) return;
          const chunk = queue.shift() as string;
          let blob: Blob;
          try {
            blob = await synthesizeSpeech(chunk, voice);
          } catch (err) {
            if (err instanceof ApiError && err.status === 413 && chunk.length > 80) {
              const pieces = chunkForSpeech(
                chunk,
                Math.max(80, Math.floor(chunk.length / 2))
              );
              if (pieces.length > 1) {
                queue.unshift(...pieces);
                continue;
              }
            }
            throw err;
          }
          if (runIdRef.current !== runId) return;
          setSpokenIndex(index);
          const ok = await playBlob(blob, runId);
          if (!ok) return;
        }
      }
    },
    [playBlob]
  );

  const speak = useCallback(
    (id: string, rawText: string) => {
      const text = toPlainSpeech(rawText);
      const sentences = splitSentences(text);
      if (!sentences.length) return;
      stop();
      const runId = runIdRef.current;
      setError(null);
      setActiveId(id);
      setSpokenIndex(0);

      if (serverTtsRef.current) {
        setBusyId(id);
        speakServer(sentences, id, runId)
          .then(() => {
            if (runIdRef.current !== runId) return;
            setBusyId(null);
            setActiveId(null);
            setSpokenIndex(-1);
          })
          .catch((err) => {
            if (runIdRef.current !== runId) return;
            setBusyId(null);
            if (err instanceof ApiError && err.status === 502) {
              setError({ id, message: "Couldn't generate audio, using device voice" });
            } else if (err instanceof ApiError && err.status !== 501) {
              setError({ id, message: err.message });
            }
            // 501 (and any other failure) → silently use the device voice.
            speakBrowser(sentences, id, runId);
          });
      } else {
        speakBrowser(sentences, id, runId);
      }
    },
    [stop, speakServer, speakBrowser]
  );

  const stopIfActive = useCallback(
    (id: string) => {
      if (activeIdRef.current === id) stop();
    },
    [stop]
  );

  const toggle = useCallback(
    (id: string, text: string) => {
      const now = Date.now();
      if (now - lastClickRef.current < CLICK_DEBOUNCE_MS) return;
      lastClickRef.current = now;
      if (activeIdRef.current === id) {
        stop();
        return;
      }
      speak(id, text);
    },
    [speak, stop]
  );

  const value = useMemo<NarrationContextValue>(
    () => ({
      voices,
      serverTts,
      browserFallback,
      voiceId,
      setVoiceId,
      enabled,
      setEnabled,
      rate,
      setRate,
      autoRead,
      setAutoRead,
      activeId,
      busyId,
      spokenIndex,
      error,
      speak,
      stop,
      stopIfActive,
      toggle,
      ensureLoaded,
    }),
    [
      voices,
      serverTts,
      browserFallback,
      voiceId,
      setVoiceId,
      enabled,
      setEnabled,
      rate,
      setRate,
      autoRead,
      setAutoRead,
      activeId,
      busyId,
      spokenIndex,
      error,
      speak,
      stop,
      stopIfActive,
      toggle,
      ensureLoaded,
    ]
  );

  return <NarrationContext.Provider value={value}>{children}</NarrationContext.Provider>;
}

export function useNarration(): NarrationContextValue {
  const ctx = useContext(NarrationContext);
  if (!ctx) {
    // Safe no-op so a control rendered outside the provider never crashes.
    return {
      voices: [],
      serverTts: false,
      browserFallback: true,
      voiceId: "",
      setVoiceId: () => {},
      enabled: true,
      setEnabled: () => {},
      rate: 1,
      setRate: () => {},
      autoRead: true,
      setAutoRead: () => {},
      activeId: null,
      busyId: null,
      spokenIndex: -1,
      error: null,
      speak: () => {},
      stop: () => {},
      stopIfActive: () => {},
      toggle: () => {},
      ensureLoaded: () => {},
    };
  }
  return ctx;
}