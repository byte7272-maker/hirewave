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
from typing import Iterable, Optional

from .scripts import FIXED_LINES


def _select_lines(line_ids: Optional[Iterable[str]]):
    """The (line_id, text) pairs to build, filtered to ``line_ids`` when given
    (order preserved from FIXED_LINES). None/empty means every fixed line."""
    if not line_ids:
        return list(FIXED_LINES)
    wanted = set(line_ids)
    return [(lid, text) for lid, text in FIXED_LINES if lid in wanted]


def clip_key(persona_id: str, line_id: str) -> str:
    return f"ivclip:{persona_id}:{line_id}"


def _meta_key(persona_id: str, line_id: str) -> str:
    return f"ivclipmeta:{persona_id}:{line_id}"


def _tp_key(persona_id: str) -> str:
    return f"ivtp:{persona_id}"


# A single flag doc toggling placeholder mode (serve the bundled stand-in clip for
# any fixed line that hasn't got a real clip yet).
_PLACEHOLDER_FLAG = "ivclip:placeholder_mode"


def store_clip(documents, persona_id: str, line_id: str, data: bytes, *,
               origin: str = "rendered", content_type: str = "video/mp4") -> None:
    """Persist a real clip + its origin (``rendered`` via HeyGen, or ``uploaded``)."""
    documents.put(clip_key(persona_id, line_id), data, content_type=content_type)
    documents.put(_meta_key(persona_id, line_id), origin.encode("utf-8"), content_type="text/plain")


def clip_origin(documents, persona_id: str, line_id: str) -> str:
    """"" if no real clip; else its origin (legacy clips with no marker read as
    ``rendered``). Placeholders never occupy a clip key, so they aren't counted here."""
    if documents.get(clip_key(persona_id, line_id)) is None:
        return ""
    m = documents.get(_meta_key(persona_id, line_id))
    return (m[0].decode("utf-8", "ignore").strip() if m else "") or "rendered"


def set_placeholder_mode(documents, on: bool) -> None:
    documents.put(_PLACEHOLDER_FLAG, b"on" if on else b"off", content_type="text/plain")


def placeholder_enabled(documents) -> bool:
    v = documents.get(_PLACEHOLDER_FLAG)
    return bool(v and v[0].decode("utf-8", "ignore").strip() == "on")


def resolve_clip_url(documents, persona_id: str, line_id: str, *, clip_url_fn, placeholder_url: str):
    """The URL to play for a (persona, line): a real stored clip wins; else the
    placeholder when placeholder mode is on; else None (client uses photo + TTS)."""
    if documents.get(clip_key(persona_id, line_id)) is not None:
        return clip_url_fn(persona_id, line_id)
    if placeholder_enabled(documents):
        return placeholder_url
    return None


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


def status_for(personas, documents, line_ids: Optional[Iterable[str]] = None) -> dict:
    """How many of the (persona × line) clips already exist. Scoped to ``line_ids``
    when given, so a subset build reports progress over just those questions."""
    lines = _select_lines(line_ids)
    total = len(personas) * len(lines)
    have = rendered = uploaded = 0
    for p in personas:
        for line_id, _ in lines:
            origin = clip_origin(documents, p.id, line_id)
            if not origin:
                continue
            have += 1
            if origin == "uploaded":
                uploaded += 1
            else:
                rendered += 1
    return {
        "total": total,
        "built": have,
        "remaining": total - have,
        "rendered": rendered,
        "uploaded": uploaded,
        "placeholder_mode": placeholder_enabled(documents),
    }


def build_clips(
    client,
    personas,
    documents,
    static_dir: Path,
    *,
    voice_id: str,
    limit: int = 4,
    line_ids: Optional[Iterable[str]] = None,
) -> dict:
    """Generate up to ``limit`` missing clips this call (so a request can't hang on a
    long render queue). Re-run until ``remaining`` is 0. Returns a progress report.

    ``line_ids`` restricts which fixed questions to render (e.g. just the greeting +
    intro as a cheap starter set); None renders all of them.

    ``client`` is a HeyGen client (see :mod:`heygen`); ``documents`` is the durable
    store (``get(id)``/``put(id, bytes, content_type=)``).
    """
    lines = _select_lines(line_ids)
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
        for line_id, text in lines:
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
                store_clip(documents, persona.id, line_id, mp4, origin="rendered")
                built += 1
            except Exception as exc:  # noqa: BLE001 - report, keep going
                errors.append(f"{persona.id}/{line_id}: {exc}")
        if built >= limit:
            break

    report = status_for(personas, documents, line_ids)
    report["built_this_call"] = built
    report["errors"] = errors
    return report
