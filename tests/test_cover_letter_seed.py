"""An uploaded/generated cover letter shows an 'Original' version immediately (so
the versions marquee isn't empty), and the AI's formatting standard is in force."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.resume_assistant import _CL_STANDARD, _CL_REVISE_SYSTEM


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient) -> dict:
    client.post("/api/v1/auth/register", json={"email": "c@x.com", "password": "supersecret", "full_name": "C"})
    tok = client.post("/api/v1/auth/login", json={"email": "c@x.com", "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_uploaded_cover_letter_has_an_original_version():
    client = _client()
    h = _auth(client)
    up = client.post("/api/v1/cover-letters/upload", headers=h,
                     files={"file": ("cl.md", b"Dear Team,\n\nI am a great fit.\n\nSincerely,\nC", "text/markdown")})
    assert up.status_code == 201
    cl = up.json()
    assert cl["active_version"] == 1
    assert [v["label"] for v in cl["versions"]] == ["Original"]

    # version-usage (what the marquee reads) shows the Original right away.
    usage = client.get(f"/api/v1/cover-letters/{cl['id']}/version-usage", headers=h).json()
    assert len(usage) == 1 and usage[0]["version"] == 1


def test_cover_letter_format_standard_requires_salutation_and_signoff():
    # The shared standard the generate/edit prompts inject must mandate proper form.
    low = _CL_STANDARD.lower()
    assert "salutation" in low and "sign-off" in low
    assert "dear hiring manager" in low
    assert "sincerely" in low
    # And the revise system prompt pulls it in.
    assert _CL_STANDARD in _CL_REVISE_SYSTEM
