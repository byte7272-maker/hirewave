"""Assemble the repository bundle — in-memory or SQL — from configuration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from jobsearch.config import Settings, get_settings
from jobsearch.models import (
    Application,
    AutoApplyGrant,
    AutomationAction,
    AutomationConsent,
    Board,
    BrowserSession,
    BoardMember,
    BoardPost,
    CommunityQuestion,
    Connection,
    CoverLetter,
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
    PersonaVoice,
    PracticeSession,
    PracticeSignal,
    ReminderPrefs,
    Resume,
    SavedSearch,
    User,
    UserProfile,
)
from jobsearch.persistence.engine import build_engine, create_schema
from jobsearch.persistence.sql_repository import SqlRepository
from jobsearch.persistence.tables import SPECS
from jobsearch.security.crypto import FieldCipher
from jobsearch.store import InMemoryRepository, Repository, SessionStore, TokenStore


@dataclass
class Repositories:
    """Every repository the API state needs, plus the encrypted token store."""

    users: Repository[User]
    profiles: Repository[UserProfile]
    jobs: Repository[JobPosting]
    resumes: Repository[Resume]
    cover_letters: Repository[CoverLetter]
    applications: Repository[Application]
    notifications: Repository[Notification]
    mock_interviews: Repository[MockInterviewSession]
    monitored_identifiers: Repository[MonitoredIdentifier]
    exposure_findings: Repository[ExposureFinding]
    community_questions: Repository[CommunityQuestion]
    experience_highlights: Repository[ExperienceHighlight]
    persona_voices: Repository[PersonaVoice]
    saved_searches: Repository[SavedSearch]
    authenticity_records: Repository[JobAuthenticityRecord]
    inbox_messages: Repository[InboxMessage]
    invites: Repository[Invite]
    connections: Repository[Connection]
    direct_messages: Repository[DirectMessage]
    boards: Repository[Board]
    board_members: Repository[BoardMember]
    board_posts: Repository[BoardPost]
    automation_consents: Repository[AutomationConsent]
    automation_actions: Repository[AutomationAction]
    practice_sessions: Repository[PracticeSession]
    practice_signals: Repository[PracticeSignal]
    auto_apply_grants: Repository[AutoApplyGrant]
    reminder_prefs: Repository[ReminderPrefs]
    token_store: TokenStore
    session_store: SessionStore
    backend: str = "memory"


def build_repositories(
    settings: Optional[Settings] = None, cipher: Optional[FieldCipher] = None
) -> Repositories:
    s = settings or get_settings()
    cipher = cipher or FieldCipher(s.encryption_key or None)

    if not s.database_url:
        return Repositories(
            users=InMemoryRepository(),
            profiles=InMemoryRepository(id_attr="user_id"),
            jobs=InMemoryRepository(),
            resumes=InMemoryRepository(),
            cover_letters=InMemoryRepository(),
            applications=InMemoryRepository(),
            notifications=InMemoryRepository(),
            mock_interviews=InMemoryRepository(),
            monitored_identifiers=InMemoryRepository(),
            exposure_findings=InMemoryRepository(),
            community_questions=InMemoryRepository(),
            experience_highlights=InMemoryRepository(),
            persona_voices=InMemoryRepository(),
            saved_searches=InMemoryRepository(),
            authenticity_records=InMemoryRepository(),
            inbox_messages=InMemoryRepository(),
            invites=InMemoryRepository(),
            connections=InMemoryRepository(),
            direct_messages=InMemoryRepository(),
            boards=InMemoryRepository(),
            board_members=InMemoryRepository(),
            board_posts=InMemoryRepository(),
            automation_consents=InMemoryRepository(id_attr="user_id"),
            automation_actions=InMemoryRepository(),
            practice_sessions=InMemoryRepository(),
            practice_signals=InMemoryRepository(),
            auto_apply_grants=InMemoryRepository(),
            reminder_prefs=InMemoryRepository(id_attr="user_id"),
            token_store=TokenStore(cipher),
            session_store=SessionStore(cipher),
            backend="memory",
        )

    engine = build_engine(s.database_url)
    create_schema(engine)

    def repo(key: str):
        return SqlRepository(engine, SPECS[key])

    oauth_repo: SqlRepository[OAuthToken] = repo("oauth_tokens")
    return Repositories(
        users=repo("users"),
        profiles=repo("profiles"),
        jobs=repo("jobs"),
        resumes=repo("resumes"),
        cover_letters=repo("cover_letters"),
        applications=repo("applications"),
        notifications=repo("notifications"),
        mock_interviews=repo("mock_interviews"),
        monitored_identifiers=repo("monitored_identifiers"),
        exposure_findings=repo("exposure_findings"),
        community_questions=repo("community_questions"),
        experience_highlights=repo("experience_highlights"),
        persona_voices=repo("persona_voices"),
        saved_searches=repo("saved_searches"),
        authenticity_records=repo("authenticity_records"),
        inbox_messages=repo("inbox_messages"),
        invites=repo("invites"),
        connections=repo("connections"),
        direct_messages=repo("direct_messages"),
        boards=repo("boards"),
        board_members=repo("board_members"),
        board_posts=repo("board_posts"),
        automation_consents=repo("automation_consents"),
        automation_actions=repo("automation_actions"),
        practice_sessions=repo("practice_sessions"),
        practice_signals=repo("practice_signals"),
        auto_apply_grants=repo("auto_apply_grants"),
        reminder_prefs=repo("reminder_prefs"),
        token_store=TokenStore(cipher, repo=oauth_repo),
        session_store=SessionStore(cipher, repo=repo("browser_sessions")),
        backend=engine.dialect.name,
    )
