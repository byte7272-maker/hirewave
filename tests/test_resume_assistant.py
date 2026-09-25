"""Résumé assistant — review (suggestions/score) + prompt-controlled revise."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.resume_assistant import ResumeAssistant
from jobsearch.models import CoverLetter, JobPosting, Resume, ResumeSource


def _resume(text: str) -> Resume:
    return Resume(user_id="u1", source=ResumeSource.UPLOADED, rendered_text=text)


def _cover(text: str, job_id=None) -> CoverLetter:
    return CoverLetter(user_id="u1", job_posting_id=job_id, content=text)


# --- engine: review ---------------------------------------------------------
def test_review_flags_missing_metrics_and_weak_verbs():
    r = _resume(
        "Experience\n- Responsible for the billing system\n- Worked on the API\n"
        "- Helped with deployments"
    )
    review = ResumeAssistant().review(r)
    cats = {s.category for s in review.suggestions}
    assert "impact" in cats  # weak verbs + no metrics
    titles = " ".join(s.title.lower() for s in review.suggestions)
    assert "action verb" in titles or "quantify" in titles
    assert 0 <= review.score <= 100
    assert review.word_count > 0
    assert review.summary


def test_review_rewards_strong_resume():
    r = _resume(
        "Summary\nSenior engineer.\nExperience\n"
        "- Led migration of billing to event-driven services, cutting p99 latency 40%\n"
        "- Drove a redesign that increased conversion 12% and saved $200k/yr\n"
        "- Built a data pipeline processing 5M events/day, mentoring 3 engineers\n"
        "Skills: Python, AWS, Kafka, leadership, distributed systems, mentoring."
    )
    review = ResumeAssistant().review(r)
    assert review.score >= 80
    assert review.strengths


def test_review_missing_keywords_from_job():
    r = _resume("- Led backend services in Python\n- Built REST APIs handling 2k req/s")
    job = JobPosting(title="Staff Engineer", company="Acme", requirements=["Python", "Rust", "Kubernetes"])
    review = ResumeAssistant().review(r, job=job)
    assert "Rust" in review.missing_keywords and "Kubernetes" in review.missing_keywords
    assert "Python" not in review.missing_keywords
    assert any(s.category == "keywords" for s in review.suggestions)


def test_review_flags_ats_completeness_and_pronouns():
    # Expert rubric checks (adapted from the ats-screener dimensions + XYZ formula):
    # multi-column layout, missing sections, and first-person pronouns are surfaced.
    r = _resume(
        "Name | City | 2021-2024 | Remote\n"
        "- I was responsible for the billing system\n"
        "- Worked on the API"
    )
    review = ResumeAssistant().review(r)
    cats = {s.category for s in review.suggestions}
    assert "ats" in cats  # the ' | ' column layout is flagged
    assert "sections" in cats  # no Education/Skills/contact
    assert "clarity" in cats  # first-person 'I'
    standards = {rt.standard for rt in review.ratings}
    assert {"ATS parseability", "Completeness"} <= standards  # richer breakdown
    # the quantify suggestion now teaches the XYZ formula
    assert any("xyz" in s.title.lower() or "xyz" in s.detail.lower() for s in review.suggestions)


def test_review_empty_resume_safe():
    review = ResumeAssistant().review(_resume("   "))
    assert review.suggestions == [] and "No readable" in review.summary


# --- engine: revise ---------------------------------------------------------
def test_revise_returns_preview():
    r = _resume("- Responsible for the billing system\n- Worked on the API")
    rev = ResumeAssistant().revise(r, "Make it more concise and lead with strong verbs")
    assert rev.resume_id == r.id
    assert rev.instruction.startswith("Make it more concise")
    assert rev.preview  # non-empty rewrite


def test_revise_requires_instruction_and_text():
    r = _resume("- Some real content here")
    try:
        ResumeAssistant().revise(r, "  ")
        assert False
    except ValueError:
        pass
    try:
        ResumeAssistant().revise(_resume(""), "tidy it up")
        assert False
    except ValueError:
        pass


# --- engine: improve targets the review's points ---------------------------
class _RecordingLLM:
    """Captures the last prompt and returns a minimal valid JSON Resume so the
    LLM path (not the fallback) runs."""

    name = "recording"

    def __init__(self) -> None:
        self.last_prompt = ""

    def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500) -> str:
        self.last_prompt = prompt
        return '{"basics": {"name": "Sam Rivera"}, "work": [], "skills": []}'


def test_improve_structured_injects_focus_points():
    llm = _RecordingLLM()
    r = _resume("- Responsible for the billing system\n- Worked on the API")
    ResumeAssistant(llm=llm).improve_structured(
        r, focus_points=["Quantify impact with the XYZ formula: add %/$ numbers"]
    )
    assert "Prioritize fixing these specific issues" in llm.last_prompt
    assert "Quantify impact with the XYZ formula" in llm.last_prompt


def test_improve_structured_without_points_has_no_review_block():
    llm = _RecordingLLM()
    ResumeAssistant(llm=llm).improve_structured(_resume("- Built the API and shipped it"))
    assert "Prioritize fixing these specific issues" not in llm.last_prompt


# --- engine: span rephrase --------------------------------------------------
def test_rephrase_word_fallback_gives_stronger_alternatives():
    # No usable LLM output -> deterministic fallback maps a weak word to stronger verbs.
    opts = ResumeAssistant().rephrase("responsible for", mode="word")
    assert "owned" in opts or "led" in opts
    assert "responsible for" not in [o.lower() for o in opts]


def test_rephrase_empty_returns_nothing():
    assert ResumeAssistant().rephrase("   ") == []


def test_rephrase_uses_llm_options_when_available():
    llm = _RecordingLLM()
    llm.complete = lambda *a, **k: '["Drove the billing overhaul", "Led the billing rebuild"]'  # type: ignore
    opts = ResumeAssistant(llm=llm).rephrase(
        "Worked on the billing system", mode="sentence", instruction="stronger verbs"
    )
    assert opts[:2] == ["Drove the billing overhaul", "Led the billing rebuild"]


def test_rephrase_dedupes_and_drops_the_original():
    llm = _RecordingLLM()
    llm.complete = lambda *a, **k: '["good", "Good", "strong", "solid"]'  # type: ignore
    opts = ResumeAssistant(llm=llm).rephrase("good", mode="word", count=3)
    assert opts == ["strong", "solid"]  # "good"/"Good" (== input) removed, deduped


# --- engine: incorporate user ideas -----------------------------------------
def test_incorporate_fallback_includes_the_points():
    # With no usable LLM output, the deterministic merge still adds the candidate's
    # points (as work highlights when there's an experience section).
    r = _resume("## Experience\n**Acme** — Engineer\n- Built the API")
    data = ResumeAssistant().incorporate(
        r, ["Led the billing migration", "Mentored 3 junior engineers"]
    )
    blob = " ".join(data.work[0].highlights) if data.work else data.basics.summary
    assert "billing migration" in blob and "Mentored 3" in blob


def test_incorporate_uses_llm_and_weaves_points():
    llm = _RecordingLLM()
    r = _resume("## Experience\n- Built the API")
    ResumeAssistant(llm=llm).incorporate(r, ["Cut cloud spend 20%"], instruction="emphasise impact")
    assert "Additional points the candidate wants incorporated" in llm.last_prompt
    assert "Cut cloud spend 20%" in llm.last_prompt


# --- engine: cover letters --------------------------------------------------
def test_cover_letter_review_flags_cliches_and_generic():
    cl = _cover(
        "To whom it may concern, I am writing to express my interest in this role. "
        "I am a hard worker and a team player who can hit the ground running."
    )
    review = ResumeAssistant().review_cover_letter(cl)
    titles = " ".join(s.title.lower() for s in review.suggestions)
    assert "generic" in titles  # clichés flagged
    assert any(s.category == "impact" for s in review.suggestions)  # no metric
    assert 0 <= review.score <= 100 and review.summary


def test_cover_letter_review_wants_company_named():
    cl = _cover(
        "Dear Hiring Manager, I led a team that grew revenue 30% last year and would "
        "bring that same focus here. Sincerely, Sam."
    )
    job = JobPosting(title="PM", company="Acme", requirements=[])
    review = ResumeAssistant().review_cover_letter(cl, job=job)
    assert any(s.title == "Name the company" for s in review.suggestions)


def test_cover_letter_revise_preview():
    cl = _cover("Dear team, I want the job. Thanks.")
    rev = ResumeAssistant().revise_cover_letter(cl, "Make it warmer and more specific")
    assert rev.cover_letter_id == cl.id and rev.preview


# --- API --------------------------------------------------------------------
def _auth(client, email="ra@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "RA"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


def _upload(client, h, text):
    return client.post(
        "/api/v1/resumes/upload", headers=h,
        files={"file": ("cv.md", text.encode(), "text/markdown")},
    ).json()


def test_api_review_and_revise_flow():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    res = _upload(client, h, "- Responsible for the billing system\n- Worked on the API")
    rid = res["id"]

    rev = client.post(f"/api/v1/resumes/{rid}/review", headers=h, json={})
    assert rev.status_code == 200
    body = rev.json()
    assert body["resume_id"] == rid and 0 <= body["score"] <= 100
    assert isinstance(body["suggestions"], list) and body["summary"]

    r = client.post(f"/api/v1/resumes/{rid}/revise", headers=h, json={"instruction": "Make it punchier"})
    assert r.status_code == 200
    prev = r.json()["preview"]
    assert prev
    # apply the preview via the existing update endpoint (human-in-the-loop)
    upd = client.put(f"/api/v1/resumes/{rid}", headers=h, json={"rendered_text": prev})
    assert upd.status_code == 200 and upd.json()["rendered_text"] == prev


def test_api_revise_no_prompt_does_general_improve():
    # A bare "Improve" with no specific prompt still produces a rewrite (general
    # improvement) rather than erroring, so the button always does something.
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    res = _upload(client, h, "- Some content here to improve")
    r = client.post(f"/api/v1/resumes/{res['id']}/revise", headers=h, json={"instruction": "   "})
    assert r.status_code == 200 and r.json()["preview"]


def test_api_improve_structured_links_the_summary_points():
    # The improve flow should target the SAME points the AI summary/review surfaces:
    # a metric-less resume's review flags "Quantify impact", so that must reach the
    # improve prompt even though the client sent no explicit focus_points.
    state = AppState(exchanger=MockTokenExchanger())
    rec = _RecordingLLM()
    state.resume_assistant.llm = rec  # capture the improve prompt
    client = TestClient(create_app(state=state))
    h = _auth(client)
    res = _upload(client, h, "- Responsible for the billing system\n- Worked on the API")
    r = client.post(f"/api/v1/resumes/{res['id']}/improve-structured", headers=h, json={})
    assert r.status_code == 200
    assert "Prioritize fixing these specific issues" in rec.last_prompt
    assert "Quantify impact" in rec.last_prompt  # a derived review point


def test_api_improve_structured_honors_explicit_focus_points():
    state = AppState(exchanger=MockTokenExchanger())
    rec = _RecordingLLM()
    state.resume_assistant.llm = rec
    client = TestClient(create_app(state=state))
    h = _auth(client)
    res = _upload(client, h, "- Built the API")
    r = client.post(
        f"/api/v1/resumes/{res['id']}/improve-structured", headers=h,
        json={"focus_points": ["Emphasize leadership scope"]},
    )
    assert r.status_code == 200
    assert "Emphasize leadership scope" in rec.last_prompt


def test_api_review_persists_summarized_signal_for_preview_default():
    # After a résumé is reviewed once, it carries a content_summary + summarized_at,
    # so the page can open straight to the preview (not the raw upload) next time.
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    res = _upload(client, h, "- Led the billing migration, cutting latency 40% while mentoring three engineers")
    rid = res["id"]
    # Freshly uploaded: not summarized yet.
    assert client.get(f"/api/v1/resumes/{rid}", headers=h).json()["summarized_at"] is None

    client.post(f"/api/v1/resumes/{rid}/review", headers=h, json={})
    got = client.get(f"/api/v1/resumes/{rid}", headers=h).json()
    assert got["summarized_at"] is not None  # durable "already viewed + summarized"
    assert got["content_summary"]  # cached factual summary for the preview


def test_api_rephrase_span():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    r = client.post("/api/v1/documents/rephrase", headers=h,
                    json={"text": "responsible for", "mode": "word"})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["options"], list) and body["options"]
    assert "responsible for" not in [o.lower() for o in body["options"]]


def test_api_rephrase_flags_invented_numbers():
    # A rephrase that introduces a number not in the original is flagged for review.
    state = AppState(exchanger=MockTokenExchanger())
    state.resume_assistant.rephrase = lambda *a, **k: ["Cut latency by 40% across the fleet"]  # type: ignore
    client = TestClient(create_app(state=state))
    h = _auth(client)
    r = client.post("/api/v1/documents/rephrase", headers=h,
                    json={"text": "Reduced latency across the fleet", "mode": "sentence"})
    body = r.json()
    assert any(f["value"] == "40%" for f in body["flagged_metrics"])


def test_api_rephrase_empty_400_and_requires_auth():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    assert client.post("/api/v1/documents/rephrase", json={"text": "x"}).status_code == 401
    h = _auth(client)
    assert client.post("/api/v1/documents/rephrase", headers=h, json={"text": "  "}).status_code == 400


def test_api_incorporate_adds_ideas_and_notes():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    res = _upload(client, h, "## Experience\n**Acme** — Engineer\n- Built the API")
    r = client.post(
        f"/api/v1/resumes/{res['id']}/incorporate", headers=h,
        json={"ideas": ["Led the billing migration"], "notes": "- Mentored 3 juniors\n- Cut cloud spend 20%"},
    )
    assert r.status_code == 200
    md = r.json()["markdown"]
    assert "billing migration" in md and "Mentored 3 juniors" in md and "Cut cloud spend 20%" in md


def test_api_incorporate_does_not_flag_user_supplied_numbers():
    # A number the CANDIDATE provided is legit and must not be flagged as invented.
    state = AppState(exchanger=MockTokenExchanger())
    client = TestClient(create_app(state=state))
    h = _auth(client)
    res = _upload(client, h, "## Experience\n- Built the API")
    r = client.post(
        f"/api/v1/resumes/{res['id']}/incorporate", headers=h,
        json={"ideas": ["Cut cloud spend 20%"]},
    )
    assert r.status_code == 200
    assert not any(f["value"] == "20%" for f in r.json()["flagged_metrics"])


def test_api_incorporate_requires_a_point():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    res = _upload(client, h, "## Experience\n- Built the API")
    assert client.post(f"/api/v1/resumes/{res['id']}/incorporate", headers=h,
                       json={"ideas": [], "notes": "  "}).status_code == 400


def test_api_review_requires_auth_and_ownership():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    assert client.post("/api/v1/resumes/nope/review", json={}).status_code == 401
    ha = _auth(client, "a@demo.com")
    hb = _auth(client, "b@demo.com")
    res = _upload(client, ha, "- A's resume content")
    assert client.post(f"/api/v1/resumes/{res['id']}/review", headers=hb, json={}).status_code == 404


def test_api_cover_letter_review_and_revise_flow():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    cl = client.post(
        "/api/v1/cover-letters/upload", headers=h,
        files={"file": ("cover.txt", b"To whom it may concern, I am a hard worker and team player.", "text/plain")},
    ).json()
    clid = cl["id"]

    rev = client.post(f"/api/v1/cover-letters/{clid}/review", headers=h, json={})
    assert rev.status_code == 200
    body = rev.json()
    assert body["cover_letter_id"] == clid and 0 <= body["score"] <= 100
    assert body["summary"] and isinstance(body["suggestions"], list)

    r = client.post(f"/api/v1/cover-letters/{clid}/revise", headers=h, json={"instruction": "Make it specific and warm"})
    assert r.status_code == 200
    preview = r.json()["preview"]
    assert preview
    upd = client.put(f"/api/v1/cover-letters/{clid}", headers=h, json={"content": preview})
    assert upd.status_code == 200 and upd.json()["content"] == preview


def test_api_cover_letter_revise_no_prompt_does_general_improve():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    cl = client.post(
        "/api/v1/cover-letters/upload", headers=h,
        files={"file": ("c.txt", b"Some cover letter content here.", "text/plain")},
    ).json()
    r = client.post(f"/api/v1/cover-letters/{cl['id']}/revise", headers=h, json={"instruction": "  "})
    assert r.status_code == 200 and r.json()["preview"]
