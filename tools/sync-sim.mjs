#!/usr/bin/env node
// Headless co-op harness: a host and a guest as two separate Game instances,
// with every payload forced through JSON exactly as the relay delivers it.
//
//   node tools/sync-sim.mjs
//   RUNS=3 node tools/sync-sim.mjs
//   BASE=/path/to/other/checkout node tools/sync-sim.mjs
//
// Co-op is host-authoritative: only the host simulates, and the guest renders
// what it is told. The thing that can quietly break is the guest falling out of
// step, so after every payload this compares a fingerprint of both sides and
// stops at the first divergence. It also checks the two derive the same field
// of view, since the guest computes sight locally rather than being sent it.
//
// Exits non-zero on drift, so it can gate a release.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || HERE;

const { Game } = await import(path.join(BASE, 'src/game.js'));
const { T } = await import(path.join(BASE, 'src/dungeon.js'));
const { flowField } = await import(path.join(BASE, 'src/path.js'));

const newFx = () => ({
	clear() {}, burst() {}, float() {}, tracer() {}, shakeBy() {}, flashBy() {}, update() {},
	parts: [], floats: [], tracers: [], shake: 0, flash: 0,
});
const sfx = { play() {}, ready() {

	return false;

}, setMuted() {} };
const ui = { refresh() {}, pushMessage() {}, setScreen() {}, renderInv() {}, redrawLog() {} };

// what the relay does to a payload: it becomes text and comes back as data
const overTheWire = payload => JSON.parse(JSON.stringify(payload));

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

function stepToward(g, p, goal, stopShort) {

	const field = flowField(g.map.w, g.map.h, goal.x, goal.y, (x, y) => g.walkable(x, y));
	const here  = field[p.y * g.map.w + p.x];

	if (here < 0) {
		return null;
	}

	let best = here, bx = p.x, by = p.y;

	for (const [dx, dy] of DIRS) {

		const nx = p.x + dx, ny = p.y + dy;

		if (nx < 0 || ny < 0 || nx >= g.map.w || ny >= g.map.h) {
			continue;
		}

		if (stopShort && nx === goal.x && ny === goal.y) {
			continue;
		}   // never tread on a partner

		const nd = field[ny * g.map.w + nx];

		if (nd >= 0 && nd < best) {
			best = nd; bx = nx; by = ny;
		}

	}

	return (bx === p.x && by === p.y) ? null : { dx: bx - p.x, dy: by - p.y };

}

// two people, not two copies of one: the leader explores, the other keeps station

function decide(g, p, leader) {

	const mate = g.players.find(q => q !== p && !q.dead);

	if (mate && mate.downed) {

		if (cheb(mate.x, mate.y, p.x, p.y) <= 1) {
			return { type: 'revive' };
		}

		const toMate = stepToward(g, p, mate, true);

		return toMate ? { type: 'move', ...toMate } : { type: 'wait' };

	}

	const oil     = p.inv.findIndex(s => s.id === 'oil');
	const draught = p.inv.findIndex(s => s.id === 'draught');

	if (oil >= 0 && p.fuel / p.maxFuel < 0.4) {
		return { type: 'use', slot: oil };
	}

	if (draught >= 0 && p.hp / p.maxHp < 0.5) {
		return { type: 'use', slot: draught };
	}

	const foes = g.entities.filter(e => e.hp > 0 && cheb(e.x, e.y, p.x, p.y) <= 1);

	if (foes.length) {
		return { type: 'move', dx: Math.sign(foes[0].x - p.x), dy: Math.sign(foes[0].y - p.y) };
	}

	if (p !== leader) {

		if (mate && cheb(mate.x, mate.y, p.x, p.y) > 1) {

			const toMate = stepToward(g, p, mate, true);

			if (toMate) {
				return { type: 'move', ...toMate };
			}

		}

		return { type: 'wait' };

	}

	if (g.tileAt(p.x, p.y) === T.STAIRS || g.tileAt(p.x, p.y) === T.FLAME) {
		return { type: 'descend' };
	}

	const onward = stepToward(g, p, g.map.stairs, false);

	return onward ? { type: 'move', ...onward } : { type: 'wait' };

}

// everything the two sides must agree on, in a form that diffs readably

