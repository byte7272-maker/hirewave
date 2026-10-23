from jobsearch.engines.generation import GenerationEngine, Tone, extract_keywords


def test_extract_keywords_finds_tech_terms():
    kws = extract_keywords("Build Python microservices with FastAPI and PostgreSQL on AWS")
    assert "python" in kws
    assert "fastapi" in kws
    assert "postgresql" in kws


def test_generate_resume_is_tailored_and_scored(profile, matching_job):
    engine = GenerationEngine()  # mock LLM offline
    resume = engine.generate_resume(profile, matching_job, tone=Tone.PROFESSIONAL)

    assert resume.user_id == profile.user_id
    assert resume.job_posting_id == matching_job.id
    assert resume.generated_content.summary  # LLM produced a summary
    assert resume.rendered_text
    # High ATS coverage since the profile matches the job closely.
    assert resume.ats_score is not None and resume.ats_score >= 60
    # Prioritized skills put job-relevant skills first.
    assert resume.generated_content.skills[0].lower() in matching_job.to_matching_text().lower()
    # Human-in-the-loop gate: not approved on creation.
    assert resume.approved is False


def test_generate_cover_letter(profile, matching_job):
    engine = GenerationEngine()
    resume = engine.generate_resume(profile, matching_job)
    cl = engine.generate_cover_letter(profile, matching_job, resume=resume)
    assert cl.job_posting_id == matching_job.id
    assert cl.resume_id == resume.id
    assert matching_job.company.lower() in cl.content.lower()
    assert cl.approved is False


def test_generate_cover_letter_grounds_in_resume_when_profile_empty():
    """Regression: the generator must feed the résumé's real text into the prompt.
    With an empty profile and an empty job description, the old code sent nothing
    to ground on and the model returned a placeholder draft."""
    from jobsearch.llm.base import LLMProvider
    from jobsearch.models import JobPosting, Resume, UserProfile

    captured = {}

    class SpyLLM(LLMProvider):
        name = "spy"

        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            captured["prompt"] = prompt
            captured["system"] = system
            return "Dear Hiring Manager, ..."

    engine = GenerationEngine(llm=SpyLLM())
    profile = UserProfile(user_id="u1")  # empty: no headline/skills
    job = JobPosting(title="SRE", company="Initech", description="")  # no description
    resume = Resume(
        user_id="u1",
        rendered_text="Led a ZXQWOps platform migration saving 40% in cloud costs.",
    )
    cl = engine.generate_cover_letter(profile, job, resume=resume)

    # The résumé's distinctive content reaches the prompt...
    assert "ZXQWOps" in captured["prompt"]
    # ...and the system prompt forbids placeholder output.
    assert "placeholder" in captured["system"].lower()
    assert cl.resume_id == resume.id


def test_approval_gate_helper(profile, matching_job):
    engine = GenerationEngine()
    resume = engine.generate_resume(profile, matching_job)
    engine.approve(resume)
    assert resume.approved is True


def test_missing_keywords_surface_gaps(profile, matching_job):
    engine = GenerationEngine()
    resume = engine.generate_resume(profile, matching_job)
    gaps = engine.missing_ats_keywords(resume, matching_job)
    assert isinstance(gaps, list)
