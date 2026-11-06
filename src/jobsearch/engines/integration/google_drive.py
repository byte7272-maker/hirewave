"""Google Drive uploader — the network boundary for "Open in Google Docs".

Given a valid Drive access token and a ``.docx`` byte string, uploads the file to
the user's Drive **converting it to a native Google Doc** (target mimeType
``application/vnd.google-apps.document``), and returns the editable
``webViewLink``. The uploader is injected like the OAuth ``TokenExchanger`` so the
whole flow is testable offline with :class:`MockDriveUploader`.

Scope note: this only ever *creates* files, so the least-privilege
``drive.file`` scope (app-created files only) is sufficient — we never read the
user's existing Drive.
"""

from __future__ import annotations

import json
import secrets
from dataclasses import dataclass
from typing import Optional, Protocol, runtime_checkable

#: The Word (.docx) media type we upload.
DOCX_MEDIA = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
#: The target Drive mimeType that triggers conversion .docx -> native Google Doc.
GOOGLE_DOC_MIME = "application/vnd.google-apps.document"

_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"


class DriveUploadError(RuntimeError):
    """Raised when the Drive API rejects an upload (after token refresh)."""


class DriveAuthError(DriveUploadError):
    """Raised when Drive returns 401/403 — the connection is invalid/expired and
    the user must reconnect (the caller turns this into a reconnect prompt)."""


@dataclass
class DriveFile:
    file_id: str
    web_view_link: str
    name: str


@runtime_checkable
class DriveUploader(Protocol):
    def upload_docx_as_gdoc(
        self, *, access_token: str, docx_bytes: bytes, name: str
    ) -> DriveFile: ...


class MockDriveUploader:
    """Offline stand-in — records the last call so tests can assert the bytes and
    the conversion target, and returns a deterministic Google Docs link."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def upload_docx_as_gdoc(
        self, *, access_token: str, docx_bytes: bytes, name: str
    ) -> DriveFile:
        self.calls.append(
            {
                "access_token": access_token,
                "docx_bytes": docx_bytes,
                "name": name,
                "target_mime": GOOGLE_DOC_MIME,
            }
        )
        fid = "mock-drive-" + secrets.token_hex(4)
        return DriveFile(
            file_id=fid,
            web_view_link=f"https://docs.google.com/document/d/{fid}/edit",
            name=name,
        )


class HttpxDriveUploader:
    """Real Drive v3 multipart upload (create + convert to Google Doc)."""

    def __init__(self, timeout: float = 30.0) -> None:
        self._timeout = timeout

    def upload_docx_as_gdoc(
        self, *, access_token: str, docx_bytes: bytes, name: str
    ) -> DriveFile:
        import httpx

        # Drive's multipart upload expects multipart/related (NOT form-data), so we
        # build the body by hand: part 1 = JSON metadata, part 2 = the .docx bytes.
        boundary = "harbor-" + secrets.token_hex(12)
        metadata = {"name": name, "mimeType": GOOGLE_DOC_MIME}
        body = (
            f"--{boundary}\r\n"
            "Content-Type: application/json; charset=UTF-8\r\n\r\n"
            f"{json.dumps(metadata)}\r\n"
            f"--{boundary}\r\n"
            f"Content-Type: {DOCX_MEDIA}\r\n\r\n"
        ).encode("utf-8") + docx_bytes + f"\r\n--{boundary}--".encode("utf-8")

        try:
            resp = httpx.post(
                _UPLOAD_URL,
                params={"uploadType": "multipart", "fields": "id,webViewLink,name"},
                content=body,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": f"multipart/related; boundary={boundary}",
                },
                timeout=self._timeout,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            code = exc.response.status_code if exc.response is not None else 0
            snippet = exc.response.text[:300] if exc.response is not None else ""
            if code in (401, 403):
                raise DriveAuthError(f"Drive rejected the request (HTTP {code}): {snippet}") from exc
            raise DriveUploadError(f"Drive upload failed (HTTP {code}): {snippet}") from exc
        except httpx.HTTPError as exc:  # connection/timeout/etc.
            raise DriveUploadError(f"Drive upload request failed: {exc}") from exc

        payload = resp.json()
        file_id = payload.get("id", "")
        link = payload.get("webViewLink") or (
            f"https://docs.google.com/document/d/{file_id}/edit" if file_id else ""
        )
        if not file_id or not link:
            raise DriveUploadError("Drive upload returned no file id / link")
        return DriveFile(file_id=file_id, web_view_link=link, name=payload.get("name", name))


def build_drive_uploader(settings) -> DriveUploader:
    """Live uploader in ``oauth_mode=live``, else the offline mock (mirrors how the
    token exchanger is chosen)."""
    if getattr(settings, "oauth_mode", "mock") == "live":
        return HttpxDriveUploader()
    return MockDriveUploader()
