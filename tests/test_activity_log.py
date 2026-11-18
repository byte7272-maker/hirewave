"""Activity log: recording real actions, aggregation, the function catalog, and the
assistant's plain-language answers in different forms."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.assistant import activity_log as al
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import ActivityEvent
from jobsearch.models.common import utcnow


def _ev(verb, subject_type, label="", topic="documents", subject_id="x", ago_min=0):
    return ActivityEvent(
        user_id="u", verb=verb, subject_type=subject_type, subject_label=label,
        subject_id=subject_id, topic=topic, at=utcnow() - timedelta(minutes=ago_min))


# --- pure engine ------------------------------------------------------------
def test_summarize_counts_by_verb_subject_topic():
    events = [
        _ev("tailored", "resume", "Data Analyst", subject_id="r1"),
        _ev("tailored", "resume", "Data Analyst", subject_id="r1", ago_min=5),
        _ev("edited", "resume", "PM", subject_id="r2", ago_min=10),
        _ev("applied", "application", "Acme", topic="applications", subject_id="a1", ago_min=1),
    ]
    s = al.summarize(events)
    assert s["total"] == 4
    assert s["by_verb"]["tailored"] == 2
    assert s["by_topic"]["documents"] == 3 and s["by_topic"]["applications"] == 1
    # subjects ranked by count — r1 (2) first
    assert s["subjects"][0]["subject_id"] == "r1" and s["subjects"][0]["count"] == 2


def test_filter_by_verb_and_subject():
    events = [_ev("tailored", "resume", subject_id="r1"), _ev("edited", "resume", subject_id="r1"),
              _ev("tailored", "resume", subject_id="r2")]
    assert len(al.filter_events(events, verb="tailored")) == 2
    assert len(al.filter_events(events, subject_id="r1")) == 2
    assert len(al.filter_events(events, verb="tailored", subject_id="r2")) == 1


def test_answer_count_form():
    events = [_ev("tailored", "resume"), _ev("tailored", "resume"), _ev("edited", "resume")]
    out = al.answer("how many times have I tailored my résumé?", events)
    assert out["form"] == "count" and out["count"] == 2
    assert "twice" in out["reply"].lower()
    # none-yet reads honestly
    out0 = al.answer("how many times have I applied?", events)
    assert out0["count"] == 0 and "haven't" in out0["reply"].lower()


def test_answer_which_resumes_list():
    events = [
        _ev("tailored", "resume", "Data Analyst", subject_id="r1"),
        _ev("edited", "resume", "Data Analyst", subject_id="r1"),
        _ev("edited", "resume", "Product Manager", subject_id="r2"),
    ]
    out = al.answer("which résumés have I worked on?", events)
    assert out["form"] == "list" and len(out["subjects"]) == 2
    assert "Data Analyst" in out["reply"] and "Product Manager" in out["reply"]


def test_answer_recent_by_topic():
    events = [
        _ev("synced", "resume", "Data Analyst", topic="sync", ago_min=2),
        _ev("applied", "application", "Acme", topic="applications", ago_min=1),
        _ev("tailored", "resume", "Data Analyst", ago_min=30),
    ]
    out = al.answer("what have I done lately with my résumé?", events)
    assert out["form"] == "recent" and out["events"]
    # scoped to résumé subject → no application event in the recited list
    assert all(e["subject_type"] == "resume" for e in out["events"])


def test_answer_functions_catalog():
    out = al.answer("what can you do?", [])
    assert out["form"] == "functions" and len(out["functions"]) >= 8
    # the assistant knows the résumé UPLOAD function explicitly
    assert any("upload" in f["title"].lower() for f in out["functions"])
    assert any("résumé" in f["title"].lower() or "match" in f["title"].lower() for f in out["functions"])
    # topic-scoped overview
    docs = al.functions_overview("documents")
    assert docs["form"] == "functions" and all(f["topic"] == "documents" for f in docs["functions"])


def test_answer_howto_upload_and_sync_with_steps():
    up = al.answer("how do I upload my résumé?", [])
    assert up["form"] == "how_to" and up["steps"]
    assert any("upload" in s.lower() or "pick your file" in s.lower() for s in up["steps"])
    sync = al.answer("what do I need to put my résumé on a job site?", [])
    assert sync["form"] == "how_to" and sync["requirements"]
    # the sync requirements name the extension setup (install / enable / link)
    reqtext = " ".join(sync["requirements"]).lower()
    assert "extension" in reqtext and "link" in reqtext
    # a site name routes to the sync how-to too
    assert al.answer("how do I update my résumé on Indeed?", [])["form"] == "how_to"


def test_kb_knows_document_mastery_and_summary_features():
    # The KB covers the P275/P276 capabilities so the assistant can answer "what can you do".
    docs = al.functions_overview("documents")
    titles = " | ".join(f["title"].lower() for f in docs["functions"])
    for cue in ("navigate", "sharpen a bullet", "refresh dated numbers", "summary fresh"):
        assert cue in titles, (cue, titles)


def test_answer_howto_routes_refresh_summary_and_navigation():
    assert al.answer("how do I refresh an old number?", [])["title"].lower().startswith("refresh a dated")
    assert "summary" in al.answer("how do I check my summary?", [])["title"].lower()
    assert "highlight" in al.answer("how do I highlight a word?", [])["title"].lower()
    # a plain "update my résumé on Indeed" still routes to sync, not the figure-refresh how-to
    assert al.answer("how do I update my résumé on Indeed?", [])["title"].lower().startswith("put your")


def test_answer_sites_what_is_where_and_when():
    events = [
        _ev("synced", "resume", "Data Analyst", topic="sync", ago_min=120),
        _ev("synced", "resume", "Product Manager", topic="sync", ago_min=5),
    ]
    events[0].meta = {"board": "indeed", "board_label": "Indeed"}
    events[1].meta = {"board": "linkedin", "board_label": "LinkedIn"}
    out = al.answer("what have I put on which sites?", events)
    assert out["form"] == "sites" and len(out["sites"]) == 2
    # newest-updated first (LinkedIn), and the résumé + relative time are in the reply
    assert out["sites"][0]["board"] == "linkedin"
    assert "LinkedIn" in out["reply"] and "Indeed" in out["reply"]
    # scoped to one named site
    one = al.answer("what's on Indeed?", events)
    assert one["form"] == "sites" and len(one["sites"]) == 1 and one["sites"][0]["board"] == "indeed"
    # nothing synced yet reads honestly
    assert al.answer("which sites have my résumé?", [])["sites"] == []


def test_sites_distinguishes_on_site_from_pinned_default():
    # a PIN is internal (nothing uploaded) — never reported as "on the site"
    pin = _ev("pinned", "resume", "Data Analyst", topic="sync")
    pin.meta = {"board": "indeed", "board_label": "Indeed"}
    out = al.answer("what's on Indeed?", [pin])
    assert out["sites"][0]["on_site"] is False
    assert "not uploaded" in out["reply"].lower()
    # an actual sync IS on the site
    sync = _ev("synced", "resume", "Data Analyst", topic="sync")
    sync.meta = {"board": "indeed", "board_label": "Indeed"}
    out2 = al.answer("what's on Indeed?", [sync])
    assert out2["sites"][0]["on_site"] is True
    assert "is on it" in out2["reply"].lower()


def test_answer_summary_default_and_empty():
    # a neutral request with no count/which/recent/capability cue → overall summary
    empty = al.answer("give me an overview", [])
    assert empty["form"] == "summary" and empty["summary"]["total"] == 0
    assert "no activity" in empty["reply"].lower()
    out = al.answer("give me an overview", [_ev("tailored", "resume"), _ev("applied", "application", topic="applications")])
    assert out["form"] == "summary" and out["summary"]["total"] == 2
    # "tell me about my activity" reasonably reads as a recency request
    assert al.answer("tell me about my activity", [])["form"] == "recent"


# --- endpoints + real recording ---------------------------------------------
def _client():
    state = AppState(exchanger=MockTokenExchanger())
    return TestClient(create_app(state=state)), state


def _auth(c, email="act@x.com"):
    c.post("/api/v1/auth/register", json={"email": email, "password": "supersecret", "full_name": "A"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "supersecret"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def test_upload_records_activity_and_ask_endpoint():
    c, _ = _client()
    h = _auth(c)
    c.post("/api/v1/resumes/upload", headers=h,
           files={"file": ("Data Analyst.md", b"# Me\n- x", "text/markdown")})

    # the activity endpoint shows the uploaded event
    act = c.get("/api/v1/assistant/activity", headers=h).json()
    assert act["total"] >= 1
    assert any(e["verb"] == "uploaded" and e["subject_type"] == "resume" for e in act["events"])

    # the assistant answers a count question in plain language
    ask = c.post("/api/v1/assistant/ask", headers=h, json={"query": "how many résumés have I uploaded?"}).json()
    assert ask["form"] == "count" and ask["count"] >= 1


def test_sync_records_board_and_ask_reports_sites():
    from jobsearch.models import Provider
    c, state = _client()
    h = _auth(c)
    uid = state.users.find(email="act@x.com")[0].id
    state.integration.tokens.save(user_id=uid, provider=Provider.INDEED, access_token="t", account_email="")
    up = c.post("/api/v1/resumes/upload", headers=h,
                files={"file": ("Data Analyst.md", b"# Me\n- x", "text/markdown")}).json()
    # mark it synced on Indeed
    c.post("/api/v1/documents/board-sync", headers=h,
           json={"board": "indeed", "doc_type": "resume", "resume_id": up["id"]})
    out = c.post("/api/v1/assistant/ask", headers=h, json={"query": "what's on Indeed?"}).json()
    assert out["form"] == "sites" and out["sites"] and out["sites"][0]["board"] == "indeed"
    assert "Indeed" in out["reply"]


def test_functions_endpoint_knows_app():
    c, _ = _client()
    h = _auth(c)
    r = c.get("/api/v1/assistant/functions", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["form"] == "functions" and len(body["functions"]) >= 8


def test_activity_endpoints_require_auth():
    c, _ = _client()
    assert c.get("/api/v1/assistant/activity").status_code == 401
    assert c.post("/api/v1/assistant/ask", json={"query": "hi"}).status_code == 401
