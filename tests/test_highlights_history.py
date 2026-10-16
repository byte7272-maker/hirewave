from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.highlights_history import MAX_RUNS, HighlightsHistory
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models import HighlightsRun
from jobsearch.store import InMemoryRepository


# -- engine unit tests ------------------------------------------------------
def _hist():
    return HighlightsHistory(repo=InMemoryRepository(id_attr="id"))


def test_record_and_latest_roundtrip():
    h = _hist()
    h.record(user_id="u1", resume_id="r1", mode="suggest", prompt="do X",
             items=[{"action": "add", "after": "Built Y"}])
    latest = h.latest("u1", "r1")
    assert latest is not None and latest.mode == "suggest" and latest.prompt == "do X"
    assert latest.items[0]["after"] == "Built Y"


def test_latest_is_scoped_per_resume_and_user():
    h = _hist()
    h.record(user_id="u1", resume_id="r1", mode="suggest", prompt="A", items=[])
    h.record(user_id="u1", resume_id="r2", mode="suggest", prompt="B", items=[])
    h.record(user_id="u2", resume_id="r1", mode="suggest", prompt="C", items=[])
    assert h.latest("u1", "r1").prompt == "A"
    assert h.latest("u1", "r2").prompt == "B"
    assert h.latest("u9", "r1") is None


def test_identical_consecutive_run_is_not_duplicated():
    h = _hist()
    items = [{"action": "add", "after": "Z"}]
    h.record(user_id="u1", resume_id="r1", mode="suggest", prompt="p", items=items)
    h.record(user_id="u1", resume_id="r1", mode="suggest", prompt="p", items=items)
    assert len(h.list("u1", "r1")) == 1


def test_history_is_pruned_to_max_runs():
    h = _hist()
    for i in range(MAX_RUNS + 5):
        h.record(user_id="u1", resume_id="r1", mode="suggest", prompt=f"p{i}", items=[{"n": i}])
    runs = h.list("u1", "r1", limit=100)
    assert len(runs) == MAX_RUNS
    assert runs[0].prompt == f"p{MAX_RUNS + 4}"  # newest kept


def test_set_states_merges_and_clears():
    h = _hist()
    run = h.record(user_id="u1", resume_id="r1", mode="suggest", prompt="p",
                   items=[{"a": 1}, {"a": 2}, {"a": 3}])
    h.set_states(run.id, "u1", {"0": "accepted", "1": "rejected"})
    assert h.get(run.id, "u1").item_states == {"0": "accepted", "1": "rejected"}
    # merge + clear a key with "pending"
    h.set_states(run.id, "u1", {"2": "accepted", "1": "pending"})
    assert h.get(run.id, "u1").item_states == {"0": "accepted", "2": "accepted"}
    # wrong user can't touch it
    assert h.set_states(run.id, "u2", {"0": "rejected"}) is None


def test_clear_removes_all_runs_for_a_resume():
    h = _hist()
    h.record(user_id="u1", resume_id="r1", mode="suggest", prompt="a", items=[])
    h.record(user_id="u1", resume_id="r1", mode="suggest", prompt="b", items=[])
    h.record(user_id="u1", resume_id="r2", mode="suggest", prompt="c", items=[])
    assert h.clear("u1", "r1") == 2
    assert h.list("u1", "r1") == []
    assert h.latest("u1", "r2").prompt == "c"  # other résumé untouched


def test_prompt_is_capped():
    from jobsearch.engines.highlights_history import PROMPT_CAP
    h = _hist()
    run = h.record(user_id="u1", resume_id="r1", mode="suggest", prompt="x" * (PROMPT_CAP + 500), items=[])
    assert len(run.prompt) == PROMPT_CAP


# -- endpoint integration tests --------------------------------------------
def _make_resume(state, email):
    from jobsearch.models import Resume
    uid = state.user_by_email(email).id
    r = state.resumes.add(Resume(
        user_id=uid, target_role="Engineer",
        rendered_text="## Experience\n- Built things\n- Led teams\n",
    ))
    return r.id


