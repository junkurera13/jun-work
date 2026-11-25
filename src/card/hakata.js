// Hakata-ori: the card as Fukuoka's woven silk.
//
// Hakata-ori is warp-faced: tightly packed lengthwise threads carry the
// colour, and its classic kenjō pattern runs in vertical bands: thick
// "parent" stripes guarding thin "child" ones, around a band of tokko (the
// Buddhist ritual tool) and one of hanazara (flower dishes). Here every
// thread is generated one by one on a TW-pixel grid, so the pattern is
// literally woven in. On top, everything else is gold: a gold chip, and the
// Slate S and the name in smooth, raised gold foil.
//
// The back is the reverse of the cloth: weft-faced, the pattern in
// negative, with loose floats and knots.

import { W, H, markStencil, drawChip, stamp } from "./face.js";

const TW = 6; // thread width, pixels
const COLS = Math.ceil(W / TW);

const COLORS = {
  navy: [26, 34, 66],
  cream: [238, 228, 205],
  gold: [212, 172, 88],
  red: [158, 44, 40],
  blue: [84, 106, 150],
};
// what each thread looks like from the back (the other yarn shows there)
const BACK = {
  navy: [214, 203, 180],
  cream: [36, 44, 74],
  gold: [150, 122, 64],
  red: [104, 34, 32],
  blue: [176, 166, 146],
};
const METAL = { gold: 1 };

// a little seeded randomness, so the cloth is the same every time
let seed = 13;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// The kenjō group, from its centre outward (in threads); it's mirrored on
// the other side.
const HALF = [
  ["tokko", 14],
  ["navy", 1],
  ["red", 1],
  ["navy", 2],
  ["hana", 10],
  ["navy", 2],
  ["gold", 1],
  ["navy", 2],
  ["cream", 6],
];
const CENTER = Math.round(COLS * 0.77);

function patternAt(col, row) {
  const d = col - CENTER;
  let a = d >= 0 ? d : -d - 1; // threads from the centre
  for (const [kind, n] of HALF) {
    if (a < n) {
      if (kind === "tokko") return tokko((d + 0.5) / n, row);
      if (kind === "hana") return hana((a + 0.5) / n, row);
      return kind;
    }
    a -= n;
  }
  return "navy";
}

// tokko: a shaft with flared prongs at both ends and a gold knob in the
// middle, cream on red
function tokko(u, row) {
  const P = 36;
  const v = (((row % P) + 0.5) / P) * 2 - 1;
  const au = Math.abs(u);
  const av = Math.abs(v);
  if (av > 0.94) return "navy";
  if (av < 0.16 && au < 0.5) return "gold";
  if (au < 0.2 && av < 0.75) return "cream";
  if (av >= 0.5 && av < 0.88 && au < 0.2 + (av - 0.5) * 1.6) return "cream";
  return "red";
}

// hanazara: little diamond flowers with gold hearts, cream on blue
function hana(u, row) {
  const P = 12;
  const v = ((((row + 6) % P) + 0.5) / P) * 2 - 1;
  const r = Math.abs(u * 2 - 1) + Math.abs(v);
  if (r < 0.3) return "gold";
  if (r < 0.78) return "cream";
  return "blue";
}

const newLayer = () => {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  return canvas;
};

