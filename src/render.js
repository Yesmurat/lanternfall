import { T } from './dungeon.js';
import { MONSTERS, itemLook } from './data.js';
import { drawCreature } from './creatures.js';

// base colours, pre-split so the lighting maths stays cheap
const TILE_RGB = {
  [T.FLOOR]: [86, 94, 112],
  [T.RUBBLE]: [104, 100, 92],
  [T.WALL]: [58, 64, 80],
  [T.DOOR]: [146, 118, 74],
  [T.OPEN]: [120, 100, 68],
  [T.STAIRS]: [226, 220, 204],
  [T.UP]: [120, 128, 146],
  [T.BRAZIER]: [240, 169, 60],
  [T.FLAME]: [255, 223, 160],
};
const TILE_GLYPH = {
  [T.FLOOR]: '·',
  [T.RUBBLE]: ',',
  [T.DOOR]: '+',
  [T.OPEN]: '‘',
  [T.STAIRS]: '>',
  [T.UP]: '<',
};
const MEMORY_RGB = [44, 50, 64];


export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tile = 20;
    this.cols = 30;
    this.rows = 20;
    this.cam = { x: 0, y: 0 };
    this.time = 0;
    this.started = false;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.cssW = Math.max(240, rect.width);
    this.cssH = Math.max(200, rect.height);
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.tile = Math.max(13, Math.min(27, Math.floor(Math.min(this.cssW / 30, this.cssH / 19))));
    this.cols = Math.ceil(this.cssW / this.tile);
    this.rows = Math.ceil(this.cssH / this.tile);
  }

  centreOn(px, py, map) {
    const halfC = this.cols / 2, halfR = this.rows / 2;
    let cx = px - halfC + 0.5, cy = py - halfR + 0.5;
    cx = map.w <= this.cols ? (map.w - this.cols) / 2 : Math.max(0, Math.min(map.w - this.cols, cx));
    cy = map.h <= this.rows ? (map.h - this.rows) / 2 : Math.max(0, Math.min(map.h - this.rows, cy));
    return { x: cx, y: cy };
  }

  draw(game, fx, dt) {
    const ctx = this.ctx;
    this.time += dt;
    ctx.save();
    ctx.fillStyle = '#0a0e16';
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    if (!game.map) { ctx.restore(); return; }

    const p = game.player;
    const target = this.centreOn(p.ax, p.ay, game.map);
    if (!this.started) { this.cam = target; this.started = true; }
    else {
      const k = 1 - Math.exp(-dt * 11);
      this.cam.x += (target.x - this.cam.x) * k;
      this.cam.y += (target.y - this.cam.y) * k;
    }

    // camera shake
    let shx = 0, shy = 0;
    if (fx.shake > 0.05) {
      shx = (Math.random() - 0.5) * fx.shake;
      shy = (Math.random() - 0.5) * fx.shake;
    }
    ctx.translate(Math.round(-this.cam.x * this.tile + shx), Math.round(-this.cam.y * this.tile + shy));

    const flicker = 1 + Math.sin(this.time * 7.1) * 0.055 + Math.sin(this.time * 17.7) * 0.03;
    // every bearer throws their own light; a tile takes the brighter of them
    const lamps = game.players.map((pl, slot) => ({
      alive: !pl.dead && !pl.absent,
      radius: game.lightRadius(pl) * flicker,
      dist: game.distBy && game.distBy[slot],
    })).filter(l => l.alive && l.dist);
    const lanternAt = i => {
      let best = 0;
      for (const l of lamps) {
        const d = l.dist[i];
        if (d > 900) continue;
        const v = 1 - Math.pow(Math.min(1, d / (l.radius + 0.7)), 1.5);
        if (v > best) best = v;
      }
      return best < 0 ? 0 : best;
    };
    const t = this.tile;
    const glyphSize = Math.round(t * 0.82);

    ctx.font = `500 ${glyphSize}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x0 = Math.max(0, Math.floor(this.cam.x) - 1);
    const y0 = Math.max(0, Math.floor(this.cam.y) - 1);
    const x1 = Math.min(game.map.w - 1, Math.ceil(this.cam.x + this.cols) + 1);
    const y1 = Math.min(game.map.h - 1, Math.ceil(this.cam.y + this.rows) + 1);

    const braziersInView = [];

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * game.map.w + x;
        const visible = game.vis[i] === 1;
        const seen = game.seen[i] === 1;
        if (!visible && !seen) continue;
        const tileType = game.map.tiles[i];
        if (tileType === T.ROCK) continue;

        const px = x * t, py = y * t;
        let lant = 0, lit = 0;
        if (visible) {
          lant = lanternAt(i);
          lit = Math.max(lant, game.map.light[i] * 0.95);
          lit = Math.max(0.14, Math.min(1, lit));
        }

        const base = TILE_RGB[tileType] || TILE_RGB[T.FLOOR];
        let col;
        if (visible) col = warmth(base, lit, lant);
        else col = `rgb(${MEMORY_RGB[0]},${MEMORY_RGB[1]},${MEMORY_RGB[2]})`;

        if (tileType === T.WALL) {
          ctx.fillStyle = col;
          ctx.fillRect(px, py, t + 1, t + 1);
          if (visible && lit > 0.3) {
            ctx.fillStyle = warmth([base[0] + 30, base[1] + 32, base[2] + 36], lit, lant);
            ctx.fillRect(px, py, t + 1, Math.max(1, Math.round(t * 0.14)));
          }
          continue;
        }

        // floor wash under everything else
        ctx.fillStyle = visible
          ? warmth([18, 21, 29], lit, lant)
          : 'rgb(13,16,23)';
        ctx.fillRect(px, py, t + 1, t + 1);

        if (tileType === T.BRAZIER) {
          if (visible || seen) braziersInView.push({ x, y, visible });
          continue;
        }
        if (tileType === T.FLAME) {
          if (visible || seen) braziersInView.push({ x, y, visible, big: true, dead: game.bossAlive });
          continue;
        }

        const glyph = TILE_GLYPH[tileType];
        if (!glyph) continue;
        if (tileType === T.DOOR || tileType === T.OPEN) {
          ctx.fillStyle = visible ? warmth([64, 52, 36], lit, lant) : 'rgb(20,24,32)';
          ctx.fillRect(px + 1, py + 1, t - 1, t - 1);
        }
        if (tileType === T.STAIRS && visible) {
          const pulse = 0.55 + 0.45 * Math.sin(this.time * 2.6);
          ctx.save();
          ctx.globalAlpha = 0.25 * pulse * Math.max(0.4, lit);
          ctx.fillStyle = '#ffdfa0';
          ctx.fillRect(px + 1, py + 1, t - 1, t - 1);
          ctx.restore();
        }
        ctx.fillStyle = col;
        ctx.fillText(glyph, px + t / 2, py + t / 2 + 1);
      }
    }

    // braziers and the Everflame, drawn rather than lettered
    for (const b of braziersInView) this.drawFire(b, t, game);

    // loose items
    for (const item of game.items) {
      const i = item.y * game.map.w + item.x;
      if (game.vis[i] !== 1) continue;
      const look = itemLook(item);
      const lant = lanternAt(i);
      const lit = Math.max(0.42, Math.max(lant, game.map.light[i]));
      const bob = Math.sin(this.time * 3 + item.x * 1.7 + item.y) * 1.4;
      ctx.save();
      ctx.globalAlpha = Math.min(1, lit);
      ctx.shadowColor = look.color;
      ctx.shadowBlur = 10 * lit;
      ctx.fillStyle = look.color;
      ctx.font = `600 ${glyphSize}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.fillText(look.glyph, item.x * t + t / 2, item.y * t + t / 2 + 1 + bob);
      ctx.restore();
    }

    // monsters
    for (const e of game.entities) {
      if (e.hp <= 0 || !game.canSeeEntity(e)) continue;
      const def = MONSTERS[e.key];
      const i = e.y * game.map.w + e.x;
      const seenAmt = Math.max(0.5, Math.max(lanternAt(i), game.map.light[i]));

      // each creature keeps its own gait, and turns to watch you when it is still
      if (e.ph === undefined) e.ph = Math.random() * Math.PI * 2;
      const travelX = e.x - e.ax;
      const travel = Math.hypot(travelX, e.y - e.ay);
      if (Math.abs(travelX) > 0.04) e.face = travelX > 0 ? 1 : -1;
      else if (p.x !== e.x) e.face = p.x < e.x ? -1 : 1;
      e.ph += dt * (travel > 0.03 ? 11 : 2.6);

      const lx = e.lunge > 0 ? e.lungeDir[0] * Math.sin(e.lunge * Math.PI) * 0.38 : 0;
      const ly = e.lunge > 0 ? e.lungeDir[1] * Math.sin(e.lunge * Math.PI) * 0.38 : 0;
      ctx.save();
      ctx.globalAlpha = Math.min(1, seenAmt);
      drawCreature(ctx, e.key, (e.ax + lx) * t + t / 2, (e.ay + ly) * t + t / 2, t, {
        phase: e.ph,
        facing: e.face || -1,
        moving: travel > 0.03,
        color: def.color,
      });
      ctx.restore();

      if (e.hp < e.maxHp) {
        const bw = t * (def.boss ? 1.1 : 0.74), bh = Math.max(2, t * 0.09);
        const bx = e.ax * t + (t - bw) / 2;
        const by = e.ay * t - t * (def.boss ? 0.82 : 0.2);
        ctx.fillStyle = 'rgba(8,10,16,.85)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = def.boss ? '#e8574c' : '#b2473a';
        ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh);
      }
    }

    // the bearers, your own drawn last so it is never hidden behind a partner
    const order = game.players
      .map((pl, slot) => ({ pl, slot }))
      .filter(o => !o.pl.dead && !o.pl.absent)
      .sort((a, b) => (a.slot === game.localIndex ? 1 : 0) - (b.slot === game.localIndex ? 1 : 0));

    for (const { pl } of order) {
      const tx = pl.x - pl.ax, ty = pl.y - pl.ay;
      const moving = Math.hypot(tx, ty);
      if (Math.abs(tx) > 0.04) pl.face = tx > 0 ? 1 : -1;
      else if (pl.lunge > 0 && pl.lungeDir[0] !== 0) pl.face = pl.lungeDir[0];
      if (!pl.face) pl.face = 1;
      pl.phase = (pl.phase || 0) + dt * (moving > 0.03 ? 13 : 2.4);

      const plunge = pl.lunge > 0
        ? [pl.lungeDir[0] * Math.sin(pl.lunge * Math.PI) * 0.4, pl.lungeDir[1] * Math.sin(pl.lunge * Math.PI) * 0.4]
        : [0, 0];
      const hx = (pl.ax + plunge[0]) * t + t / 2;
      const hy = (pl.ay + plunge[1]) * t + t / 2;
      const lit = pl.fuel > 0 && !pl.downed;
      const lamp = this.lampAt(pl, hx, hy, t, moving);
      const rad = game.lightRadius(pl) * flicker;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const reach = Math.max(t, rad * t * 1.05);
      const glow = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, reach);
      glow.addColorStop(0, lit ? 'rgba(255,206,130,.30)' : 'rgba(150,170,210,.10)');
      glow.addColorStop(0.45, lit ? 'rgba(240,169,60,.12)' : 'rgba(120,140,190,.05)');
      glow.addColorStop(1, 'rgba(240,169,60,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(lamp.x - reach * 1.15, lamp.y - reach * 1.15, reach * 2.3, reach * 2.3);
      ctx.restore();

      if (pl.downed) {
        const footY = hy + t * 0.44;
        ctx.save();
        ctx.translate(hx, footY);
        ctx.rotate(pl.face * 1.35);
        ctx.translate(-hx, -footY);
        this.drawHero(pl, hx, hy, t, 0, false, lamp);
        ctx.restore();
        const pulse = 0.35 + 0.3 * Math.sin(this.time * 5);
        ctx.fillStyle = `rgba(224,90,69,${pulse})`;
        ctx.beginPath();
        ctx.arc(hx, hy + t * 0.2, t * 0.17, 0, Math.PI * 2);
        ctx.fill();
      } else {
        this.drawHero(pl, hx, hy, t, moving, lit, lamp);
      }

      if (game.coop) {
        ctx.save();
        ctx.font = `600 ${Math.max(8, Math.round(t * 0.42))}px "IBM Plex Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = pl.downed ? '#e05a45' : (pl === game.player ? '#ffdfa0' : pl.cloak);
        ctx.shadowColor = 'rgba(0,0,0,.9)';
        ctx.shadowBlur = 4;
        ctx.fillText(pl.name, hx, hy - t * 0.92);
        ctx.restore();
      }
    }

    // tracers, particles, numbers
    for (const tr of fx.tracers) {
      const a = 1 - tr.t / tr.life;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = Math.max(1.5, t * 0.12);
      ctx.shadowColor = tr.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(tr.x0 * t, tr.y0 * t);
      ctx.lineTo(tr.x1 * t, tr.y1 * t);
      ctx.stroke();
      ctx.restore();
    }
    for (const part of fx.parts) {
      const a = 1 - part.t / part.life;
      ctx.fillStyle = `rgba(${part.color},${a * 0.95})`;
      const s = part.size * (0.4 + a * 0.8) * (t / 20);
      ctx.fillRect(part.x * t - s / 2, part.y * t - s / 2, s, s);
    }
    ctx.textAlign = 'center';
    for (const f of fx.floats) {
      const k = f.t / f.life;
      const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = f.color;
      ctx.font = `${f.big ? 700 : 600} ${Math.round(t * (f.big ? 0.72 : 0.56))}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.shadowColor = 'rgba(0,0,0,.9)';
      ctx.shadowBlur = 5;
      ctx.fillText(f.text, f.x * t, f.y * t - k * t * 1.5);
      ctx.restore();
    }

    ctx.restore();

    // vignette tightens as the oil runs out
    const ratio = Math.max(0, p.fuel) / p.maxFuel;
    const dark = 0.5 + (1 - ratio) * 0.42;
    const cx = this.cssW / 2, cy = this.cssH / 2;
    const vig = ctx.createRadialGradient(cx, cy, Math.min(cx, cy) * (0.22 + ratio * 0.3), cx, cy, Math.max(cx, cy) * 1.18);
    vig.addColorStop(0, 'rgba(5,7,12,0)');
    vig.addColorStop(1, `rgba(3,4,8,${dark})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    if (ratio < 0.14) {
      const pulse = 0.08 + 0.06 * Math.sin(this.time * 4);
      ctx.fillStyle = `rgba(224,90,69,${pulse * (1 - ratio / 0.14)})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    // where your partner is, when they are off the edge of the screen
    if (game.coop) {
      for (const pl of game.players) {
        if (pl === game.player || pl.dead || pl.absent) continue;
        const sx = (pl.ax - this.cam.x) * t + t / 2;
        const sy = (pl.ay - this.cam.y) * t + t / 2;
        if (sx > 14 && sx < this.cssW - 14 && sy > 14 && sy < this.cssH - 14) continue;
        const cx = this.cssW / 2, cy = this.cssH / 2;
        let dx = sx - cx, dy = sy - cy;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const m = 30;
        const ex = Math.max(m, Math.min(this.cssW - m, cx + dx * (this.cssW / 2 - m)));
        const ey = Math.max(m, Math.min(this.cssH - m, cy + dy * (this.cssH / 2 - m)));
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.fillStyle = pl.downed ? '#e05a45' : pl.cloak;
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-8, 8);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-8, -8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.fillStyle = pl.downed ? '#e05a45' : '#98907e';
        ctx.font = '600 10px "IBM Plex Mono", ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(pl.downed ? `${pl.name} DOWN` : pl.name, ex, ey + 21);
        ctx.restore();
      }
    }

    if (fx.flash > 0.004) {
      ctx.fillStyle = `rgba(${fx.flashColor},${fx.flash})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
  }

  // where the lamp hangs this frame; the light and the hand both use it
  lampAt(p, hx, hy, t, moving) {
    const f = p.face || 1;
    const h = t * 1.18, w = t * 0.64;
    const swing = Math.sin(p.phase || 0) * (moving > 0.03 ? 1 : 0.4);
    const feetY = hy + t * 0.44;
    return {
      x: hx + f * (w * 0.60 + swing * w * 0.09),
      y: feetY - h * 0.47 + Math.cos((p.phase || 0) * 2) * h * 0.018,
    };
  }

  // a hooded figure with a lamp, drawn rather than lettered
  drawHero(p, hx, hy, t, moving, lit, lamp) {
    const ctx = this.ctx;
    const f = p.face || 1;
    const h = t * 1.18, w = t * 0.64;
    const walking = moving > 0.03;
    const ph = p.phase || 0;
    const bob = walking ? Math.abs(Math.sin(ph)) * h * 0.04 : Math.sin(ph) * h * 0.012;
    const feetY = hy + t * 0.44 - bob;
    const topY = feetY - h;
    const sway = Math.sin(ph) * w * (walking ? 0.1 : 0.035);
    const headR = w * 0.35;
    const shoulderY = topY + headR * 1.75;

    const CLOAK = p.cloak || '#8c4636';
    const CLOAK_DARK = p.cloakDark || '#4b231b';
    const HOOD_DARK = '#1d1016';
    const RIM = lit ? 'rgba(255,206,140,.5)' : 'rgba(150,172,210,.32)';

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // his shadow on the stones
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(hx, hy + t * 0.46, w * 0.42, t * 0.095, 0, 0, Math.PI * 2);
    ctx.fill();

    // cloak
    ctx.beginPath();
    ctx.moveTo(hx - w * 0.52 + sway, feetY);
    ctx.quadraticCurveTo(hx - w * 0.47, feetY - h * 0.28, hx - w * 0.34, shoulderY);
    ctx.quadraticCurveTo(hx, shoulderY - h * 0.05, hx + w * 0.34, shoulderY);
    ctx.quadraticCurveTo(hx + w * 0.47, feetY - h * 0.28, hx + w * 0.52 + sway, feetY);
    ctx.quadraticCurveTo(hx, feetY + t * 0.07, hx - w * 0.52 + sway, feetY);
    ctx.closePath();
    ctx.fillStyle = CLOAK;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = CLOAK_DARK;
    ctx.fillRect(f > 0 ? hx - w : hx, topY - h, w, h * 3);
    ctx.restore();
    ctx.strokeStyle = RIM;
    ctx.lineWidth = Math.max(0.8, t * 0.034);
    ctx.stroke();

    // the arm carrying the lamp
    ctx.strokeStyle = CLOAK_DARK;
    ctx.lineWidth = Math.max(1.3, t * 0.1);
    ctx.beginPath();
    ctx.moveTo(hx + f * w * 0.24, shoulderY + h * 0.07);
    ctx.lineTo(lamp.x, lamp.y - t * 0.1);
    ctx.stroke();

    // hood
    ctx.beginPath();
    ctx.moveTo(hx - headR, topY + headR * 1.5);
    ctx.quadraticCurveTo(hx - headR * 1.08, topY + headR * 0.2, hx + f * headR * 0.3, topY);
    ctx.quadraticCurveTo(hx + headR * 1.08, topY + headR * 0.45, hx + headR, topY + headR * 1.5);
    ctx.quadraticCurveTo(hx, topY + headR * 2.12, hx - headR, topY + headR * 1.5);
    ctx.closePath();
    ctx.fillStyle = CLOAK;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = CLOAK_DARK;
    ctx.fillRect(f > 0 ? hx - w : hx + headR * 0.18, topY - h, w, h * 2);
    ctx.restore();
    ctx.strokeStyle = RIM;
    ctx.lineWidth = Math.max(0.8, t * 0.03);
    ctx.stroke();

    // the dark under the hood, and the glints the lamp finds in it
    ctx.beginPath();
    ctx.ellipse(hx + f * headR * 0.38, topY + headR * 1.18, headR * 0.52, headR * 0.44, 0, 0, Math.PI * 2);
    ctx.fillStyle = HOOD_DARK;
    ctx.fill();
    const eyeR = Math.max(0.7, t * 0.038);
    ctx.fillStyle = lit ? '#ffd089' : '#7c8aa6';
    ctx.beginPath();
    ctx.arc(hx + f * headR * 0.66, topY + headR * 1.12, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx + f * headR * 0.24, topY + headR * 1.15, eyeR * 0.8, 0, Math.PI * 2);
    ctx.fill();

    // the lantern
    const ls = t * 0.17;
    ctx.strokeStyle = '#6b5a3a';
    ctx.lineWidth = Math.max(0.9, t * 0.028);
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y - ls * 0.72, ls * 0.46, Math.PI, 0);
    ctx.stroke();
    roundRectPath(ctx, lamp.x - ls * 0.52, lamp.y - ls * 0.42, ls * 1.04, ls * 1.3, ls * 0.26);
    ctx.fillStyle = lit ? '#f3b149' : '#39404f';
    ctx.fill();
    ctx.strokeStyle = '#51411f';
    ctx.lineWidth = Math.max(0.8, t * 0.025);
    ctx.stroke();
    if (lit) {
      ctx.beginPath();
      ctx.ellipse(lamp.x, lamp.y + ls * 0.16, ls * 0.3, ls * 0.44, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fff4d2';
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const bloom = ctx.createRadialGradient(lamp.x, lamp.y + ls * 0.1, 0, lamp.x, lamp.y + ls * 0.1, t * 0.95);
      bloom.addColorStop(0, 'rgba(255,214,140,.5)');
      bloom.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(lamp.x - t, lamp.y - t, t * 2, t * 2);
    }
    ctx.restore();
  }

  drawFire(b, t, game) {
    const ctx = this.ctx;
    const cx = b.x * t + t / 2, cy = b.y * t + t * 0.58;
    if (!b.visible) {
      ctx.fillStyle = 'rgb(34,38,50)';
      ctx.beginPath();
      ctx.arc(cx, cy, t * 0.22, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const dead = b.dead;
    const scale = b.big ? 1.9 : 1;
    // bowl
    ctx.fillStyle = dead ? '#2b3040' : '#3a3024';
    ctx.beginPath();
    ctx.ellipse(cx, cy + t * 0.22, t * 0.3 * scale, t * 0.12 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    if (dead) {
      ctx.fillStyle = '#4a4f63';
      ctx.font = `600 ${Math.round(t * 0.7)}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('·', cx, cy);
      return;
    }
    const wob = Math.sin(this.time * 9 + b.x * 2.3 + b.y) * 0.16 + Math.sin(this.time * 23) * 0.07;
    const h = t * (0.5 + wob * 0.3) * scale;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy - h * 0.2, 0, cx, cy - h * 0.2, t * 1.5 * scale);
    g.addColorStop(0, 'rgba(255,226,160,.75)');
    g.addColorStop(0.3, 'rgba(240,150,50,.3)');
    g.addColorStop(1, 'rgba(240,120,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - t * 1.6 * scale, cy - t * 1.8 * scale, t * 3.2 * scale, t * 3.2 * scale);
    ctx.beginPath();
    ctx.moveTo(cx - t * 0.17 * scale, cy + t * 0.16);
    ctx.quadraticCurveTo(cx - t * 0.2 * scale, cy - h * 0.5, cx + wob * t * 0.5, cy - h);
    ctx.quadraticCurveTo(cx + t * 0.2 * scale, cy - h * 0.5, cx + t * 0.17 * scale, cy + t * 0.16);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,214,130,.95)';
    ctx.fill();
    ctx.restore();
  }
}


function warmth(base, lit, lant) {
  const warm = Math.min(1, lant * 0.9);
  const r = clamp255(base[0] * lit * (1 + 0.42 * warm));
  const g = clamp255(base[1] * lit * (1 + 0.14 * warm));
  const b = clamp255(base[2] * lit * (1 - 0.26 * warm));
  return `rgb(${r},${g},${b})`;
}


function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }


function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}
