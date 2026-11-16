// JS mirror of the SDF used in the shader (src/shaders/common.glsl +
// scene.frag.glsl). Used for picking, fracture lookups and for keeping the
// liquid simulation glued to the melting surface.

export const BAR_BOTTOM = -4.8;
export const BAR_HEIGHT = 9.6;
export const SHELL_T = 0.13;
export const STICK_HW = 0.47;
export const STICK_HT = 0.1;
export const STICK_Y0 = -9.3;
export const STICK_Y1 = 2.1;

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

function sdTrapezoid(px, py, r1, r2, he) {
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

export function sdBar(x, y, z) {
  const r = mix(0.62, 2.0, smoothstep(-0.8, 4.4, y));
  const d2 = sdTrapezoid(x, y, 2.4 - r, 2.8 - r, 4.8 - r) - r;
  const xn = clamp(x / 2.8, -1, 1);
  const h = 0.93 + 0.11 * (1 - xn * xn) - 0.03 * smoothstep(0, 4.8, y);
  const re = 0.66;
  const wx = d2 + re;
  const wy = Math.abs(z) - h + re;
  return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - re;
}

export function sdBlob(x, y, z) {
  const cx = x / 2.45;
  const cy = (y + 0.3) / 4.5;
  const cz = z / 1.08;
  const k0 = Math.hypot(cx, cy, cz);
  const k1 = Math.hypot(cx / 2.45, cy / 4.5, cz / 1.08);
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-4);
}

export function sdMelting(x, y, z, morph) {
  const a = sdBar(x, y, z);
  if (!(morph > 0)) return a;
  return a + (sdBlob(x, y, z) - a) * morph;
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
  let d = sdMelting(q.x, q.y, q.z, M.morph);
  if (M.erode > 0) {
    d += M.erode * (0.5 + 0.5 * q.hn);
    d += Math.min(M.erode, 1.2) * 0.5 * (sn3(x * 0.9 + 3.1, y * 0.9 + 7.7, z * 0.9 + 1.3) - 0.5);
    d += Math.min(M.erode, 0.5) * 0.12 * (sn3(x * 2.3 + 11, y * 2.3 + 5, z * 2.3 + 2) - 0.5);
  }
  return (d / M.sag) * (1 - 0.95 * (M.taper || 0)) * (1 - (M.shrink || 0));
}

export function sdStick(x, y, z) {
  const qy = y - clamp(y, STICK_Y0 + STICK_HW, STICK_Y1 - STICK_HW);
  const d2 = Math.hypot(x, qy) - STICK_HW;
  const re = 0.045;
  const wx = d2 + re;
  const wy = Math.abs(z) - STICK_HT + re;
  return Math.min(Math.max(wx, wy), 0) + Math.hypot(Math.max(wx, 0), Math.max(wy, 0)) - re;
}