export async function hakataFace({ name = "JUN PARK" } = {}) {
  await document.fonts?.ready;
  seed = 13;
  // the kind of thread at each cell, front view
  const ROWS = Math.ceil(H / TW);
  const kinds = new Array(COLS * ROWS);
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) kinds[row * COLS + col] = patternAt(col, row);
  // each thread's yarn is a touch lighter or darker than the next
  const colJitter = Array.from({ length: COLS }, () => 1 + (rand() - 0.5) * 0.1);
  const rowJitter = Array.from({ length: ROWS }, () => 1 + (rand() - 0.5) * 0.06);

  const front = weave({
    kindAt: (x, y) => kinds[((y / TW) | 0) * COLS + ((x / TW) | 0)],
    colors: COLORS,
    // warp-faced: threads run up and down, each one rounded across and
    // rising and dipping over the weft (alternate threads out of step)
    profile: (x, y) => {
      const col = (x / TW) | 0;
      const fx = ((x % TW) + 0.5) / TW;
      const fy = (((y + (col & 1) * (TW >> 1)) % TW) + 0.5) / TW;
      return [Math.sin(Math.PI * fx), 0.78 + 0.22 * Math.sin(Math.PI * fy), colJitter[col]];
    },
    gloss: 0.62,
  });
  const fc = front.color.getContext("2d");
  const ff = front.finish.getContext("2d");
  const fh = front.height.getContext("2d");
  // Everything on the silk is gold: the chip, and the S and name in smooth,
  // raised gold foil pressed onto it.
  drawChip(fc, ff, fh, 130, H * 0.42, { light: "#ecd08a", dark: "#b8913f", line: "#8a6a2a" });
  const mark = await markStencil(150);
  stamp(fc, mark, 110, 110, "#e2bf6e");
  stamp(ff, mark, 110, 110, "rgb(255, 235, 0)");
  fh.filter = "blur(3px)";
  stamp(fh, mark, 110, 110, "rgb(170, 0, 0)");
  fh.filter = "none";
  const font = `96px "Tiny5", ui-monospace, monospace`;
  for (const ctx of [fc, ff, fh]) {
    ctx.font = font;
    ctx.textBaseline = "alphabetic";
    ctx.letterSpacing = "6px";
  }
  const nx = 110;
  const ny = H - 100;
  fc.fillStyle = "#e2bf6e";
  fc.fillText(name, nx, ny);
  ff.fillStyle = "rgb(255, 235, 0)";
  ff.fillText(name, nx, ny);
  fh.filter = "blur(3px)";
  fh.fillStyle = "rgb(170, 0, 0)";
  fh.fillText(name, nx, ny);
  fh.filter = "none";

  // the back: mirrored left to right, weft-faced (threads run across)
  const back = weave({
    kindAt: (x, y) => kinds[((y / TW) | 0) * COLS + (((W - 1 - x) / TW) | 0)],
    colors: BACK,
    profile: (x, y) => {
      const row = (y / TW) | 0;
      const fx = ((y % TW) + 0.5) / TW;
      const fy = (((x + (row & 1) * (TW >> 1)) % TW) + 0.5) / TW;
      return [Math.sin(Math.PI * fx), 0.8 + 0.2 * Math.sin(Math.PI * fy), rowJitter[row]];
    },
    gloss: 0.3,
    metalScale: 0.5,
  });
  floatsAndKnots(back);
  await backDetails(back);

  return { front, back };
}

// What makes the back read as a real card, kept sparse: a glossy black
// magnetic stripe, a little gold-foil small print and edition number, and a
// small gold S.
async function backDetails({ color, finish, height }) {
  const c = color.getContext("2d");
  const f = finish.getContext("2d");
  const h = height.getContext("2d");
  const pad = 110;

  // magnetic stripe: flat, smooth and glossy, pressed over the cloth
  const sy = H * 0.1;
  const sh = H * 0.18;
  c.fillStyle = "#0c0c0e";
  c.fillRect(0, sy, W, sh);
  f.fillStyle = "rgb(0, 225, 0)";
  f.fillRect(0, sy, W, sh);
  h.fillStyle = "rgb(90, 90, 90)";
  h.fillRect(0, sy, W, sh);

  // gold foil: raised, smooth, mirror-bright (a deeper gold than the
  // front's, to stand out on the pale back)
  const foil = (draw) => {
    c.fillStyle = "#b48a36";
    draw(c);
    f.fillStyle = "rgb(255, 235, 0)";
    draw(f);
    h.filter = "blur(2px)";
    h.fillStyle = "rgb(170, 0, 0)";
    draw(h);
    h.filter = "none";
  };
  const text = (str, x, y, size, align = "left") =>
    foil((ctx) => {
      ctx.font = `${size}px "Tiny5", ui-monospace, monospace`;
      ctx.letterSpacing = "3px";
      ctx.textAlign = align;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(str, x, y);
    });

  // all on the right: the woven band runs down the left on this side
  text("HAKATA-ORI EDITION", W - pad, H * 0.44, 40, "right");
  text("WOVEN SILK, FUKUOKA", W - pad, H * 0.44 + 52, 40, "right");
  const mark = await markStencil(84);
  text("NO. 001 / 001", W - pad - mark.width - 36, H - pad, 40, "right");
  foil((ctx) => stamp(ctx, mark, W - pad - mark.width, H - pad - mark.height + 8, ctx.fillStyle));
}

