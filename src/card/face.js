// A card has a front and a back, each three images the same size, in the
// card's proportions:
//   color:  the artwork itself
//   finish: red = how metallic (foil), green = how glossy (0 matte, 1 mirror)
//   height: red = how raised (0 flat, 1 fully embossed); soft edges give a
//           rounded bevel
// Design them anywhere (Figma, Paper) and load them with loadFace(). Until a
// real card exists, placeholderFace() draws one in code. (The back is drawn
// as you'd see it looking at the back, not mirrored.)

export const CARD_ASPECT = 85.6 / 53.98; // a standard bank card
export const W = 1600;
export const H = Math.round(W / CARD_ASPECT);

export const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const loadSide = async ({ color, finish, height }) => {
  const [c, f, h] = await Promise.all([color, finish, height].map(loadImage));
  return { color: c, finish: f, height: h };
};

/** Load a designed card: { front, back }, each { color, finish, height } image URLs. */
export async function loadFace({ front, back }) {
  const [f, b] = await Promise.all([loadSide(front), loadSide(back)]);
  return { front: f, back: b };
}

const layer = (fill) => {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, W, H);
  return [canvas, ctx];
};

// The Slate mark as a white stencil, so each layer can paint it its own way.
export async function markStencil(width) {
  const svg = await fetch("/images/play/slate-mark.svg").then((r) => r.text());
  const img = await loadImage(URL.createObjectURL(new Blob([svg.replaceAll("currentColor", "#fff")], { type: "image/svg+xml" })));
  const height = (width * img.naturalHeight) / img.naturalWidth || width;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return canvas;
}

// paints a white stencil onto ctx at (x, y) in one colour
export const stamp = (ctx, stencil, x, y, fill) => {
  const tmp = document.createElement("canvas");
  tmp.width = stencil.width;
  tmp.height = stencil.height;
  const t = tmp.getContext("2d");
  t.drawImage(stencil, 0, 0);
  t.globalCompositeOperation = "source-in";
  t.fillStyle = fill;
  t.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(tmp, x, y);
};

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/** A metal chip with engraved contact lines, drawn on all three layers. */
export function drawChip(c, f, h, x0, y0, { light = "#d6cfbf", dark = "#a59d8b", line = "#7d7566" } = {}) {
  const chip = { x: x0, y: y0, w: 200, h: 156, r: 26 };
  const chipFill = c.createLinearGradient(chip.x, chip.y, chip.x + chip.w, chip.y + chip.h);
  chipFill.addColorStop(0, light);
  chipFill.addColorStop(1, dark);
  c.fillStyle = chipFill;
  roundRect(c, chip.x, chip.y, chip.w, chip.h, chip.r);
  c.fill();
  f.fillStyle = "rgb(255, 170, 0)";
  roundRect(f, chip.x, chip.y, chip.w, chip.h, chip.r);
  f.fill();
  h.fillStyle = "rgb(60, 0, 0)";
  roundRect(h, chip.x, chip.y, chip.w, chip.h, chip.r);
  h.fill();
  // contact lines: darker in colour, cut into the height
  const lines = (ctx, style, width) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    const { x, y, w, h: ch } = chip;
    ctx.moveTo(x, y + ch / 3);
    ctx.lineTo(x + w * 0.36, y + ch / 3);
    ctx.moveTo(x, y + (ch * 2) / 3);
    ctx.lineTo(x + w * 0.36, y + (ch * 2) / 3);
    ctx.moveTo(x + w, y + ch / 3);
    ctx.lineTo(x + w * 0.64, y + ch / 3);
    ctx.moveTo(x + w, y + (ch * 2) / 3);
    ctx.lineTo(x + w * 0.64, y + (ch * 2) / 3);
    ctx.rect(x + w * 0.36, y + ch * 0.22, w * 0.28, ch * 0.56);
    ctx.stroke();
  };
  lines(c, line, 5);
  lines(h, "#000", 6);

}

/**
 * A plain stand-in face: charcoal satin card, a foil Slate mark top left,
 * a metal chip, and the name embossed in silver along the bottom.
 */
export async function placeholderFace({ name = "JUN PARK" } = {}) {
  await document.fonts?.ready;
  const [front, back] = await Promise.all([placeholderFront(name), placeholderBack()]);
  return { front, back };
}

