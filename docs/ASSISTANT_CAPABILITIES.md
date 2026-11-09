# Assistant capability audit — what it should respond to / action

What the Harbor Assistant should reasonably understand and do, mapped to the app's real
functions and the live endpoints. Drives the intent taxonomy (`engines/assistant/intent.py`,
`POST /api/v1/assistant/interpret`) and the frontend routing (P121–P129). Interpretation is
backend; **execution is frontend and still runs the P114 confirm / P116 scopes**.

Legend: **Intent** = what `/interpret` returns · **Action** = what the frontend does · **Endpoint(s)** = live API.

## 1. Navigation (go anywhere by voice or click)
| Say | Intent / slot | Action | Endpoint |
|---|---|---|---|
| "take me to my résumé / documents / files" | `navigate` section=documents | route to Documents | — |
| "go to my matches / jobs" | `navigate` matches | Matches | `/jobs/matches` |
| "open auto-apply" | `navigate` auto_apply | Auto-apply | — |
| "show me design / templates" | `navigate` design | Design | `/resume-templates` |
| "go to interview / inbox / connect / community / dashboard" | `navigate` <section> | route there | — |

> **Frontend gap to close:** `/interpret` already returns `navigate/documents` for "take me to my resume" — the frontend must **route every `navigate` intent** to its screen (P128/P130). If nav "doesn't work," it's routing or mic-capture, not understanding.

## 2. Guided tasks (playbooks, P115/P116/P129)
| Say | Intent / slot | Action | Endpoint(s) |
|---|---|---|---|
| "connect my email / add a job source" | `start_playbook` connect_source | Connect walkthrough | `/integrations/*` |
| "set up auto-apply / apply for me" | `start_playbook` auto_apply | rule wizard (never auto-submits) | `/auto-apply/*` |
| "walk through / analyze my matches" | `start_playbook` walk_matches | walk matches w/ why | `/jobs/matches` |
| "apply to this job / fill this application" | `start_playbook` apply_job | per-job autofill (scoped) | `/assistant/autofill/*` |
| "tailor my résumé/cover letter to this job" | `start_playbook` tailor | tailoring walkthrough + reasoning | `/cover-letters/{id}/tailor`, `/resumes/{id}/suggest-edits` |
| "upload / download a document" | `start_playbook` upload/download | upload / export | `/resumes\|cover-letters/upload`, `/export.*` |
| "design my document / which template" | `start_playbook` design | per-style advice | `/resume-templates` |
| "make bullets / work highlights" | `start_playbook` bullets | bullet workshop | `/resumes/{id}/evidence*`, `/highlights/*` |
| "practice an interview" | `start_playbook` practice | start a session | `/interview/*` |

## 3. Editing & bullets (in the Workspace, P110/P122)
| Say | Intent | Action | Endpoint |
|---|---|---|---|
| "read my bullets" | `read_bullets` | read suggestions aloud | — |
| "which should I use / suggest one" | `suggest_bullets` | recommend from match-bullets | `/resumes/{id}/match-bullets` |
| "use that one / the second one" | `use_bullet` (option_id) | apply bullet | `/apply-edits` → `/versions` |
| "discard that" | `discard_bullet` | drop a suggestion | — |
| "make my summary punchier" (free-form) | `ask` query | AI edit on the open doc | `/{…}/ai-edit`, `/improve-structured` |
| "why that change / why does it fit?" | `ask` / `suggest_bullets` | explain reasoning (rationale/gap/fit) | (in context) |

## 3a. Advice — grounded in the document AND the user's dumped info (FULLY SUPPORTED)
The assistant gives real, specific advice from three live sources — confirmed end-to-end 2026-11-09:
| Source | What it gives | Endpoint(s) |
|---|---|---|
| **The résumé** | score, strengths, issues, and **exact before→after rewrites** with rationale | `/resumes/{id}/review`, `/resumes/{id}/suggest-edits` |
| **The cover letter** | fit score, what's addressed vs missing, concrete tailoring changes | `/cover-letters/{id}/review`, `/cover-letters/{id}/tailor` |
| **A user's data dump** (notes / brag doc / pasted work) → **My Work Highlights** | extracts clean résumé-worthy **data points**, **synthesizes** them into themed concepts, then suggests bullets to add | `/resumes/{id}/evidence/extract` (`{text}`), `/evidence/synthesize` (`{text}`), `/highlights/suggest`, `/match-bullets`, `/incorporate` |

**My Work Highlights = a fully-supported, first-class feature.** Triggers ("my work highlights", "turn this into bullets", "build bullets from my notes") → `start_playbook/bullets` (confirmed). The assistant: invites the dump → extracts/synthesizes (narrating the state, P122) → recommends bullets with reasoning → applies chosen ones (`/apply-edits`→`/versions`) with confirm + Undo. It should appear wherever the app lists supported features (e.g. onboarding "things this app does"), not be buried.

## 4. Status, continuity & what's new (P126)
| Say | Intent | Action | Endpoint |
|---|---|---|---|
| "give me a status report / how am I doing" | `status_report` | speak brief summary | `/dashboard/summary` |
| "what's changed since last login / what did I miss" | `whats_new` | summarize new items | `/activity?since=<lastSeen>` |
| "pick up where I left off / resume my task" | `resume_task` | resume in-progress task + readiness | `/highlights/latest`, `/auto-apply/approvals`, `/recently-viewed` |

## 5. Voice & the assistant itself (P112/P119/P120/P127)
| Say | Intent / slot | Action |
|---|---|---|
| "change / switch voice", "use Coral" | `change_voice` (voice) | set narration voice (`/narration/voices`, `/narration/prefs`) |
| "talk faster / slower", "set speed to 1.5" | `set_rate` (direction/rate) | adjust rate |
| "stop / pause / continue / next / back / repeat / skip / cancel" | flow | transport |
| "yes / no / do it / go" | `confirm` / `decline` | answer a P114 prompt |
| "what can I do / read my options" | `read_options` | read the action groups |

## 6. Hardware / connectivity (P130/P131 — core to a voice app)
| Say | Intent | Action |
|---|---|---|
| "check if my microphone is connected", "is my mic working", "test my microphone", "you can't hear me", "troubleshoot my mic" | `check_mic` | **microphone** part of the hardware check (P130): permission, device, live level test, fix steps |
| "check my audio", "test my speakers", "hardware check", "sound check", "I can't hear you", "there's no sound" | `check_audio` | **full hardware check** (P131): speakers/output test **and** the mic test, with connect + test + fix for each |

> **Mic vs speakers split:** "*you* can't hear me" → `check_mic` (input); "*I* can't hear you / no sound" → `check_audio` (output). A general "hardware/sound/audio check" or any speaker mention runs the full both-devices guide.

## 7. Free-form fallback
Anything not classified → `ask` (verbatim `query`). The frontend decides: an **edit request** on the open document (→ `/ai-edit`), or **guidance** (P101). Low confidence / ambiguity → `needs_disambiguation` with on-screen options. The LLM backstop (when a premium provider is configured) classifies free-form into this same taxonomy.

## Principles
- **Understanding ≠ doing.** `/interpret` never executes; the frontend maps the intent to the guarded action and runs the P114 confirm / P116 scopes.
- **Every intent has a click equivalent** (P114) — voice is never the only path; mic-off/denied always falls back to buttons/typing (P123/P124).
- **Grounded in real endpoints** — the assistant only claims actions the API supports; it reads real data (match reasons, edit rationale, review results) rather than improvising.
- **Hardware is first-class** — because this is a voice-driven app, confirming mic connectivity (P130) is a core, always-available capability, not an afterthought.
