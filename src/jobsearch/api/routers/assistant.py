"""Permissioned automation assistant — consent, auto form-fill, audit log."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Query, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.schemas import (
    AssistantFeedback,
    AssistantFeedbackOut,
    AutofillRequest,
    AutomationActionOut,
    CommandSuggestion,
    ConsentOut,
    ConsentUpdate,
    ExecuteFillRequest,
    FillEntryOut,
    FillPlanOut,
    InterpretRequest,
    InterpretResponse,
    LiveFillResultOut,
    PrepareDraftsOut,
    PrepareDraftsRequest,
    ReasoningRequest,
    ResearchOut,
    ResearchRequest,
    ResearchSearchOut,
    ResearchSearchRequest,
    SuggestionsOut,
    TelemetryBatch,
    TelemetryIngestOut,
)
from jobsearch.engines.assistant import FormField, build_browser_driver, demo_application_form
from jobsearch.engines.assistant.intent import interpret as interpret_intent
from jobsearch.engines.assistant.intent import suggest_commands
from jobsearch.models import AUTOMATION_SCOPES, UserProfile

router = APIRouter(prefix="/api/v1/assistant", tags=["assistant"])


@router.get("/consent", response_model=ConsentOut)
def get_consent(user: CurrentUser, state: StateDep) -> ConsentOut:
    con = state.assistant.get_consent(user.id)
    return ConsentOut(granted=con.scopes, available=AUTOMATION_SCOPES)


@router.put("/consent", response_model=ConsentOut)
def set_consent(body: ConsentUpdate, user: CurrentUser, state: StateDep) -> ConsentOut:
    con = state.assistant.set_consent(user.id, body.scopes)
    return ConsentOut(granted=con.scopes, available=AUTOMATION_SCOPES)


@router.post("/interpret", response_model=InterpretResponse)
def interpret(body: InterpretRequest, user: CurrentUser, state: StateDep) -> InterpretResponse:
    """Classify a free-form utterance into a structured intent for the assistant.

    Interpretation only — this never connects, edits, navigates, or submits. The
    frontend maps the returned intent to the existing, already-guarded endpoints and
    still runs the per-action confirm (P114) and scope checks (P116). A deterministic
    matcher covers the whole command set; the configured premium LLM (if any) is a
    backstop for free-form phrasing. See ``docs/ASSISTANT_INTENT.md``."""
    ctx = body.context.model_dump() if body.context else {}
    # Only use the LLM backstop when a premium provider is actually configured
    # (resolves to None otherwise, so the deterministic path stands alone).
    llm = getattr(state.resume_assistant, "_premium", None)
    res = interpret_intent(body.transcript, context=ctx, llm=llm)
    return InterpretResponse(
        intent=res.intent, confidence=res.confidence, slots=res.slots,
        reply=res.reply, needs_disambiguation=res.needs_disambiguation,
        utterance=res.utterance,
        suggestions=[CommandSuggestion(**s) for s in res.suggestions],
        offer=res.offer,
    )


@router.post("/reasoning")
def reasoning(body: ReasoningRequest, user: CurrentUser, state: StateDep) -> dict:
    """Explain an action (or a multi-step plan) in plain terms — what I found, why I'm
    suggesting it, and how it benefits your goal — and **anticipate + bundle** the
    permissions it needs so you grant once.

    The permission bundle is computed against the caller's CURRENT grants, so
    ``to_request`` lists only what's still off and ``single_grant`` is the exact scope
    list to POST to ``PUT /assistant/consent`` to turn them all on together. This never
    grants anything itself — it only explains and prepares the one-tap ask (P116)."""
    from jobsearch.engines.assistant import reasoning as rz

    granted = state.assistant.get_consent(user.id).scopes
    if body.actions:
        out = rz.explain_plan(body.actions, subject=body.subject, goal=body.goal, granted=granted)
        return {"plan": True, **out}
    one = rz.explain(body.action, subject=body.subject, goal=body.goal, granted=granted)
    if one is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"no reasoning for action '{body.action}'",
        )
    return {"plan": False, **one}


@router.get("/capabilities")
def capabilities(
    user: CurrentUser, state: StateDep, section: str = Query("", description="one section, or blank for all"),
) -> dict:
    """The assistant capability manifest — the single declarative description of what
    the assistant can do, per feature, that the generic engines read.

    The frontend drives guide-on-arrival, control highlighting, next-step offers, and
    confirm-before-destructive from this instead of feature-specific code, so a new
    feature inherits every assistant behavior by adding one manifest entry. See
    ``docs/ASSISTANT_CAPABILITIES.md``."""
    from jobsearch.engines.assistant import capabilities as caps

    if section:
        one = caps.for_section(section)
        if one is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"no capability for section '{section}'")
        return {"version": caps.VERSION, "behaviors": list(caps.BEHAVIORS), "section": one}
    return caps.manifest()


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one}" if n == 1 else f"{n} {many}"


@router.get("/status")
def status_report(user: CurrentUser, state: StateDep) -> dict:
    """A ready-to-speak status summary built from the user's REAL data — so the
    dashboard's "Want a quick status report?" offer (intent ``status_report``) is a
    single fetch-and-speak for the client, not an abstract intent with nothing behind
    it. ``reply`` is the spoken line; ``items`` are the figures to show/highlight."""
    from jobsearch.api.routers.dashboard import summary as _summary

    s = _summary(user, state)
    m = s["matches"]
    total, strong, top = m["total"], m["strong"], m.get("top")
    apps = s["applications"]
    goal = s["weekly_goal"]

    parts: list[str] = []
    if total:
        line = f"You have {_plural(total, 'match', 'matches')}"
        if strong:
            line += f", {strong} of them strong {'fit' if strong == 1 else 'fits'}"
        parts.append(line + ".")
        if top:
            parts.append(f"Your top match is {top['title']} at {top['company']}.")
    elif s.get("needs_preferences"):
        parts.append("I don't have matches yet because your job preferences aren't set — "
                     "tell me what kind of roles you want and I'll find relevant ones.")
    else:
        parts.append("You don't have any matches yet.")

    if apps["total"]:
        parts.append(f"You've submitted {_plural(apps['submitted'], 'application', 'applications')}, "
                     f"with {apps['interviewing']} interviewing.")
    parts.append(f"This week you're at {goal['done']} of your goal of {goal['target']} applications.")
    if s["interviews"]:
        parts.append(f"You've practiced {_plural(s['interviews'], 'interview', 'interviews')}.")

    reply = " ".join(parts)
    items = [
        {"label": "Matches", "value": total, "highlight": "Matches"},
        {"label": "Strong fits", "value": strong, "highlight": "Matches"},
        {"label": "Applications", "value": apps["total"], "highlight": "Applications"},
        {"label": "Interviews", "value": s["interviews"], "highlight": "Interviews"},
        {"label": "Weekly goal", "value": f"{goal['done']}/{goal['target']}", "highlight": "Weekly goal"},
        {"label": "Résumés", "value": s["resumes"], "highlight": "Documents"},
    ]
    return {
        "reply": reply,
        "headline": "Here's where things stand.",
        "items": items,
        "needs_preferences": s.get("needs_preferences", False),
    }


@router.get("/activity")
def activity(
    user: CurrentUser, state: StateDep,
    subject_type: str = Query(""), subject_id: str = Query(""),
    topic: str = Query(""), verb: str = Query(""), limit: int = Query(50, ge=1, le=500),
) -> dict:
    """The user's activity log — filtered events + an aggregate summary (counts by
    verb/subject/topic). Drives "recent activity" and "which résumés / how many times"
    without any NLU. All filters are optional."""
    from jobsearch.engines.assistant import activity_log as al

    mine = [e for e in state.activity.find(user_id=user.id)]
    events = al.filter_events(
        mine, subject_type=subject_type, subject_id=subject_id, topic=topic, verb=verb)
    summary = al.summarize(events)
    return {
        "total": summary["total"],
        "by_verb": summary["by_verb"],
        "by_topic": summary["by_topic"],
        "subjects": summary["subjects"][:20],
        "events": [al._event_row(e) for e in events[:limit]],
    }


@router.post("/ask")
def ask(body: dict, user: CurrentUser, state: StateDep) -> dict:
    """Answer a plain-language question about the user's own activity, or about what the
    app can do, using the activity log + the function catalog. The assistant knows the
    app's major functions and can recite recent activity by relevance/topic, in different
    forms. Body: {query, form?} where form ∈ {count,list,recent,summary,functions} forces
    a shape (otherwise inferred)."""
    from jobsearch.engines.assistant import activity_log as al

    query = str(body.get("query", "")).strip()
    form = str(body.get("form", "")).strip()
    mine = list(state.activity.find(user_id=user.id))
    return al.answer(query, mine, form=form)


@router.get("/functions")
def functions(user: CurrentUser, state: StateDep, topic: str = Query("")) -> dict:
    """The app's major functions in plain language (optionally one topic) — so the
    assistant can always answer "what can you do?" even with no activity yet."""
    from jobsearch.engines.assistant import activity_log as al

    return al.functions_overview(topic)


@router.post("/error")
def report_error(body: dict, user: CurrentUser, state: StateDep) -> dict:
    """Record a failure or undesirable event (with its time, cause, and fix) and return a
    ready-to-speak acknowledgment so the assistant NEVER goes silent. For a bad mic read or
    nonsensical input, the reply is a re-ask (``ask_again: true``) — the assistant asks again
    rather than stalling. Body: {kind?, message?, context?}. ``kind`` is a troubleshooting
    key; when omitted it's inferred from ``message``."""
    handled = state.log_error(
        user.id, str(body.get("kind", "")), str(body.get("message", "")),
        context=str(body.get("context", "")))
    return handled


