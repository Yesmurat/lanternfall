#!/usr/bin/env node
// Headless regression harness: plays the game with no browser, no renderer and
// no randomness beyond the seeded RNG, so two builds can be compared exactly.
//
//   node tools/sim.mjs                      # run against this working tree
//   MODE=rush node tools/sim.mjs            # a player who heads straight for the stairs
//   RUNS=200 node tools/sim.mjs             # more runs (default 70)
//   TABLE=1 node tools/sim.mjs              # also print the player's state on reaching each floor
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
const sfx = { play() {}, ready() {

	return false;

}, setMuted() {} };
const ui = { refresh() {}, pushMessage() {}, setScreen() {}, renderInv() {}, redrawLog() {} };

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];

// would this player actually pick the thing up?

function wants(g, it) {

	if (it.type === 'use') {
		return true;
	}

	if (it.type === 'part') {
		return !g.player.parts.includes(it.id);
	}

	const table = it.type === 'weapon' ? WEAPONS : ARMOUR;
	const key   = it.type === 'weapon' ? 'weapon' : 'armour';
	const found = table.find(x => x.id === it.id);
	const held  = g.player[key] ? table.find(x => x.id === g.player[key]) : null;

	return !held || found.bonus > held.bonus;

}

function step(g, goal) {

	const p     = g.player;
	const field = flowField(g.map.w, g.map.h, goal.x, goal.y, (x, y) => g.walkable(x, y));
	const here  = field[p.y * g.map.w + p.x];

	if (here < 0) {
		return false;
	}

	let best = here, bx = p.x, by = p.y;

	for (const [dx, dy] of DIRS) {

		const nx = p.x + dx, ny = p.y + dy;

		if (nx < 0 || ny < 0 || nx >= g.map.w || ny >= g.map.h) {
			continue;
		}

		const nd = field[ny * g.map.w + nx];

		if (nd >= 0 && nd < best) {
			best = nd; bx = nx; by = ny;
		}

	}

	if (bx === p.x && by === p.y) {
		return false;
	}

	g.act({ type: 'move', dx: bx - p.x, dy: by - p.y });
	return true;

}

const RUSH  = process.env.MODE === 'rush';
const GUARD = 40000;

// a thorough player: sweeps the rooms, takes what is useful, then descends.
// With MODE=rush the room sweep is skipped: loot in sight, then the stairs.

function play(seed, stats) {

	const g = new Game(fx, sfx, ui);

	g.newRun(seed);

	let guard = 0, depthSeen = -1, queue = [], turnsAt = 0;

	while (g.screen === 'play' && guard++ < GUARD) {

		const p = g.player;

		if (g.depth !== depthSeen) {

			if (depthSeen > 0) {
				stats.perLevel.push(g.turns - turnsAt);
			}

			turnsAt   = g.turns;
			depthSeen = g.depth;
			(stats.arrivals[g.depth] = stats.arrivals[g.depth] || []).push({
				level: p.level, hp: p.maxHp, power: g.playerPower(p), def: g.playerDef(p),
				fuel: Math.round(100 * p.fuel / p.maxFuel),
				oil: (g.inv.find(s => s.id === 'oil') || { count: 0 }).count,
				draught: (g.inv.find(s => s.id === 'draught') || { count: 0 }).count,
			});
			queue     = RUSH ? [] : g.map.rooms.map(r => ({ x: r.cx, y: r.cy }));

		}

		const oil     = g.inv.findIndex(s => s.id === 'oil');
		const draught = g.inv.findIndex(s => s.id === 'draught');
		const ember   = g.inv.findIndex(s => s.id === 'ember');

		if (oil >= 0 && p.fuel / p.maxFuel < 0.4) {
			g.act({ type: 'use', slot: oil }); continue;
		}

		if (draught >= 0 && p.hp / p.maxHp < 0.55) {
			g.act({ type: 'use', slot: draught }); continue;
		}

		const foes = g.entities.filter(e =>
			e.hp > 0 && Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= 1);

		if (foes.length) {

			const e = foes[0];

			if (ember >= 0 && (e.maxHp > 30 || foes.length > 2)) {
				g.act({ type: 'use', slot: ember });
			}

			else {
				g.act({ type: 'move', dx: Math.sign(e.x - p.x), dy: Math.sign(e.y - p.y) });
			}

			continue;

		}

		const loot = g.items.filter(it => g.seen[it.y * g.map.w + it.x] === 1 && wants(g, it));

		if (loot.length && step(g, loot[0])) {
			continue;
		}

		if (queue.length) {

			const target = queue[0];

			if ((Math.abs(target.x - p.x) <= 1 && Math.abs(target.y - p.y) <= 1) || !step(g, target)) {
				queue.shift();
			}

			continue;

		}

		const tile = g.tileAt(p.x, p.y);

		if (tile === T.STAIRS || tile === T.FLAME) {
			g.act({ type: 'descend' }); continue;
		}

		if (!step(g, g.map.stairs)) {
			g.act({ type: 'wait' });
		}

	}

	if (guard >= GUARD) {

		stats.stalls++;
		stats.stalled.push(`${seed}@${g.depth}`);

		if (process.env.DEBUG_STALL) {
			const p    = g.player, q = queue[0];
			const loot = g.items.filter(it => g.seen[it.y * g.map.w + it.x] === 1 && wants(g, it));

			console.error(seed, 'depth', g.depth, 'at', p.x, p.y, 'hp', p.hp, 'queue', queue.length, q,
				'loot', loot.slice(0, 2), 'stairs', g.map.stairs, 'tile', g.tileAt(p.x, p.y),
				'near', g.entities.filter(e => Math.abs(e.x - p.x) < 3 && Math.abs(e.y - p.y) < 3).map(e => [e.key, e.x, e.y, e.hp]));
		}

	}

	return g;

}

