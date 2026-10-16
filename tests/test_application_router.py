from __future__ import annotations

from jobsearch.engines.application_router import ApplicationRouter
from jobsearch.engines.sourcing.job_email import JobEmail, classify_job_email
from jobsearch.models import Application, ApplicationStatus, JobPosting, Notification
from jobsearch.store import InMemoryRepository


def _router(notifier=None):
    apps = InMemoryRepository(id_attr="id")
    jobs = InMemoryRepository(id_attr="id")
    return ApplicationRouter(applications=apps, jobs=jobs, notifier=notifier), apps, jobs


def _job(jobs, *, company="Acme", title="Senior Data Engineer", url="") -> JobPosting:
    return jobs.add(JobPosting(company=company, title=title, url=url))


def _app(apps, job, *, user="u1", status=ApplicationStatus.SUBMITTED) -> Application:
    return apps.add(Application(user_id=user, job_posting_id=job.id, status=status))


def _email(kind, company="", role="", link="", sender_domain="x.co") -> JobEmail:
    return JobEmail(
        is_job=True, kind=kind, confidence=0.8, sender=f"a@{sender_domain}",
        sender_domain=sender_domain, subject="(test)", company=company, role=role, link=link,
    )


# -- advancing existing applications ----------------------------------------
def test_interview_email_advances_matched_application_by_company():
    r, apps, jobs = _router()
    job = _job(jobs)
    app = _app(apps, job, status=ApplicationStatus.SUBMITTED)
    res = r.route("u1", [_email("interview", company="Acme Inc.")])
    assert res.routed == 1 and res.advanced == 1 and res.created == 0
    rec = res.applications[0]
    assert rec.action == "advanced" and rec.from_status == "submitted" and rec.status == "interviewing"
    assert apps.get(app.id).status == ApplicationStatus.INTERVIEWING
    # audit trail records the inbox source
    assert any(e["action"] == "inbox_status_update" for e in apps.get(app.id).audit_trail)


def test_link_match_wins_regardless_of_company():
    r, apps, jobs = _router()
    job = _job(jobs, company="Acme", url="https://acme.greenhouse.io/jobs/123")
    _app(apps, job, status=ApplicationStatus.SUBMITTED)
    # company blank on the email, but the link ties it to the posting
    res = r.route("u1", [_email("offer", company="", link="https://acme.greenhouse.io/jobs/123")])
    assert res.advanced == 1 and res.applications[0].status == "offered"


def test_role_breaks_ties_between_same_company_applications():
    r, apps, jobs = _router()
    j1 = _job(jobs, company="Acme", title="Frontend Engineer")
    j2 = _job(jobs, company="Acme", title="Senior Data Engineer")
    a1 = _app(apps, j1)
    a2 = _app(apps, j2)
    res = r.route("u1", [_email("interview", company="Acme", role="Senior Data Engineer")])
    assert res.advanced == 1
    assert apps.get(a2.id).status == ApplicationStatus.INTERVIEWING
    assert apps.get(a1.id).status == ApplicationStatus.SUBMITTED  # untouched


# -- forward-only / terminal rules ------------------------------------------
def test_stale_application_email_does_not_downgrade_offer():
    r, apps, jobs = _router()
    job = _job(jobs)
    app = _app(apps, job, status=ApplicationStatus.OFFERED)
    res = r.route("u1", [_email("application", company="Acme")])
    assert res.routed == 1 and res.unchanged == 1 and res.advanced == 0
    assert res.applications[0].action == "unchanged"
    assert apps.get(app.id).status == ApplicationStatus.OFFERED  # not dragged back


def test_rejection_is_terminal_and_applies_from_any_live_stage():
    r, apps, jobs = _router()
    job = _job(jobs)
    app = _app(apps, job, status=ApplicationStatus.INTERVIEWING)
    r.route("u1", [_email("rejection", company="Acme")])
    assert apps.get(app.id).status == ApplicationStatus.REJECTED
    # a later interview email can't revive a rejected application
    res2 = r.route("u1", [_email("interview", company="Acme")])
    assert res2.unchanged == 1
    assert apps.get(app.id).status == ApplicationStatus.REJECTED


