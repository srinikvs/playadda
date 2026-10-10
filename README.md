# Playadda

Games portal for [playadda.duckdns.org](https://playadda.duckdns.org/).

**v1.3.1** — Koya stay spread across the pond. A moving pointer still gathers them; after it leaves, or rests for about 2 seconds, they fill the water again. Cursors and Diwali are unchanged.

## Layout

Apache document root for static files. TOTP verify is a small Node route on the same host (`server/auth.mjs`). Do not replace `/tessera/`, `/tango/`, `/classic-snake/`, `/chassu-rider/`, `/pacman/`, `/mini-sudoku/`, `/zip/`, or `/murmur/`.

```
index.html           portal chrome
js/flock.js          murmur modes (ambient)
js/portal.js         login gate, hamburger, game overlay
server/auth.mjs      TOTP verify, session cookie, scores, admin enroll
server/backup.mjs    write a backup; rewrite users.json if a secret is still plaintext
server/backup-verify.mjs
                     check a backup's shape and decrypt every secret (nightly job)
server/restore.mjs   dry-run restore; --apply writes
users.example.json   fake secrets only — do not use in production
```

## Auth, enrollment, and backups

Prod and playaddatest are separate processes. They do not share a port, users file, scores file, backup directory, session secret, or encryption key.

| | prod | playaddatest |
|---|---|---|
| Port | 4173 | 4174 |
| State directory | `/var/lib/playadda/prod/` | `/var/lib/playadda/test/` |
| `PLAYADDA_AUTH_USERS_JSON` | `/var/lib/playadda/prod/users.json` | `/var/lib/playadda/test/users.json` |
| `PLAYADDA_SCORES_JSON` | `/var/lib/playadda/prod/scores.json` | `/var/lib/playadda/test/scores.json` |
| `PLAYADDA_AUTH_BACKUP_DIR` | `/var/lib/playadda/prod/backups` | `/var/lib/playadda/test/backups` |
| `PLAYADDA_SITE` | `prod` | `test` |
| Admins | `PLAYADDA_AUTH_ADMINS` (for example `veera,srini`) | `srini` |

`PLAYADDA_AUTH_USERS_JSON` and `PLAYADDA_SCORES_JSON` are unchanged: set them to the files above. If they are unset, the process uses the directory for its site (`PORT=4174` or `PLAYADDA_SITE=test` selects playaddatest; otherwise prod). A test process refuses a path under `/var/lib/playadda/prod` or the prod files `/etc/playadda/users.json` and `/etc/playadda/scores.json`. A prod process refuses `/var/lib/playadda/test` and `users-test.json` / `scores-test.json`.

Prod and playaddatest run as separate service users, `playadda-auth` and `playadda-auth-test`, each with its own state directory. The Jenkins job `playadda-auth-host` creates those users, the directories, and the ownership. This repo does not choose the account or change ownership of `/var/lib/playadda`.

Whichever user the job assigns must be able to create and replace files in its own state directory. Saves write a temporary file in that same directory, fsync it, then rename it over the target. The same atomic save is used for `users.json` and `scores.json`. A lock file next to the target keeps two writers from replacing it at once. Files are written mode `600`. Never commit `users.json`, backups, or keys.

### Environment

| Variable | Role |
|---|---|
| `PLAYADDA_AUTH_SECRET` | HMAC key for the HttpOnly session cookie. Login returns 503 if it is unset. |
| `PLAYADDA_AUTH_USERS_JSON` | Users file. Names stay readable. Only each user's `secret` is encrypted. |
| `PLAYADDA_SCORES_JSON` | Scores file. Not encrypted. |
| `PLAYADDA_AUTH_ENC_KEY` | Base64 of 32 random bytes. AES-256-GCM key for each secret field. |
| `PLAYADDA_AUTH_BACKUP_DIR` | Directory for timestamped user backups. |
| `PLAYADDA_AUTH_ADMINS` | Comma-separated display names allowed to open `/admin/enroll`. Example: `veera,srini`. On playaddatest set `srini`. |
| `PLAYADDA_SITE` | `prod` or `test`. Overrides the port when both are set. Recorded in every backup. |
| `PORT` | `4173` prod, `4174` playaddatest. |
| `PLAYADDA_SESSION_TTL` | Session lifetime in seconds. Default 12 hours. |

Generate a key with `openssl rand -base64 32`. Prod and playaddatest need different `PLAYADDA_AUTH_SECRET` and `PLAYADDA_AUTH_ENC_KEY` values.

```bash
export PLAYADDA_SITE=prod
export PORT=4173
export PLAYADDA_AUTH_USERS_JSON=/var/lib/playadda/prod/users.json
export PLAYADDA_SCORES_JSON=/var/lib/playadda/prod/scores.json
export PLAYADDA_AUTH_BACKUP_DIR=/var/lib/playadda/prod/backups
export PLAYADDA_AUTH_SECRET="$(openssl rand -hex 32)"
export PLAYADDA_AUTH_ENC_KEY="$(openssl rand -base64 32)"
export PLAYADDA_AUTH_ADMINS=veera,srini
node server/auth.mjs
```

Playaddatest is the same list with `PLAYADDA_SITE=test`, `PORT=4174`, the `/var/lib/playadda/test` paths, its own secrets, and `PLAYADDA_AUTH_ADMINS=srini`.

If `PLAYADDA_AUTH_ENC_KEY` is missing, existing plaintext users can still sign in. Enrollment, backup, and restore refuse to run, and the process logs that the key is not set. It does not write a new plaintext secret. A key that is not base64 of 32 bytes stops the process at startup. On startup, when the key is set and a stored secret is still plaintext, the next save encrypts it (the startup migration is that save) and writes a backup. Login keeps working for those users either way. Encrypted secrets cannot be checked without the key; that user's login returns 503 `authenticator store is locked` and other users are unaffected.

Lookup is case-insensitive trim. Codes are RFC 6238, 6 digits, ±1 step. Secrets and codes are not written to logs.

### Enrollment

`/admin/enroll` and `/api/admin/*` require a signed-in session whose display name is in `PLAYADDA_AUTH_ADMINS`. Anyone else gets 401 or 403. The admin enters a display name. The server keeps a random base32 secret of 160 bits in memory for about 10 minutes and returns, once, a QR code for `otpauth://totp/Playadda:<name>?secret=...&issuer=Playadda`, an Add to authenticator link with that same URL, and the setup key. The user enters the first 6-digit code. Only a matching code appends `{name, secret, createdAt}` to `users.json`. A reload or a later list shows names only. Duplicate names are refused. The admin can remove a user. Removing and confirming both take a backup.

Apache can keep serving the static tree and proxy the API. Prod proxies to 4173 and the playaddatest vhost proxies to 4174. Do not point both vhosts at the same process.

```
ProxyPass /api/ http://127.0.0.1:4173/api/
ProxyPassReverse /api/ http://127.0.0.1:4173/api/
```

`/admin/enroll` has to be served by the auth process (it checks the session before sending the page). Proxy that path as well, or run `server/auth.mjs` as the host process. Jenkins deploys this. This repo does not SSH or rsync.

### Backup, verify, and restore

Every users change writes `users-<site>-<timestamp>-<id>.json` in `PLAYADDA_AUTH_BACKUP_DIR` and keeps the last 30. The backup is the same JSON shape as `users.json`: readable names, each `secret` encrypted with the current key. The file also records `site` (`prod` or `test`) and `createdAt`.

`node server/backup.mjs` writes one timestamped backup. If any secret in `users.json` is still plaintext, it rewrites that file so the secret is encrypted, then writes the backup. It is not a read-only copy. The nightly Jenkins job does not run it.

The nightly job only runs `node server/backup-verify.mjs` and copies backup files. `backup-verify` checks that each file is JSON, `site` is prod or test, every user has a name and a secret, and every secret decrypts with `PLAYADDA_AUTH_ENC_KEY`. It prints a user count, never the secret. Pass a file to check one backup; with no argument it checks the backup directory.

Restore defaults to a dry run. It refuses a backup whose `site` does not match this instance.

```bash
node server/restore.mjs
node server/restore.mjs /var/lib/playadda/test/backups/users-test-20261009T120000000Z-ab12.json
node server/restore.mjs --apply
node server/restore.mjs --apply /var/lib/playadda/prod/backups/users-prod-20261009T120000000Z-ab12.json
```

Dry run prints the backup path, site, user names, and `dry run: no files written`. `--apply` first saves a timestamped copy of the current `users.json` in the backup directory (`users-pre-restore-<site>-<timestamp>.json`), prints that path as `pre-restore=...`, then replaces `users.json` and writes a new backup of the restored state. Run the commands with the same environment as that instance. A site mismatch exits 2 and does not write.

## Scores

No shared leaderboard existed. Scores live in `PLAYADDA_SCORES_JSON` (default `/etc/playadda/scores.json`), not in git. The browser also caches the signed-in user's payload in `localStorage` under `playadda.scores.<name>`. Overall high score is the best value in that server file.

Games can report a score without a repo change:

```js
parent.postMessage({ type: "playadda:score", game: "tessera", score: 120 }, location.origin);
```

## QA

1. Open `/` signed out. Login card sits over Murmur. Game grid is hidden. Hamburger still opens Murmur controls. Version reads v1.3.1.
2. Wrong name or code: error, stay on login.
3. Name from the external JSON plus a current authenticator code: grid unlocks, account bar shows your best and overall high score.
4. `window.playadda.submitScore("portal", 10)` raises that user's best. A higher score from another account updates overall.
5. Signed out, or signed in as someone not listed in `PLAYADDA_AUTH_ADMINS`: `/admin/enroll` is 401 or 403.
6. As an admin (`srini` on playaddatest): enter a new name. The page shows a QR code, an Add to authenticator link, and a setup key. Enter the current 6-digit code. The user appears by name. Reload, or wait until an unconfirmed setup expires: the page source has no `otpauth://` link and no setup key. A second enroll of that name is refused. Remove deletes the name.

```bash
npm install
npm test
npx playwright install --with-deps chromium
npm run test:e2e
```

Local e2e copies `tests/fixtures/users.json` (fake `qa` secret only) to `test-results/` and runs it as a test instance via `tests/auth-server.mjs`, with `PLAYADDA_AUTH_ADMINS=srini`. With no `BASE_URL`, the enroll spec signs its own admin session for that local server. It does not treat the Jenkins session as an admin.

CI can pass `PLAYADDA_E2E_STORAGE_STATE` (path to a Playwright storageState JSON file) or, when that is unset, `PLAYADDA_E2E_SESSION_COOKIE` (`name=value`, or a raw Cookie header such as `playadda_session=<token>; other=value`) so e2e loads a host-minted session for the `BASE_URL` origin and does not type the login overlay. `PLAYADDA_E2E_STORAGE_STATE` wins when both are set. On playadda-ci that session is `qa`, which is not an admin: `/admin/enroll` is 403 and the response has no QR, `otpauth://` link, or setup key. A separate `PLAYADDA_E2E_ADMIN_STORAGE_STATE` (storageState JSON for an admin) opts into the enroll happy path against a remote `BASE_URL`. CI does not set it. Leave the session variables unset for local Pixel and manual runs, which still sign in through the overlay. The host job mints the session. Do not commit storage state, cookies, or authenticator secrets. The cookie format is commented on `loginIfNeeded` in `tests/e2e/helpers.ts`.
