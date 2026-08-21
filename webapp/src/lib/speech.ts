// Browser-native speech: natural-voice selection + a lip-sync driver for the
// on-screen interviewer, plus speech-to-text for spoken answers. Everything is
// feature-detected and degrades to text when unavailable.
//
// When the backend has a *user-directed* neural-voice source configured
// (see /interview/media/capabilities), `speakViaServer` streams real audio and
// drives the avatar's mouth from the true waveform amplitude. Otherwise the
// browser voice + synthetic lip-sync is used.
import { getAccess } from "./tokens";
import type { MutableRefObject } from "react";

export interface VoiceInfo {
  name: string;
  lang: string;
  voiceURI: string;
  natural: boolean;
  gender: "female" | "male" | "neutral";
}

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// --- voice gender heuristics ------------------------------------------------
const FEMALE_TOKENS = [
  "female", "aria", "jenny", "michelle", "ana", "sonia", "libby", "natasha",
  "clara", "samantha", "zira", "emma", "ava", "joanna", "salli", "kimberly",
  "amy", "hazel", "susan", "victoria", "karen", "moira", "tessa", "fiona",
  "nadia", "maya", "serena", "allison", "kate", "linda", "heather",
];
const MALE_TOKENS = [
  "male", "guy", "davis", "tony", "jason", "ryan", "brandon", "william",
  "eric", "george", "daniel", "david", "mark", "alex", "fred", "oliver",
  "thomas", "brian", "matthew", "arthur", "roger", "aaron", "christopher",
  "james", "paul", "rishi", "liam",
];

function voiceGender(name: string): "female" | "male" | "neutral" {
  const n = name.toLowerCase();
  if (FEMALE_TOKENS.some((t) => n.includes(t))) return "female";
  if (MALE_TOKENS.some((t) => n.includes(t))) return "male";
  return "neutral";
}

function isNatural(name: string): boolean {
  return /natural|neural|online/i.test(name);
}

function scoreVoice(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  const lang = (v.lang || "").toLowerCase();
  let s = 0;
  if (/natural|neural/.test(n)) s += 100; // Windows/Edge & Azure neural voices
  if (/online/.test(n)) s += 40;
  if (/google/.test(n)) s += 45; // Chrome's voices are quite natural
  if (/microsoft/.test(n)) s += 8;
  if (lang.startsWith("en")) s += 25;
  if (lang === "en-us" || lang === "en-gb") s += 6;
  return s;
}

let _voicesCache: SpeechSynthesisVoice[] = [];

/** Resolve the platform voice list (it loads asynchronously in most browsers). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve([]);
    const now = window.speechSynthesis.getVoices();
    if (now.length) {
      _voicesCache = now;
      return resolve(now);
    }
    const handler = () => {
      _voicesCache = window.speechSynthesis.getVoices();
      resolve(_voicesCache);
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler, { once: true });
    // Safety timeout — some browsers never fire the event.
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 700);
  });
}

/** English-capable voices, most natural first. */
export function rankedVoices(): VoiceInfo[] {
  const list = (_voicesCache.length ? _voicesCache : (ttsSupported() ? window.speechSynthesis.getVoices() : []))
    .filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
  return [...list]
    .sort((a, b) => scoreVoice(b) - scoreVoice(a))
    .map((v) => ({ name: v.name, lang: v.lang, voiceURI: v.voiceURI, natural: isNatural(v.name), gender: voiceGender(v.name) }));
}

function rawVoiceByURI(uri: string): SpeechSynthesisVoice | undefined {
  const list = _voicesCache.length ? _voicesCache : window.speechSynthesis.getVoices();
  return list.find((v) => v.voiceURI === uri);
}

/** Best natural voice for a persona gender, honouring a saved user override. */
export function pickVoice(gender: string, overrideURI?: string): SpeechSynthesisVoice | undefined {
  const list = _voicesCache.length ? _voicesCache : (ttsSupported() ? window.speechSynthesis.getVoices() : []);
  if (!list.length) return undefined;
  if (overrideURI) {
    const forced = list.find((v) => v.voiceURI === overrideURI);
    if (forced) return forced;
  }
  const en = list.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
  const pool = en.length ? en : list;
  const wanted = gender === "female" || gender === "male" ? gender : null;
  const matching = wanted ? pool.filter((v) => voiceGender(v.name) === wanted) : [];
  const chooseFrom = matching.length ? matching : pool;
  return [...chooseFrom].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}

// --- prosody per tone -------------------------------------------------------
const TONE: Record<string, { rate: number; pitch: number }> = {
  warm: { rate: 1.0, pitch: 1.05 },
  measured: { rate: 0.92, pitch: 0.96 },
  crisp: { rate: 1.03, pitch: 1.0 },
  firm: { rate: 0.95, pitch: 0.9 },
};

