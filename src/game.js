import { RNG, hashSeed, randomSeedWord } from './rng.js';
import { generate, T, MAP_W, MAP_H, blocksMove, blocksSight } from './dungeon.js';
import { computeFOV, hasLine } from './fov.js';
import { flowField, chebyshev, DX, DY } from './path.js';
import {
	MONSTERS, CONSUMABLES, WEAPONS, ARMOUR, PARTS, XP_STEPS,
	monsterFor, lootFor, itemLook, DEPTH_NAMES,
} from './data.js';

const LOS_RANGE   = 16;
const FINAL_DEPTH = 8;
const SAVE_KEY    = 'lanternfall.run.v1';
const BEST_KEY    = 'lanternfall.best.v1';
const BLEED_TURNS = 15;

// Two lantern-bearers, told apart by their cloaks.

export const PLAYER_SKINS = [
	{ cloak: '#8c4636', dark: '#4b231b', name: 'Ash' },
	{ cloak: '#3f6b7a', dark: '#1f3a44', name: 'Wren' },
];

export class Game {

	constructor(fx, sfx, ui) {

		this.fx         = fx;
		this.sfx        = sfx;
		this.ui         = ui;
		this.screen     = 'title';
		this.map        = null;
		this.rng        = new RNG(1);
		this.messages   = [];
		this.players    = [];
		this.localIndex = 0;
		this.tileEdits  = [];      // tiles changed since the last snapshot was sent
		this.outbox     = [];         // log lines the peer has not seen yet

	}

	// The local player. Everything that used to say `this.player` still works,
	// and in a solo run there is exactly one.
	get player() {

		return this.players[this.localIndex] || this.players[0];

	}

	get inv() {

		return this.player ? this.player.inv : [];

	}

	get coop() {

		return this.players.length > 1;

	}

	// players who can still take a turn
	get active() {

		return this.players.filter(p => !p.dead && !p.downed && !p.absent);

	}

	get standing() {

		return this.players.filter(p => !p.dead && !p.absent);

	}

	nameOf(p) {

		return this.coop ? p.name : 'You';

	}

	verb(p, youForm, theyForm) {

		return this.coop ? `${p.name} ${theyForm}` : `You ${youForm}`;

	}

	// ---------------------------------------------------------------- run setup

	makePlayer(slot) {

		const skin = PLAYER_SKINS[slot % PLAYER_SKINS.length];

		return {
			isPlayer: true, slot, name: skin.name, cloak: skin.cloak, cloakDark: skin.dark,
			x: 0, y: 0, ax: 0, ay: 0,
			hp: 28, maxHp: 28, basePower: 5, baseDef: 1,
			level: 1, xp: 0,
			fuel: 120, maxFuel: 120, lightBonus: 0,
			weapon: 'knife', armour: null, parts: [],
			inv: [{ type: 'use', id: 'oil', count: 1 }, { type: 'use', id: 'draught', count: 1 }],
			downed: false, bleed: 0, dead: false, acted: false,
			glyph: '@', color: '#ffdfa0', lunge: 0, lungeDir: [0, 0],
		};

	}

	newRun(seedText, { playerCount = 1, localIndex = 0 } = {}) {

		const text = (seedText || '').trim() || randomSeedWord();

		this.seedText = text;
		this.rng      = new RNG(hashSeed(text));
		this.depth    = 0;
		this.turns    = 0;
		this.kills    = 0;
		this.messages = [];
		this.players  = [];

		for (let i = 0; i < Math.max(1, playerCount); i++) {
			this.players.push(this.makePlayer(i));
		}

		this.localIndex = Math.min(localIndex, this.players.length - 1);

		if (this.coop) {
			this.log(`${this.players.map(p => p.name).join(' and ')} step off the last lit stair.`, 'warm');
			this.log('Two lanterns, one stairwell. Every step burns oil for both of you.', 'dim');
		}

		else {
			this.log('You step off the last lit stair with a knife and a full lantern.', 'warm');
			this.log('Every step burns oil. Oil is light. Light is how long you live.', 'dim');
		}

		this.nextLevel();
		this.screen = 'play';
		this.save();
		return this;

	}

	nextLevel() {

		this.depth += 1;
		this.map = generate(this.rng, this.depth);

		const cells = this.map.w * this.map.h;

		this.vis         = new Uint8Array(cells);
		this.seen        = new Uint8Array(cells);
		this.dist        = new Float32Array(cells);
		this.distBy      = this.players.map(() => new Float32Array(cells));
		this.entities    = [];
		this.items       = [];
		this.bossAlive   = false;
		this.stairHinted = false;

		// everyone arrives together, fanned out around the up-stair

		const start = this.map.start;

		this.players.forEach((p, i) => {

			let spot = { x: start.x, y: start.y };

			if (i > 0) {
				spot = this.freeNear(start.x, start.y) || spot;
			}

			p.x     = spot.x; p.y = spot.y;
			p.ax    = p.x; p.ay = p.y;
			p.acted = false;

		});

		this.populate();
		this.recomputeFOV();
		this.fx.clear();

		const name = DEPTH_NAMES[Math.min(this.depth, DEPTH_NAMES.length - 1)] || 'the deep dark';

		this.log(`Depth ${this.depth} — ${name}.`, 'big');

		if (this.depth === FINAL_DEPTH) {
			this.log('Something vast exhales down here, and the cold comes with it.', 'bad');
		}

	}

