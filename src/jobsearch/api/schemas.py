"""Request/response DTOs for the API (kept separate from domain models)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from jobsearch.engines.generation import Tone
from jobsearch.models import (
    Application,
    ApplicationStatus,
    CoverLetterData,
    JobPosting,
    ResumeData,
    ResumeFormat,
    ResumeSuggestion,
    ResumeTemplate,
)
from jobsearch.models.user import (
    Education,
    JobPreferences,
    SalaryRange,
    UserProfile,
    WorkExperience,
)


# --- auth & users -----------------------------------------------------------
class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str = ""
    location: str = ""
    invite_code: str = ""  # required when signup_mode = "invite"


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class FirebaseAuthRequest(BaseModel):
    # The Firebase ID token from the frontend after the user signs in with
    # Firebase Auth (email / Google / …). We verify it and issue our own session.
    id_token: str
    invite_code: str = ""  # required for a NEW account when signup_mode = "invite"


class MintInviteRequest(BaseModel):
    label: str = ""  # who/what it's for
    max_uses: int = 1
    ttl_hours: Optional[int] = None  # expiry; None = no expiry
    count: int = 1  # mint several at once


class InviteOut(BaseModel):
    id: str
    code: str
    label: str = ""
    max_uses: int = 1
    uses: int = 0
    active: bool = True
    expires_at: Optional[str] = None


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    location: str


class ProfileUpdate(BaseModel):
    headline: Optional[str] = None
    summary: Optional[str] = None
    skills: Optional[list[str]] = None
    work_experience: Optional[list[WorkExperience]] = None
    education: Optional[list[Education]] = None


class PreferencesUpdate(BaseModel):
    job_type: Optional[str] = None
    salary_range: Optional[SalaryRange] = None
    remote_ok: Optional[bool] = None
    target_roles: Optional[list[str]] = None
    target_locations: Optional[list[str]] = None
    seniority: Optional[str] = None
    #: Broad job categories the user wants to focus matches on (see GET /jobs/categories).
    job_categories: Optional[list[str]] = None


# --- integrations -----------------------------------------------------------
class ConnectResponse(BaseModel):
    authorization_url: str
    state: str


# --- jobs -------------------------------------------------------------------
class JobInput(BaseModel):
    source_platform: str = ""
    external_id: str = ""
    title: str = ""
    company: str = ""
    company_domain: str = ""
    location: str = ""
    remote: bool = False
    description: str = ""
    requirements: list[str] = Field(default_factory=list)
    salary_range: Optional[SalaryRange] = None
    url: str = ""
    company_logo_url: str = ""  # explicit logo from the source, when provided
    application_email: str = ""


class IngestRequest(BaseModel):
    jobs: list[JobInput]


class SaveJobRequest(BaseModel):
    job_posting_id: str
    note: Optional[str] = None


class ReorderSavedRequest(BaseModel):
    #: job ids in the desired order (the frontend sends the visible saved-job ids)
    ids: list[str]


class MatchOut(BaseModel):
    job_id: str
    title: str
    company: str
    score: float
    matching_skills: list[str]
    gap_skills: list[str]
    authenticity_score: Optional[int] = None
    #: Direct link to the posting (e.g. the LinkedIn URL) so the user can open it.
    url: str = ""
    location: str = ""
    remote: bool = False
    posted_ago: str = ""  # e.g. "2 days ago" (empty when unknown)
    source_platform: str = ""  # e.g. "linkedin"
    source_display: str = ""  # nicely-cased board name, e.g. "LinkedIn"
    category: str = ""  # broad category (Engineering, Data & Analytics, …)
    #: Salary: structured range + a ready-to-display string ("$90k - $130k"); the
    #: string is empty when no salary is known.
    salary_range: Optional[SalaryRange] = None
    salary_display: str = ""
    #: Company logo for display: the source's logo when provided, else derived from
    #: the company domain. May be empty — the UI should fall back to a lettermark.
    company_logo: str = ""
    #: Cross-posting indicators. ``likely_duplicate`` = another kept posting looks
    #: like the same job (across boards); they share ``duplicate_group_id`` and are
    #: listed in ``cross_posting_ids``. ``consolidated_count`` identical re-posts
    #: were merged into this one (from ``consolidated_sources``).
    likely_duplicate: bool = False
    duplicate_group_id: str = ""
    cross_posting_ids: list[str] = Field(default_factory=list)
    consolidated_count: int = 0
    consolidated_sources: list[str] = Field(default_factory=list)


# --- documents --------------------------------------------------------------
class ResumeGenerateRequest(BaseModel):
    job_posting_id: str
    tone: Tone = Tone.PROFESSIONAL
    format: ResumeFormat = ResumeFormat.MARKDOWN


class ResumeUpdate(BaseModel):
    rendered_text: Optional[str] = None
    target_role: Optional[str] = None
    approved: Optional[bool] = None
    archived: Optional[bool] = None
    flagged: Optional[bool] = None


class ResumeReviewRequest(BaseModel):
    job_posting_id: Optional[str] = None  # tailor the review to a target job


class ResumeReviseRequest(BaseModel):
    #: What to change, in plain language ("make it more concise", "emphasise
    #: leadership", "tailor to a product manager role"). Single instruction.
    instruction: str = ""
    #: Several prompts to apply together in one rewrite (multi-select). Combined
    #: with ``instruction``; at least one of the two must be non-empty.
    instructions: list[str] = Field(default_factory=list)
    job_posting_id: Optional[str] = None


class TailorRequest(BaseModel):
    job_posting_id: str  # the job to tailor for (required)


class CoverLetterGenerateRequest(BaseModel):
    job_posting_id: str
    resume_id: Optional[str] = None
    tone: Tone = Tone.PROFESSIONAL


class CoverLetterUpdate(BaseModel):
    content: Optional[str] = None
    approved: Optional[bool] = None
    archived: Optional[bool] = None
    flagged: Optional[bool] = None


# --- work-experience highlights ---------------------------------------------
class ExperienceCreate(BaseModel):
    content: str  # the highlight / story / analysis text
    title: str = ""
    kind: str = "highlight"  # highlight|story|project|analysis|interaction|achievement
    source: str = "self_written"  # self_written|ai_generated|imported
    source_tool: str = ""  # e.g. "Microsoft 365 Copilot", "Glean" (for ai_generated)
    skills: list[str] = []
    company: str = ""
    period: str = ""


class ExperienceUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    kind: Optional[str] = None
    source: Optional[str] = None
    source_tool: Optional[str] = None
    skills: Optional[list[str]] = None
    company: Optional[str] = None
    period: Optional[str] = None


# --- applications -----------------------------------------------------------
class ApplicationCreate(BaseModel):
    job_posting_id: str
    resume_id: Optional[str] = None
    cover_letter_id: Optional[str] = None


class SubmitRequest(BaseModel):
    platform: Optional[str] = None  # override adapter selection


class StatusUpdate(BaseModel):
    status: ApplicationStatus


class JobCard(BaseModel):
    """The job display fields an application/saved card needs, so the frontend can
    render company, title, and logo without a second fetch per row."""

    job_posting_id: str
    title: str = ""
    company: str = ""
    company_logo: str = ""  # resolved logo (source's, else domain-derived); may be empty
    location: str = ""
    remote: bool = False
    url: str = ""
    source_platform: str = ""
    source_display: str = ""  # nicely-cased board name, e.g. "LinkedIn"
    category: str = ""
    posted_ago: str = ""
    salary_range: Optional[SalaryRange] = None
    salary_display: str = ""  # ready-to-display salary ("$90k - $130k"); empty if unknown

    @classmethod
    def from_job(cls, job: JobPosting) -> "JobCard":
        return cls(
            job_posting_id=job.id,
            title=job.title,
            company=job.company,
            company_logo=job.company_logo,
            location=job.location,
            remote=job.remote,
            url=job.url,
            source_platform=job.source_platform,
            source_display=job.source_display,
            category=job.category,
            posted_ago=job.posted_ago,
            salary_range=job.salary_range,
            salary_display=job.salary_display,
        )


class ApplicationOut(Application):
    """An application plus a snapshot of its job's display fields (``job``). All the
    original application fields stay at the top level — this is additive."""

    job: Optional[JobCard] = None


class ResumeTailoring(BaseModel):
    """A résumé-for-a-job view: which job, how well it fits, and what to change to
    tailor it. Backs the 'tailor this résumé for a job' section so the user always
    sees the target job and a perspective before revising."""

    resume_id: str
    job: JobCard  # the target job (title, company, logo, salary, url…) — WHICH job
    fit_score: int = 0  # 0-100 résumé-vs-this-job fit
    matching_skills: list[str] = Field(default_factory=list)  # requirements you already cover
    missing_keywords: list[str] = Field(default_factory=list)  # requirements not surfaced yet
    qualifications: str = ""  # perspective on how you qualify for THIS job
    summary: str = ""  # one-line overall
    tailoring: list[ResumeSuggestion] = Field(default_factory=list)  # concrete changes to tailor it


class CoverLetterTailoring(BaseModel):
    """A cover-letter-for-a-job view: which job, how well the letter targets it, and
    what to change to tailor it. Parallels :class:`ResumeTailoring`."""

    cover_letter_id: str
    job: JobCard  # the target job — WHICH job
    fit_score: int = 0  # 0-100 how well the letter targets this job
    addressed: list[str] = Field(default_factory=list)  # job requirements the letter mentions
    missing_points: list[str] = Field(default_factory=list)  # job requirements not mentioned yet
    qualifications: str = ""  # perspective on how the letter targets THIS job
    summary: str = ""  # one-line overall
    tailoring: list[ResumeSuggestion] = Field(default_factory=list)  # concrete changes to tailor it


class FlaggedMetric(BaseModel):
    """A number in the AI-improved résumé that is not in the original text — likely
    invented; the UI should highlight it for the user to verify before accepting."""

    value: str  # e.g. "30%", "$2M"
    field: str  # where it appears, e.g. "work[0].highlights[1]" or "summary"
    text: str  # the containing line


class RenderedResume(BaseModel):
    """The 'finished project': the user's résumé content (JSON Resume) placed onto a
    chosen template's style. The frontend renders ``data`` with ``template.style``;
    users then tweak the content (versions) or the style."""

    template: ResumeTemplate
    data: ResumeData


class StructuredImprovement(BaseModel):
    """A field-level AI improvement of a résumé, as structured JSON Resume plus the
    markdown to save. The frontend renders ``structured`` in the chosen template
    (formatting intact); accepting saves ``markdown`` as a new version."""

    structured: ResumeData
    markdown: str = ""
    #: Numbers not found in the original résumé — possibly invented; surface these for
    #: the user to verify (the human-in-the-loop safeguard).
    flagged_metrics: list[FlaggedMetric] = Field(default_factory=list)


class CoverLetterStructuredImprovement(BaseModel):
    """Structure-aware cover-letter improvement — the cover-letter template shape plus
    the markdown to save; parallels :class:`StructuredImprovement`."""

    structured: CoverLetterData
    markdown: str = ""
    flagged_metrics: list[FlaggedMetric] = Field(default_factory=list)


class CreateVersionRequest(BaseModel):
    """Save an accepted rewrite as a new version of a résumé/cover letter."""

    content: str  # the new version's full text (e.g. an accepted revise preview)
    label: Optional[str] = None  # optional tag; defaults to the target job's type
    job_posting_id: Optional[str] = None  # the job this version targets, if any
    instruction: str = ""  # what was asked for (used in the change summary)


class VersionReuseSuggestion(BaseModel):
    """Whether an existing saved version fits a new job — so the user can reuse a
    past tailored version (with slight tweaks) instead of starting over."""

    job: JobCard
    best_version: Optional[int] = None  # the saved version that fits best (None = none saved)
    best_label: str = ""
    fit: int = 0  # 0-100 keyword coverage of the job by that version
    covered: list[str] = Field(default_factory=list)  # job requirements it already covers
    missing: list[str] = Field(default_factory=list)  # what to add — the slight modifications
    reuse_recommended: bool = False
    recommendation: str = ""


class InterviewPrepRequest(BaseModel):
    resume_id: Optional[str] = None
    job_posting_id: Optional[str] = None
    count: int = 6


class MockInterviewStartRequest(BaseModel):
    resume_id: Optional[str] = None
    job_posting_id: Optional[str] = None
    style: Optional[str] = None  # friendly | formal | technical | skeptical | behavioral
    difficulty: Optional[str] = None  # easy | normal | hard
    max_questions: int = 5
    persona_id: Optional[str] = None  # pick a specific persona from the library
    questions: Optional[list[str]] = None  # explicit plan (e.g. crowdsourced questions)


class MockInterviewReplyRequest(BaseModel):
    answer: str
    response_seconds: Optional[float] = None


class VocabularyRequest(BaseModel):
    #: The transcript to analyze — a recorded answer or the running text from
    #: live speech-to-text.
    text: str
    #: When true (and an LLM is configured), also return a polished rewrite.
    rewrite: bool = False


class MockCoachOut(BaseModel):
    """Guided-practice coaching for the current mock-interview question: a model
    answer to (optionally) read aloud, plus how long to pause for the candidate."""

    question: str  # the current interviewer question
    category: str  # inferred category (intro/behavioral/technical/…)
    model_answer: str  # a résumé-grounded sample answer (never fabricated)
    answer_seconds: int  # suggested time budget to answer before moving on
    tips: str = ""  # short how-to-answer hint


class ScreenerAnswerIn(BaseModel):
    question: str
    answer: str
    kind: str = ""  # blank = inferred (boolean/numeric/text)


class ScreenerLearnBatch(BaseModel):
    answers: list[ScreenerAnswerIn]


class ScreenerSuggestRequest(BaseModel):
    questions: list[str]


class ScreenerAnswerUpdate(BaseModel):
    answer: Optional[str] = None
    kind: Optional[str] = None


class OnboardingStepUpdate(BaseModel):
    status: str  # "completed" | "dismissed" | "started"


class OnboardingHubUpdate(BaseModel):
    dismissed: bool = True


class PersonaVoiceUpdate(BaseModel):
    source: Optional[str] = None  # browser | server | uploaded
    voice_uri: Optional[str] = None  # browser SpeechSynthesisVoice id
    lang: Optional[str] = None  # e.g. "en-US"
    rate: Optional[float] = None  # 0.5-2.0
    pitch: Optional[float] = None  # 0-2
    voice_id: Optional[str] = None  # server neural voice id


class TtsRequest(BaseModel):
    text: str
    voice: str = ""  # provider voice id; blank = provider default


class AvatarVideoRequest(BaseModel):
    text: str
    persona: dict = {}


class CommunityQuestionSubmit(BaseModel):
    job_title: str
    question: str
    category: str = "behavioral"
    tips: str = ""


class CommunityQuestionOut(BaseModel):
    """Public view — hides voter/flagger ids, adds the caller's own state."""

    id: str
    job_title: str
    category: str
    question: str
    tips: str
    votes: int
    created_at: str
    mine: bool
    voted: bool


