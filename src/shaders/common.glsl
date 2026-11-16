// ---------------------------------------------------------------------------
// Shared SDF / noise helpers. Units are centimetres. Object space:
// +y up along the bar, +z towards the default camera, origin = bar centre.
// Every function used for picking / simulation is mirrored in src/sim/shape.js
// ---------------------------------------------------------------------------

const float BAR_BOTTOM = -4.8;
const float BAR_HEIGHT = 9.6;
const float SHELL_T = 0.08;      // chocolate shell thickness (0.8 mm)

const float STICK_HW = 0.72;     // half width where it enters the bar
const float STICK_END_R = 0.84;  // radius of the broad rounded end
const float STICK_HT = 0.14;     // half thickness (a chunky 2.8 mm)
const float STICK_Y0 = -9.3;     // bottom extreme
const float STICK_Y1 = 2.1;      // top extreme (inside the bar)
const float STICK_WAIST_Y = -6.8; // narrowest point of the handle

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(i);
  float b = hash13(i + vec3(1, 0, 0));
  float c = hash13(i + vec3(0, 1, 0));
  float d = hash13(i + vec3(1, 1, 0));
  float e = hash13(i + vec3(0, 0, 1));
  float f1 = hash13(i + vec3(1, 0, 1));
  float g = hash13(i + vec3(0, 1, 1));
  float h = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y),
             mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
}

// Smooth, gridless "warped sines" noise in ~[0,1]. Used wherever the noise
// shapes geometry or large shading features (value noise shows its grid there).
float sn3(vec3 p) {
  float a = sin(p.x * 1.0 + sin(p.y * 1.3 + 0.5) * 1.2) * sin(p.y * 0.9 + sin(p.z * 1.7 + 1.1) * 1.1);
  float b = sin(p.z * 1.1 + p.x * 0.7 + sin(p.y * 0.8) * 1.3);
  float c = sin(p.y * 1.7 - p.x * 0.6 + sin(p.z * 1.2 + p.x * 0.5) * 0.9);
  return 0.5 + 0.2 * a + 0.15 * b + 0.12 * c;
}

float smin(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
// blend factor that goes with smin (0 -> a, 1 -> b)
float sminMix(float a, float b, float k) {
  if (k <= 0.0) return a < b ? 0.0 : 1.0;
  return clamp(0.5 + 0.5 * (a - b) / k, 0.0, 1.0);
}

float sdTrapezoid(vec2 p, float r1, float r2, float he) {
  vec2 k1 = vec2(r2, he);
  vec2 k2 = vec2(r2 - r1, 2.0 * he);
  p.x = abs(p.x);
  vec2 ca = vec2(p.x - min(p.x, (p.y < 0.0) ? r1 : r2), abs(p.y) - he);
  vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

// Round cone (iq) — used for every liquid primitive: runs, necks and drops.
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
  if (l2 < 1e-8) return length(p - a) - max(r1, r2);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// The undeformed bar: a soft, puffy egg-shaped paddle. The outline is a
// rounded oval (a superellipse, fuller towards the stick end), and the cross
// section is a pillow: broad domed faces melting into fully rounded edges.
// Distance = superellipsoid value / its analytic gradient.
float sdBar(vec3 p) {
  // broad, flatter base by the stick; narrower, rounder top
  float a = mix(2.98, 2.48, smoothstep(-3.2, 4.8, p.y));
  const float b = 4.8;
  const float c = 1.2;
  float n = mix(2.95, 2.45, smoothstep(-4.8, 4.8, p.y));
  const float m = 2.6;
  vec3 s = max(vec3(abs(p.x) / a, abs(p.y) / b, abs(p.z) / c), vec3(1e-5));
  float u = pow(pow(s.x, n) + pow(s.y, n), 1.0 / n);
  float f = pow(pow(u, m) + pow(s.z, m), 1.0 / m);
  float fm = pow(f, 1.0 - m);
  float du = fm * pow(u, m - 1.0) * pow(u, 1.0 - n);
  vec3 g = vec3(du * pow(s.x, n - 1.0) / a, du * pow(s.y, n - 1.0) / b, fm * pow(s.z, m - 1.0) / c);
  return (f - 1.0) / max(length(g), 1e-4);
}

// The shape a melting bar slumps towards: a soft rounded lump.
float sdBlob(vec3 p) {
  vec3 c = p - vec3(0.0, -0.3, 0.0);
  vec3 r = vec3(2.45, 4.5, 1.08);
  float k0 = length(c / r);
  float k1 = length(c / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-4);
}

float sdMelting(vec3 q, float morph) {
  float a = sdBar(q);
  if (morph <= 0.0) return a;
  return mix(a, sdBlob(q), morph);
}

