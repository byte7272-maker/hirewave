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


def test_api_improve_structured_uses_live_editor_content():
    # Points the user just typed in the editor (sent as `content`) must be what the
    # AI improves -- not the last-saved résumé -- and the improve must not persist them.
    state = AppState(exchanger=MockTokenExchanger())
    rec = _RecordingLLM()
    state.resume_assistant.llm = rec
    client = TestClient(create_app(state=state))
    h = _auth(client)
    res = _upload(client, h, "- Built the API")
    rid = res["id"]
    live = "- Built the API\n- Led migration of the payments platform for 2M users"
    r = client.post(
        f"/api/v1/resumes/{rid}/improve-structured", headers=h, json={"content": live},
    )
    assert r.status_code == 200
    assert "payments platform for 2M users" in rec.last_prompt  # improved the live text
    # The stored résumé is untouched (preview only).
    assert client.get(f"/api/v1/resumes/{rid}", headers=h).json()["rendered_text"] == "- Built the API"


def test_improve_prompt_uses_present_tense_for_current_role():
    # A current role should read in present tense; the improve prompt must instruct
    # correct tense (present for current, past for previous) rather than forcing past.
    state = AppState(exchanger=MockTokenExchanger())
    rec = _RecordingLLM()
    state.resume_assistant.llm = rec
    client = TestClient(create_app(state=state))
    h = _auth(client)
    res = _upload(client, h, "## Experience\n**Acme (Present)**\n- Managed the billing system")
    client.post(f"/api/v1/resumes/{res['id']}/improve-structured", headers=h, json={})
    assert "present tense for the current role" in rec.last_prompt.lower()
    assert "past tense for previous roles" in rec.last_prompt.lower()


# --- evidence mining (prompts for company AI -> extract -> incorporate) ------
def test_evidence_prompts_are_actionable_and_target_role_aware():
    a = ResumeAssistant()
    r = _resume("## Experience\n**Acme (Present)** — Staff Engineer\n- Built the billing platform")
    prompts = a.evidence_prompts(r, role="Staff Engineer")
    assert len(prompts) >= 7
    assert all({"category", "title", "prompt"} <= set(p) for p in prompts)
    blob = " ".join(p["prompt"] for p in prompts).lower()
    assert "email" in blob and "teams" in blob  # points users at their company tools
    assert any("staff engineer" in p["prompt"].lower() for p in prompts)
    # With a target job, a role-alignment prompt is appended citing its requirements.
    job = JobPosting(title="Engineering Manager", company="Globex", requirements=["team leadership", "roadmap"])
    tp = a.evidence_prompts(r, job=job)
    align = [p for p in tp if p["category"] == "Target-role alignment"]
    assert align and "Engineering Manager" in align[0]["prompt"] and "team leadership" in align[0]["prompt"]


def test_extract_evidence_uses_llm_array_then_falls_back():
    class _ArrayLLM:
        name = "arr"
        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            return '```json\n["Led billing migration cutting latency 40%", "Mentored 3 engineers"]\n```'

    a = ResumeAssistant(llm=_ArrayLLM())
    pts = a.extract_evidence("blah blah (assistant output)")
    assert pts == ["Led billing migration cutting latency 40%", "Mentored 3 engineers"]

    class _BrokenLLM:
        name = "broken"
        def complete(self, *args, **kwargs):
            raise RuntimeError("no llm")

    a2 = ResumeAssistant(llm=_BrokenLLM())
    fb = a2.extract_evidence("- Led billing migration cutting latency 40%\n* Mentored 3 engineers\n\nRegards,")
    assert "Led billing migration cutting latency 40%" in fb
    assert "Mentored 3 engineers" in fb
    assert a2.extract_evidence("   ") == []  # empty -> nothing


def test_api_evidence_prompts_and_extract_flow():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    res = _upload(client, h, "## Experience\n**Acme (Present)** — Data Scientist\n- Built churn models")
    rid = res["id"]
    pr = client.post(f"/api/v1/resumes/{rid}/evidence-prompts", headers=h, json={})
    assert pr.status_code == 200
    body = pr.json()
    assert body["prompts"] and body["guidance"]
    assert all(p["prompt"] for p in body["prompts"])

    # Extract data points from pasted company-AI output.
    ex = client.post(
        f"/api/v1/resumes/{rid}/evidence/extract", headers=h,
        json={"text": "- Shipped a fraud model that cut chargebacks 30%\n- Led a team of 4 on the data platform"},
    )
    assert ex.status_code == 200 and ex.json()["data_points"]
    # Empty paste -> 400.
    assert client.post(f"/api/v1/resumes/{rid}/evidence/extract", headers=h, json={"text": "  "}).status_code == 400


