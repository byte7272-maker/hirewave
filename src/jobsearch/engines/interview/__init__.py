"""Interview prep + a conversational mock interview trainer."""

from jobsearch.engines.interview.community import CommunityQuestionEngine, normalize_title
from jobsearch.engines.interview.engine import InterviewEngine
from jobsearch.engines.interview.media import (
    AvatarVideoProvider,
    ElevenLabsSpeechProvider,
    HttpAvatarVideoProvider,
    HttpSpeechProvider,
    NullAvatarVideoProvider,
    NullSpeechProvider,
    OpenAISpeechProvider,
    SpeechProvider,
    build_avatar_provider,
    build_speech_provider,
)
from jobsearch.engines.interview.voice_clone import (
    ClonedVoiceResult,
    MockVoiceCloneProvider,
    NullVoiceCloneProvider,
    VoiceCloneProvider,
    build_voice_clone_provider,
)
from jobsearch.engines.interview.mock_interview import MockInterviewTrainer
from jobsearch.engines.interview.persona_library import PersonaLibrary
from jobsearch.engines.interview.question_bank import QuestionBank
from jobsearch.engines.interview.rating import rate_answer
from jobsearch.engines.interview.vocabulary import VocabularyAnalyzer

__all__ = [
    "AvatarVideoProvider",
    "ClonedVoiceResult",
    "CommunityQuestionEngine",
    "VocabularyAnalyzer",
    "ElevenLabsSpeechProvider",
    "HttpAvatarVideoProvider",
    "HttpSpeechProvider",
    "InterviewEngine",
    "MockVoiceCloneProvider",
    "normalize_title",
    "MockInterviewTrainer",
    "NullAvatarVideoProvider",
    "NullSpeechProvider",
    "NullVoiceCloneProvider",
    "OpenAISpeechProvider",
    "PersonaLibrary",
    "QuestionBank",
    "SpeechProvider",
    "VoiceCloneProvider",
    "build_avatar_provider",
    "build_speech_provider",
    "build_voice_clone_provider",
    "rate_answer",
]
