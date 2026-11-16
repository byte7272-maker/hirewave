"""Browser-extension release channel.

A public, unauthenticated endpoint the web app (and the extension itself) read to
learn the latest published Web Store version and decide whether to show a "new
version" nudge. The Chrome/Edge Web Store delivers and auto-updates the bits — we
only *advertise* the current version + highlights and (optionally) tell the client
whether its ``installed`` version is behind or must be force-updated.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Query

from jobsearch.api.deps import StateDep
from jobsearch.api.schemas import ExtensionLatestOut

router = APIRouter(prefix="/api/v1/extension", tags=["extension"])

#: Plain-language highlights for the current release. Bump alongside the Web Store
#: publish (kept here because release notes are versioned with the code anyway).
WHATS_NEW: list[str] = [
    "Fills in pay, location and benefits when you open a job on its board.",
    "More reliable matching of job pages to your saved matches.",
    "Fewer duplicate and mislabeled jobs from alert emails.",
]

_NUM = re.compile(r"\d+")


def _parse(v: str) -> tuple[int, ...]:
    """A lenient dotted-version tuple ("1.6.5" → (1, 6, 5)); non-numeric parts → 0.
    Shorter versions sort below longer ones with the same prefix (1.6 < 1.6.1)."""
    out: list[int] = []
    for part in (v or "").strip().split("."):
        m = _NUM.search(part)
        out.append(int(m.group()) if m else 0)
    return tuple(out) or (0,)


def _lt(a: str, b: str) -> bool:
    """True when version ``a`` is strictly older than ``b`` (length-safe)."""
    ta, tb = _parse(a), _parse(b)
    n = max(len(ta), len(tb))
    return ta + (0,) * (n - len(ta)) < tb + (0,) * (n - len(tb))


@router.get("/latest", response_model=ExtensionLatestOut)
def latest_extension(
    state: StateDep,
    installed: str = Query("", description="the caller's installed extension version, e.g. 1.6.5"),
) -> ExtensionLatestOut:
    """The current extension release. Public (no auth) so a signed-out shell or the
    extension can read it. Pass ``?installed=<version>`` to also get whether an
    update is available and whether it's mandatory (installed below min_supported)."""
    s = state.settings
    latest = s.ext_latest_version
    floor = s.ext_min_supported
    inst = (installed or "").strip()
    update_available = _lt(inst, latest) if inst else None
    mandatory = _lt(inst, floor) if inst else None
    return ExtensionLatestOut(
        version=latest,
        min_supported=floor,
        store_url=s.ext_store_url,
        release_notes_url=s.ext_release_notes_url,
        whats_new=WHATS_NEW,
        installed=inst or None,
        update_available=update_available,
        mandatory=mandatory,
    )