def test_chunk_text_splits_on_boundaries():
    from jobsearch.engines.resume_assistant import _chunk_text
    assert _chunk_text("", 100) == []
    assert _chunk_text("short", 100) == ["short"]
    text = "\n\n".join(["x" * 90] * 5)  # 5 paragraphs
    chunks = _chunk_text(text, 200)
    assert len(chunks) > 1 and all(0 < len(c) <= 200 for c in chunks)
    # A single line longer than the chunk size is hard-sliced.
    cs = _chunk_text("y" * 500, 200)
    assert len(cs) == 3 and all(len(c) <= 200 for c in cs)


def test_extract_evidence_chunks_large_input_without_truncation():
    import json as _json
    import re as _re

    class _EchoFactsLLM:
        name = "echo"
        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            # Echo back only the FACT: lines present in THIS chunk's prompt.
            return _json.dumps(_re.findall(r"FACT:[^\n]+", prompt))

    a = ResumeAssistant(llm=_EchoFactsLLM())
    filler = "\n".join(f"filler detail about routine work number {i}" for i in range(300))
    text = "FACT: alpha early win\n" + filler + "\nFACT: omega tail win"
    assert len(text) > 6000  # far past the old single-call truncation point
    pts = a.extract_evidence(text)
    assert any("alpha early win" in p for p in pts)   # first chunk
    assert any("omega tail win" in p for p in pts)    # tail is processed, not dropped
    # A fact repeated in different chunks is merged to one.
    pts2 = a.extract_evidence("FACT: shared win\n" + filler + "\nFACT: shared win")
    assert sum("shared win" in p for p in pts2) == 1


def test_evidence_prompts_ask_external_ai_to_limit_length():
    prompts = ResumeAssistant().evidence_prompts(_resume("## Experience\n- Built things"))
    # Every prompt tells the user's external AI to keep the answer concise + paste-ready.
    assert prompts and all("under ~400 words" in p["prompt"] for p in prompts)
    assert all("one short line per item" in p["prompt"] for p in prompts)


def test_cluster_evidence_synthesizes_themed_groups():
    class _ClusterLLM:
        name = "cl"
        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            return ('[{"theme":"Billing platform","summary":"Owned the billing platform end to end, '
                    'cutting latency 40%","points":["Led the billing platform migration cutting latency 40%",'
                    '"Owned billing platform roadmap"]},'
                    '{"theme":"Mentoring","summary":"Mentored 5 engineers across two teams",'
                    '"points":["Mentored 3 junior engineers","Coached 2 new hires"]}]')
    a = ResumeAssistant(llm=_ClusterLLM())
    pts = ["Led the billing platform migration cutting latency 40%", "Owned billing platform roadmap",
           "Mentored 3 junior engineers", "Coached 2 new hires"]
    groups = a.cluster_evidence(pts)
    assert len(groups) == 2 and {g["theme"] for g in groups} == {"Billing platform", "Mentoring"}
    bp = next(g for g in groups if g["theme"] == "Billing platform")
    assert "40%" in bp["summary"] and len(bp["points"]) == 2  # overarching statement + sources
    assert a.cluster_evidence([]) == []


def test_cluster_evidence_fallback_groups_related_points():
    class _Broken:
        name = "x"
        def complete(self, *a, **k):
            raise RuntimeError("no llm")
    a = ResumeAssistant(llm=_Broken())
    groups = a.cluster_evidence([
        "Led the billing platform migration cutting latency 40%",
        "Owned the billing platform roadmap and reliability",
    ])
    assert len(groups) == 1 and len(groups[0]["points"]) == 2  # shared words -> one group
    assert "40%" in groups[0]["summary"]  # representative = the quantified point


def test_cluster_fallback_keeps_all_points_within_group_cap():
    # Many unrelated points -> many small clusters. The group cap must not DROP points;
    # overflow folds into an "Additional highlights" group so everything is retained.
    from jobsearch.engines.resume_assistant import _cluster_points_fallback
    pts = [f"{chr(97 + i) * 4} {chr(97 + i) * 5}" for i in range(20)]  # distinct, non-overlapping
    groups = _cluster_points_fallback(pts, max_groups=8)
    assert len(groups) <= 8
    kept = [p for g in groups for p in g["points"]]
    assert set(kept) == set(pts)  # nothing lost
    assert any(g["theme"] == "Additional highlights" for g in groups)


