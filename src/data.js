// The bestiary. depth is [first, last] floor the thing appears on.
export const MONSTERS = {
  rat:      { name: 'cave rat',          glyph: 'r', color: '#a98b6c', hp: 5,   power: 2,  def: 0, speed: 1.6, xp: 3,   depth: [1, 3], weight: 14 },
  slug:     { name: 'pallid slug',       glyph: 's', color: '#c9bcab', hp: 12,  power: 3,  def: 1, speed: 0.6, xp: 6,   depth: [1, 4], weight: 10 },
  goblin:   { name: 'goblin cutter',     glyph: 'g', color: '#86b05f', hp: 9,   power: 4,  def: 1, speed: 1,   xp: 7,   depth: [1, 5], weight: 13 },
  wick:     { name: 'wick-eater',        glyph: 'w', color: '#d9a2e4', hp: 7,   power: 2,  def: 0, speed: 1.3, xp: 9,   depth: [2, 7], weight: 11, erratic: 0.35, drain: 10 },
  skeleton: { name: 'cracked skeleton',  glyph: 'k', color: '#dde2ea', hp: 15,  power: 5,  def: 2, speed: 1,   xp: 12,  depth: [3, 7], weight: 11 },
  fletcher: { name: 'bone fletcher',     glyph: 'f', color: '#c9b08a', hp: 11,  power: 4,  def: 1, speed: 1,   xp: 14,  depth: [3, 8], weight: 9,  ranged: { range: 7, power: 4, name: 'bone dart' } },
  ghoul:    { name: 'ghoul',             glyph: 'G', color: '#8fae8f', hp: 19,  power: 7,  def: 2, speed: 1.4, xp: 18,  depth: [4, 8], weight: 9 },
  acolyte:  { name: 'dark acolyte',      glyph: 'a', color: '#9d8adb', hp: 16,  power: 4,  def: 2, speed: 1,   xp: 22,  depth: [5, 8], weight: 8,  ranged: { range: 8, power: 6, name: 'shadow bolt', drain: 7 } },
  ogre:     { name: 'sump ogre',         glyph: 'O', color: '#b2705a', hp: 36,  power: 11, def: 4, speed: 0.7, xp: 32,  depth: [5, 8], weight: 7 },
  shade:    { name: 'shade',             glyph: 'S', color: '#7d8bab', hp: 22,  power: 9,  def: 4, speed: 1.2, xp: 36,  depth: [6, 8], weight: 7,  lurker: true },
  snuffer:  { name: 'the Snuffer',       glyph: '&', color: '#e8574c', hp: 105, power: 12, def: 5, speed: 1,   xp: 250, depth: [8, 8], weight: 0,  boss: true, ranged: { range: 9, power: 7, name: 'cold gust', drain: 20 } },
};

export const CONSUMABLES = {
  oil:     { name: 'flask of oil',     glyph: '!', color: '#f0a93c', weight: 34, verb: 'pour' },
  draught: { name: 'healing draught',  glyph: '!', color: '#64c0a2', weight: 20, verb: 'drink' },
  ember:   { name: 'ember flask',      glyph: '*', color: '#ef6a3c', weight: 11, verb: 'hurl' },
  blink:   { name: 'blink scroll',     glyph: '?', color: '#9d8adb', weight: 9,  verb: 'read' },
};

export const WEAPONS = [
  { id: 'knife',  name: 'rusted knife',   bonus: 1, depth: 1 },
  { id: 'sword',  name: 'short sword',    bonus: 3, depth: 1 },
  { id: 'axe',    name: 'notched axe',    bonus: 5, depth: 3 },
  { id: 'hammer', name: 'warhammer',      bonus: 7, depth: 5 },
  { id: 'brand',  name: 'ashwood brand',  bonus: 10, depth: 7 },
];

export const ARMOUR = [
  { id: 'leather', name: 'boiled leather', bonus: 1, depth: 1 },
  { id: 'chain',   name: 'rusted chain',   bonus: 2, depth: 2 },
  { id: 'scale',   name: 'scalemail',      bonus: 4, depth: 4 },
  { id: 'plate',   name: 'warden plate',   bonus: 6, depth: 6 },
];

export const PARTS = [
  { id: 'pane',      name: 'clear glass pane',  light: 1,  depth: 2 },
  { id: 'reservoir', name: 'brass reservoir',   fuel: 50,  depth: 3 },
  { id: 'mirror',    name: 'silvered mirror',   light: 1,  depth: 5 },
  { id: 'bellows',   name: 'tiny bellows',      fuel: 70,  depth: 6 },
];

export const XP_STEPS = [0, 10, 24, 46, 78, 122, 180, 255, 350, 470, 620];

export function monsterFor(rng, depth) {
  const pool = [];
  for (const key in MONSTERS) {
    const m = MONSTERS[key];
    if (m.weight <= 0) continue;
    if (depth < m.depth[0] || depth > m.depth[1]) continue;
    // later floors lean on their nastier residents
    const bias = 1 + (depth - m.depth[0]) * 0.35;
    pool.push([key, m.weight * bias]);
  }
  if (!pool.length) pool.push(['rat', 1]);
  return rng.weighted(pool);
}

export function lootFor(rng, depth) {
  const pool = [];
  for (const key in CONSUMABLES) pool.push([{ type: 'use', id: key }, CONSUMABLES[key].weight]);
  const weapons = WEAPONS.filter(w => w.depth <= depth + 1);
  const armour = ARMOUR.filter(a => a.depth <= depth + 1);
  const parts = PARTS.filter(p => p.depth <= depth + 1);
  if (weapons.length) pool.push([{ type: 'weapon', id: rng.pick(weapons).id }, 10]);
  if (armour.length) pool.push([{ type: 'armour', id: rng.pick(armour).id }, 10]);
  if (parts.length) pool.push([{ type: 'part', id: rng.pick(parts).id }, 7]);
  return rng.weighted(pool);
}

export function itemLook(item) {
  if (item.type === 'use') return CONSUMABLES[item.id];
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

export const DEPTH_NAMES = [
  '', 'the Spill', 'the Cistern', 'Brackwater', 'the Ossuary',
  'the Sump', 'the Hollow Choir', 'Gloamgate', 'the Everflame',
];
