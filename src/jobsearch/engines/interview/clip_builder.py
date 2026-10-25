"""Pre-render the fixed interviewer questions as talking-head clips, once.

Driven server-side (the HeyGen key stays in the backend). For each persona we
upload its photo once to get a ``talking_photo_id`` (cached), then for each fixed
line generate a video, poll, download the MP4, and store the bytes durably under a
deterministic id. At interview time ``/video`` looks up the stored clip by
(persona_id, line_id); dynamic/job-specific lines aren't pre-rendered and fall back
to photo + neural TTS.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from .scripts import FIXED_LINES


def clip_key(persona_id: str, line_id: str) -> str:
    return f"ivclip:{persona_id}:{line_id}"


def _tp_key(persona_id: str) -> str:
    return f"ivtp:{persona_id}"


def _slug_from_avatar(avatar_url: str) -> str:
    """The bundled-photo slug in a persona's avatar_url, or "" if it isn't one."""
    url = (avatar_url or "").split("?")[0]
    if "/static/personas/" not in url or not url.endswith(".webp"):
        return ""
    return url.rsplit("/", 1)[-1][: -len(".webp")]


def _photo_bytes(static_dir: Path, slug: str) -> Optional[bytes]:
    p = static_dir / "personas" / f"{slug}.webp"
    try:
        return p.read_bytes()
    except OSError:
        return None


def status_for(personas, documents) -> dict:
    """How many of the (persona × fixed-line) clips already exist."""
    total = len(personas) * len(FIXED_LINES)
    have = 0
    for p in personas:
        for line_id, _ in FIXED_LINES:
            if documents.get(clip_key(p.id, line_id)) is not None:
                have += 1
    return {"total": total, "built": have, "remaining": total - have}


def build_clips(
    client,
    personas,
    documents,
    static_dir: Path,
    *,
    voice_id: str,
    limit: int = 4,
) -> dict:
    """Generate up to ``limit`` missing clips this call (so a request can't hang on a
    long render queue). Re-run until ``remaining`` is 0. Returns a progress report.

    ``client`` is a HeyGen client (see :mod:`heygen`); ``documents`` is the durable
    store (``get(id)``/``put(id, bytes, content_type=)``).
    """
    built = 0
    errors: list[str] = []
    tp_cache: dict[str, str] = {}

    def talking_photo_id(persona) -> Optional[str]:
        if persona.id in tp_cache:
            return tp_cache[persona.id]
        stored = documents.get(_tp_key(persona.id))
        if stored is not None:
            tp = stored[0].decode("utf-8", "ignore").strip()
            if tp:
                tp_cache[persona.id] = tp
                return tp
        slug = _slug_from_avatar(getattr(persona, "avatar_url", ""))
        if not slug:
            return None
        img = _photo_bytes(static_dir, slug)
        if img is None:
            return None
        tp = client.upload_talking_photo(img, content_type="image/webp")
        documents.put(_tp_key(persona.id), tp.encode("utf-8"), content_type="text/plain")
        tp_cache[persona.id] = tp
        return tp

    for persona in personas:
        for line_id, text in FIXED_LINES:
            if built >= limit:
                break
            if documents.get(clip_key(persona.id, line_id)) is not None:
                continue
            try:
                tp = talking_photo_id(persona)
                if not tp:
                    errors.append(f"{persona.id}: no bundled photo to render")
                    # Skip all lines for a persona we can't render.
                    break
                video_id = client.generate(tp, text, voice_id=voice_id)
                url = client.poll(video_id)
                mp4 = client.download(url)
                documents.put(clip_key(persona.id, line_id), mp4, content_type="video/mp4")
                built += 1
            except Exception as exc:  # noqa: BLE001 - report, keep going
                errors.append(f"{persona.id}/{line_id}: {exc}")
        if built >= limit:
            break

    report = status_for(personas, documents)
    report["built_this_call"] = built
    report["errors"] = errors
    return report
