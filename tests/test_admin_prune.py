from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import JobPosting

AH = {"X-Admin-Token": "t0ken"}


def _client_state():
    state = AppState(settings=Settings(admin_token="t0ken"), exchanger=MockTokenExchanger())
    return TestClient(create_app(state=state)), state


def test_prune_seed_jobs_dry_run_then_confirm():
    client, state = _client_state()
    # seeded/demo fakes
    state.jobs.add(JobPosting(title="Senior Backend Engineer", company="Hooli", source_platform="indeed"))
    state.jobs.add(JobPosting(title="senior data engineer z1788415338", company="Northwind Labs"))
    state.jobs.add(JobPosting(title="Subsea Kelp Logistics Lead 1788824848", company="Globex"))
    state.jobs.add(JobPosting(title="Director of IT Operations XYZ", company="NovaCorp"))
    # genuine postings
    state.jobs.add(JobPosting(title="Director of IT Operations", company="Sodexo", source_platform="linkedin"))
    state.jobs.add(JobPosting(title="Senior Advisor", company="ASPCA", source_platform="email"))  # inbox-sourced

    # dry run: reports matches, deletes nothing
    d = client.post("/api/v1/admin/prune-seed-jobs", headers=AH).json()
    assert d["dry_run"] is True and d["matched"] == 4 and d["deleted"] == 0
    assert d["total_jobs"] == 6 and len(state.jobs.all()) == 6  # nothing removed yet

    # confirm: deletes exactly the 4 seed rows
    c = client.post("/api/v1/admin/prune-seed-jobs?confirm=true", headers=AH).json()
    assert c["dry_run"] is False and c["deleted"] == 4 and c["remaining"] == 2
    remaining = {j.company for j in state.jobs.all()}
    assert remaining == {"Sodexo", "ASPCA"}  # real board job + inbox-sourced one kept


def test_prune_requires_admin_token():
    client, _ = _client_state()
    assert client.post("/api/v1/admin/prune-seed-jobs").status_code == 403
    assert client.post("/api/v1/admin/prune-seed-jobs",
                       headers={"X-Admin-Token": "wrong"}).status_code == 403


def test_prune_disabled_when_no_admin_token_configured():
    state = AppState(settings=Settings(admin_token=""), exchanger=MockTokenExchanger())
    client = TestClient(create_app(state=state))
    # unset admin token => all admin endpoints 403 (safe by default)
    assert client.post("/api/v1/admin/prune-seed-jobs", headers=AH).status_code == 403
