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
  "transcript": "use that one",             // required, the raw utterance (kept short in practice)
  "context": {                               // optional, lets it resolve "this/that/here"
    "page": "documents",                    // current section/route key
    "section": "documents",                 // current section (drives section-aware intents)
    "resume_id": "res_…",                   // when relevant
    "cover_letter_id": "cl_…",
    "job_id": "job_…",
    "focused_index": 2,                      // the item currently read/highlighted (0-based)
    "options": [                             // the choices currently on offer (for fuzzy match)
      { "id": "bul_0", "label": "Led a team of 8 engineers…" },
      { "id": "bul_1", "label": "Cut cloud spend 30%…" }
    ],
    "pending": { "intent": "web_search", "slots": {"query": "…"} },  // the armed yes/no offer
    "debug": false                           // true → return the decision trail (below)
  }
}
```
`context.pending` lets a spoken **"yes"** resolve server-side to the armed offer's action
(and "no" → `decline`), so the client doesn't map it. See **Offers** below.

### Response — `InterpretResponse`
```jsonc
{
  "intent": "use_bullet",        // canonical name from the taxonomy below
  "confidence": 0.92,            // 0–1 (>= 0.6 = understood; below = ask/unknown)
  "slots": {                     // only the keys relevant to the intent
    "option_id": "bul_1",        // resolved from context.options / focused_index
    "index": 1
  },
  "reply": "Adding \"Cut cloud spend 30%\" — want me to apply it?",  // speakable lead-in
  "needs_disambiguation": [],    // [{id,label}] when it can't resolve a choice
  "utterance": "use that one",   // echo
  "suggestions": [],             // on a miss: nearest wordings it WOULD understand ("did you mean…")
  "offer": {},                   // a yes/no next-step to arm as `pending` (see Offers)
  "debug": {}                    // present only when context.debug=true (see Debug)
}
```

### Offers (`offer`)
When a result carries an `offer`, it's a yes/no next step:
`{ "prompt": "…", "on_yes": {"intent": "navigate", "slots": {…}}, "yes": "…", "no": "…" }`.
The client shows it and arms `on_yes` as the next request's `context.pending`, so a spoken
"yes" resolves to that action. Two cases set it automatically: a **coherent-but-unrecognized**
utterance (not gibberish) offers a **web search** (`offer_web_on_unrecognized`); and some
intents ship their own offer (e.g. `more_matches` offers to open the sources page).

### Debug (`debug`) — observe comprehension
With `context.debug=true` the response includes the decision trail — invaluable for tuning
and for diagnosing a dead backstop:
`{ deterministic:{intent,confidence}, llm_available, source: "deterministic"|"llm"|"fallback_ask",
   llm_intent, llm_raw, llm_error, final:{intent,confidence,slots} }`.
`llm_error` surfaces an LLM failure (e.g. a 401 from a bad `ANTHROPIC_API_KEY`) that would
otherwise silently drop every miss to the 0.5 `ask` fallback.

## Intent taxonomy (enum)
The full set lives in `INTENTS` in `intent.py` (currently 43). Grouped:

**Flow control & choices**
| intent | slots | meaning |
|---|---|---|
| `confirm` / `decline` | — | yes/do it · no/not now (resolve a `pending` offer server-side) |
| `stop` `pause` `continue` `next` `back` `repeat` `skip` `cancel` | — | flow control |
| `choose` | `index`, `option_id`, `label` | pick an offered option ("the second one", by name) |
| `use_bullet` / `discard_bullet` | `option_id`, `index` | apply / drop the focused or named bullet. `use_bullet` needs a REFERENT ("use that", "use the second", "use this bullet"), not a bare "use" |
| `undo` | — | undo the last applied change (the app is apply+Undo) — "undo", "undo that", "revert", "take that back" |

**Navigation & playbooks**
| intent | slots | meaning |
|---|---|---|
| `navigate` | `section` ∈ `matches\|documents\|applications\|auto_apply\|design\|interview\|inbox\|connect\|community\|dashboard`; `doc` ∈ `resume\|cover_letter`; `refresh=true` | "go to / take me to …"; a refresh verb + section refreshes (not the `walk_matches` tour) |
| `start_playbook` | `playbook` ∈ `connect_source\|auto_apply\|walk_matches\|apply_job\|upload\|download\|design\|tailor\|practice\|bullets` | start a playbook. "rate/score/rank/grade my matches" → `walk_matches` (the scored brief), NOT `set_rate` |

**Documents (résumé / cover letter)**
| intent | slots | meaning |
|---|---|---|
| `focus_document` | `section`, `mode` (`section`\|`text`), `target`, `highlight` | jump to + spotlight a section or keyword |
| `read_bullets` / `suggest_bullets` | — | read the bullets/lines aloud · recommend which to use |
| `edit_document` | `instruction`, `needs_web` | reword/rewrite/fix the résumé or a line |
| `review_summary` / `review_document` | `doc` | review the summary · walk the WHOLE résumé (incl. "what should I fix / needs work") |
| `refresh_metric` | — | check/refresh a bullet's dated figures from the web |
| `strengthen_resume` | `role`, `goal` | **advise what would make the résumé + skillset stronger** — skills, certifications, education, experience, positioning — general or for a role/goal (→ `POST /resumes/{id}/strengthen`). Forward-looking growth, distinct from `review_document` |
| `sync_documents` | — | reconcile/sync the documents |

**Jobs, research & the web**
| intent | slots | meaning |
|---|---|---|
| `search_jobs` | `query`, `location` | find postings by title/keyword/location (strips transport verbs; extracts a trailing location) |
| `research_company` | `company` ("" = from context) | look into / vet a company or whether a posting is legit |
| `web_search` | `query` | general open-web lookup the app doesn't hold |
| `save` / `archive` | — | save/bookmark · archive/hide the focused item |
| `more_matches` | — | **guidance on getting more matches** — broaden the search AND connect more sources (mailboxes + external job sites, incl. creating accounts); carries an offer to open the Connect page |

**Assistant meta, status & voice**
| intent | slots | meaning |
|---|---|---|
| `read_options` / `what_can_i_do` | — | read the action groups / what it can do (bare "help", not "help me <x>") |
| `status_report` / `whats_new` / `report_state` | `field` | status summary · what changed since last time · a factual state question |
| `resume_task` | — | pick up an in-progress task ("where I left off") — NOT the résumé document |
| `check_mic` / `check_audio` | — | mic / audio troubleshooting |
| `change_voice` | `voice` (matched to `/narration/voices`) | "use the warm voice / switch to Coral" |
| `set_rate` | `rate` (0.5–2.0) or `direction` (`faster`/`slower`) | SPEAKING speed (not editing). Scoped to speech phrasings ("talk/speak/read faster", "slow down") — a bare "faster" in another context does NOT change the rate |
| `answer_question` | `query` (verbatim) | a conversational QUESTION about the user's own data / context ("why is this a good match", "what should I do next", "should I apply to this", "how many interviews do I have", "how do I use the app") — the assistant ANSWERS it from on-screen data (match reasons, dashboard state, `POST /assistant/ask`); it does NOT run a command. Checked before the playbook matcher so "should I apply" is answered, not auto-applied. Frontend-first, see READDY P343 |
| `connect_expert` | — | reach a human expert (recruiter / hiring manager / HR pro) — a FUTURE "coming soon" feature; ships its own reply, the client must NOT navigate |
| `ask` | `query` (verbatim) | a real free-form request the app can't do → offered as a web search |
| `unknown` | — | couldn't classify (triggers re-offer + buttons) |

## Suggestions — wording the assistant can understand
Two helpers teach/recover phrasing, both drawn from the **same** NLU so a suggestion is always a
command that parses:
- **`GET /api/v1/assistant/suggestions?section=<screen>&job_id=<id>&limit=`** → `SuggestionsOut
  { suggestions: [{text,intent,slots}] }` — screen-specific examples first, then global. Chips the
  UI shows as "Try saying…"; tapping one runs its `text` through `/interpret`.
- **`InterpretResponse.suggestions`** → populated only on a miss (`unknown`/`ask`): the nearest
  wordings the NLU *would* understand, for a "Did you mean…" recovery. Empty on a confident match.
Every suggestion is verified via the deterministic matcher before it's returned (dead examples are
dropped), so the assistant never suggests wording it can't act on.

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
   difflib) against `context.options` labels and the `/narration/voices` names. This covers the
   whole command set, navigation, choose/use, voice, and the curated phrasings for each intent —
   returns high confidence. It can only recognize phrasings someone anticipated.
2. **LLM backstop = the PLAIN-LANGUAGE comprehension layer** (`_llm_classify`). When the
   deterministic pass is below `threshold` (0.6) and the premium LLM is available, it classifies
   casual/indirect/novel wording. It is a real classifier, not a bare "pick from this list":
   per-intent descriptions, worked **few-shot examples**, the current page context, and **slot
   extraction** (section/query/location/role/goal/…). Parsing is tolerant — it coerces a messy
   intent id (case/spacing/hyphens/near-miss), recovers an intent from non-JSON, and validates
   referential slots against the real vocab. A successful understanding is clamped above threshold
   so it's acted on (not re-offered as a web search). It **abstains** (`ask`) on general
   knowledge / trivia / off-app input so those become a web-search offer instead of a forced
   action. Never raises.
3. **Still weak → `ask`** with the verbatim query (a coherent 2+-word utterance), which triggers
   the web-search offer; truly empty/garbled → `unknown`. Always returns a valid response.
4. **Pure + cheap:** no DB writes, no action calls. Keep it stateless.

### Operational notes (don't get burned)
- **One bad key disables all comprehension.** The backstop uses the PREMIUM LLM
  (`resume_assistant.premium` → `_premium or self.llm`; `_backstop_llm` in the router). It's the
  *same* Anthropic credential as the premium generative features. An invalid `ANTHROPIC_API_KEY`
  returns **401** and silently drops every miss to the 0.5 `ask` fallback (symptom: plain
  language uniformly "couldn't make sense of it"; résumé AI feels dumb). Diagnose with
  `context.debug=true` → `debug.llm_error`. OpenAI (embeddings/matching) and Anthropic (premium
  gen + comprehension) are **separate** keys — renewing one does nothing for the other.
- **Adding an intent:** add it to `INTENTS`, give it a deterministic matcher (ordered so it beats
  overlapping intents), a one-line entry in the backstop's `_INTENT_HELP` + a few-shot or two, a
  `_reply_for` line, and (if it's a new client behavior) a frontend prompt. New phrasings for an
  existing intent: widen its matcher and/or add a few-shot — never only one place.

### Spoken form (narration)
Text the voice speaks is transformed first (`document_map.speakify` = `speak_geo` then
`speak_acronyms`, and `/narration/speak` applies `speak_geo`): state/country **codes** expand to
full names ("New York, NY" → "New York", "US" → "United States") and ALL-CAPS acronyms are spelled
("IT" → "I.T."). Geo runs before acronyms; it's conservative to protect prose/credentials
(a "City, ST" position expands any state; standalone codes only a safe set + uppercase countries).

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
  start_playbook, voice/rate phrases → change_voice/set_rate, conversational questions
  ("why is this a good match", "should I apply to this") → answer_question, and free-form → ask.
- "use that one" with a `context.focused_index`/single option resolves to that `option_id`;
  ambiguous input returns `needs_disambiguation`.
- Works with **no premium provider** (deterministic path) and degrades to `ask`/`unknown`
  gracefully; never 500s on odd input; nothing is executed. Tests cover each intent + resolution.
