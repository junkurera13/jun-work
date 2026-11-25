// Audio for the Oddware Gizmo 1: plays the real firmware boot chime
// (/gizmo/boot.wav) plus crisp tactile micro-switch clicks for the physical
// pink PTT bar, volume rocker, select button, and power toggle.
// Follows the site-wide sound switch in src/sound-setting.js.

import { soundOn } from "../sound-setting.js";

let ctx;
let chimeBuf = null;
let chimeLoading = null;
let noiseBuf = null;

function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function getNoise(ac) {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const len = Math.floor(ac.sampleRate * 0.15);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

/** Preload and decode the real Gizmo 1 boot chime (/gizmo/boot.wav). */
export function preloadBootChime() {
  if (chimeBuf || chimeLoading) return chimeLoading ?? Promise.resolve(chimeBuf);
  chimeLoading = fetch("/gizmo/boot.wav")
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((ab) => (ab ? audio().decodeAudioData(ab) : null))
    .then((buf) => {
      chimeBuf = buf;
      return buf;
    })
    .catch(() => null);
  return chimeLoading;
}

/** Play the real Gizmo 1 boot chime scaled by device volume (0..10). */
export async function playBootChime(volumeStep = 8) {
  if (!soundOn() || volumeStep <= 0) return;
  const ac = audio();
  const buf = chimeBuf ?? (await preloadBootChime());
  if (!buf || !soundOn()) return;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = (volumeStep / 10) * 0.72;
  src.connect(g).connect(ac.destination);
  src.start();
}

/** Crisp physical dome-switch / elastomer tactile click for Gizmo hardware buttons. */
export function playButtonClick(kind = "select", volumeStep = 8) {
  if (!soundOn()) return;
  const ac = audio();
  const t = ac.currentTime;
  const vol = Math.max(0.25, volumeStep / 10);

  const presets = {
    powerOn:  { f: 1650, body: 520, dur: 0.022, gain: 0.14 },
    powerOff: { f: 980,  body: 320, dur: 0.028, gain: 0.13 },
    pttDown:  { f: 2200, body: 740, dur: 0.016, gain: 0.12 },
    pttUp:    { f: 2700, body: 920, dur: 0.014, gain: 0.09 },
    rocker:   { f: 2950, body: 1050, dur: 0.012, gain: 0.09 },
    select:   { f: 2450, body: 860, dur: 0.015, gain: 0.11 },
  };
  const p = presets[kind] ?? presets.select;

  // Short crisp snap transient
  const n = ac.createBufferSource();
  n.buffer = getNoise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(p.f, t);
  bp.Q.value = 2.0;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.linearRampToValueAtTime(p.gain * vol, t + 0.0015);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
  n.connect(bp).connect(ng).connect(ac.destination);
  n.start(t, 0, p.dur + 0.01);

  // Subtle polycarbonate housing thock
  const osc = ac.createOscillator();
  const og = ac.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(p.body, t);
  osc.frequency.exponentialRampToValueAtTime(p.body * 0.45, t + p.dur);
  og.gain.setValueAtTime(p.gain * 0.55 * vol, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
  osc.connect(og).connect(ac.destination);
  osc.start(t);
  osc.stop(t + p.dur + 0.005);
}
