"""Shared fixtures: a sample user profile and a set of job postings."""

from __future__ import annotations

import pytest

from jobsearch.models import JobPosting, User, UserProfile
from jobsearch.models.user import (
    Education,
    JobPreferences,
    SalaryRange,
    WorkExperience,
)


@pytest.fixture
def user() -> User:
    return User(email="dev@example.com", full_name="Sam Dev", location="New York, NY")


@pytest.fixture
def profile(user: User) -> UserProfile:
    return UserProfile(
        user_id=user.id,
        headline="Senior Backend Engineer",
        summary="Backend engineer with 8 years building Python microservices.",
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
            ),
            WorkExperience(
                company="Startup Inc",
                title="Backend Engineer",
                start="2016",
                end="2019",
                highlights=["Designed PostgreSQL schemas and REST APIs"],
            ),
        ],
        education=[Education(institution="State University", degree="BSc", field_of_study="CS")],
        preferences=JobPreferences(
            job_type="full_time",
            salary_range=SalaryRange(minimum=150_000, maximum=200_000),
            remote_ok=True,
            target_roles=["Backend Engineer", "Platform Engineer"],
            target_locations=["New York", "Remote"],
            seniority="senior",
        ),
    )


@pytest.fixture
def matching_job() -> JobPosting:
    return JobPosting(
        source_platform="linkedin",
        external_id="li-1",
        title="Senior Backend Engineer",
        company="Globex",
        company_domain="globex.com",
        location="Remote",
        remote=True,
        description=(
            "We are hiring a Senior Backend Engineer to build Python microservices "
            "with FastAPI and PostgreSQL on AWS. You will own services in Docker and "
            "Kubernetes, optimize Redis caching, and design REST APIs. 6+ years required."
        ),
        requirements=["Python", "FastAPI", "PostgreSQL", "AWS", "Kubernetes"],
        salary_range=SalaryRange(minimum=160_000, maximum=210_000),
        url="https://linkedin.com/jobs/li-1",
    )


@pytest.fixture
def unrelated_job() -> JobPosting:
    return JobPosting(
        source_platform="indeed",
        external_id="in-1",
        title="Registered Nurse",
        company="City Hospital",
        company_domain="cityhospital.org",
        location="Boston, MA",
        remote=False,
        description="Registered Nurse needed for the pediatric ward. BLS certification required.",
        requirements=["Nursing license", "BLS certification"],
        url="https://indeed.com/jobs/in-1",
    )


@pytest.fixture
def scam_job() -> JobPosting:
    return JobPosting(
        source_platform="unknown_board",
        external_id="scam-1",
        title="Work From Home Data Entry",
        company="QuickCash LLC",
        company_domain="",
        location="Remote",
        remote=True,
        description=(
            "URGENT! Apply now! Immediate start! No experience needed. "
            "Guaranteed income — earn $5000 a week! Be your own boss! "
            "Contact us on WhatsApp to start tomorrow. Limited spots!"
        ),
        requirements=[],
        url="http://sketchy.example/scam-1",
    )
