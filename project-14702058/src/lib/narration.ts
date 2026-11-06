import { api, apiBlob } from "./api";

/**
 * Read-aloud ("narration") API + helpers.
 *
 * The backend exposes a neural TTS catalog. When it's unavailable we fall back
 * to the browser's own Web Speech voices, so the control always works.
 */

export interface NarrationVoice {
  id: string;
  name: string;
  gender?: string;
  kind?: string;
}

/** Raw shape of `GET /api/v1/narration/voices`. */
export interface NarrationCatalog {
  server_tts: boolean;
  provider?: string;
  default_voice?: string;
  voices: NarrationVoice[];
  browser_fallback?: boolean;
  media_type?: string;
}

/** Voice normalized across server + browser sources so the picker is uniform. */
export interface NarrationVoiceOption {
  id: string;
  name: string;
  gender?: string;
  kind?: string;
  source: "server" | "browser";
}

/** Load the neural voice catalog (once per session, on app/page load). */
export function fetchNarrationVoices(): Promise<NarrationCatalog> {
  return api<NarrationCatalog>("/api/v1/narration/voices");
}

/** Synthesize speech for a single text chunk — resolves to an audio blob. */
export function synthesizeSpeech(text: string, voice: string): Promise<Blob> {
  return apiBlob("/api/v1/narration/speak", {
    method: "POST",
    body: { text, voice },
  });
}

/**
 * Server-side read-aloud preferences. These follow the user across devices, so
 * they take precedence over anything cached in localStorage.
 */
export interface NarrationPrefs {
  /** Auto-read newly generated summaries. The server default is false. */
  auto_play: boolean;
  /** Preferred voice id (server voice id or browser voiceURI). */
  voice?: string;
}

/** Load the user's saved read-aloud preferences. */
export function fetchNarrationPrefs(): Promise<NarrationPrefs> {
  return api<NarrationPrefs>("/api/v1/narration/prefs");
}

/**
 * Persist read-aloud preferences. Send only the field that changed:
 * `{ auto_play }` for the auto-play switch, `{ voice }` when the voice changes.
 */
export function saveNarrationPrefs(patch: {
  auto_play?: boolean;
  voice?: string;
}): Promise<NarrationPrefs> {
  return api<NarrationPrefs>("/api/v1/narration/prefs", {
    method: "PUT",
    body: patch,
  });
}

/**
 * Strip markdown + HTML down to speakable plain text so the voice never reads
 * "asterisk asterisk" or a raw tag name.
 */
export function toPlainSpeech(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  // Code fences and inline code (spoken content is rarely useful verbatim).
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]*)`/g, "$1");
  // Images before links: keep the alt/label text.
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // Headings, blockquotes, list markers at the start of a line.
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  s = s.replace(/^\s{0,3}([-*+]|\d+[.)])\s+/gm, "");
  // Bold / italic / strikethrough.
  s = s.replace(/(\*\*|__)(.*?)\1/g, "$2");
  s = s.replace(/(\*|_)(.*?)\1/g, "$2");
  s = s.replace(/~~(.*?)~~/g, "$1");
  // Any remaining HTML tags.
  s = s.replace(/<[^>]*>/g, " ");
  // Common entities.
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
  // Collapse whitespace.
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Split text into speech-sized chunks at sentence boundaries.
 * Keeps each server request comfortably under the payload limit and avoids the
 * browser engine truncating very long utterances.
 */
export function chunkForSpeech(text: string, max = 900): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];

  const sentences = clean.match(/[^.!?]*[.!?]+|[^.!?]+$/g) ?? [clean];
  const chunks: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) chunks.push(buffer.trim());
    buffer = "";
  };

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (sentence.length > max) {
      flush();
      let part = "";
      for (const word of sentence.split(/\s+/)) {
        const candidate = part ? `${part} ${word}` : word;
        if (candidate.length > max && part) {
          chunks.push(part);
          part = word;
        } else {
          part = candidate;
        }
      }
      if (part) buffer = part;
      continue;
    }

    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (candidate.length > max) {
      flush();
      buffer = sentence;
    } else {
      buffer = candidate;
    }
  }
  flush();

  return chunks.length ? chunks : [clean];
}

/**
 * Split plain text into individual sentences for karaoke-style tracking.
 * The renderer and the playback engine both use this, so the sentence the voice
 * is reading always lines up with the sentence that gets highlighted.
 */
export function splitSentences(text: string): string[] {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.match(/[^.!?]+[.!?]+["'”’)\]]*|[^.!?]+$/g);
  if (!parts) return [clean];
  const out = parts.map((p) => p.trim()).filter(Boolean);
  return out.length ? out : [clean];
}

const VOICE_KEY = "hw_narration_voice";
const ENABLED_KEY = "hw_narration_enabled";

/** Last chosen voice id (server voice id or browser voiceURI). */
export function readNarrationVoice(): string {
  try {
    return localStorage.getItem(VOICE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeNarrationVoice(id: string): void {
  try {
    if (id) localStorage.setItem(VOICE_KEY, id);
  } catch {
    // Ignore storage failures — the picker still works for this session.
  }
}

/** Whether the user last had read-aloud on. */
export function readNarrationEnabled(): boolean {
  try {
    const value = localStorage.getItem(ENABLED_KEY);
    return value === null ? true : value === "1";
  } catch {
    return true;
  }
}

export function writeNarrationEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}

const RATE_KEY = "hw_narration_rate";
const AUTO_READ_KEY = "hw_narration_auto_read";

/** Slowest / fastest playback the speed control allows. */
export const MIN_RATE = 0.5;
export const MAX_RATE = 1.5;

/** Keep a speed within the supported range. */
export function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const clamped = Math.min(MAX_RATE, Math.max(MIN_RATE, value));
  return Math.round(clamped * 100) / 100;
}

/** Human-friendly speed label, e.g. "1×", "1.25×". */
export function formatRate(rate: number): string {
  return `${Number(clampRate(rate).toFixed(2))}\u00d7`;
}

/** Remembered playback speed (1 = normal). */
export function readNarrationRate(): number {
  try {
    const raw = localStorage.getItem(RATE_KEY);
    return raw === null ? 1 : clampRate(Number(raw));
  } catch {
    return 1;
  }
}

export function writeNarrationRate(rate: number): void {
  try {
    localStorage.setItem(RATE_KEY, String(clampRate(rate)));
  } catch {
    // Ignore storage failures.
  }
}

/**
 * Whether newly-generated summaries should auto-read (hands-free).
 * This is only a local cache so the control renders correctly before the server
 * responds — the server value (`GET /api/v1/narration/prefs`) always wins, and
 * its default is off, so auto-read stays manual-only until the user opts in.
 */
export function readNarrationAutoRead(): boolean {
  try {
    const value = localStorage.getItem(AUTO_READ_KEY);
    return value === null ? false : value === "1";
  } catch {
    return false;
  }
}

export function writeNarrationAutoRead(on: boolean): void {
  try {
    localStorage.setItem(AUTO_READ_KEY, on ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}