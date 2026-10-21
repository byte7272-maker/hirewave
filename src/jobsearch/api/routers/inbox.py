"""In-app inbox — forward job-alert emails to your account."""

from __future__ import annotations

import json as _json

from fastapi import APIRouter, Header, HTTPException, Query, Request, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.engines.integration.engine import IntegrationError
from jobsearch.engines.sourcing.job_email import classify_job_email, raw_to_fields
from jobsearch.models import InboxMessage, Provider

router = APIRouter(prefix="/api/v1/inbox", tags=["inbox"])


@router.get("/address")
def my_address(user: CurrentUser, state: StateDep) -> dict:
    """The user's personal forwarding address — forward job alerts here."""
    u = state.users.get(user.id)
    return {"address": state.inbox.address_for(u)}


@router.get("", response_model=list[InboxMessage])
def list_inbox(user: CurrentUser, state: StateDep) -> list[InboxMessage]:
    return state.inbox.list(user.id)


@router.post("/{message_id}/read", response_model=InboxMessage)
def mark_read(message_id: str, user: CurrentUser, state: StateDep) -> InboxMessage:
    m = state.inbox.mark_read(message_id, user.id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "message not found")
    return m


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_message(message_id: str, user: CurrentUser, state: StateDep) -> None:
    if not state.inbox.delete(message_id, user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "message not found")


@router.post("/sync-gmail")
def sync_gmail(user: CurrentUser, state: StateDep) -> dict:
    """Auto-pull recent job alerts from the user's connected Gmail inbox.

    With the offline ``mock`` fetcher no connection is needed; the ``http``
    fetcher uses the Gmail read scope granted when the user connected Gmail.
    """
    fetcher = state.gmail_fetcher
    token = ""
    if fetcher.live:
        try:
            token = state.integration.get_access_token(user.id, Provider.GMAIL)
        except IntegrationError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"connect Gmail first: {exc}") from exc
    raws = fetcher.fetch(access_token=token)
    msgs, ingested = state.inbox.sync(user.id, raws)
    return {"fetched": len(raws), "ingested": ingested, "message_ids": [m.id for m in msgs]}


@router.post("/scan")
def scan_job_mail(user: CurrentUser, state: StateDep, source: str = "mailbox") -> dict:
    """Scan a connected mailbox for ONLY job email and pull it into your results.

    ``source=mailbox`` (default) scans your **dedicated / IMAP job account** — the
    best-privacy option, since it holds only job mail. ``source=gmail`` scans your
    connected Gmail. Every message is classified; **non-job mail is dropped before
    anything is read in** (the privacy gate), and the job mail is categorized by kind
    (alert / application / interview / offer / rejection / recruiter). Postings carried
    by the job mail are ingested into your search results."""
    if source == "gmail":
        fetcher = state.gmail_fetcher
        token = ""
        if fetcher.live:
            try:
                token = state.integration.get_access_token(user.id, Provider.GMAIL)
            except IntegrationError as exc:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"connect Gmail first: {exc}") from exc
        raws = fetcher.fetch(access_token=token)
    elif source == "mailbox":
        raws = state.job_mail_source.fetch()
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "source must be 'mailbox' or 'gmail'")

    # Privacy gate: classify first, keep ONLY job email; never read non-job mail further.
    job: list[tuple] = []
    for raw in raws:
        f = raw_to_fields(raw)
        c = classify_job_email(f["sender"], f["subject"], f["body"])
        if c.is_job:
            job.append((c, raw))

    job_raws = [raw for _, raw in job]
    # Ingest first so a posting carried by the email exists before routing can tie a
    # new tracker row to it.
    _, ingested = state.inbox.sync(user.id, job_raws) if job_raws else ([], 0)
    # Route progress-kind email (application/interview/offer/rejection) into the
    # applications tracker — one-way, no reply.
    routing = state.application_router.route(user.id, [c for c, _ in job])

    by_kind: dict[str, int] = {}
    for c, _ in job:
        by_kind[c.kind] = by_kind.get(c.kind, 0) + 1
    return {
        "source": source,
        "fetched": len(raws),
        "job_found": len(job),
        "ingested": ingested,
        "by_kind": by_kind,
        "tracker": {
            "routed": routing.routed,
            "created": routing.created,
            "advanced": routing.advanced,
            "unchanged": routing.unchanged,
            "skipped": routing.skipped,
            "by_status": routing.by_status,
            "applications": [
                {"application_id": r.application_id, "job_posting_id": r.job_posting_id,
                 "company": r.company, "role": r.role, "kind": r.kind,
                 "status": r.status, "action": r.action, "from_status": r.from_status}
                for r in routing.applications
            ],
        },
        "emails": [
            {"kind": c.kind, "status": c.status, "company": c.company, "role": c.role,
             "link": c.link, "subject": c.subject, "from": c.sender_domain,
             "confidence": c.confidence}
            for c, _ in job
        ],
    }


