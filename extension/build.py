#!/usr/bin/env python3
"""Package the extension into store-ready zips (Chrome/Edge + Firefox).

The same WebExtension code ships to every store; only the manifest's background
style and a Firefox id differ, so we transform the manifest at build time rather than
maintaining two copies. Produces, in ``extension/dist/``:

    project-harbor-connect-<version>.zip          # Chrome Web Store + Edge Add-ons
    project-harbor-connect-firefox-<version>.zip  # Firefox AMO (desktop + ANDROID)

Safari (iOS/iPadOS/macOS) uses the SAME unpacked files, wrapped with Xcode's
``safari-web-extension-converter`` on a Mac — see MOBILE_CROSS_BROWSER.md. Run:

    python extension/build.py
"""

from __future__ import annotations

import copy
import json
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIST = HERE / "dist"

# Exactly what ships in the package (everything else is dev/store paperwork).
INCLUDE_FILES = ["manifest.json", "popup.html", "popup.js", "content.js", "background.js", "apply.js"]
INCLUDE_DIRS = ["icons"]

# Firefox add-on id (stable; used on AMO + for updates). Keep it constant.
FIREFOX_ID = "project-harbor-connect@hirewave.app"


def _firefox_manifest(manifest: dict) -> dict:
    """Transform the Chrome MV3 manifest for Firefox (desktop + Android).

    Firefox MV3 uses an event-page background (``scripts``) — broadly supported,
    including Firefox for Android — instead of Chrome's ``service_worker``, and needs a
    ``browser_specific_settings.gecko`` id. Everything else (content scripts, permissions,
    host permissions, action) is identical; the code uses the cross-browser ``chrome.*``
    namespace, which Firefox aliases."""
    m = copy.deepcopy(manifest)
    m["background"] = {"scripts": ["background.js"]}
    m["browser_specific_settings"] = {
        "gecko": {"id": FIREFOX_ID, "strict_min_version": "121.0"}
    }
    return m


def _members() -> list[Path]:
    members: list[Path] = [HERE / f for f in INCLUDE_FILES]
    for d in INCLUDE_DIRS:
        members.extend(sorted((HERE / d).glob("**/*")))
    missing = [str(m.relative_to(HERE)) for m in members if not m.exists()]
    if missing:
        raise SystemExit("Missing files, cannot package: " + ", ".join(missing))
    return members


def _write_zip(out: Path, members: list[Path], manifest_override: dict | None) -> None:
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for m in members:
            arc = str(m.relative_to(HERE)).replace("\\", "/")
            if arc == "manifest.json" and manifest_override is not None:
                zf.writestr("manifest.json", json.dumps(manifest_override, indent=2))
            elif m.is_file():
                zf.write(m, arcname=arc)
    size_kb = out.stat().st_size / 1024
    print(f"Built {out.relative_to(HERE.parent)} ({size_kb:.1f} KB)")


def main() -> None:
    manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
    version = manifest.get("version", "0.0.0")
    members = _members()
    DIST.mkdir(exist_ok=True)

    # Chrome / Edge — manifest as authored.
    _write_zip(DIST / f"project-harbor-connect-{version}.zip", members, None)
    # Firefox (AMO) — desktop + Android, from the transformed manifest.
    _write_zip(DIST / f"project-harbor-connect-firefox-{version}.zip", members, _firefox_manifest(manifest))

    print(f"\nVersion {version}.")
    print("  • Chrome Web Store / Edge Add-ons: upload the plain zip.")
    print("  • Firefox AMO (covers Android): upload the -firefox- zip.")
    print("  • Safari (iOS/macOS): wrap the unpacked files with Xcode — see MOBILE_CROSS_BROWSER.md.")


if __name__ == "__main__":
    main()
