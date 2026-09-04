"""Dashboard summary — real aggregated counts for the home screen.

Replaces any hardcoded placeholder stats: every number here is computed from the
user's actual data (matches, applications, interviews, connected sites, …), so
the dashboard reflects reality even for a brand-new account (all zeros).
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter

from jobsearch.api.deps import CurrentUser, StateDep
from jobsearch.api.routers.jobs import _visible
from jobsearch.models import UserProfile
from jobsearch.models.common import utcnow

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

_STRONG_MATCH = 60.0  # score at/above which a match counts as "strong"
_WEEKLY_TARGET = 5  # default weekly application goal (drives the progress bar)


@router.get("/summary")
def summary(user: CurrentUser, state: StateDep) -> dict:
    uid = user.id
    profile = state.profiles.get(uid) or UserProfile(user_id=uid)

    # --- matches (ranked over the user's visible, verified jobs) -------------
    visible = [j for j in state.jobs.all() if _visible(state, j)]
    ranked = state.matching.rank(profile, visible, limit=100) if visible else []
    strong = [r for r in ranked if r.score >= _STRONG_MATCH]
    top = ranked[0] if ranked else None

    # --- applications by status ---------------------------------------------
    apps = state.applications.find(user_id=uid)
    by_status: dict[str, int] = {}
    for a in apps:
        s = a.status.value if hasattr(a.status, "value") else str(a.status)
        by_status[s] = by_status.get(s, 0) + 1

    # --- this-week activity → the weekly goal --------------------------------
    week_ago = utcnow() - timedelta(days=7)
    mock_sessions = state.mock_interviews.find(user_id=uid)
    apps_this_week = sum(
        1 for a in apps
        if getattr(a, "submitted_at", None) is not None and a.submitted_at >= week_ago
    )
    interviews_this_week = sum(1 for m in mock_sessions if m.created_at >= week_ago)

    # --- connected job sites (OAuth or an active browser session) -----------
    authed = {c["provider"] for c in state.integration.list_connections(uid) if not c["expired"]}
    authed |= {s.provider for s in state.sessions.list_for(uid) if s.status == "active"}

    # --- recent activity (latest notifications) -----------------------------
    notes = sorted(state.notifications.find(user_id=uid), key=lambda n: n.created_at, reverse=True)[:6]
    activity = [
        {
            "type": n.type.value if hasattr(n.type, "value") else str(n.type),
            "message": n.message,
            "at": n.created_at.isoformat(),
            "read": n.is_read,
        }
        for n in notes
    ]

    resume_count = len(state.resumes.find(user_id=uid))
    return {
        "matches": {
            "total": len(ranked),
            "strong": len(strong),
            "top": (
                {"job_id": top.job.id, "title": top.job.title, "company": top.job.company,
                 "score": top.score}
                if top else None
            ),
        },
        "applications": {
            "total": len(apps),
            "submitted": by_status.get("submitted", 0),
            "interviewing": by_status.get("interviewing", 0),
            "offered": by_status.get("offered", 0),
            "by_status": by_status,
        },
        "interviews": len(mock_sessions),
        "weekly_goal": {
            "target": _WEEKLY_TARGET,
            "done": apps_this_week,  # applications submitted in the last 7 days
            "applications_this_week": apps_this_week,
            "interviews_this_week": interviews_this_week,
        },
        "resumes": resume_count,
        "cover_letters": len(state.cover_letters.find(user_id=uid)),
        "highlights": len(state.experience.list_for(uid)),
        "saved_jobs": len(state.saved_jobs.find(user_id=uid)),
        "saved_searches": len(state.saved_searches_repo.find(user_id=uid)),
        "connected_apps": {"count": len(authed), "providers": sorted(authed)},
        "unread_notifications": sum(1 for n in state.notifications.find(user_id=uid) if not n.is_read),
        "profile_complete": bool(profile.headline or profile.skills or resume_count),
        "recent_activity": activity,
    }
