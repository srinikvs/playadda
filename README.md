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

## Version

`1.2.5` — stamped in the footer and the Murmur drawer.
