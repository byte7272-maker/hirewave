"""Table specifications and the SQLAlchemy metadata.

One table per entity. Columns = the id attribute (primary key) + any promoted
indexed columns + a JSON ``data`` column with the full serialized model.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import JSON, Column, MetaData, String, Table

from jobsearch.models import (
    Application,
    AutoApplyGrant,
    AutomationAction,
    AutomationConsent,
    Board,
    BrowserSession,
    ConnectIntent,
    BoardMember,
    BoardPost,
    CommunityQuestion,
    Connection,
    CoverLetter,
    CustomVoice,
    DirectMessage,
    ExperienceHighlight,
    ExposureFinding,
    InboxMessage,
    Invite,
    JobAuthenticityRecord,
    JobPosting,
    MockInterviewSession,
    MonitoredIdentifier,
    Notification,
    OAuthToken,
    OnboardingProgress,
    PersonaVoice,
    PracticeSession,
    PracticeSignal,
    ReminderPrefs,
    Resume,
    SavedSearch,
    ScreenerAnswer,
    User,
    UserProfile,
)

metadata = MetaData()


@dataclass(frozen=True)
class TableSpec:
    name: str
    model: type
    id_attr: str = "id"
    #: Extra columns promoted out of the JSON for indexed equality queries.
    indexed: tuple[str, ...] = field(default_factory=tuple)
    table: Table = field(init=False, compare=False, default=None)  # type: ignore[assignment]


def _make_table(spec: TableSpec) -> Table:
    cols = [Column(spec.id_attr, String, primary_key=True)]
    for c in spec.indexed:
        if c != spec.id_attr:
            cols.append(Column(c, String, index=True))
    cols.append(Column("data", JSON, nullable=False))
    return Table(spec.name, metadata, *cols)


# The promoted columns are exactly the fields callers pass to `find(**equals)`.
_SPECS: dict[str, TableSpec] = {
    "users": TableSpec("users", User, "id", ("email", "inbox_token")),
    "profiles": TableSpec("profiles", UserProfile, "user_id", ()),
    "jobs": TableSpec("jobs", JobPosting, "id", ()),
    "resumes": TableSpec("resumes", Resume, "id", ("user_id",)),
    "cover_letters": TableSpec("cover_letters", CoverLetter, "id", ("user_id",)),
    "applications": TableSpec("applications", Application, "id", ("user_id",)),
    "notifications": TableSpec("notifications", Notification, "id", ("user_id",)),
    "oauth_tokens": TableSpec("oauth_tokens", OAuthToken, "id", ("user_id", "provider")),
    "mock_interviews": TableSpec("mock_interviews", MockInterviewSession, "id", ("user_id",)),
    "monitored_identifiers": TableSpec(
        "monitored_identifiers", MonitoredIdentifier, "id", ("user_id", "value_hash")
    ),
    "exposure_findings": TableSpec(
        "exposure_findings", ExposureFinding, "id", ("user_id", "identifier_id")
    ),
    "community_questions": TableSpec(
        "community_questions", CommunityQuestion, "id", ("user_id", "job_title_key")
    ),
    "experience_highlights": TableSpec(
        "experience_highlights", ExperienceHighlight, "id", ("user_id",)
    ),
    "persona_voices": TableSpec(
        "persona_voices", PersonaVoice, "id", ("user_id", "persona_id")
    ),
    "custom_voices": TableSpec("custom_voices", CustomVoice, "id", ("user_id",)),
    "onboarding": TableSpec("onboarding", OnboardingProgress, "user_id", ()),
    "screener_answers": TableSpec("screener_answers", ScreenerAnswer, "id", ("user_id", "question_key")),
    "saved_searches": TableSpec("saved_searches", SavedSearch, "id", ("user_id",)),
    "authenticity_records": TableSpec("authenticity_records", JobAuthenticityRecord, "id", ("key",)),
    "inbox_messages": TableSpec("inbox_messages", InboxMessage, "id", ("user_id",)),
    "invites": TableSpec("invites", Invite, "id", ("from_user_id", "code")),
    "connections": TableSpec("connections", Connection, "id", ("key",)),
    "direct_messages": TableSpec("direct_messages", DirectMessage, "id", ("thread_key",)),
    "boards": TableSpec("boards", Board, "id", ("join_code",)),
    "board_members": TableSpec("board_members", BoardMember, "id", ("board_id", "user_id", "key")),
    "board_posts": TableSpec("board_posts", BoardPost, "id", ("board_id",)),
    "automation_consents": TableSpec("automation_consents", AutomationConsent, "user_id", ()),
    "automation_actions": TableSpec("automation_actions", AutomationAction, "id", ("user_id",)),
    "practice_sessions": TableSpec("practice_sessions", PracticeSession, "id", ()),
    "practice_signals": TableSpec("practice_signals", PracticeSignal, "id", ("session_id",)),
    "browser_sessions": TableSpec("browser_sessions", BrowserSession, "id", ("user_id", "provider")),
    "connect_intents": TableSpec("connect_intents", ConnectIntent, "id", ("code", "user_id")),
    "auto_apply_grants": TableSpec("auto_apply_grants", AutoApplyGrant, "id", ("user_id",)),
    "reminder_prefs": TableSpec("reminder_prefs", ReminderPrefs, "user_id", ()),
}

# Build the Table objects once and attach them to their specs.
SPECS: dict[str, TableSpec] = {}
for _key, _spec in _SPECS.items():
    _table = _make_table(_spec)
    object.__setattr__(_spec, "table", _table)
    SPECS[_key] = _spec
