"""Domain data model — the entities from section 4 of the platform plan.

These are pure Pydantic models with no persistence concerns. A web/API layer
maps them to PostgreSQL / MongoDB rows; the engines operate on them directly.
"""

from jobsearch.models.application import Application, ApplicationStatus
from jobsearch.models.common import new_id, utcnow
from jobsearch.models.document import (
    CoverLetter,
    CoverLetterReview,
    CoverLetterRevision,
    CoverLetterSource,
    Resume,
    ResumeFormat,
    ResumeReview,
    ResumeRevision,
    ResumeSource,
    ResumeSuggestion,
)
from jobsearch.models.experience import (
    ExperienceHighlight,
    ExperienceKind,
    ExperienceSource,
)
from jobsearch.models.authenticity import (
    EmployerStatus,
    JobAuthenticityRecord,
    ReportVerdict,
    Verdict,
)
from jobsearch.models.automation_assist import (
    AUTOMATION_SCOPES,
    AutomationAction,
    AutomationConsent,
)
from jobsearch.models.auto_apply import (
    AutoApplyCriteria,
    AutoApplyGrant,
    BrowserSession,
    ConnectIntent,
)
from jobsearch.models.integration import OAuthToken, Provider
from jobsearch.models.interview import (
    AnswerFeedback,
    CommunityQuestion,
    CustomVoice,
    InterviewDifficulty,
    InterviewerPersona,
    InterviewerStyle,
    InterviewPrep,
    InterviewQuestion,
    InterviewTurn,
    MockInterviewSession,
    MockInterviewSummary,
    PersonaVoice,
    QuestionCategory,
    SessionStatus,
    VocabSuggestion,
    VocabularyAnalysis,
    VoiceSource,
)
from jobsearch.models.job import JobPosting, VerificationFlag, VerificationResult
from jobsearch.models.monitoring import (
    ExposureFinding,
    IdentifierType,
    MonitoredIdentifier,
    Severity,
)
from jobsearch.models.board import Board, BoardMember, BoardPost, member_key
from jobsearch.models.inbox import InboxMessage
from jobsearch.models.notification import Notification, NotificationType
from jobsearch.models.onboarding import OnboardingProgress
from jobsearch.models.screener import ScreenerAnswer
from jobsearch.models.practice import PracticeSession, PracticeSignal, PracticeStatus
from jobsearch.models.reminders import ReminderPrefs
from jobsearch.models.saved_search import SavedSearch
from jobsearch.models.social import (
    Connection,
    DirectMessage,
    Invite,
    InviteStatus,
    pair_key,
)
from jobsearch.models.user import JobPreferences, User, UserProfile

__all__ = [
    "AUTOMATION_SCOPES",
    "Application",
    "ApplicationStatus",
    "AnswerFeedback",
    "AutoApplyCriteria",
    "AutoApplyGrant",
    "AutomationAction",
    "AutomationConsent",
    "BrowserSession",
    "ConnectIntent",
    "Board",
    "BoardMember",
    "BoardPost",
    "CommunityQuestion",
    "CoverLetter",
    "CoverLetterReview",
    "CoverLetterRevision",
    "CoverLetterSource",
    "Connection",
    "CustomVoice",
    "DirectMessage",
    "EmployerStatus",
    "ExperienceHighlight",
    "ExperienceKind",
    "ExperienceSource",
    "InboxMessage",
    "Invite",
    "InviteStatus",
    "JobAuthenticityRecord",
    "ReportVerdict",
    "Verdict",
    "member_key",
    "pair_key",
    "ExposureFinding",
    "IdentifierType",
    "InterviewDifficulty",
    "InterviewPrep",
    "InterviewQuestion",
    "InterviewTurn",
    "InterviewerPersona",
    "InterviewerStyle",
    "JobPosting",
    "JobPreferences",
    "MockInterviewSession",
    "MockInterviewSummary",
    "MonitoredIdentifier",
    "Notification",
    "NotificationType",
    "OnboardingProgress",
    "PracticeSession",
    "PracticeSignal",
    "PracticeStatus",
    "ReminderPrefs",
    "SavedSearch",
    "OAuthToken",
    "Provider",
    "QuestionCategory",
    "PersonaVoice",
    "Resume",
    "SessionStatus",
    "Severity",
    "VocabSuggestion",
    "VocabularyAnalysis",
    "VoiceSource",
    "ResumeFormat",
    "ResumeReview",
    "ResumeRevision",
    "ResumeSource",
    "ResumeSuggestion",
    "ScreenerAnswer",
    "User",
    "UserProfile",
    "VerificationFlag",
    "VerificationResult",
    "new_id",
    "utcnow",
]