function fingerprint(g) {

	return JSON.stringify({
		turns: g.turns, kills: g.kills, depth: g.depth, screen: g.screen, boss: g.bossAlive,
		players: g.players.map(p =>
			[p.slot, p.x, p.y, p.hp, p.fuel, p.xp, p.level, !!p.downed, !!p.dead, p.inv.length, p.weapon, p.armour]),
		entities: g.entities.map(e => [e.key, e.x, e.y, e.hp]),
		items: g.items.map(i => [i.x, i.y, i.type, i.id]),
	});

}

function run(seed, stats) {

	const host  = new Game(newFx(), sfx, ui);
	const guest = new Game(newFx(), sfx, ui);

	host.newRun(seed, { playerCount: 2, localIndex: 0 });

	const first = host.netLevel();

	stats.levels++;
	stats.levelBytes += JSON.stringify(first).length;
	guest.applyLevel(overTheWire(first), 1);

	let lastDepth = host.depth;
	let drift     = null;
	let guard     = 0;

	while (host.screen === 'play' && guard++ < 2600 && !drift) {

		const leader = host.active[0];

		for (const p of host.active.slice()) {

			if (host.screen !== 'play' || p.acted) {
				continue;
			}

			// slot 1 stands in for the remote player, whose action arrives as an intent

			const before = host.turns;
			let tries    = 0;

			while (!p.acted && host.turns === before && host.screen === 'play' && tries++ < 4) {
				host.act(decide(host, p, leader), p.slot);
			}

			if (!p.acted && host.screen === 'play') {
				host.act({ type: 'wait' }, p.slot);
			}

			const payload = host.depth !== lastDepth ? host.netLevel() : host.netTick();
			const bytes   = JSON.stringify(payload).length;

			if (payload.t === 'level') {
				lastDepth = host.depth;
				stats.levels++;
				stats.levelBytes += bytes;
				guest.applyLevel(overTheWire(payload), 1);
			}

			else {
				stats.ticks++;
				stats.tickBytes += bytes;
				stats.maxTick = Math.max(stats.maxTick, bytes);
				guest.applyTick(overTheWire(payload));
			}

			const a = fingerprint(host), b = fingerprint(guest);

			if (a !== b) {
				drift = { turn: host.turns, a, b }; break;
			}

		}

	}

	const sum = arr => arr.reduce((n, v) => n + v, 0);

	return {
		drift,
		depth: host.depth,
		turns: host.turns,
		screen: guard >= 2600 ? 'unfinished' : host.screen,
		visMatch: sum(host.vis) === sum(guest.vis),
		seenMatch: sum(host.seen) === sum(guest.seen),
		tilesMatch: host.map.tiles.every((v, i) => v === guest.map.tiles[i]),
	};

}

const RUNS   = Number(process.env.RUNS || 4);
const stats  = { levels: 0, ticks: 0, levelBytes: 0, tickBytes: 0, maxTick: 0 };
let failures = 0;

for (let i = 0; i < RUNS; i++) {

	const r        = run('sync-' + i, stats);
	const problems = [];

	if (r.drift) {
		problems.push('STATE DRIFT at turn ' + r.drift.turn);
	}

	if (!r.visMatch) {
		problems.push('field of view differs');
	}

	if (!r.seenMatch) {
		problems.push('explored map differs');
	}

	if (!r.tilesMatch) {
		problems.push('door state differs');
	}

	if (problems.length) {
		failures++;
	}

	console.log(`run ${i}  depth ${r.depth}  turns ${String(r.turns).padStart(4)}  ${r.screen.padEnd(10)} ` +
		(problems.length ? problems.join('; ') : 'in step'));

	if (r.drift) {

		const a = JSON.parse(r.drift.a), b = JSON.parse(r.drift.b);

		for (const key of Object.keys(a)) {

			if (JSON.stringify(a[key]) === JSON.stringify(b[key])) {
				continue;
			}

			console.log(`   ${key}\n     host  ${JSON.stringify(a[key]).slice(0, 200)}` +
				`\n     guest ${JSON.stringify(b[key]).slice(0, 200)}`);

		}

	}

}

console.log(`\n${stats.levels} level payloads, avg ${(stats.levelBytes / stats.levels / 1024).toFixed(1)} kB`);
console.log(`${stats.ticks} tick payloads, avg ${(stats.tickBytes / Math.max(1, stats.ticks)).toFixed(0)} B,` +
	` largest ${(stats.maxTick / 1024).toFixed(1)} kB`);
console.log(failures ? `\n${failures}/${RUNS} runs diverged` : `\nall ${RUNS} runs stayed in step`);

process.exit(failures ? 1 : 0);
