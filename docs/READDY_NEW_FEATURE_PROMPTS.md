# Readdy build prompts — new features (Aug 2026)

Paste each numbered block into Readdy as a build request. All calls use the same
API base URL and bearer token (`Authorization: Bearer <access_token>`) the rest
of the app already uses. On any `401`, refresh via `POST /api/v1/auth/refresh`
and retry. Both features are already live on the backend.

---

## Feature 1 — "My Work Highlights" section

> Add a new authenticated section called **My Work Highlights** (add it to the
> sidebar under Documents, and link to it from the Profile page). It's a place for
> users to bring in richer narrative work material than a résumé's bullets —
> **accomplishment highlights, STAR-style stories, project write-ups, analyses,
> and notable interactions**.
>
> **Framing to show at the top of the page (important):** "Bring in your best work
> — written by you, or summarized by an AI assistant in your own work environment
> (like Microsoft 365 Copilot, Glean, or a Teams/email assistant) that can see the
> projects, results, and conversations you might have forgotten. Paste or upload
> what it produced. **We never connect to your work email, chat, or accounts** —
> you bring the finished summary here." **Do NOT add any "connect your work tools /
> work email / Teams" button anywhere in this section** — the app never touches
> those; it only accepts content the user provides.
>
> **List** — on load, `GET /api/v1/experience` (with auth) returns the user's
> highlights, newest first. Render each as a card showing `title` (or a
> capitalized `kind` if no title), a `kind` badge, `company` · `period` if
> present, the `skills[]` as chips, and the `content` (truncate long text with a
> "show more"). If `source` is `ai_generated`, show a small provenance chip with a
> ✨ icon reading the `source_tool` (e.g. "✨ Microsoft 365 Copilot"). Empty state:
> a friendly prompt to add the first highlight.
>
> **Add (paste)** — an "Add highlight" form / modal calling
> **`POST /api/v1/experience`** with JSON:
> `{ "content": <required, the text>, "title": <optional>, "kind": <one of
> highlight|story|project|analysis|interaction|achievement>, "source": <one of
> self_written|ai_generated>, "source_tool": <optional text, e.g. "Microsoft 365
> Copilot">, "skills": <optional string[]>, "company": <optional>, "period":
> <optional, e.g. "2023 Q3"> }`. The form should have: a large **paste box**
> labeled "Paste your highlight, story, or what your work AI assistant wrote", a
> **source toggle** (I wrote this / AI-generated), and — shown only when
> AI-generated is chosen — a **"Which tool?"** text field that fills `source_tool`.
> `content` must be at least 10 characters (the API returns `400` otherwise —
> surface the message). On success (`201`) prepend the returned item to the list.
>
> **Add (upload)** — an "Upload file" option calling
> **`POST /api/v1/experience/upload`** as **multipart/form-data** with a `file`
> field (PDF/DOCX/MD/TXT — e.g. an export the user's work AI agent produced) plus
> optional form fields `title, kind, source` (default `imported`), `source_tool`,
> `company`, `period`. The backend extracts the text. On `400` ("could not extract
> readable text"), show that message.
>
> **Edit / delete** — each card has Edit and Delete. Edit calls
> **`PUT /api/v1/experience/{id}`** with only the changed fields (any of `title,
> content, kind, source, source_tool, skills, company, period`). Delete calls
> **`DELETE /api/v1/experience/{id}`** (returns `204`) and removes the card.
>
> **Payoff copy:** somewhere on the page, note that these highlights automatically
> improve the user's **Interview Prep** — suggested answers will draw on this real
> work. (No wiring needed for that; the backend does it.)

---

## Feature 2 — Vocabulary coaching in the interview room

> In the **mock interview room**, add **live vocabulary coaching** on the
> candidate's spoken/typed answers. After the candidate records or types an answer
> (and whenever live speech-to-text is running, on a ~1.5s debounce as they speak),
> call **`POST /api/v1/interview/vocabulary`** with `{ "text": <the current
> transcript> }` and the auth header. It's fast and deterministic — safe to call
> repeatedly. The response:
>
> - `score` (0–100 vocabulary strength) — show as a live meter/dial.
> - `summary` — a one-line coaching takeaway; show it under the meter.
> - `filler_count`, `filler_ratio`, `word_count`, `unique_words`,
>   `vocabulary_richness` (0–1) — show `filler_count` as a secondary badge.
> - `suggestions[]` — each `{ original, kind, count, suggestions[], note }` where
>   `kind` ∈ `filler | weak | overused`. Render these as a list of **word chips**:
>   - `filler` → red/amber chip "cut «original»" with the `note`.
>   - `weak` → chip showing `original → suggestion1 / suggestion2 / …`; **tapping a
>     replacement swaps that word into the transcript text box**.
>   - `overused` → chip "«original» used {count}× — vary it".
>   Group or sort by `kind`, most frequent (`count`) first.
>
> **"Polish my answer" button** — a one-tap action that calls the same endpoint
> with `{ "text": <transcript>, "rewrite": true }`. When the backend has an LLM
> configured, the response includes a **`polished`** field (a full stronger rewrite
> of the answer) — show it in a panel with a "use this" option. If `polished` comes
> back empty, just keep the inline suggestions (don't error). Do **not** send
> `rewrite: true` on the live/debounced calls — only on the explicit button.
>
> Keep it lightweight and non-blocking: the interview flow continues regardless;
> vocabulary coaching is an assistive side panel, not a gate.

---

## Feature 3 — Live speech-to-text recording in the interview room

> In the **mock interview room**, let the candidate **answer out loud** and have
> their speech transcribed live into the **same answer text box** that typing uses
> — so one transcript feeds both the answer they submit and the vocabulary coach
> (Feature 2), updating in real time as they speak.
>
> Use the browser **Web Speech API** (no backend, no API key). Feature-detect it:
> `const SR = window.SpeechRecognition || window.webkitSpeechRecognition;` — if it
> is missing (e.g. Firefox, some browsers), **hide the mic button and fall back to
> typing** (everything else still works). Add a **"🎤 Record" toggle** next to the
> answer box.
>
> **Recognition setup** (create once, when recording starts):
> - `recognition.continuous = true;` `recognition.interimResults = true;`
>   `recognition.lang = 'en-US';`
> - Keep a `finalTranscript` string. In `onresult`, iterate `event.results` from
>   `event.resultIndex`: append `result[0].transcript` to `finalTranscript` when
>   `result.isFinal`, otherwise collect it as **interim** text.
> - Set the answer box value to `finalTranscript + interim` so the user sees words
>   appear as they speak (render the interim part in a lighter/italic style if you
>   can; at minimum it must land in the same field). **Typing and speaking must
>   coexist** — if the user edits the text by hand, keep their edit as the new
>   `finalTranscript` base.
> - `onerror`: on `not-allowed`/`service-not-allowed` show "Allow microphone access
>   to record"; on `no-speech` just keep listening. `onend`: if the user is still
>   in "recording" mode, **restart** recognition (Chrome stops it periodically even
>   with `continuous`), otherwise stop cleanly.
>
> **Feed the coach live:** on every transcript change while recording, **debounce
> ~1.5s** and call `POST /api/v1/interview/vocabulary` with `{ "text":
> <finalTranscript + interim> }` (the same call as Feature 2) and update the score
> meter / filler badge / suggestion chips in place. Do not send `rewrite:true` on
> these live calls.
>
> **UI:** while recording show a pulsing red "● Recording" indicator, a live word
> count, and the filler count from the coach. A **Stop** button ends recognition
> and keeps the text. The existing **Send** button submits the final transcript as
> the answer to `POST /api/v1/interview/mock/{sessionId}/reply` with `{ "answer":
> <finalTranscript>, "response_seconds": <seconds from question shown to send> }`,
> then clears the box and stops recording for the next question.
>
> **Privacy note to show once:** "Speech recognition runs in your browser; in some
> browsers (Chrome) audio is processed by the browser's speech service to
> transcribe it. Nothing is stored — only the text you choose to submit." Ask for
> mic permission only when the user taps Record.

---

## Enhancement 4 — Show pacing (`response_seconds`) in the transcript history

> In the **interview transcript history**, show how long each answer took, so the
> candidate can see their pacing. There are **two different pacing numbers** on the
> session object (returned by `POST /api/v1/interview/mock/{id}/reply` and
> `GET /api/v1/interview/mock/{id}`) — use the right one in each place:
>
> **Per-answer (available throughout the interview):** each entry in `turns[]`
> where `speaker === "candidate"` carries a **`turn.response_seconds`** number
> (may be `null` if not captured).
> - Under each candidate answer bubble, render a small muted label like
>   **"⏱ 42s"** (round it; format ≥60s as "1m 12s"). **Hide the label when
>   `response_seconds` is null** — don't render "⏱ null" or "⏱ 0s".
> - Optional: color it green in a good range (~30–90s), amber when very short
>   (<15s) or long (>150s), tooltip "Aim for ~1–2 minutes."
>
> **Average (only at the end):** the interview-summary object exposes
> **`session.summary.avg_response_seconds`**. ⚠️ **`session.summary` is `null` for
> the entire active interview** — it is populated **only** once `session.status`
> becomes `"completed"`. So:
> - **Guard it:** never read `session.summary.avg_response_seconds` unless
>   `session.status === "completed"` **and** `session.summary` is non-null (use
>   optional chaining: `session.summary?.avg_response_seconds`). Reading it
>   mid-interview will otherwise crash on a null.
> - Only in the end-of-interview summary panel, and only when that value is
>   present, show **"Average answer time: 47s"**. If it's null, omit the line.
>
> ⚠️ **Do not confuse this with the vocabulary coach's `summary`**, which is a
> plain **string** (a one-line coaching takeaway) with no timing — that's a
> different response from `POST /api/v1/interview/vocabulary`, unrelated to the
> session's `summary` object here.
>
> You're already sending `response_seconds` on Send (seconds from question-shown to
> submit); this just surfaces what comes back.

---

## Enhancement 5 — "Listening…" hint on the mic button while capturing

> On the **🎤 Record** button (Feature 3), show a subtle **"Listening…"** state
> while the browser is actively capturing audio, so the user knows it's live.
> Drive it off the SpeechRecognition events, not just the toggle:
> - Set a `listening` flag `true` on `recognition.onaudiostart` (or `onspeechstart`)
>   and back to `false` on `onspeechend` / `onend`.
> - While `listening`, change the button label to **"Listening…"** with a gentle
>   pulsing mic icon / animated dots, and keep the red "● Recording" indicator.
>   When recording is on but no speech is currently detected, show "Listening…"
>   still (audio is captured) — only drop the hint when recognition fully stops.
> - Keep it subtle (opacity/scale pulse), not a loud spinner. Respect
>   `prefers-reduced-motion` (no animation, just the text).

---

## Enhancement 6 — "Use this" flow for the coach's polished rewrite

> Add a **Polish my answer** action in the interview room's vocabulary panel that
> calls `POST /api/v1/interview/vocabulary` with `{ "text": <current transcript>,
> "rewrite": true }`. When the response's **`polished`** field is non-empty, show
> it in a card titled "Polished version" with a **"Use this"** button.
>
> **On "Use this":**
> 1. **Stop recording cleanly first** — if a SpeechRecognition is active, set the
>    recording flag to `false` and call `recognition.stop()` (and clear any pending
>    debounced vocabulary call) so live transcription doesn't overwrite the text
>    you're about to set.
> 2. Replace the answer box content (and your `finalTranscript` base) with
>    `polished`, so the user can still tweak it before sending.
> 3. Re-run the coach once on the new text (`{ "text": polished }`, no rewrite) to
>    refresh the score/chips, and dismiss the "Polished version" card.
>
> If `polished` comes back empty (no LLM configured on the backend), disable/hide
> the button and keep the inline suggestions — never error. Only send
> `rewrite:true` on this explicit action, never on the live/debounced calls.

---

## Feature 7 — Interviewer voices (browser TTS) + per-persona voice picker & upload

> Make the **AI interviewer speak its questions out loud**, and let the user
> **choose or upload a different voice for each persona**. Voices play in the
> browser (free, realistic on Chrome/Edge); the backend persists each persona's
> voice choice so it sticks across sessions and devices.
>
> **Speak questions (browser TTS):** when the interviewer asks a question (the
> latest `turns[]` item with `speaker === "interviewer"`, greeting, or follow-up),
> speak it with the Web Speech API: build a `SpeechSynthesisUtterance(text)`, set
> the chosen voice + `rate`/`pitch`/`lang` (see below), and `speechSynthesis.speak(...)`.
> Feature-detect `window.speechSynthesis`; if absent, just show text (no error).
> Add a **🔊 voice on/off** toggle and stop speech (`speechSynthesis.cancel()`)
> when the user starts recording an answer or leaves the room.
>
> **Load available browser voices:** call `speechSynthesis.getVoices()` (it
> populates asynchronously — also listen for the `voiceschanged` event). Prefer
> voices whose name contains "Natural", "Neural", "Online", or "Google" for
> realism.
>
> **Per-persona voice, saved on the backend:**
> - `GET /api/v1/interview/voices` → the user's saved voice choices (array of
>   `{persona_id, source, voice_uri, lang, rate, pitch, voice_id, audio_url,
>   content_type}`). Overlay these onto the persona gallery on load.
> - `GET /api/v1/interview/personas/{personaId}/voice` → the **effective** voice
>   for one persona (the saved choice, or a sensible default derived from the
>   persona's gender/tone). Use `source` to decide how to speak:
>   - `"browser"` → speak with `speechSynthesis` using `voice_uri` (match it to a
>     `getVoices()` entry by `voiceURI`/name), `rate`, `pitch`, `lang`.
>   - `"server"` → a neural `voice_id` is set; if `GET /media/capabilities` returns
>     `tts: true`, POST the line to `/api/v1/interview/tts` and play the returned
>     audio; otherwise fall back to a browser voice.
>   - `"uploaded"` → the user attached a custom clip; play it from `audio_url`
>     (see upload below). Since an uploaded clip can't synthesize arbitrary
>     question text, use it as the persona's **intro/greeting**, and speak the
>     actual questions with a browser voice.
> - **Voice picker UI** on each persona card / a "Voice" settings panel: a dropdown
>   of the available browser voices + **rate** and **pitch** sliders + a **"Preview"**
>   button (speak a sample line: "Hi, I'm {persona.name}. Let's begin your
>   interview."). On change, **`PUT /api/v1/interview/personas/{personaId}/voice`**
>   with `{ source: "browser", voice_uri, lang, rate, pitch }`. (Rate is clamped
>   server-side to 0.5–2.0, pitch to 0–2.)
>
> **Upload a custom voice clip:** an "Upload voice" control per persona →
> **`POST /api/v1/interview/personas/{personaId}/voice/upload`** as
> **multipart/form-data** with a `file` field. **Only web-playable audio is
> accepted: mp3, wav, ogg, webm, m4a, aac** (the API returns `415` otherwise —
> show "Use an mp3, wav, m4a, ogg, or webm file"). On success the persona's
> `source` becomes `"uploaded"` and `audio_url` points at
> `/api/v1/interview/personas/{personaId}/voice/audio`. Play it with an `<audio>`
> element (fetch it **with the auth header** — it's owner-scoped — and use a blob
> URL, since `<audio src>` can't send a bearer token).
>
> **Reset:** a "Use default voice" button → **`DELETE /api/v1/interview/personas/{personaId}/voice`**
> (returns `204`) and reverts to the derived default.
>
> **Format note:** everything the app plays is a standard browser-supported format —
> browser TTS needs no file; uploaded clips are validated to mp3/wav/ogg/webm/m4a/aac;
> server neural audio comes back as `audio/mpeg`. All play in a plain `<audio>`/
> `SpeechSynthesis`, no plugins.

---

## Feature 8 — Custom voices from audio samples (voice cloning)

> Add a **"Custom voices"** area (in the interview voice settings) where users can
> **create a neural voice from their own audio samples** and assign it to any
> persona, so the interviewer speaks in that voice. This is **gated on the backend
> being configured** — first check `GET /api/v1/interview/media/capabilities`: if
> **`voice_clone` is `false`**, hide/disable this whole area with a note "Custom
> voices aren't enabled yet." Only show it when `voice_clone` is `true`.
>
> **Create a voice:** a form with a **name**, a **file picker for one or more audio
> samples** (mp3/wav/ogg/webm/m4a/aac — reject others client-side too), and a
> **required consent checkbox**: *"I own this voice or have the person's permission
> to clone it."* On submit, call **`POST /api/v1/interview/voices/custom`** as
> **multipart/form-data** with fields `name`, `consent` (`"true"`), and one or more
> `files`. Handle responses: `201` → success (show the new voice); `400` with a
> consent message → the box wasn't checked; `415` → "Use mp3, wav, ogg, webm, m4a,
> or aac"; `501` → cloning isn't configured (shouldn't happen if you gated on
> capabilities). The returned object has `{ id, name, provider, external_voice_id,
> status, sample_count }`.
>
> **List / manage:** `GET /api/v1/interview/voices/custom` lists the user's voices;
> show each with its name and a **Delete** button → `DELETE /api/v1/interview/voices/custom/{id}`
> (`204`).
>
> **Assign to a persona:** in the per-persona voice picker (Feature 7), add the
> user's custom voices as options alongside the browser voices. Selecting one calls
> **`PUT /api/v1/interview/personas/{personaId}/voice`** with
> `{ "source": "server", "voice_id": <that voice's external_voice_id> }`. From then
> on, when speaking that persona's lines, since `source` is `"server"`, POST the
> text to `/api/v1/interview/tts` and play the returned `audio/mpeg` (this is where
> the cloned voice actually reads the questions). If `capabilities.tts` is somehow
> false, fall back to a browser voice.
>
> **Guidance copy:** tell users good samples are ~1–3 minutes of clear, single-
> speaker audio. Reassure them nothing is fetched from their accounts — only the
> files they upload are sent, and only to produce the voice.

---

## Notes
- Feature 8 (voice cloning) and server TTS require a configured provider —
  ElevenLabs for cloning, OpenAI or ElevenLabs for premium TTS. See
  `docs/VOICE_PROVIDERS.md` for the Railway env vars + cost estimates. Until then,
  `capabilities.voice_clone`/`tts` are `false` and the app uses browser voices.
- Feature 7's voice **choices/uploads are persisted by the backend** (endpoints
  above); the actual speaking happens in the browser. Server neural TTS
  (`/media/capabilities.tts`) is currently **off** — the app speaks with browser
  voices until a neural provider is configured.
- Feature 3 and Enhancements 4–6 are **frontend-only** — they reuse the existing
  vocabulary (Feature 2) and mock-interview endpoints; there is nothing new to
  call on the backend.
- Both endpoints require auth and 401→refresh→retry like everything else.
- Feature 1 also surfaces automatically in `POST /api/v1/interview/prep`
  (`based_on_document` becomes `true` once a user has any highlight or résumé) —
  no frontend change needed for that.
- Neither feature stores anything sensitive beyond what the user chooses to paste;
  there is no connection to any external work account.
