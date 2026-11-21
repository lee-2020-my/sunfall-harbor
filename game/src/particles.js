// Particles and floating combat text. Pure logic; rendering lives in
// render.js. Spawned from a seeded stream so replays stay identical.
import { streamFor } from './rng.js';

export class Particles {
  constructor(seed) {
    this.rng = streamFor(seed, 'particles');
    this.list = [];
    this.floaters = [];
    this.shake = 0;
  }
  spawn(x, y, opts) {
    const count = opts.count || 8;
    for (let i = 0; i < count; i += 1) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(opts.speedMin || 20, opts.speedMax || 120);
      this.list.push({
        x, y,
        vx: Math.cos(a) * sp + (opts.vx || 0),
        vy: Math.sin(a) * sp + (opts.vy || 0),
        life: this.rng.range(0.3, opts.life || 0.7),
        maxLife: opts.life || 0.7,
        size: this.rng.range(opts.sizeMin || 2, opts.sizeMax || 6),
        color: opts.color || '#ffcc88',
        gravity: opts.gravity || 0,
        drag: opts.drag || 0.98,
      });
    }
    if (this.list.length > 400) this.list.splice(0, this.list.length - 400);
  }
  smoke(x, y, vx, vy) {
    this.spawn(x, y, { count: 2, speedMin: 8, speedMax: 40, life: 0.9, sizeMin: 5, sizeMax: 11, color: '#b8b0a8', vx, vy });
  }
  dust(x, y) {
    this.spawn(x, y, { count: 3, speedMin: 10, speedMax: 60, life: 0.5, sizeMin: 3, sizeMax: 7, color: '#d9c49a' });
  }
  sparks(x, y) {
    this.spawn(x, y, { count: 10, speedMin: 80, speedMax: 260, life: 0.4, sizeMin: 2, sizeMax: 4, color: '#ffd94a', gravity: 300 });
  }
  skid(x, y) {
    this.spawn(x, y, { count: 1, speedMin: 0, speedMax: 6, life: 1.4, sizeMin: 4, sizeMax: 6, color: '#2a2a2a', drag: 1 });
  }
  muzzle(x, y, angle) {
    this.spawn(x, y, { count: 6, speedMin: 120, speedMax: 260, life: 0.16, sizeMin: 2, sizeMax: 5, color: '#ffe9a8', vx: Math.cos(angle) * 120, vy: Math.sin(angle) * 120 });
  }
  blood(x, y) {
    this.spawn(x, y, { count: 8, speedMin: 40, speedMax: 160, life: 0.5, sizeMin: 2, sizeMax: 5, color: '#c93a3a', gravity: 200 });
  }
  floater(x, y, text, color) {
    this.floaters.push({ x, y, text, color: color || '#ffffff', life: 1.1 });
  }
  addShake(amount) {
    this.shake = Math.min(18, this.shake + amount);
  }
  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
    }
    this.list = this.list.filter((p) => p.life > 0);
    for (const f of this.floaters) { f.life -= dt; f.y -= 34 * dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shake = Math.max(0, this.shake - 40 * dt);
  }
  // Deterministic screen-shake offset for the current frame.
  shakeOffset(time) {
    if (this.shake <= 0.1) return { x: 0, y: 0 };
    const s = this.shake;
    return {
      x: Math.sin(time * 91.7) * s * 0.6,
      y: Math.cos(time * 113.3) * s * 0.6,
    };
  }
}
