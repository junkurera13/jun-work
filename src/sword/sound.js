// Synthesised Web Audio for Asta's Demon-Destroyer Sword (Black Clover):
// heavy ancient forged iron unsheathe/slash ring, air-splitting broadsword
// whoosh, and dark rumbling Anti-Magic energy surge with stereo canyon decay.
// Follows the site-wide sound switch in src/sound-setting.js.

import { soundOn } from "../sound-setting.js";

let ctx;
let bus;
let noiseBuf;

function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function makeDriveCurve(drive = 2.8) {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh((x + 0.06 * x * x) * drive) / Math.tanh(drive);
  }
  return curve;
}

function getNoise(ac) {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 2.0);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  noiseBuf = buf;
  return buf;
}

// Dark stone-hall / cavern stereo impulse response for ancient iron resonance
function makeCavernIR(ac) {
  const sr = ac.sampleRate;
  const dur = 1.45;
  const len = Math.floor(sr * dur);
  const ir = ac.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const alpha = Math.max(0.04, 0.36 * Math.exp(-t * 2.8));
      const raw = (Math.random() * 2 - 1) * Math.exp(-t * 3.1);
      lp += alpha * (raw - lp);
      d[i] = lp * (t < 0.015 ? t / 0.015 : 1.0);
    }
  }
  return ir;
}

function getBus(ac) {
  if (bus && bus.ac === ac) return bus;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 6;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  const master = ac.createGain();
  master.gain.value = 0.84;
  comp.connect(master).connect(ac.destination);

  const mainIn = ac.createGain();
  mainIn.connect(comp);

  const revSend = ac.createGain();
  revSend.gain.value = 0.42;
  const conv = ac.createConvolver();
  conv.buffer = makeCavernIR(ac);
  const revLp = ac.createBiquadFilter();
  revLp.type = "lowpass";
  revLp.frequency.value = 2600;
  mainIn.connect(revSend).connect(conv).connect(revLp).connect(comp);

  const darkIn = ac.createGain();
  const drive = ac.createWaveShaper();
  drive.curve = makeDriveCurve(3.6);
  drive.oversample = "2x";
  darkIn.connect(drive).connect(mainIn);

  bus = { ac, mainIn, darkIn };
  return bus;
}

/** Unleashes Anti-Magic Causality Break: heavy iron draw ring + broadsword sever + dark surge. */
export function playAntiMagicSurge() {
  if (!soundOn()) return;
  const ac = audio();
  const { mainIn, darkIn } = getBus(ac);
  const t = ac.currentTime;
  const v = 0.96 + Math.random() * 0.08;

  // 1. Heavy air-splitting broadsword sever whoosh (sweeping dual-filtered noise)
  const whoosh = ac.createBufferSource();
  whoosh.buffer = getNoise(ac);
  const wBp = ac.createBiquadFilter();
  wBp.type = "bandpass";
  wBp.frequency.setValueAtTime(280, t);
  wBp.frequency.exponentialRampToValueAtTime(1950 * v, t + 0.09);
  wBp.frequency.exponentialRampToValueAtTime(240, t + 0.38);
  wBp.Q.value = 1.1;
  const wGain = ac.createGain();
  wGain.gain.setValueAtTime(0.0001, t);
  wGain.gain.linearRampToValueAtTime(0.65, t + 0.075);
  wGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  whoosh.connect(wBp).connect(wGain).connect(darkIn);
  whoosh.start(t, Math.random() * 1.1, 0.45);

  // 2. Ancient heavy forged iron blade ring (inharmonic cold-steel broadsword partials)
  const partials = [
    [412, 0.14, 0.85],
    [685, 0.11, 0.72],
    [1180, 0.09, 0.58],
    [1940, 0.075, 0.46],
    [3210, 0.045, 0.32],
  ];
  for (const [freq, amp, dur] of partials) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * v * 1.03, t + 0.02);
    osc.frequency.exponentialRampToValueAtTime(freq * v, t + 0.08);
    g.gain.setValueAtTime(0.0001, t + 0.015);
    g.gain.linearRampToValueAtTime(amp, t + 0.032);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.032 + dur);
    osc.connect(g).connect(mainIn);
    osc.start(t + 0.015);
    osc.stop(t + 0.05 + dur);
  }

  // 3. Sharp steel edge clang transient at the peak of the slash
  const clang = ac.createBufferSource();
  clang.buffer = getNoise(ac);
  const cHp = ac.createBiquadFilter();
  cHp.type = "bandpass";
  cHp.frequency.setValueAtTime(2900 * v, t + 0.03);
  cHp.Q.value = 2.4;
  const cGain = ac.createGain();
  cGain.gain.setValueAtTime(0.0001, t + 0.025);
  cGain.gain.linearRampToValueAtTime(0.45, t + 0.032);
  cGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  clang.connect(cHp).connect(cGain).connect(mainIn);
  clang.start(t + 0.025, Math.random() * 1.2, 0.14);

  // 4. Anti-Magic dark crimson sub-bass pressure surge (menacing distorted rumble)
  const sub = ac.createOscillator();
  const sub2 = ac.createOscillator();
  const subLp = ac.createBiquadFilter();
  subLp.type = "lowpass";
  subLp.frequency.setValueAtTime(360, t + 0.03);
  subLp.frequency.exponentialRampToValueAtTime(95, t + 0.95);
  const subGain = ac.createGain();
  subGain.gain.setValueAtTime(0.0001, t + 0.02);
  subGain.gain.linearRampToValueAtTime(0.68, t + 0.065);
  subGain.gain.exponentialRampToValueAtTime(0.24, t + 0.35);
  subGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);

  sub.type = "sawtooth";
  sub.frequency.setValueAtTime(92 * v, t + 0.02);
  sub.frequency.exponentialRampToValueAtTime(42, t + 0.32);
  sub.frequency.exponentialRampToValueAtTime(34, t + 1.0);

  // Slightly detuned fifth/octave growl for cursed demonic aura
  sub2.type = "triangle";
  sub2.frequency.setValueAtTime(64 * v, t + 0.02);
  sub2.frequency.exponentialRampToValueAtTime(29, t + 0.95);

  sub.connect(subLp);
  sub2.connect(subLp);
  subLp.connect(subGain).connect(darkIn);
  sub.start(t + 0.02);
  sub2.start(t + 0.02);
  sub.stop(t + 1.08);
  sub2.stop(t + 1.08);

  // 5. Crackling Anti-Magic static hiss sweeping down as the aura dissipates
  const fizz = ac.createBufferSource();
  fizz.buffer = getNoise(ac);
  const fBp = ac.createBiquadFilter();
  fBp.type = "bandpass";
  fBp.frequency.setValueAtTime(4200, t + 0.04);
  fBp.frequency.exponentialRampToValueAtTime(750, t + 0.72);
  fBp.Q.value = 1.8;
  const fGain = ac.createGain();
  fGain.gain.setValueAtTime(0.0001, t + 0.04);
  fGain.gain.linearRampToValueAtTime(0.22, t + 0.08);
  fGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.78);
  fizz.connect(fBp).connect(fGain).connect(darkIn);
  fizz.start(t + 0.04, Math.random() * 1.0, 0.82);
}

/** Subtle heavy iron air-hum while dragging/spinning the blade. */
export function playBladeHum() {
  if (!soundOn()) return;
  const ac = audio();
  const { mainIn } = getBus(ac);
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520 + Math.random() * 140, t);
  osc.frequency.exponentialRampToValueAtTime(340, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.032, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  osc.connect(g).connect(mainIn);
  osc.start(t);
  osc.stop(t + 0.11);
}
