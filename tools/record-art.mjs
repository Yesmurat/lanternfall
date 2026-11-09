// Records the canvas calls the game makes when drawing each creature, so the
// same art can be replayed into a raster backend. Keeps one source of truth:
// the art lives in src/creatures.js and src/render.js, never duplicated here.

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { drawCreature } from '../src/creatures.js';
import { Renderer } from '../src/render.js';
import { MONSTERS } from '../src/data.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PROPS = [
	'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin',
	'globalAlpha', 'globalCompositeOperation', 'font', 'textAlign',
	'textBaseline', 'shadowColor', 'shadowBlur', 'miterLimit',
];

function recorder() {

	const ops     = [];
	const state   = { globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1 };
	let gradients = 0;

	const makeGradient = kind => (...args) => {

		const id = 'grad' + (gradients++);

		ops.push({ op: 'gradient', kind, id, args });
		return {
			__grad: id,
			addColorStop: (offset, color) => ops.push({ op: 'stop', id, offset, color }),
		};

	};

	const ctx = new Proxy({}, {
		get(_, key) {

			if (key === 'createLinearGradient') {
				return makeGradient('linear');
			}

			if (key === 'createRadialGradient') {
				return makeGradient('radial');
			}

			if (key === 'measureText') {
				return () => ({ width: 0 });
			}

			if (key === 'canvas') {
				return { width: 0, height: 0 };
			}

			if (PROPS.includes(key)) {
				return state[key];
			}

			return (...args) => {

				ops.push({ op: key, args });

			};

		},
		set(_, key, value) {

			state[key] = value;
			ops.push({ op: 'set', prop: key, value: value && value.__grad ? { grad: value.__grad } : value });
			return true;

		},
	});

	return { ctx, ops };

}

const TILE = 160;            // draw big; the raster step crops to fit
const CX   = TILE * 2.2, CY = TILE * 2.0;

const sheet = { tile: TILE, cx: CX, cy: CY, figures: {} };

// the line under each name on the bestiary sheet

function note(m) {

	if (m.boss) {
		return 'the eighth depth';
	}

	const traits = [];

	if (m.ranged) {
		traits.push('strikes at range');
	}

	if (m.drain) {
		traits.push('drinks your oil');
	}

	if (m.lurker) {
		traits.push('unseen in the dark');
	}

	if (m.erratic) {
		traits.push('erratic');
	}

	if (m.speed >= 1.3) {
		traits.push('quick');
	}

	else if (m.speed <= 0.8) {
		traits.push('slow');
	}

	const [lo, hi] = m.depth;
	const where = lo === hi ? `depth ${lo}` : `depths ${lo}\u2013${hi}`;

	return traits.length ? `${where} \u00b7 ${traits.slice(0, 2).join(', ')}` : where;

}

for (const key of Object.keys(MONSTERS)) {
	const { ctx, ops } = recorder();

	drawCreature(ctx, key, CX, CY, TILE, {
		phase: 0.7, facing: 1, moving: false, color: MONSTERS[key].color,
	});
	sheet.figures[key] = { label: MONSTERS[key].name, note: note(MONSTERS[key]), ops };
}

// the player, who lives in the renderer rather than the bestiary

{
	const { ctx, ops } = recorder();
	const r = new Renderer({ getContext: () => ctx, getBoundingClientRect: () => ({ width: 0, height: 0 }) });

	r.heroFacing = 1;
	r.heroPhase  = 0.7;

	const lamp = r.lampAt(CX, CY, TILE, 0);

	r.drawHero(CX, CY, TILE, 0, true, lamp);
	sheet.figures.hero = { label: 'the lantern-bearer', note: 'you, and the only light', ops };
}

await mkdir(path.join(root, 'tools'), { recursive: true });
await writeFile(path.join(root, 'tools', 'art-ops.json'), JSON.stringify(sheet), 'utf8');

const vocab = {};

for (const fig of Object.values(sheet.figures)) {

	for (const o of fig.ops) {
		vocab[o.op === 'set' ? 'set:' + o.prop : o.op] = (vocab[o.op === 'set' ? 'set:' + o.prop : o.op] || 0) + 1;
	}

}

console.log('figures recorded:', Object.keys(sheet.figures).length);
console.log('total ops       :', Object.values(sheet.figures).reduce((n, f) => n + f.ops.length, 0));
console.log('vocabulary      :');

for (const [k, v] of Object.entries(vocab).sort((a, b) => b[1] - a[1])) {
	console.log('   ', k.padEnd(28), v);
}
