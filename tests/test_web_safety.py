"""The open-web research safety guard: HTTPS-only, no IP hosts, no insecure
connections, no adult/torrent/piracy, no file downloads."""

from __future__ import annotations

from jobsearch.engines.assistant import web_safety as ws


def test_allows_a_normal_https_research_page():
    ok, reason = ws.is_safe_research_url("https://www.reuters.com/business/publicis-2025")
    assert ok and reason == ""
    assert ws.is_safe_research_url("https://investor.publicisgroupe.com/results")[0]


def test_rejects_insecure_and_nonweb_schemes():
    for url in ("http://example.com", "ftp://example.com/x", "file:///etc/passwd",
                "data:text/html,<b>x", "magnet:?xt=urn:btih:abc"):
        ok, reason = ws.is_safe_research_url(url)
        assert not ok, url
        assert reason


def test_rejects_ip_hosts_public_and_private():
    for url in ("https://127.0.0.1/x", "https://10.0.0.5/x", "https://169.254.169.254/latest",
                "https://93.184.216.34/", "https://[::1]/", "https://[2606:2800:220:1]/"):
        assert not ws.is_safe_research_url(url)[0], url


def test_rejects_credentials_and_odd_ports():
    assert not ws.is_safe_research_url("https://user:pass@example.com/")[0]
    assert not ws.is_safe_research_url("https://example.com:8080/")[0]
    assert ws.is_safe_research_url("https://example.com:443/ok")[0]


def test_rejects_adult_and_torrent_hosts_but_not_lookalikes():
    for url in ("https://www.pornhub.com/x", "https://sex.example.com/", "https://thepiratebay.org/s",
                "https://1337x.to/torrent/1", "https://rarbg.to/"):
        assert not ws.is_safe_research_url(url)[0], url
    # a label that merely contains a blocked substring is fine (no false positive)
    assert ws.is_safe_research_url("https://www.essex.ac.uk/")[0]
    assert ws.is_safe_research_url("https://scunthorpe.gov.uk/")[0]


def test_rejects_file_downloads():
    for url in ("https://example.com/report.pdf", "https://example.com/setup.exe",
                "https://example.com/album.zip", "https://example.com/linux.iso",
                "https://example.com/movie.torrent", "https://example.com/data.xlsx"):
        assert not ws.is_safe_research_url(url)[0], url
    # a normal page path with a dot elsewhere is fine
    assert ws.is_safe_research_url("https://example.com/2024.results/page")[0]


def test_blocked_queries():
    for q in ("free movie torrent download", "pornhub videos", "nsfw pics",
              "download cracked software keygen", "the pirate bay"):
        assert ws.is_blocked_query(q)[0], q
    for q in ("Publicis Groupe 2025 organic growth", "Reuters annual results",
              "US IT services market size 2025"):
        assert not ws.is_blocked_query(q)[0], q


def test_filter_sources_and_safe_queries():
    srcs = [
        {"url": "https://good.com/a", "text": "x"},
        {"url": "http://insecure.com/a", "text": "y"},
        {"url": "https://127.0.0.1/a", "text": "z"},
        {"url": "https://pornhub.com/a", "text": "w"},
    ]
    kept, rejected = ws.filter_sources(srcs)
    assert [s["url"] for s in kept] == ["https://good.com/a"]
    assert len(rejected) == 3 and all(r.get("_rejected") for r in rejected)
    assert ws.safe_queries(["Publicis growth 2025", "best torrent sites"]) == ["Publicis growth 2025"]
