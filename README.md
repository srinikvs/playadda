# Playadda

Games portal for [playadda.duckdns.org](https://playadda.duckdns.org/).

**v1.1.0** — Murmur runs live as the homepage ambient background. Controls live in the hamburger menu. Game cards: Tessera, Classic Snake, Tango, Chassu Rider, Pac-Man. Murmur is not a stack card.

## Layout

Apache document root. Drop these files at `/` — do not replace `/tessera/`, `/tango/`, `/classic-snake/`, `/chassu-rider/`, `/pacman/`, or `/murmur/`.

```
index.html      portal chrome
js/flock.js     murmur boids (ambient)
js/portal.js    hamburger + fullscreen game overlay
favicon.svg
```

No build step. Open `index.html` or serve the directory.

## Murmur

Same engine as [srinikvs/Murmur](https://github.com/srinikvs/Murmur). Settings persist in `localStorage` under `murmur.params`.

| Input | Action |
| --- | --- |
| Hamburger | Open Murmur rules |
| Sliders | Separation, alignment, cohesion, avoid, speed, flock size |
| Scatter / Pause / Reset | Burst, freeze, respawn |
| Space / R / S | Pause, reset, scatter |
| Pointer | Birds avoid the cursor |

## Version

`1.1.0` — stamped in the footer and the Murmur drawer.