# --- exposure monitoring ----------------------------------------------------
class EnrollRequest(BaseModel):
    email: str


class VerifyRequest(BaseModel):
    code: str


class MonitoredIdentifierOut(BaseModel):
    """Safe view of a monitored identifier — never exposes the value or code."""

    id: str
    type: str
    label: str  # masked
    verified: bool
    verified_at: Optional[str] = None
    created_at: str


class EnrollResponse(BaseModel):
    identifier: MonitoredIdentifierOut
    # Dev convenience: the code is returned so the flow is usable without a real
    # email channel. In production it is emailed and this field is null.
    verification_code: Optional[str] = None


class ScanResponse(BaseModel):
    new_findings: int
    findings: list[dict]  # the newly discovered ExposureFindings (serialized)


class SubmitResponse(BaseModel):
    success: bool
    platform: str
    confirmation_id: str = ""
    message: str = ""
    requires_manual: bool = False
    fallback_url: str = ""
    manual_steps: list[str] = Field(default_factory=list)


class AcceptInviteRequest(BaseModel):
    code: str


class EmailInviteRequest(BaseModel):
    email: str


class BoardCreate(BaseModel):
    name: str
    description: str = ""
    is_public: bool = True


class JoinBoardRequest(BaseModel):
    board_id: Optional[str] = None
    code: Optional[str] = None


