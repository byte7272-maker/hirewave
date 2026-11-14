"""Permissioned automation assistant — consent, auto form-fill, audit log."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

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
    )


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
