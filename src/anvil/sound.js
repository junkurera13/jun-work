// Synthesised Web Audio for the Amplified Anvil: a heavy shotgun-class single-
// action hand cannon blast (instantaneous supersonic crack, saturated low-mid
// chest thump, thick broadband gunpowder bark, procedural stereo outdoor tail,
// and machined steel hammer/cylinder recock). Follows src/sound-setting.js.

import { soundOn } from "../sound-setting.js";

let ctx;
let bus;
let whiteBuf;
let pinkBuf;

function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// Asymmetric warm soft-clipper: thickens transients and adds punchy low-mid
// harmonics so the blast feels massive on laptop speakers and headphones alike.
function makeDriveCurve(drive = 3.2) {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    // Slight asymmetry adds rich even-order punch
    const y = Math.tanh((x + 0.08 * x * x) * drive);
    curve[i] = y / Math.tanh(drive);
  }
  return curve;
}

// 2-second stereo white noise buffer (sampled at random offsets per shot so
// rapid fire never sounds repetitive).
function getWhiteNoise(ac) {
  if (whiteBuf && whiteBuf.sampleRate === ac.sampleRate) return whiteBuf;
  const len = Math.floor(ac.sampleRate * 2.0);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  whiteBuf = buf;
  return buf;
}

// 2-second stereo pink-weighted noise buffer (Paul Kellet filter) — dense,
// heavy low-mid gunpowder roar without hollow ringing.
function getPinkNoise(ac) {
  if (pinkBuf && pinkBuf.sampleRate === ac.sampleRate) return pinkBuf;
  const len = Math.floor(ac.sampleRate * 2.0);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.14;
      b6 = w * 0.115926;
    }
  }
  pinkBuf = buf;
  return buf;
}

// Procedural stereo outdoor/Topside canyon impulse response: tight early
// concrete/metal reflections + wide low-passed open-air blast tail.
function makeBlastIR(ac) {
  const sr = ac.sampleRate;
  const dur = 1.05;
  const len = Math.floor(sr * dur);
  const ir = ac.createBuffer(2, len, sr);
  const taps = [
    [0.022, 0.55],
    [0.048, 0.42],
    [0.086, 0.30],
    [0.142, 0.19],
  ];
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // Air absorption: progressively darker tail over time
      const alpha = Math.max(0.03, 0.42 * Math.exp(-t * 4.5));
      const raw = (Math.random() * 2 - 1) * Math.exp(-t * 4.2);
      lp += alpha * (raw - lp);
      data[i] = lp * (t < 0.012 ? t / 0.012 : 1.0);
    }
    // Distinct stereo early slapback reflections
    for (const [delay, amp] of taps) {
      const jitter = ch === 0 ? 0 : 0.004;
      const idx = Math.floor((delay + jitter) * sr);
      for (let k = 0; k < 220 && idx + k < len; k++) {
        data[idx + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / 45);
      }
    }
  }
  return ir;
}

function getBus(ac) {
  if (bus && bus.ac === ac) return bus;

  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 8;
  comp.attack.value = 0.002;
  comp.release.value = 0.14;

  const master = ac.createGain();
  master.gain.value = 0.88;
  comp.connect(master).connect(ac.destination);

  // Heavy blast saturator bus (glues snap + punch + bark into one wall)
  const blastIn = ac.createGain();
  const drive = ac.createWaveShaper();
  drive.curve = makeDriveCurve(3.4);
  drive.oversample = "2x";
  blastIn.connect(drive).connect(comp);

  // Stereo outdoor reflection tail fed from blast bus
  const revSend = ac.createGain();
  revSend.gain.value = 0.46;
  const conv = ac.createConvolver();
  conv.buffer = makeBlastIR(ac);
  const revLp = ac.createBiquadFilter();
  revLp.type = "lowpass";
  revLp.frequency.value = 2200;
  const revHp = ac.createBiquadFilter();
  revHp.type = "highpass";
  revHp.frequency.value = 65;
  drive.connect(revSend).connect(conv).connect(revLp).connect(revHp).connect(comp);

  // Clean mechanical bus (hammer/cylinder clicks stay sharp and un-distorted)
  const mechIn = ac.createGain();
  mechIn.connect(comp);

  bus = { ac, blastIn, mechIn };
  return bus;
}

// Machined steel click-clack (filtered micro-noise burst + brief damped steel
// modes — sounds like real steel pawls, not a synth beep).
function steelClick(ac, dest, at, { freq = 2600, body = 950, gain = 0.16, dur = 0.022 } = {}) {
  const n = ac.createBufferSource();
  n.buffer = getWhiteNoise(ac);
  const hp = ac.createBiquadFilter();
  hp.type = "bandpass";
  hp.frequency.setValueAtTime(freq, at);
  hp.Q.value = 1.6;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.0001, at);
  ng.gain.linearRampToValueAtTime(gain, at + 0.0015);
  ng.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  n.connect(hp).connect(ng).connect(dest);
  n.start(at, Math.random() * 1.2, dur + 0.01);

  // Tiny hard steel body clack
  const osc = ac.createOscillator();
  const og = ac.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(body, at);
  osc.frequency.exponentialRampToValueAtTime(body * 0.42, at + dur * 0.75);
  og.gain.setValueAtTime(gain * 0.55, at);
  og.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.8);
  osc.connect(og).connect(dest);
  osc.start(at);
  osc.stop(at + dur + 0.005);
}

