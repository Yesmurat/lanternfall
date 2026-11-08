# Lanternfall

**[Play it](https://yesmurat.github.io/lanternfall)**

A turn-based roguelike in eight procedurally generated depths, where **the oil in your lantern is your field of view**.

Every step burns a unit of oil. As the oil drops the circle of light closes in around you, until you are
seeing one tile in any direction and fighting things you can only hear. Braziers scattered through the
rooms give light you don't have to pay for, so a run becomes a route between islands of free light.
Reach the eighth depth, put down the Snuffer, and relight the Everflame.

No engine, no build step for development, no art assets — everything on screen is drawn with the
Canvas 2D API and every sound is synthesised with the Web Audio API at runtime.

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | step |
| `Q E Z C` | step diagonally |
| `space` | wait a turn |
| `>` | take the stairs down |
| `1`–`9` | use an item from the satchel |
| `?` | keys and legend |
| `M` | mute |

Walk into a creature to attack it. On a touch screen a directional pad appears below the map.

## Running it locally

ES modules will not load over `file://`, so the page needs a server — any server will do:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

That serves the repository root, where `index.html` and `src/` work as they are. To check the built
version instead, run `node build.mjs` first and serve `dist/`.

Only Node is needed for the build; there are no dependencies to install. The `scripts` in
`package.json` are conveniences for anyone who has npm — every one of them is a plain command you can
run directly.

## Deploying

The game is static files. `node build.mjs` writes a self-contained `dist/` that any host can serve.

**GitHub Pages** — already wired up. Push to `main` and the workflow in
`.github/workflows/pages.yml` builds `dist/` and publishes it. Enable it once under
*Settings → Pages → Source → GitHub Actions*. Pages requires a public repository on the free plan.

**Vercel / Netlify / Cloudflare Pages** — import the repository and set:

- build command: `node build.mjs`
- output directory: `dist`

**itch.io** — build the bundle, then upload it:

```bash
node build.mjs && (cd dist && zip -qr ../lanternfall-itch.zip .)
```

Create a new project, set *Kind of project* to **HTML**, upload `lanternfall-itch.zip`, tick *This file
will be played in the browser*, and set the viewport to around 1280×800 with fullscreen enabled.
itch.io needs `index.html` at the root of the zip, which is how the bundle is laid out.

## Why there is a build step

`index.html` is authored for the Claude artifact host, which supplies the `<!doctype>`, `<head>` and a
small CSS reset when it publishes. Off-platform that scaffolding has to be in the file, so `build.mjs`
adds it — plus a favicon, Open Graph tags and `.nojekyll` — and copies `src/` beside it. The game code
itself is untouched.

## Layout

```
index.html        markup, styles, HUD    src/game.js        turns, combat, items, save/load
build.mjs         standalone build       src/render.js      canvas renderer, lighting, FX draw
src/main.js       boot, input, loop      src/creatures.js   the bestiary, drawn with paths
src/dungeon.js    map generation         src/fov.js         recursive shadowcasting
src/path.js       breadth-first chase    src/data.js        monsters, loot, depth names
src/fx.js         particles, shake       src/audio.js       synthesised sound
src/rng.js        seeded random          src/ui.js          HUD, log, overlays
```

Runs are seeded: type a seed on the title screen to replay the same dungeon, or read the seed off the
masthead to share one.

## Balance

Tuned against a headless simulation that plays the game with no renderer (60–70 runs per pass). A bot
that rushes the stairs dies around depth 5–6 as the oil runs out; a bot that sweeps rooms and collects
oil reaches depth 8 and wins about two thirds of the time. Exploring costs turns but pays for itself —
that trade is the game.

## Licence

MIT. Do what you like with it.
