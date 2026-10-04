#!/usr/bin/env python3
"""Rebuild android/prebuilt from the pinned game repositories.

assembleDebug does not need this. The pinned builds are already in
android/prebuilt/. Run this only to refresh those snapshots, then run
vendor_fonts.py if a game's Google Fonts URL changed.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=cwd, check=True)


def main() -> int:
    android = Path(__file__).resolve().parents[1]
    lock = json.loads((android / "games.lock.json").read_text(encoding="utf-8"))
    prebuilt = android / "prebuilt"
    prebuilt.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="playadda-games-") as tmp:
        root = Path(tmp)
        for game in lock["games"]:
            dest = root / game["name"]
            run(["git", "clone", "--quiet", game["repo"], str(dest)], root)
            run(["git", "checkout", "--quiet", game["sha"]], dest)
            if (dest / "package-lock.json").is_file():
                run(["npm", "ci", "--no-audit", "--no-fund"], dest)
            else:
                run(["npm", "install", "--no-audit", "--no-fund"], dest)
            run(["npm", "run", "build"], dest)
            mount = prebuilt / game["mount"]
            if mount.exists():
                shutil.rmtree(mount)
            shutil.copytree(dest / "dist", mount, ignore=shutil.ignore_patterns(".DS_Store"))
            head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=dest, text=True).strip()
            if head != game["sha"]:
                raise SystemExit(f"{game['name']} checked out {head}, lock says {game['sha']}")
            print(f"updated {game['mount']} @ {head[:12]}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        print(f"command failed with exit {exc.returncode}", file=sys.stderr)
        raise SystemExit(exc.returncode)
