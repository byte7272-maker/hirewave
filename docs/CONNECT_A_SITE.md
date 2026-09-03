# Connect a job site to Hirewave (your password never leaves your machine)

Hirewave's auto-apply assistant needs a **session** for a job site (LinkedIn,
Indeed, …) to act on your behalf. You establish that session yourself — Hirewave
never sees your password. The local helper captures only the session cookies and
hands them to Hirewave using a short-lived pairing code from the app.

## One-time setup

```bash
pip install "jobsearch[automation]"      # or: pip install playwright
python -m playwright install chromium
```

## Connect a site

1. In Hirewave → **Authenticated Apps**, click **Connect** next to the site.
   The dialog shows a **pairing code** (valid ~10 minutes).
2. Run the helper with that code:

   ```bash
   python -m jobsearch.connect --provider linkedin --code <PAIRING_CODE>
   ```

3. A browser window opens at the site's **real** login page. Log in normally —
   your password goes to the provider, not to Hirewave or the helper.
4. Back in the terminal, press **Enter** once you're logged in. The helper
   captures the session and sends it to Hirewave.
5. Hirewave flips the site to **Connected** and the assistant now has access.

## Options

| Flag | Meaning |
|------|---------|
| `--provider` | `linkedin` \| `indeed` \| `glassdoor` \| `greenhouse` \| `workday` \| `ziprecruiter` \| `dice` |
| `--code` | the pairing code (omit to be prompted) |
| `--label` | a name to recognize the account later, e.g. your email |
| `--api-base` | Hirewave API URL (default: the production URL, or `HIREWAVE_API_BASE`) |
| `--headless` | advanced — run without a visible window (not recommended for login) |

## What's sent, and what isn't

- **Sent:** the browser session cookies (`storage_state`), over HTTPS, stored
  **encrypted at rest**. This is what lets the assistant stay signed in.
- **Never sent:** your password. You type it into the provider's own site.
- The pairing code is single-use and expires quickly; the helper needs it (not
  your Hirewave login) to attach the session to your account.
- Disconnect anytime from **Authenticated Apps** (removes the stored session).
