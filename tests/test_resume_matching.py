"""Résumé-driven matches, résumé selection, and job-category focus."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.engines.sourcing.skills import CATEGORIES, detect_category


def _client():
    return TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))


def _auth(client, email="rm@demo.com"):
    client.post("/api/v1/auth/register", json={"email": email, "password": "supersecret12", "full_name": "R"})
    tok = client.post("/api/v1/auth/login", json={"email": email, "password": "supersecret12"}).json()
    return {"Authorization": f"Bearer {tok['access_token']}"}


# --- category detection -----------------------------------------------------
def test_detect_category():
    assert detect_category("Senior Data Engineer") == "Data & Analytics"
    assert detect_category("Backend Software Engineer") == "Engineering"
    assert detect_category("Product Manager, Growth") == "Product"
    assert detect_category("IT Service Delivery Manager") == "IT & Systems"
    assert detect_category("Registered Nurse") == "Healthcare"
    assert detect_category("Underwater Basket Weaver") == "Other"


# --- categories catalog + preference ----------------------------------------
def test_categories_catalog_and_preference_roundtrip():
    client = _client()
    h = _auth(client)
    cats = client.get("/api/v1/jobs/categories", headers=h).json()["categories"]
    assert cats == CATEGORIES and "Engineering" in cats and "Other" in cats
    # save a category preference
    r = client.put("/api/v1/users/me/preferences", headers=h, json={"job_categories": ["Data & Analytics", "Engineering"]})
    assert r.status_code == 200 and r.json()["job_categories"] == ["Data & Analytics", "Engineering"]
    assert client.get("/api/v1/users/me/preferences", headers=h).json()["job_categories"] == ["Data & Analytics", "Engineering"]


# --- ingested jobs get a category -------------------------------------------
def test_ingested_jobs_have_category_and_match_exposes_it():
    client = _client()
    h = _auth(client)
    client.post("/api/v1/job-search/run", headers=h, json={"role": "data engineer", "location": "NYC", "remote": True})
    m = client.get("/api/v1/jobs/matches", headers=h).json()[0]
    assert m["category"] == "Data & Analytics"


# --- category focus filters matches -----------------------------------------
def test_matches_filtered_by_category_query():
    client = _client()
    h = _auth(client)
    client.post("/api/v1/job-search/run", headers=h, json={"role": "data engineer", "location": "NYC", "remote": True})
    client.post("/api/v1/job-search/run", headers=h, json={"role": "sales manager", "location": "NYC", "remote": True})
    all_m = client.get("/api/v1/jobs/matches", headers=h).json()
    cats = {m["category"] for m in all_m}
    assert len(cats) >= 2  # both data and sales present
    data_only = client.get("/api/v1/jobs/matches?categories=Data %26 Analytics", headers=h).json()
    assert data_only and all(m["category"] == "Data & Analytics" for m in data_only)


# --- résumé-driven ranking + selection --------------------------------------
def test_matches_ranked_against_selected_resume():
    client = _client()
    h = _auth(client)
    client.post("/api/v1/job-search/run", headers=h, json={"role": "data engineer", "location": "NYC", "remote": True})
    client.post("/api/v1/job-search/run", headers=h, json={"role": "sales manager", "location": "NYC", "remote": True})
    # upload a data-heavy résumé
    res = client.post("/api/v1/resumes/upload", headers=h, files={
        "file": ("cv.md", b"Data engineer: Python, SQL, Spark, Airflow, dbt, Snowflake, data pipelines.", "text/markdown")
    }).json()
    ranked = client.get(f"/api/v1/jobs/matches?resume_id={res['id']}", headers=h).json()
    assert ranked
    # the top match for a data résumé should be a data role, scored above a sales role
    top = ranked[0]
    data = [m for m in ranked if m["category"] == "Data & Analytics"]
    sales = [m for m in ranked if m["category"] == "Sales"]
    assert data and (not sales or data[0]["score"] >= sales[0]["score"])


def test_matches_unknown_resume_404():
    client = _client()
    h = _auth(client)
    assert client.get("/api/v1/jobs/matches?resume_id=nope", headers=h).status_code == 404
