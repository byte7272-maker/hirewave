# Plan: Secure Personal-Exposure Monitoring & Alerting

**Status:** Design proposal (not built). Requires legal + security sign-off before implementation.

Goal: let a user monitor whether **their own** personal information (email,
phone, username, etc.) has been exposed in data breaches or on dark-web
marketplaces, and alert them with actionable remediation — the way
HaveIBeenPwned / commercial identity-protection services work. This is a
**defensive, consent-based** feature.

---

## 1. The single most important design decision

> **We do NOT crawl the dark web, Tor marketplaces, or breach-dump forums ourselves, and we do not buy or store stolen data.**

Directly crawling illicit marketplaces or purchasing breach dumps is legally
hazardous (potential CFAA / computer-misuse, wiretap, and stolen-property
exposure), operationally heavy, exposes staff/infra to illegal content, and
risks re-victimizing third parties whose data sits in the same dumps.

**Instead, integrate licensed breach-intelligence providers** that already
collect this data lawfully and expose it through APIs designed for privacy-
preserving lookups:

- **Have I Been Pwned (HIBP)** — breach + paste search by email; and **Pwned
  Passwords** via a **k-anonymity** range API (you send only the first 5 chars of
  a SHA-1 hash, never the password or full hash).
- **Commercial dark-web monitoring / threat-intel APIs** (e.g. SpyCloud,
  Enzoic, Constella, or a chosen vendor) that surface exposures for identifiers
  you submit, under a contract that governs lawful use.

The platform's job is **orchestration, consent, secure matching, and alerting** —
never being the crawler or the data broker. This mirrors how the rest of the
platform treats risky I/O: a thin, swappable **adapter** boundary (like
`TokenExchanger`, `GmailClient`, `BrowserDriver`).

---

## 2. Guiding principles

- **Consent + ownership proof.** A user may only monitor identifiers they prove
  they control. Verify each one (email confirmation code, phone OTP) before it is
  ever queried. This is the guardrail against surveilling other people.
- **Data minimization.** Store the *least* data that makes the feature work.
  Prefer hashes / derived tokens and k-anonymity lookups. Never store recovered
  plaintext passwords or another person's PII.
- **Privacy by design.** Encrypt monitored identifiers at rest (reuse the
  existing AES-256-GCM `FieldCipher`); isolate the service; restrict egress to the
  approved provider hosts only.
- **Actionable, non-alarming alerts.** Every alert says exactly what leaked and
  what to do next (rotate this password, enable MFA, freeze credit).
- **Right to delete.** One click removes an identifier from monitoring and purges
  its findings (GDPR/CCPA erasure).
- **Legality first.** Use providers within their ToS; get legal review per
  jurisdiction; never handle stolen secrets in the clear.

---

## 3. What we will / won't do

| ✅ Will | ❌ Won't |
|---|---|
| Query licensed breach-intel APIs for the user's own, verified identifiers | Crawl Tor / dark-web marketplaces or scrape breach forums ourselves |
| Use k-anonymity (hash-prefix) lookups where available | Buy, download, or store breach dumps / stolen credentials |
| Store encrypted identifiers + minimal finding metadata | Store recovered plaintext passwords or third parties' PII |
| Verify ownership before monitoring | Monitor an identifier the user hasn't proven they control |
| Alert the user with remediation steps | Auto-act on the user's other accounts, or notify third parties |

---

## 4. Architecture

```
                       consent + ownership verification
   User ──enroll email/phone──►  Monitor Service ──► verify (OTP/email code)
                                      │
                                      │ periodic + on-demand checks
                                      ▼
                          ExposureProvider (port)
                   ┌────────────┼─────────────────────┐
             HIBPProvider   PwnedPasswords        VendorProvider
             (breach/paste) (k-anonymity)         (dark-web intel)
                   └────────────┼─────────────────────┘
                                ▼
                    normalize → ExposureFinding
                                ▼
                 dedupe vs. seen → NotificationEngine ──► user alert
                                ▼
                    encrypted store (findings metadata only)
```

