"""Seed a brand-new account with clearly-labelled sample data (a résumé, a cover
letter, and a few job matches) so the app never looks empty on first login — and
clear those samples automatically the moment the user adds real data.

Everything created here is flagged ``is_sample=True`` and visibly labelled "Sample"
so a user is never confused about what's real. Sample job postings are owned by the
user (``owner_id``) so they only appear in that user's matches, never anyone else's.
"""

from __future__ import annotations

from jobsearch.models import CoverLetter, JobPosting, Resume
from jobsearch.models.document import (
    CoverLetterSource,
    DocumentVersion,
    ResumeFormat,
    ResumeSource,
)

_SAMPLE_RESUME = """# Alex Sample — Sample Résumé

**Senior Product Manager** · alex.sample@example.com · (555) 010-0000 · New York, NY

> This is a sample résumé so you can see how the app works. Upload your own and it
> replaces this automatically.

## Summary
Product leader with 8+ years shipping B2B SaaS, from discovery to launch, with a
record of growing activation and retention through data-informed iteration.

## Experience
### Senior Product Manager — Example Corp (2021–Present)
- Led a 6-person squad to launch a self-serve onboarding flow, lifting activation 34%.
- Ran weekly experiment reviews; shipped 40+ A/B tests, +12% 90-day retention.

### Product Manager — Sample Labs (2018–2021)
- Owned the billing platform roadmap; cut involuntary churn 18% with smart dunning.

## Skills
Product strategy, roadmapping, SQL, experimentation, stakeholder management, Figma.

## Education
B.S., Information Systems — Example University
"""

_SAMPLE_COVER_LETTER = """Dear Hiring Manager,

This is a sample cover letter so you can see how tailoring works — upload or generate
your own and it replaces this automatically.

I'm excited to apply for the Senior Product Manager role. In my current role at Example
Corp I led the launch of a self-serve onboarding flow that lifted activation by 34%, and
I'd bring the same discovery-to-launch discipline to your team.

I'd welcome the chance to discuss how my experience shipping B2B SaaS could help your
product goals.

Sincerely,
Alex Sample
"""

_SAMPLE_JOBS = [
    {"title": "Senior Product Manager", "company": "Example Corp (Sample)",
     "location": "New York, NY", "remote": False,
     "description": "Sample posting. Lead a product squad from discovery to launch for a B2B SaaS platform; own the roadmap, run experiments, and partner with design and engineering."},
    {"title": "Product Manager, Growth", "company": "Sample Labs (Sample)",
     "location": "Remote (US)", "remote": True,
     "description": "Sample posting. Drive activation and retention through experimentation; own onboarding and lifecycle, partnering with data and marketing."},
    {"title": "Director of Product", "company": "Demo Industries (Sample)",
     "location": "San Francisco, CA", "remote": False,
     "description": "Sample posting. Set product vision and lead a team of PMs; balance strategy with execution and report to the VP of Product."},
]


def seed_demo_data(state, user_id: str) -> None:
    """Populate a new account with one sample résumé, one sample cover letter, and a
    few sample job matches — all flagged and labelled as samples."""
    resume = Resume(
        user_id=user_id, source=ResumeSource.UPLOADED, format=ResumeFormat.MARKDOWN,
        original_filename="Sample résumé.md", rendered_text=_SAMPLE_RESUME,
        is_sample=True,
        versions=[DocumentVersion(version=1, label="Sample", content=_SAMPLE_RESUME, source="original")],
        active_version=1,
    )
    state.resumes.add(resume)

    cl = CoverLetter(
        user_id=user_id, source=CoverLetterSource.UPLOADED,
        original_filename="Sample cover letter.md", content=_SAMPLE_COVER_LETTER,
        is_sample=True,
        versions=[DocumentVersion(version=1, label="Sample", content=_SAMPLE_COVER_LETTER, source="original")],
        active_version=1,
    )
    state.cover_letters.add(cl)

    for raw in _SAMPLE_JOBS:
        state.jobs.add(JobPosting(
            source_platform="sample", is_sample=True, owner_id=user_id,
            title=raw["title"], company=raw["company"], location=raw["location"],
            remote=raw["remote"], description=raw["description"],
        ))


def clear_sample_resumes(state, user_id: str) -> int:
    n = 0
    for r in list(state.resumes.find(user_id=user_id)):
        if getattr(r, "is_sample", False):
            state.resumes.delete(r.id)
            n += 1
    return n


def clear_sample_cover_letters(state, user_id: str) -> int:
    n = 0
    for c in list(state.cover_letters.find(user_id=user_id)):
        if getattr(c, "is_sample", False):
            state.cover_letters.delete(c.id)
            n += 1
    return n


def clear_sample_jobs(state, user_id: str) -> int:
    n = 0
    for j in list(state.jobs.all()):
        if getattr(j, "is_sample", False) and getattr(j, "owner_id", "") == user_id:
            state.jobs.delete(j.id)
            n += 1
    return n
