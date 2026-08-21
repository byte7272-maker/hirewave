"use client";

import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Text-to-speech (interviewer voice) — standard SpeechSynthesis API.
// ---------------------------------------------------------------------------
export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string): void {
  if (!ttsSupported() || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

// ---------------------------------------------------------------------------
// Speech-to-text (voice answers) — non-standard webkitSpeechRecognition.
// Typed minimally since it isn't in the standard DOM lib.
// ---------------------------------------------------------------------------
interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}
interface SpeechEvent {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: { isFinal: boolean; 0: { transcript: string } };
  };
}

function recognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function sttSupported(): boolean {
  return recognitionCtor() !== null;
}

/** Voice dictation. Calls `onFinal` with each finalized phrase; exposes interim text. */
export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRec | null>(null);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: SpeechEvent) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const txt = res[0].transcript;
        if (res.isFinal) onFinal(txt.trim() + " ");
        else interimText += txt;
      }
      setInterim(interimText);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.onerror = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [onFinal]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported: sttSupported(), listening, interim, start, stop, toggle };
}

// ---------------------------------------------------------------------------
// Shared: filler / hedging words (matches the backend rater) for a live hint.
// ---------------------------------------------------------------------------
const FILLERS = [
  "um", "uh", "like", "just", "maybe", "i think", "i guess", "sort of",
  "kind of", "probably", "hopefully", "basically", "actually", "you know",
];

export function countFillers(text: string): number {
  const t = ` ${text.toLowerCase()} `;
  return FILLERS.reduce((n, f) => n + (t.split(f).length - 1), 0);
}
