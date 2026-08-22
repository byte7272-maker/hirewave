"""Application state: repositories + the wired engines.

This is the single object every request handler reads from. Repositories come
from :func:`jobsearch.persistence.build_repositories` — in-memory by default,
SQL (SQLite/PostgreSQL) when ``JOBSEARCH_DATABASE_URL`` is set — with an
identical method surface, so no handler code changes between the two.
"""

from __future__ import annotations

from typing import Optional

from jobsearch.config import Settings, get_settings
from jobsearch.engines.automation import AutomationEngine
from jobsearch.engines.generation import GenerationEngine
from jobsearch.engines.interview import (
    CommunityQuestionEngine,
    InterviewEngine,
    MockInterviewTrainer,
    PersonaLibrary,
    QuestionBank,
    VocabularyAnalyzer,
    build_avatar_provider,
    build_speech_provider,
)
from jobsearch.engines.integration import (
    HttpxTokenExchanger,
    IntegrationEngine,
    MockTokenExchanger,
    TokenExchanger,
    build_linkedin_provider,
)
from jobsearch.engines.assistant import AssistantEngine, AutoApplyEngine, DraftPrepEngine
from jobsearch.engines.authenticity import JobAuthenticityEngine, build_employer_verifier
from jobsearch.engines.boards import BoardsEngine
from jobsearch.engines.email_sender import build_email_sender
from jobsearch.engines.gmail_fetch import build_gmail_fetcher
from jobsearch.engines.inbox import InboxEngine
from jobsearch.engines.practice import PracticeEngine
from jobsearch.engines.reminders import ReminderEngine
from jobsearch.engines.social import SocialEngine
from jobsearch.engines.sourcing import (
    JobAggregator,
    SavedSearchEngine,
    build_job_sources,
)
from jobsearch.api.firebase_auth import build_firebase_verifier
from jobsearch.engines.matching import MatchingEngine
from jobsearch.engines.monitoring import MonitoringEngine
from jobsearch.engines.verification import VerificationEngine
from jobsearch.llm import build_embedder, build_llm
from jobsearch.models import User, VerificationResult
from jobsearch.persistence import build_repositories
from jobsearch.security.crypto import FieldCipher
from jobsearch.storage import build_document_store


class PendingAuth:
    """Short-lived store of in-flight OAuth authorizations, keyed by ``state``."""

    def __init__(self) -> None:
        self._items: dict[str, dict] = {}

    def put(self, state: str, *, user_id: str, provider: str, code_verifier: str) -> None:
        self._items[state] = {
            "user_id": user_id,
            "provider": provider,
            "code_verifier": code_verifier,
        }

    def pop(self, state: str) -> Optional[dict]:
        return self._items.pop(state, None)


