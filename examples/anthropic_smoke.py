"""Live smoke test for real Claude-powered generation.

Generates one tailored resume + cover letter with the **real** Anthropic
provider and prints them, so you can eyeball actual Claude output vs. the mock.

Requires credentials — either set ``ANTHROPIC_API_KEY`` in the environment, or
run ``ant auth login``. Then:

    JOBSEARCH_LLM_PROVIDER=anthropic  python examples/anthropic_smoke.py

It exits with a clear message (not a stack trace) if no credentials are found.
"""

from __future__ import annotations

import os
import sys

from jobsearch.engines.generation import GenerationEngine, Tone
from jobsearch.llm.providers import AnthropicLLMProvider
from jobsearch.models import JobPosting, UserProfile
from jobsearch.models.user import JobPreferences, SalaryRange, WorkExperience


def _has_credentials() -> bool:
    if os.getenv("ANTHROPIC_API_KEY"):
        return True
    # ant profile on disk (Linux/macOS default and Windows APPDATA)
    candidates = [
        os.path.expanduser("~/.config/anthropic/credentials"),
        os.path.join(os.getenv("APPDATA", ""), "Anthropic", "credentials"),
    ]
    return any(os.path.isdir(p) and os.listdir(p) for p in candidates if p)


def main() -> int:
    if not _has_credentials():
        print(
            "No Anthropic credentials found.\n"
            "Set ANTHROPIC_API_KEY (or run `ant auth login`) and re-run:\n"
            "    JOBSEARCH_LLM_PROVIDER=anthropic python examples/anthropic_smoke.py",
            file=sys.stderr,
        )
        return 1

    model = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")
    engine = GenerationEngine(llm=AnthropicLLMProvider(model=model))
    print(f"Using real Anthropic model: {model}\n")

    profile = UserProfile(
        user_id="usr_demo",
        headline="Senior Backend Engineer",
        summary="8 years building Python microservices at scale.",
        skills=["Python", "FastAPI", "PostgreSQL", "Docker", "Kubernetes", "AWS", "Redis"],
        work_experience=[
            WorkExperience(
                company="Acme Corp",
                title="Senior Backend Engineer",
                start="2019",
                end="present",
                highlights=[
                    "Built a payments microservice handling 2k req/s on FastAPI",
                    "Cut p95 latency 40% via Redis caching and query tuning",
                ],
            )
        ],
        preferences=JobPreferences(
            salary_range=SalaryRange(minimum=160_000, maximum=210_000),
            remote_ok=True,
            target_roles=["Backend Engineer"],
            seniority="senior",
        ),
    )
    job = JobPosting(
        source_platform="linkedin",
        title="Senior Backend Engineer",
        company="Globex",
        company_domain="globex.com",
        remote=True,
        description=(
            "Build Python microservices with FastAPI and PostgreSQL on AWS. Own "
            "services in Docker and Kubernetes, optimize Redis caching, design REST APIs."
        ),
        requirements=["Python", "FastAPI", "PostgreSQL", "AWS", "Kubernetes"],
    )

    resume = engine.generate_resume(profile, job, tone=Tone.PROFESSIONAL)
    cover = engine.generate_cover_letter(profile, job, resume=resume, tone=Tone.ENTHUSIASTIC)

    print("=== RESUME SUMMARY ===")
    print(resume.generated_content.summary)
    print(f"\nATS score: {resume.ats_score}%\n")
    print("=== COVER LETTER ===")
    print(cover.content)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
