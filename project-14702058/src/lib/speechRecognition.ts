/**
 * Shared Web Speech API typings + feature detection.
 *
 * The DOM lib doesn't ship SpeechRecognition in every TS config, so we declare
 * the minimal surface we actually use and expose a single capability check.
 */

export interface SpeechRecognitionResultItem {
  transcript: string;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
}

export interface SpeechRecognitionResultListLike {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionLike;
}

const windowRecord =
  typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : undefined;

export const SpeechRecognitionCtor = (
  windowRecord?.SpeechRecognition ?? windowRecord?.webkitSpeechRecognition
) as SpeechRecognitionConstructorLike | undefined;

export const speechSupported = Boolean(SpeechRecognitionCtor);