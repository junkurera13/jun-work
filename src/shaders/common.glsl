// ---------------------------------------------------------------------------
// Shared SDF / noise helpers. Units are centimetres. Object space:
// +y up along the bar, +z towards the default camera, origin = bar centre.
// Every function used for picking / simulation is mirrored in src/sim/shape.js
// ---------------------------------------------------------------------------

const float BAR_BOTTOM = -4.8;
const float BAR_HEIGHT = 10.4;
const float BAR_MID = 0.4;       // vertical centre of the bar
const float SHELL_T = 0.08;      // chocolate shell thickness (0.8 mm)

const float STICK_HW = 0.95;     // half width where it enters the bar
const float STICK_END_R = 0.95;  // radius of the broad rounded end
const float STICK_HT = 0.14;     // half thickness (a chunky 2.8 mm)
const float STICK_Y0 = -9.5;     // bottom extreme
const float STICK_Y1 = 0.0;      // top extreme (inside the bar): mirror of the bottom end
const float STICK_WAIST_Y = -4.75; // narrowest point: right where it leaves the ice cream

// Faluda popsicle: a slab of rose ice around a vanilla ice cream centre.
// Dimensions mirror src/sim/shape.js.
const float FALUDA_W = 2.62;      // half width
const float FALUDA_T = 1.02;      // half thickness at the middle of the faces
const float FALUDA_EDGE = 0.78;   // radius the faces roll over into the sides with
const float FALUDA_SHELL = 0.46;  // ice wall around the vanilla centre
const float FALUDA_STICK_W = 0.52; // a classic flat stick, round-ended

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
  float a = mix(2.98, 2.58, smoothstep(-3.2, 5.6, p.y));
  const float b = 5.2;
  const float c = 1.85;
  float n = mix(3.2, 2.62, smoothstep(-4.8, 5.6, p.y));
  const float m = 2.6;
  vec3 s = max(vec3(abs(p.x) / a, abs(p.y - BAR_MID) / b, abs(p.z) / c), vec3(1e-5));
  float u = pow(pow(s.x, n) + pow(s.y, n), 1.0 / n);
  float f = pow(pow(u, m) + pow(s.z, m), 1.0 / m);
  float fm = pow(f, 1.0 - m);
  float du = fm * pow(u, m - 1.0) * pow(u, 1.0 - n);
  vec3 g = vec3(du * pow(s.x, n - 1.0) / a, du * pow(s.y, n - 1.0) / b, fm * pow(s.z, m - 1.0) / c);
  return (f - 1.0) / max(length(g), 1e-4);
}

// The lolly moulds that share the faluda's flat stick and thick-ice cracking.
const int MOULD_FALUDA = 0;  // soft pillow, almost-round top
const int MOULD_COCO = 1;    // boxier, two grooves down each face
const int MOULD_BERRY = 2;   // tapered wedge: wide at the stick, narrowing to the tip
const int MOULD_MINT = 3;    // a thin cylinder, its bottom end crusted with cookie crumbs

// Mint choc mould: a slim round tube with softly rounded ends.
const float MINT_R = 1.38;   // radius
const float MINT_RB = 0.32;  // edge rounding at the ends

// The mint pop's bottom end is packed with chopped chocolate cookie: a
// ragged band (0..1) around the base where the crumbs are stuck on.
float mintCrustMask(vec3 p) {
  float edge = BAR_BOTTOM + 0.62 + 0.22 * (sn3(vec3(atan(p.x, p.z) * 2.0, 0.0, 1.7)) - 0.5) + 0.12 * (vnoise3(p * 3.0) - 0.5);
  return 1.0 - smoothstep(edge - 0.08, edge + 0.08, p.y);
}
// ...and the crumbs stand proud of the surface there: lumpy bits.
float mintCrust(vec3 p) {
  float m = mintCrustMask(p);
  if (m <= 0.0) return 0.0;
  return m * 0.1 * smoothstep(0.3, 0.75, vnoise3(p * 6.0 + 3.0) * 0.7 + vnoise3(p * 14.0 + 1.0) * 0.3);
}

float sdMintTube(vec3 p) {
  vec2 d = vec2(length(p.xz) - MINT_R + MINT_RB, abs(p.y - BAR_MID) - BAR_HEIGHT * 0.5 + MINT_RB);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - MINT_RB;
}

// Strawberry milk mould: a tapered wedge, wide and thick at the stick end,
// narrowing to the tip, with a soft ridge down the middle of each face.
// Half widths / half thicknesses at the bottom (stick end) and top.
const float BERRY_W0 = 2.85;
const float BERRY_W1 = 1.32;
const float BERRY_RC = 0.5;   // corner rounding
const float BERRY_T0 = 1.38;  // half thickness at the bottom...
const float BERRY_T1 = 0.92;  // ...and at the top

// Outline corner radius: a generous, almost-round top and small squared-off
// shoulders at the bottom where it was poured into the mould.
// The passionfruit-coconut mould is boxier, with tighter corners.
float faludaCorner(float y, int mould) {
  if (mould == MOULD_BERRY) return BERRY_RC;
  if (mould == MOULD_COCO) return mix(0.38, 1.05, smoothstep(BAR_MID - 1.0, BAR_MID + 1.0, y));
  return mix(0.8, 2.05, smoothstep(BAR_MID - 1.0, BAR_MID + 1.0, y));
}

float sdRoundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 d = abs(p) - halfSize + radius;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
}

float sdRoundedExtrusion(float profile, float z, float thickness, float bevel) {
  vec2 d = vec2(profile, abs(z) - thickness) + bevel;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - bevel;
}

float faludaOutline(vec2 p, int mould) {
  if (mould == MOULD_BERRY) {
    return sdTrapezoid(p - vec2(0.0, BAR_MID), BERRY_W0 - BERRY_RC, BERRY_W1 - BERRY_RC, BAR_HEIGHT * 0.5 - BERRY_RC) - BERRY_RC;
  }
  return sdRoundedRect(p - vec2(0.0, BAR_MID), vec2(FALUDA_W, BAR_HEIGHT * 0.5), faludaCorner(p.y, mould));
}

// Half width of the outline at height y (the crack chart needs it).
float lollyHalfWidth(float y, int mould) {
  float radius = faludaCorner(y, mould);
  float dy = max(0.0, abs(y - BAR_MID) - BAR_HEIGHT * 0.5 + radius);
  float w = FALUDA_W;
  if (mould == MOULD_BERRY) w = mix(BERRY_W0, BERRY_W1, clamp((y - BAR_BOTTOM) / BAR_HEIGHT, 0.0, 1.0));
  return w - radius + sqrt(max(0.0, radius * radius - dy * dy));
}

float lollyHalfThick(float y, int mould) {
  if (mould == MOULD_BERRY) return mix(BERRY_T0, BERRY_T1, clamp((y - BAR_BOTTOM) / BAR_HEIGHT, 0.0, 1.0));
  return FALUDA_T;
}

// The coconut mould's two grooves down each face, splitting it into three
// panels. They stop short of the bottom and of the rounded top.
const float COCO_GROOVE_X = 0.88;
float cocoGrooves(vec2 p) {
  float dx = abs(abs(p.x) - COCO_GROOVE_X);
  float along = smoothstep(BAR_BOTTOM + 0.35, BAR_BOTTOM + 0.95, p.y)
              * (1.0 - smoothstep(BAR_BOTTOM + BAR_HEIGHT - 1.75, BAR_BOTTOM + BAR_HEIGHT - 1.0, p.y));
  float prof = 1.0 - smoothstep(0.0, 0.15, dx);
  return 0.065 * prof * prof * (3.0 - 2.0 * prof) * along;
}

// A pillow, not a box: faces very slightly domed towards the middle, rolling
// over into the sides with a big soft radius (no flat bevel ledge).
float sdFaluda(vec3 p, int mould) {
  if (mould == MOULD_MINT) return (sdMintTube(p) - mintCrust(p)) * 0.85;
  float o = faludaOutline(p.xy, mould);
  if (mould == MOULD_BERRY) {
    // each face rises gently to a soft ridge down the middle
    float s = clamp((p.y - BAR_BOTTOM) / BAR_HEIGHT, 0.0, 1.0);
    float w = mix(BERRY_W0, BERRY_W1, s);
    float xn = p.x / w;
    float t = mix(BERRY_T0, BERRY_T1, s) * (1.0 - 0.15 * sqrt(xn * xn + 0.03));
    return sdRoundedExtrusion(o, p.z, t, 0.5) * 0.88;
  }
  // smooth in x and y (a dome built from the outline distance would crease)
  vec2 e = vec2(p.x / FALUDA_W, (p.y - BAR_MID) / (BAR_HEIGHT * 0.5));
  if (mould == MOULD_COCO) {
    // flatter faces, a tighter roll into the sides, and the two grooves
    float t = FALUDA_T - 0.05 * e.x * e.x - 0.03 * e.y * e.y;
    return (sdRoundedExtrusion(o, p.z, t, 0.6) + cocoGrooves(p.xy)) * 0.88;
  }
  float t = FALUDA_T - 0.09 * e.x * e.x - 0.04 * e.y * e.y;
  return sdRoundedExtrusion(o, p.z, t, FALUDA_EDGE) * 0.97;
}

// The shape a melting bar slumps towards: a soft rounded lump.
float sdBlob(vec3 p) {
  vec3 c = p - vec3(0.0, 0.1, 0.0);
  vec3 r = vec3(2.5, 4.9, 1.66);
  float k0 = length(c / r);
  float k1 = length(c / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-4);
}

// a slimmer lump for the thin mint tube, so it doesn't swell as it slumps
float sdBlobSlim(vec3 p) {
  vec3 c = p - vec3(0.0, 0.1, 0.0);
  vec3 r = vec3(1.45, 4.9, 1.45);
  float k0 = length(c / r);
  float k1 = length(c / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-4);
}

float sdMelting(vec3 q, float morph, bool faluda, int mould) {
  float a = faluda ? sdFaluda(q, mould) : sdBar(q);
  if (morph <= 0.0) return a;
  return mix(a, faluda && mould == MOULD_MINT ? sdBlobSlim(q) : sdBlob(q), morph);
}