def test_api_evidence_synthesize_returns_groups():
    class _SynthLLM:
        name = "s"
        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            if "extract the discrete" in prompt:
                return '["Led billing platform cutting latency 40%","Owned billing roadmap","Mentored 3 engineers"]'
            if "into 3-8 themes" in prompt:
                return ('[{"theme":"Billing","summary":"Owned the billing platform, cutting latency 40%",'
                        '"points":["Led billing platform cutting latency 40%","Owned billing roadmap"]},'
                        '{"theme":"Mentoring","summary":"Mentored 3 engineers","points":["Mentored 3 engineers"]}]')
            return "[]"
    state = AppState(exchanger=MockTokenExchanger())
    state.resume_assistant.llm = _SynthLLM()
    client = TestClient(create_app(state=state))
    h = _auth(client)
    rid = _upload(client, h, "## Experience\n- Managed billing")["id"]
    r = client.post(f"/api/v1/resumes/{rid}/evidence/synthesize", headers=h,
                    json={"text": "owned billing platform; latency down 40%; mentored engineers"})
    assert r.status_code == 200
    groups = r.json()["groups"]
    assert len(groups) == 2 and all({"theme", "summary", "points"} <= set(g) for g in groups)
    assert any("40%" in g["summary"] for g in groups)
    # Empty paste -> 400.
    assert client.post(f"/api/v1/resumes/{rid}/evidence/synthesize", headers=h,
                       json={"text": "  "}).status_code == 400


def test_highlights_suggest_then_accept_and_save_flow():
    # Paste work-AI output -> reviewable add/replace/reword edits -> apply (preview) ->
    # save as a new version. The change is only persisted when the user saves.
    class _HighlightsLLM:
        name = "hl"
        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            if "extract the discrete" in prompt:  # evidence extraction
                return '["Led the billing platform end to end, cutting latency 40%"]'
            if "Propose specific edits" in prompt:  # suggest add/remove/reword
                return ('[{"action":"reword","section":"Experience","before":"- Managed billing",'
                        '"after":"- Led the billing platform, cutting latency 40%",'
                        '"rationale":"stronger, quantified wording from the evidence"}]')
            return "[]"

    state = AppState(exchanger=MockTokenExchanger())
    state.resume_assistant.llm = _HighlightsLLM()
    client = TestClient(create_app(state=state))
    h = _auth(client)
    rid = _upload(client, h, "## Experience\n- Managed billing")["id"]

    # 1) Paste -> reviewable suggestions (nothing changed yet).
    sg = client.post(f"/api/v1/resumes/{rid}/highlights/suggest", headers=h,
                     json={"text": "From my email: owned the billing platform; latency down 40%."})
    assert sg.status_code == 200
    sug = sg.json()["suggestions"]
    assert sug and sug[0]["action"] == "reword" and "40%" in sug[0]["after"]
    # The résumé is still unchanged at this point.
    assert client.get(f"/api/v1/resumes/{rid}", headers=h).json()["rendered_text"] == "## Experience\n- Managed billing"

    # 2) Apply the approved edit -> PREVIEW only (still not saved).
    ap = client.post(f"/api/v1/resumes/{rid}/apply-edits", headers=h, json={"suggestions": sug})
    assert ap.status_code == 200 and "cutting latency 40%" in ap.json()["rendered_text"]
    before = client.get(f"/api/v1/resumes/{rid}", headers=h).json()["active_version"] or 0

    # 3) User accepts + saves the preview as a new version.
    sv = client.post(f"/api/v1/resumes/{rid}/versions", headers=h,
                     json={"content": ap.json()["rendered_text"]})
    assert sv.status_code == 200
    saved = client.get(f"/api/v1/resumes/{rid}", headers=h).json()
    assert saved["active_version"] > before
    assert "Led the billing platform, cutting latency 40%" in saved["rendered_text"]
    assert "Managed billing" not in saved["rendered_text"]

    # Empty paste -> 400.
    assert client.post(f"/api/v1/resumes/{rid}/highlights/suggest", headers=h,
                       json={"text": "  "}).status_code == 400


