// WORK / PLAY / ABOUT: letter-by-letter typing on hover, retro sounds, and
// switching which list (any element with data-list="<WORD>") is shown.
// Used by the home page.

import { soundOn } from "../sound-setting.js";

// Retro blips, synthesised with Web Audio (no files). Browsers keep audio
// locked until the first click or key press, so hover ticks start once the
// visitor has interacted with the page.
let ctx;
const audio = () => {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
};
addEventListener("pointerdown", audio, { once: true });
addEventListener("keydown", audio, { once: true });

const blip = (freq, at, duration, volume = 0.05, type = "square") => {
  if (!soundOn()) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration);
};

// Each choice has its own voice.
// WORK:  low, flat square-wave ticks like an old terminal, and a firm
//        two-note "confirm" that steps down.
// PLAY:  bright triangle-wave ticks that climb, and a quick three-note
//        arpeggio like picking up a coin.
// ABOUT: soft, mid sine ticks and a gentle two-note "open".
const sounds = {
  WORK: {
    tick: (i, at) => blip(440, at, 0.03, 0.035),
    select: (t) => {
      blip(392, t, 0.08);
      blip(262, t + 0.08, 0.14);
    },
  },
  PLAY: {
    tick: (i, at) => blip(1050 + i * 175, at, 0.035, 0.07, "triangle"),
    select: (t) => {
      blip(988, t, 0.05, 0.05);
      blip(1319, t + 0.05, 0.05, 0.05);
      blip(1976, t + 0.1, 0.16, 0.05);
    },
  },
  ABOUT: {
    tick: (i, at) => blip(660, at, 0.03, 0.08, "sine"),
    select: (t) => {
      blip(523, t, 0.07, 0.09, "sine");
      blip(784, t + 0.07, 0.14, 0.09, "sine");
    },
  },
};

// One tick per letter, in step with the typing animation (70ms apart).
const typeAnimates = matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)");
const playType = (word) => {
  if (!ctx || ctx.state !== "running" || !typeAnimates.matches) return;
  const t = ctx.currentTime;
  for (let i = 0; i < word.length; i++) sounds[word].tick(i, t + (i + 1) * 0.07);
};

const playSelect = (word) => sounds[word].select(audio().currentTime);

export function setupChoices() {
  const choices = document.querySelectorAll(".choice");
  const lists = document.querySelectorAll("[data-list]");
  for (const choice of choices) {
    const word = choice.textContent.trim();
    choice.setAttribute("aria-label", word);
    choice.textContent = "";
    [...word].forEach((char, i) => {
      const letter = document.createElement("span");
      letter.className = "letter";
      letter.style.setProperty("--i", i);
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = char;
      choice.append(letter);
    });

    choice.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse") playType(word);
    });
    choice.addEventListener("click", () => {
      playSelect(word);
      for (const c of choices) c.setAttribute("aria-pressed", String(c === choice));
      for (const list of lists) list.hidden = list.dataset.list !== word;
    });
  }
}

// A short rising two-note blip for when sound is switched back on.
export const playSoundOn = () => {
  const t = audio().currentTime;
  blip(660, t, 0.05);
  blip(990, t + 0.05, 0.09);
};

// The slide arrows: a quick two-note triangle blip in PLAY's voice, rising
// for the slide above and falling for the slide below.
export const playStep = (step) => {
  const t = audio().currentTime;
  const [a, b] = step < 0 ? [988, 1319] : [1319, 988];
  blip(a, t, 0.04, 0.06, "triangle");
  blip(b, t + 0.045, 0.07, 0.06, "triangle");
};

// A teabag dropping into water: a soft sine "plop" that falls in pitch,
// with a tiny high splash.
export const playPlop = () => {
  if (!soundOn() || !ctx) return;
  const t = audio().currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(620, t);
  osc.frequency.exponentialRampToValueAtTime(140, t + 0.16);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.24);
  blip(1900, t + 0.03, 0.05, 0.02, "sine");
  blip(2400, t + 0.07, 0.04, 0.012, "sine");
};