class BoardOut(BaseModel):
    id: str
    name: str
    description: str
    owner_id: str
    is_public: bool
    member_count: int
    created_at: str
    joined: bool
    is_owner: bool
    join_code: Optional[str] = None  # exposed only to members/owner


class BoardPostCreate(BaseModel):
    body: str = ""
    shared_job_id: Optional[str] = None


class ConnectionBrief(BaseModel):
    user_id: str
    name: str


class SendMessageRequest(BaseModel):
    to_user_id: str
    body: str = ""
    shared_job_id: Optional[str] = None


class PracticeInviteRequest(BaseModel):
    guest_id: str


class PracticeSessionOut(BaseModel):
    id: str
    host_id: str
    guest_id: str
    status: str
    i_am_host: bool
    other_name: str
    created_at: str


class SignalIn(BaseModel):
    kind: str  # offer | answer | ice | bye
    payload: str = ""


class SignalOut(BaseModel):
    kind: str
    payload: str
    from_user: str


class SharedJobBrief(BaseModel):
    id: str
    title: str
    company: str


class MessageOut(BaseModel):
    id: str
    from_user_id: str
    to_user_id: str
    body: str
    shared_job: Optional[SharedJobBrief] = None
    mine: bool
    created_at: str


class BoardPostOut(BaseModel):
    id: str
    user_id: str
    author: str
    body: str
    shared_job: Optional[SharedJobBrief] = None
    mine: bool
    created_at: str


