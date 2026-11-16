"""The public extension-release endpoint the app reads to nudge updates. The Web
Store delivers the bits; this only advertises the channel and (given an installed
version) says whether an update is available or mandatory."""

from __future__ import annotations

from fastapi.testclient import TestClient

from jobsearch.api.app import create_app
from jobsearch.api.state import AppState
from jobsearch.config import Settings
from jobsearch.engines.integration import MockTokenExchanger
from jobsearch.api.routers.extension import _lt


def _client(**over):
    st = AppState(settings=Settings(**over), exchanger=MockTokenExchanger())
    return TestClient(create_app(state=st))


def test_latest_is_public_and_reports_channel():
    # No Authorization header — the shell/extension must be able to read it.
    out = _client().get("/api/v1/extension/latest").json()
    assert out["version"] and out["min_supported"]
    assert isinstance(out["whats_new"], list) and out["whats_new"]
    # Without ?installed, the comparison fields are absent (null).
    assert out["installed"] is None
    assert out["update_available"] is None and out["mandatory"] is None


def test_installed_behind_latest_flags_update_not_mandatory():
    c = _client(ext_latest_version="1.7.0", ext_min_supported="1.6.0")
    out = c.get("/api/v1/extension/latest", params={"installed": "1.6.5"}).json()
    assert out["installed"] == "1.6.5"
    assert out["update_available"] is True
    assert out["mandatory"] is False  # 1.6.5 >= min_supported 1.6.0


def test_installed_below_min_supported_is_mandatory():
    c = _client(ext_latest_version="1.7.0", ext_min_supported="1.6.0")
    out = c.get("/api/v1/extension/latest", params={"installed": "1.5.9"}).json()
    assert out["update_available"] is True and out["mandatory"] is True


def test_installed_current_has_no_update():
    c = _client(ext_latest_version="1.7.0", ext_min_supported="1.6.0")
    out = c.get("/api/v1/extension/latest", params={"installed": "1.7.0"}).json()
    assert out["update_available"] is False and out["mandatory"] is False


def test_store_url_passthrough_from_settings():
    c = _client(ext_store_url="https://chromewebstore.google.com/detail/abc")
    out = c.get("/api/v1/extension/latest").json()
    assert out["store_url"] == "https://chromewebstore.google.com/detail/abc"


def test_version_compare_is_length_safe():
    assert _lt("1.6", "1.6.1") is True       # shorter prefix sorts below
    assert _lt("1.6.0", "1.6") is False      # trailing .0 == no segment
    assert _lt("1.10.0", "1.9.0") is False   # numeric, not lexical
    assert _lt("1.9.0", "1.10.0") is True
