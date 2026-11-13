// How deep the stair goes. The Everflame is on the last floor.
export const FINAL_DEPTH = 20;

// The bestiary. depth is [first, last] floor the thing appears on.
//
// A boss has weight 0, so it never turns up by chance: BOSS_AT puts it beside the
// stairs of its own floor. `drop` is what it always leaves, `summon` what it calls.
export const MONSTERS = {
	rat:      { name: 'cave rat',          glyph: 'r', color: '#a98b6c', hp: 5,   power: 2,  def: 0,  speed: 1.6, xp: 3,   depth: [1, 4],   weight: 14 },
	slug:     { name: 'pallid slug',       glyph: 's', color: '#c9bcab', hp: 12,  power: 3,  def: 1,  speed: 0.6, xp: 6,   depth: [1, 5],   weight: 10 },
	goblin:   { name: 'goblin cutter',     glyph: 'g', color: '#86b05f', hp: 9,   power: 4,  def: 1,  speed: 1,   xp: 7,   depth: [1, 6],   weight: 13 },
	wick:     { name: 'wick-eater',        glyph: 'w', color: '#d9a2e4', hp: 7,   power: 2,  def: 0,  speed: 1.3, xp: 9,   depth: [2, 9],   weight: 11, erratic: 0.35, drain: 10 },
	skeleton: { name: 'cracked skeleton',  glyph: 'k', color: '#dde2ea', hp: 15,  power: 5,  def: 2,  speed: 1,   xp: 12,  depth: [3, 9],   weight: 11 },
	fletcher: { name: 'bone fletcher',     glyph: 'f', color: '#c9b08a', hp: 11,  power: 4,  def: 1,  speed: 1,   xp: 14,  depth: [4, 10],  weight: 9,  ranged: { range: 7, power: 4, name: 'bone dart' } },
	ghoul:    { name: 'ghoul',             glyph: 'G', color: '#8fae8f', hp: 19,  power: 7,  def: 2,  speed: 1.4, xp: 18,  depth: [5, 11],  weight: 9 },
	acolyte:  { name: 'dark acolyte',      glyph: 'a', color: '#9d8adb', hp: 16,  power: 4,  def: 2,  speed: 1,   xp: 22,  depth: [7, 12],  weight: 8,  ranged: { range: 8, power: 6, name: 'shadow bolt', drain: 7 } },
	ogre:     { name: 'sump ogre',         glyph: 'O', color: '#b2705a', hp: 36,  power: 11, def: 4,  speed: 0.7, xp: 32,  depth: [8, 13],  weight: 7 },
	shade:    { name: 'shade',             glyph: 'S', color: '#7d8bab', hp: 22,  power: 9,  def: 4,  speed: 1.2, xp: 36,  depth: [9, 14],  weight: 7,  lurker: true },
	moth:     { name: 'lamp moth',         glyph: 'm', color: '#e6c98a', hp: 16,  power: 8,  def: 3,  speed: 1.7, xp: 34,  depth: [9, 15],  weight: 9,  erratic: 0.4, drain: 14 },
	hound:    { name: 'ash hound',         glyph: 'h', color: '#8d8782', hp: 26,  power: 12, def: 5,  speed: 1.6, xp: 46,  depth: [10, 17], weight: 9 },
	tender:   { name: 'drowned tender',    glyph: 't', color: '#6f9a9c', hp: 50,  power: 15, def: 7,  speed: 0.8, xp: 56,  depth: [11, 18], weight: 8 },
	husk:     { name: 'choir husk',        glyph: 'c', color: '#c9a9c4', hp: 30,  power: 9, def: 6,  speed: 1,   xp: 62,  depth: [13, 20], weight: 6,  ranged: { range: 8, power: 10, name: 'keening note', drain: 9 } },
	wight:    { name: 'cinder wight',      glyph: 'W', color: '#d9783f', hp: 48,  power: 17, def: 8,  speed: 1.1, xp: 76,  depth: [14, 20], weight: 8 },
	stalker:  { name: 'gloam stalker',     glyph: 'X', color: '#5f6f9a', hp: 44,  power: 19, def: 9, speed: 1.3, xp: 88,  depth: [16, 20], weight: 7,  lurker: true },

	warden:   { name: 'the Bone Warden',   glyph: 'K', color: '#e9e4d2', hp: 54,  power: 9,  def: 3,  speed: 0.9, xp: 70,  depth: [5, 5],   weight: 0,  boss: true, drop: { type: 'weapon', id: 'hammer' } },
	hollow:   { name: 'the Hollow Tender', glyph: 'T', color: '#7fb3b0', hp: 110, power: 16, def: 6,  speed: 0.9, xp: 160, depth: [10, 10], weight: 0,  boss: true, drop: { type: 'armour', id: 'mail' }, ranged: { range: 7, power: 9, name: 'pale lamp-beam', drain: 12 } },
	vigil:    { name: 'the Tallow King',   glyph: 'V', color: '#d8c9a0', hp: 150, power: 20, def: 9,  speed: 1,   xp: 300, depth: [15, 15], weight: 0,  boss: true, drop: { type: 'weapon', id: 'spear' }, summon: { key: 'moth', max: 2, every: 8, line: 'The Tallow King shakes a lamp moth out of its wax.' } },
	snuffer:  { name: 'the Snuffer',       glyph: '&', color: '#e8574c', hp: 220, power: 26, def: 12, speed: 1,   xp: 500, depth: [20, 20], weight: 0,  boss: true, final: true, drop: { type: 'weapon', id: 'brand' }, ranged: { range: 9, power: 14, name: 'cold gust', drain: 20 }, summon: { key: 'wick', max: 3, every: 6, line: 'The Snuffer coughs out another wick-eater.' } },
};