export interface SpeakOptions {
  gender?: string;
  tone?: string;
  voiceURI?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onBoundary?: () => void; // fires per word/clause — drives mouth emphasis
}

export interface SpeakHandle {
  stop: () => void;
}

/** Speak `text` with the best-matching natural voice. Returns a stop handle. */
export function speak(text: string, opts: SpeakOptions = {}): SpeakHandle {
  if (!ttsSupported() || !text.trim()) {
    opts.onStart?.();
    opts.onEnd?.();
    return { stop: () => {} };
  }
  const synth = window.speechSynthesis;
  synth.cancel(); // never overlap interviewer lines
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(opts.gender ?? "neutral", opts.voiceURI);
  if (voice) u.voice = voice;
  const tone = TONE[opts.tone ?? "warm"] ?? TONE.warm;
  u.rate = tone.rate;
  u.pitch = tone.pitch;
  // Nudge pitch for generic (non-persona-named) voices so gender still reads.
  if (voice && voiceGender(voice.name) === "neutral") {
    if (opts.gender === "female") u.pitch += 0.12;
    if (opts.gender === "male") u.pitch -= 0.12;
  }
  u.onstart = () => opts.onStart?.();
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  u.onboundary = () => opts.onBoundary?.();
  synth.speak(u);
  return { stop: () => synth.cancel() };
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

// --- speech-to-text (spoken answers) ---------------------------------------
export function sttSupported(): boolean {
  return typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export interface Recognizer {
  start: () => void;
  stop: () => void;
}

/** Continuous dictation with interim results. */
export function createRecognizer(handlers: {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
}): Recognizer | null {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  rec.onresult = (e: any) => {
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (final) handlers.onFinal?.(final);
    if (interim) handlers.onInterim?.(interim);
  };
  rec.onerror = (e: any) => handlers.onError?.(e.error || "speech error");
  rec.onend = () => handlers.onEnd?.();
  return {
    start: () => { try { rec.start(); } catch { /* already started */ } },
    stop: () => { try { rec.stop(); } catch { /* already stopped */ } },
  };
}

export { rawVoiceByURI };

// --- server-side neural voice (user-directed source) -----------------------
export interface MediaCapabilities {
  tts: boolean;
  video: boolean;
  personas: number;
}

export async function fetchMediaCapabilities(): Promise<MediaCapabilities> {
  try {
    const res = await fetch("/api/v1/interview/media/capabilities", {
      headers: { Authorization: `Bearer ${getAccess() ?? ""}` },
    });
    if (!res.ok) return { tts: false, video: false, personas: 0 };
    return await res.json();
  } catch {
    return { tts: false, video: false, personas: 0 };
  }
}

/** Speak a line through the configured neural-voice source, driving
 *  `amplitudeRef` from the real waveform for true lip-sync. Throws if the
 *  source is unavailable so the caller can fall back to the browser voice. */
export async function speakViaServer(
  text: string,
  voiceId: string,
  opts: { onStart?: () => void; onEnd?: () => void; amplitudeRef?: MutableRefObject<number> },
): Promise<SpeakHandle> {
  const res = await fetch("/api/v1/interview/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccess() ?? ""}` },
    body: JSON.stringify({ text, voice: voiceId }),
  });
  if (!res.ok) throw new Error(`tts unavailable (${res.status})`);
  const bytes = await res.arrayBuffer();
  const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtor();
  const buffer = await ctx.decodeAudioData(bytes);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);
  analyser.connect(ctx.destination);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;
  let done = false;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    if (opts.amplitudeRef) opts.amplitudeRef.current = Math.min(1, rms * 3.2);
    raf = requestAnimationFrame(tick);
  };
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    if (opts.amplitudeRef) opts.amplitudeRef.current = 0;
    opts.onEnd?.();
    ctx.close().catch(() => {});
  };
  src.onended = finish;
  opts.onStart?.();
  src.start();
  raf = requestAnimationFrame(tick);
  return { stop: () => { try { src.stop(); } catch { /* already stopped */ } finish(); } };
}

// --- user-directed persona library ------------------------------------------
export interface LibraryPersona {
  id: string;
  name: string;
  role: string;
  company: string;
  style: string;
  gender: string;
  voice: string;
  voice_id: string;
  video_url: string;
  bio: string;
}

export async function fetchPersonas(): Promise<LibraryPersona[]> {
  try {
    const res = await fetch("/api/v1/interview/personas", {
      headers: { Authorization: `Bearer ${getAccess() ?? ""}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