class ConsentUpdate(BaseModel):
    scopes: list[str]


class ConsentOut(BaseModel):
    granted: list[str]
    available: dict  # {scope: human-readable description}


class FormFieldIn(BaseModel):
    name: str
    label: str = ""
    type: str = "text"
    required: bool = False


class AutofillRequest(BaseModel):
    fields: Optional[list[FormFieldIn]] = None  # None = a representative demo form


class FillEntryOut(BaseModel):
    field: str
    label: str
    value: str
    source: str
    status: str  # "filled" | "blocked" | "needs_input"
    reason: str = ""


class FillPlanOut(BaseModel):
    entries: list[FillEntryOut]
    filled: int
    blocked: int
    needs_input: int


class AutomationActionOut(BaseModel):
    id: str
    kind: str
    job_id: Optional[str] = None
    status: str
    detail: str
    created_at: str


class ExecuteFillRequest(BaseModel):
    submit: bool = False  # click the final submit (needs submit_after_review scope)


class LiveFillResultOut(BaseModel):
    status: str
    filled: list[str]
    unknown_required: list[str]
    confirmation: str
    detail: str
    live: bool


class JobReportRequest(BaseModel):
    verdict: str  # "legit" | "dubious" | "scam"
    reason: str = ""


class AuthenticityOut(BaseModel):
    """Shared verdict for a job identity — hides individual voter ids."""

    key: str
    company: str
    title: str
    verdict: str
    employer_status: str
    employer_detail: str
    min_authenticity_score: int
    tally: dict  # {legit, dubious, scam}
    reasons: list[str]
    your_vote: Optional[str] = None
    last_checked_at: Optional[str] = None


