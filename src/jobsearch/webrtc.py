"""ICE-server configuration for peer WebRTC (STUN always, TURN when configured).

For TURN we prefer coturn's REST auth: the client is handed a **short-lived,
time-limited credential** derived from the shared secret via HMAC — so the
static ``turn_secret`` never leaves the backend, and leaked creds expire on
their own. (Static username/password is also supported as a simpler fallback.)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from typing import Optional

from jobsearch.config import Settings, get_settings

#: Public STUN — enough for most networks; TURN is only needed behind
#: restrictive / symmetric NATs.
DEFAULT_STUN = [
    "stun:stun.l.google.com:19302",
    "stun:global.stun.twilio.com:3478",
]


def _ephemeral_credential(secret: str, user_id: str, ttl: int, *, now: Optional[int] = None) -> tuple[str, str]:
    """coturn REST credential: username = "<expiry>:<user>", credential =
    base64(HMAC-SHA1(secret, username))."""
    expiry = (now if now is not None else int(time.time())) + max(60, ttl)
    username = f"{expiry}:{user_id or 'peer'}"
    digest = hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()
    return username, base64.b64encode(digest).decode()


def build_ice_servers(settings: Optional[Settings] = None, *, user_id: str = "", now: Optional[int] = None) -> list[dict]:
    s = settings or get_settings()
    servers: list[dict] = [{"urls": list(DEFAULT_STUN)}]

    turn_urls = [u.strip() for u in s.turn_urls.split(",") if u.strip()]
    if turn_urls:
        entry: dict = {"urls": turn_urls}
        if s.turn_secret:
            username, credential = _ephemeral_credential(s.turn_secret, user_id, s.turn_ttl_seconds, now=now)
            entry["username"] = username
            entry["credential"] = credential
        elif s.turn_username and s.turn_password:
            entry["username"] = s.turn_username
            entry["credential"] = s.turn_password
        servers.append(entry)
    return servers
