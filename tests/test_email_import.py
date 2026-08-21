"""Ingest job-alert emails (.eml) — parser + API."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.sourcing import parse_job_alert

ALERT = b"""From: LinkedIn Job Alerts <jobs-noreply@linkedin.com>
To: me@example.com
Subject: new jobs
Content-Type: text/html; charset=utf-8

<html><body>
<p>Jobs you may be interested in</p>
<a href="https://www.linkedin.com/jobs/view/3812345678">Senior Backend Engineer</a>
<span>Globex Corporation &middot; San Francisco, CA (Remote)</span>
<a href="https://www.linkedin.com/comm/jobs/view/3899">Staff Platform Engineer</a>
<span>Umbrella Software &middot; New York, NY</span>
<a href="https://www.linkedin.com/help/unsubscribe">Unsubscribe</a>
<a href="https://www.linkedin.com/jobs/view/3900">Apply now</a>
</body></html>
"""

INDEED = b"""From: Indeed <alert@indeed.com>
Content-Type: text/html

<a href="https://www.indeed.com/viewjob?jk=abc123">Data Engineer</a>
<div>Initech &bull; Austin, TX</div>
"""


# --- parser -----------------------------------------------------------------
def test_parse_extracts_jobs_and_filters_cta():
    alert = parse_job_alert(ALERT)
    assert alert.source == "linkedin"
    titles = [p["title"] for p in alert.postings]
    assert titles == ["Senior Backend Engineer", "Staff Platform Engineer"]  # unsubscribe + "Apply now" dropped
    first = alert.postings[0]
    assert first["company"] == "Globex Corporation"
    assert "San Francisco" in first["location"] and first["remote"] is True
    assert first["external_id"] == "linkedin-3812345678"


def test_parse_detects_source_and_jk_id():
    alert = parse_job_alert(INDEED)
    assert alert.source == "indeed"
    assert alert.postings[0]["external_id"] == "indeed-abc123"
    assert alert.postings[0]["company"] == "Initech"


def test_parse_plain_html_blob_without_mime_headers():
    alert = parse_job_alert('<a href="https://boards.greenhouse.io/acme/jobs/12">ML Engineer</a><p>Acme</p>')
    assert alert.postings and alert.postings[0]["title"] == "ML Engineer"


# --- API --------------------------------------------------------------------
def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_import_email_ingests_into_matches():
    client = _client()
    h = _auth(client)
    r = client.post(
        "/api/v1/job-search/import-email", headers=h,
        files={"file": ("alert.eml", ALERT, "message/rfc822")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "linkedin"
    assert body["parsed"] == 2
    assert body["result"]["ingested"] == 2
    matches = client.get("/api/v1/jobs/matches", headers=h).json()
    assert any(m["company"] == "Globex Corporation" for m in matches)


def test_api_import_email_dedupes_on_reimport():
    client = _client()
    h = _auth(client)
    files = {"file": ("alert.eml", ALERT, "message/rfc822")}
    client.post("/api/v1/job-search/import-email", headers=h, files=files)
    second = client.post("/api/v1/job-search/import-email", headers=h, files={"file": ("alert.eml", ALERT, "message/rfc822")}).json()
    assert second["result"]["ingested"] == 0
    assert second["result"]["duplicates"] == 2


def test_api_import_email_requires_auth():
    client = _client()
    assert client.post("/api/v1/job-search/import-email", files={"file": ("a.eml", ALERT, "message/rfc822")}).status_code == 401
