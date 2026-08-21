"""Assisted apply — run this on YOUR OWN machine.

    python -m jobsearch.assist --api https://YOUR_API --token YOUR_TOKEN

It pulls your *apply queue* (jobs your grants matched on ToS-sensitive providers
like LinkedIn), opens each one in a real browser, and waits for **you** to click
the provider's Apply button. Once the form is open, it fills your factual details
(never a credential, never your password) and leaves the final Submit to you.

This is the human-in-the-loop model: a person initiates every application; the
automation only completes the form you opened. Requires the automation extra
locally:  pip install .[automation]  &&  playwright install chromium
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request


def fetch_queue(api_base: str, token: str) -> list[dict]:
    url = api_base.rstrip("/") + "/api/v1/auto-apply/queue"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as resp:  # noqa: S310 - user-supplied API base
        return json.loads(resp.read().decode())


def _fill_one(item: dict, *, session_file: str | None, submit: bool) -> str:  # pragma: no cover - interactive browser
    from jobsearch.engines.assistant import FillEntry, FillPlan
    from jobsearch.engines.assistant.live_fill import LiveFillEngine
    from jobsearch.engines.automation.browser import PlaywrightDriver

    driver = PlaywrightDriver(platform=item.get("provider") or "linkedin", storage_state=session_file, headless=False)
    # Rebuild a fill plan from the queue's field values (all non-credential).
    plan = FillPlan(entries=[FillEntry(field=k, label=k, value=v, source="profile", status="filled") for k, v in item.get("fields", {}).items()])

    driver.start()
    driver.open(item["url"])
    print(f"\n▶ {item['title']} · {item['company']}")
    print("  Opened in the browser. Click the provider's Apply button to open the form.")
    input("  When the application form is visible, press Enter to fill it… ")
    result = LiveFillEngine().execute(
        plan, driver, url=item["url"], submit=submit, live=True, assisted=True,
        resume_name=item.get("resume_name", ""),
    )
    driver.close()
    return result.status


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="python -m jobsearch.assist", description="Assisted apply — you click Apply, automation fills the rest.")
    ap.add_argument("--api", required=True, help="API base URL, e.g. https://api.hirewave.com")
    ap.add_argument("--token", required=True, help="your API access token (JWT)")
    ap.add_argument("--session", help="path to a saved storage_state file for the provider (optional)")
    ap.add_argument("--submit", action="store_true", help="let automation click the final Submit too (default: you submit)")
    args = ap.parse_args(argv)

    queue = fetch_queue(args.api, args.token)
    if not queue:
        print("Your apply queue is empty. Create an auto-apply rule (assisted / LinkedIn) and sync jobs first.")
        return 0

    print(f"{len(queue)} job(s) in your apply queue.")
    for item in queue:  # pragma: no cover - interactive
        try:
            status = _fill_one(item, session_file=args.session, submit=args.submit)
            print(f"  → {status}")
        except KeyboardInterrupt:
            print("\nStopped.")
            break
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {exc}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