def test_apply_edits_accepts_user_edited_suggestions():
    # The suggested results are editable: the user can change the wording/section/action
    # (or add their own) before applying. apply-edits is deterministic and applies exactly
    # what's sent — no LLM — so edited suggestions take effect verbatim.
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    rid = _upload(client, h, "## Experience\n- Managed billing\n- Did ops")["id"]
    edited = [
        {"action": "reword", "section": "Experience", "before": "- Managed billing",
         "after": "- Led the billing platform, cutting latency 55% (user-edited)"},
        {"action": "add", "section": "Experience", "after": "Mentored 4 engineers (added by user)"},
    ]
    ap = client.post(f"/api/v1/resumes/{rid}/apply-edits", headers=h, json={"suggestions": edited})
    assert ap.status_code == 200 and ap.json()["applied"] == 2
    rt = ap.json()["rendered_text"]
    assert "cutting latency 55% (user-edited)" in rt
    assert "Mentored 4 engineers (added by user)" in rt and "Managed billing" not in rt
    # An edited `before` that no longer matches is reported as skipped (not silently lost).
    ap2 = client.post(f"/api/v1/resumes/{rid}/apply-edits", headers=h,
                      json={"suggestions": [{"action": "reword", "before": "- not present", "after": "x"}]})
    assert ap2.json()["skipped"] == 1 and ap2.json()["applied"] == 0


def test_ai_edit_prompt_capped_500_but_highlights_uncapped():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    rid = _upload(client, h, "## Experience\n- Managed billing")["id"]
    # The workspace "Ask AI to change it" prompt is limited to 500 chars (schema-enforced).
    assert client.post(f"/api/v1/resumes/{rid}/ai-edit", headers=h,
                       json={"instruction": "x" * 501}).status_code == 422
    assert client.post(f"/api/v1/resumes/{rid}/ai-edit", headers=h,
                       json={"instruction": "x" * 500}).status_code != 422  # at the cap is fine
    # My Work Highlights accepts a much larger paste (uncapped, processed in full).
    big = "\n".join(f"- did useful work item number {i}" for i in range(200))
    assert len(big) > 500
    assert client.post(f"/api/v1/resumes/{rid}/evidence/extract", headers=h,
                       json={"text": big}).status_code == 200
    assert client.post(f"/api/v1/resumes/{rid}/highlights/suggest", headers=h,
                       json={"text": big}).status_code == 200


def test_api_replace_is_deterministic_and_reports_count():
    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    h = _auth(client)
    res = _upload(client, h, "- Managed the billing system\n- Managed the API team")
    rid = res["id"]

    # Exact replace, all occurrences, case-insensitive by default.
    r = client.post(f"/api/v1/resumes/{rid}/replace", headers=h,
                    json={"find": "Managed", "replace": "Led"})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    assert "Led the billing system" in body["rendered_text"]
    assert "Managed" not in body["rendered_text"]

    # No match -> count 0, text unchanged (this is why "nothing changed").
    r0 = client.post(f"/api/v1/resumes/{rid}/replace", headers=h,
                     json={"find": "nonexistent phrase", "replace": "X"}).json()
    assert r0["count"] == 0 and r0["rendered_text"] == "- Managed the billing system\n- Managed the API team"

    # first-only + empty find guard.
    one = client.post(f"/api/v1/resumes/{rid}/replace", headers=h,
                      json={"find": "Managed", "replace": "Led", "all": False}).json()
    assert one["count"] == 1 and one["rendered_text"].count("Led") == 1
    assert client.post(f"/api/v1/resumes/{rid}/replace", headers=h,
                       json={"find": "", "replace": "x"}).status_code == 400


def test_apply_edit_is_deterministic():
    from jobsearch.api.routers.documents import _apply_edit
    from jobsearch.api.schemas import EditSuggestion

    text = "## Experience\n- Managed billing\n- Did stuff\n## Skills\nPython"
    t, ok = _apply_edit(text, EditSuggestion(action="reword", before="- Managed billing",
                                             after="- Led billing, cut latency 40%"))
    assert ok and "Led billing, cut latency 40%" in t and "Managed billing" not in t
    t2, ok2 = _apply_edit(text, EditSuggestion(action="remove", before="- Did stuff"))
    assert ok2 and "Did stuff" not in t2
    t3, ok3 = _apply_edit(text, EditSuggestion(action="add", section="Skills", after="AWS"))
    assert ok3 and "- AWS" in t3
    t4, ok4 = _apply_edit(text, EditSuggestion(action="reword", before="not present", after="x"))
    assert not ok4 and t4 == text  # before not found -> skipped, text unchanged


