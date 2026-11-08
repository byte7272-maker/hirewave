# Assistant intent endpoint — backend spec

**Goal:** turn a free-form user utterance (spoken transcript or typed text) into a
**structured intent** the frontend assistant (P121) can act on, so natural phrasing
("skip to asking", "use that one", "take me to my matches") maps to the fixed command
set and the playbooks — with a deterministic fallback so it works without a premium LLM.

**Interpretation only — never executes.** This endpoint returns *what the user meant*.
The frontend still runs the already-guarded action endpoints (P114 confirm, P116 scopes)
to actually do anything. No side effects here.

## Endpoint
`POST /api/v1/assistant/interpret` — auth required (CurrentUser). Add to the existing
`assistant` router (`src/jobsearch/api/routers/assistant.py`). No new scope (reading
intent isn't an automation action).

### Request — `InterpretRequest`
```jsonc
{
  "transcript": "use that one",             // required, the raw utterance (<= 500 chars)
  "context": {                               // optional, lets it resolve "this/that/here"
    "page": "documents",                    // current section/route key
    "resume_id": "res_…",                   // when relevant
    "cover_letter_id": "cl_…",
    "job_id": "job_…",
    "focused_index": 2,                      // the item currently read/highlighted (0-based)
    "options": [                             // the choices currently on offer (for fuzzy match)
      { "id": "bul_0", "label": "Led a team of 8 engineers…" },
      { "id": "bul_1", "label": "Cut cloud spend 30%…" }
    ]
  }
}
```

### Response — `InterpretResponse`
```jsonc
{
  "intent": "use_bullet",        // canonical name from the taxonomy below
  "confidence": 0.92,            // 0–1
  "slots": {                     // only the keys relevant to the intent
    "option_id": "bul_1",        // resolved from context.options / focused_index
    "index": 1
  },
  "reply": "Adding \"Cut cloud spend 30%\" — want me to apply it?",  // optional, speakable
  "needs_disambiguation": [],    // [{id,label}] when it can't resolve a choice
  "utterance": "use that one"    // echo
}
```

## Intent taxonomy (enum)
Map to the P121 command set, the P115 playbooks, the app sections, and the bullet flow:

| intent | slots | meaning |
|---|---|---|
| `confirm` | — | yes / do it / go / apply / sounds good |
| `decline` | — | no / stop that / not now |
| `stop` / `pause` / `continue` / `next` / `back` / `repeat` / `skip` / `cancel` | — | flow control |
| `choose` | `index`, `option_id`, `label` | pick an offered option ("the second one", by name) |
| `navigate` | `section` ∈ `matches\|documents\|auto_apply\|design\|interview\|inbox\|connect\|community\|dashboard` | "go to / take me to …" |
| `start_playbook` | `playbook` ∈ `connect_source\|auto_apply\|walk_matches\|apply_job\|upload\|download\|design\|tailor\|practice\|bullets` | start a P115 playbook |
| `read_options` / `what_can_i_do` | — | read the action groups (P121 §2) |
| `read_bullets` | — | read the current bullet suggestions aloud |
| `suggest_bullets` | — | recommend which bullets to use |
| `use_bullet` | `option_id`, `index` | "use" / "use that one" → apply the focused/named bullet |
| `discard_bullet` | `option_id`, `index` | drop a suggestion |
| `change_voice` | `voice` (id or name, matched to `/narration/voices`) | "use the warm voice / switch to Coral" |
| `set_rate` | `rate` (0.5–2.0) or `direction` (`faster`/`slower`) | speed control |
| `ask` | `query` (verbatim) | free-form request to pass to the AI (e.g. "write a cover letter") |
| `unknown` | — | couldn't classify (triggers re-offer + buttons) |

## Resolution rules
- **"that / this / it / that one"** → resolve against `context.focused_index`, else the single
  `context.options` entry, else `needs_disambiguation` with the options.
- **Ordinals / numbers** ("the second", "number 3") → `index` → `option_id` via `context.options`.
- **Section synonyms** ("my jobs" → `matches`, "my files"/"résumé" → `documents`, "apply bot" →
  `auto_apply`, "look"/"style" → `design`).
- **Voice names** fuzzy-matched to the live `/narration/voices` list (id or display name).
- Trim/normalize; cap transcript length; strip filler ("um", "please", "can you").

## Implementation
1. **Deterministic matcher first (always available, no LLM):** normalize → match the fixed
   command words/synonyms and ordinals with regex/keyword tables; fuzzy-match (token overlap /
   difflib) against `context.options` labels and the `/narration/voices` names. This alone
   covers the whole command set, navigation, choose/use, voice — return high confidence.
2. **LLM backstop for free-form (optional):** if the deterministic pass is low-confidence and a
   premium provider is configured (`state.resume_assistant` / the premium client), ask it to
   classify into the taxonomy and return strict JSON (`intent`, `slots`, `confidence`); validate
   against the enum. If no provider or it fails → `intent:"ask"` with the verbatim query, or
   `unknown`. Never raise; always return a valid `InterpretResponse`.
3. **Pure + cheap:** no DB writes, no action calls, short timeout. Keep it stateless.

## Security / boundaries
- Interpretation only — it **never** connects accounts, submits, edits, or navigates server-side.
- The frontend maps the returned intent to the existing, already-guarded endpoints and still runs
  the P114 confirm (click or voice) and P116 scope checks before any side-effect.
- `ask`/`query` is passed through verbatim; the frontend decides whether it's an edit request
  (→ `/ai-edit` etc.) or guidance, and confirms as usual.

## Acceptance (backend)
- `POST /assistant/interpret` returns a valid `InterpretResponse` for: the fixed command words
  (stop/continue/next/back/repeat/cancel), yes/no → confirm/decline, ordinals and names →
  choose/use with a resolved `option_id`, "go to <section>" → navigate, playbook phrases →
  start_playbook, voice/rate phrases → change_voice/set_rate, and free-form → ask.
- "use that one" with a `context.focused_index`/single option resolves to that `option_id`;
  ambiguous input returns `needs_disambiguation`.
- Works with **no premium provider** (deterministic path) and degrades to `ask`/`unknown`
  gracefully; never 500s on odd input; nothing is executed. Tests cover each intent + resolution.