// Which boss waits by the stairs of which floor.
export const BOSS_AT = { 5: 'warden', 10: 'hollow', 15: 'vigil', 20: 'snuffer' };

export const CONSUMABLES = {
	oil:     { name: 'flask of oil',     glyph: '!', color: '#f0a93c', weight: 34, verb: 'pour' },
	draught: { name: 'healing draught',  glyph: '!', color: '#64c0a2', weight: 20, verb: 'drink' },
	ember:   { name: 'ember flask',      glyph: '*', color: '#ef6a3c', weight: 11, verb: 'hurl' },
	blink:   { name: 'blink scroll',     glyph: '?', color: '#9d8adb', weight: 9,  verb: 'read' },
};

export const WEAPONS = [
	{ id: 'knife',  name: 'rusted knife',     bonus: 1,  depth: 1 },
	{ id: 'sword',  name: 'short sword',      bonus: 3,  depth: 1 },
	{ id: 'axe',    name: 'notched axe',      bonus: 5,  depth: 3 },
	{ id: 'hammer', name: 'warhammer',        bonus: 7,  depth: 6 },
	{ id: 'glaive', name: 'tender’s glaive',  bonus: 10, depth: 9 },
	{ id: 'blade',  name: 'choir blade',      bonus: 13, depth: 12 },
	{ id: 'spear',  name: 'vigil spear',      bonus: 16, depth: 16 },
	{ id: 'brand',  name: 'ashwood brand',    bonus: 20, depth: 18 },
];

export const ARMOUR = [
	{ id: 'leather', name: 'boiled leather',    bonus: 1,  depth: 1 },
	{ id: 'chain',   name: 'rusted chain',      bonus: 2,  depth: 2 },
	{ id: 'scale',   name: 'scalemail',         bonus: 4,  depth: 5 },
	{ id: 'plate',   name: 'warden plate',      bonus: 6,  depth: 8 },
	{ id: 'mail',    name: 'tender’s mail',     bonus: 8,  depth: 11 },
	{ id: 'vigil',   name: 'vigil plate',       bonus: 10, depth: 14 },
	{ id: 'harness', name: 'keeper’s harness',  bonus: 12, depth: 17 },
];