@router.get("/errors")
def errors(user: CurrentUser, state: StateDep, limit: int = Query(30, ge=1, le=200)) -> dict:
    """The assistant error log — recent failures with time/date, cause, and fix, plus counts
    by kind. For a 'what went wrong' / troubleshooting history view."""
    from jobsearch.engines.assistant import troubleshooting as ts

    mine = list(state.assistant_errors.find(user_id=user.id))
    s = ts.summarize(mine)
    return {"total": s["total"], "by_kind": s["by_kind"],
            "errors": [ts.row(e) for e in s["recent"][:limit]]}


@router.get("/troubleshooting")
def troubleshooting(user: CurrentUser, state: StateDep, q: str = Query("")) -> dict:
    """The troubleshooting database: common errors and their causes + fixes, searchable in
    plain language ('what does not-linked mean', 'mic not working'). Always answerable.
    Runtime knowledge overrides (global + this user's) are applied."""
    from jobsearch.engines.assistant import troubleshooting as ts
    from jobsearch.engines.assistant import knowledge as kb

    ov = kb.overrides_for(state.knowledge.find(), "troubleshooting", user.id)
    merged = kb.merge(ts.TROUBLESHOOTING, ov)
    return {"query": q, "matches": ts.search(q, catalog=merged)}


# --- dynamic knowledge base: correct/improve the assistant's instructions at runtime ---
@router.get("/knowledge")
def list_knowledge(user: CurrentUser, state: StateDep, category: str = Query("")) -> dict:
    """List the active knowledge overrides that apply to this user (global + personal) —
    corrections/improvements layered over the static catalogs. Optionally one category."""
    from jobsearch.models.knowledge import CATEGORIES

    entries = [e for e in state.knowledge.find()
               if e.active and (e.scope == "global" or e.scope == user.id)
               and (not category or e.category == category)]
    entries.sort(key=lambda e: e.updated_at, reverse=True)
    return {"categories": sorted(CATEGORIES),
            "entries": [{"id": e.id, "scope": "global" if e.scope == "global" else "me",
                         "category": e.category, "key": e.key, "data": e.data,
                         "note": e.note, "updated_at": e.updated_at.isoformat()}
                        for e in entries]}


