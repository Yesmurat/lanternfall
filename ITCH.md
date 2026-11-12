# Publishing Lanternfall on itch.io

Everything listed here is already built. Create the project at
[itch.io/game/new](https://itch.io/game/new) and work down the page.

## Files to upload

| Field on the itch page | File | Notes |
| --- | --- | --- |
| **Uploads** | `lanternfall-itch.zip` | Tick *This file will be played in the browser*. Rebuild any time with `node build.mjs && (cd dist && zip -qr ../lanternfall-itch.zip .)` |
| **Cover image** | `art/cover.png` | 630×500, the exact size itch wants |
| **Screenshots** | `art/bestiary.png` | Plus a shot or two of real play — grab them from the game yourself |

The eleven creature cut-outs in `art/monsters/` are transparent PNGs, there for the page body,
devlogs, social posts or a press kit. `hero.png` is the lantern-bearer.

## Settings

- **Kind of project**: HTML
- **Embed options**: 1280 × 800, *Fullscreen button* on, *Mobile friendly* on (the game shows a
  directional pad on touch screens)
- **Genre**: Role Playing · **Tags**: `roguelike`, `turn-based`, `procedural-generation`,
  `dungeon-crawler`, `atmospheric`, `dark-fantasy`, `html5`, `singleplayer`

## Pricing

- **Pricing**: *$0 or donate*, with a suggested donation of **$2**. Keep the browser build free: a
  paywall in front of a web game turns away almost everyone before they have played a turn.
- **Payouts**: *Collected by itch.io, paid later* is the simplest mode. Complete the tax interview
  under *Settings → Publisher → Get started*, and check that one of itch's payout methods (PayPal or
  Payoneer) works in your country before relying on it.
- **In-game link**: once the page exists, paste its address into `SUPPORT_URL` in
  `src/support-config.js` and rebuild the zip. A quiet "support the game" link then appears on the
  title and game-over screens. Left empty, the game never mentions money.

## Page text

**Tagline** (the short description field):

> A turn-based roguelike where your lantern's oil is your field of view.

**Description** (paste into the body, itch accepts this formatting):

---

Every step you take burns a unit of oil, and as the oil goes the light closes in around you — until
you are seeing one tile in any direction and fighting things you can only hear.

Braziers scattered through the dungeon give light you don't have to pay for, so a run becomes a route
between islands of free light. Rush the stairs and you will reach the deep floors blind and broke.
Sweep every room and the oil pays for itself, but the dungeon has that much longer to kill you.

Eight procedurally generated depths. Bump to attack, hoard your flasks, and relight the Everflame.

**What's down there**

- Eleven creatures, from cave rats to the Snuffer that put the Everflame out
- Wick-eaters drink your oil; shades are invisible until real light finds them; acolytes strike from
  across the room
- Weapons, armour and lantern parts that widen your light or hold more oil
- Seeded runs — type a seed to replay a dungeon, or share the one you died in
- Your run auto-saves, so you can close the tab and come back

**Controls**: `WASD` or arrows to step, `QEZC` for diagonals, `space` to wait, `>` for stairs down,
`1`–`9` for the satchel, `?` for the full list.

No engine and no art assets — every figure is drawn with Canvas 2D paths and every sound is
synthesised with Web Audio at runtime. Source is
[on GitHub](https://github.com/Yesmurat/lanternfall).

---

## Regenerating the art

The images are rendered from the game's own drawing code, so they never drift from what you see in
play. After changing anything in `src/creatures.js` or `src/render.js`:

```bash
node tools/record-art.mjs    # capture the canvas calls the game makes
python3 tools/render-art.py  # replay them into art/ as PNGs (needs pycairo)
```
