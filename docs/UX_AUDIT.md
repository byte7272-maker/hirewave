# Project Harbor — UX Audit

_Scope: the live marketing site (hlrtlg.readdy.co), the API/feature structure, and
the recurring editor issues surfaced in testing. Logged-in app screens are inferred
where noted (not directly inspected)._

## Headline finding

Nearly every résumé-editor bug in testing — instructions written onto the résumé as
bullets, "add your own improvements" not executing, skills formatting reverting —
traces to **one root cause: overlapping, ambiguous names for the "change my résumé"
features.** A user (and the frontend/Readdy) must currently keep six near-synonyms
straight:

| Current name | What it actually does | Endpoint |
|---|---|---|
| Improve with AI | AI rewrites existing content | `/improve-structured` |
| Add your own improvements | *intended* AI guidance | (mis-wired) |
| Notes and instructions | *intended* AI commands, but writes them in as bullets | `/incorporate` (wrong) |
| Incorporate ideas | adds your content as bullets | `/incorporate` |
| Add a bullet | adds your content verbatim | `PUT rendered_text` |
| Quick refine / Revise | AI rewrite (older path) | `/revise` |

This is an information-architecture problem before it is a code problem.

### Fix: collapse to TWO actions (+ one utility)

Every résumé change is one of exactly two intents. Name them so they can't be confused:

1. **Ask AI to change it** — one instruction box → `/improve-structured` with
   `{content, instruction}`. Executes the command; never writes it into the résumé.
2. **Add my own content** — the user's real accomplishments → "+ Add bullet"
   (verbatim) and "Find my accomplishments" (both use `/incorporate`).

Utility: **Find & replace** for exact edits → `/replace`.

Retire: *notes and instructions*, *incorporate*, *quick refine*, *add your own
improvements*. One name per concept, everywhere.

## Wording / microcopy

- Verb-first buttons: "Improve with AI" → **Rewrite with AI**; application submit →
  **Apply now**; keep **Approve & submit**.
- Say what won't happen — the safety promises are the differentiator. Use one
  consistent line in-app and on the site: *"You approve every apply. Cookies only,
  never your password."*
- Empty/zero states teach the next action (model: the `No matches for 'X'` message).
- Errors carry a recovery path ("Session needs attention — reconnect {provider}").

## Layout & navigation

- Editor = 3 zones: (1) the résumé, (2) a single **Make a change** panel with the two
  actions, (3) a review/suggestions rail.
- Always show a **diff preview** before applying; one explicit **Accept**; never
  mutate silently.
- Let the **template own layout** (skills inline comma-separated, etc.) so content
  edits and formatting edits don't fight.
- Progressive disclosure for "Advanced"/template internals.
- One primary action per screen.

## Speed (perceived + real)

Perceived speed dominates — each AI improve is one LLM round-trip (gpt-4o-mini).

Perceived:
- Optimistic + **skeleton UI** on every AI action; never a frozen button.
- **Stream** results if supported, else a progress affordance ("~5–10s").
- **Re-render from the response** (no second fetch, no revert flicker).

Real / fewer round-trips:
- **Route to the cheapest correct path**: literal "replace X with Y" → `/replace`
  (instant, no LLM); "comma-separate skills" → template toggle, not an LLM call.
  Reserve the LLM for genuine rewrites — faster AND more reliable.
- Lean on existing caches (good foundations): review caches
  `content_summary`/`summarized_at`; embeddings use a caching provider; the
  applications list attaches job cards server-side (no per-row N+1). **Debounce**
  review; don't re-run on every keystroke.
- **Prefetch** the review when the editor opens so the suggestions rail is ready.
- **Batch** (Approve all) to avoid N round-trips.

## Onboarding & trust

- First-run checklist: Upload résumé → Connect a site → Review matches → Approve
  first apply (with progress).
- In-app "You're a tester" banner during private beta (reuse the tester blurb).
- Keep the approval gate visible at the moment of apply, not just on the site.

