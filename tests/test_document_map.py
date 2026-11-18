"""Document compartmentalization: the section/bullet outline with anchors, stale-metric
analysis, keyword locate, and the web-assisted metric refresh (plan + propose)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.assistant import document_refresh as R
from jobsearch.engines.assistant.document_map import analyze_block, build_map, locate
from jobsearch.engines.integration import MockTokenExchanger

_RESUME = """John Williams
IT Director | New York, NY

## Summary
Technology leader with 12 years delivering global IT projects.

## Experience
**Publicis Groupe** -- Global IT Director (2019 - Present)
- Contributed to Publicis Groupe's sustained U.S. organic growth (+4.9% FY2024, +5.2% FY2025) by pioneering VIP and pitch support.
- Led the 2019 cloud migration across three business units.
- Cut incident response time by 38% through a new on-call rotation.

## Education
**NYU** -- B.S. Computer Science

## Skills
Python, AWS, Leadership, Project Delivery
"""

_STALE_BULLET = ("Contributed to Publicis Groupe's sustained U.S. organic growth "
                 "(+4.9% FY2024, +5.2% FY2025) by pioneering VIP and pitch support.")


# --- analyze_block ----------------------------------------------------------
def test_stale_metric_flagged_with_entity_subject_and_query():
    a = analyze_block(_STALE_BULLET, year=2027)
    flags = a["flags"]
    assert len(flags) == 1 and flags[0]["kind"] == "stale_metric"
    assert flags[0]["gap"] == 2 and flags[0]["severity"] == "high"
    # the dated figures are captured — and a bare year is NOT mistaken for a figure
    assert "+4.9%" in flags[0]["values"] and "+5.2%" in flags[0]["values"]
    assert not any(v.strip(",") in {"2024", "2025"} for v in flags[0]["values"])
    r = a["research"]
    assert r["entity"] == "Publicis Groupe"
    assert "organic growth" in r["subject"].lower()
    assert "Publicis Groupe" in r["query"] and "2027" in r["query"]


def test_current_year_metric_not_stale():
    assert analyze_block("Grew revenue 20% in FY2027.", year=2027)["flags"] == []


def test_employment_date_range_without_metric_not_flagged():
    # a historical accomplishment with no figure + no "current" claim is fine
    assert analyze_block("Led the 2019 cloud migration across three units.", year=2027)["flags"] == []


def test_current_claim_pinned_to_old_year_is_low_sev_date_flag():
    a = analyze_block("Currently maintain the platform as of 2024.", year=2027)
    assert a["flags"] and a["flags"][0]["kind"] == "stale_date"
    assert a["flags"][0]["severity"] == "low"


# --- build_map (résumé) -----------------------------------------------------
def test_resume_map_sections_bullets_and_anchors():
    m = build_map(_RESUME, kind="resume", year=2027)
    assert m["kind"] == "resume"
    # an empty leading "Header" section is dropped; the real sections are in order
    canons = [s["canon"] for s in m["sections"]]
    assert canons == ["summary", "experience", "education", "skills"]
    exp = next(s for s in m["sections"] if s["canon"] == "experience")
    assert len(exp["blocks"]) == 3
    # every bullet's char range indexes back to its verbatim line
    for b in exp["blocks"]:
        assert _RESUME[b["char_start"]:b["char_end"]] == b["raw"]
        assert b["id"].startswith("experience-b")
    # exactly the stale bullet is flagged
    assert m["stats"]["flagged"] == 1
    assert m["flags"][0]["block"] == exp["blocks"][0]["id"]


def test_cover_letter_map_paragraphs():
    letter = ("Dear Hiring Manager,\n\n"
              "I grew the team's pipeline 30% in FY2024 and would bring that to your role.\n\n"
              "Thank you for your consideration.\n\nSincerely,\nJohn")
    m = build_map(letter, kind="cover_letter", year=2027)
    assert m["kind"] == "cover_letter"
    assert m["stats"]["paragraphs"] >= 3
    # the dated claim paragraph is flagged
    assert any(f["kind"] == "stale_metric" for f in m["flags"])
    ids = [b["id"] for b in m["blocks"]]
    assert ids == [f"p{i+1}" for i in range(len(ids))]


# --- locate -----------------------------------------------------------------
def test_locate_phrase_then_word_fallback_case_insensitive():
    hits = locate(_RESUME, "organic growth")
    assert hits and hits[0]["match"].lower() == "organic growth"
    # whole phrase absent -> significant-word fallback ("where does it say education")
    hits2 = locate(_RESUME, "where does it say education")
    assert hits2 and any(h["match"].lower() == "education" for h in hits2)
    # case-insensitive
    assert locate(_RESUME, "PYTHON")


def test_locate_empty_query_or_text_is_empty():
    assert locate(_RESUME, "") == []
    assert locate("", "anything") == []


# --- document_refresh (plan + propose) --------------------------------------
def test_refresh_plan_from_stale_bullet():
    p = R.plan(_STALE_BULLET, year=2027)
    assert p["needs_sources"] is True
    assert any("Publicis Groupe" in q for q in p["queries"])
    assert p["old_values"] == ["+4.9%", "+5.2%"]


def test_refresh_propose_deterministic_swaps_figure_with_reasoning():
    research = analyze_block(_STALE_BULLET, year=2027)["research"]
    sources = [{
        "url": "https://publicisgroupe.com/ir", "title": "Publicis 2026 results",
        "text": "Publicis Groupe reported U.S. organic growth of +6.1% in 2026, up from prior years.",
    }]
    out = R.propose(_STALE_BULLET, sources, research=research)
    assert out["found"] is True
    assert "+6.1%" in out["draft"] and out["changes"][0]["new"] == "+6.1%"
    assert out["reasoning"] and out["sources"][0]["url"].startswith("https://")
    assert out["caution"]


def test_refresh_propose_no_sources_reports_not_found():
    out = R.propose(_STALE_BULLET, [], research=None)
    assert out["found"] is False and out["draft"] == _STALE_BULLET


def test_refresh_propose_sources_without_match_not_found():
    research = analyze_block(_STALE_BULLET, year=2027)["research"]
    out = R.propose(_STALE_BULLET, [{"url": "x", "title": "y", "text": "Unrelated weather news."}],
                    research=research)
    assert out["found"] is False


# --- endpoints --------------------------------------------------------------
def _client():
    state = AppState(exchanger=MockTokenExchanger())
    return TestClient(create_app(state=state)), state


def _auth(c, email="map@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "M"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _upload_resume(c, h, text=_RESUME):
    r = c.post("/api/v1/resumes/upload", headers=h,
               files={"file": ("resume.txt", text.encode(), "text/plain")})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_resume_map_endpoint():
    c, _ = _client()
    h = _auth(c)
    rid = _upload_resume(c, h)
    r = c.get(f"/api/v1/resumes/{rid}/map", headers=h)
    assert r.status_code == 200
    m = r.json()
    assert any(s["canon"] == "experience" for s in m["sections"])
    assert m["stats"]["bullets"] == 3


def test_document_locate_and_map_endpoints():
    c, _ = _client()
    h = _auth(c)
    r = c.post("/api/v1/documents/locate", headers=h,
               json={"text": _RESUME, "query": "Education"})
    assert r.status_code == 200 and r.json()["count"] >= 1
    r2 = c.post("/api/v1/documents/map", headers=h, json={"text": _RESUME, "kind": "resume"})
    assert r2.status_code == 200 and r2.json()["stats"]["flagged"] == 1


def test_refresh_metric_endpoint_plan_then_proposal():
    c, _ = _client()
    h = _auth(c)
    # no sources -> plan
    r = c.post("/api/v1/documents/refresh-metric", headers=h, json={"bullet": _STALE_BULLET})
    assert r.status_code == 200 and r.json()["stage"] == "plan"
    assert r.json()["queries"]
    # with sources -> proposal
    r2 = c.post("/api/v1/documents/refresh-metric", headers=h, json={
        "bullet": _STALE_BULLET,
        "sources": [{"url": "https://x.com", "title": "2026",
                     "text": "Publicis Groupe U.S. organic growth was +6.1% in 2026."}],
    })
    assert r2.status_code == 200 and r2.json()["stage"] == "proposal"


def test_refresh_metric_empty_bullet_400():
    c, _ = _client()
    h = _auth(c)
    assert c.post("/api/v1/documents/refresh-metric", headers=h, json={"bullet": "  "}).status_code == 400