class AppState:
    def __init__(
        self,
        *,
        settings: Optional[Settings] = None,
        exchanger: Optional[TokenExchanger] = None,
    ) -> None:
        self.settings = settings or get_settings()
        cipher = FieldCipher(self.settings.encryption_key or None)

        # Repositories — in-memory by default, SQL when JOBSEARCH_DATABASE_URL is set.
        repos = build_repositories(self.settings, cipher)
        self.backend = repos.backend
        self.users = repos.users
        self.profiles = repos.profiles
        self.jobs = repos.jobs
        self.resumes = repos.resumes
        self.cover_letters = repos.cover_letters
        self.applications = repos.applications
        self.notifications = repos.notifications
        self.mock_interviews = repos.mock_interviews
        self.monitored_identifiers = repos.monitored_identifiers
        self.exposure_findings = repos.exposure_findings
        self.community_questions = repos.community_questions
        self.documents = build_document_store(self.settings)  # uploaded résumé files
        # VerificationResults are a rebuildable cache (the plan's Redis tier), not
        # a system of record — verification is recomputed on demand when missing.
        self.verifications: dict[str, VerificationResult] = {}

        # Auth bookkeeping.
        self.revoked_jti: set[str] = set()
        self.pending_auth = PendingAuth()
        # Firebase sign-in verifier (mock offline; live verifies real ID tokens).
        self.firebase_verifier = build_firebase_verifier(self.settings)

        # Engines (share providers where sensible).
        llm = build_llm(self.settings)
        embedder = build_embedder(self.settings)
        # Real OAuth token exchange in live mode; mock offline. An explicitly
        # injected exchanger (e.g. in tests) always wins.
        if exchanger is None:
            exchanger = (
                HttpxTokenExchanger()
                if self.settings.oauth_mode == "live"
                else MockTokenExchanger()
            )
        self.integration = IntegrationEngine(
            token_store=repos.token_store, exchanger=exchanger, settings=self.settings
        )
        self.linkedin_provider = build_linkedin_provider(self.settings)
        self.generation = GenerationEngine(llm=llm)
        self.interview = InterviewEngine(llm=llm)
        # Interview media (voice/video) + user-directed content sources.
        self.persona_library = PersonaLibrary.from_settings(self.settings)
        self.question_bank = QuestionBank.from_settings(self.settings)
        self.speech = build_speech_provider(self.settings)
        self.avatar_video = build_avatar_provider(self.settings)
        self.mock_trainer = MockInterviewTrainer(
            llm=llm, persona_library=self.persona_library, question_bank=self.question_bank
        )
        # Vocabulary analysis for recorded / live-transcribed spoken answers.
        self.vocabulary = VocabularyAnalyzer(llm=llm)
        self.community = CommunityQuestionEngine(repo=repos.community_questions)
        self.matching = MatchingEngine(embedder=embedder)
        self.verification = VerificationEngine()
        # Multi-site job sourcing agent: fan out → normalize → dedupe → verify → ingest.
        self.saved_searches_repo = repos.saved_searches
        self.job_sources = build_job_sources(self.settings)
        self.aggregator = JobAggregator(
            self.job_sources, self.jobs, self.verification, self.verifications
        )
        self.saved_search = SavedSearchEngine(
            repo=repos.saved_searches,
            aggregator=self.aggregator,
            matching=self.matching,
            profiles=self.profiles,
            notifier=self.notifications.add,
        )
        # Shared job-authenticity ledger (real vs dubious vs scam) + employer check.
        self.authenticity = JobAuthenticityEngine(
            repo=repos.authenticity_records,
            verifier=build_employer_verifier(self.settings),
        )
        # In-app inbox (forward job alerts) + peer messaging/sharing.
        self.inbox = InboxEngine(
            users=repos.users,
            messages=repos.inbox_messages,
            aggregator=self.aggregator,
            notifier=self.notifications.add,
            domain=self.settings.inbox_domain,
        )
        self.gmail_fetcher = build_gmail_fetcher(self.settings)
        self.social = SocialEngine(
            invites=repos.invites,
            connections=repos.connections,
            messages=repos.direct_messages,
            users=repos.users,
            notifier=self.notifications.add,
            email_sender=build_email_sender(self.settings),
            base_url=self.settings.app_base_url,
        )
        self.practice = PracticeEngine(
            sessions=repos.practice_sessions,
            signals=repos.practice_signals,
            social=self.social,
            users=repos.users,
            interview=self.interview,
            notifier=self.notifications.add,
        )
        self.boards = BoardsEngine(
            boards=repos.boards,
            members=repos.board_members,
            posts=repos.board_posts,
            users=repos.users,
            jobs=self.jobs,
            notifier=self.notifications.add,
        )
        # Permissioned automation assistant (consent-gated auto form-fill + audit).
        self.assistant = AssistantEngine(
            consent=repos.automation_consents,
            actions=repos.automation_actions,
        )
        # Connected provider sessions (cookies, encrypted) + standing auto-apply.
        self.sessions = repos.session_store
        self.auto_apply_grants = repos.auto_apply_grants
        self.auto_apply = AutoApplyEngine(
            assistant=self.assistant,
            sessions=repos.session_store,
            grants=repos.auto_apply_grants,
            users=repos.users,
            profiles=repos.profiles,
            jobs=repos.jobs,
            resumes=repos.resumes,
            cover_letters=repos.cover_letters,
            applications=repos.applications,
            documents=self.documents,
            settings=self.settings,
            notifier=self.notifications.add,
        )
        self.draft_prep = DraftPrepEngine(
            generation=self.generation,
            matching=self.matching,
            jobs=self.jobs,
            profiles=self.profiles,
            resumes=self.resumes,
            cover_letters=self.cover_letters,
            applications=self.applications,
            verifications=self.verifications,
            notifier=self.notifications.add,
            recorder=self.assistant.record,
        )
        self.automation = AutomationEngine(
            settings=self.settings, notifier=self.notifications.add
        )
        # Out-of-band reminders (SMS / web push / email) for the review checkpoint
        # and automation events, with quiet hours + a daily digest.
        self.reminders = ReminderEngine(
            prefs=repos.reminder_prefs,
            users=repos.users,
            settings=self.settings,
            email=build_email_sender(self.settings),
            notifier=self.notifications.add,
            digest_source=self._build_digest_summary,
        )
        # Route auto-apply submissions through the reminder channels too.
        self.auto_apply.event_notifier = self.reminders.notify_applied
        self.monitoring = MonitoringEngine(
            identifiers=repos.monitored_identifiers,
            findings=repos.exposure_findings,
            cipher=cipher,
            notifier=self.notifications.add,
            settings=self.settings,
        )

    def _build_digest_summary(self, user_id: str) -> dict:
        """Data for a user's daily digest — recent auto-applies, the apply queue,
        and whether a session review is due."""
        from datetime import timedelta

        from jobsearch.models import ApplicationStatus
        from jobsearch.models.common import utcnow

        cutoff = utcnow() - timedelta(hours=24)
        submitted_24h = sum(
            1
            for a in self.applications.find(user_id=user_id)
            if a.status == ApplicationStatus.SUBMITTED
            and a.submitted_at is not None
            and a.submitted_at >= cutoff
            and a.platform_response.get("auto_apply")
        )
        try:
            queued = len(self.auto_apply.queue(user_id))
        except Exception:  # noqa: BLE001
            queued = 0
        review_due = self.reminders.review_due(self.reminders.get_prefs(user_id))
        return {"submitted_24h": submitted_24h, "queued": queued, "review_due": review_due}

    # -- convenience lookups ------------------------------------------------
    def user_by_email(self, email: str) -> Optional[User]:
        matches = self.users.find(email=email.lower())
        return matches[0] if matches else None

    def profile_for(self, user_id: str) -> Optional[UserProfile]:
        return self.profiles.get(user_id)
