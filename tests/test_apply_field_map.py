"""Apply field-map: the extension's backend for filling a live application form from the
user's own profile — maps common fields deterministically, NEVER fills credentials, and
leaves legal attestations for the user."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models.user import Education, UserProfile, WorkExperience


def _app(**settings_kw):
    s = Settings(**settings_kw)
    state = AppState(settings=s, exchanger=MockTokenExchanger())
    return state, TestClient(create_app(state=state))


def _auth(c, email="jordan@x.com", name="Jordan Lee"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": name})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _seed_profile(state, email="jordan@x.com"):
    uid = state.user_by_email(email).id
    state.profiles.add(UserProfile(
        user_id=uid,
        headline="Staff Engineer",
        summary="I build reliable systems.",
        skills=["Python", "Go"],
        work_experience=[WorkExperience(company="Globex", title="Staff Engineer")],
        education=[Education(institution="MIT", degree="BS")],
    ))
    return uid


def _map(c, h, fields, **extra):
    return c.post("/api/v1/apply/field-map", headers=h, json={"fields": fields, **extra}).json()


def test_field_map_requires_auth():
    _, c = _app()
    assert c.post("/api/v1/apply/field-map", json={"fields": []}).status_code == 401


def test_maps_common_fields_from_profile():
    state, c = _app()
    h = _auth(c)
    _seed_profile(state)
    body = _map(c, h, [
        {"name": "email", "label": "Email", "type": "email"},
        {"label": "First Name"},
        {"label": "Last Name"},
        {"label": "Current Company"},
        {"label": "Skills"},
        {"label": "School"},
    ])
    got = {m["field"]: m["value"] for m in body["mappings"]}
    assert got["email"] == "jordan@x.com"
    assert got["First Name"] == "Jordan" and got["Last Name"] == "Lee"
    assert got["Current Company"] == "Globex"
    assert got["Skills"] == "Python, Go"
    assert got["School"] == "MIT"
    # every mapping is sourced from the user's own profile
    assert all(m["source"] == "profile" for m in body["mappings"])


def test_never_maps_credentials_or_financial():
    state, c = _app()
    h = _auth(c)
    _seed_profile(state)
    body = _map(c, h, [
        {"label": "Password", "type": "password"},
        {"label": "Social Security Number"},
        {"label": "Credit Card Number"},
        {"label": "Bank Account Number"},
    ])
    mapped = {m["field"] for m in body["mappings"]}
    assert mapped == set()  # nothing sensitive was mapped
    assert len(body["skipped_sensitive"]) == 4


def test_legal_attestations_are_left_to_the_user():
    state, c = _app()
    h = _auth(c)
    _seed_profile(state)
    body = _map(c, h, [
        {"label": "Are you legally authorized to work in the US?"},
        {"label": "Will you require visa sponsorship?"},
        {"label": "I certify the above is true", "type": "checkbox"},
    ])
    assert len(body["needs_user"]) == 3
    assert body["mappings"] == []


def test_unknown_field_is_unmapped_offline():
    # With the offline mock LLM the AI pass yields nothing, so an unrecognized field is
    # reported unmapped rather than guessed.
    state, c = _app()
    h = _auth(c)
    _seed_profile(state)
    body = _map(c, h, [{"label": "Favorite programming mascot"}])
    assert "Favorite programming mascot" in body["unmapped"]
    assert body["mappings"] == []


def test_password_type_field_is_sensitive_even_without_keyword():
    state, c = _app()
    h = _auth(c)
    _seed_profile(state)
    body = _map(c, h, [{"name": "pw", "label": "Secret", "type": "password"}])
    assert body["skipped_sensitive"] and body["mappings"] == []