// Fills colour, finish and height for a whole side, pixel by pixel.
function weave({ kindAt, colors, profile, gloss, metalScale = 1 }) {
  const color = newLayer();
  const finish = newLayer();
  const height = newLayer();
  const ci = new ImageData(W, H);
  const fi = new ImageData(W, H);
  const hi = new ImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const kind = kindAt(x, y);
      const [across, along, jitter] = profile(x, y);
      const rounded = across * along; // 0 in the gaps, 1 on a thread's crest
      const shade = (0.7 + 0.3 * rounded) * jitter;
      const rgb = colors[kind];
      const i = (y * W + x) * 4;
      ci.data[i] = Math.min(255, rgb[0] * shade);
      ci.data[i + 1] = Math.min(255, rgb[1] * shade);
      ci.data[i + 2] = Math.min(255, rgb[2] * shade);
      ci.data[i + 3] = 255;
      const metal = (METAL[kind] || 0) * metalScale;
      fi.data[i] = metal * 255;
      fi.data[i + 1] = (metal ? 0.85 : gloss) * 255 * (0.6 + 0.4 * rounded);
      fi.data[i + 3] = 255;
      hi.data[i] = hi.data[i + 1] = hi.data[i + 2] = rounded * 140;
      hi.data[i + 3] = 255;
    }
  }
  color.getContext("2d").putImageData(ci, 0, 0);
  finish.getContext("2d").putImageData(fi, 0, 0);
  height.getContext("2d").putImageData(hi, 0, 0);
  return { color, finish, height };
}

// Areas of the back the loose threads stay out of: the magnetic stripe,
// the small print, and the edition number and S (see backDetails).
const KEEP_CLEAR = [
  [0, H * 0.1, W, H * 0.28],
  [W - 720, H * 0.44 - 44, W - 110, H * 0.44 + 62],
  [W - 620, H - 200, W - 110, H - 100],
];

// The back's loose ends: threads floating across a few cells, and the odd
// knot where one was tied off.
function floatsAndKnots({ color, finish, height }) {
  const c = color.getContext("2d");
  const f = finish.getContext("2d");
  const h = height.getContext("2d");
  const yarns = [
    [196, 158, 80, 1],
    [150, 46, 42, 0],
    [40, 48, 80, 0],
  ];
  c.lineCap = f.lineCap = h.lineCap = "round";
  for (let n = 0; n < 46; n++) {
    const [r, g, b, metal] = yarns[(rand() * yarns.length) | 0];
    const x = rand() * W;
    const y = (((rand() * H) / TW) | 0) * TW + TW / 2;
    const len = TW * (6 + rand() * 18);
    const sag = (rand() - 0.5) * TW * 1.5;
    // (they keep clear of the stripe and the small print)
    if (KEEP_CLEAR.some(([x0, y0, x1, y1]) => x + len > x0 - 20 && x < x1 + 20 && y > y0 - 20 && y < y1 + 20)) continue;
    const path = (ctx) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len / 2, y + sag, x + len, y + sag * 0.3);
    };
    c.strokeStyle = `rgb(${r},${g},${b})`;
    c.lineWidth = TW * 1.5;
    path(c);
    c.stroke();
    f.strokeStyle = `rgb(${metal * 200},150,0)`;
    f.lineWidth = TW * 1.5;
    path(f);
    f.stroke();
    h.filter = "blur(2px)";
    h.strokeStyle = "rgb(230,230,230)";
    h.lineWidth = TW * 1.4;
    path(h);
    h.stroke();
    h.filter = "none";
    // some end in a knot
    if (rand() < 0.3) {
      const kx = x + len;
      const ky = y + sag * 0.3;
      c.fillStyle = `rgb(${r * 0.9},${g * 0.9},${b * 0.9})`;
      c.beginPath();
      c.arc(kx, ky, TW * 1.8, 0, Math.PI * 2);
      c.fill();
      h.filter = "blur(3px)";
      h.fillStyle = "#fff";
      h.beginPath();
      h.arc(kx, ky, TW * 1.8, 0, Math.PI * 2);
      h.fill();
      h.filter = "none";
    }
  }
}
