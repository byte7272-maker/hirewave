"""Request/response DTOs for the API (kept separate from domain models)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from jobsearch.engines.generation import Tone
from jobsearch.models import ApplicationStatus, ResumeFormat
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
    category: str = ""  # broad category (Engineering, Data & Analytics, …)


# --- documents --------------------------------------------------------------
class ResumeGenerateRequest(BaseModel):
    job_posting_id: str
    tone: Tone = Tone.PROFESSIONAL
    format: ResumeFormat = ResumeFormat.MARKDOWN


class ResumeUpdate(BaseModel):
    rendered_text: Optional[str] = None
    target_role: Optional[str] = None
    approved: Optional[bool] = None


class ResumeReviewRequest(BaseModel):
    job_posting_id: Optional[str] = None  # tailor the review to a target job


class ResumeReviseRequest(BaseModel):
    #: What to change, in plain language ("make it more concise", "emphasise
    #: leadership", "tailor to a product manager role").
    instruction: str
    job_posting_id: Optional[str] = None


class CoverLetterGenerateRequest(BaseModel):
    job_posting_id: str
    resume_id: Optional[str] = None
    tone: Tone = Tone.PROFESSIONAL


class CoverLetterUpdate(BaseModel):
    content: Optional[str] = None
    approved: Optional[bool] = None


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