/** Heavy shotgun-class Amplified Anvil blast + single-action recock. */
export function playAnvilShot() {
  if (!soundOn()) return;
  const ac = audio();
  const { blastIn, mechIn } = getBus(ac);
  const t = ac.currentTime;
  const v = 0.95 + Math.random() * 0.1; // subtle organic shot-to-shot variation

  // 1. Crisp steel hammer strike just before ignition
  steelClick(ac, mechIn, t, { freq: 3400 * v, body: 1350 * v, gain: 0.24, dur: 0.016 });

  const ig = t + 0.005; // ignition moment

  // 2. Supersonic muzzle whip / crack (full-bandwidth instant transient snap)
  const snap = ac.createBufferSource();
  snap.buffer = getWhiteNoise(ac);
  const snapHp = ac.createBiquadFilter();
  snapHp.type = "highpass";
  snapHp.frequency.setValueAtTime(520, ig);
  const snapPeak = ac.createBiquadFilter();
  snapPeak.type = "peaking";
  snapPeak.frequency.setValueAtTime(2700 * v, ig);
  snapPeak.Q.value = 0.9;
  snapPeak.gain.value = 7;
  const snapGain = ac.createGain();
  snapGain.gain.setValueAtTime(0.0001, ig);
  snapGain.gain.linearRampToValueAtTime(1.15, ig + 0.0015);
  snapGain.gain.exponentialRampToValueAtTime(0.08, ig + 0.032);
  snapGain.gain.exponentialRampToValueAtTime(0.0001, ig + 0.075);
  snap.connect(snapHp).connect(snapPeak).connect(snapGain).connect(blastIn);
  snap.start(ig, Math.random() * 1.2, 0.09);

  // 3. Thick shotgun broadband gunpowder bark (pink noise, heavy low-mid shelf,
  //    wide sweeping lowpass — zero hollow bandpass ringing)
  const bark = ac.createBufferSource();
  bark.buffer = getPinkNoise(ac);
  const lowBoost = ac.createBiquadFilter();
  lowBoost.type = "lowshelf";
  lowBoost.frequency.value = 210;
  lowBoost.gain.value = 11;
  const midPunch = ac.createBiquadFilter();
  midPunch.type = "peaking";
  midPunch.frequency.value = 540 * v;
  midPunch.Q.value = 0.75;
  midPunch.gain.value = 6;
  const barkLp = ac.createBiquadFilter();
  barkLp.type = "lowpass";
  barkLp.frequency.setValueAtTime(5600 * v, ig);
  barkLp.frequency.exponentialRampToValueAtTime(820, ig + 0.09);
  barkLp.frequency.exponentialRampToValueAtTime(175, ig + 0.36);
  const barkGain = ac.createGain();
  barkGain.gain.setValueAtTime(0.0001, ig);
  barkGain.gain.linearRampToValueAtTime(1.55, ig + 0.003);
  barkGain.gain.exponentialRampToValueAtTime(0.42, ig + 0.075);
  barkGain.gain.exponentialRampToValueAtTime(0.0001, ig + 0.38);
  bark.connect(lowBoost).connect(midPunch).connect(barkLp).connect(barkGain).connect(blastIn);
  bark.start(ig, Math.random() * 1.1, 0.42);

  // 4. Massive saturated chest-thump body (fast pitch-dropped triangle + sub
  //    driven through dedicated overdrive so it hits hard on every speaker)
  const thumpDrive = ac.createWaveShaper();
  thumpDrive.curve = makeDriveCurve(4.5);
  const thumpLp = ac.createBiquadFilter();
  thumpLp.type = "lowpass";
  thumpLp.frequency.setValueAtTime(620, ig);
  thumpLp.frequency.exponentialRampToValueAtTime(135, ig + 0.19);
  const thumpGain = ac.createGain();
  thumpGain.gain.setValueAtTime(0.0001, ig);
  thumpGain.gain.linearRampToValueAtTime(1.15, ig + 0.003);
  thumpGain.gain.exponentialRampToValueAtTime(0.28, ig + 0.085);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, ig + 0.25);
  thumpDrive.connect(thumpLp).connect(thumpGain).connect(blastIn);

  const punchOsc = ac.createOscillator();
  punchOsc.type = "triangle";
  punchOsc.frequency.setValueAtTime(245 * v, ig);
  punchOsc.frequency.exponentialRampToValueAtTime(58, ig + 0.055);
  punchOsc.frequency.exponentialRampToValueAtTime(34, ig + 0.22);
  punchOsc.connect(thumpDrive);
  punchOsc.start(ig);
  punchOsc.stop(ig + 0.26);

  const subOsc = ac.createOscillator();
  subOsc.type = "sine";
  subOsc.frequency.setValueAtTime(128 * v, ig);
  subOsc.frequency.exponentialRampToValueAtTime(38, ig + 0.14);
  const subG = ac.createGain();
  subG.gain.value = 0.85;
  subOsc.connect(subG).connect(thumpDrive);
  subOsc.start(ig);
  subOsc.stop(ig + 0.26);

  // 5. Heavy steel breech slam / recoil clack (gritty, short — no hollow ring)
  steelClick(ac, mechIn, ig + 0.008, { freq: 1650 * v, body: 680 * v, gain: 0.22, dur: 0.036 });

  // 6. Single-action cylinder index + heavy hammer recock (two-stage steel pawl)
  steelClick(ac, mechIn, t + 0.32, { freq: 2150 * v, body: 820, gain: 0.11, dur: 0.018 });
  steelClick(ac, mechIn, t + 0.39, { freq: 3150 * v, body: 1240, gain: 0.16, dur: 0.022 });
}

/** Subtle machined steel detent click while spinning the Anvil. */
export function playCylinderTick() {
  if (!soundOn()) return;
  const ac = audio();
  const { mechIn } = getBus(ac);
  steelClick(ac, mechIn, ac.currentTime, {
    freq: 2500 + Math.random() * 350,
    body: 1050 + Math.random() * 140,
    gain: 0.07,
    dur: 0.014,
  });
}
