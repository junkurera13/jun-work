// Oddbox Kids synthesized Web Audio micro-sounds (ported from
// /Users/jun/gizmo/web/app/_oddbox/sounds.ts). Soft jelly-wobble sine tones
// gated by the site-wide sound toggle in src/sound-setting.js.

import { soundOn } from "../sound-setting.js";

let ctx = null;
let master = null;

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.24;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return { ctx, out: master };
}

function tone(freqs, dur, { gain = 1, wobble = 0 } = {}) {
  const { ctx: ac, out } = audio();
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freqs[0], t);
  freqs.slice(1).forEach((f, i) => {
    osc.frequency.exponentialRampToValueAtTime(f, t + ((dur * (i + 1)) / (freqs.length - 1 || 1)) * 0.9);
  });
  if (wobble) {
    const lfo = ac.createOscillator();
    const depth = ac.createGain();
    lfo.frequency.value = 14;
    depth.gain.setValueAtTime(wobble, t);
    depth.gain.exponentialRampToValueAtTime(0.01, t + dur);
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur);
  }
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const RECIPES = {
  boing: () => tone([260, 520, 440], 0.42, { wobble: 38 }),
  boingBack: () => tone([520, 260, 330], 0.42, { wobble: 38 }),
  pop: () => tone([440, 740, 660], 0.2, { wobble: 20, gain: 0.9 }),
  popClose: () => tone([660, 392, 440], 0.2, { wobble: 18, gain: 0.75 }),
  tap: () => tone([392, 587, 523], 0.26, { wobble: 24, gain: 0.9 }),
};

export function playOddbox(sound) {
  if (!soundOn()) return;
  try {
    RECIPES[sound]?.();
  } catch {
    // non-fatal audio fallback
  }
}
