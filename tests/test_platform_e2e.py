"""End-to-end: connect -> ingest -> verify -> match -> generate -> submit."""

from jobsearch.engines.automation import ApplicationContext
from jobsearch.engines.matching.feedback import FeedbackSignal
from jobsearch.models import Application, Provider
from jobsearch.platform import JobSearchPlatform


def test_full_pipeline(profile, matching_job, unrelated_job, scam_job):
    platform = JobSearchPlatform()

    # 1. User connects an integration (mock exchanger by default).
    platform.integration.complete_authorization(profile.user_id, Provider.LINKEDIN, code="c")
    assert platform.integration.get_access_token(profile.user_id, Provider.LINKEDIN)

    # 2. Verify postings; the scam is hidden, legit ones pass.
    jobs = [matching_job, unrelated_job, scam_job]
    verdicts = {j.id: platform.verification.verify(j) for j in jobs}
    assert verdicts[scam_job.id].display_action == "hidden"
    visible = [j for j in jobs if verdicts[j.id].display_action != "hidden"]

    # 3. Rank visible jobs; the matching job leads.
    ranked = platform.matching.rank(profile, visible)
    top = ranked[0]
    assert top.job.id == matching_job.id

    # 4. Generate + approve documents for the top match.
    resume = platform.generation.generate_resume(profile, top.job)
    cover = platform.generation.generate_cover_letter(profile, top.job, resume=resume)
    platform.generation.approve(resume)
    platform.generation.approve(cover)

    # 5. Submit via automation (simulate mode).
    app = Application(user_id=profile.user_id, job_posting_id=top.job.id, resume_id=resume.id)
    result = platform.automation.submit(
        ApplicationContext(
            application=app, job=top.job, resume=resume, cover_letter=cover, profile=profile
        )
    )
    assert result.success

    # 6. Feedback loop learns from the apply signal.
    platform.matching.record_feedback(profile, top, FeedbackSignal.APPLY)

    health = platform.health()
    assert health["llm_provider"] == "mock"
    assert health["automation_mode"] == "simulate"
