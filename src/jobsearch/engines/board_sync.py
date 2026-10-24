"""Keep the user's résumé / cover letter in sync across the job boards.

Most boards keep a *profile* résumé (and sometimes a default cover letter) that a
candidate reuses when applying. When the user updates their résumé here, those
board copies go stale. This module declares, per board, whether a profile document
can be synced and how, so the app can flag drift and either push the update
automatically (when the browser-automation runtime is available) or hand the user a
deep link + concrete steps to do it themselves.

It is deliberately capability-driven and honest: boards with no reusable profile
document (pure per-application ATS like Greenhouse/Workday) are marked unsupported
rather than pretending.
"""

from __future__ import annotations

from typing import Optional

#: Per-board profile-document sync capability.
#: ``resume`` / ``cover_letter``: whether that board keeps a reusable profile copy.
#: ``url``: where the user manages it. ``steps``: how to update it by hand.
#: ``auto``: whether an automated browser flow exists (gated on the automation
#: runtime being provisioned; falls back to the manual steps otherwise).
BOARD_PROFILE_SYNC: dict[str, dict] = {
    "linkedin": {
        "label": "LinkedIn",
        "resume": True,
        "cover_letter": False,
        "url": "https://www.linkedin.com/jobs/application-settings/",
        "steps": [
            "Open Job application settings on LinkedIn.",
            "Under 'Manage your resumes', upload the new résumé.",
            "Remove the outdated résumé so Easy Apply uses the new one.",
        ],
        "auto": True,
    },
    "indeed": {
        "label": "Indeed",
        "resume": True,
        "cover_letter": False,
        "url": "https://profile.indeed.com/",
        "steps": [
            "Open your Indeed profile.",
            "Replace the uploaded résumé file with the new version.",
        ],
        "auto": True,
    },
    "glassdoor": {
        "label": "Glassdoor",
        "resume": True,
        "cover_letter": False,
        "url": "https://www.glassdoor.com/member/profile/index.htm",
        "steps": ["Open your Glassdoor profile.", "Upload the new résumé under your documents."],
        "auto": False,
    },
    "ziprecruiter": {
        "label": "ZipRecruiter",
        "resume": True,
        "cover_letter": False,
        "url": "https://www.ziprecruiter.com/profile",
        "steps": ["Open your ZipRecruiter profile.", "Replace your résumé file."],
        "auto": False,
    },
    "dice": {
        "label": "Dice",
        "resume": True,
        "cover_letter": False,
        "url": "https://www.dice.com/dashboard/profile",
        "steps": ["Open your Dice profile.", "Upload the new résumé."],
        "auto": False,
    },
    "monster": {
        "label": "Monster",
        "resume": True,
        "cover_letter": False,
        "url": "https://www.monster.com/profile/",
        "steps": ["Open your Monster profile.", "Replace your résumé."],
        "auto": False,
    },
    # Pure per-application ATS — no reusable profile document to sync.
    "greenhouse": {"label": "Greenhouse", "resume": False, "cover_letter": False, "url": "", "steps": [], "auto": False},
    "workday": {"label": "Workday", "resume": False, "cover_letter": False, "url": "", "steps": [], "auto": False},
}


def board_supports(board: str, doc_type: str) -> bool:
    """True when *board* keeps a reusable profile copy of *doc_type* (resume|cover_letter)."""
    cap = BOARD_PROFILE_SYNC.get(board)
    return bool(cap and cap.get(doc_type))


def sync_status_for(
    board: str, doc_type: str, *, active_version: int, synced: Optional[dict]
) -> dict:
    """Build one board's sync row: whether it's supported, in sync or drifted, the
    version live there, and how to update it.

    ``synced`` is the document's recorded ``board_sync[board]`` entry (or None)."""
    cap = BOARD_PROFILE_SYNC.get(board, {})
    supported = bool(cap.get(doc_type))
    live_version = (synced or {}).get("version") if synced else None
    in_sync = supported and live_version == active_version and active_version > 0
    return {
        "board": board,
        "label": cap.get("label", board.title()),
        "doc_type": doc_type,
        "supported": supported,
        "auto": bool(cap.get("auto")) and supported,
        "active_version": active_version,
        "live_version": live_version,
        "in_sync": in_sync,
        "drifted": supported and not in_sync,
        "manage_url": cap.get("url", ""),
        "steps": list(cap.get("steps", [])) if supported else [],
        "reason": "" if supported else "no reusable profile document on this board",
    }
