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
    DocumentVersion,
    Resume,
    ResumeFormat,
    QualityRating,
    ResumeReview,
    ResumeRevision,
    ResumeSource,
    ResumeSuggestion,
    StoredDocument,
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
    WorkerHeartbeat,
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
from jobsearch.models.job import JobPosting, SavedJob, VerificationFlag, VerificationResult
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
from jobsearch.models.cover_letter_schema import CoverLetterData
from jobsearch.models.resume_template import (
    BUILTIN_TEMPLATES,
    TEMPLATE_CATEGORIES,
    ResumeTemplate,
    ResumeTemplateStyle,
)
from jobsearch.models.resume_schema import (
    ResumeBasics,
    ResumeData,
    ResumeEducation,
    ResumeSkill,
    ResumeWork,
)
from jobsearch.models.screener import ScreenerAnswer
from jobsearch.models.signup import SignupInvite
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
from jobsearch.models.user import (
    JobPreferences,
    NarrationPrefs,
    RecentSearch,
    RecentView,
    User,
    UserProfile,
)

__all__ = [
    "AUTOMATION_SCOPES",
    "Application",
    "ApplicationStatus",
    "AnswerFeedback",
    "AutoApplyCriteria",
    "AutoApplyGrant",
    "WorkerHeartbeat",
    "AutomationAction",
    "AutomationConsent",
    "BrowserSession",
    "ConnectIntent",
    "Board",
    "BoardMember",
    "BoardPost",
    "CommunityQuestion",
    "CoverLetter",
    "CoverLetterData",
    "CoverLetterReview",
    "CoverLetterRevision",
    "CoverLetterSource",
    "Connection",
    "CustomVoice",
    "DirectMessage",
    "DocumentVersion",
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
    "SavedJob",
    "JobPreferences",
    "NarrationPrefs",
    "MockInterviewSession",
    "MockInterviewSummary",
    "MonitoredIdentifier",
    "Notification",
    "NotificationType",
    "OnboardingProgress",
    "PracticeSession",
    "PracticeSignal",
    "PracticeStatus",
    "QualityRating",
    "RecentSearch",
    "RecentView",
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
    "ResumeBasics",
    "ResumeData",
    "ResumeEducation",
    "ResumeSkill",
    "ResumeWork",
    "ResumeTemplate",
    "ResumeTemplateStyle",
    "BUILTIN_TEMPLATES",
    "TEMPLATE_CATEGORIES",
    "StoredDocument",
    "ScreenerAnswer",
    "SignupInvite",
    "User",
    "UserProfile",
    "VerificationFlag",
    "VerificationResult",
    "new_id",
    "utcnow",
]
