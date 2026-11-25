// Printed artwork for the tea box, the teabag's paper and its tag, drawn on
// canvases and used as textures. The box is printed card, so its graphics
// are flat print; the 3D lighting makes it real.

const font = (wt, size) => `${wt} ${size}px "Avenir Next", "Nunito", "Helvetica Neue", system-ui, sans-serif`;

function leaf(ctx, x, y, len, angle, light = "#9bd94e", dark = "#3f9a2a") {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const g = ctx.createLinearGradient(0, -len * 0.25, 0, len * 0.25);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(len * 0.3, -len * 0.3, len * 0.75, -len * 0.22, len, 0);
  ctx.bezierCurveTo(len * 0.75, len * 0.2, len * 0.3, len * 0.26, 0, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(230, 255, 190, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.04, len * 0.95, 0);
  ctx.stroke();
  ctx.restore();
}

const canvas = (w, h, scale) => {
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext("2d");
  ctx.scale(scale, scale);
  return [c, ctx];
};

// the green of the box, with a soft glow
function greenCard(ctx, w, h, glowAt) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#36b447");
  g.addColorStop(1, "#1f8f2f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (glowAt) {
    const r = ctx.createRadialGradient(glowAt.x, glowAt.y, 10, glowAt.x, glowAt.y, w * 0.6);
    r.addColorStop(0, "rgba(255, 255, 210, 0.7)");
    r.addColorStop(0.4, "rgba(220, 255, 160, 0.22)");
    r.addColorStop(1, "rgba(220, 255, 160, 0)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, w, h);
  }
}

/** The box front, 500 x 280 units. */
export function boxFront() {
  const w = 500;
  const h = 280;
  const [c, ctx] = canvas(w, h, 4);
  const sun = { x: w * 0.52, y: h * 0.36 };
  greenCard(ctx, w, h, sun);
  ctx.fillStyle = "rgba(255, 255, 220, 0.07)";
  for (let r = 0; r < 14; r++) {
    const a = (r / 14) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(sun.x, sun.y);
    ctx.arc(sun.x, sun.y, w, a, a + 0.12);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  for (const [bx, by, br] of [[70, 60, 34], [w - 90, 80, 40], [w - 140, 140, 26], [120, 150, 30]]) {
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  // the lid's edge
  ctx.fillStyle = "rgba(0, 60, 10, 0.2)";
  ctx.fillRect(0, h * 0.27, w, 2);

  const disc = ctx.createRadialGradient(sun.x - 20, sun.y - 24, 6, sun.x, sun.y, 78);
  disc.addColorStop(0, "#fffbd0");
  disc.addColorStop(0.45, "#ffe23a");
  disc.addColorStop(1, "#f0b800");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, 78, 0, Math.PI * 2);
  ctx.fill();

  const bw = 170;
  const bh = 64;
  const bx = sun.x - bw / 2;
  const by = sun.y - bh / 2 + 4;
  const badge = ctx.createLinearGradient(0, by, 0, by + bh);
  badge.addColorStop(0, "#e2333a");
  badge.addColorStop(1, "#a8121b");
  ctx.fillStyle = badge;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bx, by + 8);
  ctx.quadraticCurveTo(bx + bw / 2, by - 8, bx + bw, by + 8);
  ctx.lineTo(bx + bw, by + bh - 8);
  ctx.quadraticCurveTo(bx + bw / 2, by + bh + 8, bx, by + bh - 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = font(700, 38);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Ceylon", sun.x, by + bh / 2 + 1);

  ctx.font = font(500, 50);
  ctx.fillStyle = "#17652a";
  ctx.fillText("Greentea", sun.x + 10, h * 0.73);

  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = font(700, 26);
  ctx.fillText("ග්‍රීන් ටී", 22, h * 0.6);
  ctx.font = font(700, 22);
  ctx.fillText("கிரீன் டீ", 22, h * 0.71);

  leaf(ctx, 26, h * 0.8, 96, -0.12);
  leaf(ctx, w - 120, h * 0.83, 96, -0.4);
  leaf(ctx, w - 70, h * 0.68, 70, -1.5, "#b4e46a", "#4fa830");

  pureBand(ctx, w, h * 0.86, sun.x);
  return c;
}

function pureBand(ctx, w, y, cx) {
  const bh = 26;
  ctx.fillStyle = "#5cc85a";
  ctx.fillRect(0, y, w, bh);
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillRect(0, y - 2, w, 2);
  ctx.fillRect(0, y + bh, w, 2);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.font = font(700, 18);
  ctx.textAlign = "center";
  ctx.fillText("PURE", cx, y + bh / 2 + 1);
  ctx.textAlign = "left";
  ctx.font = font(700, 20);
  ctx.fillText("20", 18, y + bh / 2 + 1);
  ctx.font = font(600, 8);
  ctx.fillText("TEA BAGS", 46, y + 9);
  ctx.fillText("GREEN TEA", 46, y + 18);
  ctx.textAlign = "right";
  ctx.font = font(700, 20);
  ctx.fillText("26G", w - 18, y + bh / 2 + 1);
}

/** The box's ends, d x 280 units. */
export function boxSide(d) {
  const h = 280;
  const [c, ctx] = canvas(d, h, 4);
  greenCard(ctx, d, h, { x: d / 2, y: h * 0.4 });
  ctx.fillStyle = "rgba(0, 60, 10, 0.2)";
  ctx.fillRect(0, h * 0.27, d, 2);
  leaf(ctx, d * 0.2, h * 0.55, d * 0.6, -0.5);
  ctx.save();
  ctx.translate(d / 2, h * 0.42);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#fff";
  ctx.font = font(700, 22);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("GREEN TEA", 0, 0);
  ctx.restore();
  ctx.fillStyle = "#5cc85a";
  ctx.fillRect(0, h * 0.86, d, 26);
  return c;
}

/** The box's top (and bottom), 500 x d units. */
export function boxTop(d) {
  const w = 500;
  const [c, ctx] = canvas(w, d, 4);
  greenCard(ctx, w, d, { x: w * 0.52, y: d * 0.5 });
  // the red badge again, small, and "Greentea PURE"
  ctx.fillStyle = "#c81e26";
  ctx.beginPath();
  ctx.roundRect(w * 0.52 - 44, 14, 88, 26, 6);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = font(700, 16);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Ceylon", w * 0.52, 27);
  ctx.fillStyle = "#17652a";
  ctx.font = font(500, 26);
  ctx.fillText("Greentea", w * 0.52, d * 0.6);
  ctx.fillStyle = "#fff";
  ctx.font = font(700, 12);
  ctx.fillText("PURE", w * 0.52, d * 0.6 + 26);
  leaf(ctx, w - 110, d * 0.55, 80, -0.3);
  return c;
}

// a seeded random, so the bag looks the same every time
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** The bag's outline: a rectangle with its top corners folded in. */
export const BAG_SHAPE = { w: 380, h: 500, chamfer: 72 };

/**
 * Teabag paper, as in the photo: thin beige filter paper, a fold across the
 * top with the corners tucked in, a seam down the middle, and the leaves
 * settled in the bottom third. Transparent outside the outline.
 */
export function bagPaper() {
  const { w, h, chamfer: c } = BAG_SHAPE;
  const [cv, ctx] = canvas(w, h, 2);
  const r = seeded(11);
  ctx.beginPath();
  ctx.moveTo(c, 0);
  ctx.lineTo(w - c, 0);
  ctx.lineTo(w, c);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.lineTo(0, c);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = "#e9dcc0";
  ctx.fillRect(0, 0, w, h);
  // the paper is uneven: lighter and darker clouds
  for (let i = 0; i < 160; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 10 + r() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const tone = r() < 0.5 ? "255, 250, 235" : "190, 165, 120";
    g.addColorStop(0, `rgba(${tone}, ${0.08 + r() * 0.1})`);
    g.addColorStop(1, `rgba(${tone}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // the folded flap at the top
  ctx.fillStyle = "rgba(255, 250, 235, 0.25)";
  ctx.fillRect(0, 0, w, c * 1.05);
  ctx.fillStyle = "rgba(150, 125, 85, 0.25)";
  ctx.fillRect(0, c * 1.05, w, 2);

  // the leaves, settled in a mound along the bottom
  const top = (x) => h * 0.63 + Math.sin(x * 0.03 + 1) * 10 + Math.sin(x * 0.11) * 5 + Math.sin(x * 0.27 + 2) * 3;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) ctx.lineTo(x, top(x));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = "#5d6150";
  ctx.fill();
  for (let i = 0; i < 9000; i++) {
    const x = r() * w;
    const y0 = top(x) - 6;
    const y = y0 + (h - y0) * r();
    const k = r();
    ctx.fillStyle = k < 0.45 ? `rgba(40, 44, 34, ${0.5 + r() * 0.4})` : k < 0.8 ? `rgba(95, 102, 80, ${0.5 + r() * 0.4})` : `rgba(170, 170, 140, ${0.4 + r() * 0.4})`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r() * Math.PI);
    ctx.fillRect(-2, -0.7, 2 + r() * 5, 1 + r() * 1.6);
    ctx.restore();
  }
  // a few strays above the mound
  for (let i = 0; i < 70; i++) {
    const x = r() * w;
    ctx.fillStyle = `rgba(60, 64, 50, ${0.3 + r() * 0.4})`;
    ctx.fillRect(x, top(x) - 4 - r() * 50, 2 + r() * 3, 1.2);
  }

  // the seam down the middle, a double layer of paper
  const sx = w * 0.47;
  const sw = w * 0.085;
  ctx.fillStyle = "rgba(160, 130, 85, 0.16)";
  ctx.fillRect(sx, c * 0.4, sw, h);
  ctx.fillStyle = "rgba(140, 110, 70, 0.22)";
  ctx.fillRect(sx, c * 0.4, 1.5, h);
  ctx.fillRect(sx + sw, c * 0.4, 1.5, h);

  // fibres all over
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 1400; i++) {
    const x = r() * w;
    const y = r() * h;
    ctx.strokeStyle = `rgba(255, 252, 240, ${0.15 + r() * 0.3})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (r() - 0.5) * 10, y + (r() - 0.5) * 10, x + (r() - 0.5) * 20, y + (r() - 0.5) * 8);
    ctx.stroke();
  }
  // the sealed bottom edge
  ctx.fillStyle = "rgba(200, 180, 140, 0.6)";
  ctx.fillRect(0, h - 5, w, 5);
  return cv;
}

/** The tag's outline: corners cut, a notch top and bottom. */
export const TAG_SHAPE = { w: 230, h: 265, corner: 34, notch: 20 };

/** The tag: plain green card, as in the photo. Transparent outside it. */
export function tagArt() {
  const { w, h, corner: k, notch: n } = TAG_SHAPE;
  const [cv, ctx] = canvas(w, h, 3);
  const r = seeded(5);
  ctx.beginPath();
  ctx.moveTo(k, 0);
  ctx.lineTo(w / 2 - n * 0.6, 0);
  ctx.lineTo(w / 2, n);
  ctx.lineTo(w / 2 + n * 0.6, 0);
  ctx.lineTo(w - k, 0);
  ctx.lineTo(w, k);
  ctx.lineTo(w, h - k);
  ctx.lineTo(w - k, h);
  ctx.lineTo(w / 2 + n * 0.6, h);
  ctx.lineTo(w / 2, h - n);
  ctx.lineTo(w / 2 - n * 0.6, h);
  ctx.lineTo(k, h);
  ctx.lineTo(0, h - k);
  ctx.lineTo(0, k);
  ctx.closePath();
  ctx.fillStyle = "#4b8a3b";
  ctx.fill();
  ctx.save();
  ctx.clip();
  // card grain
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = r() < 0.5 ? `rgba(30, 70, 25, ${r() * 0.25})` : `rgba(140, 190, 110, ${r() * 0.2})`;
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
  ctx.restore();
  return cv;
}

/** A soft round puff, for steam and the tea's plumes. */
export function puff() {
  const [c, ctx] = canvas(128, 128, 1);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255, 255, 255, 1)");
  g.addColorStop(0.4, "rgba(255, 255, 255, 0.55)");
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}
