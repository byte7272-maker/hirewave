"""Authentication primitives: PBKDF2 password hashing + JWT (RS256).

The plan mandates JWT with RS256 signing. Keys come from the environment
(``JOBSEARCH_JWT_PRIVATE_KEY`` / ``JOBSEARCH_JWT_PUBLIC_KEY``, PEM). If unset, an
ephemeral RSA-2048 keypair is generated for the process — fine for dev/tests,
but tokens will not survive a restart, so configure real keys in production.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# --- password hashing -------------------------------------------------------
_PBKDF2_ROUNDS = 200_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${_PBKDF2_ROUNDS}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds_s, salt_b64, dk_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(dk_b64)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(rounds_s))
        return hmac.compare_digest(dk, expected)
    except (ValueError, TypeError):
        return False


# --- JWT (RS256) ------------------------------------------------------------
ACCESS_TTL = timedelta(minutes=30)
REFRESH_TTL = timedelta(days=7)


@dataclass
class _Keys:
    private_pem: bytes
    public_pem: bytes


@lru_cache
def _keys() -> _Keys:
    # PEMs may be provided with real newlines OR as a single line with literal
    # "\n" escapes (the common way to fit a key into one .env value).
    priv = os.getenv("JOBSEARCH_JWT_PRIVATE_KEY", "").replace("\\n", "\n")
    pub = os.getenv("JOBSEARCH_JWT_PUBLIC_KEY", "").replace("\\n", "\n")
    if priv and pub:
        return _Keys(priv.encode(), pub.encode())
    # Ephemeral dev keypair.
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return _Keys(private_pem, public_pem)


class TokenError(Exception):
    pass


def _create_token(sub: str, token_type: str, ttl: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "type": token_type,
        "jti": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(payload, _keys().private_pem, algorithm="RS256")


def create_access_token(user_id: str) -> str:
    return _create_token(user_id, "access", ACCESS_TTL)


def create_refresh_token(user_id: str) -> str:
    return _create_token(user_id, "refresh", REFRESH_TTL)


def decode_token(token: str, *, expected_type: str | None = None) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, _keys().public_pem, algorithms=["RS256"])
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
    if expected_type and payload.get("type") != expected_type:
        raise TokenError(f"expected {expected_type} token, got {payload.get('type')}")
    return payload
