"""User résumé templates — presets + AI-generated/saved styles."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client() -> TestClient:
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client: TestClient, email="t@b.com") -> dict:
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "T"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_presets_listed():
    c = _client(); h = _auth(c)
    names = [t["name"] for t in c.get("/api/v1/resume-templates", headers=h).json()]
    assert {"Modern", "Classic", "Minimal"} <= set(names)


def test_generate_reflects_the_prompt():
    c = _client(); h = _auth(c)
    gen = c.post("/api/v1/resume-templates/generate", headers=h,
                 json={"prompt": "clean two-column tech resume, teal accent, serif, spacious"}).json()
    st = gen["style"]
    assert gen["source"] == "generated"
    assert st["layout"] == "two-column" and st["font_family"] == "serif"
    assert st["density"] == "spacious" and st["accent_color"] == "#0d9488"  # teal


def test_save_list_and_delete_own_template():
    c = _client(); h = _auth(c)
    style = c.post("/api/v1/resume-templates/generate", headers=h, json={"prompt": "navy classic"}).json()["style"]
    saved = c.post("/api/v1/resume-templates", headers=h,
                   json={"name": "My Style", "style": style, "source": "generated"})
    assert saved.status_code == 201
    tid = saved.json()["id"]
    listed = c.get("/api/v1/resume-templates", headers=h).json()
    assert any(t["id"] == tid and t["name"] == "My Style" for t in listed)
    assert c.delete(f"/api/v1/resume-templates/{tid}", headers=h).status_code == 204


def test_templates_are_owner_scoped():
    c = _client()
    ha = _auth(c, "a@b.com")
    hb = _auth(c, "b@b.com")
    tid = c.post("/api/v1/resume-templates", headers=ha,
                 json={"name": "A's", "style": {}}).json()["id"]
    # B can't see or delete A's template
    assert not any(t["id"] == tid for t in c.get("/api/v1/resume-templates", headers=hb).json())
    assert c.delete(f"/api/v1/resume-templates/{tid}", headers=hb).status_code == 404
    assert c.get(f"/api/v1/resume-templates/{tid}", headers=hb).status_code == 404


def test_generate_requires_a_prompt():
    c = _client(); h = _auth(c)
    assert c.post("/api/v1/resume-templates/generate", headers=h, json={"prompt": "  "}).status_code == 400