@router.put("/knowledge")
def upsert_knowledge(body: dict, user: CurrentUser, state: StateDep,
                     x_admin_token: str = Header("")) -> dict:
    """Add or update a knowledge override — when something is proven more accurate/better,
    correct the assistant's instructions without a deploy. Body: {category, key, data, note?,
    scope?}. ``scope`` defaults to 'me' (this user's assistant); 'global' (everyone) requires
    the admin token. ``data`` merges over the static entry; {"_remove": true} drops a key."""
    import secrets
    from jobsearch.models.knowledge import CATEGORIES, KnowledgeEntry
    from jobsearch.models.common import utcnow

    category = str(body.get("category", "")).strip().lower()
    key = str(body.get("key", "")).strip()
    data = body.get("data") or {}
    scope_req = str(body.get("scope", "me")).strip().lower()
    if category not in CATEGORIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"category must be one of {sorted(CATEGORIES)}")
    if not key or not isinstance(data, dict):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "key and a data object are required")
    if scope_req == "global":
        token = state.settings.admin_token
        if not token or not secrets.compare_digest(x_admin_token or "", token):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "global knowledge edits require the admin token")
        scope = "global"
    else:
        scope = user.id
    existing = next((e for e in state.knowledge.find()
                     if e.scope == scope and e.category == category and e.key == key), None)
    if existing:
        existing.data, existing.note = data, str(body.get("note", existing.note))
        existing.active, existing.updated_at = True, utcnow()
        state.knowledge.add(existing)
        entry = existing
    else:
        entry = state.knowledge.add(KnowledgeEntry(
            scope=scope, category=category, key=key, data=data,
            note=str(body.get("note", "")), source=f"user:{user.id}"))
    return {"id": entry.id, "scope": "global" if scope == "global" else "me",
            "category": entry.category, "key": entry.key, "data": entry.data, "note": entry.note}


