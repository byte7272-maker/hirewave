# Assistant Capability Framework

**Goal:** stop hand-specifying the assistant's behavior feature by feature. The behaviors
below were each, originally, prose for one screen; they're instances of the **same generic
behaviors**. Describe a feature **once** in a declarative manifest and it inherits all of
them — no new per-feature logic.

The authoritative set is `BEHAVIORS` in `capabilities.py` (currently **38**, served under
`behaviors` in the manifest). The ten below are the foundational generics; the rest layer on
voice quality, spatial awareness, pacing, proactivity, the document mastery suite, and the
newer capabilities — see **"Behaviors added since"** at the end.

## The ten foundational behaviors (built once, applied everywhere)

| Behavior | What it does | Replaces the per-feature prose in |
|---|---|---|
| `guide_on_arrival` | Fires on **every** navigation (never silent/collapsed): announce the section, point at the focal point, offer a relevant action. **Adaptive** — skip the static greeting for a frequent/active user and go straight to announce + offer; never repeat the same greeting. | P199, P200, P216 |
| `recognize_verb_object` | A verb (connect/add/remove/change/show/walk/tailor/research/search/save) + an object → one action. | P181, P184, P195, P199 |
| `pending_offer` | Every yes/no question arms a concrete follow-up; "yes" runs it; nothing pending never defaults to a random screen. **While a question is pending, surface the hold-to-talk mic; releasing it submits the answer and auto-runs on a valid/affirmed answer; once answered, clear the offer and release the mic (no re-fire).** | P198, P226 |
| `confirm_destructive` | Any action whose verb is remove/change confirms before running. | P180 |
| `highlight_and_dock` | Point at the element being discussed; keep it visible; reposition as it moves. **Hold** the position + highlight until the user acts or a timeout expires (never snap back and cover the target); interruptible immediately by a drag or selecting elsewhere. | P179, P181, P197, P215 |
| `speak_on_update` | Narrate whenever the overlay text changes — every screen, refresh, doc-switch. **Speak every walkthrough step's `say` as it highlights/advances (and on Next); never highlight a step silently.** Guide every task start to finish. | P193, P200, P221 |
| `surface_choices` | Whenever it offers options/choices, render them **in view and reachable now** (auto-scroll to them, keep them pinned); never announce choices that aren't actually rendered. Show an **unobtrusive cue** (a pulsing arrow) whenever usable content sits below the fold. | P208, P211 |
| `narrate_values` | Read a section's live **`readouts`** (the values it displays) and, while narrating, **speak each value and highlight its element** — the assistant is aware of what's on screen, not reciting a static script. | P214 |
| `error_aware` | Detect a visible **error / empty / failed-load** state on the page (a "couldn't render", a failed request, a "try again" banner) and **surface it + offer a fix/retry** — never narrate the content as if everything rendered fine. | P218 |
| `one_source_of_truth` | "The current X" always resolves the same way (active version, top match) — never a sample or a stale copy. | P193, P197, P200 |

## The manifest is the single source

`src/jobsearch/engines/assistant/capabilities.py` holds `CAPABILITIES` — one entry per
feature. Served by `GET /api/v1/assistant/capabilities` (whole manifest, or `?section=`).

Each entry:

```
purpose     one line spoken on arrival (guide_on_arrival)
current     what "this/current X" resolves to here (one_source_of_truth)
walkthrough a playbook key to offer on arrival, or null
actions[]   { label, verb, objects[], intent, slots, destructive, confirm }
controls[]  { label, does }     the buttons to highlight + explain
steps[]     { say, highlight, wait? }   ordered narrate+highlight walkthrough (P213)
readouts[]  { key, label, source, highlight }  live values to speak + highlight (narrate_values, P214)
offers[]    next-step prompts to arm as pending offers
```

`source` is a dot-path into the section's primary API response (the dashboard for
`dashboard`/`matches`, the current résumé for `documents`, the connected-sources list for
`connect`); `highlight` names the on-screen tile/element to ring while the value is spoken.

- **Aliases** (nav/recognition synonyms) come straight from the NLU's `_SECTIONS`, so
  recognition and guidance share one vocabulary and can't drift.
- **`destructive`** is derived from the verb (`remove`/`change`), not hand-flagged — so
  `confirm_destructive` is automatic.
- **Verbs** and their synonyms live in `VERBS` — one vocabulary, not a regex per feature.

## Adding a feature = one manifest entry

