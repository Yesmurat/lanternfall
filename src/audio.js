// Every sound is synthesised at runtime; the game ships no audio files.
export class Sfx {

	constructor() {

		this.ctx    = null;
		this.master = null;
		this.muted  = false;
		this.noise  = null;

	}

	ready() {

		if (this.ctx) {

			if (this.ctx.state === 'suspended') {
				this.ctx.resume();
			}

			return true;

		}

		const Ctor = window.AudioContext || window.webkitAudioContext;

		if (!Ctor) {
			return false;
		}

		try {

			this.ctx               = new Ctor();
			this.master            = this.ctx.createGain();
			this.master.gain.value = 0.3;
			this.master.connect(this.ctx.destination);

			const len = Math.floor(this.ctx.sampleRate * 0.5);

			this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);

			const data = this.noise.getChannelData(0);

			for (let i = 0; i < len; i++) {
				data[i] = Math.random() * 2 - 1;
			}

			return true;

		}

		catch (e) {
			this.ctx = null; return false;
		}

	}

	setMuted(m) {

		this.muted = m;

		if (this.master) {
			this.master.gain.value = m ? 0 : 0.3;
		}

	}

	tone(freq, { type = 'sine', dur = 0.14, gain = 0.3, to = null, delay = 0, curve = 'exp' } = {}) {

		if (!this.ctx || this.muted) {
			return;
		}

		const t   = this.ctx.currentTime + delay;
		const osc = this.ctx.createOscillator();
		const g   = this.ctx.createGain();

		osc.type = type;
		osc.frequency.setValueAtTime(Math.max(20, freq), t);

		if (to) {

			if (curve === 'exp') {
				osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
			}

			else {
				osc.frequency.linearRampToValueAtTime(Math.max(20, to), t + dur);
			}

		}

		g.gain.setValueAtTime(0.0001, t);
		g.gain.linearRampToValueAtTime(gain, t + Math.min(0.015, dur * 0.3));
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		osc.connect(g).connect(this.master);
		osc.start(t);
		osc.stop(t + dur + 0.02);

	}

	hiss({ dur = 0.12, gain = 0.25, freq = 1400, q = 0.9, type = 'bandpass', to = null, delay = 0 } = {}) {

		if (!this.ctx || this.muted || !this.noise) {
			return;
		}

		const t   = this.ctx.currentTime + delay;
		const src = this.ctx.createBufferSource();

		src.buffer             = this.noise;
		src.playbackRate.value = 1;

		const f = this.ctx.createBiquadFilter();

		f.type = type;
		f.frequency.setValueAtTime(freq, t);

		if (to) {
			f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
		}

		f.Q.value = q;

		const g = this.ctx.createGain();

		g.gain.setValueAtTime(gain, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		src.connect(f).connect(g).connect(this.master);
		src.start(t);
		src.stop(t + dur + 0.02);

	}

	play(name, intensity = 1) {

		if (!this.ctx || this.muted) {
			return;
		}

		switch (name) {

			case 'step': {

				this.hiss({ dur: 0.05, gain: 0.05, freq: 520, q: 1.6 });
				break;

			}

			case 'bump': {

				this.tone(90, { type: 'triangle', dur: 0.08, gain: 0.12 });
				break;

			}

			case 'hit': {

				this.hiss({ dur: 0.09, gain: 0.2 + 0.08 * intensity, freq: 1800, to: 300, q: 0.7 });
				this.tone(190, { type: 'square', dur: 0.1, gain: 0.14, to: 70 });
				break;

			}

			case 'crit': {

				this.hiss({ dur: 0.16, gain: 0.3, freq: 3200, to: 260, q: 0.5 });
				this.tone(320, { type: 'sawtooth', dur: 0.18, gain: 0.16, to: 60 });
				break;

			}

			case 'hurt': {

				this.tone(220, { type: 'sawtooth', dur: 0.2, gain: 0.16, to: 110 });
				this.tone(233, { type: 'triangle', dur: 0.22, gain: 0.1, to: 98 });
				this.hiss({ dur: 0.14, gain: 0.16, freq: 700, to: 180, q: 0.6 });
				break;

			}

			case 'kill': {

				this.tone(420, { type: 'triangle', dur: 0.26, gain: 0.16, to: 70 });
				this.hiss({ dur: 0.2, gain: 0.14, freq: 900, to: 140, q: 0.8 });
				break;

			}

			case 'pickup': {

				this.tone(740, { type: 'triangle', dur: 0.08, gain: 0.13 });
				this.tone(1110, { type: 'triangle', dur: 0.1, gain: 0.1, delay: 0.06 });
				break;

			}

			case 'quaff': {

				this.tone(300, { type: 'sine', dur: 0.26, gain: 0.16, to: 760 });
				break;

			}

			case 'oil': {

				this.tone(180, { type: 'sine', dur: 0.3, gain: 0.14, to: 420 });
				this.hiss({ dur: 0.3, gain: 0.08, freq: 380, to: 1200, q: 0.5 });
				break;

			}

			case 'ember': {

				this.hiss({ dur: 0.42, gain: 0.3, freq: 2600, to: 110, q: 0.4 });
				this.tone(120, { type: 'sawtooth', dur: 0.34, gain: 0.18, to: 40 });
				break;

			}

			case 'blink': {

				this.tone(1200, { type: 'sine', dur: 0.24, gain: 0.12, to: 240 });
				this.tone(600, { type: 'sine', dur: 0.26, gain: 0.08, to: 1800, delay: 0.05 });
				break;

			}

			case 'bolt': {

				this.tone(900, { type: 'sawtooth', dur: 0.2, gain: 0.1, to: 180 });
				this.hiss({ dur: 0.18, gain: 0.1, freq: 2200, to: 400, q: 1.2 });
				break;

			}

			case 'door': {

				this.hiss({ dur: 0.16, gain: 0.14, freq: 320, to: 120, q: 2.4 });
				this.tone(110, { type: 'triangle', dur: 0.12, gain: 0.1 });
				break;

			}

			case 'drain': {

				this.tone(520, { type: 'sine', dur: 0.34, gain: 0.12, to: 90 });
				this.hiss({ dur: 0.3, gain: 0.1, freq: 1400, to: 200, q: 0.9 });
				break;

			}

			case 'level': {

				[392, 494, 587, 784].forEach((f, i) =>
					this.tone(f, { type: 'triangle', dur: 0.3, gain: 0.12, delay: i * 0.07 }));
				break;

			}

			case 'descend': {

				this.tone(70, { type: 'sine', dur: 0.8, gain: 0.22, to: 40 });
				this.hiss({ dur: 0.7, gain: 0.1, freq: 600, to: 90, q: 0.4 });
				break;

			}

			case 'warn': {

				this.tone(330, { type: 'sine', dur: 0.4, gain: 0.08, to: 300 });
				break;

			}

			case 'death': {

				this.tone(200, { type: 'sawtooth', dur: 1.6, gain: 0.2, to: 28 });
				this.hiss({ dur: 1.4, gain: 0.14, freq: 900, to: 60, q: 0.4 });
				break;

			}

			case 'win': {

				[262, 330, 392, 523, 659].forEach((f, i) =>
					this.tone(f, { type: 'triangle', dur: 0.9, gain: 0.11, delay: i * 0.13 }));
				break;

			}

			default: {

				break;

			}

		}

	}

}