# -- creating a row when the email ties to a known posting ------------------
def test_application_email_creates_row_when_posting_known_but_untracked():
    r, apps, jobs = _router()
    job = _job(jobs, company="Acme", title="Senior Data Engineer")
    res = r.route("u1", [_email("application", company="Acme", role="Senior Data Engineer")])
    assert res.created == 1 and res.routed == 1
    created = apps.find(user_id="u1")
    assert len(created) == 1
    assert created[0].job_posting_id == job.id
    assert created[0].status == ApplicationStatus.SUBMITTED
    assert created[0].submitted_at is not None
    assert any(e["action"] == "created_from_inbox" for e in created[0].audit_trail)


def test_no_match_and_no_known_posting_is_skipped_not_created():
    r, apps, jobs = _router()
    _job(jobs, company="Acme")  # unrelated posting
    res = r.route("u1", [_email("application", company="Zenith Dynamics")])
    assert res.skipped == 1 and res.routed == 0 and res.created == 0
    assert apps.find(user_id="u1") == []


# -- non-progress kinds are never routed ------------------------------------
def test_recruiter_and_alert_emails_are_not_routed():
    r, apps, jobs = _router()
    job = _job(jobs, company="Acme")
    _app(apps, job, status=ApplicationStatus.SUBMITTED)
    res = r.route("u1", [_email("recruiter", company="Acme"), _email("alert", company="Acme")])
    assert res.routed == 0 and res.skipped == 0 and res.created == 0
    assert job  # unchanged


# -- notifications for positive progress ------------------------------------
def test_interview_and_offer_notify_but_submitted_does_not():
    sent: list[Notification] = []
    r, apps, jobs = _router(notifier=sent.append)
    job = _job(jobs, company="Acme", title="Senior Data Engineer")
    _app(apps, job, status=ApplicationStatus.DRAFT)
    r.route("u1", [_email("interview", company="Acme")])
    assert len(sent) == 1 and "Interview" in sent[0].message and "Acme" in sent[0].message
    # advancing to submitted (from a created row) must NOT notify
    sent.clear()
    r.route("u1", [_email("application", company="Globex", role="PM")])  # no posting -> skipped
    assert sent == []


# -- isolation between users ------------------------------------------------
def test_routing_is_scoped_to_the_user():
    r, apps, jobs = _router()
    job = _job(jobs, company="Acme")
    other = _app(apps, job, user="u2", status=ApplicationStatus.SUBMITTED)
    res = r.route("u1", [_email("interview", company="Acme")])
    # u1 has no application and the posting is Acme -> creates u1's own row, never touches u2's
    assert res.created == 1
    assert apps.get(other.id).status == ApplicationStatus.SUBMITTED


# -- end-to-end through the scan endpoint -----------------------------------
def test_scan_endpoint_routes_into_tracker():
    from fastapi.testclient import TestClient
    from jobsearch.api.app import create_app
    from jobsearch.api.state import AppState
    from jobsearch.engines.integration import MockTokenExchanger
    from jobsearch.models import JobPosting

    state = AppState(exchanger=MockTokenExchanger())
    client = TestClient(create_app(state=state))
    client.post("/api/v1/auth/register",
                json={"email": "rt@demo.com", "password": "supersecret12", "full_name": "RT"})
    tok = client.post("/api/v1/auth/login",
                      json={"email": "rt@demo.com", "password": "supersecret12"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    uid = state.user_by_email("rt@demo.com").id

    # Pre-seed a tracked application that the mock "Thank you for applying to Acme"
    # (Senior Data Engineer) email will advance.
    job = state.jobs.add(JobPosting(company="Acme", title="Senior Data Engineer"))
    state.applications.add(Application(
        user_id=uid, job_posting_id=job.id, status=ApplicationStatus.DRAFT))

    data = client.post("/api/v1/inbox/scan", headers=h).json()  # offline mock mailbox
    assert "tracker" in data
    tr = data["tracker"]
    # the application-confirmation email advanced our draft row to submitted
    assert tr["advanced"] >= 1
    assert any(a["company"].lower().startswith("acme") and a["status"] == "submitted"
               and a["action"] == "advanced" for a in tr["applications"])
    # the application is now submitted in the tracker
    apps = client.get("/api/v1/applications", headers=h).json()
    assert any(a["status"] == "submitted" for a in apps)
