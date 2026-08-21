"""Connect a provider session — run this on YOUR OWN machine.

    python -m jobsearch.connect linkedin --api https://api.hirewave.com --token <JWT>

It opens a real browser to the provider's login page. **You** log in (the
password is typed into the provider's own page — this tool never sees it). Once
you're in, it captures the browser's ``storage_state`` (cookies only) and either
uploads it to your account (encrypted at rest) or saves it to a file.

The uploaded session is what lets the assistant auto-apply on your behalf, under
the limits of the grants you create — without this app ever handling a password.

Requires the automation extra locally:  pip install .[automation]  &&  playwright install chromium
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request

# Where each provider's sign-in lives, and a hint that we've landed post-login.
PROVIDERS = {
    "linkedin": {"login": "https://www.linkedin.com/login", "signed_in": "/feed"},
    "indeed": {"login": "https://secure.indeed.com/account/login", "signed_in": "indeed.com"},
    "glassdoor": {"login": "https://www.glassdoor.com/profile/login_input.htm", "signed_in": "glassdoor.com/member"},
}


def capture(provider: str, *, timeout_s: int = 300) -> str:  # pragma: no cover - interactive browser
    """Open a headed browser, let the user log in, return the storage_state JSON."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit(
            "playwright is required locally: pip install .[automation] && playwright install chromium"
        ) from exc

    conf = PROVIDERS.get(provider)
    if conf is None:
        raise SystemExit(f"unknown provider '{provider}'. Known: {', '.join(PROVIDERS)}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.goto(conf["login"], wait_until="domcontentloaded")
        print(f"\nA browser opened at the {provider} login page.")
        print("Log in there (your password stays in the provider's page — this tool never sees it).")
        input("When you're fully logged in, come back here and press Enter to capture the session... ")
        state = ctx.storage_state()
        browser.close()
    return json.dumps(state)


def upload(api_base: str, token: str, provider: str, storage_state: str, label: str = "") -> dict:
    """POST the captured session to the account (over HTTPS)."""
    url = api_base.rstrip("/") + "/api/v1/auto-apply/sessions"
    payload = json.dumps({"provider": provider, "storage_state": storage_state, "label": label}).encode()
    req = urllib.request.Request(
        url, data=payload, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req) as resp:  # noqa: S310 - user-supplied API base
        return json.loads(resp.read().decode())


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="python -m jobsearch.connect", description="Connect a provider session (no password leaves your machine).")
    ap.add_argument("provider", choices=sorted(PROVIDERS), help="which provider to connect")
    ap.add_argument("--api", help="API base URL, e.g. https://api.hirewave.com (omit to just save a file)")
    ap.add_argument("--token", help="your API access token (JWT) — required with --api")
    ap.add_argument("--label", default="", help="a label to recognize this session (e.g. your account email)")
    ap.add_argument("--save", help="write the storage_state to this file instead of/as well as uploading")
    args = ap.parse_args(argv)

    storage_state = capture(args.provider)

    if args.save:
        with open(args.save, "w", encoding="utf-8") as fh:
            fh.write(storage_state)
        print(f"Saved session to {args.save}")

    if args.api:
        if not args.token:
            ap.error("--token is required with --api")
        out = upload(args.api, args.token, args.provider, storage_state, args.label)
        print(f"Connected {out.get('provider')} session (status: {out.get('status')}).")
    elif not args.save:
        print("Nothing to do: pass --api (+ --token) to upload, or --save to write a file.")
        return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv[1:]))
