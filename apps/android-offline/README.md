# Playadda Android (offline-first WebView shell)

Source of the v1.2.5 app, updated to **v1.2.6** (leaderboard fix).

- Serves the bundled web build from `app/src/main/assets/` via `WebViewAssetLoader`
  (`https://appassets.androidplatform.net`). The assets directory is generated at
  build time and is git-ignored.
- Network is allowed only for `playadda.duckdns.org` and `playaddatest.duckdns.org`;
  every other host still gets the fake 403 "offline" response.
- API base: `-PapiEnv=test` builds against playaddatest; default is prod.
  The value is exposed to the page as `window.PLAYADDA_API_BASE`.

```
cd apps/android-offline
gradle :app:assembleDebug -PapiEnv=test
```

## What is not here

The v1.2.5 source bundle also had a `src/` folder. It only held the game sources
(playadda, pac-man, tango, chassu-rider, ...), each a separate git checkout that is
already published in its own repository, so it is not copied. Never commit
`local.properties`, build outputs, APKs, keystores or secrets (see `.gitignore`).