@router.delete("/knowledge/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_knowledge(entry_id: str, user: CurrentUser, state: StateDep,
                     x_admin_token: str = Header("")) -> None:
    """Revert an override (back to the static catalog). A user can delete their own; a
    global override requires the admin token."""
    import secrets

    e = state.knowledge.get(entry_id)
    if e is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    if e.scope == "global":
        token = state.settings.admin_token
        if not token or not secrets.compare_digest(x_admin_token or "", token):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "global knowledge edits require the admin token")
    elif e.scope != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your override")
    state.knowledge.delete(entry_id)


#: Max events accepted in one telemetry flush (protects the store from a runaway client).
_TELEMETRY_BATCH_CAP = 200


@router.post("/telemetry", response_model=TelemetryIngestOut)
def telemetry(body: TelemetryBatch, user: CurrentUser, state: StateDep) -> TelemetryIngestOut:
    """Record a batch of assistant-interaction events for the learning digest (P182).

    Product telemetry only — the utterance is PII-scrubbed and length-capped server-side
    before storage, and no document content is accepted. Best-effort and non-blocking:
    a storage hiccup returns ``accepted: 0`` rather than failing the user's session."""
    from jobsearch.analytics import assistant_telemetry

    events = [e.model_dump() for e in body.events[:_TELEMETRY_BATCH_CAP]]
    accepted = assistant_telemetry.record(state.documents, user.id, events)
    return TelemetryIngestOut(accepted=accepted)


@router.post("/feedback", response_model=AssistantFeedbackOut)
def submit_feedback(body: AssistantFeedback, user: CurrentUser, state: StateDep) -> AssistantFeedbackOut:
    """Capture a tester's direct feedback on what was confusing/challenging (optionally
    tied to the command they were attempting). Feeds the admin digest so the assistant
    can be improved where real users struggle. PII-scrubbed and length-capped; best-effort."""
    from jobsearch.analytics import assistant_telemetry

    ok = assistant_telemetry.record_feedback(
        state.documents, user.id, body.note,
        utterance=body.utterance, intent=body.intent, section=body.section,
    )
    return AssistantFeedbackOut(accepted=ok)


@router.post("/research/search", response_model=ResearchSearchOut)
def research_search(body: ResearchSearchRequest, user: CurrentUser, state: StateDep) -> ResearchSearchOut:
    """Find result URLs for a research query. Uses Google Programmable Search server-side
    when configured (`GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX`), keeping the key off the client;
    otherwise returns `use_client: true` so the extension searches DuckDuckGo on the
    user's connection. Requires the `web_research` consent scope (P185); it only returns
    public result links — the extension fetches the pages, this never does."""
    if not state.assistant.has(user.id, "web_research"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "grant the 'web_research' permission in Assistant settings first",
        )
    from jobsearch.engines.assistant import web_search

    res = web_search.search(body.query, settings=state.settings, limit=body.max)
    return ResearchSearchOut(**res.as_dict())


