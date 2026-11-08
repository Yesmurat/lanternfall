// Particles, damage numbers, tracers and shake. All positions are in tile units.
export class FX {
  constructor() {
    this.parts = [];
    this.floats = [];
    this.tracers = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '224,90,69';
    this.calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  clear() {
    this.parts.length = 0;
    this.floats.length = 0;
    this.tracers.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  burst(x, y, color, count = 10, { speed = 4.5, life = 0.45, gravity = 2.2, size = 2.4, spread = Math.PI * 2, dir = 0 } = {}) {
    if (this.calm) count = Math.min(count, 4);
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.8);
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.6 + Math.random() * 0.7), t: 0, color, gravity,
        size: size * (0.6 + Math.random() * 0.7),
      });
    }
  }

  float(x, y, text, color, { big = false } = {}) {
    this.floats.push({ x, y, text, color, t: 0, life: big ? 1.15 : 0.85, big });
  }

  tracer(x0, y0, x1, y1, color) {
    this.tracers.push({ x0, y0, x1, y1, color, t: 0, life: 0.22 });
  }

  shakeBy(amount) {
    if (this.calm) return;
    this.shake = Math.min(14, this.shake + amount);
  }

  flashBy(amount, color = '224,90,69') {
    this.flash = Math.min(0.72, this.flash + amount);
    this.flashColor = color;
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 1 - 2.4 * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.t >= f.life) this.floats.splice(i, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += dt;
      if (tr.t >= tr.life) this.tracers.splice(i, 1);
    }
    this.shake *= Math.exp(-dt * 9);
    if (this.shake < 0.05) this.shake = 0;
    this.flash *= Math.exp(-dt * 5.5);
    if (this.flash < 0.004) this.flash = 0;
  }

  get busy() { return this.parts.length > 0 || this.floats.length > 0; }
}
