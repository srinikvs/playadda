#!/usr/bin/env python3
"""Download the Google Fonts stylesheets the portal and games already reference.

The website keeps those <link> tags. The APK build rewrites only the packaged
copy so the same families load from /vendor-fonts/ with the network off.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

UA = (
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
)
CSS_HREF = re.compile(
    r"""href=["'](https://fonts\.googleapis\.com/css2\?[^"']+)["']""",
    re.I,
)
FONT_URL = re.compile(
    r"""url\((?:["']?)(https://fonts\.gstatic\.com/[^)"']+)(?:["']?)\)"""
)
LICENSES = {
    "dmsans": "https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt",
    "fraunces": "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt",
    "figtree": "https://raw.githubusercontent.com/google/fonts/main/ofl/figtree/OFL.txt",
    "sora": "https://raw.githubusercontent.com/google/fonts/main/ofl/sora/OFL.txt",
    "pressstart2p": "https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/OFL.txt",
}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def html_files(repo: Path, android: Path) -> list[Path]:
    found = [repo / "index.html"]
    prebuilt = android / "prebuilt"
    if prebuilt.is_dir():
        found.extend(sorted(prebuilt.rglob("*.html")))
    return found


def main() -> int:
    android = Path(__file__).resolve().parents[1]
    repo = android.parent
    out = android / "vendor-fonts"
    files_root = out / "files"
    css_root = out / "css"
    lic_root = out / "licenses"
    for d in (files_root, css_root, lic_root):
        d.mkdir(parents=True, exist_ok=True)

    hrefs: list[str] = []
    for html in html_files(repo, android):
        text = html.read_text(encoding="utf-8")
        for href in CSS_HREF.findall(text):
            if href not in hrefs:
                hrefs.append(href)
    if not hrefs:
        print("no Google Fonts stylesheets found", file=sys.stderr)
        return 1

    mapping: dict[str, str] = {}
    for href in hrefs:
        css = fetch(href).decode("utf-8")
        for src in FONT_URL.findall(css):
            rel = src.split("fonts.gstatic.com/", 1)[1]
            dest = files_root / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists():
                dest.write_bytes(fetch(src))
            css = css.replace(src, "/vendor-fonts/files/" + rel)
        name = hashlib.sha256(href.encode()).hexdigest()[:12] + ".css"
        (css_root / name).write_text(css, encoding="utf-8")
        mapping[href] = "/vendor-fonts/css/" + name
        print(f"vendored {name} ({css.count('@font-face')} faces)")

    for family, url in LICENSES.items():
        dest = lic_root / f"{family}-OFL.txt"
        dest.write_bytes(fetch(url))

    (out / "map.json").write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out / 'map.json'} ({len(mapping)} stylesheets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
