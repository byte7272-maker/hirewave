import { api, apiBlob, apiUpload } from "./api";

// ---- Types ----

export interface InterviewPersona {
  id: string | number;
  name: string;
  role: string;
  company?: string;
  bio?: string;
  difficulty?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

export interface InterviewTurn {
  speaker?: string;
  question?: string;
  answer?: string;
  follow_up?: string;
  feedback?: string;
  response_seconds?: number | null;
  [key: string]: unknown;
}

export interface MockSummary {
  avg_response_seconds?: number | null;
  [key: string]: unknown;
}

export interface MockStartRequest {
  persona_id: string | number;
  resume_id?: string | number;
  max_questions?: number;
}

export interface MockSession {
  id: string | number;
  persona?: InterviewPersona;
  plan?: unknown;
  turns?: InterviewTurn[];
  status?: string;
  question?: string;
  summary?: MockSummary | string | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface ReplyResult {
  turns?: InterviewTurn[];
  status?: string;
  summary?: MockSummary | string | null;
  follow_up?: string;
  feedback?: string;
  question?: string;
  [key: string]: unknown;
}

// ---- API calls ----

export function listPersonas() {
  return api<InterviewPersona[]>("/api/v1/interview/personas");
}

export function listMockSessions() {
  return api<MockSession[]>("/api/v1/interview/mock");
}

export function startMock(body: MockStartRequest) {
  return api<MockSession>("/api/v1/interview/mock/start", { method: "POST", body });
}

export function replyMock(
  id: string | number,
  body: { answer: string; response_seconds?: number },
) {
  return api<ReplyResult>(`/api/v1/interview/mock/${id}/reply`, { method: "POST", body });
}

// ---- Per-turn coaching ----

export interface CoachResult {
  question?: string;
  category?: string;
  model_answer?: string;
  answer_seconds?: number;
  tips?: string[] | string | null;
  [key: string]: unknown;
}

/** Coaching (model answer, tips, suggested answer time) for the current turn. */
export function fetchCoach(id: string | number) {
  return api<CoachResult>(`/api/v1/interview/mock/${id}/coach`);
}

// ---- Vocabulary coaching ----

export type VocabularyKind = "filler" | "weak" | "overused";

/** Speaking pace derived from words-per-minute — "" when it can't be judged yet. */
export type VocabularyPace = "" | "slow" | "steady" | "fast" | "rushed";

export interface VocabularySuggestion {
  original: string;
  kind: VocabularyKind;
  count?: number;
  suggestions?: string[];
  note?: string;
  [key: string]: unknown;
}

export interface VocabularyResult {
  score: number;
  summary?: string;
  filler_count?: number;
  filler_ratio?: number;
  word_count?: number;
  unique_words?: number;
  vocabulary_richness?: number;
  words_per_minute?: number;
  /** Only present once `elapsed_seconds` is sent. */
  pace?: VocabularyPace;
  suggestions?: VocabularySuggestion[];
  polished?: string;
  [key: string]: unknown;
}

export interface VocabularyRequest {
  text: string;
  rewrite?: boolean;
  /** Seconds of speech captured so far — enables pace + words-per-minute. */
  elapsed_seconds?: number;
}

/**
 * Analyze a running transcript for filler/weak/overused wording.
 * Pass an AbortSignal for the live poll so a stale request can be cancelled.
 */
export function analyzeVocabulary(body: VocabularyRequest, signal?: AbortSignal) {
  return api<VocabularyResult>("/api/v1/interview/vocabulary", { method: "POST", body, signal });
}

// ---- Voice & text-to-speech ----

export interface MediaCapabilities {
  tts?: boolean;
  stt?: boolean;
  voice_clone?: boolean;
  [key: string]: unknown;
}

export interface PersonaVoice {
  persona_id?: string | number;
  source?: "browser" | "server" | "uploaded" | string;
  voice_id?: string;
  voice_uri?: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  audio_url?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface SaveVoiceRequest {
  source: "browser";
  voice_uri: string;
  lang?: string;
  rate: number;
  pitch: number;
}

export function getMediaCapabilities() {
  return api<MediaCapabilities>("/api/v1/interview/media/capabilities");
}

export function textToSpeech(body: { text: string; voice?: string }) {
  return apiBlob("/api/v1/interview/tts", { method: "POST", body });
}

export function listVoices() {
  return api<PersonaVoice[]>("/api/v1/interview/voices");
}

export function getPersonaVoice(personaId: string | number) {
  return api<PersonaVoice>(`/api/v1/interview/personas/${personaId}/voice`);
}

export function savePersonaVoice(personaId: string | number, body: SaveVoiceRequest) {
  return api<PersonaVoice>(`/api/v1/interview/personas/${personaId}/voice`, {
    method: "PUT",
    body,
  });
}

export function uploadPersonaVoice(personaId: string | number, form: FormData) {
  return apiUpload<PersonaVoice>(`/api/v1/interview/personas/${personaId}/voice/upload`, form);
}

export function resetPersonaVoice(personaId: string | number) {
  return api<undefined>(`/api/v1/interview/personas/${personaId}/voice`, { method: "DELETE" });
}

export function fetchVoiceClip(url: string) {
  return apiBlob(url);
}

// ---- Custom (cloned) voices ----

export interface CustomVoice {
  id: string | number;
  name: string;
  external_voice_id?: string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

export function listCustomVoices() {
  return api<CustomVoice[]>("/api/v1/interview/voices/custom");
}

export function createCustomVoice(form: FormData) {
  return apiUpload<CustomVoice>("/api/v1/interview/voices/custom", form);
}

export function deleteCustomVoice(id: string | number) {
  return api<undefined>(`/api/v1/interview/voices/custom/${id}`, { method: "DELETE" });
}

export function assignServerVoice(personaId: string | number, voiceId: string) {
  return api<PersonaVoice>(`/api/v1/interview/personas/${personaId}/voice`, {
    method: "PUT",
    body: { source: "server", voice_id: voiceId },
  });
}