# Inbound-email providers POST with different shapes; read the recipient, the raw
# MIME, and the parts under any of their common field names so one webhook works for
# SendGrid Inbound Parse, Mailgun Routes, Postmark, Cloudflare Email Workers, etc.
_RECIP_KEYS = ("to", "To", "recipient", "OriginalRecipient", "original_recipient")
_RAW_KEYS = ("email", "raw", "RawEmail", "mime", "MimeContent", "body-mime")
_FROM_KEYS = ("from", "From", "sender", "FromFull")
_SUBJ_KEYS = ("subject", "Subject")
_TEXT_KEYS = ("text", "TextBody", "body-plain", "plain", "stripped-text")
_HTML_KEYS = ("html", "HtmlBody", "body-html")


async def _read_payload(request: Request) -> dict:
    """Body as a flat dict, whether the provider sent JSON or form/multipart."""
    ctype = (request.headers.get("content-type") or "").lower()
    if "application/json" in ctype:
        try:
            data = await request.json()
            return data if isinstance(data, dict) else {}
        except Exception:  # noqa: BLE001
            return {}
    try:
        form = await request.form()
        return {k: (v if isinstance(v, str) else getattr(v, "filename", "")) for k, v in form.items()}
    except Exception:  # noqa: BLE001
        return {}


def _first(d: dict, keys: tuple) -> str:
    for k in keys:
        v = d.get(k)
        if isinstance(v, str) and v.strip():
            return v
    return ""


def _recipient(d: dict) -> str:
    """The delivered-to address (contains ``jobs+<token>@…``)."""
    v = _first(d, _RECIP_KEYS)
    if v:
        return v
    env = d.get("envelope")  # SendGrid sends {"to":["x@.."],"from":".."} (JSON string)
    if env:
        try:
            e = env if isinstance(env, dict) else _json.loads(env)
            tos = e.get("to")
            if isinstance(tos, list) and tos:
                return str(tos[0])
            if isinstance(tos, str):
                return tos
        except Exception:  # noqa: BLE001
            pass
    return ""


def _raw_message(d: dict) -> str:
    """Prefer the full raw MIME; otherwise synthesize a minimal RFC 822 message from
    the parsed parts so the alert parser can still read sender/subject/links."""
    raw = _first(d, _RAW_KEYS)
    if raw:
        return raw
    frm, subj = _first(d, _FROM_KEYS), _first(d, _SUBJ_KEYS)
    text, html = _first(d, _TEXT_KEYS), _first(d, _HTML_KEYS)
    headers = []
    if frm:
        headers.append(f"From: {frm}")
    if subj:
        headers.append(f"Subject: {subj}")
    headers.append("Content-Type: text/plain" if (text or not html) else "Content-Type: text/html")
    return "\n".join(headers) + "\n\n" + (text or html)


@router.post("/inbound")
async def inbound(
    request: Request,
    state: StateDep,
    secret: str = Query(default=""),
    x_inbox_secret: str = Header(default="", alias="X-Inbox-Secret"),
) -> dict:
    """Webhook for an inbound-email provider (SendGrid / Mailgun / Postmark / Cloudflare).

    Routes a received email to the user whose forwarding token matches the recipient,
    files it in their inbox, and ingests any job links. Accepts JSON or form bodies and
    the common per-provider field names. Gated by a shared secret, supplied either as the
    ``X-Inbox-Secret`` header or a ``?secret=`` query param (providers that can't add
    headers use the query). Blank configured secret = allow (local testing). Unknown
    recipients are silently accepted so the endpoint can't be used to probe addresses.
    """
    expected = state.settings.inbox_webhook_secret
    provided = x_inbox_secret or secret
    if expected and provided != expected:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid webhook secret")
    data = await _read_payload(request)
    target = state.inbox.user_for_address(_recipient(data))
    if target is None:
        return {"accepted": False}
    msg, result = state.inbox.receive(target.id, _raw_message(data))
    return {"accepted": True, "message_id": msg.id, "ingested": result.ingested}
