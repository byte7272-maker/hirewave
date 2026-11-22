"""Document compartmentalization: the section/bullet outline with anchors, stale-metric
analysis, keyword locate, and the web-assisted metric refresh (plan + propose)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.assistant import document_refresh as R
from jobsearch.engines.assistant import document_review as DR
from jobsearch.engines.assistant import session_scan as SS
from jobsearch.engines.assistant import summary_review as SR
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


def test_current_role_dated_metric_is_stale_and_refreshable():
    # A role the person STILL holds: its dated figures should be the latest period.
    a = analyze_block("Grew ARR 20% in FY2024.", year=2026, current_role=True)
    assert a["flags"] and a["flags"][0]["kind"] == "stale_metric"
    assert a["flags"][0]["current_role"] is True
    assert a["research"] and a["research"]["old_values"] == ["20%"]


def test_past_role_dated_metric_is_historical_not_stale():
    # A role already left: the figures are frozen history — recognized, not nagged to refresh.
    a = analyze_block("Boosted retention 30% in FY2016.", year=2026, current_role=False)
    kinds = [f["kind"] for f in a["flags"]]
    assert kinds == ["historical_metric"]
    assert a["flags"][0]["severity"] == "low"
    assert a["research"] is None  # nothing to search — a past job's numbers don't update


def test_unknown_role_defaults_to_refreshable():
    # No role context (summary line / standalone): treat a dated figure as a live claim.
    a = analyze_block("Grew ARR 20% in FY2024.", year=2026, current_role=None)
    assert a["flags"][0]["kind"] == "stale_metric"


def test_leading_action_verb_not_mistaken_for_entity():
    # "Drove"/"Led" open a bullet as verbs, not organizations, and must not poison the query.
    r = analyze_block("Grew ARR 20% in FY2024.", year=2026)["research"]
    assert r["entity"] == "" and "Grew" not in r["subject"]
    r2 = analyze_block("Led Acme Corp revenue to +15% in FY2023.", year=2026)["research"]
    assert r2["entity"] == "Acme Corp" and "FY2023" != r2["entity"]


def test_build_map_distinguishes_current_and_past_roles():
    resume = (
        "Jane Doe\nEngineer\n\n## Experience\n"
        "**Acme Corp** -- Senior Manager (2023 - Present)\n"
        "- Grew ARR 20% in FY2024.\n"
        "**OldCo** -- Analyst (2015 - 2018)\n"
        "- Boosted retention 30% in FY2016.\n\n## Skills\nPython\n"
    )
    m = build_map(resume, kind="resume", year=2026)
    current = next(b for b in m["blocks"] if "ARR" in b["text"])
    past = next(b for b in m["blocks"] if "retention" in b["text"])
    assert [f["kind"] for f in current["analysis"]["flags"]] == ["stale_metric"]
    assert [f["kind"] for f in past["analysis"]["flags"]] == ["historical_metric"]


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
    assert "+6.1%" in out["draft"] and out["new_value"] == "+6.1%"
    assert out["changes"][0]["new"].startswith("+6.1%")  # may carry the new period too
    assert out["reasoning"] and out["sources"][0]["url"].startswith("https://")
    assert out["caution"]


def test_llm_proposal_prompt_replaces_old_periods_not_keeps_them():
    # The rewrite must make the bullet CURRENT — replace the stale periods (FY2024/FY2025),
    # not append the new figure while leaving the old dates in.
    s = R._LLM_SYSTEM.lower()
    assert "replace the stale" in s
    assert "do not leave the old years" in s
    assert "collapse them to the single most-current" in s
    assert "found=false" in s  # still refuses honestly when no newer figure


def test_refresh_collapses_dated_series_and_drops_old_periods():
    # The refreshed bullet must not leave FY2024/FY2025 next to the new figure — the dated
    # series collapses to one current figure with the new period.
    research = analyze_block(_STALE_BULLET, year=2027)["research"]
    sources = [{
        "url": "https://publicisgroupe.com/ir", "title": "Publicis 2026 results",
        "text": "Publicis Groupe reported U.S. organic growth of +6.1% in 2026.",
    }]
    out = R.propose(_STALE_BULLET, sources, research=research)
    assert out["found"] is True
    assert "+6.1%" in out["draft"] and "2026" in out["draft"]
    assert "FY2024" not in out["draft"] and "FY2025" not in out["draft"]
    assert "+4.9%" not in out["draft"] and "+5.2%" not in out["draft"]
    # the surrounding prose is preserved
    assert out["draft"].startswith("Contributed to Publicis Groupe")
    assert "pitch support" in out["draft"]


def test_refresh_collapses_sibling_period_equal_to_found_year():
    # Regression: the found figure is for 2025 and the bullet also has FY2025 — the sibling
    # period must still be collapsed (not left as "+4.7% in 2025 FY2025").
    research = analyze_block(_STALE_BULLET, year=2026)["research"]
    sources = [{"url": "https://publicisgroupe.com/q1", "title": "Publicis Q1 2026",
                "text": "Publicis Groupe reported U.S. organic growth of +4.7% for 2025."}]
    out = R.propose(_STALE_BULLET, sources, research=research)
    assert out["found"] is True
    assert "FY2024" not in out["draft"] and "FY2025" not in out["draft"]
    assert out["draft"].count("2025") == 1  # the period appears once, not duplicated


def test_refresh_llm_draft_that_keeps_old_year_is_forced_current():
    import json

    class _StubLLM:  # updates the figure but lazily keeps the old FY dates
        def complete(self, prompt, system=""):
            return json.dumps({
                "found": True, "new_value": "+6.1%", "period": "2026",
                "changes": [{"old": "+4.9%", "new": "+6.1%"}],
                "draft": ("Contributed to Publicis Groupe's sustained U.S. organic growth "
                          "(+6.1% FY2024, +5.2% FY2025) by pioneering VIP and pitch support."),
            })

    research = analyze_block(_STALE_BULLET, year=2027)["research"]
    out = R.propose(_STALE_BULLET, [{"url": "https://x.com/ir", "title": "t",
                                     "text": "organic growth of +6.1% in 2026."}],
                    research=research, llm=_StubLLM())
    assert out["found"] is True
    assert "FY2024" not in out["draft"] and "FY2025" not in out["draft"]


def test_refresh_propose_no_sources_reports_not_found():
    out = R.propose(_STALE_BULLET, [], research=None)
    assert out["found"] is False and out["draft"] == _STALE_BULLET


def test_refresh_propose_sources_without_match_not_found():
    research = analyze_block(_STALE_BULLET, year=2027)["research"]
    out = R.propose(_STALE_BULLET, [{"url": "x", "title": "y", "text": "Unrelated weather news."}],
                    research=research)
    assert out["found"] is False


_WEAK_SUMMARY_RESUME = """John Williams
IT Director | New York, NY

