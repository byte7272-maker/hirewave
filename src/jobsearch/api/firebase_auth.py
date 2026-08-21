"""Verify Firebase ID tokens so users can sign in with Firebase Auth (Google /
email / etc.) and the app never handles a password.

Mock by default (offline/testable); the live verifier uses the Firebase Admin
SDK when ``firebase_auth=live`` is configured. The frontend logs in with Firebase,
POSTs the resulting ID token to ``/auth/firebase``, and we exchange it for the
app's own session tokens — so the whole existing session/JWT machinery is reused.
"""

from __future__ import annotations

import json
from typing import Optional, Protocol, runtime_checkable

from jobsearch.config import Settings, get_settings


class FirebaseAuthError(Exception):
    """Raised when an ID token can't be verified."""


@runtime_checkable
class FirebaseVerifier(Protocol):
    @property
    def live(self) -> bool: ...
    def verify(self, id_token: str) -> dict: ...  # -> {uid, email, name, email_verified}


class MockFirebaseVerifier:
    """Offline stand-in. Accepts either a plain email (dev convenience) or a JSON
    blob of claims, and returns normalized claims — so the exchange flow is fully
    testable without a real Firebase project."""

    live = False

    def verify(self, id_token: str) -> dict:
        token = (id_token or "").strip()
        if not token:
            raise FirebaseAuthError("empty token")
        if token.startswith("{"):
            try:
                claims = json.loads(token)
            except ValueError as exc:
                raise FirebaseAuthError(f"bad mock token: {exc}") from exc
        elif "@" in token:
            claims = {"email": token, "uid": f"mock_{token}", "email_verified": True}
        else:
            raise FirebaseAuthError("mock token must be an email or a JSON claims blob")
        if not claims.get("email"):
            raise FirebaseAuthError("token has no email")
        claims.setdefault("uid", f"mock_{claims['email']}")
        return claims


class LiveFirebaseVerifier:
    """Verifies real Firebase ID tokens via the Firebase Admin SDK.

    Needs ``pip install firebase-admin`` and credentials — either
    ``GOOGLE_APPLICATION_CREDENTIALS`` pointing at a service-account JSON, or a
    path in ``firebase_credentials_file``. Only the project id is strictly needed
    to check the audience."""

    live = True

    def __init__(self, *, project_id: str = "", credentials_file: str = "", credentials_json: str = "") -> None:
        self._project_id = project_id
        self._credentials_file = credentials_file
        self._credentials_json = credentials_json
        self._app = None

    def _ensure_app(self):  # pragma: no cover - requires firebase-admin + creds
        if self._app is not None:
            return
        import firebase_admin
        from firebase_admin import credentials

        try:
            self._app = firebase_admin.get_app()
        except ValueError:
            if self._credentials_json:  # raw JSON content (managed hosts)
                cred = credentials.Certificate(json.loads(self._credentials_json))
            elif self._credentials_file:  # path on disk (VPS)
                cred = credentials.Certificate(self._credentials_file)
            else:  # Application Default Credentials (GCP)
                cred = credentials.ApplicationDefault()
            opts = {"projectId": self._project_id} if self._project_id else None
            self._app = firebase_admin.initialize_app(cred, opts)

    def verify(self, id_token: str) -> dict:  # pragma: no cover - network / SDK
        from firebase_admin import auth as fb_auth

        self._ensure_app()
        try:
            decoded = fb_auth.verify_id_token(id_token, app=self._app)
        except Exception as exc:  # noqa: BLE001 - SDK raises several types
            raise FirebaseAuthError(str(exc)) from exc
        return {
            "uid": decoded.get("uid", ""),
            "email": decoded.get("email", ""),
            "name": decoded.get("name", ""),
            "email_verified": decoded.get("email_verified", False),
        }


def build_firebase_verifier(settings: Optional[Settings] = None) -> FirebaseVerifier:
    s = settings or get_settings()
    if s.firebase_auth == "live":
        return LiveFirebaseVerifier(
            project_id=s.firebase_project_id,
            credentials_file=s.firebase_credentials_file,
            credentials_json=s.firebase_credentials_json,
        )
    return MockFirebaseVerifier()
