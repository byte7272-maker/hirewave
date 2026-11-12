# Assistant Capability Framework

**Goal:** stop hand-specifying the assistant's behavior feature by feature. P179–P200 each
described, in prose, how the assistant should act on one screen. They are all instances of
the **same eight generic behaviors**. Describe a feature **once** in a declarative manifest,
and it inherits all of them — no new per-feature logic.

## The eight behaviors (built once, applied everywhere)

| Behavior | What it does | Replaces the per-feature prose in |
|---|---|---|
| `guide_on_arrival` | On any navigate: speak the section's purpose, name what you can do, offer a walkthrough, highlight the primary control(s). | P199, P200 |
| `recognize_verb_object` | A verb (connect/add/remove/change/show/walk/tailor/research/search/save) + an object → one action. | P181, P184, P195, P199 |
| `pending_offer` | Every yes/no question arms a concrete follow-up; "yes" runs it; nothing pending never defaults to a random screen. | P198 |
| `confirm_destructive` | Any action whose verb is remove/change confirms before running. | P180 |
| `highlight_and_dock` | Point at the element being discussed; keep it visible; reposition as it moves. | P179, P181, P197 |
| `speak_on_update` | Narrate whenever the overlay text changes — every screen, refresh, doc-switch. | P193, P200 |
| `surface_choices` | Whenever it offers options/choices, render them **in view and reachable now** (auto-scroll to them, keep them pinned); never announce choices that aren't actually rendered. | P208 |
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
offers[]    next-step prompts to arm as pending offers
```

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

## Division of labor

- **Backend** owns the manifest, the NLU (verb+object → intent), and the guarded endpoints.
- **Frontend** owns one generic assistant runtime that reads the manifest and implements the
  seven behaviors once (see prompt **P201**), instead of a bespoke flow per screen.
