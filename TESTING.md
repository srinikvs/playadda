# Testing Playadda

JSON case files under `tests/cases/` are the **source of truth**. Unit (`npm test`) and Playwright (`npm run test:e2e`) load those files and drive assertions from `steps` / `expect`. Do not add a new Scrutiny scenario only as hard-coded TypeScript.

CSV export of results is optional later. JSON stays canonical. There is no spreadsheet ingest.

This repo is static HTML/JS (Apache document root). `package.json` / Playwright live at the repo root for Jenkins Node and local smoke. They are **not** part of the shipped portal. Do not rsync `node_modules/`, `tests/`, Playwright reports, or `package*.json` onto the game host.

## Case files

Path: `tests/cases/*.json` (one case = one object / file).

| Field | Required | Values |
|---|---|---|
| `id` | yes | Stable id (`A6`, `B7`, `C14`, …) |
| `layer` | yes | `unit` \| `e2e` \| `pixel` |
| `title` | yes | Human-readable name |
| `steps` | yes | Interpreter ops (`openFresh`, `click`, `openMenu`, …) |
| `expect` | yes | Interpreter asserts (`visible`, `ctaFilled`, `path`, `cardsUsable`, …) |
| `gate` | yes | `block` (fails **TEST PASS**) \| `optional` |
| `viewport` | no | `desktop` for the 1280×800 smoke; otherwise Pixel project |

**Add a feature:** add or edit a JSON file, then re-run `npm test` and/or `npm run test:e2e`. Extend `tests/cases/unit-runner.ts` or `tests/e2e/case-runner.ts` only when you need a new op/assert.

Gate mapping: E2E **B7–B10** and Pixel **C14** use `gate: "block"`. Do not skip, soften, or `fixme` those cases.

## Local

```bash
npm install
npx playwright install --with-deps chromium

npm test                 # loads tests/cases/*.json (layer=unit) + catalog checks
npm run test:e2e         # Playwright Chromium; loads e2e/pixel JSON (+ desktop smoke)
npm run test:e2e:pixel   # Pixel project only (412×915)
```

`npm test` uses `tsx --test` (Jenkins Node-safe). Do **not** use `node --experimental-strip-types`.

`npm run test:e2e` starts a local static server of this checkout at `http://127.0.0.1:4173/` unless `BASE_URL` is set. Failure screenshots land in `test-results/`.

`playadda-ci` owns C14 on Chromium at 412×915: `gate: "block"`, measurable heading / hamburger / card asserts. A missing or emptied C14 JSON fails `npm test` catalog checks.

## Live smoke (`BASE_URL`)

Honor `BASE_URL` for a remote host. Playwright does **not** start a local webServer when it is set. Documented mounts (never hard-code only one host):

| Environment | URL |
|---|---|
| Local static server (default) | `http://127.0.0.1:4173/` |
| playaddatest | `https://playaddatest.duckdns.org/` |
| prod | `https://playadda.duckdns.org/` |

```bash
BASE_URL=https://playaddatest.duckdns.org/ npm run test:e2e
BASE_URL=https://playadda.duckdns.org/ npm run test:e2e
```

If a live `BASE_URL` is missing `data-testid` hooks (`portal-home`), Playwright **skips** with a clear message instead of failing on selectors the deployed HTML does not have. CI default is the local static server of this checkout (hooks included).

## Jenkins `playadda-ci` / `playadda-test`

Linux Builder agent. Both jobs run the suite **from the git checkout only** — no Google Sheet, spreadsheet ingest, or CSV import on the agent.

Set **`DEPLOY=false`**. These `*-ci` jobs must not rsync or publish the checkout (especially `node_modules/`) over the Apache document root.

Deploy of the portal stays the existing static drop: `index.html`, `js/`, `favicon.svg`, `VERSION`. Leave test tooling on the builder.

```bash
npm ci
npx playwright install --with-deps chromium
npm test
npm run test:e2e:pixel    # C14 block gate; playadda-ci must run this
npm run test:e2e          # pixel catalog + desktop home smoke
```

