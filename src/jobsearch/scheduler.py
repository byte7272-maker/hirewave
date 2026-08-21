"""Agent tick — run everything that's due, for all users. Cron this on the host:

    # every 15 min, inside the api container
    */15 * * * *  docker compose exec -T api python -m jobsearch.scheduler

It runs due **auto-apply grants** (auto grants submit within their limits;
assisted/LinkedIn grants just refresh their apply queue) and due **saved
searches** (ingest fresh postings). Idempotent and safe to run often — each item
has its own cadence and only fires when its interval has elapsed.
"""

from __future__ import annotations

import sys

from jobsearch.api.state import AppState


def run_once(state: AppState) -> dict:
    # Auto-apply grants across all users (the engine spans users when user_id=None).
    runs = state.auto_apply.run_due(None)
    submitted = sum(r.submitted for r in runs)
    queued = sum(1 for r in runs for o in r.outcomes if o.status == "queued")

    # Saved searches are per-user; iterate the user set.
    searches_run = 0
    for user in state.users.all():
        searches_run += len(state.saved_search.run_due(user.id))

    # Out-of-band review reminders for users past their checkpoint + daily digests.
    reminders_sent = len(state.reminders.run_due_reminders())
    digests_sent = len(state.reminders.run_due_digests())

    return {
        "grants_run": len(runs),
        "submitted": submitted,
        "queued": queued,
        "searches_run": searches_run,
        "reminders_sent": reminders_sent,
        "digests_sent": digests_sent,
    }


def main() -> int:
    summary = run_once(AppState())
    print(
        f"scheduler: {summary['grants_run']} grant(s) run — "
        f"{summary['submitted']} submitted, {summary['queued']} queued; "
        f"{summary['searches_run']} saved search(es) run; "
        f"{summary['reminders_sent']} reminder(s), {summary['digests_sent']} digest(s) sent."
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
