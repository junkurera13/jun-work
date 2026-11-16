// JS mirror of the SDF used in the shader (src/shaders/common.glsl +
// scene.frag.glsl). Used for picking, fracture lookups and for keeping the
// liquid simulation glued to the melting surface.

export const BAR_BOTTOM = -4.8;
export const BAR_HEIGHT = 10.4;
export const BAR_MID = 0.4;
export const SHELL_T = 0.08;
export const STICK_HW = 0.95;
export const STICK_END_R = 0.95;
export const STICK_HT = 0.14;
export const STICK_Y0 = -9.5;
export const STICK_Y1 = 0.0;

// Faluda popsicle dimensions, mirror common.glsl. Same height and stick length
// as the Magic Choc bar.
const FALUDA_W = 2.62;
const FALUDA_T = 1.02;
const FALUDA_EDGE = 0.78;
export const FALUDA_SHELL = 0.46;
const FALUDA_STICK_W = 0.52;

const fract = (x) => x - Math.floor(x);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function hash12(x, y) {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.1031);
  let c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}

export function hash22(x, y) {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.103);
  let c = fract(x * 0.0973);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return [fract((a + b) * c), fract((a + c) * b)];
}

export function hash13(x, y, z) {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.1031);
  let c = fract(z * 0.1031);
  const d = a * (c + 31.32) + b * (b + 31.32) + c * (a + 31.32);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}

export function vnoise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return mix(
    mix(hash12(ix, iy), hash12(ix + 1, iy), ux),
    mix(hash12(ix, iy + 1), hash12(ix + 1, iy + 1), ux),
    uy,
  );
}

export function vnoise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash13(ix, iy, iz);
  const b = hash13(ix + 1, iy, iz);
  const c = hash13(ix, iy + 1, iz);
  const d = hash13(ix + 1, iy + 1, iz);
  const e = hash13(ix, iy, iz + 1);
  const f = hash13(ix + 1, iy, iz + 1);
  const g = hash13(ix, iy + 1, iz + 1);
  const h = hash13(ix + 1, iy + 1, iz + 1);
  return mix(mix(mix(a, b, ux), mix(c, d, ux), uy), mix(mix(e, f, ux), mix(g, h, ux), uy), uz);
}

export function sn3(x, y, z) {
  const a = Math.sin(x + Math.sin(y * 1.3 + 0.5) * 1.2) * Math.sin(y * 0.9 + Math.sin(z * 1.7 + 1.1) * 1.1);
  const b = Math.sin(z * 1.1 + x * 0.7 + Math.sin(y * 0.8) * 1.3);
  const c = Math.sin(y * 1.7 - x * 0.6 + Math.sin(z * 1.2 + x * 0.5) * 0.9);
  return 0.5 + 0.2 * a + 0.15 * b + 0.12 * c;
}

// Puffy egg-shaped paddle (superellipsoid / analytic gradient), mirrors common.glsl
export function sdBar(x, y, z) {
  const a = mix(2.98, 2.58, smoothstep(-3.2, 5.6, y));
  const b = 5.2;
  const c = 1.85;
  const n = mix(3.2, 2.62, smoothstep(-4.8, 5.6, y));
  const m = 2.6;
  const sx = Math.max(Math.abs(x) / a, 1e-5);
  const sy = Math.max(Math.abs(y - BAR_MID) / b, 1e-5);
  const sz = Math.max(Math.abs(z) / c, 1e-5);
  const u = Math.pow(Math.pow(sx, n) + Math.pow(sy, n), 1 / n);
  const f = Math.pow(Math.pow(u, m) + Math.pow(sz, m), 1 / m);
  const fm = Math.pow(f, 1 - m);
  const du = fm * Math.pow(u, m - 1) * Math.pow(u, 1 - n);
  const gx = (du * Math.pow(sx, n - 1)) / a;
  const gy = (du * Math.pow(sy, n - 1)) / b;
  const gz = (fm * Math.pow(sz, m - 1)) / c;
  return (f - 1) / Math.max(Math.hypot(gx, gy, gz), 1e-4);
}

// Lolly moulds sharing the faluda's flat stick (mirror common.glsl)
export const MOULD = { FALUDA: 0, COCO: 1, BERRY: 2, MINT: 3 };
const MINT_R = 1.38;
const MINT_RB = 0.32;
const BERRY_W0 = 2.85; // wide at the stick end
const BERRY_W1 = 1.32; // narrow at the tip
const BERRY_RC = 0.5;
const BERRY_T0 = 1.38;
const BERRY_T1 = 0.92;

