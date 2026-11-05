# Leaderboard fix (Android 1.2.6 + server)

## Root cause
- `server/auth.mjs` had no `GET /api/leaderboard` (404). `/api/scores` and `/api/auth/session` correctly return 401 without login.
- No CORS headers were sent on any response, so the app's WebView origin could not call the API.
- The v1.2.5 Android app (never committed) answered every non-`appassets` host in `MainActivity.shouldInterceptRequest` with a fake 403 "offline" response, and its manifest had no INTERNET permission.

## Changes
Server
- `GET /api/leaderboard?game=&limit=`: read-only, no login, names and scores only (`{game, limit, entries:[{rank,name,score}]}`), limit default 10, max 50, empty list when no scores. Logic in `server/leaderboard.mjs`.
- CORS for `/api/*` in `server/cors.mjs`: allowed origins `https://appassets.androidplatform.net` and `capacitor://localhost` (iOS WebView) are reflected with `Access-Control-Allow-Credentials: true` and `Vary: Origin`; OPTIONS preflight answered with 204; no wildcard; other origins get no ACAO.
- `http://localhost` is intentionally not allowed: with credentials, any local dev server could read signed-in responses.
- Login behaviour and the session cookie are unchanged (still `SameSite=Lax`). The public leaderboard needs no cookie. If the app must POST scores cross-origin, the cookie would need `SameSite=None; Secure`; that is a login change and is left for Veera to decide.
- `users.json`, `scores.json`, `.env` and `data/` are untouched.

App (`apps/android-offline/`, see its README)
- Source committed with a `.gitignore`; INTERNET permission added; `playadda.duckdns.org` and `playaddatest.duckdns.org` go to the network, other hosts stay blocked, cookies kept; versionName 1.2.6 (versionCode 2).
- API base via `-PapiEnv=test|prod` (default prod), exposed as `window.PLAYADDA_API_BASE`.
- `js/leaderboard.js`: UI states (offline only on a real network failure, sign-in on 401, "No scores yet" on empty). It is not yet wired into a page: this repo has no leaderboard UI, so the Android asset build must import it.
- The `src/` folder of the v1.2.5 bundle is game sources already published elsewhere and is not copied.

## Tests
`server/leaderboard.test.mjs` (shape, no private fields, empty, limit default/cap, read-only, CORS, preflight, disallowed origin) and `tests/leaderboard-ui.test.mjs`, both in `npm test`, using temp dirs and synthetic data. The Android project was not compiled here.

## Rollout
1. Jenkins build on playaddatest with `DEPLOY=false`.
2. Test deploy; verify `/api/leaderboard` and CORS on playaddatest, and the app built with `-PapiEnv=test`.
3. Mac iOS build and TestFlight (separate repo).
4. Prod only after Veera merges and greenlights.