@router.post("/research/summarize", response_model=ResearchOut)
def research_summarize(body: ResearchRequest, user: CurrentUser, state: StateDep) -> ResearchOut:
    """Summarize web pages the user's browser fetched into a job-search research brief:
    overview, useful facts, executive leadership, and how to use it (ATS keywords, skills
    to emphasize, tailoring against the user's experience).

    Requires the ``web_research`` consent scope (the pre-approval). The browser does the
    fetching on the user's connection with the user's real-time approval; this endpoint
    only summarizes. The page text is treated as **untrusted data** — never instructions."""
    if not state.assistant.has(user.id, "web_research"):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "grant the 'web_research' permission in Assistant settings first",
        )
    from jobsearch.engines.assistant import web_research

    # Tailor against the user's skills: their structured profile + the chosen résumé.
    profile = state.profiles.get(user.id)
    skills = list(profile.skills) if profile else []
    if body.resume_id:
        resume = state.resumes.get(body.resume_id)
        if resume is not None and resume.user_id == user.id:
            from jobsearch.api.routers.documents import ensure_rendered_text
            from jobsearch.engines.sourcing.skills import extract_skills

            resume = ensure_rendered_text(state, resume)
            skills = list(dict.fromkeys([*skills, *extract_skills(resume.rendered_text or "", limit=25)]))

    llm = getattr(state.resume_assistant, "_premium", None)
    result = web_research.research(
        [s.model_dump() for s in body.sources],
        company=body.company, query=body.query, user_skills=skills, llm=llm,
    )
    return ResearchOut(**result)


@router.get("/research/company")
def research_company(
    user: CurrentUser,
    state: StateDep,
    company: str = Query(..., min_length=1, description="the company to look up"),
    max: int = Query(6, ge=1, le=10),
) -> dict:
    """One call behind the assistant's "research this company" action: a spoken
    ``reply`` summarizing what we found, plus ``links`` the user can open for further
    lookup (LinkedIn, Glassdoor, news, …) and, when a server search provider is
    configured, real ``results``.

    Web research is **off by default** (the ``web_research`` consent scope). When it
    isn't granted this returns ``needs_permission: true`` with a prompt — a soft gate,
    not a 403 — so the assistant can OFFER to turn it on (one-tap grant via
    ``PUT /assistant/consent``) instead of failing. The deterministic lookup ``links``
    are returned either way so the user is never left empty-handed."""
    from jobsearch.engines.assistant import company_lookup

    name = company.strip()
    if not state.assistant.has(user.id, "web_research"):
        return {
            "company": name,
            "needs_permission": True,
            "scope": "web_research",
            "permission_prompt": AUTOMATION_SCOPES["web_research"],
            "reply": (
                f"I can research {name or 'this company'} for you, but web research is off "
                f"right now. Want me to turn it on? You approve each search."
            ),
            # Still hand over the quick links so the tap isn't a dead end.
            "links": company_lookup.lookup_links(name),
            "results": [],
            "use_client": False,
        }
    out = company_lookup.research_company(name, settings=state.settings, limit=max)
    out["needs_permission"] = False
    return out


@router.get("/suggestions", response_model=SuggestionsOut)
def suggestions(
    user: CurrentUser,
    section: str = Query("", description="the screen the user is on, e.g. 'matches'"),
    job_id: str = Query("", description="a focused job, to offer job-level commands"),
    limit: int = Query(6, ge=1, le=12),
) -> SuggestionsOut:
    """Example commands to offer on the current screen — every one is wording the
    assistant is guaranteed to understand and act on (verified against the same NLU
    that `/interpret` uses). The assistant uses these to teach the user what to say,
    and to recover when it didn't catch something."""
    ctx = {"section": section, "job_id": job_id}
    items = suggest_commands(ctx, limit=limit)
    return SuggestionsOut(suggestions=[CommandSuggestion(**s) for s in items])


@router.get("/actions", response_model=list[AutomationActionOut])
def actions(user: CurrentUser, state: StateDep) -> list[AutomationActionOut]:
    return [
        AutomationActionOut(id=a.id, kind=a.kind, job_id=a.job_id, status=a.status, detail=a.detail, created_at=a.created_at.isoformat())
        for a in state.assistant.actions_for(user.id)
    ]