class JobSearchRunRequest(BaseModel):
    role: str
    location: str = ""
    remote: Optional[bool] = None
    sources: Optional[list[str]] = None  # empty/None = all enabled sources


class SavedSearchCreate(BaseModel):
    role: str
    location: str = ""
    remote: Optional[bool] = None
    sources: list[str] = Field(default_factory=list)
    interval_minutes: int = 1440


class SavedSearchUpdate(BaseModel):
    active: bool


class AggregationOut(BaseModel):
    found: int
    ingested: int
    duplicates: int
    hidden: int
    sources: list[str]
    job_ids: list[str]  # newly-ingested only
    #: All jobs this search surfaced (new + already-present) — use this to show
    #: results, so a repeat search of an existing role isn't reported as empty.
    matched_job_ids: list[str] = Field(default_factory=list)
    drafts_prepared: int = 0  # if the draft_prep assistant is enabled


class PrepareDraftsRequest(BaseModel):
    min_fit: int = 70
    limit: int = 5


class PrepareDraftsOut(BaseModel):
    prepared: int
    application_ids: list[str]


class EmailImportOut(BaseModel):
    source: str  # detected board (linkedin/indeed/…)
    parsed: int  # postings found in the email
    result: AggregationOut  # what was ingested


class LinkedInImportRequest(BaseModel):
    # apply=false returns a draft to review; apply=true saves it to the profile.
    apply: bool = False


class LinkedInImportResponse(BaseModel):
    source: str  # "linkedin" | "mock" | "export"
    applied: bool
    profile: UserProfile