def test_api_suggest_and_apply_edits_flow():
    class _EditsLLM:
        name = "edits"
        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            return ('[{"action":"reword","section":"Experience","before":"Managed billing",'
                    '"after":"Led the billing platform","rationale":"stronger verb"}]')

    state = AppState(exchanger=MockTokenExchanger())
    state.resume_assistant.llm = _EditsLLM()
    client = TestClient(create_app(state=state))
    h = _auth(client)
    rid = _upload(client, h, "## Experience\n- Managed billing")["id"]

    s = client.post(f"/api/v1/resumes/{rid}/suggest-edits", headers=h,
                    json={"context": "I actually led the whole billing platform"})
    assert s.status_code == 200
    sug = s.json()["suggestions"]
    assert len(sug) == 1 and sug[0]["action"] == "reword"
    # empty context -> 400
    assert client.post(f"/api/v1/resumes/{rid}/suggest-edits", headers=h,
                       json={"context": "  "}).status_code == 400

    a = client.post(f"/api/v1/resumes/{rid}/apply-edits", headers=h,
                    json={"suggestions": [{"action": "add", "section": "Skills", "after": "AWS"}]})
    assert a.status_code == 200 and a.json()["applied"] == 1 and "AWS" in a.json()["rendered_text"]


def test_api_ai_edit_applies_targeted_change_immediately():
    class _EditLLM:
        name = "edit"
        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            return ('[{"action":"reword","section":"Experience","before":"Managed billing",'
                    '"after":"Led the billing platform","rationale":"stronger verb"}]')

    state = AppState(exchanger=MockTokenExchanger())
    state.resume_assistant.llm = _EditLLM()
    client = TestClient(create_app(state=state))
    h = _auth(client)
    rid = _upload(client, h, "## Experience\n- Managed billing")["id"]
    before = client.get(f"/api/v1/resumes/{rid}", headers=h).json()["active_version"] or 0

    r = client.post(f"/api/v1/resumes/{rid}/ai-edit", headers=h, json={"instruction": "make it stronger"})
    assert r.status_code == 200
    body = r.json()
    # Applied immediately as a new active version (undo = switch back), content changed.
    assert body["active_version"] > before
    assert "Led the billing platform" in body["rendered_text"] and "Managed billing" not in body["rendered_text"]
    # Empty instruction -> 400.
    assert client.post(f"/api/v1/resumes/{rid}/ai-edit", headers=h, json={"instruction": "  "}).status_code == 400


def test_api_ai_edit_no_match_makes_no_version():
    class _StaleLLM:
        name = "stale"
        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            return '[{"action":"reword","before":"text that is not in the resume","after":"x","rationale":"y"}]'

    state = AppState(exchanger=MockTokenExchanger())
    state.resume_assistant.llm = _StaleLLM()
    client = TestClient(create_app(state=state))
    h = _auth(client)
    rid = _upload(client, h, "## Experience\n- Managed billing")["id"]
    before = client.get(f"/api/v1/resumes/{rid}", headers=h).json()["active_version"] or 0
    body = client.post(f"/api/v1/resumes/{rid}/ai-edit", headers=h, json={"instruction": "do X"}).json()
    assert body["active_version"] == before  # nothing matched -> no new version


# --- deterministic formatting pass (bold / unbold / bullets) ---------------
def test_format_intent_classifies_formatting_instructions():
    from jobsearch.engines.resume_assistant import _format_intent
    assert _format_intent("Remove the bold formatting from the Education section") == "unbold"
    assert _format_intent("take the bold off the two education lines") == "unbold"
    assert _format_intent("unbold the degree lines") == "unbold"
    assert _format_intent("use normal weight for the education lines font") == "unbold"
    assert _format_intent("make the job titles bold") == "bold"
    assert _format_intent("bold the section headers") == "bold"
    assert _format_intent("remove the bullets from Skills") == "unbullet"
    # not a formatting op -> defer to the LLM
    assert _format_intent("make my summary punchier") == ""
    assert _format_intent("quantify my achievements") == ""


def test_format_edits_unbolds_named_section_only():
    from jobsearch.engines.resume_assistant import format_edits
    text = ("**BAYETE WILLIAMS**\n## Experience\n**IT Director** at Acme\n- Led a team\n"
            "## Education\n**Master of Science - Mercy College**\n"
            "**Bachelor of Science - Mercy College**")
    edits = format_edits(text, "Remove the bold formatting from the two lines in the Education section")
    assert edits is not None and len(edits) == 2
    befores = {e["before"] for e in edits}
    assert befores == {"**Master of Science - Mercy College**", "**Bachelor of Science - Mercy College**"}
    for e in edits:
        assert e["action"] == "reword" and "**" in e["before"] and "**" not in e["after"]
    # change stays inside Education: the name and the Experience title are untouched
    assert all("WILLIAMS" not in e["before"] and "IT Director" not in e["before"] for e in edits)


