"""Minimal HeyGen client for pre-rendering interviewer clips (talking-photo videos).

We don't stream — we batch-generate a short MP4 of each persona asking each fixed
question, then cache and replay it. Flow: upload the persona photo once (→ a
``talking_photo_id``), then for each line generate a video, poll until it's ready,
and download the MP4 bytes. Only this module touches the network; a mock client
drives the tests.
"""

from __future__ import annotations

import time
from typing import Optional, Protocol

_API = "https://api.heygen.com"
_UPLOAD = "https://upload.heygen.com"


class HeyGenError(RuntimeError):
    pass


class HeyGenClient(Protocol):
    def upload_talking_photo(self, image: bytes, *, content_type: str = "image/jpeg") -> str: ...
    def generate(self, talking_photo_id: str, text: str, *, voice_id: str) -> str: ...
    def poll(self, video_id: str, *, timeout_s: float = 300.0) -> str: ...
    def download(self, url: str) -> bytes: ...


class HttpHeyGenClient:
    """Live HeyGen client. ``api_key`` is the account key (kept server-side)."""

    def __init__(self, api_key: str, *, timeout: float = 60.0) -> None:
        self._key = api_key
        self._timeout = timeout

    def _headers(self, json: bool = True) -> dict:  # pragma: no cover - trivial
        h = {"X-Api-Key": self._key, "Accept": "application/json"}
        if json:
            h["Content-Type"] = "application/json"
        return h

    def upload_talking_photo(self, image: bytes, *, content_type: str = "image/jpeg") -> str:  # pragma: no cover - network
        import httpx

        r = httpx.post(
            f"{_UPLOAD}/v1/talking_photo",
            headers={"X-Api-Key": self._key, "Content-Type": content_type},
            content=image, timeout=self._timeout,
        )
        if r.status_code != 200:
            raise HeyGenError(f"talking_photo upload {r.status_code}: {r.text[:200]}")
        data = (r.json() or {}).get("data") or {}
        tp = data.get("talking_photo_id") or data.get("id")
        if not tp:
            raise HeyGenError(f"no talking_photo_id in response: {r.text[:200]}")
        return tp

    def generate(self, talking_photo_id: str, text: str, *, voice_id: str) -> str:  # pragma: no cover - network
        import httpx

        body = {
            "video_inputs": [{
                "character": {"type": "talking_photo", "talking_photo_id": talking_photo_id},
                "voice": {"type": "text", "input_text": text, "voice_id": voice_id},
            }],
            "dimension": {"width": 720, "height": 720},
        }
        r = httpx.post(f"{_API}/v2/video/generate", headers=self._headers(), json=body, timeout=self._timeout)
        if r.status_code != 200:
            raise HeyGenError(f"video/generate {r.status_code}: {r.text[:200]}")
        vid = ((r.json() or {}).get("data") or {}).get("video_id")
        if not vid:
            raise HeyGenError(f"no video_id in response: {r.text[:200]}")
        return vid

    def poll(self, video_id: str, *, timeout_s: float = 300.0) -> str:  # pragma: no cover - network
        import httpx

        deadline = time.time() + timeout_s
        while time.time() < deadline:
            r = httpx.get(
                f"{_API}/v1/video_status.get", params={"video_id": video_id},
                headers=self._headers(json=False), timeout=self._timeout,
            )
            data = (r.json() or {}).get("data") or {}
            status = data.get("status")
            if status == "completed":
                url = data.get("video_url")
                if not url:
                    raise HeyGenError("completed but no video_url")
                return url
            if status in ("failed", "error"):
                raise HeyGenError(f"render failed: {data.get('error')}")
            time.sleep(5)
        raise HeyGenError("render timed out")

    def download(self, url: str) -> bytes:  # pragma: no cover - network
        import httpx

        r = httpx.get(url, timeout=self._timeout, follow_redirects=True)
        if r.status_code != 200:
            raise HeyGenError(f"download {r.status_code}")
        return r.content


class MockHeyGenClient:
    """Offline stand-in for tests — deterministic, no network."""

    def __init__(self, *args, **kwargs) -> None:
        self.uploaded = 0
        self.generated: list[str] = []

    def upload_talking_photo(self, image: bytes, *, content_type: str = "image/jpeg") -> str:
        self.uploaded += 1
        return f"tp_mock_{self.uploaded}"

    def generate(self, talking_photo_id: str, text: str, *, voice_id: str) -> str:
        self.generated.append(text)
        return f"vid_{len(self.generated)}"

    def poll(self, video_id: str, *, timeout_s: float = 300.0) -> str:
        return f"https://mock.heygen/{video_id}.mp4"

    def download(self, url: str) -> bytes:
        return b"MOCK_MP4_BYTES" + url.encode()


def build_heygen_client(settings=None) -> Optional[HeyGenClient]:
    """A live client when a key is configured, else None."""
    from jobsearch.config import get_settings

    s = settings or get_settings()
    key = getattr(s, "heygen_api_key", "")
    if not key:
        return None
    return HttpHeyGenClient(key, timeout=getattr(s, "avatar_timeout_seconds", 60.0))