# --- Connected sessions + standing auto-apply ------------------------------
class ConnectSessionRequest(BaseModel):
    provider: str  # "linkedin" | "indeed" | ...
    # The Playwright storage_state JSON captured locally (cookies only, no
    # password). Sent over HTTPS and stored encrypted at rest.
    storage_state: str
    label: str = ""  # e.g. the account email, to recognize it later


class ConnectIntentRequest(BaseModel):
    provider: str


class ConnectSubmit(BaseModel):
    """Sent by the capture helper — the code authenticates, not a login token."""
    code: str
    storage_state: str
    label: str = ""


class BrowserSessionOut(BaseModel):
    provider: str
    label: str
    status: str
    created_at: str
    updated_at: str
    last_used_at: Optional[str] = None
    expires_at: Optional[str] = None


class AutoApplyCriteriaIn(BaseModel):
    title_keywords: list[str] = Field(default_factory=list)
    locations: list[str] = Field(default_factory=list)
    remote: Optional[bool] = None
    companies_allow: list[str] = Field(default_factory=list)
    companies_deny: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    min_fit_score: Optional[float] = None


class CreateGrantRequest(BaseModel):
    name: str = ""
    scope: str = "criteria"  # "jobs" | "criteria"
    job_ids: list[str] = Field(default_factory=list)
    criteria: AutoApplyCriteriaIn = Field(default_factory=AutoApplyCriteriaIn)
    require_verified: bool = True
    max_submits: int = 10
    daily_cap: int = 5
    expires_at: Optional[str] = None  # ISO datetime
    mode: str = "auto"  # "auto" | "assisted" (LinkedIn is always assisted)
    interval_minutes: int = 0  # 0 = manual; >0 = auto-run cadence


class UpdateGrantStatusRequest(BaseModel):
    status: str  # "active" | "paused" | "revoked"


class GrantOut(BaseModel):
    id: str
    name: str
    scope: str
    job_ids: list[str]
    criteria: AutoApplyCriteriaIn
    require_verified: bool
    max_submits: int
    daily_cap: int
    submits_used: int
    submitted_today: int
    remaining_total: int
    status: str
    mode: str
    interval_minutes: int
    expires_at: Optional[str] = None
    created_at: str
    last_run_at: Optional[str] = None


class QueueItemOut(BaseModel):
    job_id: str
    title: str
    company: str
    url: str
    provider: str
    grant_id: str
    fields: dict[str, str]
    resume_name: str = ""


class RunGrantRequest(BaseModel):
    dry_run: bool = False
    limit: Optional[int] = None


class JobOutcomeOut(BaseModel):
    job_id: str
    title: str
    company: str
    status: str
    detail: str = ""


class RunResultOut(BaseModel):
    grant_id: str
    dry_run: bool
    eligible: int
    attempted: int
    submitted: int
    remaining_total: int
    remaining_today: int
    grant_status: str
    outcomes: list[JobOutcomeOut]
    detail: str = ""


# --- Reminders (review checkpoint nudges) ----------------------------------
class ReminderPrefsOut(BaseModel):
    inapp_enabled: bool
    email_enabled: bool
    sms_enabled: bool
    push_enabled: bool
    phone: str
    push_subscription_count: int
    notify_on_apply: bool
    timezone: str
    quiet_hours_enabled: bool
    quiet_start: int
    quiet_end: int
    digest_enabled: bool
    digest_hour: int
    renewed_at: str
    review_due: bool
    vapid_public_key: str = ""  # for the browser to subscribe to push


class ReminderPrefsUpdate(BaseModel):
    inapp_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    sms_enabled: Optional[bool] = None
    push_enabled: Optional[bool] = None
    phone: Optional[str] = None
    notify_on_apply: Optional[bool] = None
    timezone: Optional[str] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_start: Optional[int] = Field(default=None, ge=0, le=23)
    quiet_end: Optional[int] = Field(default=None, ge=0, le=23)
    digest_enabled: Optional[bool] = None
    digest_hour: Optional[int] = Field(default=None, ge=0, le=23)


class PushSubscribeRequest(BaseModel):
    subscription: dict  # raw browser PushSubscription JSON {endpoint, keys:{...}}


class ReminderTestOut(BaseModel):
    channels: dict[str, int]  # channel -> count sent
