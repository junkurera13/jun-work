// Procedural ASMR chocolate-shell sounds. Everything is synthesised with
// WebAudio so every snap is slightly different, like the real thing:
// a sharp brittle transient, the woody "tock" of the shell, a short spray of
// micro-crackles as the fracture runs, and a soft creamy undertone.

const rnd = (a, b) => a + Math.random() * (b - a);

export class CrackAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC({ latencyHint: "interactive" });
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.001;
    comp.release.value = 0.08;
    this.master.connect(comp).connect(ctx.destination);

    // very short, close "mouth / table" room for intimacy
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.makeIR(0.18);
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.16;
    this.verb.connect(this.verbGain).connect(this.master);

    this.noise = this.makeNoise(1.0);
    return ctx;
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeIR(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.5) * (i < 40 ? i / 40 : 1);
      }
    }
    return b;
  }

  out(pan) {
    const ctx = this.ctx;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    p.connect(this.master);
    p.connect(this.verb);
    return p;
  }

  /** a single filtered noise grain */
  grain(dest, t, { dur, freq, q, gain, type = "bandpass", attack = 0.0004 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rnd(0.8, 1.25);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, rnd(0, 0.8), dur + 0.02);
  }

  /** resonant body "tock" of the brittle shell */
  tock(dest, t, freq, gain, decay) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 1.35, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.012);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  crack(kind = "crack", pan = 0, strength = 1) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + 0.004;
    const dest = this.out(pan);
    const big = kind === "pop";
    const soft = kind === "squish";
    const s = strength * (soft ? 0.45 : 1);

    // 1. the snap transient
    this.grain(dest, t0, { dur: 0.012, freq: rnd(2600, 3600), q: 0.7, gain: 1.1 * s, type: "highpass" });
    this.grain(dest, t0, { dur: rnd(0.02, 0.035), freq: rnd(1100, 1700), q: rnd(2.5, 4.5), gain: 0.9 * s });
    // 2. shell body
    this.tock(dest, t0, rnd(big ? 520 : 640, big ? 700 : 860), 0.32 * s, rnd(0.03, 0.05));
    this.tock(dest, t0 + 0.001, rnd(150, 210), (big ? 0.35 : 0.22) * s, 0.06);
    // 3. the crack running through the shell: a spray of micro clicks
    const n = Math.floor((big ? rnd(14, 22) : rnd(8, 15)) * (soft ? 0.5 : 1));
    let t = t0 + 0.006;
    for (let i = 0; i < n; i++) {
      t += -Math.log(1 - Math.random()) * (big ? 0.011 : 0.009);
      const fall = Math.exp(-(t - t0) * (big ? 9 : 14));
      this.grain(dest, t, {
        dur: rnd(0.002, 0.007),
        freq: rnd(2200, 8500),
        q: rnd(1.5, 6),
        gain: rnd(0.25, 0.75) * fall * s,
      });
      if (Math.random() < 0.18) this.tock(dest, t, rnd(900, 1800), 0.08 * fall * s, 0.012);
    }
    // 4. creamy undertone: soft low-passed rustle of the ice cream underneath
    this.grain(dest, t0 + 0.004, { dur: big ? 0.16 : 0.1, freq: 520, q: 0.6, gain: 0.12 * s, type: "lowpass", attack: 0.006 });

    if (big) {
      // the piece letting go a moment later
      const t2 = t0 + rnd(0.05, 0.08);
      this.grain(dest, t2, { dur: 0.01, freq: rnd(3000, 4200), q: 1.0, gain: 0.45, type: "highpass" });
      this.tock(dest, t2, rnd(900, 1200), 0.12, 0.025);
    }
  }

  /** the shell giving way a little more under a held press */
  crackle(pan = 0, strength = 1) {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== "running") return;
    const t0 = ctx.currentTime + 0.003;
    const dest = this.out(pan);
    const s = 0.45 + 0.25 * Math.min(1.5, strength);
    const n = 3 + Math.floor(rnd(0, 5));
    let t = t0;
    for (let i = 0; i < n; i++) {
      t += rnd(0.004, 0.022);
      this.grain(dest, t, { dur: rnd(0.002, 0.006), freq: rnd(2000, 7500), q: rnd(1.5, 5), gain: rnd(0.25, 0.6) * s });
      if (Math.random() < 0.3) this.tock(dest, t, rnd(700, 1500), 0.07 * s, 0.014);
    }
    // soft, wet give of the ice cream underneath
    this.grain(dest, t0, { dur: 0.07, freq: 380, q: 0.7, gain: 0.08 * s, type: "lowpass", attack: 0.01 });
  }

  /** dial detent */
  tick(pitch = 1) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + 0.002;
    const dest = this.out(0);
    this.grain(dest, t, { dur: 0.006, freq: 3800 * pitch, q: 3, gain: 0.18 });
    this.tock(dest, t, 1500 * pitch, 0.05, 0.012);
  }
}
