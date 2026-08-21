"""In-app inbox — forward job-alert emails to your account."""

from __future__ import annotations

from fastapi import APIRouter, Form, Header, HTTPException, status

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.engines.integration.engine import IntegrationError
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


@router.post("/inbound")
async def inbound(
    state: StateDep,
    to: str = Form(...),
    email: str = Form(default=""),
    html: str = Form(default=""),
    text: str = Form(default=""),
    x_inbox_secret: str = Header(default="", alias="X-Inbox-Secret"),
) -> dict:
    """Webhook for an inbound-email provider (SendGrid/Postmark/Mailgun).

    Routes a received email to the user whose forwarding token matches ``to``,
    files it in their inbox, and ingests any job links. Gated by a shared secret
    (blank secret = allow, for local testing). Unknown recipients are silently
    accepted so the endpoint can't be used to probe which addresses exist.
    """
    secret = state.settings.inbox_webhook_secret
    if secret and x_inbox_secret != secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid webhook secret")
    target = state.inbox.user_for_address(to)
    if target is None:
        return {"accepted": False}
    raw = email or html or text
    msg, result = state.inbox.receive(target.id, raw)
    return {"accepted": True, "message_id": msg.id, "ingested": result.ingested}
