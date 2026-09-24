"""Standalone automation worker.

Run as its own service (`python -m jobsearch.worker`) with the automation image
(Playwright + Chromium). It runs the scheduler loop continuously — due auto-apply
grants, saved searches, reminders — and is the ONLY process that performs real
browser submissions. The web/API service stays lean and simulation-only.

Share the same JOBSEARCH_DATABASE_URL and JOBSEARCH_ENCRYPTION_KEY as the web
service. Gate real submission on this service with JOBSEARCH_ASSISTANT_BROWSER=
playwright and JOBSEARCH_AUTO_APPLY_LIVE_SUBMIT (see docs/AUTO_APPLY_GO_LIVE.md).
"""

from __future__ import annotations

from jobsearch.scheduler import run_worker

if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(run_worker())
