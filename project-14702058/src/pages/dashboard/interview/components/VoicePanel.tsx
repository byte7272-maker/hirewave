import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ApiError } from "@/lib/api";
import {
  assignServerVoice,
  fetchVoiceClip,
  getMediaCapabilities,
  getPersonaVoice,
  listCustomVoices,
  resetPersonaVoice,
  savePersonaVoice,
  uploadPersonaVoice,
  type CustomVoice,
  type InterviewPersona,
  type PersonaVoice,
} from "@/lib/interview";
import CustomVoices from "@/pages/dashboard/interview/components/CustomVoices";

const ACCEPTED_EXT = ["mp3", "wav", "ogg", "webm", "m4a", "aac"];

function getPreferredVoices(): SpeechSynthesisVoice[] {
  const all = window.speechSynthesis.getVoices();
  const preferred = all.filter((v) => /Natural|Neural|Online|Google/i.test(v.name));
  const rest = all.filter((v) => !/Natural|Neural|Online|Google/i.test(v.name));
  return [...preferred, ...rest];
}

export default function VoicePanel({
  persona,
  onClose,
  onChanged,
  onBusyChange,
}: {
  persona: InterviewPersona;
  onClose: () => void;
  onChanged?: (hasCustomVoice: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [source, setSource] = useState<string>("browser");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [cloneEnabled, setCloneEnabled] = useState<boolean | null>(null);
  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  const [serverVoiceId, setServerVoiceId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const clipAudioRef = useRef<HTMLAudioElement | null>(null);
  const clipBlobUrlRef = useRef<string | null>(null);

  // Load the browser voice list (and refresh as the browser surfaces more).
  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      setLoading(false);
      return;
    }
    const load = () => setVoices(getPreferredVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  // Load this persona's effective voice (saved choice, or a default).
  useEffect(() => {
    let cancelled = false;
    getPersonaVoice(persona.id)
      .then((v) => {
        if (cancelled) return;
        applyVoice(v);
      })
      .catch(() => {
        // Effective voice is non-fatal — the panel still works with defaults.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona.id]);

  // Clean up any in-flight preview on unmount.
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      if (clipBlobUrlRef.current) URL.revokeObjectURL(clipBlobUrlRef.current);
    };
  }, []);

  // Report save/upload/reset/assign in-flight state up to the card.
  useEffect(() => {
    onBusyChange?.(saving || uploading || resetting || assigning);
  }, [saving, uploading, resetting, assigning, onBusyChange]);

  // Load media capabilities to gate the custom-voice area.
  useEffect(() => {
    let cancelled = false;
    getMediaCapabilities()
      .then((caps) => {
        if (!cancelled) setCloneEnabled(!!caps.voice_clone);
      })
      .catch(() => {
        // Capabilities are non-fatal — the panel still works without cloning.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load custom (cloned) voices once cloning is enabled.
  useEffect(() => {
    if (!cloneEnabled) return;
    let cancelled = false;
    listCustomVoices()
      .then((v) => {
        if (!cancelled) setCustomVoices(v ?? []);
      })
      .catch(() => {
        // Custom voice list is non-fatal.
      });
    return () => {
      cancelled = true;
    };
  }, [cloneEnabled]);

  function applyVoice(v: PersonaVoice | null | undefined) {
    if (!v) return;
    if (typeof v.source === "string") setSource(v.source);
    if (typeof v.voice_uri === "string") setVoiceUri(v.voice_uri);
    if (typeof v.rate === "number") setRate(v.rate);
    if (typeof v.pitch === "number") setPitch(v.pitch);
    if (typeof v.audio_url === "string") setAudioUrl(v.audio_url);
    if (typeof v.voice_id === "string") setServerVoiceId(v.voice_id);
  }

  function selectedVoice(): SpeechSynthesisVoice | undefined {
    if (!voiceUri) return undefined;
    return (
      voices.find((v) => v.voiceURI === voiceUri) ?? voices.find((v) => v.name === voiceUri)
    );
  }

  function stopClip() {
    const a = clipAudioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
      a.removeAttribute("src");
      a.load();
    }
    if (clipBlobUrlRef.current) {
      URL.revokeObjectURL(clipBlobUrlRef.current);
      clipBlobUrlRef.current = null;
    }
  }

  async function playClip(url: string) {
    setError("");
    setPreviewing(true);
    try {
      const blob = await fetchVoiceClip(url);
      const objUrl = URL.createObjectURL(blob);
      clipBlobUrlRef.current = objUrl;
      const a = clipAudioRef.current;
      if (!a) {
        setPreviewing(false);
        return;
      }
      a.onended = () => setPreviewing(false);
      a.src = objUrl;
      await a.play().catch(() => setPreviewing(false));
    } catch {
      setPreviewing(false);
      setError("Could not load the voice clip.");
    }
  }

  function preview() {
    setError("");
    setNotice("");
    if (source === "uploaded" && audioUrl) {
      stopClip();
      playClip(audioUrl);
      return;
    }
    const text = `Hi, I'm ${persona.name}. Let's begin.`;
    if (!("speechSynthesis" in window)) {
      setError("Speech synthesis isn't supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = selectedVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = rate;
    u.pitch = pitch;
    u.onstart = () => setPreviewing(true);
    u.onend = () => setPreviewing(false);
    u.onerror = () => setPreviewing(false);
    setPreviewing(true);
    window.speechSynthesis.speak(u);
  }

  async function save() {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const v = selectedVoice();
      await savePersonaVoice(persona.id, {
        source: "browser",
        voice_uri: voiceUri,
        lang: v?.lang,
        rate,
        pitch,
      });
      setNotice("Voice saved.");
      onChanged?.(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the voice.");
    } finally {
      setSaving(false);
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXT.includes(ext)) {
      setError("Unsupported file type — use mp3, wav, ogg, webm, m4a, or aac.");
      return;
    }
    setError("");
    setNotice("");
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    uploadPersonaVoice(persona.id, form)
      .then((result) => {
        if (result) {
          applyVoice(result);
          if (typeof result.source === "string") setSource(result.source);
          if (typeof result.audio_url === "string") setAudioUrl(result.audio_url);
        } else {
          setSource("uploaded");
        }
        setNotice("Custom clip uploaded.");
        onChanged?.(true);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Could not upload the clip.");
      })
      .finally(() => setUploading(false));
  }

  async function reset() {
    setError("");
    setNotice("");
    setResetting(true);
    try {
      await resetPersonaVoice(persona.id);
      setVoiceUri("");
      setRate(1);
      setPitch(1);
      setAudioUrl(null);
      setSource("browser");
      setNotice("Voice reset to the default.");
      onChanged?.(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset the voice.");
    } finally {
      setResetting(false);
    }
  }

  function refetchCustomVoices() {
    listCustomVoices()
      .then((v) => setCustomVoices(v ?? []))
      .catch(() => {});
  }

  async function assignServerVoiceNow(voiceId: string) {
    setError("");
    setNotice("");
    setAssigning(true);
    try {
      await assignServerVoice(persona.id, voiceId);
      setServerVoiceId(voiceId);
      setSource("server");
      setVoiceUri("");
      setAudioUrl(null);
      setNotice("Custom voice assigned.");
      onChanged?.(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign the voice.");
    } finally {
      setAssigning(false);
    }
  }

  function onPickerChange(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    if (value.startsWith("server:")) {
      assignServerVoiceNow(value.slice("server:".length));
      return;
    }
    setVoiceUri(value);
    setSource("browser");
    setServerVoiceId("");
  }

  const pickerValue =
    source === "server" && serverVoiceId ? `server:${serverVoiceId}` : voiceUri;

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center text-sm text-foreground-500 gap-2">
        <i className="ri-loader-4-line animate-spin"></i>
        Loading voice…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-accent-100 text-accent-900 px-3.5 py-2.5 text-xs">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 text-green-800 px-3.5 py-2.5 text-xs">
          <i className="ri-checkbox-circle-line text-base"></i>
          <span>{notice}</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-foreground-600">
        <span className="font-semibold text-foreground-900">Current voice:</span>
        <span>
          {source === "uploaded"
            ? "Custom clip"
            : source === "server"
              ? "Cloned voice"
              : "Browser voice"}
        </span>
      </div>

      <div className="space-y-1.5">
        <label
          className="text-xs font-semibold text-foreground-700"
          htmlFor={`voice-${persona.id}`}
        >
          Voice
        </label>
        {voices.length === 0 ? (
          <p className="text-xs text-foreground-500">No browser voices available.</p>
        ) : (
          <select
            id={`voice-${persona.id}`}
            value={pickerValue}
            onChange={onPickerChange}
            disabled={assigning}
            className="w-full px-3 py-2 rounded-md bg-background-100 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            <option value="">— Default —</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
            {cloneEnabled === true && customVoices.length > 0 && (
              <optgroup label="Custom voices">
                {customVoices.map((cv) => (
                  <option key={String(cv.id)} value={`server:${cv.external_voice_id}`}>
                    {cv.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <label className="font-semibold text-foreground-700" htmlFor={`rate-${persona.id}`}>
            Rate
          </label>
          <span className="text-foreground-500">{rate.toFixed(1)}&times;</span>
        </div>
        <input
          id={`rate-${persona.id}`}
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-full accent-primary-500 cursor-pointer"
        />
      </div>

      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <label className="font-semibold text-foreground-700" htmlFor={`pitch-${persona.id}`}>
            Pitch
          </label>
          <span className="text-foreground-500">{pitch.toFixed(1)}</span>
        </div>
        <input
          id={`pitch-${persona.id}`}
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={pitch}
          onChange={(e) => setPitch(Number(e.target.value))}
          className="w-full accent-primary-500 cursor-pointer"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={preview}
          disabled={previewing}
          className="inline-flex items-center gap-2 text-sm font-semibold bg-background-100 text-foreground-900 border border-background-200 hover:bg-background-200 px-4 py-2.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          <i className={previewing ? "ri-loader-4-line animate-spin" : "ri-volume-up-line"}></i>
          {previewing ? "Playing…" : "Preview"}
        </button>
        <button
          onClick={save}
          disabled={saving || source === "server"}
          className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          <i className={saving ? "ri-loader-4-line animate-spin" : "ri-save-line"}></i>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="rounded-lg border border-dashed border-background-300 p-4 text-center">
        <p className="text-xs text-foreground-600 mb-2">Or upload a custom intro clip</p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 text-sm font-semibold bg-secondary-100 text-secondary-900 border border-secondary-200 hover:bg-secondary-200 px-4 py-2.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          <i className={uploading ? "ri-loader-4-line animate-spin" : "ri-upload-2-line"}></i>
          {uploading ? "Uploading…" : "Upload clip"}
        </button>
        <p className="text-[11px] text-foreground-400 mt-2">mp3 / wav / ogg / webm / m4a / aac</p>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_EXT.map((e) => `.${e}`).join(",")}
          onChange={onFile}
          className="hidden"
        />
      </div>

      <button
        onClick={reset}
        disabled={resetting}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 hover:text-accent-700 cursor-pointer whitespace-nowrap"
      >
        <i className={resetting ? "ri-loader-4-line animate-spin" : "ri-restart-line"}></i>
        {resetting ? "Resetting…" : "Reset to default voice"}
      </button>

      <div className="pt-2">
        {cloneEnabled === true ? (
          <CustomVoices voices={customVoices} onChanged={refetchCustomVoices} />
        ) : cloneEnabled === false ? (
          <div className="rounded-lg border border-dashed border-background-300 px-4 py-3 text-center">
            <p className="text-xs text-foreground-500">Custom voices aren&rsquo;t enabled yet.</p>
          </div>
        ) : null}
      </div>

      <audio ref={clipAudioRef} className="hidden" />
    </div>
  );
}