async function placeholderFront(name) {
  const mark = await markStencil(150);
  const [color, c] = layer("#1d1e21");
  const [finish, f] = layer("rgb(0, 90, 0)"); // not metal, satin
  const [height, h] = layer("#000");

  // a soft wash so the colour isn't dead flat
  const wash = c.createLinearGradient(0, 0, W, H);
  wash.addColorStop(0, "#2b2c30");
  wash.addColorStop(1, "#141517");
  c.fillStyle = wash;
  c.fillRect(0, 0, W, H);

  const pad = 110;

  // the Slate mark: bright foil, slightly raised
  stamp(c, mark, pad, pad, "#d9d9db");
  stamp(f, mark, pad, pad, "rgb(255, 235, 0)");
  h.filter = "blur(3px)";
  stamp(h, mark, pad, pad, "rgb(150, 0, 0)");
  h.filter = "none";

  drawChip(c, f, h, pad + 20, H * 0.42);

  // the name: embossed silver capitals along the bottom
  const font = `500 64px "Azeret Mono", ui-monospace, monospace`;
  const tx = pad;
  const ty = H - pad;
  c.font = f.font = h.font = font;
  c.textBaseline = f.textBaseline = h.textBaseline = "alphabetic";
  for (const ctx of [c, f, h]) ctx.letterSpacing = "8px";
  c.fillStyle = "#c9c9cc";
  c.fillText(name, tx, ty);
  f.fillStyle = "rgb(230, 200, 0)";
  f.fillText(name, tx, ty);
  h.filter = "blur(4px)";
  h.fillStyle = "#fff";
  h.fillText(name, tx, ty);
  h.filter = "none";

  return { color, finish, height };
}

// The back: a glossy black magnetic stripe, a pale signature strip, a few
// lines of small print and a small foil mark.
async function placeholderBack() {
  const mark = await markStencil(84);
  const [color, c] = layer("#1d1e21");
  const [finish, f] = layer("rgb(0, 90, 0)");
  const [height, h] = layer("#000");
  const wash = c.createLinearGradient(W, 0, 0, H);
  wash.addColorStop(0, "#2b2c30");
  wash.addColorStop(1, "#141517");
  c.fillStyle = wash;
  c.fillRect(0, 0, W, H);

  // magnetic stripe
  const stripe = { y: H * 0.1, h: H * 0.19 };
  c.fillStyle = "#0b0b0c";
  c.fillRect(0, stripe.y, W, stripe.h);
  f.fillStyle = "rgb(0, 230, 0)";
  f.fillRect(0, stripe.y, W, stripe.h);

  // signature strip, slightly raised, with a fine diagonal pattern
  const pad = 110;
  const sig = { x: pad, y: H * 0.4, w: W * 0.58, h: 120 };
  c.save();
  c.beginPath();
  c.rect(sig.x, sig.y, sig.w, sig.h);
  c.clip();
  c.fillStyle = "#d8d8d4";
  c.fillRect(sig.x, sig.y, sig.w, sig.h);
  c.strokeStyle = "#c3c3be";
  c.lineWidth = 3;
  for (let x = sig.x - sig.h; x < sig.x + sig.w; x += 14) {
    c.beginPath();
    c.moveTo(x, sig.y + sig.h);
    c.lineTo(x + sig.h, sig.y);
    c.stroke();
  }
  c.restore();
  f.fillStyle = "rgb(0, 40, 0)";
  f.fillRect(sig.x, sig.y, sig.w, sig.h);
  h.filter = "blur(2px)";
  h.fillStyle = "rgb(70, 0, 0)";
  h.fillRect(sig.x, sig.y, sig.w, sig.h);
  h.filter = "none";
  // the three digits beside it
  c.fillStyle = "#c9c9cc";
  c.font = `500 44px "Azeret Mono", ui-monospace, monospace`;
  c.textBaseline = "middle";
  c.fillText("013", sig.x + sig.w + 36, sig.y + sig.h / 2);

  // small print
  c.fillStyle = "#77787d";
  c.font = `400 26px "Azeret Mono", ui-monospace, monospace`;
  c.textBaseline = "alphabetic";
  const lines = ["A PLAY CARD, NOT A PAYMENT CARD.", "MADE BY JUN PARK FOR FUN.", "IF FOUND, KEEP IT. IT LOOKS GOOD ON YOU."];
  lines.forEach((line, i) => c.fillText(line, pad, H * 0.7 + i * 42));

  // small foil mark, bottom right
  const mx = W - pad - mark.width;
  const my = H - pad - mark.height;
  stamp(c, mark, mx, my, "#d9d9db");
  stamp(f, mark, mx, my, "rgb(255, 235, 0)");
  h.filter = "blur(2px)";
  stamp(h, mark, mx, my, "rgb(150, 0, 0)");
  h.filter = "none";

  return { color, finish, height };
}
