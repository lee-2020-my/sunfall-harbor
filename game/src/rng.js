// Seeded random number generator for Sunfall Harbor.
// Every random choice in the game flows through this class, so a fixed
// seed always rebuilds the same city, the same traffic and the same play.
// mulberry32: small, fast, and fully deterministic across engines.
export class Rng {
  constructor(seed) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }
  // Raw 32-bit unsigned integer.
  nextUint() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  }
  // Float in [0, 1).
  next() {
    return this.nextUint() / 4294967296;
  }
  // Float in [min, max).
  range(min, max) {
    return min + this.next() * (max - min);
  }
  // Integer in [min, max] inclusive.
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  // Pick one element of an array.
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  // True with probability p.
  chance(p) {
    return this.next() < p;
  }
  // Deterministic Fisher-Yates shuffle, returns a new array.
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
}

// A second, independent stream derived from a seed and a label, so one
// system (traffic, pedestrians, ...) never eats another system's numbers.
export function streamFor(seed, label) {
  let h = (seed >>> 0) || 0x9e3779b9;
  for (let i = 0; i < label.length; i += 1) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  }
  return new Rng(h);
}
