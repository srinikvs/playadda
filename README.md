# Playadda

Games portal for [playadda.duckdns.org](https://playadda.duckdns.org/).

**v1.2.5** — Murmur runs live as the homepage ambient background. Controls live in the hamburger menu. Game cards: Tessera, Classic Snake, Mini Sudoku, Zip, Tango, Chassu Rider, Pac-Man. Murmur is not a stack card.

## Layout

Apache document root. Drop these files at `/` — do not replace `/tessera/`, `/tango/`, `/classic-snake/`, `/chassu-rider/`, `/pacman/`, `/mini-sudoku/`, `/zip/`, or `/murmur/`.

```
index.html      portal chrome
js/flock.js     murmur modes (ambient)
js/portal.js    hamburger + fullscreen game overlay
favicon.svg
```

Test-only (do not copy to the document root): `package.json`, `playwright.config.ts`, `tests/`.

No build step. Open `index.html` or serve the directory.

`package.json`, Playwright, and `tests/` are Jenkins/local smoke tooling only. Do not deploy them (or `node_modules/`) to the Apache document root. See [TESTING.md](TESTING.md).

## Murmur

Same engine as [srinikvs/Murmur](https://github.com/srinikvs/Murmur). Settings persist in `localStorage` under `murmur.params`.

| Input | Action |
| --- | --- |
| Hamburger | Open Murmur rules. Portal cards stay as they are. |
| Mode | One at a time: Cursors, Koya fish (max 20), Diwali rockets (max 20) |
| Sliders | Separation, alignment, cohesion, avoid, speed, flock size |
| Scatter / Pause / Reset | Burst, freeze, respawn |
| Space / R / S | Pause, reset, scatter |
| Pointer | Cursors avoid. Koya cozy while it moves, disperse after 2s still. Rockets burst on contact. |

Physics cases for `murmur-ci` live in the Murmur repo. This portal keeps B11 as an optional menu exclusivity smoke.

## Android APK

`android/` is an offline debug app. It is not part of the Apache drop — do not rsync it to the document root.

The APK embeds this portal (`index.html`, `js/`, `favicon.svg`) and pinned production builds of Tessera, Classic Snake, Mini Sudoku, Zip, Tango, Chassu Rider, and Pac-Man (`android/prebuilt/`, commits in `android/games.lock.json`). A WebView serves them from the APK at `https://appassets.androidplatform.net/`, so `/tessera/` and the other game paths resolve inside the app. Scores stay in that WebView's `localStorage` (the same keys the games already use). The manifest has no `INTERNET` permission. Requests to `playadda.duckdns.org`, `playaddatest`, shared leaderboards, and Chat Ops are not made; anything else off-device is cancelled in the WebView client. Google Fonts are vendored under `android/vendor-fonts/` and rewritten only in the packaged HTML.

Requires JDK 17+ and Android SDK 35 (build-tools 35.0.0).

```bash
export ANDROID_HOME="$HOME/Android/Sdk"   # or the SDK root you installed
cd android
./gradlew assembleDebug
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r` that file. `./gradlew assembleDebug` copies the portal and rewrites font links; it does not clone the game repos.

To refresh the pinned games (needs network and Node), run `python3 android/tools/refresh_games.py`, then `python3 android/tools/vendor_fonts.py` if a stylesheet URL changed.

Optional check of the packaged pages, with Chromium blocked from every non-local host:

```bash
npm install
npx playwright install chromium
node android/tools/offline_smoke.mjs
```

## Version

`1.2.5` — stamped in the footer and the Murmur drawer.
