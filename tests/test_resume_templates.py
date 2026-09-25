"""User résumé templates — presets + AI-generated/saved styles."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger


def _client(**settings) -> TestClient:
    from jobsearch.config import Settings
    return TestClient(create_app(state=AppState(settings=Settings(**settings), exchanger=MockTokenExchanger())))


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


def test_saved_template_id_persists_and_render_defaults_to_it():
    c = _client(); h = _auth(c)
    rid = c.post("/api/v1/resumes/upload", headers=h,
                 files={"file": ("cv.txt", b"Sam Rivera\nIT Director\nSkills: Python", "text/plain")}).json()["id"]
    # "Use this template" persists the choice on the résumé.
    upd = c.put(f"/api/v1/resumes/{rid}", headers=h, json={"template_id": "tpl_executive"})
    assert upd.status_code == 200 and upd.json()["template_id"] == "tpl_executive"
    # A render with no template_id now uses the saved one.
    r = c.get(f"/api/v1/resumes/{rid}/render", headers=h)
    assert r.status_code == 200 and r.json()["template"]["name"] == "Executive"


def test_render_falls_back_to_default_when_saved_template_is_gone():
    c = _client(); h = _auth(c)
    rid = c.post("/api/v1/resumes/upload", headers=h,
                 files={"file": ("cv.txt", b"Sam Rivera\nEngineer\nSkills: Python", "text/plain")}).json()["id"]
    # A stale/invalid saved template id must not break the default render.
    c.put(f"/api/v1/resumes/{rid}", headers=h, json={"template_id": "tpl_does_not_exist"})
    r = c.get(f"/api/v1/resumes/{rid}/render", headers=h)
    assert r.status_code == 200 and r.json()["template"]["id"]  # rendered on the default
    # But an EXPLICIT bad template id still 404s.
    assert c.get(f"/api/v1/resumes/{rid}/render?template_id=tpl_nope", headers=h).status_code == 404


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


def test_quality_gate_rejects_invalid_or_unclean_templates():
    c = _client(); h = _auth(c)
    # invalid style config
    assert c.post("/api/v1/resume-templates", headers=h,
                  json={"name": "Bad", "style": {"accent_color": "blue", "layout": "triple"}}).status_code == 400
    # disallowed language in the name
    assert c.post("/api/v1/resume-templates", headers=h,
                  json={"name": "porn styles", "style": {}}).status_code == 400


def test_template_never_carries_resume_content():
    # A template's schema only has style + metadata — no résumé content fields can be
    # stored, so a user's résumé is never shared by saving a template.
    from jobsearch.models import ResumeTemplate
    fields = set(ResumeTemplate.model_fields)
    for content_field in ("basics", "work", "education", "skills", "summary", "rendered_text", "content"):
        assert content_field not in fields


def test_moderation_pending_until_admin_approves():
    c = _client(template_auto_approve=False, admin_token="ADMIN")
    ha = _auth(c, "a@b.com")
    hb = _auth(c, "b@b.com")
    tid = c.post("/api/v1/resume-templates", headers=ha, json={"name": "Pending Style", "style": {}}).json()["id"]
    # hidden from others while pending, visible to the creator
    assert not any(t["id"] == tid for t in c.get("/api/v1/resume-templates", headers=hb).json())
    assert any(t["id"] == tid for t in c.get("/api/v1/resume-templates", headers=ha).json())
    adm = {"X-Admin-Token": "ADMIN"}
    assert any(t["id"] == tid for t in c.get("/api/v1/admin/templates?status_filter=pending", headers=adm).json())
    assert c.post(f"/api/v1/admin/templates/{tid}/approve", headers=adm).json()["status"] == "approved"
    assert any(t["id"] == tid for t in c.get("/api/v1/resume-templates", headers=hb).json())


def test_flagging_auto_hides_past_threshold():
    c = _client(template_flag_threshold=2, admin_token="ADMIN")
    ha = _auth(c, "a@b.com")
    tid = c.post("/api/v1/resume-templates", headers=ha, json={"name": "To Flag", "style": {}}).json()["id"]
    for e in ("x@b.com", "y@b.com"):
        c.post(f"/api/v1/resume-templates/{tid}/flag", headers=_auth(c, e))
    flagged = c.get("/api/v1/admin/templates?status_filter=flagged", headers={"X-Admin-Token": "ADMIN"}).json()
    row = next(t for t in flagged if t["id"] == tid)
    assert row["status"] == "pending" and row["flags"] == 2
