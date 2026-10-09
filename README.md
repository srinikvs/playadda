# Playadda

Games portal for [playadda.duckdns.org](https://playadda.duckdns.org/).

**v1.3.0** — Authenticator login over the Murmur background. After login, scores are per display name and an overall high score is shown. Game cards and the Murmur hamburger are unchanged.

## Layout

Apache document root for static files. TOTP verify is a small Node route on the same host (`server/auth.mjs`). Do not replace `/tessera/`, `/tango/`, `/classic-snake/`, `/chassu-rider/`, `/pacman/`, `/mini-sudoku/`, `/zip/`, or `/murmur/`.

```
index.html           portal chrome
js/flock.js          murmur modes (ambient)
js/portal.js         login gate, hamburger, game overlay
server/auth.mjs      TOTP verify, session cookie, scores
users.example.json   fake secrets only — do not use in production
```

## Auth secrets (do not commit)

Copy `users.example.json` to a path outside the repo, replace the fake secret, and `chmod 600` it. On Builder that path is `/etc/playadda/users.json`. Never commit the real file.

```bash
sudo mkdir -p /etc/playadda
sudo cp users.example.json /etc/playadda/users.json
sudo chmod 600 /etc/playadda/users.json
# edit /etc/playadda/users.json with real base32 TOTP secrets
export PLAYADDA_AUTH_USERS_JSON=/etc/playadda/users.json
export PLAYADDA_AUTH_SECRET="$(openssl rand -hex 32)"
export PLAYADDA_SCORES_JSON=/etc/playadda/scores.json
node server/auth.mjs
```

`PLAYADDA_AUTH_SECRET` signs the HttpOnly session cookie. Without it, login returns 503. Lookup is case-insensitive trim. Codes are RFC 6238, 6 digits, ±1 step.

Apache can keep serving the static tree and proxy only the API:

```
ProxyPass /api/ http://127.0.0.1:4173/api/
ProxyPassReverse /api/ http://127.0.0.1:4173/api/
```

Or run `server/auth.mjs` as the host process; it also serves the static files. This PR does not deploy or change Jenkins.

## Scores

No shared leaderboard existed. Scores live in `PLAYADDA_SCORES_JSON` (default `/etc/playadda/scores.json`), not in git. The browser also caches the signed-in user's payload in `localStorage` under `playadda.scores.<name>`. Overall high score is the best value in that server file.

Games can report a score without a repo change:

```js
parent.postMessage({ type: "playadda:score", game: "tessera", score: 120 }, location.origin);
```

## QA

1. Open `/` signed out. Login card sits over Murmur. Game grid is hidden. Hamburger still opens Murmur controls. Version reads v1.3.0.
2. Wrong name or code: error, stay on login.
3. Name from the external JSON plus a current authenticator code: grid unlocks, account bar shows your best and overall high score.
4. `window.playadda.submitScore("portal", 10)` raises that user's best. A higher score from another account updates overall.

```bash
npm install
npm test
npx playwright install --with-deps chromium
npm run test:e2e
```

Local e2e uses `tests/fixtures/users.json` (fake `qa` secret only) via `tests/auth-server.mjs`.

CI can pass `PLAYADDA_E2E_STORAGE_STATE` (path to a Playwright storageState JSON file) or, when that is unset, `PLAYADDA_E2E_SESSION_COOKIE` (`name=value`, or a raw Cookie header such as `playadda_session=<token>; other=value`) so e2e loads a host-minted session for the `BASE_URL` origin and does not type the login overlay. `PLAYADDA_E2E_STORAGE_STATE` wins when both are set. Leave both unset for local Pixel and manual runs, which still sign in through the overlay. The host job mints the session. Do not commit storage state, cookies, or authenticator secrets. The cookie format is commented on `loginIfNeeded` in `tests/e2e/helpers.ts`.

## Android APK

`android/` is an offline debug app. It is not part of the Apache drop — do not rsync it to the document root, and do not package `server/`, TOTP secrets, or `users.json` into it.

The APK embeds this portal (`index.html`, `js/`, `favicon.svg`) and pinned production builds of Tessera, Classic Snake, Mini Sudoku, Zip, Tango, Chassu Rider, and Pac-Man (`android/prebuilt/`, commits in `android/games.lock.json`). A WebView serves them from the APK at `https://appassets.androidplatform.net/`, so `/tessera/` and the other game paths resolve inside the app. The website `js/portal.js` login gate is unchanged. Packaging rewrites only the APK copy: the game grid opens immediately, the login overlay stays hidden, and `/api/auth` plus `/api/scores` are not called. There is no authenticator step and no live server. Game scores stay in that WebView's `localStorage` (the same keys the games already use). The manifest has no `INTERNET` permission. Requests to `playadda.duckdns.org`, `playaddatest`, shared leaderboards, and Chat Ops are not made; anything else off-device is cancelled in the WebView client. Google Fonts are vendored under `android/vendor-fonts/` and rewritten only in the packaged HTML.

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