def test_section_heading_detection_excludes_entry_titles():
    from jobsearch.engines.resume_assistant import _is_section_heading
    assert _is_section_heading("**EDUCATION**")[0] is True
    assert _is_section_heading("## Education")[0] is True
    assert _is_section_heading("**Technical Skills**")[0] is True
    assert _is_section_heading("# Bayete Williams")[0] is True
    # Long bold lines (entry titles / degree lines) are content, not headings —
    # even when they happen to contain a section word.
    assert _is_section_heading("**Master of Science, Info Assurance - Mercy College**")[0] is False
    assert _is_section_heading("**Senior Projects Lead at Acme Corp**")[0] is False
    # A '###'+ entry sub-heading (job/degree title) is content, not a section heading.
    assert _is_section_heading("### Master of Science - Mercy College")[0] is False
    assert _is_section_heading("Regular text line")[0] is False


def test_format_edits_handles_bold_standalone_section_headings():
    # Résumé that uses **BOLD** standalone lines as headings (no '## '), like the
    # uploaded résumé whose EDUCATION renders <h2> and degree lines render <h3>.
    from jobsearch.engines.resume_assistant import format_edits, _doc_sections
    text = ("**BAYETE WILLIAMS**\n**EXPERIENCE**\n**Regional IT Director - Publicis**\n"
            "- Led a team\n**EDUCATION**\n**Master of Science - Mercy College**\n"
            "**Bachelor of Science - Mercy College**\n**SKILLS**\nPython, AWS")
    secs = _doc_sections(text.split("\n"))
    assert {"experience", "education", "skills"} <= set(secs)
    edits = format_edits(text, "In the Education section, show both degree lines without bold")
    assert edits is not None and len(edits) == 2
    assert {e["before"] for e in edits} == {
        "**Master of Science - Mercy College**", "**Bachelor of Science - Mercy College**"}
    for e in edits:
        assert "**" not in e["after"]
    # The **EDUCATION** heading and the other sections keep their bold.
    assert all("EDUCATION" not in e["before"] for e in edits)


def test_format_edits_demotes_entry_subheadings():
    # Real-world case: degree lines are '### ' sub-headings (render bold as <h3>), with
    # no ** to strip. 'unbold' must DEMOTE them to plain text so they render normally.
    from jobsearch.engines.resume_assistant import format_edits
    text = ("# Bayete Williams\n**IT Leader**\n## Experience\n### Regional IT Director\n- Led\n"
            "## Education\n\n### Master of Science - Mercy College\n\n"
            "### Bachelor of Science - Mercy College\n## Skills\nPython")
    edits = format_edits(text, "Education section: make the two degree lines non-bold")
    assert edits is not None and len(edits) == 2
    for e in edits:
        assert e["before"].startswith("### ") and not e["after"].lstrip().startswith("#")
    assert {e["after"] for e in edits} == {
        "Master of Science - Mercy College", "Bachelor of Science - Mercy College"}
    # Localized to Education: the Experience job title keeps its heading.
    assert all("Regional IT Director" not in e["before"] for e in edits)


def test_format_edits_defers_and_noops_correctly():
    from jobsearch.engines.resume_assistant import format_edits
    text = "## Education\nMaster of Science - Mercy College"
    # not a formatting instruction -> None (caller uses the LLM)
    assert format_edits(text, "make the education section more impressive") is None
    # recognized op but nothing to change (already plain) -> [] (handled, no edits)
    assert format_edits(text, "unbold the education section") == []
    # formatting op we can't localize (no section named, not 'all') -> None
    assert format_edits(text, "remove the bold") is None
    # ... but 'everything' is localizable to the whole document
    allbold = format_edits("**A**\n## Education\n**B - C**", "remove all bold")
    assert allbold is not None and {e["before"] for e in allbold} == {"**A**", "**B - C**"}


def test_format_edits_bold_and_unbullet():
    from jobsearch.engines.resume_assistant import format_edits
    text = "## Skills\n- Python\n- AWS"
    un = format_edits(text, "remove the bullets from the Skills section")
    assert un and all(not e["after"].lstrip().startswith("-") for e in un)
    bd = format_edits(text, "bold the skills lines")
    assert bd and {e["after"] for e in bd} == {"- **Python**", "- **AWS**"}


