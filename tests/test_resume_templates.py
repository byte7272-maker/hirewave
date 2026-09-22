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


def test_eight_default_styles_listed():
    c = _client(); h = _auth(c)
    tpls = c.get("/api/v1/resume-templates", headers=h).json()
    presets = [t for t in tpls if t["source"] == "preset"]
    assert len(presets) == 8  # eight default styles
    assert {"Modern", "Classic", "Minimal", "Executive", "Creative", "Technical", "Academic", "Elegant"} == {t["name"] for t in presets}
    assert all(t["category"] for t in presets)  # tracked by type


def test_saved_templates_are_shared_across_users():
    # A template one user saves is available to ALL users (shared library).
    c = _client()
    ha = _auth(c, "a@b.com")
    hb = _auth(c, "b@b.com")
    style = c.post("/api/v1/resume-templates/generate", headers=ha, json={"prompt": "navy executive serif"}).json()["style"]
    tid = c.post("/api/v1/resume-templates", headers=ha,
                 json={"name": "Shared One", "style": style}).json()["id"]
    # user B sees A's template in the shared library
    assert any(t["id"] == tid for t in c.get("/api/v1/resume-templates", headers=hb).json())
    assert c.get(f"/api/v1/resume-templates/{tid}", headers=hb).status_code == 200
    # but only the creator can delete it
    assert c.delete(f"/api/v1/resume-templates/{tid}", headers=hb).status_code == 403
    assert c.delete(f"/api/v1/resume-templates/{tid}", headers=ha).status_code == 204


def test_render_places_resume_on_template():
    c = _client(); h = _auth(c)
    rid = c.post("/api/v1/resumes/upload", headers=h,
                 files={"file": ("cv.txt", b"Sam Rivera\nIT Director\nSkills: Python, ITIL", "text/plain")}).json()["id"]
    r = c.get(f"/api/v1/resumes/{rid}/render?template_id=tpl_executive", headers=h)
    assert r.status_code == 200
    d = r.json()
    assert d["template"]["name"] == "Executive"
    assert "basics" in d["data"] and "work" in d["data"]  # user info transposed onto the template


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


def test_generate_requires_a_prompt():
    c = _client(); h = _auth(c)
    assert c.post("/api/v1/resume-templates/generate", headers=h, json={"prompt": "  "}).status_code == 400
