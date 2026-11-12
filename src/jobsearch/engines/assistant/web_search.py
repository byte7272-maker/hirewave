"""Assistant web-research search provider.

The assistant researches employers on the open web (P185). The *search* step — turning a
query into a list of result URLs — can run through **Google Programmable Search (Custom
Search JSON API)** when configured, with the API key kept **server-side**. When Google
isn't configured, the client (the extension) falls back to its own DuckDuckGo search on
the user's connection, so research still works with no key.

This module does only the search → result URLs. Fetching the public pages stays in the
extension (on the user's connection, with the user's approval) and summarizing stays in
:mod:`web_research`. The HTTP call is injectable so tests run fully offline.
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Callable, Optional

_CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1"
_MAX_RESULTS = 10
_TIMEOUT = 12.0

#: A fetch callable: url -> (status, body_text). Injected in tests; defaults to urllib.
Fetcher = Callable[[str, float], "tuple[int, str]"]


def _default_fetch(url: str, timeout: float) -> "tuple[int, str]":  # pragma: no cover - network
    req = urllib.request.Request(url, headers={"User-Agent": "ProjectHarborResearch/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.getcode(), resp.read().decode("utf-8", "replace")
    except Exception:  # noqa: BLE001 - never raise to the caller; treat as empty
        return 0, ""


@dataclass
class SearchResult:
    title: str = ""
    url: str = ""
    snippet: str = ""

    def as_dict(self) -> dict:
        return {"title": self.title, "url": self.url, "snippet": self.snippet}


@dataclass
class SearchResponse:
    #: "google" when results came from Google CSE, else "duckduckgo".
    provider: str = "duckduckgo"
    results: list[SearchResult] = field(default_factory=list)
    #: True => the backend did not search; the client should run its own (DuckDuckGo)
    #: search on the user's connection.
    use_client: bool = False
    error: str = ""

    def as_dict(self) -> dict:
        return {
            "provider": self.provider,
            "results": [r.as_dict() for r in self.results],
            "use_client": self.use_client,
            "error": self.error,
        }


def _clamp(limit: Optional[int]) -> int:
    try:
        return max(1, min(int(limit or 6), _MAX_RESULTS))
    except (TypeError, ValueError):
        return 6


def google_cse_search(
    query: str, *, key: str, cx: str, limit: int = 6, fetch: Optional[Fetcher] = None
) -> SearchResponse:
    """Query the Google Custom Search JSON API and return result URLs. Never raises —
    a transport/parse failure returns an empty google response with an error note."""
    q = (query or "").strip()
    if not q:
        return SearchResponse(provider="google", results=[])
    params = urllib.parse.urlencode({"key": key, "cx": cx, "q": q, "num": _clamp(limit)})
    status, body = (fetch or _default_fetch)(f"{_CSE_ENDPOINT}?{params}", _TIMEOUT)
    if status != 200 or not body:
        return SearchResponse(provider="google", results=[], error=f"search failed ({status or 'no response'})")
    try:
        data = json.loads(body)
    except Exception:  # noqa: BLE001
        return SearchResponse(provider="google", results=[], error="bad response")
    out: list[SearchResult] = []
    for item in (data.get("items") or [])[:_clamp(limit)]:
        link = str(item.get("link") or "").strip()
        if link.startswith("http"):
            out.append(SearchResult(
                title=str(item.get("title") or "").strip(),
                url=link,
                snippet=str(item.get("snippet") or "").strip(),
            ))
    return SearchResponse(provider="google", results=out)


def search(query: str, *, settings, limit: int = 6, fetch: Optional[Fetcher] = None) -> SearchResponse:
    """Search with the configured provider. Google CSE when its credentials are set;
    otherwise signal the client to run its own DuckDuckGo search (``use_client``)."""
    if settings is not None and settings.research_search_provider() == "google":
        return google_cse_search(
            query, key=settings.google_cse_key, cx=settings.google_cse_cx, limit=limit, fetch=fetch
        )
    return SearchResponse(provider="duckduckgo", results=[], use_client=True)