Everything behind `ExposureProvider` is a swappable adapter — the same
ports-and-adapters pattern used across this codebase, so providers can be added,
mocked for tests, or replaced without touching the service or API.

### Scheduling
- **On enrollment** (after verification) — an immediate baseline check.
- **Periodic** — a scheduled job (e.g. daily) re-checks each verified identifier.
- **Webhook/push** where a provider supports it (react to new exposures without polling).

---

## 5. Data model (minimal)

| Entity | Key fields | Notes |
|---|---|---|
| `MonitoredIdentifier` | `id`, `user_id`, `type` (email/phone/username), `value` **(encrypted)**, `value_hash` (for matching/dedupe), `verified` (bool), `verified_at`, `created_at` | Only `verified` identifiers are ever queried. |
| `VerificationChallenge` | `id`, `identifier_id`, `code_hash`, `expires_at`, `attempts` | OTP/email-code ownership proof. |
| `ExposureFinding` | `id`, `identifier_id`, `source` (provider + breach name), `exposed_data_types` (e.g. "email, password_hash" — *categories, not values*), `breach_date`, `discovered_at`, `severity`, `acknowledged` | **No secret values stored** — only *what category* leaked and *where*. |
| `ConsentRecord` | `id`, `user_id`, `scope`, `granted_at`, `revoked_at` | Auditable consent lifecycle. |

Note: `exposed_data_types` stores **categories** ("password", "SSN") — never the
leaked values themselves.

---

## 6. Provider integration (adapter port)

```
ExposureProvider (Protocol)
  check_email(email) -> list[ExposureFinding]
  check_password_kanon(sha1_prefix5) -> list[suffix, count]   # never sends the password
  check_identifier(type, value) -> list[ExposureFinding]      # vendor dark-web API
```

- **HIBP breach/paste**: hash-or-plain email lookup per their API + your API key;
  respect rate limits and ToS.
- **Pwned Passwords (k-anonymity)**: compute SHA-1 of the candidate password
  **client-side or in-memory only**, send the **first 5 hex chars**, match the
  returned suffixes locally. The password and full hash never leave the process.
  (Used only when the user explicitly checks a password they type — not stored.)
- **Vendor dark-web API**: submit verified identifiers; ingest normalized
  exposure records. Governed by the vendor contract.
- **MockExposureProvider**: deterministic fake for tests/offline (same pattern as
  `MockTokenExchanger` / `FakeGmail`).

---

## 7. Security controls

- **Encryption at rest**: monitored identifier values encrypted with the existing
  `FieldCipher` (AES-256-GCM), AAD-bound to `user_id`. Findings store no secrets.
- **Secrets management**: provider API keys in the secret store / env, never in
  code or the DB; rotate regularly.
- **Network isolation**: the monitor service runs isolated with **egress allow-listed**
  to provider hosts only — it cannot reach arbitrary internet hosts.
- **k-anonymity / hashing**: never transmit a full password or full identifier
  hash when a range/prefix query is available.
- **Access control & audit**: every check and every finding-access is authz-checked
  (owner only) and written to an audit log; admins cannot read raw identifiers.
- **Rate limiting & abuse prevention**: cap enrollments per user; verification
  required — prevents using the feature to test whether *someone else's* email is breached.
- **No plaintext secret handling**: if a provider ever returns a recovered
  credential, we discard it immediately and store only the *fact + category* of exposure.

---

## 8. Consent & ownership verification (the ethical core)

1. User adds an identifier → status `unverified`, **not queried**.
2. Service sends a one-time code (email link/code, or phone OTP).
3. User enters the code → identifier becomes `verified`; consent recorded.
4. Only now is the identifier included in checks.

This makes it structurally impossible to monitor a stranger's data: you can only
watch what you can prove you control. Enrollment caps + audit logging deter abuse.

---

## 9. Alerting & remediation

