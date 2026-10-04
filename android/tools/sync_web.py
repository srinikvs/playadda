#!/usr/bin/env python3
"""Assemble the offline site the APK serves.

Copies the portal from the repo root and the pinned game builds from
android/prebuilt/. Rewrites Google Fonts stylesheets to the vendored copies.
Does not modify the website sources.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

MOUNTS = (
    "tessera",
    "classic-snake",
    "mini-sudoku",
    "zip",
    "tango",
    "chassu-rider",
    "pacman",
)
STYLESHEET = re.compile(
    r"""<link\b[^>]*?href=["'](https://fonts\.googleapis\.com/css2\?[^"']+)["'][^>]*?>""",
    re.I | re.S,
)
PRECONNECT = re.compile(
    r"""[ \t]*<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*rel=["']preconnect["'][^>]*>\s*"""
    r"""|[ \t]*<link\b[^>]*rel=["']preconnect["'][^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*""",
    re.I,
)


def rewrite_html(text: str, mapping: dict[str, str], path: Path) -> str:
    def repl(match: re.Match[str]) -> str:
        href = match.group(1)
        local = mapping.get(href)
        if not local:
            raise SystemExit(
                f"{path}: no vendored font for {href}\n"
                "Run android/tools/vendor_fonts.py, then rebuild."
            )
        return f'<link rel="stylesheet" href="{local}">'

    text = STYLESHEET.sub(repl, text)
    text = PRECONNECT.sub("", text)
    if "fonts.googleapis.com" in text or "fonts.gstatic.com" in text:
        raise SystemExit(f"{path}: Google Fonts reference remains after rewrite")
    return text


def copy_tree(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(
        src,
        dest,
        ignore=shutil.ignore_patterns("_redirects", ".DS_Store"),
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--android", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    repo = args.repo.resolve()
    android = args.android.resolve()
    out = args.out.resolve()
    mapping = json.loads((android / "vendor-fonts" / "map.json").read_text(encoding="utf-8"))

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    for name in ("index.html", "favicon.svg"):
        src = repo / name
        if not src.is_file():
            raise SystemExit(f"missing portal file {src}")
        shutil.copy2(src, out / name)
    shutil.copytree(repo / "js", out / "js")

    prebuilt = android / "prebuilt"
    for mount in MOUNTS:
        src = prebuilt / mount
        if not (src / "index.html").is_file():
            raise SystemExit(f"missing game build {src}/index.html")
        copy_tree(src, out / mount)

    shutil.copytree(
        android / "vendor-fonts",
        out / "vendor-fonts",
        ignore=shutil.ignore_patterns("map.json", ".DS_Store"),
    )

    html_files = [out / "index.html", *out.glob("*/index.html")]
    for html in html_files:
        if html.parent.name == "vendor-fonts":
            continue
        html.write_text(rewrite_html(html.read_text(encoding="utf-8"), mapping, html), encoding="utf-8")

    # Packaged pages must not depend on the live hosts.
    banned = ("playadda.duckdns.org", "playaddatest", "fonts.googleapis.com", "fonts.gstatic.com")
    for html in html_files:
        text = html.read_text(encoding="utf-8")
        for host in banned:
            if host in text and host != "playadda.duckdns.org":
                raise SystemExit(f"{html} still references {host}")
        # The footer names the site. It is text, not a request. Styles and scripts must not call it.
        for tag in ("href=", "src="):
            for line in text.splitlines():
                if "playadda.duckdns.org" in line and tag in line:
                    raise SystemExit(f"{html} links to playadda.duckdns.org: {line.strip()}")
                if "playaddatest" in line:
                    raise SystemExit(f"{html} references playaddatest: {line.strip()}")

    print(f"synced offline site to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