function faludaCorner(y, mould) {
  if (mould === MOULD.BERRY) return BERRY_RC;
  if (mould === MOULD.COCO) return mix(0.38, 1.05, smoothstep(BAR_MID - 1, BAR_MID + 1, y));
  return mix(0.8, 2.05, smoothstep(BAR_MID - 1, BAR_MID + 1, y));
}

const COCO_GROOVE_X = 0.88;
function cocoGrooves(x, y) {
  const dx = Math.abs(Math.abs(x) - COCO_GROOVE_X);
  const along =
    smoothstep(BAR_BOTTOM + 0.35, BAR_BOTTOM + 0.95, y) *
    (1 - smoothstep(BAR_BOTTOM + BAR_HEIGHT - 1.75, BAR_BOTTOM + BAR_HEIGHT - 1, y));
  const prof = 1 - smoothstep(0, 0.15, dx);
  return 0.065 * prof * prof * (3 - 2 * prof) * along;
}

function roundedRect(x, y, w, h, radius) {
  const dx = Math.abs(x) - w + radius;
  const dy = Math.abs(y) - h + radius;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

function roundedExtrusion(profile, z, thickness, bevel) {
  const dx = profile + bevel;
  const dy = Math.abs(z) - thickness + bevel;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - bevel;
}

function trapezoid(px, py, r1, r2, he) {
  const k1x = r2;
  const k1y = he;
  const k2x = r2 - r1;
  const k2y = 2 * he;
  px = Math.abs(px);
  const cax = px - Math.min(px, py < 0 ? r1 : r2);
  const cay = Math.abs(py) - he;
  const t = clamp(((k1x - px) * k2x + (k1y - py) * k2y) / (k2x * k2x + k2y * k2y), 0, 1);
  const cbx = px - k1x + k2x * t;
  const cby = py - k1y + k2y * t;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
}

function lollyHalfThick(y, mould) {
  if (mould === MOULD.BERRY) return mix(BERRY_T0, BERRY_T1, clamp((y - BAR_BOTTOM) / BAR_HEIGHT, 0, 1));
  return FALUDA_T;
}

function mintCrust(x, y, z) {
  const edge =
    BAR_BOTTOM + 0.62 + 0.22 * (sn3(Math.atan2(x, z) * 2, 0, 1.7) - 0.5) + 0.12 * (vnoise3(x * 3, y * 3, z * 3) - 0.5);
  const m = 1 - smoothstep(edge - 0.08, edge + 0.08, y);
  if (m <= 0) return 0;
  return m * 0.1 * smoothstep(0.3, 0.75, vnoise3(x * 6 + 3, y * 6 + 3, z * 6 + 3) * 0.7 + vnoise3(x * 14 + 1, y * 14 + 1, z * 14 + 1) * 0.3);
}

function sdMintTube(x, y, z) {
  const dx = Math.hypot(x, z) - MINT_R + MINT_RB;
  const dy = Math.abs(y - BAR_MID) - BAR_HEIGHT / 2 + MINT_RB;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - MINT_RB;
}

export function sdFaluda(x, y, z, mould = MOULD.FALUDA) {
  if (mould === MOULD.MINT) return (sdMintTube(x, y, z) - mintCrust(x, y, z)) * 0.85;
  if (mould === MOULD.BERRY) {
    const ob = trapezoid(x, y - BAR_MID, BERRY_W0 - BERRY_RC, BERRY_W1 - BERRY_RC, BAR_HEIGHT / 2 - BERRY_RC) - BERRY_RC;
    const s = clamp((y - BAR_BOTTOM) / BAR_HEIGHT, 0, 1);
    const xn = x / mix(BERRY_W0, BERRY_W1, s);
    const tb = mix(BERRY_T0, BERRY_T1, s) * (1 - 0.15 * Math.sqrt(xn * xn + 0.03));
    return roundedExtrusion(ob, z, tb, 0.5) * 0.88;
  }
  const o = roundedRect(x, y - BAR_MID, FALUDA_W, BAR_HEIGHT / 2, faludaCorner(y, mould));
  const ex = x / FALUDA_W;
  const ey = (y - BAR_MID) / (BAR_HEIGHT / 2);
  if (mould === MOULD.COCO) {
    const tc = FALUDA_T - 0.05 * ex * ex - 0.03 * ey * ey;
    return (roundedExtrusion(o, z, tc, 0.6) + cocoGrooves(x, y)) * 0.88;
  }
  const t = FALUDA_T - 0.09 * ex * ex - 0.04 * ey * ey;
  return roundedExtrusion(o, z, t, FALUDA_EDGE) * 0.97;
}

export function sdBlob(x, y, z) {
  const cx = x / 2.5;
  const cy = (y - 0.1) / 4.9;
  const cz = z / 1.66;
  const k0 = Math.hypot(cx, cy, cz);
  const k1 = Math.hypot(cx / 2.5, cy / 4.9, cz / 1.66);
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-4);
}