- New, deduped findings raise a **`SECURITY_EXPOSURE`** notification (extend the
  existing `NotificationType`) and an email.
- Each alert is **specific and actionable**: what leaked (category), which
  breach/source, when, severity, and next steps — e.g. *"Your email appeared in
  the <X> breach (passwords exposed). Change that password, enable MFA, and check
  for reuse on other sites."*
- A dashboard "Security" panel lists active exposures with acknowledge / resolve,
  and a "remediation checklist" (rotate password, enable MFA, freeze credit,
  review account activity).
- **Tone**: informative, not fear-mongering. No dark-patterns, no upsell pressure.

---

## 10. Retention, deletion, compliance

- **Retention**: keep finding *metadata* only as long as useful; auto-expire
  acknowledged/old findings.
- **Deletion**: removing an identifier purges its findings and challenges
  immediately (GDPR/CCPA erasure); revoking consent stops all checks.
- **Compliance**: GDPR/CCPA data-subject rights; a DPIA (Data Protection Impact
  Assessment) given the sensitivity; provider Data Processing Agreements; clear
  privacy-policy disclosure of which third-party providers are used.
- **Legal review is a gate, not a formality** — provider ToS, jurisdictional
  rules on breach data, and cross-border transfer all need counsel sign-off.

---

## 11. Safety & ethical guardrails (hard rules)

- Monitor **only the enrolling user's own, verified** identifiers.
- **Never** crawl illicit sources, purchase dumps, or store stolen secrets.
- **Never** expose or store third-party PII that co-occurs in a breach.
- **Never** use the feature to check arbitrary/third-party identifiers.
- Admin/staff cannot read raw monitored values; all access is audited.

---

## 12. How it reuses this platform's building blocks

The feature drops cleanly onto existing patterns:

| Need | Reuse |
|---|---|
| Swappable risky-I/O boundary | Adapter port + Mock impl (like `TokenExchanger`, `GmailClient`) |
| Encryption at rest | `jobsearch.security.crypto.FieldCipher` (AES-256-GCM, AAD) |
| Persistence | `Repository` port + SQL repo (JSON `data` + indexed columns) |
| Alerts | `NotificationEngine` + email channel (new `SECURITY_EXPOSURE` type) |
| Scheduling | The periodic-job seam (same place DVR/refresh-style jobs would live) |
| Consent gating | The same "explicit approval before action" discipline as the submission gate |

New pieces to build (all behind ports): `MonitoringEngine`, `ExposureProvider`
adapters (HIBP, PwnedPasswords, one vendor, Mock), `MonitoredIdentifier` /
`ExposureFinding` models + repos, verification flow, and the Security dashboard.

---

## 13. Phased rollout

1. **Phase 0 — legal/security sign-off**: choose provider(s), sign DPAs, DPIA,
   confirm ToS-compliant usage. *Gate before any code.*
2. **Phase 1 — email breach monitoring**: enroll + verify email → HIBP breach/paste
   → encrypted findings → alerts. Mock provider first, then live behind a flag.
3. **Phase 2 — password exposure check**: on-demand k-anonymity Pwned Passwords
   check (nothing stored). ✅ **Built** — client-side SHA-1, the browser sends only
   a 5-hex-char prefix to `GET /api/v1/monitoring/password-range/{prefix}` (proxies
   HIBP), matches locally; endpoint accepts only a prefix, responds `no-store`.
4. **Phase 3 — dark-web intel vendor**: add the commercial provider for broader
   identifiers (phone, username), still consent- and verification-gated.
5. **Phase 4 — remediation UX**: guided checklists, MFA nudges, credit-freeze links.

---

## 14. Open decisions (need sign-off)

- Which commercial dark-web provider (cost, coverage, ToS, data residency)?
- Retention window for finding metadata?
- Is password-exposure checking in scope (adds sensitive handling even with k-anonymity)?
- Jurisdictions to support at launch (affects compliance surface)?
- In-house periodic scheduler vs. the platform's existing job mechanism?
