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

## 6. Hardware / connectivity (P130 — core to a voice app)
| Say | Intent | Action |
|---|---|---|
| "check if my microphone is connected", "is my mic working", "test my microphone", "you can't hear me", "troubleshoot my mic", "check my audio" | `check_mic` | run the **mic connectivity troubleshooting guide** (P130): permission state, device present, live level test, fix steps |

## 7. Free-form fallback
Anything not classified → `ask` (verbatim `query`). The frontend decides: an **edit request** on the open document (→ `/ai-edit`), or **guidance** (P101). Low confidence / ambiguity → `needs_disambiguation` with on-screen options. The LLM backstop (when a premium provider is configured) classifies free-form into this same taxonomy.

## Principles
- **Understanding ≠ doing.** `/interpret` never executes; the frontend maps the intent to the guarded action and runs the P114 confirm / P116 scopes.
- **Every intent has a click equivalent** (P114) — voice is never the only path; mic-off/denied always falls back to buttons/typing (P123/P124).
- **Grounded in real endpoints** — the assistant only claims actions the API supports; it reads real data (match reasons, edit rationale, review results) rather than improvising.
- **Hardware is first-class** — because this is a voice-driven app, confirming mic connectivity (P130) is a core, always-available capability, not an afterthought.
