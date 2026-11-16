"""The assistant's backend reasoning path: a plain-language walk-through (what it found,
why, and the benefit to the user's goal) plus anticipated + BULKED permissions, so the
user grants once and feels the automation instead of being nagged per step."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.assistant import reasoning as rz
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.models.automation_assist import AUTOMATION_SCOPES


# --- pure engine ------------------------------------------------------------
def test_explain_walks_what_why_benefit_and_names_the_permission():
    e = rz.explain("research_company", subject="Plaid", goal="an IT director role")
    assert e["action"] == "research_company"
    # the three parts of the walk-through are all present and mention the subject/goal
    assert "Plaid" in e["what"]
    assert e["why"] and e["benefit"]
    assert "it director role" in e["benefit"].lower()
    # it anticipates the permission it needs (web_research), and the narration asks once
    assert e["permissions"]["to_request"] == ["web_research"]
    assert e["narration"].endswith(e["permissions"]["ask"])
    assert e["what"] in e["narration"] and e["why"] in e["narration"]


def test_already_granted_scope_is_not_re_requested():
    e = rz.explain("research_company", subject="Plaid", granted=["web_research"])
    perms = e["permissions"]
    assert perms["to_request"] == []          # nothing to ask — already on
    assert perms["already_granted"] == ["web_research"]
    assert perms["prompt"] == "" and perms["ask"] == ""  # no nag


def test_plan_bundles_all_permissions_into_one_ask():
    # "Apply to this job" needs three scopes — the user should be asked ONCE, not thrice.
    out = rz.explain_plan(["apply_job"], subject="Acme")
    perms = out["permissions"]
    assert set(perms["to_request"]) == {"draft_prep", "form_autofill", "submit_after_review"}
    assert "turn those 3 on together" in perms["ask"]
    # single_grant is the exact scope list to POST to PUT /assistant/consent at once
    assert set(perms["single_grant"]) == {"draft_prep", "form_autofill", "submit_after_review"}
    assert len(out["steps"]) == 1 and out["narration"]


def test_plan_only_requests_the_still_missing_scopes():
    out = rz.explain_plan(["research_and_apply"], granted=["web_research", "draft_prep"])
    perms = out["permissions"]
    assert set(perms["to_request"]) == {"form_autofill", "submit_after_review"}
    # single_grant keeps the already-granted ones so nothing is revoked
    assert set(perms["single_grant"]) == {
        "web_research", "draft_prep", "form_autofill", "submit_after_review"
    }


def test_scopes_for_unions_across_actions_and_ignores_unknown():
    scopes = rz.scopes_for(["research_company", "autofill", "not_a_thing"])
    assert scopes == ["web_research", "form_autofill"]
    assert all(s in AUTOMATION_SCOPES for s in scopes)


def test_intents_resolve_to_actions():
    assert rz.resolve_action("web_search") == "research_company"
    assert rz.resolve_action("auto_apply") == "apply_job"
    assert rz.resolve_action("bogus") is None


# --- endpoint ---------------------------------------------------------------
def _client():
    st = AppState(settings=Settings(), exchanger=MockTokenExchanger())
    c = TestClient(create_app(state=st))
    c.post("/api/v1/auth/register", json={"email": "z@x.com", "password": "supersecret", "full_name": "Z"})
    tok = c.post("/api/v1/auth/login", json={"email": "z@x.com", "password": "supersecret"}).json()
    return c, {"Authorization": f"Bearer {tok['access_token']}"}


def test_reasoning_endpoint_explains_and_bundles_against_current_grants():
    c, h = _client()
    # nothing granted yet → the plan asks for all three at once
    r = c.post("/api/v1/assistant/reasoning", headers=h,
               json={"actions": ["apply_job"], "subject": "Acme", "goal": "a backend role"})
    assert r.status_code == 200
    body = r.json()
    assert body["plan"] is True and body["narration"]
    assert set(body["permissions"]["to_request"]) == {
        "draft_prep", "form_autofill", "submit_after_review"
    }
    # grant one, re-ask → only the remaining two are requested
    c.put("/api/v1/assistant/consent", headers=h, json={"scopes": ["draft_prep"]})
    r2 = c.post("/api/v1/assistant/reasoning", headers=h, json={"actions": ["apply_job"]})
    assert set(r2.json()["permissions"]["to_request"]) == {"form_autofill", "submit_after_review"}


def test_reasoning_endpoint_404_on_unknown_action():
    c, h = _client()
    r = c.post("/api/v1/assistant/reasoning", headers=h, json={"action": "levitate"})
    assert r.status_code == 404