export const PARTS = [
	{ id: 'pane',      name: 'clear glass pane',  light: 1,  depth: 2 },
	{ id: 'reservoir', name: 'brass reservoir',   fuel: 50,  depth: 3 },
	{ id: 'mirror',    name: 'silvered mirror',   light: 1,  depth: 6 },
	{ id: 'bellows',   name: 'tiny bellows',      fuel: 70,  depth: 8 },
	{ id: 'wick',      name: 'braided wick',      fuel: 60,  depth: 11 },
	{ id: 'lens',      name: 'ground lens',       light: 1,  depth: 13 },
	{ id: 'tank',      name: 'copper tank',       fuel: 80,  depth: 16 },
];

export const XP_STEPS = [
	0, 10, 24, 46, 78, 122, 180, 255, 350, 470, 620,
	800, 1100, 1500, 2000, 2600, 3300, 4200, 5300, 6600, 8100,
];

export function monsterFor(rng, depth) {

	const pool = [];

	for (const key in MONSTERS) {

		const m = MONSTERS[key];

		if (m.weight <= 0) {
			continue;
		}

		if (depth < m.depth[0] || depth > m.depth[1]) {
			continue;
		}
		// later floors lean on their nastier residents

		const bias = 1 + (depth - m.depth[0]) * 0.35;

		pool.push([key, m.weight * bias]);

	}

	if (!pool.length) {
		pool.push(['rat', 1]);
	}

	return rng.weighted(pool);

}

export function lootFor(rng, depth) {

	const pool = [];

	for (const key in CONSUMABLES) {
		pool.push([{ type: 'use', id: key }, CONSUMABLES[key].weight]);
	}

	const weapons = WEAPONS.filter(w => w.depth <= depth + 1);
	const armour  = ARMOUR.filter(a => a.depth <= depth + 1);
	const parts   = PARTS.filter(p => p.depth <= depth + 1);

	if (weapons.length) {
		pool.push([{ type: 'weapon', id: rng.pick(weapons).id }, 10]);
	}

	if (armour.length) {
		pool.push([{ type: 'armour', id: rng.pick(armour).id }, 10]);
	}

	if (parts.length) {
		pool.push([{ type: 'part', id: rng.pick(parts).id }, 7]);
	}

	return rng.weighted(pool);

}

export function itemLook(item) {

	// words cut into the stone: read where they stand, never carried
	if (item.type === 'inscription') {
		return { name: 'inscription', glyph: '¶', color: item.read ? '#8a8474' : '#ffdfa0' };
	}

	if (item.type === 'use') {
		return CONSUMABLES[item.id];
	}

	if (item.type === 'weapon') {
		const w = WEAPONS.find(x => x.id === item.id);

		return { name: w.name, glyph: '/', color: '#cfd6e4' };
	}

	if (item.type === 'armour') {
		const a = ARMOUR.find(x => x.id === item.id);

		return { name: a.name, glyph: '[', color: '#cfd6e4' };
	}

	const p = PARTS.find(x => x.id === item.id);

	return { name: p.name, glyph: '=', color: '#64c0a2' };

}

// One name per floor, in four acts of five.
export const DEPTH_NAMES = [
	'',
	'the Spill', 'the Cistern', 'Brackwater', 'the Rope Market', 'the Ossuary',
	'Lampwrights’ Row', 'the Oil Presses', 'the Wick Lofts', 'the Schoolroom Stair', 'the Tenders’ Hall',
	'the Sump', 'the Drowned Stacks', 'the Hollow Choir', 'the Ash Galleries', 'the Vigil',
	'Gloamgate', 'the Cold Stair', 'the Keeper’s Walk', 'the Threshold', 'the Everflame',
];