To give the assistant full behavior on a new feature, add a `CAPABILITIES["<section>"]`
entry (purpose, current, actions, controls, offers). The generic engines then:
speak-on-arrival, recognize its verbs/objects, offer and run its walkthrough, highlight its
controls, arm its offers as pending yes/no, and confirm its destructive actions — with **no
new prompt and no new frontend code per feature**.

New recognition phrasings extend `VERBS` (shared) or the NLU's section aliases — again, one
place, applied to every feature.

## The manifest carries more than sections

`GET /assistant/capabilities` returns, besides `behaviors` and the per-section `sections`:
`surface` (where the assistant lives/renders — the right pane is home), `session_scan`
(the once-per-session proactive brief endpoint), **`observe`** (action awareness — see below),
`verbs`/`destructive_verbs`/`playbooks`, `flows`/`flow_faq` (scripted interim narration +
answers to anticipated mid-flow questions), and `catalog` (every phrasing the NLU understands).

## Related assistant endpoints

- `POST /assistant/interpret` — classify an utterance → intent (see `ASSISTANT_INTENT.md`).
- `POST /assistant/observe {action,label,context}` → `{action,reply,offer?}` — **action
  awareness** (`observe_user_actions`): when the user clicks a page control themselves
  (Design, Refresh matches, New search, Export, …) the client reports it and the assistant
  acknowledges it + offers the next step. Known actions get tailored lines; any other gets a
  graceful generic acknowledgement (never silent). The `observe` manifest block lists the
  tailored action ids + aliases.
- `POST /assistant/reasoning` — explain an action/plan and **bundle** the permissions it needs
  so the user grants once (`reason_and_bulk_consent`).
- `GET /assistant/session-scan?session_id=` — the proactive once-per-session brief
  (`proactive_session_scan`).
- `GET /assistant/suggestions?section=&job_id=` — verified example commands for the screen.
- `POST /resumes/{id}/strengthen {job_posting_id?,role?,goal?}` → `StrengthenPlan` — the
  **growth advisor** (`advise_growth`, intent `strengthen_resume`): what would make the résumé
  + skillset stronger (skills, certifications, education, experience, positioning), general or
  for a target. Distinct from `POST /resumes/{id}/review` (fixing the writing).

## Behaviors added since (beyond the foundational ten)

Grouped — all in `BEHAVIORS`:
- **Voice/UX quality:** `undo_over_confirm`, `autosize_to_content`, `speak_serialized`,
  `narrate_flow_steps`, `answer_anticipated`, `pace_control`, `confirm_task_boundary`,
  `badge_first`, `never_silent_errors`, `editable_transcript`, `narrate_options`.
- **Spatial / layout:** `point_to_focus`, `avoid_occlusion`, `dock_right_pane`,
  `results_in_right_pane`, `badge_only_floats`, `collapse_main_on_result`.
- **Reasoning / web / proactivity:** `reason_and_bulk_consent`, `offer_web_on_unrecognized`,
  `proactive_session_scan`.
- **Document mastery:** `compartmentalize_document`, `navigate_and_highlight`,
  `analyze_bullets`, `refresh_stale_metrics`, `understand_summary`, `keep_summary_fresh`,
  `review_whole_document`.
- **Newest:** `observe_user_actions` (P328 — aware of direct user actions), `advise_growth`
  (P330 — strengthen the résumé + skillset), `uninterrupted_voice_flow` + `no_stacked_prompts`
  (P331 — a spoken command runs without secondary permission prompts and prompts never stack).

### Confirmation policy (`surface.confirm_policy`, P331)

The single source for when a human must respond. A spoken/typed command runs end-to-end
**without** secondary permission/confirmation prompts. Human interaction is required ONLY for
(a) a **choice/option** the assistant offers, or (b) **moving/deleting the user's files**.
Everything else — navigate, read/read-along, focus, search, refresh, status, and **reversible
edits** (apply + Undo, `undo_over_confirm`) — just runs. Prompts never stack or overlap, and a
running command is never interrupted mid-flow. Accordingly `DESTRUCTIVE_VERBS = {"remove"}` only
(an edit/`change` is reversible, so it no longer auto-confirms); a genuinely irreversible action
still sets `destructive=True`/a `confirm` string explicitly.

## Division of labor

- **Backend** owns the manifest, the NLU (verb+object → intent, + the plain-language LLM
  backstop), and the guarded endpoints.
- **Frontend** owns one generic assistant runtime that reads the manifest and implements the
  behaviors once (see prompt **P201** and the P-prompt series in `READDY_PROMPTS.md`),
  instead of a bespoke flow per screen.