	populate() {

		const rng      = this.rng;
		const map      = this.map;
		const rooms    = map.rooms.slice(1);
		const freeSpot = room => {

			for (let k = 0; k < 50; k++) {

				const x = rng.range(room.x, room.x + room.w - 1);
				const y = rng.range(room.y, room.y + room.h - 1);
				const t = map.tiles[y * map.w + x];

				if (t !== T.FLOOR && t !== T.RUBBLE) {
					continue;
				}

				if (this.entityAt(x, y)) {
					continue;
				}

				if (this.items.some(it => it.x === x && it.y === y)) {
					continue;
				}

				if (this.players.some(p => chebyshev(x, y, p.x, p.y) < 5)) {
					continue;
				}

				return { x, y };

			}

			return null;

		};

		if (map.isFinal) {
			const spot = { x: map.stairs.x, y: map.stairs.y };
			// the Snuffer stands over the dead Everflame
			const near = this.freeNear(spot.x, spot.y) || { x: spot.x + 1, y: spot.y };

			this.spawn('snuffer', near.x, near.y);
			this.bossAlive = true;
		}

		// a second lantern means a second sword, so the floor pushes back harder

		const party        = this.players.length;
		const monsterCount = Math.round((3 + this.depth * 1.5) * (1 + (party - 1) * 0.6));

		for (let i = 0; i < monsterCount; i++) {

			const room = rng.pick(rooms.length ? rooms : map.rooms);
			const spot = freeSpot(room);

			if (spot) {
				this.spawn(monsterFor(rng, this.depth), spot.x, spot.y);
			}

		}

		// guaranteed oil so a run is never dead on arrival, then the rest at random

		const drops = [];

		for (let i = 0; i < 2 * party; i++) {
			drops.push({ type: 'use', id: 'oil' });
		}

		if (this.depth >= 3) {

			for (let i = 0; i < party; i++) {
				drops.push({ type: 'use', id: 'oil' });
			}

		}

		const extra = (2 + rng.int(3) + (this.depth > 2 ? 1 : 0)) * party;

		for (let i = 0; i < extra; i++) {
			drops.push(lootFor(rng, this.depth));
		}

		for (const drop of drops) {

			const room = rng.pick(rooms.length ? rooms : map.rooms);
			const spot = freeSpot(room);

			if (spot) {
				this.items.push({ x: spot.x, y: spot.y, ...drop });
			}

		}

	}

	spawn(key, x, y) {

		const def      = MONSTERS[key];
		const steps    = def.boss ? 0 : Math.max(0, this.depth - def.depth[0]);
		const hpScale  = 1 + steps * 0.08;
		const powScale = 1 + steps * 0.05;
		const e        = {
			key, x, y, ax: x, ay: y,
			hp: Math.round(def.hp * hpScale), maxHp: Math.round(def.hp * hpScale),
			power: Math.round(def.power * powScale), def: def.def,
			speed: def.speed, energy: rng01(this.rng),
			awake: false, target: 0, lunge: 0, lungeDir: [0, 0], summonCd: 5,
		};

		this.entities.push(e);
		return e;

	}

	freeNear(x, y) {

		for (let r = 1; r <= 4; r++) {

			const ring = [];

			for (let dy = -r; dy <= r; dy++) {

				for (let dx = -r; dx <= r; dx++) {

					if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) {
						continue;
					}

					ring.push([x + dx, y + dy]);

				}

			}

			this.rng.shuffle(ring);

			for (const [nx, ny] of ring) {

				if (!this.walkable(nx, ny) || this.entityAt(nx, ny)) {
					continue;
				}

				if (this.playerAt(nx, ny)) {
					continue;
				}

				return { x: nx, y: ny };

			}

		}