## Summary
Results-driven professional seeking new challenges and growth opportunities.

## Experience
**Publicis Groupe** -- Global IT Director (2019 - Present)
- Cut incident response time by 38% through a new on-call rotation.
- Delivered global IT projects across AWS, Python, and Kubernetes.

## Skills
Python, AWS, Kubernetes, Leadership, Project Delivery
"""

_STRONG_SUMMARY_RESUME = """John Williams
IT Director | New York, NY

## Summary
IT Director with 12+ years leading global delivery in Python and AWS, cutting incident response 38%.

## Experience
**Publicis Groupe** -- Global IT Director (2019 - Present)
- Cut incident response time by 38% through a new on-call rotation.

## Skills
Python, AWS, Leadership
"""


# --- summary_review ---------------------------------------------------------
def test_summary_review_understands_and_lists_weaknesses_with_fixes():
    out = SR.review_summary(_WEAK_SUMMARY_RESUME, year=2027)
    assert out["present"] is True and out["fresh"] is False
    # it UNDERSTANDS the summary (a plain read of what it claims)
    assert out["understanding"]["reads_as"] and out["understanding"]["quantifies"] is False
    # every weakness carries a fix; the key ones are found
    kinds = {w["id"] for w in out["weaknesses"]}
    assert {"no_role", "cliche", "no_metric", "missing_skills"} <= kinds, kinds
    assert all(w["fix"] for w in out["weaknesses"])
    # it's stale because it omits the current role + top skills, and it proposes a rewrite
    assert out["stale_reasons"] and out["suggestion"]
    assert "IT Director" in out["suggestion"]
    assert out["fingerprint"]


def test_summary_review_gives_anchor_and_per_weakness_locate():
    # So the assistant can POINT at the summary and each finding (fixes "not focusing").
    out = SR.review_summary(_WEAK_SUMMARY_RESUME, year=2027)
    a = out["anchor"]
    assert a and _WEAK_SUMMARY_RESUME[a["char_start"]:a["char_end"]].lower().lstrip("# ").startswith(
        ("summary", "results"))
    # every weakness carries a locate key; the text-specific ones point at real text
    assert all("locate" in w for w in out["weaknesses"])
    cliche = next((w for w in out["weaknesses"] if w["id"] == "cliche"), None)
    if cliche:
        assert cliche["locate"] and cliche["locate"].lower() in _WEAK_SUMMARY_RESUME.lower()


def test_summary_review_script_is_gapless_and_ends_with_one_ask():
    # The ordered narration script so the client never has to assemble lines or go silent.
    out = SR.review_summary(_WEAK_SUMMARY_RESUME, year=2027)
    script = out["script"]
    assert script and all(s["say"].strip() for s in script)          # never a silent step
    assert script[0]["state"] == "understanding"                      # opens with the real read
    asks = [s for s in script if s["ask"]]
    assert len(asks) == 1 and script[-1] is asks[0]                   # exactly one, at the end
    # a text-specific finding carries its locate into the script
    assert any(s["weakness_id"] == "cliche" and s["locate"] for s in script)


def test_summary_review_script_fresh_and_missing_paths():
    # fresh (in-sync, concise) summary → a single-ask fresh close, no weakness steps
    strong = ("Name\nIT Director\n\n## Summary\nIT Director with 12+ years leading global "
              "delivery in Python and AWS, cutting incident response time 38 percent.\n\n"
              "## Experience\n**Acme** -- IT Director (2019 - Present)\n- Cut response 38%.\n\n"
              "## Skills\nPython, AWS, Leadership\n")
    fresh = SR.review_summary(strong, year=2027)
    assert fresh["script"][-1]["state"] == "fresh" and fresh["script"][-1]["ask"] is True
    # no summary → a single missing/offer-to-draft step
    missing = SR.review_summary("Name\nIT Director\n\n## Experience\n- did things", year=2027)
    assert len(missing["script"]) == 1 and missing["script"][0]["state"] == "missing"


def test_summary_review_fingerprint_is_deterministic():
    a = SR.review_summary(_WEAK_SUMMARY_RESUME, year=2027)["fingerprint"]
    b = SR.review_summary(_WEAK_SUMMARY_RESUME, year=2027)["fingerprint"]
    assert a == b and a  # stable → the client won't think the doc keeps changing


def test_summary_review_fresh_when_in_sync():
    out = SR.review_summary(_STRONG_SUMMARY_RESUME, year=2027)
    # a role-led, quantified, skill-bearing, current summary is fresh with few/no weaknesses
    assert out["fresh"] is True and out["stale_reasons"] == []
    assert out["understanding"]["states_role"] and out["understanding"]["quantifies"]


def test_summary_review_detects_major_change_via_fingerprint():
    out = SR.review_summary(_STRONG_SUMMARY_RESUME, year=2027, last_fingerprint="stale00000000")
    assert out["changed_since_review"] is True
    assert "changed since" in out["stale_reasons"][0]


def test_summary_review_empty_summary_flags_missing():
    no_summary = "John Williams\nIT Director\n\n## Experience\n- Did things.\n"
    out = SR.review_summary(no_summary)
    assert out["present"] is False
    assert out["weaknesses"] and out["weaknesses"][0]["id"] == "missing"


_COVER_LETTER = """John Williams
123 Main St | john@x.com
November 18, 2026

