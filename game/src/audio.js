// All sound in Sunfall Harbor is synthesized with WebAudio. No audio
// files, no network. Engine hum, siren, gunshots, pickups, jingles and a
// lazy bass loop are all built from oscillators and filtered noise.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.noiseSeed = 1234567;
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 57;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineOsc.connect(filter);
    engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    engineOsc2.start();
    this.engineOsc2 = engineOsc2;
    this.startMusic();
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  setEngine(speed01, on) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.07 : 0, t, 0.1);
    const f = 50 + speed01 * 130;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.02 + 2, t, 0.08);
  }
  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Deterministic noise from a tiny LCG, never a built-in random call.
    for (let i = 0; i < len; i += 1) {
      this.noiseSeed = (Math.imul(this.noiseSeed, 1103515245) + 12345) >>> 0;
      data[i] = ((this.noiseSeed / 4294967296) * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
  shoot() { this.noise(0.14, 0.5, 2600); this.blip(180, 0.08, 'square', 0.2, 60); }
  punch() { this.noise(0.08, 0.25, 500); }
  pickup() { this.blip(660, 0.09, 'sine', 0.2); setTimeout(() => this.blip(990, 0.12, 'sine', 0.2), 70); }
  siren() { this.blip(720, 0.5, 'sine', 0.07, 980); }
  crash() { this.noise(0.25, 0.45, 700); }
  missionComplete() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.22, 'triangle', 0.22), i * 110));
  }
  wasted() {
    const notes = [392, 330, 262, 196];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.35, 'triangle', 0.2), i * 160));
  }
  // A slow sunset bass loop: roots drift through Am - F - C - G.
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    const roots = [55, 43.65, 65.41, 49];
    const stepDur = 480;
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const root = roots[Math.floor(this.musicStep / 4) % roots.length];
      const beat = this.musicStep % 4;
      if (beat === 0 || beat === 2) this.blip(root, 0.42, 'triangle', 0.11);
      if (beat === 3) this.blip(root * 1.5, 0.2, 'sine', 0.07);
      if (beat === 1) this.blip(root * 2, 0.12, 'sine', 0.05);
      this.musicStep += 1;
    }, stepDur);
  }
}