Set `CI=1` so Playwright uses the CI reporter, retries once, and does not reuse an existing static server. For live playaddatest or prod smoke, export `BASE_URL` to that host’s portal root.

To reuse a host-minted session, export `PLAYADDA_E2E_STORAGE_STATE` (Playwright storageState path) or `PLAYADDA_E2E_SESSION_COOKIE` (`name=value` or a raw Cookie header, injected for the `BASE_URL` origin). The format comment is on `loginIfNeeded` in `tests/e2e/helpers.ts`. With both unset, local Pixel e2e still signs in through the overlay. That injected session is the portal user (`qa` on playadda-ci), not an admin.

`tests/e2e/enroll.spec.ts` against a remote `BASE_URL` checks three cases:

- A fresh browser context with no cookies expects 401 on `/admin/enroll`.
- The injected session expects 403, and the response must not include a QR, an `otpauth://` link, or a setup key.
- The admin happy path runs only when `PLAYADDA_E2E_ADMIN_STORAGE_STATE` points at an admin storageState file. CI does not set that. A local run with no `BASE_URL` signs the admin fixture itself (`srini`).

Reproduce the playadda-ci enroll case against the local auth server (start `node tests/auth-server.mjs` first; a remote `BASE_URL` does not launch it):

```bash
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import { signSession } from "./server/session.mjs";
const token = signSession({ name: "qa", exp: Date.now() + 3600000 }, "playadda-test-only-session-secret");
writeFileSync("/tmp/playadda-qa-storage.json", JSON.stringify({
  cookies: [{ name: "playadda_session", value: token, domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
  origins: [],
}));
'
BASE_URL=http://127.0.0.1:4173 PLAYADDA_E2E_STORAGE_STATE=/tmp/playadda-qa-storage.json npx playwright test tests/e2e/enroll.spec.ts
```

Anonymous expects 401. The injected `qa` session expects 403. The admin test is skipped. Do not export `PLAYADDA_E2E_ADMIN_STORAGE_STATE` for this check.

## Catalog (A–C)

| id | Layer | Gate | Coverage |
|---|--------|------|----------|
| A6 | unit | optional | `VERSION` matches `package.json` / `js/portal.js`; HTML keeps `v__VERSION__` |
| B7 | e2e | **block** | Portal home loads (brand, heading, grid, version) |
| B8 | e2e | **block** | Mini Sudoku / Tessera / Classic Snake / Tango / Chassu Rider cards with a filled Play CTA |
| B9 | e2e | **block** | Click Mini Sudoku opens `/mini-sudoku/` in the overlay |
| B10 | e2e | **block** | Hamburger opens Murmur controls (Scatter / Pause / Reset) |
| B-desktop-home | e2e | optional | 1280×800 home + seed cards (`viewport: desktop`) |
| C14 | pixel | **block** | 412×915 home usable; cards not critically clipped |

`tests/cases/catalog.test.ts` fails if a required id is missing or a block case is not `gate: "block"`.

## Manual-only (do not automate, not in JSON)

Still manual:

- Real Pixel 7a / Android Chrome gesture-bar and cutout.
- iPhone Safari-only visual quirks (dynamic toolbar, `visualViewport` dips, rubber-band).
- Subjective aesthetics of Murmur / card art beyond measurable clip and CTA visibility.
- Weekly prod / merge greenlights and sign-off rituals.
- In-game play of Tessera / Snake / Sudoku / Tango / Chassu / Pac-Man (owned by those repos).

## Hooks

Stable `data-testid` attributes (`portal-home`, `heading`, `card-grid`, `card-mini-sudoku`, `card-zip`, `card-tessera`, `cta`, `menu-btn`, `murmur-drawer`, `play-overlay`, `version`, …). Overlay navigation still uses `data-game` + `history.pushState`. Portal and Murmur logic is unchanged.
