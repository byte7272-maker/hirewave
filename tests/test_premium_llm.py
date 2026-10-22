"""Premium LLM tier — high-value generative work routes to the premium provider
while critique/summaries stay on the general (cheap) provider; disabled by default."""

from __future__ import annotations

from jobsearch.config import Settings
from jobsearch.engines.resume_assistant import ResumeAssistant
from jobsearch.llm import build_llm, build_premium_llm
from jobsearch.llm.base import LLMProvider
from jobsearch.models import Resume, ResumeSource


class _RecordingLLM(LLMProvider):
    """Records how many times it was asked to complete, and returns a canned reply."""

    def __init__(self, name: str, reply: str = "[]") -> None:
        self.name = name
        self.calls = 0
        self._reply = reply

    def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500) -> str:
        self.calls += 1
        return self._reply


def _resume(text: str) -> Resume:
    return Resume(user_id="u1", source=ResumeSource.UPLOADED, rendered_text=text)


# --- factory ---------------------------------------------------------------
def test_premium_disabled_falls_back_to_general():
    s = Settings(llm_provider="mock", premium_llm_provider="")
    assert build_premium_llm(s).name == build_llm(s).name == "mock"


def test_premium_mock_selected_when_set():
    s = Settings(llm_provider="mock", premium_llm_provider="mock")
    assert build_premium_llm(s).name == "mock"


def test_premium_openai_without_key_falls_back_safely():
    # premium=openai but no key configured → must not raise, falls back to general.
    s = Settings(llm_provider="mock", premium_llm_provider="openai", openai_api_key="")
    assert build_premium_llm(s).name == "mock"


# --- routing inside ResumeAssistant ----------------------------------------
def test_generative_work_uses_premium_not_the_review_llm():
    review = _RecordingLLM("review")
    premium = _RecordingLLM("premium", reply="A tighter, stronger resume.")
    ra = ResumeAssistant(llm=review, premium_llm=premium)

    ra.revise(_resume("Experience\n- Did things"), "make it more concise")

    assert premium.calls >= 1  # the rewrite went to the premium tier
    assert review.calls == 0   # the cheap/critique tier was not used for the rewrite


def test_review_summary_uses_the_general_llm_not_premium():
    review = _RecordingLLM("review", reply="Solid resume with clear impact.")
    premium = _RecordingLLM("premium")
    ra = ResumeAssistant(llm=review, premium_llm=premium)

    ra.review(_resume("Summary\nEngineer.\nExperience\n- Led billing migration cutting latency 40%"))

    assert review.calls >= 1   # the summary/critique went to the general tier
    assert premium.calls == 0  # premium was not spent on review


def test_premium_defaults_to_injected_llm_when_not_passed():
    # Back-compat: passing only `llm` (as existing code/tests do) drives BOTH tiers,
    # so nothing silently falls back to a configured provider.
    only = _RecordingLLM("only", reply="rewritten")
    ra = ResumeAssistant(llm=only)
    ra.revise(_resume("- Did things"), "tighten it")
    assert only.calls >= 1