To Whom It May Concern,

I am writing to apply. I have done many things over the years and would be a good fit
for your team based on my broad background and work ethic.

In my last role I supported delivery and helped the team hit goals in FY2024, improving
things by 38% through better process and planning across the group.

Sincerely,
John Williams
"""


# --- document_review (whole résumé + cover letter) --------------------------
def test_document_review_walks_every_resume_section_and_offers_to_read():
    out = DR.review_document(_RESUME, year=2027)
    assert out["kind"] == "resume"
    # it VISITS every section, in reading order
    assert [s["canon"] for s in out["sections"]] == [
        "header", "summary", "experience", "education", "skills"]
    # the script OFFERS to read first (an ask), then narrates, then a closing ask
    assert out["script"][0]["state"] == "offer" and out["script"][0]["ask"] is True
    assert out["script"][-1]["state"] == "close" and out["script"][-1]["ask"] is True
    assert all(s["say"].strip() for s in out["script"])          # never a silent step
    # experience is walked per role (the stale FY figure bullet is flagged)
    exp = next(s for s in out["sections"] if s["canon"] == "experience")
    assert any(f["section"] == "experience" for f in out["findings"])
    assert exp["anchor"] and exp["anchor"]["char_start"] < exp["anchor"]["char_end"]


def test_document_review_cover_letter_walks_greeting_to_closing():
    out = DR.review(_COVER_LETTER, kind="cover_letter", year=2027)
    assert out["kind"] == "cover_letter"
    assert [s["canon"] for s in out["sections"]] == ["greeting", "opening", "body", "closing"]
    ids = {f["id"] for f in out["findings"]}
    assert "generic_greeting" in ids          # "To Whom It May Concern"
    assert "no_cta" in ids                     # no call to action
    assert any(f["id"] == "stale_metric" and f["locate"] == "38%" for f in out["findings"])
    assert out["script"][0]["state"] == "offer" and out["script"][0]["ask"] is True


def test_document_review_dispatch_by_kind():
    assert DR.review(_RESUME, kind="resume")["kind"] == "resume"
    assert DR.review(_COVER_LETTER, kind="cover_letter")["kind"] == "cover_letter"


def test_document_review_refreshes_current_role_not_a_past_one():
    resume = (
        "Jane Doe\nEngineer | NYC\n\n## Summary\nEngineering leader.\n\n## Experience\n"
        "**Acme Corp** -- Senior Manager (2023 - Present)\n"
        "- Grew ARR 20% in FY2024.\n\n"
        "**OldCo** -- Analyst (2015 - 2018)\n"
        "- Boosted retention 30% in FY2016.\n\n## Skills\nPython, AWS, Leadership, Delivery\n"
    )
    out = DR.review_document(resume, year=2026)
    stale = [f for f in out["findings"] if f["id"] == "role_stale"]
    # only the current role (Acme) is flagged to refresh; the past role (OldCo) is not
    assert len(stale) == 1
    assert "still hold" in stale[0]["detail"].lower()


# --- session_scan (proactive once-per-session) ------------------------------
def _ns(**kw):
    from types import SimpleNamespace
    return SimpleNamespace(**kw)


def test_session_scan_prioritizes_error_then_reportable_then_activity():
    from datetime import datetime, timezone
    errs = [_ns(kind="network", resolved=False, at=datetime(2026, 11, 17, tzinfo=timezone.utc)),
            _ns(kind="mic_no_input", resolved=False, at=datetime(2026, 11, 18, tzinfo=timezone.utc))]
    acts = [_ns(verb="tailored", subject_type="resume", subject_id="r1", subject_label="IT Director",
                topic="documents", detail="", at=datetime(2026, 11, 17, tzinfo=timezone.utc),
                meta={}, phrase=lambda: 'tailored résumé "IT Director"')]
    reps = [{"severity": "medium", "title": "Summary may be out of date",
             "message": "your summary has drifted", "action": {"intent": "review_summary", "slots": {}}}]
    b = SS.scan(errors=errs, activity_events=acts, reportables=reps)
    assert [i["kind"] for i in b["items"]] == ["error", "reportable", "activity"]
    assert b["has_error"] and b["has_reportable"] and b["speak"].startswith("Welcome back.")


def test_session_scan_ignores_non_severe_errors_and_empty_is_caught_up():
    # a bad mic read / nonsense is handled live, never surfaced proactively later
    assert SS.is_severe("network") and not SS.is_severe("mic_no_input") and not SS.is_severe("nonsense_input")
    b = SS.scan(errors=[], activity_events=[], reportables=[])
    assert b["count"] == 0 and "caught up" in b["speak"]


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


def test_refresh_metric_runs_server_side_search_when_cse_configured(monkeypatch):
    # With Google Programmable Search configured, the plan runs the search server-side
    # (no client CAPTCHA) and returns safety-filtered result URLs for the client to fetch.
    import json as _json

    from jobsearch.engines.assistant import web_search

    c, state = _client()
    state.settings.google_cse_key = "k"
    state.settings.google_cse_cx = "cx"
    assert state.settings.research_search_provider() == "google"

    def _fake(url, timeout):
        if "customsearch/v1" in url:
            return 200, _json.dumps({"items": [
                {"title": "Publicis 2026 results", "link": "https://investor.publicisgroupe.com/2026",
                 "snippet": "organic growth"},
                {"title": "insecure", "link": "http://insecure.example.com/x", "snippet": "no"},
                {"title": "torrent", "link": "https://1337x.to/t/1", "snippet": "no"},
            ]})
        return 404, ""  # page fetches fail -> no server-side proposal -> plan with results
    monkeypatch.setattr(web_search, "_default_fetch", _fake)

    h = _auth(c)
    r = c.post("/api/v1/documents/refresh-metric", headers=h, json={"bullet": _STALE_BULLET})
    assert r.status_code == 200
    body = r.json()
    assert body["stage"] == "plan" and body["search_done"] is True
    urls = [s["url"] for s in body["search_results"]]
    assert "https://investor.publicisgroupe.com/2026" in urls
    # insecure + torrent results were safety-filtered out
    assert all(u.startswith("https://") for u in urls)
    assert not any("1337x" in u for u in urls)


def test_refresh_metric_server_side_fetch_returns_a_proposal(monkeypatch):
    # With a search provider set, a single {bullet} call searches, fetches the public
    # result pages SERVER-SIDE, and passes their text to propose — returning a finished
    # proposal with no client round-trip. (propose itself is tested separately; mock it
    # so this verifies the endpoint wiring: search -> fetch_page -> propose.)
    import json as _json

    from jobsearch.engines.assistant import document_refresh, web_search
    from jobsearch.engines.assistant.web_search import SearchResponse, SearchResult

    c, state = _client()
    state.settings.brave_search_key = "B"  # provider = brave -> server-side search path

    # The search returns one public result URL (brave uses its own fetcher, so patch search).
    monkeypatch.setattr(web_search, "search", lambda q, **kw: SearchResponse(
        provider="brave",
        results=[SearchResult(title="Publicis H1 2026",
                              url="https://www.publicisgroupe.com/h1-2026", snippet="results")]))
    # fetch_page uses _default_fetch to pull the public page server-side.
    monkeypatch.setattr(web_search, "_default_fetch", lambda u, t: (
        200, "<html><body><p>Publicis Groupe U.S. organic growth was +6.1% in 2026, "
             "accelerating from prior periods with strong momentum.</p></body></html>"))

    captured: dict = {}

    def _fake_propose(bullet, sources, **kw):
        captured["sources"] = sources
        return {"found": True, "draft": "updated bullet with +6.1% in 2026",
                "reasoning": "newer figure found", "changes": [], "sources": sources}
    monkeypatch.setattr(document_refresh, "propose", _fake_propose)

    h = _auth(c)
    r = c.post("/api/v1/documents/refresh-metric", headers=h, json={"bullet": _STALE_BULLET})
    assert r.status_code == 200
    body = r.json()
    assert body["stage"] == "proposal" and body["found"] is True
    # the endpoint fetched the public page server-side and handed its text to propose
    assert captured["sources"] and "6.1%" in captured["sources"][0]["text"]


def test_saving_a_body_only_version_keeps_name_and_summary():
    # Regression: an editor that saves only the body (text starts at a section heading,
    # no name line) must NOT drop the candidate's name or summary.
    c, _ = _client()
    h = _auth(c)
    rid = _upload_resume(c, h, _RESUME)  # has "John Williams" + a ## Summary
    body_only = ("## Experience\n**Publicis Groupe** — Global IT Director (2019 - Present)\n"
                 "- Cut incident response time by 41%.\n\n## Skills\nPython, AWS, Kubernetes\n")
    r = c.post(f"/api/v1/resumes/{rid}/versions", headers=h, json={"content": body_only})
    assert r.status_code == 200
    text = r.json()["rendered_text"]
    assert "John Williams" in text          # name preserved
    assert "Technology leader" in text       # summary preserved
    assert "41%" in text and "Kubernetes" in text  # the real edit is kept
    # a NORMAL save (text leads with a name) is untouched
    normal = "Jane Doe\nPM | NYC\n\n## Summary\nProduct leader.\n\n## Experience\n- Shipped things.\n"
    r2 = c.post(f"/api/v1/resumes/{rid}/versions", headers=h, json={"content": normal})
    assert r2.status_code == 200 and r2.json()["rendered_text"].startswith("Jane Doe")


def test_headerless_save_on_a_headerless_resume_is_not_fabricated():
    # When the résumé itself has no header (a bare bullet list), a body-only save must NOT
    # fabricate or duplicate a header — the guard only preserves a real identity block.
    c, _ = _client()
    h = _auth(c)
    rid = _upload_resume(c, h, "- Responsible for billing\n- Worked on the API\n")
    bullets = "- Responsible for billing\n- Worked on the API\n- Added tests\n"
    r = c.put(f"/api/v1/resumes/{rid}", headers=h, json={"rendered_text": bullets})
    assert r.status_code == 200 and r.json()["rendered_text"] == bullets


def test_refresh_metric_empty_bullet_400():
    c, _ = _client()
    h = _auth(c)
    assert c.post("/api/v1/documents/refresh-metric", headers=h, json={"bullet": "  "}).status_code == 400


def test_full_review_endpoints_and_log_activity():
    c, _ = _client()
    h = _auth(c)
    rid = _upload_resume(c, h, _RESUME)
    r = c.get(f"/api/v1/resumes/{rid}/full-review", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "resume"
    assert [s["canon"] for s in body["sections"]] == [
        "header", "summary", "experience", "education", "skills"]
    assert body["script"][0]["state"] == "offer"
    # the review is recorded in activity (so the assistant can recite it later)
    acts = c.get("/api/v1/assistant/activity", headers=h).json()
    assert acts["by_verb"].get("reviewed", 0) >= 1
    # live-buffer variant dispatches on kind
    r2 = c.post("/api/v1/documents/full-review", headers=h,
                json={"text": _COVER_LETTER, "kind": "cover_letter"})
    assert r2.status_code == 200 and r2.json()["kind"] == "cover_letter"


def test_session_scan_endpoint_reports_and_runs_once_per_session():
    c, _ = _client()
    h = _auth(c)
    _upload_resume(c, h, _WEAK_SUMMARY_RESUME)  # a drifted summary → a reportable
    r = c.get("/api/v1/assistant/session-scan", headers=h, params={"session_id": "s1"})
    assert r.status_code == 200
    body = r.json()
    assert body["repeat"] is False and body["speak"]
    assert any(i["kind"] == "reportable" for i in body["items"])
    # same session id again → runs only once
    again = c.get("/api/v1/assistant/session-scan", headers=h, params={"session_id": "s1"}).json()
    assert again["repeat"] is True and again["items"] == []


def test_summary_review_endpoints():
    c, _ = _client()
    h = _auth(c)
    rid = _upload_resume(c, h, _WEAK_SUMMARY_RESUME)
    r = c.get(f"/api/v1/resumes/{rid}/summary-review", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["present"] and not body["fresh"] and body["weaknesses"]
    fp = body["fingerprint"]
    # a stored fingerprint that no longer matches → "changed since" prompt
    r2 = c.get(f"/api/v1/resumes/{rid}/summary-review", headers=h,
               params={"last_fingerprint": "does-not-match"})
    assert r2.json()["changed_since_review"] is True
    # live-buffer variant with the SAME fingerprint → not a major-change prompt
    r3 = c.post("/api/v1/documents/summary-review", headers=h,
                json={"text": _WEAK_SUMMARY_RESUME, "last_fingerprint": fp})
    assert r3.status_code == 200 and r3.json()["changed_since_review"] is False
