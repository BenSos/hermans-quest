/**
 * Sound effects made on the fly with Web Audio (no sound files needed).
 * Each sound is a few lines: an oscillator or a burst of noise shaped by a quick envelope.
 * Browsers only allow sound after the first key press or tap, so the audio starts then.
 */

type Wave = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  enabled = true;
  volume = 0.55;
  private last = new Map<string, number>();

  /** Call from a user gesture. Safe to call many times. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(on: boolean) {
    this.enabled = on;
  }

  /** Avoid machine-gun repeats of the same sound in one instant. */
  private gate(name: string, gap = 0.03): boolean {
    if (!this.ctx || !this.enabled) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < gap) return false;
    this.last.set(name, now);
    return true;
  }

  private tone(freq: number, dur: number, opts: { type?: Wave; vol?: number; slide?: number; delay?: number; attack?: number } = {}) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? 'square';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
    const v = opts.vol ?? 0.3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, opts: { vol?: number; freq?: number; q?: number; type?: BiquadFilterType; sweep?: number; delay?: number } = {}) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1200, t);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, (opts.freq ?? 1200) * opts.sweep), t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const v = opts.vol ?? 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /* ---------- The sounds ---------- */
  swing() { if (this.gate('swing', 0.06)) this.noise(0.14, { freq: 2600, sweep: 0.4, q: 1.5, vol: 0.28 }); }
  hit() { if (this.gate('hit', 0.04)) { this.tone(180, 0.09, { type: 'square', slide: 0.5, vol: 0.22 }); this.noise(0.06, { freq: 900, vol: 0.25 }); } }
  kill() { if (this.gate('kill', 0.05)) { this.tone(520, 0.12, { type: 'triangle', slide: 2, vol: 0.2 }); this.noise(0.12, { freq: 1600, sweep: 0.3, vol: 0.2 }); } }
  rangThrow() { if (this.gate('rang', 0.1)) this.noise(0.3, { freq: 700, sweep: 2.5, q: 4, vol: 0.18 }); }
  rangCatch() { if (this.gate('catch', 0.1)) this.tone(880, 0.06, { type: 'triangle', vol: 0.15 }); }
  bow() { if (this.gate('bow', 0.05)) { this.tone(260, 0.12, { type: 'triangle', slide: 0.6, vol: 0.25 }); this.noise(0.08, { freq: 3000, vol: 0.12 }); } }
  arrowThunk() { if (this.gate('thunk', 0.05)) this.noise(0.07, { freq: 500, q: 2, vol: 0.25 }); }
  arrowPickup() { if (this.gate('apick', 0.05)) this.tone(1320, 0.05, { type: 'triangle', vol: 0.12 }); }
  dash() { if (this.gate('dash', 0.1)) this.noise(0.22, { freq: 400, sweep: 5, q: 0.8, vol: 0.3 }); }
  hurt() { if (this.gate('hurt', 0.1)) { this.tone(220, 0.18, { type: 'sawtooth', slide: 0.45, vol: 0.25 }); this.noise(0.1, { freq: 600, vol: 0.2 }); } }
  heart() { if (this.gate('heart')) { this.tone(660, 0.1, { type: 'triangle', vol: 0.2 }); this.tone(990, 0.16, { type: 'triangle', vol: 0.2, delay: 0.08 }); } }
  key() { if (this.gate('key')) [880, 1175, 1480, 1760].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.18, delay: i * 0.07 })); }
  chest(rarity = 0) {
    if (!this.gate('chest', 0.3)) return;
    const notes = [523, 659, 784, 1047, 1319, 1568, 2093];
    const n = 3 + Math.min(4, rarity);
    for (let i = 0; i < n; i++) this.tone(notes[i], 0.22 + (i === n - 1 ? 0.4 : 0), { type: 'square', vol: 0.12, delay: i * 0.09 });
  }
  pick() { if (this.gate('pick')) { this.tone(784, 0.12, { type: 'triangle', vol: 0.2 }); this.tone(1175, 0.25, { type: 'triangle', vol: 0.2, delay: 0.1 }); } }
  slime() { if (this.gate('slime', 0.08)) this.tone(300, 0.1, { type: 'sine', slide: 0.4, vol: 0.12 }); }
  rattle() { if (this.gate('rattle', 0.15)) for (let i = 0; i < 3; i++) this.noise(0.04, { freq: 2200 + i * 400, q: 6, vol: 0.12, delay: i * 0.05 }); }
  grunt() { if (this.gate('grunt', 0.3)) this.tone(110, 0.25, { type: 'sawtooth', slide: 0.7, vol: 0.2 }); }
  slam() { if (this.gate('slam', 0.08)) { this.tone(70, 0.35, { type: 'sine', slide: 0.5, vol: 0.5 }); this.noise(0.3, { freq: 300, type: 'lowpass', vol: 0.45 }); } }
  stomp() { if (this.gate('stomp', 0.2)) { this.tone(45, 0.8, { type: 'sine', slide: 0.6, vol: 0.7 }); this.noise(0.7, { freq: 200, type: 'lowpass', vol: 0.6 }); } }
  shoot() { if (this.gate('shoot', 0.05)) this.tone(600, 0.1, { type: 'square', slide: 0.5, vol: 0.08 }); }
  door() { if (this.gate('door', 0.2)) { this.noise(0.5, { freq: 150, type: 'lowpass', vol: 0.4 }); this.tone(90, 0.4, { type: 'square', slide: 0.8, vol: 0.1 }); } }
  doorSlam() { if (this.gate('slamdoor', 0.2)) { this.tone(60, 0.3, { type: 'square', slide: 0.6, vol: 0.25 }); this.noise(0.2, { freq: 400, vol: 0.4 }); } }
  keyUnlock() { if (this.gate("unlock", 0.2)) { this.noise(0.05, { freq: 3000, vol: 0.2 }); this.tone(1200, 0.1, { type: 'square', vol: 0.12, delay: 0.06 }); this.door(); } }
  puzzle() { if (this.gate('puzzle', 0.5)) [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.2, { type: 'triangle', vol: 0.18, delay: i * 0.1 })); }
  crystal() { if (this.gate('crystal', 0.2)) this.tone(1760, 0.6, { type: 'sine', vol: 0.25 }); }
  splash() { if (this.gate('splash', 0.1)) this.noise(0.35, { freq: 1200, sweep: 0.4, vol: 0.35 }); }
  rockLift() { if (this.gate('lift', 0.1)) this.noise(0.12, { freq: 300, vol: 0.25 }); }
  rockLand() { if (this.gate('rockland', 0.05)) { this.tone(60, 0.3, { type: 'sine', slide: 0.6, vol: 0.5 }); this.noise(0.25, { freq: 250, type: 'lowpass', vol: 0.5 }); } }
  waveStart() { if (this.gate('wave', 0.5)) { this.tone(392, 0.15, { type: 'square', vol: 0.12 }); this.tone(523, 0.3, { type: 'square', vol: 0.12, delay: 0.14 }); } }
  bossIntro() { if (this.gate('bossintro', 1)) [196, 185, 175, 147].forEach((f, i) => this.tone(f, 0.35, { type: 'sawtooth', vol: 0.16, delay: i * 0.22 })); }
  victory() { if (this.gate('victory', 1)) [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.7 : 0.18, { type: 'square', vol: 0.12, delay: i * 0.13 })); }
  bigBoom() { if (this.gate('boom', 0.3)) { this.tone(50, 1.0, { type: 'sine', slide: 0.4, vol: 0.7 }); this.noise(0.9, { freq: 500, type: 'lowpass', sweep: 0.2, vol: 0.6 }); } }
  jump() { if (this.gate('jump', 0.1)) this.tone(330, 0.16, { type: 'square', slide: 2.2, vol: 0.12 }); }
  wade() { if (this.gate('wade', 0.22)) this.noise(0.16, { freq: 1500, sweep: 0.5, q: 1.2, vol: 0.12 }); }
  coin() { if (this.gate('coin', 0.04)) { this.tone(1568, 0.06, { type: 'square', vol: 0.07 }); this.tone(2093, 0.12, { type: 'square', vol: 0.07, delay: 0.05 }); } }
  buy() { if (this.gate('buy', 0.2)) { [1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.16, delay: i * 0.06 })); this.noise(0.2, { freq: 4000, vol: 0.08, delay: 0.05 }); } }
  nope() { if (this.gate('nope', 0.2)) { this.tone(220, 0.12, { type: 'square', vol: 0.1 }); this.tone(185, 0.18, { type: 'square', vol: 0.1, delay: 0.1 }); } }
  block() { if (this.gate('block', 0.1)) { this.tone(1400, 0.08, { type: 'square', vol: 0.12 }); this.noise(0.08, { freq: 3000, vol: 0.2 }); } }
  thud() { if (this.gate('thud', 0.06)) { this.tone(140, 0.08, { type: 'sine', slide: 0.6, vol: 0.25 }); this.noise(0.06, { freq: 600, vol: 0.18 }); } }
  fountain() { if (this.gate('fountain', 1)) [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', vol: 0.15, delay: i * 0.06 })); }
  step() {}
}

export const sfx = new Sfx();