def _require_autofill(user, state) -> None:
    if not state.assistant.has(user.id, "form_autofill"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "grant the 'form_autofill' permission in Assistant settings first")


def _job_or_404(job_id: str, state):
    job = state.jobs.get(job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "job not found")
    return job


def _prepare(job_id, user, state, fields_in):
    account = state.users.get(user.id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    profile = state.profiles.get(user.id) or UserProfile(user_id=user.id)
    fields = [FormField(f.name, f.label, f.type, f.required) for f in fields_in] if fields_in else demo_application_form()
    resumes = state.resumes.find(user_id=user.id)
    resume_name = ""
    resume_data = b""
    if resumes:
        latest = sorted(resumes, key=lambda r: r.id)[-1]
        resume_name = latest.original_filename or f"{latest.target_role or 'résumé'}.md"
        try:
            stored = state.documents.get(latest.id)  # (bytes, content_type) | None
            resume_data = stored[0] if stored else b""
        except Exception:  # noqa: BLE001 - upload store optional
            resume_data = b""
    covers = state.cover_letters.find(user_id=user.id)
    cover_text = sorted(covers, key=lambda c: c.id)[-1].content if covers else ""
    plan = state.assistant.autofill(
        account, profile, fields, job_id=job_id, resume_name=resume_name, cover_text=cover_text,
        # Auto-fill recurring screener questions from the user's learned answers.
        screener_suggest=lambda q: state.screener.suggest(user.id, q),
    )
    return account, plan, resume_name, resume_data


@router.post("/prepare-drafts", response_model=PrepareDraftsOut)
def prepare_drafts(body: PrepareDraftsRequest, user: CurrentUser, state: StateDep) -> PrepareDraftsOut:
    """Auto-prepare application drafts (résumé + cover letter) for your strong
    matches. Requires the ``draft_prep`` permission. Drafts still need your
    approval before anything is submitted."""
    if not state.assistant.has(user.id, "draft_prep"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "grant the 'draft_prep' permission in Assistant settings first")
    apps = state.draft_prep.run(user.id, min_fit=body.min_fit, limit=body.limit)
    return PrepareDraftsOut(prepared=len(apps), application_ids=[a.id for a in apps])


@router.post("/autofill/{job_id}", response_model=FillPlanOut)
def autofill(job_id: str, body: AutofillRequest, user: CurrentUser, state: StateDep) -> FillPlanOut:
    """Preview how the assistant would fill a job's application form from your
    profile. Requires the ``form_autofill`` permission. Credential fields are
    always refused; unknown fields are flagged for you — nothing is submitted."""
    _require_autofill(user, state)
    _job_or_404(job_id, state)
    _account, plan, _rn, _rd = _prepare(job_id, user, state, body.fields)
    return FillPlanOut(
        entries=[FillEntryOut(field=e.field, label=e.label, value=e.value, source=e.source, status=e.status, reason=e.reason) for e in plan.entries],
        filled=plan.filled, blocked=plan.blocked, needs_input=plan.needs_input,
    )


@router.post("/autofill/{job_id}/execute", response_model=LiveFillResultOut)
def execute(job_id: str, body: ExecuteFillRequest, user: CurrentUser, state: StateDep) -> LiveFillResultOut:
    """Drive a browser to fill (and optionally submit) the application, from the
    reviewed plan. Requires ``form_autofill``; submitting also requires
    ``submit_after_review``. Credential fields never reach the browser; a login
    wall or CAPTCHA is escalated back to you, never solved."""
    _require_autofill(user, state)
    if body.submit and not state.assistant.has(user.id, "submit_after_review"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "grant 'submit_after_review' to let the assistant submit")
    job = _job_or_404(job_id, state)
    account, plan, resume_name, resume_data = _prepare(job_id, user, state, None)
    driver, live = build_browser_driver(state.settings, platform=job.source_platform)
    result = state.assistant.execute_fill(
        account, plan, driver, url=job.url, submit=body.submit, job_id=job_id,
        resume_name=resume_name, resume_data=resume_data, live=live,
    )
    return LiveFillResultOut(
        status=result.status, filled=result.filled, unknown_required=result.unknown_required,
        confirmation=result.confirmation, detail=result.detail, live=result.live,
    )
