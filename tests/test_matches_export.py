"""Export job recommendations as CSV / JSON."""

from __future__ import annotations

import csv
import io
import json

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger

JOBS = [
    {"title": "Senior Backend Engineer", "company": "Globex", "location": "Remote", "remote": True,
     "url": "https://jobs/globex", "requirements": ["Python", "PostgreSQL"],
     "salary_range": {"currency": "USD", "minimum": 170000, "maximum": 210000}},
    {"title": "Full-Stack Developer", "company": "Umbrella", "location": "NYC", "remote": False,
     "url": "https://jobs/umbrella", "requirements": ["TypeScript", "React"]},
]


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "a@b.com", "password": "supersecret", "full_name": "A"})
    tok = client.post("/api/v1/auth/login", json={"email": "a@b.com", "password": "supersecret"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    client.post("/api/v1/jobs/ingest", headers=h, json={"jobs": JOBS})
    return h


def test_export_csv_has_header_and_rows():
    client = _client()
    h = _auth(client)
    r = client.get("/api/v1/jobs/matches/export", headers=h, params={"format": "csv"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert len(rows) == 2
    assert {"title", "company", "fit_score", "url", "gap_skills"} <= set(rows[0].keys())
    companies = {row["company"] for row in rows}
    assert companies == {"Globex", "Umbrella"}


def test_export_json_structure():
    client = _client()
    h = _auth(client)
    r = client.get("/api/v1/jobs/matches/export", headers=h, params={"format": "json"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")
    data = json.loads(r.text)
    assert "matches" in data and len(data["matches"]) == 2
    first = data["matches"][0]
    assert isinstance(first["matching_skills"], list)
    assert "fit_score" in first and "authenticity_score" in first


def test_export_filters_by_ids():
    client = _client()
    h = _auth(client)
    all_matches = client.get("/api/v1/jobs/matches", headers=h).json()
    keep = all_matches[0]["job_id"]
    r = client.get("/api/v1/jobs/matches/export", headers=h, params={"format": "json", "ids": keep})
    data = json.loads(r.text)
    assert len(data["matches"]) == 1
    assert data["matches"][0]["job_id"] == keep


def test_export_requires_auth():
    client = _client()
    assert client.get("/api/v1/jobs/matches/export").status_code == 401
