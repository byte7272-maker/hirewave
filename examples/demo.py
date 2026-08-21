"""End-to-end demo of the five engines — runs fully offline (mock providers).

    python examples/demo.py

Walks a single candidate from integration through submission, printing what each
engine produces. Set JOBSEARCH_LLM_PROVIDER=anthropic and ANTHROPIC_API_KEY to
see real Claude-generated documents instead of the templated mock output.
"""

from __future__ import annotations

from jobsearch.engines.automation import ApplicationContext
from jobsearch.engines.matching.feedback import FeedbackSignal
from jobsearch.models import Application, JobPosting, Provider, User, UserProfile
from jobsearch.models.user import JobPreferences, SalaryRange, WorkExperience
from jobsearch.platform import JobSearchPlatform


def build_profile() -> UserProfile:
    user = User(email="sam@example.com", full_name="Sam Dev", location="New York, NY")
    return UserProfile(
        user_id=user.id,
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
                    "Cut p95 latency 40% via Redis caching",
                ],
            )
        ],
        preferences=JobPreferences(
            salary_range=SalaryRange(minimum=150_000, maximum=200_000),
            remote_ok=True,
            target_roles=["Backend Engineer"],
            target_locations=["Remote", "New York"],
            seniority="senior",
        ),
    )


def sample_jobs() -> list[JobPosting]:
    return [
        JobPosting(
            source_platform="linkedin",
            title="Senior Backend Engineer",
            company="Globex",
            company_domain="globex.com",
            location="Remote",
            remote=True,
            description=(
                "Build Python microservices with FastAPI and PostgreSQL on AWS. "
                "Own services in Docker and Kubernetes; optimize Redis caching. 6+ years."
            ),
            requirements=["Python", "FastAPI", "PostgreSQL", "AWS", "Kubernetes"],
            salary_range=SalaryRange(minimum=160_000, maximum=210_000),
            url="https://linkedin.com/jobs/1",
        ),
        JobPosting(
            source_platform="unknown_board",
            title="Work From Home Data Entry",
            company="QuickCash LLC",
            location="Remote",
            remote=True,
            description=(
                "URGENT! Apply now! Immediate start! No experience needed. "
                "Guaranteed income — earn $5000 a week! Contact us on WhatsApp!"
            ),
            url="http://sketchy.example/2",
        ),
    ]


def main() -> None:
    platform = JobSearchPlatform()
    print("Platform health:", platform.health(), "\n")

    profile = build_profile()

    # 1) Integration
    platform.integration.complete_authorization(profile.user_id, Provider.LINKEDIN, code="demo")
    print("Connected integrations:", platform.integration.list_connections(profile.user_id), "\n")

    # 2) Verification
    jobs = sample_jobs()
    print("=== Authenticity verification ===")
    visible = []
    for job in jobs:
        v = platform.verification.verify(job)
        print(f"  {job.title:32s} score={v.authenticity_score:3d} -> {v.display_action}")
        if v.display_action != "hidden":
            visible.append(job)
    print()

    # 3) Matching
    print("=== Job matching ===")
    ranked = platform.matching.rank(profile, visible)
    for r in ranked:
        print(f"  {r.job.title:32s} match={r.score:5.1f}  skills={r.matching_skills}")
    top = ranked[0]
    print()

    # 4) Generation
    print("=== Document generation ===")
    resume = platform.generation.generate_resume(profile, top.job)
    cover = platform.generation.generate_cover_letter(profile, top.job, resume=resume)
    print(f"  Resume ATS score: {resume.ats_score}")
    print(f"  Summary: {resume.generated_content.summary}")
    print(f"  Cover letter (first line): {cover.content.splitlines()[0]}")
    print()

    # 5) Approval gate + automation
    platform.generation.approve(resume)
    platform.generation.approve(cover)
    app = Application(user_id=profile.user_id, job_posting_id=top.job.id, resume_id=resume.id)
    result = platform.automation.submit(
        ApplicationContext(
            application=app, job=top.job, resume=resume, cover_letter=cover, profile=profile
        )
    )
    print("=== Automation ===")
    print(f"  success={result.success} platform={result.platform} id={result.confirmation_id}")
    print(f"  audit trail: {[e['action'] for e in app.audit_trail]}")

    # 6) Feedback
    platform.matching.record_feedback(profile, top, FeedbackSignal.APPLY)
    print("\nDone.")


if __name__ == "__main__":
    main()
