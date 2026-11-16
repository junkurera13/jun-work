// Procedural ASMR shell sounds (chocolate, and the faluda's rose ice). Everything is synthesised with
// WebAudio so every snap is slightly different, like the real thing:
// a sharp brittle transient, the woody "tock" of the shell, a short spray of
// micro-crackles as the fracture runs, and a soft creamy undertone.

const rnd = (a, b) => a + Math.random() * (b - a);

export class CrackAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.material = "choc"; // "choc" | "ice": which shell is being cracked
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

  /**
   * A finger pressing into frozen milk ice: no snap, just a soft, muffled
   * squish. A slow-ish swell of low-passed noise (the surface giving way),
   * a gentle low thud underneath, and a faint sticky release.
   */
  press(pan = 0) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + 0.004;
    const dest = this.out(pan);
    // the give: muffled noise that swells in and sighs away
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rnd(0.55, 0.75);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(rnd(1100, 1500), t);
    lp.frequency.exponentialRampToValueAtTime(320, t + 0.16);
    lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(rnd(0.16, 0.22), t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rnd(0.15, 0.2));
    src.connect(lp).connect(g).connect(dest);
    src.start(t, rnd(0, 0.5));
    src.stop(t + 0.25);
    // a soft thud
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(rnd(120, 150), t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.1);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.14, t + 0.012);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(og).connect(dest);
    o.start(t);
    o.stop(t + 0.15);
    // the faint tacky release as the finger lifts off
    this.grain(dest, t + rnd(0.09, 0.13), { dur: 0.03, freq: rnd(1800, 2400), q: 1.2, gain: 0.03, attack: 0.004 });
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

  /** a clear, slightly glassy partial: ice rings where chocolate thuds */
  ping(dest, t, freq, gain, decay) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 1.04, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.006);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  crack(kind = "crack", pan = 0, strength = 1) {
    if (this.material === "ice") return this.iceCrack(kind, pan, strength);
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
      const fall = Math.exp(-(t - t0) * (big ? 13 : 14));
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
      // the piece letting go: close enough behind the snap (and without a
      // sharp attack of its own) to fuse into one fuller break, not a second one
      const t2 = t0 + rnd(0.01, 0.018);
      this.grain(dest, t2, { dur: 0.04, freq: rnd(1400, 2000), q: 1.2, gain: 0.22, attack: 0.004 });
      this.tock(dest, t2, rnd(380, 480), 0.1, 0.04);
    }
  }

  /**
   * The faluda's thick rose ice. Not a snap but a crunch: a hard glassy
   * click, a dull thunk from the heavy slab, a short ring of clear inharmonic
   * partials, then a dense gritty spray of crystals giving way. A few ice
   * crackles keep settling after, like a cube dropped in a drink.
   */
  iceCrack(kind = "crack", pan = 0, strength = 1) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + 0.004;
    const dest = this.out(pan);
    const big = kind === "pop";
    const s = strength;

    // 1. hard, bright click: brighter and shorter than chocolate
    this.grain(dest, t0, { dur: 0.007, freq: rnd(4200, 5600), q: 0.7, gain: 1.15 * s, type: "highpass" });
    this.grain(dest, t0, { dur: rnd(0.014, 0.022), freq: rnd(2300, 3200), q: rnd(3, 6), gain: 0.7 * s });
    // 2. the slab itself: a dull, heavy thunk (thick ice, not a thin shell)
    this.tock(dest, t0, rnd(105, 145), (big ? 0.5 : 0.36) * s, rnd(0.07, 0.1));
    this.grain(dest, t0 + 0.001, { dur: 0.05, freq: 380, q: 0.7, gain: 0.3 * s, type: "lowpass", attack: 0.002 });
    // 3. clear glassy ring: inharmonic partials, as struck ice has
    const f = rnd(1250, 1900);
    this.ping(dest, t0 + 0.001, f, 0.12 * s, rnd(0.05, 0.08));
    this.ping(dest, t0 + 0.001, f * rnd(2.65, 2.85), 0.07 * s, rnd(0.035, 0.05));
    this.ping(dest, t0 + 0.002, f * rnd(5.2, 5.6), 0.045 * s, rnd(0.02, 0.03));
    // 4. crystals giving way: a dense, gritty crunch, part bright, part low
    const n = Math.floor(big ? rnd(42, 58) : rnd(26, 36));
    let t = t0 + 0.003;
    for (let i = 0; i < n; i++) {
      t += -Math.log(1 - Math.random()) * (big ? 0.0042 : 0.0036);
      const fall = Math.exp(-(t - t0) * 16);
      const low = Math.random() < 0.3;
      this.grain(dest, t, {
        dur: rnd(0.0015, low ? 0.009 : 0.005),
        freq: low ? rnd(700, 1600) : rnd(2600, 10500),
        q: rnd(1.2, 4),
        gain: rnd(0.25, 0.7) * fall * s * (low ? 0.8 : 1),
      });
      if (Math.random() < 0.07) this.ping(dest, t, rnd(2400, 4800), 0.05 * fall * s, 0.018);
    }
    // 5. ice settling: a few tiny, sparse crackles after the break
    const m = Math.floor(rnd(3, big ? 8 : 6));
    for (let i = 0; i < m; i++) {
      const tc = t0 + rnd(0.09, big ? 0.42 : 0.3);
      this.grain(dest, tc, { dur: rnd(0.0015, 0.004), freq: rnd(3500, 9000), q: rnd(2, 5), gain: rnd(0.05, 0.14) * s });
    }
    // 6. the soft vanilla underneath, muffled by the ice
    this.grain(dest, t0 + 0.006, { dur: big ? 0.14 : 0.09, freq: 420, q: 0.6, gain: 0.08 * s, type: "lowpass", attack: 0.008 });

    if (big) {
      // the chunk of ice letting go: folded into the same break (no second
      // click), it just makes the crunch heavier and the slab thud deeper
      const t2 = t0 + rnd(0.008, 0.015);
      this.tock(dest, t2, rnd(85, 110), 0.22, 0.09);
      this.grain(dest, t2, { dur: 0.06, freq: rnd(900, 1400), q: 0.9, gain: 0.2, attack: 0.005 });
    }
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
