"""Provider-agnostic external ingest (/jobs/ingest-external) — de-duplicates, so
repeat browser pulls of the same board page don't pile up copies."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "u@x.com", "password": "supersecret", "full_name": "U"})
    tok = client.post("/api/v1/auth/login", json={"email": "u@x.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


_JOBS = [
    {"source_platform": "linkedin", "external_id": "li-1", "title": "Service Delivery Manager",
     "company": "Phaxis", "location": "New York, NY", "url": "https://www.linkedin.com/jobs/view/1"},
    {"title": "Director of IT Operations", "company": "Kforce", "location": "Edison, NJ",
     "url": "https://www.linkedin.com/jobs/view/2"},  # no source_platform → uses body.source
]


def test_external_ingest_is_provider_agnostic_and_dedupes():
    client = _client()
    h = _auth(client)

    first = client.post("/api/v1/jobs/ingest-external", headers=h, json={"source": "linkedin", "jobs": _JOBS})
    assert first.status_code == 200
    b1 = first.json()
    assert b1["ingested"] == 2 and b1["duplicates"] == 0

    # Pulling the same page again must NOT create duplicates.
    second = client.post("/api/v1/jobs/ingest-external", headers=h, json={"source": "linkedin", "jobs": _JOBS})
    b2 = second.json()
    assert b2["ingested"] == 0 and b2["duplicates"] == 2

    # The job that omitted source_platform picked up the fallback "linkedin".
    matches = client.get("/api/v1/jobs/matches", headers=h).json()
    slugs = {m["source_slug"] for m in matches}
    assert "linkedin" in slugs
    # both roles are present exactly once
    titles = [m["title"] for m in matches]
    assert titles.count("Service Delivery Manager") == 1
    assert titles.count("Director of IT Operations") == 1


def test_external_ingest_requires_auth():
    client = _client()
    assert client.post("/api/v1/jobs/ingest-external", json={"jobs": _JOBS}).status_code == 401


def test_repull_upgrades_a_thin_jobs_description():
    """A first pull from a list page has no description; a later pull from the job's
    detail page carries the full JD. De-dup must UPGRADE the stored job's description
    rather than keep the thin one (so the extension's client-side capture lands)."""
    client = _client()
    h = _auth(client)
    thin = {"source_platform": "linkedin", "external_id": "li-9", "title": "Platform Lead",
            "company": "Globex", "url": "https://www.linkedin.com/jobs/view/9"}
    client.post("/api/v1/jobs/ingest-external", headers=h, json={"source": "linkedin", "jobs": [thin]})
    jid = next(m["job_id"] for m in client.get("/api/v1/jobs/matches", headers=h).json() if m["company"] == "Globex")
    assert (client.get(f"/api/v1/jobs/{jid}", headers=h).json()["description"] or "") == ""

    full = {**thin, "description": "We are hiring a Platform Lead to own our Kubernetes fleet across regions, "
            "lead incident response, and mentor engineers. Requires deep AWS, Terraform, Python and Go experience."}
    out = client.post("/api/v1/jobs/ingest-external", headers=h, json={"source": "linkedin", "jobs": [full]}).json()
    assert out["duplicates"] == 1 and out["ingested"] == 0  # still de-duped, not a new row
    upgraded = client.get(f"/api/v1/jobs/{jid}", headers=h).json()
    assert "Kubernetes fleet" in upgraded["description"]  # the full JD now lands
