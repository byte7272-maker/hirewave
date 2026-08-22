"""Work-experience highlights: engine, interview grounding, and API."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.experience import ExperienceEngine
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.interview import InterviewEngine
from jobsearch.models import ExperienceKind, ExperienceSource


# --- engine -----------------------------------------------------------------
def test_create_and_list():
    eng = ExperienceEngine()
    a = eng.create(
        "u1",
        content="Led the migration of our billing platform, cutting latency 40%.",
        title="Billing migration",
        kind="project",
        source="ai_generated",
        source_tool="Microsoft 365 Copilot",
        skills=["Python", "AWS"],
        company="Acme",
        period="2023 Q3",
    )
    assert a.kind == ExperienceKind.PROJECT
    assert a.source == ExperienceSource.AI_GENERATED
    assert a.source_tool == "Microsoft 365 Copilot"
    assert eng.list_for("u1") == [a]
    assert eng.list_for("someone-else") == []


def test_short_content_rejected():
    eng = ExperienceEngine()
    try:
        eng.create("u1", content="too short")
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_bad_enum_values_fall_back():
    eng = ExperienceEngine()
    it = eng.create("u1", content="A solid analysis of the outage response.", kind="nope", source="bogus")
    assert it.kind == ExperienceKind.HIGHLIGHT
    assert it.source == ExperienceSource.SELF_WRITTEN


def test_update_and_delete():
    eng = ExperienceEngine()
    it = eng.create("u1", content="Initial content that is long enough.")
    eng.update(it, {"title": "New title", "skills": ["Go", " ", "gRPC"]})
    got = eng.get_owned(it.id, "u1")
    assert got.title == "New title"
    assert got.skills == ["Go", "gRPC"]  # blanks stripped
    assert eng.get_owned(it.id, "other") is None  # owner-scoped
    eng.delete(it.id)
    assert eng.list_for("u1") == []


def test_context_text_assembly():
    eng = ExperienceEngine()
    assert eng.context_text("u1") == ""  # nothing yet
    eng.create("u1", content="Resolved a Sev1 outage in under an hour.", title="Outage", kind="story", company="Acme", period="2024")
    ctx = eng.context_text("u1")
    assert "Outage" in ctx and "Sev1 outage" in ctx and "Acme" in ctx
    assert "[story]" in ctx


# --- interview grounding ----------------------------------------------------
def test_prep_grounds_on_experience_without_resume(profile):
    ctx = ExperienceEngine().create("u", content="Built a fraud model catching $2M in bad charges.").content
    prep = InterviewEngine().generate(profile, experience_context=f"Highlight: {ctx}")
    assert prep.based_on_document is True  # grounded via highlights, no résumé


def test_prep_no_experience_uses_profile(profile):
    prep = InterviewEngine().generate(profile)
    assert prep.based_on_document is False


# --- API --------------------------------------------------------------------
def _auth(client, email="exp@demo.com"):
    client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "supersecret12", "full_name": "Exp"},
    )
    tok = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "supersecret12"}
    ).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_api_crud_flow():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    # create
    r = client.post(
        "/api/v1/experience",
        headers=h,
        json={
            "content": "Owned the checkout redesign that lifted conversion 12%.",
            "title": "Checkout redesign",
            "kind": "achievement",
            "source": "ai_generated",
            "source_tool": "Glean",
        },
    )
    assert r.status_code == 201
    item = r.json()
    assert item["source_tool"] == "Glean"
    assert item["kind"] == "achievement"
    # list
    lst = client.get("/api/v1/experience", headers=h).json()
    assert len(lst) == 1
    # update
    r = client.put(f"/api/v1/experience/{item['id']}", headers=h, json={"title": "Checkout revamp"})
    assert r.status_code == 200 and r.json()["title"] == "Checkout revamp"
    # delete
    assert client.delete(f"/api/v1/experience/{item['id']}", headers=h).status_code == 204
    assert client.get("/api/v1/experience", headers=h).json() == []


def test_api_rejects_short_content():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    r = client.post("/api/v1/experience", headers=h, json={"content": "short"})
    assert r.status_code == 400


def test_api_owner_scoped():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    ha = _auth(client, "a@demo.com")
    hb = _auth(client, "b@demo.com")
    item = client.post(
        "/api/v1/experience", headers=ha, json={"content": "A's private work highlight text."}
    ).json()
    assert client.get(f"/api/v1/experience/{item['id']}", headers=hb).status_code == 404
    assert client.get("/api/v1/experience", headers=hb).json() == []


def test_api_requires_auth():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    assert client.get("/api/v1/experience").status_code == 401


def test_api_upload_extracts_text():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    content = b"Q3 highlights: shipped the payments API, mentored two engineers."
    r = client.post(
        "/api/v1/experience/upload",
        headers=h,
        files={"file": ("highlights.txt", content, "text/plain")},
        data={"source": "ai_generated", "source_tool": "Copilot"},
    )
    assert r.status_code == 201
    body = r.json()
    assert "payments API" in body["content"]
    assert body["original_filename"] == "highlights.txt"
    assert body["source_tool"] == "Copilot"


def test_api_prep_uses_experience_grounding():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    client.post(
        "/api/v1/experience",
        headers=h,
        json={"content": "Rearchitected the data pipeline to cut costs by 30%."},
    )
    r = client.post("/api/v1/interview/prep", headers=h, json={"count": 4})
    assert r.status_code == 201
    assert r.json()["based_on_document"] is True  # grounded via the highlight
