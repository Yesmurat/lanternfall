#!/usr/bin/env node
// Headless regression harness: plays the game with no browser, no renderer and
// no randomness beyond the seeded RNG, so two builds can be compared exactly.
//
//   node tools/sim.mjs                      # run against this working tree
//   BASE=/path/to/other/checkout node tools/sim.mjs
//
// Comparing the output of two runs is the check that matters: a refactor that
// is meant to preserve behaviour must produce byte-for-byte identical text.
//
//   git worktree add /tmp/base main
//   BASE=/tmp/base node tools/sim.mjs > before.txt
//   node tools/sim.mjs > after.txt && diff before.txt after.txt

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || HERE;

const { Game } = await import(path.join(BASE, 'src/game.js'));
const { T } = await import(path.join(BASE, 'src/dungeon.js'));
const { flowField } = await import(path.join(BASE, 'src/path.js'));
const { WEAPONS, ARMOUR } = await import(path.join(BASE, 'src/data.js'));

const fx = {
  clear() {}, burst() {}, float() {}, tracer() {}, shakeBy() {}, flashBy() {}, update() {},
  parts: [], floats: [], tracers: [], shake: 0, flash: 0,
};
const sfx = { play() {}, ready() { return false; }, setMuted() {} };
const ui = { refresh() {}, pushMessage() {}, setScreen() {}, renderInv() {}, redrawLog() {} };

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

// would this player actually pick the thing up?
function wants(g, it) {
  if (it.type === 'use') return true;
  if (it.type === 'part') return !g.player.parts.includes(it.id);
  const table = it.type === 'weapon' ? WEAPONS : ARMOUR;
  const key = it.type === 'weapon' ? 'weapon' : 'armour';
  const found = table.find(x => x.id === it.id);
  const held = g.player[key] ? table.find(x => x.id === g.player[key]) : null;
  return !held || found.bonus > held.bonus;
}

function step(g, goal) {
  const p = g.player;
  const field = flowField(g.map.w, g.map.h, goal.x, goal.y, (x, y) => g.walkable(x, y));
  const here = field[p.y * g.map.w + p.x];
  if (here < 0) return false;
  let best = here, bx = p.x, by = p.y;
  for (const [dx, dy] of DIRS) {
    const nx = p.x + dx, ny = p.y + dy;
    if (nx < 0 || ny < 0 || nx >= g.map.w || ny >= g.map.h) continue;
    const nd = field[ny * g.map.w + nx];
    if (nd >= 0 && nd < best) { best = nd; bx = nx; by = ny; }
  }
  if (bx === p.x && by === p.y) return false;
  g.act({ type: 'move', dx: bx - p.x, dy: by - p.y });
  return true;
}

// a thorough player: sweeps the rooms, takes what is useful, then descends
function play(seed, stats) {
  const g = new Game(fx, sfx, ui);
  g.newRun(seed);
  let guard = 0, depthSeen = -1, queue = [], turnsAt = 0;

  while (g.screen === 'play' && guard++ < 12000) {
    const p = g.player;
    if (g.depth !== depthSeen) {
      if (depthSeen > 0) stats.perLevel.push(g.turns - turnsAt);
      turnsAt = g.turns;
      depthSeen = g.depth;
      queue = g.map.rooms.map(r => ({ x: r.cx, y: r.cy }));
    }
    const oil = g.inv.findIndex(s => s.id === 'oil');
    const draught = g.inv.findIndex(s => s.id === 'draught');
    const ember = g.inv.findIndex(s => s.id === 'ember');

    if (oil >= 0 && p.fuel / p.maxFuel < 0.4) { g.act({ type: 'use', slot: oil }); continue; }
    if (draught >= 0 && p.hp / p.maxHp < 0.55) { g.act({ type: 'use', slot: draught }); continue; }

    const foes = g.entities.filter(e =>
      e.hp > 0 && Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= 1);
    if (foes.length) {
      const e = foes[0];
      if (ember >= 0 && (e.maxHp > 30 || foes.length > 2)) g.act({ type: 'use', slot: ember });
      else g.act({ type: 'move', dx: Math.sign(e.x - p.x), dy: Math.sign(e.y - p.y) });
      continue;
    }

    const loot = g.items.filter(it => g.seen[it.y * g.map.w + it.x] === 1 && wants(g, it));
    if (loot.length && step(g, loot[0])) continue;

    if (queue.length) {
      const target = queue[0];
      if ((Math.abs(target.x - p.x) <= 1 && Math.abs(target.y - p.y) <= 1) || !step(g, target)) queue.shift();
      continue;
    }

    const tile = g.tileAt(p.x, p.y);
    if (tile === T.STAIRS || tile === T.FLAME) { g.act({ type: 'descend' }); continue; }
    if (!step(g, g.map.stairs)) g.act({ type: 'wait' });
  }
  if (guard >= 12000) stats.stalls++;
  return g;
}

const RUNS = Number(process.env.RUNS || 70);
const stats = { perLevel: [], stalls: 0 };
const depths = {}, causes = {};
let wins = 0, dry = 0, kills = 0, turns = 0;
const levels = [];

for (let i = 0; i < RUNS; i++) {
  const g = play('bal' + i, stats);
  depths[g.depth] = (depths[g.depth] || 0) + 1;
  const cause = (g.deathCause || (g.screen === 'won' ? 'WON' : 'stalled'))
    .replace(/^slain by |^shot down by /, '');
  causes[cause] = (causes[cause] || 0) + 1;
  if (g.screen === 'won') wins++;
  if (g.player.fuel <= 0) dry++;
  levels.push(g.player.level);
  kills += g.kills;
  turns += g.turns;
}

const avg = a => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');
console.log('ended on depth:', Object.entries(depths).sort((a, b) => a[0] - b[0])
  .map(([k, v]) => `${k}:${v}`).join(' '));
console.log('wins', wins, '| dry', dry, '| stalls', stats.stalls,
  '| avg level', avg(levels), '| kills', kills, '| turns', turns);
console.log('turns/level', avg(stats.perLevel));
console.log('outcomes:', Object.entries(causes).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`).join(', '));
