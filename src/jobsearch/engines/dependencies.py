"""The app's external API dependencies, for the admin dashboard (§ admin).

Enumerates every third-party service the app relies on with what it's used for and whether
it's configured. Balances, costs and key-expiry dates are NOT exposed by these providers, so
the admin records what they know in ``JOBSEARCH_DEPENDENCY_META`` (a JSON object keyed by
dependency id); this merges that in and raises a **reminder** for anything expiring soon,
already expired, running low, or required-but-unconfigured. Pure + network-free (a dashboard
read must be instant and never call out), so it's fully unit-testable.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any, Optional

#: Expiry within this many days raises a reminder.
EXPIRY_WARN_DAYS = 14


def _parse_date(s: Any) -> Optional[date]:
    """Lenient ISO date parse ('2026-06-30' or a full datetime); None if unusable."""
    if not s:
        return None
    txt = str(s).strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(txt, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(txt.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def parse_meta(raw: str) -> dict:
    """Parse the admin-supplied JSON metadata; {} on anything malformed (never raises)."""
    if not (raw or "").strip():
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _oauth_ok(settings, provider: str) -> bool:
    """Whether a real OAuth connect for this provider is configured (live mode + creds)."""
    try:
        return bool(settings.oauth_available(provider))
    except Exception:  # noqa: BLE001
        return False


def _dep(key: str, name: str, purpose: str, *, configured: bool, required: bool,
         provider: str = "", model: str = "", manage_url: str = "") -> dict:
    return {
        "id": key, "name": name, "purpose": purpose, "required": required,
        "configured": bool(configured),
        "status": "configured" if configured else ("not_configured" if required else "optional_off"),
        "provider": provider, "model": model, "manage_url": manage_url,
        # Filled from admin metadata below.
        "expiry": "", "days_to_expiry": None, "balance": "", "monthly_cost": "", "notes": "",
    }


def _catalog(settings) -> list[dict]:
    """Every external dependency, with auto-detected configured/model. ``required`` marks the
    ones the core product needs (so an unconfigured one is flagged), vs. optional add-ons."""
    s = settings
    anthropic_on = bool(getattr(s, "anthropic_api_key", "")) or s.llm_provider == "anthropic" \
        or s.premium_llm_provider == "anthropic"
    openai_on = bool(getattr(s, "openai_api_key", "")) or s.llm_provider == "openai" \
        or s.embedding_provider == "openai"
    return [
        _dep("anthropic", "Anthropic (Claude)",
             "Assistant comprehension + premium generation (résumé/cover rewrites, strengthen).",
             configured=anthropic_on, required=True, provider="anthropic",
             model=getattr(s, "anthropic_model", ""),
             manage_url="https://console.anthropic.com/settings/billing"),
        _dep("openai", "OpenAI",
             "Embeddings for semantic matching, and the résumé-review model.",
             configured=openai_on, required=True, provider="openai",
             model=getattr(s, "openai_model", ""),
             manage_url="https://platform.openai.com/account/billing"),
        _dep("brave_search", "Brave Search",
             "Server-side web research (company checks, live figures).",
             configured=bool(getattr(s, "brave_search_key", "")), required=False, provider="brave",
             manage_url="https://api-dashboard.search.brave.com/app/subscriptions"),
        _dep("hibp", "Have I Been Pwned",
             "Credential-exposure checks for the user's accounts.",
             configured=bool(getattr(s, "hibp_api_key", "")), required=False,
             manage_url="https://haveibeenpwned.com/API/Key"),
        _dep("gmail", "Gmail OAuth",
             "Pulling the user's job-alert emails (read scope).",
             configured=_oauth_ok(s, "gmail"), required=False,
             manage_url="https://console.cloud.google.com/apis/credentials"),
        _dep("linkedin", "LinkedIn OAuth",
             "LinkedIn sign-in / profile import.",
             configured=_oauth_ok(s, "linkedin"), required=False,
             manage_url="https://www.linkedin.com/developers/apps"),
        _dep("tts", "Neural TTS",
             "Spoken assistant voice (ElevenLabs/OpenAI); browser voice is the free fallback.",
             configured=getattr(s, "tts_provider", "none") not in ("", "none"), required=False,
             provider=getattr(s, "tts_provider", ""),
             manage_url="https://elevenlabs.io/app/subscription"),
        _dep("stt", "Speech-to-text",
             "Server-side transcription (OpenAI); browser recognition is the fallback.",
             configured=getattr(s, "stt_provider", "none") not in ("", "none"), required=False,
             provider=getattr(s, "stt_provider", "")),
        _dep("heygen", "HeyGen avatar",
             "Pre-rendered video interviewer clips.",
             configured=bool(getattr(s, "heygen_api_key", "")), required=False,
             manage_url="https://app.heygen.com/settings"),
        _dep("database", "PostgreSQL (Railway)",
             "Primary datastore for users, documents, jobs and applications.",
             configured=bool(getattr(s, "database_url", "")), required=True,
             manage_url="https://railway.app/dashboard"),
    ]


def _apply_meta(dep: dict, meta: dict, today: date) -> None:
    """Merge admin metadata (expiry/balance/cost/notes) into a dependency and compute the
    days-to-expiry countdown."""
    m = meta.get(dep["id"]) or {}
    if not isinstance(m, dict):
        return
    dep["balance"] = str(m.get("balance", "") or "")
    dep["monthly_cost"] = str(m.get("monthly_cost", m.get("cost", "")) or "")
    dep["notes"] = str(m.get("notes", "") or "")
    exp = _parse_date(m.get("expiry"))
    if exp:
        dep["expiry"] = exp.isoformat()
        dep["days_to_expiry"] = (exp - today).days


def _reminders(deps: list[dict]) -> list[dict]:
    """The subset needing attention, most-urgent first: expired/soon, required-but-off, or a
    balance the admin flagged low (a balance containing 'low' or starting with a negative)."""
    out = []
    for d in deps:
        reasons = []
        dte = d.get("days_to_expiry")
        if dte is not None and dte < 0:
            reasons.append(f"expired {abs(dte)}d ago")
        elif dte is not None and dte <= EXPIRY_WARN_DAYS:
            reasons.append(f"expires in {dte}d")
        if d["required"] and not d["configured"]:
            reasons.append("required but not configured")
        bal = d.get("balance", "").lower()
        if "low" in bal or bal.startswith("-") or bal.startswith("$-"):
            reasons.append("balance low")
        if reasons:
            out.append({"id": d["id"], "name": d["name"], "reasons": reasons,
                        "days_to_expiry": dte})
    out.sort(key=lambda r: (999 if r["days_to_expiry"] is None else r["days_to_expiry"]))
    return out


def build_dependencies(settings, *, today: Optional[date] = None) -> dict:
    """The admin dependency dashboard payload: every external dependency with its config +
    admin-known expiry/balance/cost, plus the reminders that need attention. Network-free."""
    today = today or date.today()
    meta = parse_meta(getattr(settings, "dependency_meta_raw", "") or "")
    deps = _catalog(settings)
    for d in deps:
        _apply_meta(d, meta, today)
    reminders = _reminders(deps)
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "count": len(deps),
        "configured": sum(1 for d in deps if d["configured"]),
        "reminders": reminders,
        "needs_attention": len(reminders),
        "dependencies": deps,
    }