def test_api_ai_edit_unbolds_deterministically_even_if_llm_returns_nothing():
    # The LLM returns no edits; if /ai-edit relied on it, the bold would remain.
    # The deterministic formatting pass must strip it regardless.
    class _EmptyEditsLLM:
        name = "empty"
        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            return "[]"

    state = AppState(exchanger=MockTokenExchanger())
    state.resume_assistant.llm = _EmptyEditsLLM()
    client = TestClient(create_app(state=state))
    h = _auth(client)
    text = ("**BAYETE WILLIAMS**\n## Education\n"
            "**Master of Science - Mercy College**\n**Bachelor of Science - Mercy College**")
    rid = _upload(client, h, text)["id"]
    before = client.get(f"/api/v1/resumes/{rid}", headers=h).json()["active_version"] or 0
    r = client.post(f"/api/v1/resumes/{rid}/ai-edit", headers=h, json={
        "instruction": "Remove the bold formatting from the two lines in the Education section."})
    assert r.status_code == 200
    rt = r.json()["rendered_text"]
    assert r.json()["active_version"] > before  # applied as a new version
    assert "Master of Science - Mercy College" in rt  # text kept
    assert "**Master of Science - Mercy College**" not in rt  # but no longer bold
    assert "**Bachelor of Science - Mercy College**" not in rt
    assert "**BAYETE WILLIAMS**" in rt  # name above Education keeps its bold


# --- LLM timeout / fast-fallback -------------------------------------------
def test_openai_provider_sets_request_timeout_and_no_retries_by_default():
    # Without an explicit timeout the SDK default is ~10 min; and the SDK retries on
    # timeout, which just doubles the wait on a slow provider. Default = tight timeout,
    # 0 retries, so each call is bounded to ~timeout (not timeout x retries).
    from jobsearch.llm.providers import OpenAILLMProvider
    p = OpenAILLMProvider("sk-test", "gpt-4o-mini", timeout=7.5)
    assert p._timeout == 7.5 and p._max_retries == 0


def test_run_with_deadline_bounds_and_reraises():
    import time
    from jobsearch.llm.providers import _run_with_deadline
    assert _run_with_deadline(lambda: 7, 1.0) == 7
    t0 = time.monotonic()
    try:
        _run_with_deadline(lambda: time.sleep(5), 0.2)
        assert False, "should have timed out"
    except TimeoutError:
        pass
    assert time.monotonic() - t0 < 2  # returned promptly, not after the 5s sleep
    try:
        _run_with_deadline(lambda: (_ for _ in ()).throw(ValueError("x")), 1.0)
        assert False, "should have re-raised"
    except ValueError:
        pass


def test_openai_complete_is_hard_bounded_even_if_sdk_hangs():
    # The real reliability fix: a slow/hanging SDK call must NOT hang the request. With a
    # client whose create() sleeps 30s, complete() still returns (raises) within the hard
    # budget (~timeout + grace), not after 30s.
    import time
    import types
    import pytest
    from jobsearch.llm.providers import OpenAILLMProvider
    p = OpenAILLMProvider("sk-test", "gpt-4o-mini", timeout=0.2)
    p._client = types.SimpleNamespace(chat=types.SimpleNamespace(
        completions=types.SimpleNamespace(create=lambda **k: time.sleep(30))))
    t0 = time.monotonic()
    with pytest.raises(Exception):
        p.complete("hi")
    assert time.monotonic() - t0 < 8  # bounded by the hard timeout, not the 30s hang


def test_factory_propagates_llm_timeout_and_retries_to_openai():
    from jobsearch.config import Settings
    from jobsearch.llm.factory import build_llm, build_review_llm
    s = Settings(llm_provider="openai", openai_api_key="sk-test",
                 llm_timeout_seconds=12.0, llm_max_retries=0)
    for p in (build_llm(s), build_review_llm(s)):
        assert p._timeout == 12.0 and p._max_retries == 0


def test_extract_evidence_respects_llm_time_budget(monkeypatch):
    # Once the wall-clock budget is spent, remaining chunks are split deterministically
    # with NO further LLM calls -- so a big paste on a slow provider can't stack timeouts.
    import jobsearch.engines.resume_assistant as ra
    monkeypatch.setattr(ra, "_EVIDENCE_LLM_BUDGET_S", 0.0)  # budget already spent

    calls = {"n": 0}
    class _CountLLM:
        name = "c"
        def complete(self, *a, **k):
            calls["n"] += 1
            return "[]"
    a = ra.ResumeAssistant(llm=_CountLLM())
    pts = a.extract_evidence("- did a substantial thing worth noting\n- did another notable thing here")
    assert calls["n"] == 0  # budget spent -> no LLM calls at all
    assert pts  # deterministic split still returns points


def test_format_change_summary_and_detection():
    ra = ResumeAssistant()
    assert ra.is_formatting_instruction("remove the bold from Education") is True
    assert ra.is_formatting_instruction("make my summary punchier") is False
    assert ra.format_change_summary("remove the bold from Education", 2) == "Removed bold formatting (2 lines)"
    assert ra.format_change_summary("bold the titles", 1) == "Added bold formatting (1 line)"
    assert ra.format_change_summary("remove the bullets from Skills", 3) == "Removed bullet points (3 lines)"


