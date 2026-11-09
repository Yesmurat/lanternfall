// Seeded random, so a run can be replayed from its seed.
export class RNG {

	constructor(seed) {

		this.s = (seed >>> 0) || 0x9e3779b9;

	}

	get state() {

		return this.s;

	}

	set state(v) {

		this.s = v >>> 0;

	}

	next() {

		this.s = (this.s + 0x6d2b79f5) >>> 0;

		let t = this.s;

		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;

	}

	int(n) {

		return Math.floor(this.next() * n);

	}

	range(a, b) {

		return a + this.int(b - a + 1);

	}

	chance(p) {

		return this.next() < p;

	}

	pick(arr) {

		return arr[this.int(arr.length)];

	}

	float(a, b) {

		return a + this.next() * (b - a);

	}

	shuffle(arr) {

		for (let i = arr.length - 1; i > 0; i--) {
			const j = this.int(i + 1);

			const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
		}

		return arr;

	}

	// entries: [[value, weight], ...]
	weighted(entries) {

		let total = 0;

		for (const e of entries) {
			total += e[1];
		}

		let r = this.next() * total;

		for (const e of entries) {

			r -= e[1];

			if (r <= 0) {
				return e[0];
			}

		}

		return entries[entries.length - 1][0];

	}

}

export function hashSeed(text) {

	let h   = 0x811c9dc5;
	const s = String(text);

	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}

	return h >>> 0;

}

const SYL = ['ash', 'mor', 'vel', 'kith', 'dun', 'bram', 'orn', 'sel', 'thor', 'wick', 'gloam', 'rue', 'hal', 'fen'];

export function randomSeedWord() {

	let out = '';

	for (let i = 0; i < 2; i++) {
		out += SYL[Math.floor(Math.random() * SYL.length)];
	}

	return out + String(100 + Math.floor(Math.random() * 900));

}