		return null;

	}

	// ---------------------------------------------------------------- queries

	def(e) {

		return MONSTERS[e.key];

	}

	tileAt(x, y) {

		if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) {
			return T.ROCK;
		}

		return this.map.tiles[y * this.map.w + x];

	}

	walkable(x, y) {

		const t = this.tileAt(x, y);

		return !blocksMove(t) || t === T.DOOR;

	}

	entityAt(x, y) {

		if (!this.entities) {
			return null;
		}

		for (const e of this.entities) {

			if (e.hp > 0 && e.x === x && e.y === y) {
				return e;
			}

		}

		return null;

	}

	playerAt(x, y) {

		for (const p of this.players) {

			if (!p.dead && p.x === x && p.y === y) {
				return p;
			}

		}

		return null;

	}

	playerPower(p = this.player) {

		return p.basePower + (p.weapon ? WEAPONS.find(w => w.id === p.weapon).bonus : 0);

	}

	playerDef(p = this.player) {

		return p.baseDef + (p.armour ? ARMOUR.find(a => a.id === p.armour).bonus : 0);

	}

	lightRadius(p = this.player) {

		const ratio = Math.max(0, p.fuel) / p.maxFuel;
		const r     = 1.4 + 6.6 * Math.pow(ratio, 0.55) + p.lightBonus;

		return Math.max(1, Math.min(12, Math.round(r)));

	}

	lightAt(x, y) {

		if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) {
			return 0;
		}

		return this.map.light[y * this.map.w + x];

	}

	isVisible(x, y) {

		if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) {
			return false;
		}

		return this.vis[y * this.map.w + x] === 1;

	}

	// a shade is only picked out in real light, or when it is already on top of someone
	canSeeEntity(e) {

		if (!this.isVisible(e.x, e.y)) {
			return false;
		}

		if (this.def(e).lurker) {
			return this.lightAt(e.x, e.y) > 0.28 ||
				this.standing.some(p => chebyshev(e.x, e.y, p.x, p.y) <= 1);
		}

		return true;

	}

	// Sight is shared: you see whatever either lantern reaches. `dist` holds the
	// distance to the nearest bearer, `distBy[slot]` the distance to each, which
	// the renderer needs to shade a tile by the brighter of the two lamps.
	recomputeFOV() {

		const map = this.map;

		this.vis.fill(0);
		this.dist.fill(999);

		const blocked = (x, y) =>
			(x < 0 || y < 0 || x >= map.w || y >= map.h) ? true : blocksSight(map.tiles[y * map.w + x]);

		this.players.forEach((p, slot) => {

			const own = this.distBy[slot];

			own.fill(999);

			if (p.dead) {
				return;
			}

			const radius = this.lightRadius(p);

			computeFOV(p.x, p.y, LOS_RANGE, blocked, (x, y, d) => {

				if (x < 0 || y < 0 || x >= map.w || y >= map.h) {
					return;
				}

				const i = y * map.w + x;

				if (d < own[i]) {
					own[i] = d;
				}

				if (d < this.dist[i]) {
					this.dist[i] = d;
				}
				// you see what a lantern reaches, plus whatever stands in its own light

				if (d <= radius + 0.5 || map.light[i] > 0.12 || d <= 1.5) {
					this.vis[i]  = 1;
					this.seen[i] = 1;
				}

			});

		});

	}

	// ---------------------------------------------------------------- turns

	// `slot` says who is acting; it defaults to the local player so solo play and
	// the headless harness can keep calling act({...}) with one argument.
	act(action, slot = this.localIndex) {

		if (this.screen !== 'play') {
			return;
		}

		const p = this.players[slot];

		if (!p || p.dead) {
			return;
		}

		if (p.downed && action.type !== 'wait') {
			this.log(`${this.nameOf(p)} cannot move, only bleed.`, 'bad');
			return;
		}

		if (this.coop && p.acted) {
			return;
		}        // already committed this round

		let spent = false;

		switch (action.type) {

			case 'move': {

				spent = this.tryMove(p, action.dx, action.dy);
				break;

			}

			case 'wait': {

				spent = true;
				this.log(`${this.verb(p, 'shield the flame and listen.', 'shields the flame.')}`, 'dim');
				break;

			}

			case 'descend': {

				spent = this.descend(p);
				break;

			}

			case 'use': {

				spent = this.useSlot(p, action.slot);
				break;

			}

			case 'revive': {

				spent = this.revive(p);
				break;

			}

			default: {

				break;

			}

		}

		if (!spent || this.screen !== 'play') {
			this.ui.refresh(this); return;
		}

		p.acted = true;
		// the world moves once everyone still on their feet has committed

		if (this.active.every(q => q.acted)) {
			this.endTurn();
		}

		this.ui.refresh(this);

	}

	waitingFor() {

		if (!this.coop || this.screen !== 'play') {
			return null;
		}

		return this.active.filter(p => !p.acted);

	}

	tryMove(p, dx, dy) {

		const nx  = p.x + dx, ny = p.y + dy;
		const foe = this.entityAt(nx, ny);

		if (foe) {
			this.strike(p, foe); return true;
		}

		const mate = this.playerAt(nx, ny);

		if (mate && mate !== p) {

			if (mate.downed) {
				return this.revive(p);
			}
			// swap places rather than deadlock in a one-tile corridor

			mate.x  = p.x; mate.y = p.y;
			mate.ax = p.ax; mate.ay = p.ay;
			p.x     = nx; p.y = ny;
			this.sfx.play('step');
			this.log(`${p.name} and ${mate.name} squeeze past each other.`, 'dim');
			return true;

		}

		const t = this.tileAt(nx, ny);

		if (t === T.DOOR) {
			this.setTile(nx, ny, T.OPEN);
			this.sfx.play('door');
			this.log('The door gives with a wet crack.', 'dim');
			return true;
		}

		if (blocksMove(t)) {

			if (t === T.BRAZIER) {
				this.log('A brazier burns there. Warm, but in the way.', 'dim');
			}

			this.sfx.play('bump');
			return false;

		}

		p.x = nx; p.y = ny;
		this.sfx.play('step');
		this.fx.burst(nx + 0.5, ny + 0.75, '90,98,116', 2, { speed: 1.2, life: 0.25, gravity: -0.6, size: 1.4 });
		this.collect(p, nx, ny);

		if (t === T.STAIRS && !this.stairHinted) {
			this.stairHinted = true;
			this.log('Stairs drop away into the dark. Press > to take them.', 'warm');
		}

		if (t === T.FLAME) {
			this.touchEverflame(p);
		}

		return true;

	}

	strike(attacker, target) {

		const isPlayer = !!attacker.isPlayer;
		const power    = isPlayer ? this.playerPower(attacker) : attacker.power;
		const guard    = target.isPlayer ? this.playerDef(target) : target.def;
		const crit     = this.rng.chance(isPlayer ? 0.12 : 0.07);
		let dmg        = Math.max(1, power + this.rng.range(0, 2) - guard);

		if (crit) {
			dmg = Math.round(dmg * 1.9);
		}

		attacker.lunge    = 1;
		attacker.lungeDir = [Math.sign(target.x - attacker.x), Math.sign(target.y - attacker.y)];
		target.hp -= dmg;

		const cx     = target.x + 0.5, cy = target.y + 0.5;
		const colour = target.isPlayer ? '224,90,69' : '200,60,50';

		this.fx.burst(cx, cy, colour, crit ? 16 : 9, { speed: crit ? 7 : 4.6, size: crit ? 3 : 2.3 });
		this.fx.float(cx, cy - 0.3, String(dmg), crit ? '#ffdfa0' : (target.isPlayer ? '#e05a45' : '#eae2d1'), { big: crit });
		this.fx.shakeBy(crit ? 9 : 3.4 + dmg * 0.3);
		this.sfx.play(crit ? 'crit' : 'hit', Math.min(2, dmg / 6));

		if (target.isPlayer) {

			this.fx.flashBy(0.2 + dmg * 0.022);
			this.sfx.play('hurt');

			const name = this.def(attacker).name;

			this.log(this.coop
				? `The ${name} ${crit ? 'tears into' : 'hits'} ${target.name} for ${dmg}.`
				: `The ${name} ${crit ? 'tears into you' : 'hits you'} for ${dmg}.`, 'bad');

			const drain = this.def(attacker).drain;

			if (drain) {
				this.drainFuel(target, drain, this.def(attacker).name);
			}

			if (target.hp <= 0) {
				this.fell(target, `slain by ${indefinite(name)}`);
			}

		}

		else {

			const name = this.def(target).name;

			if (crit) {
				this.log(`${this.verb(attacker, `strike the ${name} clean through`, `strikes the ${name} clean through`)} — ${dmg}.`, 'warm');
			}

			else {
				this.log(`${this.verb(attacker, `hit the ${name}`, `hits the ${name}`)} for ${dmg}.`);
			}

			if (target.hp <= 0) {
				this.slay(target, attacker);
			}

		}

	}

	slay(e, killer) {

		const def = this.def(e);

		this.kills += 1;
		this.fx.burst(e.x + 0.5, e.y + 0.5, '200,60,50', 20, { speed: 6.5, size: 3 });
		this.fx.burst(e.x + 0.5, e.y + 0.5, hexToRgb(def.color), 12, { speed: 4, size: 2.4 });
		this.fx.shakeBy(def.boss ? 14 : 4);
		this.sfx.play('kill');
		this.log(`The ${def.name} goes down.`, 'good');

		if (def.boss) {
			this.bossAlive = false;
			this.fx.flashBy(0.5, '240,169,60');
			this.log('The Snuffer comes apart like a blown-out candle. The cold lifts.', 'big');
			this.log('Behind it, the Everflame guts glow faint. Step onto it.', 'warm');
		}
		// the dying sometimes leave something useful

		if (this.rng.chance(def.boss ? 1 : 0.22)) {
			const drop = def.boss ? { type: 'weapon', id: 'brand' } : lootFor(this.rng, this.depth);

			this.items.push({ x: e.x, y: e.y, ...drop });
		}
		// everyone who is still standing learns from it, so neither falls behind

		for (const p of this.standing) {
			this.gainXp(p, def.xp);
		}

		this.entities = this.entities.filter(o => o !== e);

	}

	gainXp(p, amount) {

		p.xp += amount;

		while (p.level < XP_STEPS.length - 1 && p.xp >= XP_STEPS[p.level]) {

			p.level += 1;
			p.maxHp += 5;
			p.hp = Math.min(p.maxHp, p.hp + 7);

			if (p.level % 2 === 1) {
				p.basePower += 1;
			}

			else {
				p.baseDef += 1;
			}

			this.sfx.play('level');
			this.fx.float(p.x + 0.5, p.y - 0.8, 'LEVEL ' + p.level, '#ffdfa0', { big: true });
			this.fx.burst(p.x + 0.5, p.y + 0.5, '240,169,60', 24, { speed: 5, gravity: -1.2, life: 0.8 });
			this.log(`Something in the dark gives way to ${this.coop ? p.name : 'you'}. Level ${p.level}.`, 'big');

		}

	}

	drainFuel(p, amount, by) {

		const before = p.fuel;

		p.fuel = Math.max(0, p.fuel - amount);

		const lost = before - p.fuel;

		if (lost <= 0) {
			return;
		}

		this.sfx.play('drain');
		this.fx.float(p.x + 0.5, p.y - 0.6, '-' + lost + ' oil', '#f0a93c');
		this.fx.flashBy(0.16, '240,169,60');
		this.log(`The ${by} drinks ${this.coop ? p.name + '’s' : 'the'} light — ${lost} oil gone.`, 'warm');

	}

	burnOil(p) {

		const before = p.fuel;

		p.fuel = Math.max(0, p.fuel - 1);

		const ratio    = p.fuel / p.maxFuel;
		const wasRatio = before / p.maxFuel;

		for (const mark of [0.5, 0.25, 0.1]) {

			if (wasRatio > mark && ratio <= mark) {
				this.sfx.play('warn');

				const whose = this.coop ? `${p.name}’s lantern` : 'The lantern';

				this.log(mark === 0.1
					? (this.coop
						? `${p.name}’s wick is guttering.`
						: 'The wick is guttering. The dark is a hand’s width away.')
					: `${whose} dims — ${Math.round(mark * 100)}% oil left.`, mark === 0.1 ? 'bad' : 'warm');
			}

		}

		if (before > 0 && p.fuel === 0) {
			this.log(this.coop
				? `${p.name}’s flame dies.`
				: 'The flame dies. You can see your own hands and nothing else.', 'bad');
			this.fx.flashBy(0.4, '8,10,16');
		}

	}

	endTurn() {

		this.turns += 1;

		for (const p of this.active) {
			this.burnOil(p);
		}

		// the downed bleed out unless someone reaches them

		for (const p of this.players) {

			if (!p.downed || p.dead) {
				continue;
			}

			p.bleed -= 1;

			if (p.bleed <= 0) {
				p.dead   = true;
				p.downed = false;
				this.log(`${p.name} stops moving. The dark has them.`, 'big');
				this.fx.burst(p.x + 0.5, p.y + 0.5, '240,169,60', 30, { speed: 4, gravity: 1.2, life: 1 });
			}

			else if (p.bleed % 5 === 0) {
				this.log(`${p.name} is bleeding out — ${p.bleed} turns.`, 'bad');
			}

		}

		this.monstersAct();
		this.recomputeFOV();

		for (const p of this.players) {
			p.acted = false;
		}

		if (this.screen === 'play' && !this.standing.length) {
			this.endRun('the dark took everyone');
		}

		if (this.screen === 'play') {
			this.save();
		}

	}

	monstersAct() {

		const map = this.map;
		// one chase field per bearer, so a monster can pick whom it is hunting
		const fields = this.players.map(p =>
			(p.dead ? null : flowField(map.w, map.h, p.x, p.y, (x, y) => this.walkable(x, y))));
		const order = this.entities.slice();

		for (const e of order) {

			if (e.hp <= 0) {
				continue;
			}

			e.energy += e.speed;

			let guard = 0;

			while (e.energy >= 1 && guard++ < 3) {

				e.energy -= 1;

				if (this.screen !== 'play' || e.hp <= 0) {
					break;
				}

				this.monsterStep(e, fields);

			}

		}

	}

	// the nearest bearer still on their feet, preferring the one already hunted
	pickTarget(e) {

		const live = this.standing;

		if (!live.length) {
			return null;
		}

		let best = null, bestD = Infinity;

		for (const p of live) {

			let d = chebyshev(e.x, e.y, p.x, p.y);

			if (p.slot === e.target) {
				d -= 1.5;
			}      // stickiness, so they do not dither

			if (p.downed) {
				d += 6;
			}                   // the standing are the louder threat

			if (d < bestD) {
				bestD = d; best = p;
			}

		}

		e.target = best.slot;
		return best;

	}

	monsterStep(e, fields) {

		const def = this.def(e);
		const p   = this.pickTarget(e);

		if (!p) {
			return;
		}

		const d = chebyshev(e.x, e.y, p.x, p.y);

		if (!e.awake) {

			if (this.isVisible(e.x, e.y) || d <= 3) {

				e.awake = true;

				if (this.canSeeEntity(e) && d <= 7) {
					this.log(`${capital(indefinite(def.name))} notices ${this.coop ? p.name + '’s' : 'your'} light.`, 'dim');
				}

			}

			else {
				return;
			}

		}

		if (def.boss) {

			e.summonCd -= 1;

			const brood = this.entities.filter(o => o.key === 'wick' && o.hp > 0).length;

			if (e.summonCd <= 0 && brood < 3) {

				e.summonCd = 6;

				const spot = this.freeNear(e.x, e.y);

				if (spot) {
					this.spawn('wick', spot.x, spot.y).awake = true;
					this.fx.burst(spot.x + 0.5, spot.y + 0.5, '217,162,228', 14, { speed: 4, gravity: -0.8 });
					this.log('The Snuffer coughs out another wick-eater.', 'magic');
				}

			}

		}

		if (d <= 1) {
			this.strike(e, p); return;
		}

		const map          = this.map;
		const sightBlocked = (x, y) => blocksSight(this.tileAt(x, y));

		if (def.ranged && d <= def.ranged.range && hasLine(e.x, e.y, p.x, p.y, sightBlocked) && this.rng.chance(0.55)) {

			const r        = def.ranged;
			const guardVal = this.playerDef(p);
			const dmg      = Math.max(1, r.power + this.rng.range(0, 2) - guardVal);

			this.fx.tracer(e.x + 0.5, e.y + 0.5, p.x + 0.5, p.y + 0.5, def.color);
			this.fx.burst(p.x + 0.5, p.y + 0.5, '224,90,69', 8, { speed: 4 });
			this.fx.float(p.x + 0.5, p.y - 0.3, String(dmg), '#e05a45');
			this.fx.shakeBy(4);
			this.fx.flashBy(0.18 + dmg * 0.02);
			this.sfx.play('bolt');
			this.sfx.play('hurt');
			p.hp -= dmg;
			this.log(`${capital(indefinite(def.name))} looses ${indefinite(r.name)} at ${this.coop ? p.name : 'you'} — ${dmg}.`, 'bad');

			if (r.drain) {
				this.drainFuel(p, r.drain, r.name);
			}

			if (p.hp <= 0) {
				this.fell(p, `shot down by ${indefinite(def.name)}`);
			}

			return;

		}

		// erratic fliers wander off course

		if (def.erratic && this.rng.chance(def.erratic)) {
			const k = this.rng.int(8);

			this.moveMonster(e, e.x + DX[k], e.y + DY[k]);
			return;
		}

		const field = fields[p.slot];

		if (!field) {
			return;
		}

		const here = field[e.y * map.w + e.x];

		if (here < 0 || here > 26) {

			if (this.rng.chance(0.4)) {
				const k = this.rng.int(8);

				this.moveMonster(e, e.x + DX[k], e.y + DY[k]);
			}

			return;

		}

		let best   = here, bx = e.x, by = e.y;
		const dirs = this.rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]);

		for (const k of dirs) {

			const nx = e.x + DX[k], ny = e.y + DY[k];

			if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) {
				continue;
			}

			const nd = field[ny * map.w + nx];

			if (nd < 0 || nd >= best) {
				continue;
			}

			if (this.entityAt(nx, ny)) {
				continue;
			}

			best = nd; bx = nx; by = ny;

		}

		if (bx !== e.x || by !== e.y) {
			this.moveMonster(e, bx, by);
		}

	}

	moveMonster(e, nx, ny) {

		if (nx < 0 || ny < 0 || nx >= this.map.w || ny >= this.map.h) {
			return;
		}

		const victim = this.playerAt(nx, ny);

		if (victim) {
			this.strike(e, victim); return;
		}

		const t = this.tileAt(nx, ny);

		if (t === T.DOOR) {

			this.setTile(nx, ny, T.OPEN);

			if (this.isVisible(nx, ny)) {
				this.sfx.play('door');
				this.log('A door swings open somewhere ahead.', 'dim');
			}

			return;

		}

		if (blocksMove(t) || this.entityAt(nx, ny)) {
			return;
		}

		e.x = nx; e.y = ny;

	}

	// ---------------------------------------------------------------- going down

	fell(p, cause) {

		if (p.dead || p.downed) {
			return;
		}

		p.hp = 0;
		// someone left standing means a rescue is possible

		const rescuer = this.standing.some(q => q !== p);

		if (!rescuer) {
			p.dead = true;
			this.endRun(cause, p);
			return;
		}

		p.downed = true;
		p.bleed  = BLEED_TURNS;
		this.sfx.play('death');
		this.fx.shakeBy(10);
		this.fx.flashBy(0.45, '224,90,69');
		this.fx.burst(p.x + 0.5, p.y + 0.5, '224,90,69', 26, { speed: 4, gravity: 1.2, life: 1 });
		this.log(`${p.name} goes down — ${cause}. ${BLEED_TURNS} turns to reach them.`, 'big');

	}

	revive(p) {

		const fallen = this.players.find(q =>
			q.downed && !q.dead && chebyshev(q.x, q.y, p.x, p.y) <= 1);

		if (!fallen) {
			this.log('Nobody within reach to lift.', 'dim'); return false;
		}

		fallen.downed = false;
		fallen.bleed  = 0;
		fallen.hp     = Math.max(1, Math.round(fallen.maxHp * 0.3));
		this.sfx.play('level');
		this.fx.burst(fallen.x + 0.5, fallen.y + 0.5, '100,192,162', 26, { speed: 4, gravity: -1.2, life: 0.9 });
		this.fx.float(fallen.x + 0.5, fallen.y - 0.6, 'up', '#64c0a2', { big: true });
		this.log(`${p.name} drags ${fallen.name} back onto their feet.`, 'good');
		return true;

	}

	descend(p) {

		const t = this.tileAt(p.x, p.y);

		if (t === T.FLAME) {
			return this.touchEverflame(p);
		}

		if (t !== T.STAIRS) {
			this.log('No way down here.', 'dim'); return false;
		}

		const fallen = this.standing.filter(q => q.downed);

		if (fallen.length) {
			const who = fallen.map(q => q.name).join(' and ');

			this.log(`Nobody goes down while ${who} ${fallen.length > 1 ? 'are' : 'is'} bleeding on the stones.`, 'bad');
			return false;
		}
		// only one of you can stand on the stair itself, so the rest gather beside it

		const stragglers = this.standing.filter(q => q !== p && chebyshev(q.x, q.y, p.x, p.y) > 1);

		if (stragglers.length) {
			this.log(`Waiting for ${stragglers.map(q => q.name).join(' and ')} to reach the stairs.`, 'warm');
			return false;
		}

		this.sfx.play('descend');
		this.fx.shakeBy(7);
		this.log(this.coop
			? 'You climb down together, lanterns swinging.'
			: 'You climb down, one hand on the lantern.', 'warm');
		this.nextLevel();
		return true;

	}

	touchEverflame(p) {

		if (this.bossAlive) {
			this.log('The Snuffer’s cold smothers the Everflame. It will not take while that thing breathes.', 'bad');
			return false;
		}

		this.screen = 'won';
		this.sfx.play('win');
		this.fx.flashBy(0.65, '255,223,160');
		this.fx.burst(p.x + 0.5, p.y + 0.5, '255,223,160', 60, { speed: 7, gravity: -1.6, life: 1.4, size: 3.4 });
		this.log(this.coop
			? `${p.name} tips a lantern into the Everflame. It catches, and keeps.`
			: 'You tip your lantern into the Everflame. It catches, and keeps.', 'big');
		this.recordBest();
		this.clearSave();
		return true;

	}

	endRun(cause, p = this.player) {

		if (this.screen !== 'play') {
			return;
		}

		this.screen     = 'dead';
		this.deathCause = cause;

		for (const q of this.players) {
			q.dead = true; q.downed = false;
		}

		this.sfx.play('death');
		this.fx.shakeBy(14);
		this.fx.flashBy(0.6, '224,90,69');
		this.fx.burst(p.x + 0.5, p.y + 0.5, '240,169,60', 40, { speed: 5, gravity: 1.4, life: 1.1 });
		this.log(this.coop
			? `Both lanterns are out. (${cause})`
			: `You fall, and the lantern rolls away. (${cause})`, 'big');
		this.recordBest();
		this.clearSave();

	}

	// kept so older callers (the abandon button, the harness) still work
	die(cause) {

		this.endRun(cause);

	}

	// ---------------------------------------------------------------- items

	collect(p, x, y) {

		const idx = this.items.findIndex(it => it.x === x && it.y === y);

		if (idx === -1) {
			return;
		}

		const item = this.items[idx];
		const look = itemLook(item);

		// gear no better than yours stays on the floor, and says so once per person

		if (item.type === 'weapon' || item.type === 'armour') {

			const table   = item.type === 'weapon' ? WEAPONS : ARMOUR;
			const slotKey = item.type === 'weapon' ? 'weapon' : 'armour';
			const found   = table.find(g => g.id === item.id);
			const held    = p[slotKey] ? table.find(g => g.id === p[slotKey]) : null;

			if (held && found.bonus <= held.bonus) {

				item.declinedBy = item.declinedBy || [];

				if (!item.declinedBy.includes(p.slot)) {
					item.declinedBy.push(p.slot);
					this.log(capital(indefinite(found.name)) + ` — no better than ${this.coop ? p.name + '’s' : 'yours'}. Stepped over.`, 'dim');
				}

				return;

			}

		}

		this.items.splice(idx, 1);
		this.sfx.play('pickup');
		this.fx.burst(x + 0.5, y + 0.5, hexToRgb(look.color), 12, { speed: 3.2, gravity: -1, life: 0.55 });

		if (item.type === 'use') {

			const slot = p.inv.find(s => s.type === 'use' && s.id === item.id);

			if (slot) {
				slot.count += 1;
			}

			else {
				p.inv.push({ type: 'use', id: item.id, count: 1 });
			}

			this.log(`${this.verb(p, `pocket ${indefinite(look.name)}`, `pockets ${indefinite(look.name)}`)}.`, 'good');
			return;

		}

		if (item.type === 'part') {

			const part = PARTS.find(q => q.id === item.id);

			if (p.parts.includes(part.id)) {
				this.log(`Another ${part.name}. Left where it lay.`, 'dim');
				this.items.push({ x, y, ...item });
				return;
			}

			p.parts.push(part.id);

			if (part.light) {
				p.lightBonus += part.light;
				this.log(`${this.verb(p, `fit the ${part.name}`, `fits the ${part.name}`)}. The lantern throws further.`, 'good');
			}

			if (part.fuel) {
				p.maxFuel += part.fuel;
				p.fuel += part.fuel;
				this.log(`${this.verb(p, `fit the ${part.name}`, `fits the ${part.name}`)}. It holds ${part.fuel} more oil.`, 'good');
			}

			this.fx.float(x + 0.5, y - 0.4, 'lantern improved', '#64c0a2');
			return;

		}

		const table   = item.type === 'weapon' ? WEAPONS : ARMOUR;
		const slotKey = item.type === 'weapon' ? 'weapon' : 'armour';
		const found   = table.find(g => g.id === item.id);
		const current = p[slotKey] ? table.find(g => g.id === p[slotKey]) : null;

		p[slotKey] = found.id;
		this.log(current
			? `${this.verb(p, `take up the ${found.name}`, `takes up the ${found.name}`)} and leave the ${current.name}.`
			: `${this.verb(p, `take up the ${found.name}`, `takes up the ${found.name}`)}.`, 'good');
		this.fx.float(x + 0.5, y - 0.4, '+' + found.bonus + (item.type === 'weapon' ? ' strike' : ' guard'), '#ffdfa0');

	}

	useSlot(p, i) {

		const slot = p.inv[i];

		if (!slot) {
			return false;
		}

		if (slot.id === 'oil') {

			if (p.fuel >= p.maxFuel - 1) {
				this.log('The reservoir is already brim-full.', 'dim'); return false;
			}

			const gain = Math.min(50, p.maxFuel - p.fuel);

			p.fuel += gain;
			this.sfx.play('oil');
			this.fx.float(p.x + 0.5, p.y - 0.5, '+' + gain + ' oil', '#f0a93c');
			this.fx.burst(p.x + 0.5, p.y + 0.5, '240,169,60', 22, { speed: 4, gravity: -1.4, life: 0.8 });
			this.log(`${this.verb(p, 'feed the lantern', 'feeds a lantern')}. The circle of light opens out.`, 'warm');

		}

		else if (slot.id === 'draught') {

			if (p.hp >= p.maxHp) {
				this.log('Nothing in you needs mending yet.', 'dim'); return false;
			}

			const gain = Math.min(p.maxHp - p.hp, 10 + this.depth * 2);

			p.hp += gain;
			this.sfx.play('quaff');
			this.fx.float(p.x + 0.5, p.y - 0.5, '+' + gain, '#64c0a2');
			this.fx.burst(p.x + 0.5, p.y + 0.5, '100,192,162', 18, { speed: 3, gravity: -1.2, life: 0.7 });
			this.log(`${this.verb(p, 'drink', 'drinks')}. Warmth, and ${gain} health back.`, 'good');

		}

		else if (slot.id === 'ember') {

			const targets = this.entities
				.filter(e => e.hp > 0 && this.isVisible(e.x, e.y))
				.sort((a, b) => chebyshev(a.x, a.y, p.x, p.y) - chebyshev(b.x, b.y, p.x, p.y));

			if (!targets.length) {
				this.log('Nothing in the light to throw it at.', 'dim'); return false;
			}

			const target = targets[0];
			const dmg    = 12 + this.depth * 2;

			this.sfx.play('ember');
			this.fx.tracer(p.x + 0.5, p.y + 0.5, target.x + 0.5, target.y + 0.5, '#ef6a3c');
			this.fx.shakeBy(8);
			this.fx.flashBy(0.22, '239,106,60');

			const splash = this.entities.filter(e => e.hp > 0 && chebyshev(e.x, e.y, target.x, target.y) <= 1);

			this.log(`The ember flask bursts over the ${this.def(target).name}.`, 'warm');

			for (const e of splash) {

				const hit = e === target ? dmg : Math.round(dmg * 0.5);

				this.fx.burst(e.x + 0.5, e.y + 0.5, '239,106,60', 20, { speed: 6, size: 3, life: 0.6 });
				this.fx.float(e.x + 0.5, e.y - 0.3, String(hit), '#ef6a3c');
				e.hp -= hit;

				if (e.hp <= 0) {
					this.slay(e, p);
				}

			}

		}

		else if (slot.id === 'blink') {

			const rooms = this.map.rooms;
			let spot    = null;

			for (let k = 0; k < 60 && !spot; k++) {

				const room = this.rng.pick(rooms);
				const x    = this.rng.range(room.x, room.x + room.w - 1);
				const y    = this.rng.range(room.y, room.y + room.h - 1);

				if (this.walkable(x, y) && !this.entityAt(x, y) && !this.playerAt(x, y)
					&& this.tileAt(x, y) !== T.DOOR) {
					spot = { x, y };
				}

			}

			if (!spot) {
				this.log('The scroll crumbles to nothing.', 'dim'); return false;
			}

			this.sfx.play('blink');
			this.fx.burst(p.x + 0.5, p.y + 0.5, '157,138,219', 22, { speed: 5, gravity: -0.4, life: 0.6 });
			p.x = spot.x; p.y = spot.y; p.ax = spot.x; p.ay = spot.y;
			this.fx.burst(p.x + 0.5, p.y + 0.5, '157,138,219', 22, { speed: 5, gravity: -0.4, life: 0.6 });
			this.log(`Stone goes thin, and ${this.coop ? p.name + ' is' : 'you are'} somewhere else.`, 'magic');

			for (const e of this.entities) {
				e.awake = false;
			}

		}

		slot.count -= 1;

		if (slot.count <= 0) {
			p.inv.splice(i, 1);
		}

		return true;

	}

	// ---------------------------------------------------------------- log, save

	log(text, cls = '') {

		const entry = { text, cls, turn: this.turns };

		this.messages.push(entry);

		if (this.messages.length > 120) {
			this.messages.shift();
		}

		this.outbox.push(entry);

		if (this.outbox.length > 60) {
			this.outbox.shift();
		}

		if (this.ui) {
			this.ui.pushMessage(entry);
		}

	}

	// every tile change is recorded so a tick can carry the delta, not the map
	setTile(x, y, v) {

		const i = y * this.map.w + x;

		this.map.tiles[i] = v;
		this.tileEdits.push(i, v);

	}

	recordBest() {

		try {
			const prev = JSON.parse(localStorage.getItem(BEST_KEY) || 'null') || { depth: 0, kills: 0, won: false };
			const next = {
				depth: Math.max(prev.depth || 0, this.depth),
				kills: Math.max(prev.kills || 0, this.kills),
				won: prev.won || this.screen === 'won',
			};

			localStorage.setItem(BEST_KEY, JSON.stringify(next));
		}

		catch (e) { /* private window; nothing to keep */ }

	}

	static best() {

		try {
			return JSON.parse(localStorage.getItem(BEST_KEY) || 'null');
		}

		catch (e) {
			return null;
		}

	}

	serialize() {

		return {
			v: 2, seedText: this.seedText, rng: this.rng.state, depth: this.depth,
			turns: this.turns, kills: this.kills,
			players: this.players, localIndex: this.localIndex,
			entities: this.entities, items: this.items,
			bossAlive: this.bossAlive, stairHinted: this.stairHinted,
			messages: this.messages.slice(-40),
			map: {
				w: this.map.w, h: this.map.h, depth: this.map.depth, isFinal: this.map.isFinal,
				tiles: Array.from(this.map.tiles),
				light: Array.from(this.map.light, v => Math.round(v * 100) / 100),
				rooms: this.map.rooms, start: this.map.start, stairs: this.map.stairs,
				braziers: this.map.braziers,
			},
			seen: Array.from(this.seen),
		};

	}

	restore(data) {

		if (!data) {
			return false;
		}

		if (data.v === 1) {
			// a save from before co-op: one player, inventory held on the game
			const p = data.player;

			p.slot      = 0;
			p.name      = PLAYER_SKINS[0].name;
			p.cloak     = PLAYER_SKINS[0].cloak;
			p.cloakDark = PLAYER_SKINS[0].dark;
			p.inv       = data.inv || [];
			p.downed    = false; p.bleed = 0; p.dead = false; p.acted = false;
			data        = { ...data, v: 2, players: [p], localIndex: 0 };
		}

		if (data.v !== 2) {
			return false;
		}

		this.seedText    = data.seedText;
		this.rng         = new RNG(1);
		this.rng.state   = data.rng;
		this.depth       = data.depth;
		this.turns       = data.turns;
		this.kills       = data.kills;
		this.players     = data.players;
		this.localIndex  = Math.min(data.localIndex || 0, this.players.length - 1);
		this.entities    = data.entities;
		this.items       = data.items;
		this.bossAlive   = data.bossAlive;
		this.stairHinted = data.stairHinted;
		this.messages    = data.messages || [];
		this.map         = {
			w: data.map.w, h: data.map.h, depth: data.map.depth, isFinal: data.map.isFinal,
			tiles: Int8Array.from(data.map.tiles), light: Float32Array.from(data.map.light),
			rooms: data.map.rooms, roomId: null, start: data.map.start,
			stairs: data.map.stairs, braziers: data.map.braziers,
		};

		const cells = this.map.w * this.map.h;

		this.vis    = new Uint8Array(cells);
		this.dist   = new Float32Array(cells);
		this.distBy = this.players.map(() => new Float32Array(cells));
		this.seen   = Uint8Array.from(data.seen);

		for (const p of this.players) {
			p.ax = p.x; p.ay = p.y;
		}

		for (const e of this.entities) {
			e.ax = e.x; e.ay = e.y;
		}

		this.screen = 'play';
		this.fx.clear();
		this.recomputeFOV();
		return true;

	}

	// ---------------------------------------------------------------- co-op sync

	mapPayload() {

		return {
			w: this.map.w, h: this.map.h, depth: this.map.depth, isFinal: this.map.isFinal,
			tiles: Array.from(this.map.tiles),
			light: Array.from(this.map.light, v => Math.round(v * 100) / 100),
			rooms: this.map.rooms, start: this.map.start, stairs: this.map.stairs,
			braziers: this.map.braziers,
		};

	}

	// the whole floor: sent when a guest joins and on every descent
	netLevel() {

		this.tileEdits = [];
		this.outbox    = [];
		return {
			t: 'level',
			seedText: this.seedText, depth: this.depth, turns: this.turns, kills: this.kills,
			screen: this.screen, bossAlive: this.bossAlive, stairHinted: this.stairHinted,
			players: this.players, entities: this.entities, items: this.items,
			messages: this.messages.slice(-30),
			map: this.mapPayload(),
		};

	}

	// the mutable part only; the map travels as a handful of tile edits
	netTick() {

		const tick = {
			t: 'tick',
			turns: this.turns, kills: this.kills, screen: this.screen,
			deathCause: this.deathCause, bossAlive: this.bossAlive, stairHinted: this.stairHinted,
			players: this.players, entities: this.entities, items: this.items,
			tiles: this.tileEdits, messages: this.outbox,
		};

		this.tileEdits = [];
		this.outbox    = [];
		return tick;

	}

	applyLevel(d, localIndex) {

		this.seedText    = d.seedText;
		this.depth       = d.depth;
		this.turns       = d.turns;
		this.kills       = d.kills;
		this.screen      = d.screen;
		this.bossAlive   = d.bossAlive;
		this.stairHinted = d.stairHinted;
		this.players     = d.players;
		this.localIndex  = Math.min(localIndex, this.players.length - 1);
		this.entities    = d.entities;
		this.items       = d.items;
		this.messages    = d.messages || [];
		this.map         = {
			w: d.map.w, h: d.map.h, depth: d.map.depth, isFinal: d.map.isFinal,
			tiles: Int8Array.from(d.map.tiles), light: Float32Array.from(d.map.light),
			rooms: d.map.rooms, roomId: null, start: d.map.start,
			stairs: d.map.stairs, braziers: d.map.braziers,
		};

		const cells = this.map.w * this.map.h;

		this.vis    = new Uint8Array(cells);
		this.dist   = new Float32Array(cells);
		this.distBy = this.players.map(() => new Float32Array(cells));
		this.seen   = new Uint8Array(cells);

		for (const p of this.players) {
			p.ax = p.x; p.ay = p.y;
		}

		for (const e of this.entities) {
			e.ax = e.x; e.ay = e.y;
		}

		this.fx.clear();
		this.recomputeFOV();

	}

	applyTick(d) {

		// keep the tween origins so movement still animates instead of snapping
		const was  = new Map(this.players.map(p => [p.slot, { ax: p.ax, ay: p.ay }]));
		const wasE = new Map(this.entities.map((e, i) => [i, { ax: e.ax, ay: e.ay }]));

		this.turns       = d.turns;
		this.kills       = d.kills;
		this.screen      = d.screen;
		this.deathCause  = d.deathCause;
		this.bossAlive   = d.bossAlive;
		this.stairHinted = d.stairHinted;
		this.players     = d.players;
		this.entities    = d.entities;
		this.items       = d.items;

		for (let i = 0; i < (d.tiles || []).length; i += 2) {
			this.map.tiles[d.tiles[i]] = d.tiles[i + 1];
		}

		for (const p of this.players) {
			const prev = was.get(p.slot);

			p.ax = prev ? prev.ax : p.x;
			p.ay = prev ? prev.ay : p.y;
		}

		this.entities.forEach((e, i) => {

			const prev = wasE.get(i);

			e.ax = prev ? prev.ax : e.x;
			e.ay = prev ? prev.ay : e.y;

		});

		if (this.distBy.length !== this.players.length) {
			const cells = this.map.w * this.map.h;

			this.distBy = this.players.map(() => new Float32Array(cells));
		}

		for (const m of d.messages || []) {

			this.messages.push(m);

			if (this.messages.length > 120) {
				this.messages.shift();
			}

			if (this.ui) {
				this.ui.pushMessage(m);
			}

		}

		this.recomputeFOV();

	}

	save() {

		if (this.coop) {
			return;
		}          // co-op runs live on the host, not in storage

		try {
			localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
		}

		catch (e) { /* storage unavailable or full; the run simply will not resume */ }

	}

	clearSave() {

		try {
			localStorage.removeItem(SAVE_KEY);
		}

		catch (e) { /* nothing to clear */ }

	}

	static loadSave() {

		try {
			const raw = localStorage.getItem(SAVE_KEY);

			return raw ? JSON.parse(raw) : null;
		}

		catch (e) {
			return null;
		}

	}

}

function rng01(rng) {

	return rng.next() * 0.9;

}

function hexToRgb(hex) {

	const n = parseInt(hex.slice(1), 16);

	return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;

}

function indefinite(word) {

	return (/^[aeiou]/i.test(word) ? 'an ' : 'a ') + word;

}

function capital(s) {

	return s.charAt(0).toUpperCase() + s.slice(1);

}

export { FINAL_DEPTH };
