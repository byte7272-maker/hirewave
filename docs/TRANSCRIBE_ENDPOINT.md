# Server speech-to-text — `POST /api/v1/narration/transcribe`

**Why.** Voice input today depends on the browser's `SpeechRecognition` API, which is
Chromium/Safari-only (no Firefox), cloud-dependent, and flaky on mobile — so it is **not
device/OS/browser-agnostic**. This endpoint **decouples capture from transcription**:
the client records audio with the universal `getUserMedia` + `MediaRecorder` (works
everywhere) and POSTs it here; the server transcribes and returns text. The text then
flows to `/assistant/interpret` exactly like a typed command. Result: voice input works
on **any** browser/device, with the browser `SpeechRecognition` kept only as a fallback.

**Status.** Implemented (2026-11-09). Provider-port pattern, mirroring TTS.

## Endpoint
`POST /api/v1/narration/transcribe` — auth required. **multipart/form-data**:
- `file` (required) — recorded audio: `webm` / `ogg` / `mp3` / `wav` / `m4a`. ≤ 25 MB.
- `language` (optional) — ISO hint, e.g. `en`.

Response `TranscribeOut`: `{ "text": "...", "provider": "openai" }`.

Codes: **200** text; **400** empty audio; **413** too large; **501** no STT source
configured (client falls back to browser `SpeechRecognition`); **502** provider error.
Audio is **transient** — read in memory, used to produce the transcript, never stored.

## Providers (`engines/interview/media.py`)
`build_transcribe_provider(settings)` → a `TranscribeProvider`:
- **`NullTranscribeProvider`** — default (`enabled=False`); endpoint returns 501.
- **`OpenAITranscribeProvider`** — real, `POST https://api.openai.com/v1/audio/transcriptions`,
  model `stt_model` (default `whisper-1`). Reuses the OpenAI **TTS key** when `stt_api_key`
  is blank.

`state.transcribe = build_transcribe_provider(settings)` (set in `AppState`).

## Config (`config.py`)
```
JOBSEARCH_STT_PROVIDER = none | mock | openai     # default none (off)
JOBSEARCH_STT_API_KEY  = ...                       # blank → reuse JOBSEARCH_TTS_API_KEY
JOBSEARCH_STT_MODEL    = whisper-1                  # or gpt-4o-transcribe
```
To turn it on in prod (already on `gpt-4o-mini-tts` for TTS): set `JOBSEARCH_STT_PROVIDER=openai`
(the existing OpenAI key is reused). `/narration/voices`-style capability can be inferred
client-side from a probe, or just try `/transcribe` and fall back on 501.

## Client contract (frontend / Readdy P143)
1. `getUserMedia({audio:true})` → `new MediaRecorder(stream)`; collect chunks to a Blob.
2. On release, `POST /narration/transcribe` with the Blob as `file`.
3. On **200** → `text` → `POST /assistant/interpret` (same path as typed/voice).
4. On **501** → fall back to the browser `SpeechRecognition` where available; else "type instead".
5. The P127/P140 live mic meter runs off the same `getUserMedia` stream regardless.

## Acceptance (backend)
- 501 when STT off (default); 200 `{text}` with a provider configured; 400 empty; 413 oversize;
  502 on provider failure (with the provider's `last_error`). Audio never persisted.
- `build_transcribe_provider` is off by default and selects OpenAI when `stt_provider=openai`
  + a key (reusing the TTS key). Covered by `tests/test_transcribe.py`.
