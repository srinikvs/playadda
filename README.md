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