function sdBlobSlim(x, y, z) {
  const cx = x / 1.45;
  const cy = (y - 0.1) / 4.9;
  const cz = z / 1.45;
  const k0 = Math.hypot(cx, cy, cz);
  const k1 = Math.hypot(cx / 1.45, cy / 4.9, cz / 1.45);
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-4);
}

export function sdMelting(x, y, z, morph, faluda, mould = MOULD.FALUDA) {
  const a = faluda ? sdFaluda(x, y, z, mould) : sdBar(x, y, z);
  if (!(morph > 0)) return a;
  const blob = faluda && mould === MOULD.MINT ? sdBlobSlim(x, y, z) : sdBlob(x, y, z);
  return a + (blob - a) * morph;
}

/** Map an object-space point to the undeformed reference bar (q-space). */
export function deformRef(x, y, z, sag, bulge, taper = 0, shrink = 0) {
  const qy = BAR_BOTTOM + (y - BAR_BOTTOM) * sag;
  const hn = clamp((qy - BAR_BOTTOM) / BAR_HEIGHT, 0, 1);
  const lo = (1 - hn) * (1 - hn);
  const bx = 1 + bulge * lo - taper * (0.3 + 0.7 * hn * hn);
  const bz = 1 + 0.7 * bulge * lo + 0.15 * taper;
  const k = 1 - shrink;
  return { x: x / (bx * k), y: qy, z: z / (bz * k), hn };
}

/** Inverse of deformRef. */
export function refToObj(qx, qy, qz, sag, bulge, taper = 0, shrink = 0) {
  const hn = clamp((qy - BAR_BOTTOM) / BAR_HEIGHT, 0, 1);
  const lo = (1 - hn) * (1 - hn);
  const bx = 1 + bulge * lo - taper * (0.3 + 0.7 * hn * hn);
  const bz = 1 + 0.7 * bulge * lo + 0.15 * taper;
  const k = 1 - shrink;
  return { x: qx * bx * k, y: BAR_BOTTOM + (qy - BAR_BOTTOM) / sag, z: qz * bz * k };
}

export function bodyOuter(x, y, z, M) {
  const q = deformRef(x, y, z, M.sag, M.bulge, M.taper, M.shrink);
  let d = sdMelting(q.x, q.y, q.z, M.morph, M.faluda, M.mould);
  if (M.erode > 0) {
    d += M.erode * (0.5 + 0.5 * q.hn);
    d += Math.min(M.erode, 1.2) * 0.5 * (sn3(x * 0.9 + 3.1, y * 0.9 + 7.7, z * 0.9 + 1.3) - 0.5);
    d += Math.min(M.erode, 0.5) * 0.12 * (sn3(x * 2.3 + 11, y * 2.3 + 5, z * 2.3 + 2) - 0.5);
  }
  return (d / M.sag) * (1 - 0.95 * (M.taper || 0)) * (1 - (M.shrink || 0));
}

export const STICK_WAIST_Y = -4.75;

export function stickHalfWidth(y) {
  return 0.62 + 0.33 * smoothstep(0.15, 3.75, Math.abs(y - STICK_WAIST_Y));
}

// Waisted paddle stick, mirrors sdStickBase in scene.frag.glsl
export function sdStick(x, y, z, faluda) {
  if (faluda) {
    const profile = roundedRect(x, y - STICK_WAIST_Y, FALUDA_STICK_W, -STICK_WAIST_Y, FALUDA_STICK_W);
    return roundedExtrusion(profile, z, STICK_HT, 0.06);
  }
  // exact mirror image across the pinch
  const ym = STICK_WAIST_Y - Math.abs(y - STICK_WAIST_Y);
  const yc0 = STICK_Y0 + STICK_END_R;
  let d2;
  if (ym < yc0) d2 = Math.hypot(x, ym - yc0) - stickHalfWidth(yc0);
  else d2 = (Math.abs(x) - stickHalfWidth(ym)) * 0.95;
  const re = 0.06;
  const wx = d2 + re;
  const wy = Math.abs(z) - STICK_HT + re;
  return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - re;
}

