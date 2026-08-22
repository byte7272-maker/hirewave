# Interviewer voices — server TTS + voice cloning

The interviewer speaks with **browser voices by default** (free, no setup). To get
**uniform premium voices for every user** (independent of their device) and/or
**custom voices cloned from audio samples**, turn on a server provider. Everything
is env-gated and mock-first — nothing changes until you set the variables.

> ⚠️ Cost figures below are **approximate, as of early 2026** and change often.
> Confirm on the vendor pricing pages before committing. Character counts assume
> the interviewer speaks ~1,500 characters per 5-question interview (greeting +
> questions + short reactions).

---

## A. Turn on server TTS (premium built-in voices)

You already have an OpenAI key wired for the LLM — the cheapest path reuses it.

### Option 1 — OpenAI TTS (recommended default: cheap, no cloning)
Railway env vars on the **hirewave** service:

```
JOBSEARCH_TTS_PROVIDER = openai
JOBSEARCH_TTS_API_KEY  = <your OpenAI sk-... key>   # can be the same key as the LLM
JOBSEARCH_TTS_VOICE    = alloy        # or: echo, fable, onyx, nova, shimmer
JOBSEARCH_TTS_MODEL    = gpt-4o-mini-tts   # or tts-1 (cheapest) / tts-1-hd
```

### Option 2 — ElevenLabs (best realism + supports cloning)
```
JOBSEARCH_TTS_PROVIDER = elevenlabs
JOBSEARCH_TTS_API_KEY  = <your ElevenLabs key>
JOBSEARCH_TTS_VOICE    = 21m00Tcm4TlvDq8ikWAM   # a stock voice id (optional)
JOBSEARCH_TTS_MODEL    = eleven_turbo_v2_5      # optional
```

### Option 3 — your own gateway (`http`)
`JOBSEARCH_TTS_PROVIDER=http` + `JOBSEARCH_TTS_URL=https://…` — POSTs `{text, voice}`
and expects audio bytes back (front any vendor / self-host).

After setting these, `GET /api/v1/interview/media/capabilities` returns `tts: true`
and the client POSTs interviewer lines to `/api/v1/interview/tts` (returns
`audio/mpeg`). The **per-persona voice** the user picked flows through as the
`voice` on that call, so a cloned or chosen voice id is honored automatically.

### TTS cost estimate

| Provider / model            | ~ per interview | ~ per 1,000 interviews/mo | Cloning? |
|-----------------------------|-----------------|---------------------------|----------|
| OpenAI `tts-1`              | ~$0.02          | ~$22                      | No       |
| OpenAI `gpt-4o-mini-tts`    | ~$0.02–0.03     | ~$25                      | No       |
| OpenAI `tts-1-hd`          | ~$0.045         | ~$45                      | No       |
| ElevenLabs Turbo v2.5      | ~$0.15–0.20     | ~$150–200 (Pro+ plan)     | **Yes**  |

**Takeaway:** OpenAI TTS is ~10× cheaper and premium-sounding — use it as the
default. Switch to (or add) ElevenLabs only when you want **voice cloning** (§B).

---

## B. Turn on voice cloning (custom voices from audio samples)

Lets a user upload audio samples and produce a **custom neural voice** that then
speaks the *dynamic* interview questions (not just a fixed clip). Currently only
ElevenLabs is wired as a real cloning provider.

```
JOBSEARCH_VOICE_CLONE_PROVIDER = elevenlabs
# Optional — falls back to JOBSEARCH_TTS_API_KEY when blank:
JOBSEARCH_VOICE_CLONE_API_KEY  = <your ElevenLabs key>
```

For offline dev/testing without a vendor: `JOBSEARCH_VOICE_CLONE_PROVIDER = mock`
(returns fake voice ids so the whole create/list/delete flow works; no audio).

Once on, `capabilities.voice_clone` is `true` and these endpoints work:
- `POST /api/v1/interview/voices/custom` (multipart: `name`, `consent`, `files[]`)
  → creates the voice, returns `{external_voice_id, …}`.
- `GET /api/v1/interview/voices/custom` → the user's cloned voices.
- `DELETE /api/v1/interview/voices/custom/{id}` → removes it (and at the provider).
- Assign one to a persona: `PUT /api/v1/interview/personas/{id}/voice` with
  `{ "source": "server", "voice_id": <external_voice_id> }`.

### Cloning cost estimate (ElevenLabs)

| Plan        | ~ / mo | Custom voices (instant clone) | Notes                          |
|-------------|--------|-------------------------------|--------------------------------|
| Starter     | ~$5    | up to ~10                     | instant voice cloning included |
| Creator     | ~$22   | up to ~30                     | more monthly credits           |
| Pro         | ~$99   | up to ~160                    | for many users / high volume   |

Cloning itself doesn't cost per-clone beyond the plan's stored-voice cap;
**synthesis** with a cloned voice costs the same per-character as §A ElevenLabs.
OpenAI does **not** offer cloning (built-in voices only), so cloning requires an
ElevenLabs (or `http`-fronted) provider.

---

## Consent & ethics (enforced)

Cloning a real person's voice has legal/ethical weight. The create endpoint
**requires `consent: true`** — the user must affirm they own or have permission to
use the voice — and stores `consent_attested` on the record. The platform never
pulls audio from anywhere; it only sends the samples the user explicitly uploads.
Recommend surfacing a clear checkbox: *"I own this voice or have the person's
permission to clone it."* Do not enable cloning for voices of third parties
without consent.

---

## Format compatibility
- Server TTS returns `audio/mpeg` (mp3) — plays in any `<audio>` element.
- Uploaded samples/clips are validated to **mp3 / wav / ogg / webm / m4a / aac**.
- Browser TTS needs no file. No plugins anywhere.
