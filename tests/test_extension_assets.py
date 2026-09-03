"""Guard the browser extension against drift from the backend contract."""

from __future__ import annotations

import json
from pathlib import Path

_EXT = Path(__file__).resolve().parents[1] / "extension"


def test_manifest_is_valid_and_scoped():
    manifest = json.loads((_EXT / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["manifest_version"] == 3
    assert "cookies" in manifest["permissions"]  # required to read httpOnly cookies
    hosts = " ".join(manifest["host_permissions"])
    # must be allowed to reach the Hirewave API + each supported provider
    assert "hirewave-production" in hosts
    for site in ("linkedin", "indeed", "glassdoor", "greenhouse", "workday", "ziprecruiter", "dice"):
        assert site in hosts


def test_popup_uses_the_real_connect_endpoint_and_providers():
    js = (_EXT / "popup.js").read_text(encoding="utf-8")
    # the endpoint the CLI + backend agree on
    assert "/api/v1/auto-apply/sessions/connect" in js
    # sends the pairing-code payload (no login token)
    assert "storage_state" in js and "code" in js and "label" in js
    # covers the same providers the connected-apps section lists
    for site in ("linkedin", "indeed", "glassdoor", "greenhouse", "workday", "ziprecruiter", "dice"):
        assert site in js


def test_popup_html_loads_external_script_no_inline():
    html = (_EXT / "popup.html").read_text(encoding="utf-8")
    assert 'src="popup.js"' in html  # MV3 CSP forbids inline scripts
