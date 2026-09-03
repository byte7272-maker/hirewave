"""Local session-capture helper — ``python -m jobsearch.connect``.

Connects a job site (LinkedIn, Indeed, …) to Hirewave so the assistant can act on
your behalf, **without your password ever leaving your machine**:

1. The Hirewave app's *Connect* dialog gives you a short-lived pairing **code**.
2. This helper opens the provider's *real* login page in a browser on your own
   computer. You log in normally — your password goes to the provider, never to
   Hirewave or this script.
3. It then captures **only the session cookies** (Playwright ``storage_state``)
   and hands them to Hirewave against the pairing code. No login token needed.

Usage::

    python -m jobsearch.connect --provider linkedin --code <PAIRING_CODE>

Requires Playwright (a one-time setup)::

    pip install playwright
    python -m playwright install chromium
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.request

# Where the Hirewave API lives (override with --api-base or HIREWAVE_API_BASE).
_DEFAULT_API = os.environ.get(
    "HIREWAVE_API_BASE", "https://hirewave-production-3db3.up.railway.app"
)

# Real provider login pages — you authenticate here, on their own site.
_LOGIN_URLS = {
    "linkedin": "https://www.linkedin.com/login",
    "indeed": "https://secure.indeed.com/account/login",
    "glassdoor": "https://www.glassdoor.com/profile/login_input.htm",
    "ziprecruiter": "https://www.ziprecruiter.com/authn/login",
    "dice": "https://www.dice.com/dashboard/login",
    "greenhouse": "https://app.greenhouse.io/users/sign_in",
    "workday": "https://www.workday.com/en-us/signin.html",
}


def submit(api_base: str, code: str, provider: str, storage_state: str, label: str) -> dict:
    """Hand the captured session to Hirewave against the pairing code."""
    url = api_base.rstrip("/") + "/api/v1/auto-apply/sessions/connect"
    payload = json.dumps(
        {"code": code, "storage_state": storage_state, "label": label}
    ).encode()
    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:  # pragma: no cover - network
        detail = exc.read().decode(errors="replace")
        raise SystemExit(f"Hirewave rejected the connection ({exc.code}): {detail}")
    except urllib.error.URLError as exc:  # pragma: no cover - network
        raise SystemExit(f"Couldn't reach Hirewave at {api_base}: {exc.reason}")


def capture(provider: str, *, headless: bool = False) -> str:
    """Open the provider's real login; after you sign in, return the session JSON."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:  # pragma: no cover - optional dependency
        raise SystemExit(
            "Playwright is required for the capture step. Install it once:\n"
            "    pip install playwright\n"
            "    python -m playwright install chromium"
        )

    login_url = _LOGIN_URLS.get(provider.lower()) or f"https://www.{provider.lower()}.com"
    with sync_playwright() as p:  # pragma: no cover - drives a real browser
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context()
        page = context.new_page()
        page.goto(login_url, wait_until="domcontentloaded")
        print(f"\n  A browser window opened at the {provider} login page.")
        print(f"  -> Log in normally. Your password is entered on {provider}'s own")
        print("     site — Hirewave and this script never see it.")
        print("  -> When you are fully logged in, return here and press Enter.\n")
        try:
            input("  Press Enter once you're logged in (Ctrl+C to cancel)... ")
        except (KeyboardInterrupt, EOFError):
            browser.close()
            raise SystemExit("\nCancelled — nothing was sent.")
        state = context.storage_state()
        browser.close()
    return json.dumps(state)


def main(argv: "list[str] | None" = None) -> None:
    ap = argparse.ArgumentParser(
        prog="python -m jobsearch.connect",
        description="Connect a job site to Hirewave (your password stays on your machine).",
    )
    ap.add_argument("--provider", required=True, help="linkedin | indeed | glassdoor | ...")
    ap.add_argument("--code", help="the pairing code from the Hirewave Connect dialog")
    ap.add_argument("--api-base", default=_DEFAULT_API, help="Hirewave API base URL")
    ap.add_argument("--label", default="", help="a label to recognize this account (e.g. your email)")
    ap.add_argument(
        "--headless", action="store_true",
        help="(advanced) run without a visible window — not recommended for login",
    )
    args = ap.parse_args(argv)

    code = (args.code or "").strip()
    if not code:
        try:
            code = input("Paste the pairing code from Hirewave's Connect dialog: ").strip()
        except (KeyboardInterrupt, EOFError):
            raise SystemExit("\nCancelled.")
    if not code:
        raise SystemExit("A pairing code is required — start 'Connect' in Hirewave to get one.")

    print(f"\nConnecting {args.provider} to Hirewave...")
    storage_state = capture(args.provider, headless=args.headless)
    result = submit(args.api_base, code, args.provider, storage_state, args.label)

    if result.get("status") == "connected":
        print(f"\n  ✓ {args.provider} connected. Return to Hirewave — it will show as connected.")
    else:
        print(f"\n  Unexpected response from Hirewave: {result}")


if __name__ == "__main__":  # python -m jobsearch.connect
    main()
