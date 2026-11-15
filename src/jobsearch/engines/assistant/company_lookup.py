"""Company research for the assistant: a spoken summary + ready-to-open lookup links.

When the user asks the assistant to "research this company" (or taps a company), we
want it to actually *do something useful* even without a search API key: narrate a
short summary and hand over links the user can open for further lookup — the company's
site, LinkedIn, Glassdoor reviews, recent news. When Google Programmable Search IS
configured (``web_search``), real result links/snippets are added and the narration
names the top source. Deterministic + offline for the link set; network only via the
injectable search provider. The page text is never read here — only public result URLs.
"""

from __future__ import annotations

from urllib.parse import quote_plus


def _slugify(company: str) -> str:
    return quote_plus((company or "").strip())


def lookup_links(company: str) -> list[dict]:
    """Deterministic "go look it up" links for a company — always available, no API
    needed. Each is ``{label, url}`` the UI can render as a button/anchor."""
    q = _slugify(company)
    if not q:
        return []
    return [
        {"label": "Website (search)", "url": f"https://www.google.com/search?q={q}"},
        {"label": "LinkedIn", "url": f"https://www.linkedin.com/search/results/companies/?keywords={q}"},
        {"label": "Glassdoor reviews", "url": f"https://www.glassdoor.com/Search/results.htm?keyword={q}"},
        {"label": "Indeed company", "url": f"https://www.indeed.com/companies?q={q}"},
        {"label": "Recent news", "url": f"https://news.google.com/search?q={q}"},
    ]


def narrate(company: str, results: list[dict]) -> str:
    """A short, speakable summary of what we found for the company. Names the top
    source when real search results are present; otherwise points at the lookup links."""
    name = (company or "this company").strip() or "this company"
    if results:
        top = results[0]
        title = (top.get("title") or "").strip()
        n = len(results)
        lead = f"Here's what I found on {name}."
        if title:
            lead += f" Top result: {title}."
        return (
            f"{lead} I pulled {n} {'source' if n == 1 else 'sources'}, plus quick links to its "
            f"LinkedIn, Glassdoor reviews, and recent news. Want me to open one, or summarize "
            f"what matters for your application?"
        )
    return (
        f"I can help you look into {name}. I've put together quick links — its website, "
        f"LinkedIn, Glassdoor reviews, and recent news — so you can dig in. Want me to focus "
        f"on anything specific, like culture, pay, or recent news?"
    )


def research_company(company: str, *, settings=None, limit: int = 6, fetch=None) -> dict:
    """Assemble the assistant's company-research payload: a spoken ``reply``, the
    deterministic ``links``, and (when a server search provider is configured) real
    ``results``. ``use_client`` is True when the backend didn't search and the client
    should run its own search and may add web results to the narration."""
    from jobsearch.engines.assistant import web_search

    name = (company or "").strip()
    links = lookup_links(name)
    results: list[dict] = []
    use_client = False
    if name and settings is not None:
        resp = web_search.search(f"{name} company careers reviews news",
                                 settings=settings, limit=limit, fetch=fetch)
        results = [r for r in resp.as_dict()["results"]]
        use_client = resp.use_client
    return {
        "company": name,
        "reply": narrate(name, results),
        "results": results,
        "links": links,
        "use_client": use_client,
    }
