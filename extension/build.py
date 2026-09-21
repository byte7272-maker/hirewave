#!/usr/bin/env python3
"""Package the extension into a store-ready zip.

Produces ``extension/dist/hirewave-connect-<version>.zip`` containing only the
files the store needs (manifest, popup, icons) -- README/PRIVACY/STORE_LISTING and
this script are excluded. Run from anywhere:

    python extension/build.py
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
DIST = HERE / "dist"

# Exactly what ships in the package (everything else is dev/store paperwork).
INCLUDE_FILES = ["manifest.json", "popup.html", "popup.js", "content.js"]
INCLUDE_DIRS = ["icons"]


def main() -> None:
    manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
    version = manifest.get("version", "0.0.0")

    members: list[Path] = [HERE / f for f in INCLUDE_FILES]
    for d in INCLUDE_DIRS:
        members.extend(sorted((HERE / d).glob("**/*")))

    missing = [str(m.relative_to(HERE)) for m in members if not m.exists()]
    if missing:
        raise SystemExit("Missing files, cannot package: " + ", ".join(missing))

    DIST.mkdir(exist_ok=True)
    out = DIST / f"hirewave-connect-{version}.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for m in members:
            if m.is_file():
                zf.write(m, arcname=str(m.relative_to(HERE)).replace("\\", "/"))

    size_kb = out.stat().st_size / 1024
    print(f"Built {out.relative_to(HERE.parent)} ({size_kb:.1f} KB, version {version})")
    print("Upload this zip to the Chrome Web Store and Edge Add-ons dashboards.")


if __name__ == "__main__":
    main()