const RUNS   = Number(process.env.RUNS || 70);
const stats  = { perLevel: [], stalls: 0, stalled: [], arrivals: {} };
const depths = {}, causes = {};
let wins     = 0, dry = 0, kills = 0, turns = 0;
const levels = [];

for (let i = 0; i < RUNS; i++) {

	const g = play('bal' + i, stats);

	depths[g.depth] = (depths[g.depth] || 0) + 1;

	const cause = (g.deathCause || (g.screen === 'won' ? 'WON' : 'stalled'))
		.replace(/^slain by |^shot down by /, '');

	causes[cause] = (causes[cause] || 0) + 1;

	if (g.screen === 'won') {
		wins++;
	}

	if (g.player.fuel <= 0) {
		dry++;
	}

	levels.push(g.player.level);
	kills += g.kills;
	turns += g.turns;

}

const avg = a => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-');

console.log('ended on depth:', Object.entries(depths).sort((a, b) => a[0] - b[0])
	.map(([k, v]) => `${k}:${v}`).join(' '));

// how many runs were still alive at the end of each act of five floors

const reached = d => Object.entries(depths).reduce((n, [k, v]) => n + (Number(k) > d ? v : 0), 0);

console.log('cleared act:', [5, 10, 15].map((d, i) => `${'I'.repeat(i + 1)} ${reached(d)}`).join(' | '),
	'| IV', wins, 'of', RUNS);
console.log('wins', wins, '| dry', dry, '| stalls', stats.stalls,
	'| avg level', avg(levels), '| kills', kills, '| turns', turns);
console.log('turns/level', avg(stats.perLevel));

if (stats.stalled.length) {
	console.log('stalled (seed@floor):', stats.stalled.join(' '));
}

console.log('outcomes:', Object.entries(causes).sort((a, b) => b[1] - a[1])
	.map(([k, v]) => `${k} ${v}`).join(', '));

if (process.env.TABLE) {

	console.log('\nfloor  runs  level  maxhp  power  guard  fuel%  oil  draughts');

	for (const d of Object.keys(stats.arrivals).sort((a, b) => a - b)) {
		const rows = stats.arrivals[d];
		const mean = k => (rows.reduce((n, r) => n + r[k], 0) / rows.length).toFixed(1).padStart(6);

		console.log(String(d).padStart(5), String(rows.length).padStart(5),
			mean('level'), mean('hp'), mean('power'), mean('def'), mean('fuel'), mean('oil').padStart(5), mean('draught'));
	}

}