// ---------------------------------------------------------------- chart ----
// Cracks are drawn on a 2D chart that wraps all the way around the bar like
// a label: u runs around the cross-section (cm, 0 at the front centre, +/-
// pi*R at the back centre), v is simply the height y. Mirrors crackChart() in
// scene.frag.glsl.

/** Cross-section of the undeformed bar at height y: half width W, half thickness T. */
export function crossSection(y, faluda, mould = MOULD.FALUDA) {
  // the mint tube is round: the chart is simply the angle around it
  if (faluda && mould === MOULD.MINT) return { W: MINT_R, T: MINT_R, R: MINT_R };
  if (faluda) {
    const radius = faludaCorner(y, mould);
    const dy = Math.max(0, Math.abs(y - BAR_MID) - BAR_HEIGHT / 2 + radius);
    const w0 = mould === MOULD.BERRY ? mix(BERRY_W0, BERRY_W1, clamp((y - BAR_BOTTOM) / BAR_HEIGHT, 0, 1)) : FALUDA_W;
    const W = w0 - radius + Math.sqrt(Math.max(0, radius * radius - dy * dy));
    const T = lollyHalfThick(y, mould);
    return { W, T, R: (2 * (W + T)) / Math.PI };
  }
  const a = mix(2.98, 2.58, smoothstep(-3.2, 5.6, y));
  const n = mix(3.2, 2.62, smoothstep(-4.8, 5.6, y));
  const sy = Math.min(Math.abs(y - BAR_MID) / 5.2, 0.999);
  const W = Math.max(a * Math.pow(1 - Math.pow(sy, n), 1 / n), 0.05);
  const T = Math.max(1.85 * Math.pow(1 - Math.pow(sy, 2.6), 1 / 2.6), 0.05);
  return { W, T, R: 0.5 * (W + T), e: (W - T) / (W + T) };
}

/** Reference-space point -> chart (u, y). */
export function toChart(x, y, z, faluda, mould = MOULD.FALUDA) {
  const c = crossSection(y, faluda, mould);
  if (faluda && mould === MOULD.MINT) return { u: MINT_R * Math.atan2(x, z), y, R: MINT_R };
  if (faluda) {
    // Project onto the box perimeter so fractures keep their proportions on the flat faces.
    const nx = Math.abs(x) / c.W;
    const nz = Math.abs(z) / c.T;
    const distance = nx <= nz ? c.W * nx / Math.max(nz, 1e-5) : c.W + c.T * (1 - nz / nx);
    const u = z >= 0 ? distance : Math.PI * c.R - distance;
    return { u: x < 0 ? -u : u, y, R: c.R };
  }
  const phi = Math.atan2(x / c.W, z / c.T);
  return { u: c.R * (phi - 0.5 * c.e * Math.sin(2 * phi)), y, R: c.R };
}

/** Chart (u, y) -> reference-space surface direction (x on the surface, side +1 front / -1 back). */
export function fromChart(u, y, faluda, mould = MOULD.FALUDA) {
  const c = crossSection(y, faluda, mould);
  if (faluda && mould === MOULD.MINT) {
    const phi = u / MINT_R;
    return { x: MINT_R * Math.sin(phi), z: MINT_R * Math.cos(phi), side: Math.cos(phi) >= 0 ? 1 : -1 };
  }
  if (faluda) {
    const half = Math.PI * c.R;
    const wrapped = ((u + half) % (2 * half) + 2 * half) % (2 * half) - half;
    const side = Math.abs(wrapped) <= c.W + c.T ? 1 : -1;
    const distance = side === 1 ? Math.abs(wrapped) : half - Math.abs(wrapped);
    return {
      // Runs near the side start just inside the bevel on the corresponding face.
      x: Math.sign(wrapped) * Math.min(distance, c.W - 0.34),
      z: side * (c.T - Math.max(0, distance - c.W)),
      side,
    };
  }
  let phi = u / c.R;
  for (let i = 0; i < 4; i++) {
    const f = c.R * (phi - 0.5 * c.e * Math.sin(2 * phi)) - u;
    const df = c.R * (1 - c.e * Math.cos(2 * phi));
    phi -= f / df;
  }
  return { x: c.W * Math.sin(phi), z: c.T * Math.cos(phi), side: Math.cos(phi) >= 0 ? 1 : -1 };
}