def test_api_ai_edit_formatting_calls_no_llm_and_uses_deterministic_changelog():
    # A formatting edit is fully deterministic: no LLM anywhere in /ai-edit (not for
    # the edit, not for the changelog), so it stays instant even when the LLM is slow.
    class _NoLLM:
        name = "forbidden"
        def complete(self, *a, **k):
            raise AssertionError("no LLM call may happen for a formatting edit")

    state = AppState(exchanger=MockTokenExchanger())
    client = TestClient(create_app(state=state))
    h = _auth(client)
    text = ("**BAYETE WILLIAMS**\n## Education\n"
            "**Master of Science - Mercy College**\n**Bachelor of Science - Mercy College**")
    rid = _upload(client, h, text)["id"]
    before = client.get(f"/api/v1/resumes/{rid}", headers=h).json()["active_version"] or 0
    state.resume_assistant.llm = _NoLLM()  # from here any LLM call fails the test

    r = client.post(f"/api/v1/resumes/{rid}/ai-edit", headers=h,
                    json={"instruction": "remove the bold formatting from the Education section"})
    assert r.status_code == 200
    body = r.json()
    assert body["active_version"] > before
    rt = body["rendered_text"]
    assert "Master of Science - Mercy College" in rt and "**Master of Science - Mercy College**" not in rt
    assert "**BAYETE WILLIAMS**" in rt  # localized to Education
    # The new version carries the deterministic changelog (no LLM was consulted).
    ver = client.get(f"/api/v1/resumes/{rid}/versions/{body['active_version']}", headers=h).json()
    assert "bold" in (ver.get("change_summary") or "").lower()


# --- item 4: changelog off the edit critical path --------------------------
def test_summarize_change_fast_is_deterministic_no_llm():
    class _NoLLM:
        name = "x"
        def complete(self, *a, **k):
            raise AssertionError("the fast changelog must not call the LLM")
    ra = ResumeAssistant(llm=_NoLLM())
    s = ra.summarize_change_fast("a b c", "a b c d e f g", instruction="expand it")
    assert "words)" in s and s.startswith(("Expanded", "Tightened", "Revised"))


# --- items 5 & 6: fast review + narrative cache ----------------------------
def test_api_review_narrative_false_skips_llm():
    class _NoLLM:
        name = "forbidden"
        def complete(self, *a, **k):
            raise AssertionError("narrative=false must not call the LLM")
    state = AppState(exchanger=MockTokenExchanger())
    client = TestClient(create_app(state=state))
    h = _auth(client)
    rid = _upload(client, h, "## Experience\n- Led billing, cut latency 40% for 2M users")["id"]
    state.resume_assistant.llm = _NoLLM()  # from here any LLM call fails the test
    r = client.post(f"/api/v1/resumes/{rid}/review?narrative=false", headers=h, json={})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["score"], int) and body["grade"]  # deterministic score/grade
    assert body["ratings"]  # deterministic ratings present
    assert body["summary"] == ""  # narrative skipped (loaded separately by the UI)


def test_api_review_narrative_cached_until_edit():
    calls = {"n": 0}
    class _CountLLM:
        name = "count"
        def complete(self, prompt, *, system=None, temperature=0.4, max_tokens=1500):
            calls["n"] += 1
            return "Solid resume with quantified impact; tighten the summary."
    state = AppState(exchanger=MockTokenExchanger())
    state.resume_assistant.llm = _CountLLM()
    client = TestClient(create_app(state=state))
    h = _auth(client)
    rid = _upload(client, h, "## Experience\n- Led billing, cut latency 40%")["id"]
    base = calls["n"]  # account for any LLM use during upload
    r1 = client.post(f"/api/v1/resumes/{rid}/review", headers=h, json={}).json()
    after_first = calls["n"]
    assert after_first > base and r1["summary"]  # LLM produced the first narrative
    # Unchanged résumé -> served from cache, no new LLM calls.
    r2 = client.post(f"/api/v1/resumes/{rid}/review", headers=h, json={}).json()
    assert calls["n"] == after_first and r2["summary"] == r1["summary"]
    # Edit the résumé -> cache invalidated -> narrative recomputed.
    client.put(f"/api/v1/resumes/{rid}", headers=h,
               json={"rendered_text": "## Experience\n- Led the billing platform, cut latency 55%"})
    client.post(f"/api/v1/resumes/{rid}/review", headers=h, json={}).json()
    assert calls["n"] > after_first


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