@pytest.fixture()
def client_and_resume():
    state = AppState(exchanger=MockTokenExchanger())
    client = TestClient(create_app(state=state))
    client.post("/api/v1/auth/register",
                json={"email": "hh@demo.com", "password": "supersecret12", "full_name": "HH"})
    tok = client.post("/api/v1/auth/login",
                      json={"email": "hh@demo.com", "password": "supersecret12"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    return client, h, _make_resume(state, "hh@demo.com"), state


def test_latest_is_null_before_any_generation(client_and_resume):
    client, h, rid, _ = client_and_resume
    data = client.get(f"/api/v1/resumes/{rid}/highlights/latest", headers=h).json()
    assert data["latest"] is None and data["recent_prompts"] == []


def test_suggest_edits_persists_and_latest_returns_prompt_and_bullets(client_and_resume):
    client, h, rid, _ = client_and_resume
    client.post(f"/api/v1/resumes/{rid}/suggest-edits",
                json={"context": "Shipped a 40% latency win on the checkout service"}, headers=h)
    data = client.get(f"/api/v1/resumes/{rid}/highlights/latest", headers=h).json()
    assert data["latest"] is not None
    assert data["latest"]["mode"] == "suggest"
    assert "checkout service" in data["latest"]["prompt"]
    assert "latency win" in data["recent_prompts"][0]


def test_highlights_suggest_persists_original_paste_as_prompt(client_and_resume):
    client, h, rid, _ = client_and_resume
    paste = "Project Harbor shipped; I led the migration and cut costs 30%."
    client.post(f"/api/v1/resumes/{rid}/highlights/suggest",
                json={"text": paste}, headers=h)
    data = client.get(f"/api/v1/resumes/{rid}/highlights/latest", headers=h).json()
    assert data["latest"]["mode"] == "highlights"
    assert data["latest"]["prompt"] == paste


def test_state_endpoint_persists_accept_reject(client_and_resume):
    client, h, rid, _ = client_and_resume
    client.post(f"/api/v1/resumes/{rid}/suggest-edits",
                json={"context": "Led a cross-functional team of 8"}, headers=h)
    run_id = client.get(f"/api/v1/resumes/{rid}/highlights/latest", headers=h).json()["latest"]["id"]
    out = client.post(f"/api/v1/resumes/{rid}/highlights/runs/{run_id}/state",
                      json={"states": {"0": "accepted"}}, headers=h)
    assert out.status_code == 200 and out.json()["item_states"] == {"0": "accepted"}
    # the state survives a reload
    reloaded = client.get(f"/api/v1/resumes/{rid}/highlights/latest", headers=h).json()
    assert reloaded["latest"]["item_states"] == {"0": "accepted"}
    # unknown run -> 404
    assert client.post(f"/api/v1/resumes/{rid}/highlights/runs/hrun_nope/state",
                       json={"states": {}}, headers=h).status_code == 404


def test_clear_endpoint_forgets_runs(client_and_resume):
    client, h, rid, _ = client_and_resume
    client.post(f"/api/v1/resumes/{rid}/suggest-edits",
                json={"context": "Something worth remembering"}, headers=h)
    assert client.delete(f"/api/v1/resumes/{rid}/highlights", headers=h).status_code == 204
    data = client.get(f"/api/v1/resumes/{rid}/highlights/latest", headers=h).json()
    assert data["latest"] is None


def test_runs_are_scoped_to_owner(client_and_resume):
    client, h, rid, _ = client_and_resume
    client.post(f"/api/v1/resumes/{rid}/suggest-edits",
                json={"context": "owner only"}, headers=h)
    # a second user can't read the first user's highlights (404 on the résumé)
    client.post("/api/v1/auth/register",
                json={"email": "other@demo.com", "password": "supersecret12", "full_name": "O"})
    tok2 = client.post("/api/v1/auth/login",
                       json={"email": "other@demo.com", "password": "supersecret12"}).json()
    h2 = {"Authorization": f"Bearer {tok2['access_token']}"}
    assert client.get(f"/api/v1/resumes/{rid}/highlights/latest", headers=h2).status_code == 404
