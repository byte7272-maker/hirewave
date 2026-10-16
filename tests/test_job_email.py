from __future__ import annotations

from jobsearch.engines.sourcing.job_email import (
    JobEmail,
    classify_job_email,
    scan_job_emails,
)


def test_job_board_alert_is_job():
    r = classify_job_email(
        "LinkedIn Job Alerts <jobs-noreply@linkedin.com>",
        "3 new jobs for you",
        "Senior Data Engineer at Acme ...",
    )
    assert r.is_job and r.kind == "alert" and r.confidence >= 0.6


def test_ats_application_confirmation_extracts_company():
    r = classify_job_email(
        "no-reply@acme.greenhouse-mail.io",
        "Thank you for applying to Acme",
        "We received your application and will be in touch.",
    )
    assert r.is_job and r.kind == "application"
    assert r.company.lower() == "acme"


def test_recruiter_outreach_from_personal_domain_is_job():
    # Not a known ATS domain, but clear recruiter language -> still job email.
    r = classify_job_email(
        "jane@talent-partners.com",
        "Exciting opportunity at Globex",
        "I came across your profile and think you'd be a great fit for an open role.",
    )
    assert r.is_job and r.kind == "recruiter"
    assert r.company == "Globex"


def test_interview_and_rejection_and_offer_kinds():
    iv = classify_job_email("recruiting@lever.co", "Next steps",
                            "We'd love to schedule a call — what's your availability for a phone screen?")
    assert iv.is_job and iv.kind == "interview"
    rej = classify_job_email("careers@workday.com", "Your application",
                             "Unfortunately we have decided not to proceed with other candidates.")
    assert rej.is_job and rej.kind == "rejection"
    off = classify_job_email("hr@startup.icims.com", "Good news",
                             "We are excited to offer you the role — your offer letter is attached.")
    assert off.is_job and off.kind == "offer"


def test_personal_email_is_not_job_privacy_gate():
    r = classify_job_email("mom@gmail.com", "Dinner on Sunday?",
                           "Can you make it this weekend? Love you.")
    assert r.is_job is False and r.kind == "other" and r.confidence == 0.0


def test_weak_hint_alone_is_not_job():
    # A newsletter that merely mentions the word "career" must NOT be surfaced.
    r = classify_job_email("news@substack.com", "This week in tech",
                           "A great read about career growth and productivity.")
    assert r.is_job is False


def test_scan_filters_to_job_only_and_reads_lenient_keys():
    batch = [
        {"from": "jobs-noreply@linkedin.com", "subject": "jobs for you", "snippet": "roles..."},
        {"sender": "mom@gmail.com", "subject": "hi", "body": "call me"},
        {"From": "no-reply@acme.greenhouse.io", "Subject": "Thank you for applying", "text": "received your application"},
    ]
    out = scan_job_emails(batch)
    assert all(isinstance(j, JobEmail) and j.is_job for j in out)
    assert len(out) == 2  # linkedin alert + greenhouse application; mom's email dropped
    kinds = {j.kind for j in out}
    assert kinds == {"alert", "application"}


def test_subdomain_sender_matches_known_domain():
    from jobsearch.engines.sourcing.job_email import _is_job_sender, _domain_of
    assert _is_job_sender(_domain_of("x@jobs.company.greenhouse.io")) is True
    assert _is_job_sender(_domain_of("x@company.myworkday.com")) is True
    assert _is_job_sender(_domain_of("x@example.com")) is False


def test_raw_to_fields_parses_sender_subject_body():
    from jobsearch.engines.sourcing.job_email import raw_to_fields
    raw = ("From: Jane <jane@acme.greenhouse.io>\nSubject: Thank you for applying\n"
           "Content-Type: text/plain\n\nWe received your application.")
    f = raw_to_fields(raw)
    assert "jane@acme.greenhouse.io" in f["sender"]
    assert "applying" in f["subject"].lower() and "received" in f["body"].lower()


def test_mock_mail_source_scans_to_job_kinds():
    from jobsearch.engines.sourcing.imap_source import MockJobMailSource
    from jobsearch.engines.sourcing.job_email import classify_raw_emails
    emails = classify_raw_emails(MockJobMailSource().fetch())
    assert len(emails) == 4  # the dedicated mailbox sample is all job mail
    assert {"recruiter", "application", "interview", "rejection"} <= {e.kind for e in emails}


def test_scan_endpoint_filters_and_categorizes():
    from fastapi.testclient import TestClient
    from jobsearch.api.app import create_app
    from jobsearch.api.state import AppState
    from jobsearch.engines.integration import MockTokenExchanger

    client = TestClient(create_app(state=AppState(exchanger=MockTokenExchanger())))
    client.post("/api/v1/auth/register",
                json={"email": "je@demo.com", "password": "supersecret12", "full_name": "JE"})
    tok = client.post("/api/v1/auth/login",
                      json={"email": "je@demo.com", "password": "supersecret12"}).json()
    h = {"Authorization": f"Bearer {tok['access_token']}"}
    r = client.post("/api/v1/inbox/scan", headers=h)  # source=mailbox (default, offline mock)
    assert r.status_code == 200
    data = r.json()
    assert data["source"] == "mailbox" and data["fetched"] == 4 and data["job_found"] == 4
    assert set(data["by_kind"]) >= {"recruiter", "application", "interview", "rejection"}
    assert all("confidence" in e and "kind" in e for e in data["emails"])
    # unknown source -> 400
    assert client.post("/api/v1/inbox/scan?source=bogus", headers=h).status_code == 400