## Priority order (impact ÷ effort)

1. **Unify the "change my résumé" naming to two actions** (fixes the bug cluster). ★
2. **Route literal edits to `/replace`, formatting to template toggles** (speed + reliability).
3. **Always diff-preview + re-render from response + visible loading/error states.**
4. Skills inline + template owns layout.
5. First-run checklist + consistent safety microcopy.
6. Homepage/microcopy polish.

---

# Ready-to-paste Readdy prompts (top 3)

## Prompt 1 — Unify résumé-change controls into two clear actions

> **Reorganize the résumé editor's "change" controls into exactly two clearly-named
> actions, plus one utility. This removes the overlap that causes instructions to be
> written onto the résumé as bullets.**
>
> Remove/retire these confusing, overlapping controls and labels: "Notes and
> instructions," "Add your own improvements," "Incorporate ideas," "Quick refine."
> Replace them with:
>
> **Action 1 — "Ask AI to change it"** (an instruction box)
> - Placeholder: "e.g. make my summary punchier, or use present tense for my current role."
> - On submit: `POST /api/v1/resumes/{resume_id}/improve-structured` with
>   `{ "content": "<current editor text>", "instruction": "<the box's text>" }` (Bearer token).
> - This EXECUTES the instruction. NEVER insert the instruction text into the résumé.
>   Do not call `/incorporate` and do not send this text as `ideas`/`notes`.
> - Show the result as a diff preview; on Accept, persist via `POST /resumes/{id}/versions`
>   and re-render from the response. Clear the box.
>
> **Action 2 — "Add my own content"** (for real accomplishments)
> - "+ Add bullet": inserts the typed text verbatim into the chosen section and saves
>   via `PUT /api/v1/resumes/{resume_id}` `{ "rendered_text": "<updated text>" }`.
> - "Find my accomplishments": the evidence flow (`/evidence-prompts` →
>   `/evidence/extract` → selected points to `/incorporate`).
> - ONLY these two write content into the résumé.
>
> **Utility — "Find & replace"**: `POST /api/v1/resumes/{resume_id}/replace`
> `{ find, replace, all, case_sensitive }`; show "Replaced N" or "No matches for 'X'."
>
> Use these exact names everywhere (buttons, headings, tooltips). One name per concept.

## Prompt 2 — Route edits to the fastest correct path

> **Don't send every edit through the AI. Pick the cheapest correct path so edits are
> instant and reliable.**
>
> - If the user's request is a literal replacement ("replace X with Y", "change A to
>   B"), use **Find & replace** (`/resumes/{id}/replace`) instead of the AI rewrite —
>   it's instant and exact, and returns a `count` so you can say "No matches for 'X'."
> - Treat **skills layout** (comma-separated vs bullets) as a **template/display
>   toggle**, not an AI call — re-render the Skills section locally; never round-trip
>   the LLM for formatting.
> - Reserve `POST /resumes/{id}/improve-structured` (the LLM) for genuine rewrites
>   (tone, concision, tense, tailoring).
> - Debounce the résumé review; don't re-run it on every keystroke — only on demand or
>   after a save.

## Prompt 3 — Always preview, re-render, and show status

> **Make every résumé change give visible feedback and update the document in place.**
>
> For every change action (Ask AI, Add content, Find & replace):
> - Show a **spinner/skeleton** on the triggering control while the request is in
>   flight; never leave a button that appears to do nothing.
> - On success, render the returned content as a **diff preview**, with one explicit
>   **Accept**. On Accept, persist and then **re-render the editor from the API
>   response** (not a cached copy) so the on-screen résumé always matches what's saved.
> - If the result is unchanged, say so: "No change was made — try rephrasing, or use
>   Find & replace for an exact edit."
> - On any error (non-200 or network), show a **red toast** with the status/message —
>   never fail silently. Handle 401 → sign-in.
