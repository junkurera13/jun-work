#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

out vec4 outColor;

uniform vec2 uRes;
uniform vec3 uCamPos;      // object space
uniform mat3 uCamBasis;    // object space (right, up, forward)
uniform float uTanHalfFov;
uniform mat3 uObjRot;      // object -> world rotation
uniform float uTime;

uniform vec3 uBoundMin;
uniform vec3 uBoundMax;

// melt
uniform float uSag;
uniform float uBulge;
uniform float uTaper;
uniform float uMorph;
uniform float uShrink;
uniform float uErode;
uniform float uMeltV;
uniform float uMeltC;
uniform float uChocGone;
uniform float uStickK;
uniform float uWet;

// fracture
uniform float uCracks;
uniform float uOoze;
uniform sampler2D uCrackTex;

// dynamic objects
uniform sampler2D uDyn;
uniform int uPrimCount;
uniform int uCrumbCount;
uniform vec3 uLiqMin;
uniform vec3 uLiqMax;

uniform sampler2D uTextTex;
uniform float uExposure;

#include "common.glsl"

const float TEXT_Y0 = -4.3;
const float TEXT_Y1 = -0.15;
const int MAX_PRIMS = 64;
const int MAX_CRUMBS = 24;

struct Parts {
  float shell;
  float core;
  float body;
  float stick;
  float liq;
  float liqC;
  float frag;
  float fragSide;   // 0 outer chocolate, 1 fracture edge, 2 inner (vanilla smear)
  float crumb;
  float outer;
  float hn;
  float fill;
  float hole;
  float sink;
  float cao;
  vec3 q;
};

// ---------------------------------------------------------------- body ----

vec3 deformRef(vec3 p, float sag, float bulge, float taper, float shrink, out float hn) {
  vec3 q = p;
  q.y = BAR_BOTTOM + (p.y - BAR_BOTTOM) * sag;
  hn = clamp((q.y - BAR_BOTTOM) / BAR_HEIGHT, 0.0, 1.0);
  float lo = (1.0 - hn) * (1.0 - hn);
  float bx = 1.0 + bulge * lo - taper * (0.3 + 0.7 * hn * hn);
  float bz = 1.0 + 0.7 * bulge * lo + 0.15 * taper;
  q.x /= bx * (1.0 - shrink);
  q.z /= bz * (1.0 - shrink);
  return q;
}

float bodyOuter(vec3 p, out vec3 q, out float hn) {
  q = deformRef(p, uSag, uBulge, uTaper, uShrink, hn);
  float d = sdMelting(q, uMorph);
  if (uErode > 0.0) {
    d += uErode * (0.5 + 0.5 * hn);
    d += min(uErode, 1.2) * 0.5 * (sn3(p * 0.9 + vec3(3.1, 7.7, 1.3)) - 0.5);
    d += min(uErode, 0.5) * 0.12 * (sn3(p * 2.3 + vec3(11.0, 5.0, 2.0)) - 0.5);
  }
  // keep the field conservative where the taper squeezes the top
  return d / uSag * (1.0 - 0.95 * uTaper) * (1.0 - uShrink);
}

// Cracks, crushed holes and pushed-in plates are painted by the CPU into a
// texture over the shell (reference space; front face left, back face right):
// R = crack/hole mask, G = halo where squeezed vanilla may show, B = push-in.
// Returns the groove field (negative inside a crack or hole).
// Chart that wraps all the way around the bar (mirrors toChart in shape.js).
float crackU(vec3 q) {
  float y = q.y;
  float a = mix(2.98, 2.58, smoothstep(-3.2, 5.6, y));
  float n = mix(3.2, 2.62, smoothstep(-4.8, 5.6, y));
  float sy = min(abs(y - BAR_MID) / 5.2, 0.999);
  float W = max(a * pow(1.0 - pow(sy, n), 1.0 / n), 0.05);
  float T = max(1.85 * pow(1.0 - pow(sy, 2.6), 1.0 / 2.6), 0.05);
  float R = 0.5 * (W + T);
  float e = (W - T) / (W + T);
  float phi = atan(q.x / W, q.z / T);
  return R * (phi - 0.5 * e * sin(2.0 * phi));
}

float crackField(vec3 q, out float sink, out float fill, out float inHole, out float holeEdge,
                 out float recess, out float gapAO) {
  vec2 uv = vec2((crackU(q) + 8.96) / 17.92, (6.1 - q.y) / 11.52);
  vec4 t = textureLod(uCrackTex, uv, 0.0);
  // blurred copies of the crack mask (mip levels): how much crack is nearby
  float near = textureLod(uCrackTex, uv, 2.0).r;
  float wide = textureLod(uCrackTex, uv, 3.5).r;
  float heal = 1.0 - smoothstep(0.45, 0.85, uMeltC);
  // pushed-in plates, plus chipped, rounded lips curling down into each crack
  float lip = 0.045 * smoothstep(0.04, 0.5, near) * (1.0 - smoothstep(0.35, 0.6, t.r));
  sink = (t.b * 0.13 + lip) * heal;
  // the soft ice cream under a crack is pushed down and away: you look down
  // into the gap past the chocolate walls
  recess = 0.09 * smoothstep(0.03, 0.45, wide) * heal;
  // narrow, deep gaps are shadowed inside; wide openings stay bright
  gapAO = mix(0.72, 1.0, smoothstep(0.12, 0.6, near));
  // only right next to an actual crack
  fill = uOoze * heal * smoothstep(0.02, 0.25, near);
  inHole = step(0.6, t.g) * step(0.9, t.r);
  holeEdge = inHole > 0.5 ? -0.2 : 1e5;
  // R crosses 0.5 at the crack edge; ~1 texel (0.01 cm) per 0.5 of mask
  return (0.5 - t.r * heal) * 0.02;
}

void bodyEval(vec3 p, inout Parts P) {
  vec3 q;
  float hn;
  float dO = bodyOuter(p, q, hn);
  P.outer = dO;
  P.hn = hn;
  P.q = q;
  float tcE = SHELL_T * (1.0 - 0.6 * uMeltC);
  float dCore = dO + tcE;
  float dShell = dO;
  if (uCracks > 0.5 && dO < 0.35 && dO > -0.6) {
    float sink, fill, inHole, holeEdge, recess, gapAO;
    float vd = crackField(q, sink, fill, inHole, holeEdge, recess, gapAO);
    // the press pushes shell and ice cream in together
    dShell = max(dO + sink, -vd);
    dCore += sink + recess;
    P.cao = gapAO;
    P.sink = sink;
    P.fill = fill;
    P.hole = inHole;
    if (inHole > 0.5) {
      // exposed vanilla in a crushed hole softens and slumps
      dCore += 0.2 * uMeltV * smoothstep(0.0, 0.4, -holeEdge);
    }
    if (fill > 0.0) {
      // softened vanilla creeps up *inside* the cracks, a little more as it
      // melts, until it forms a thin glossy bead along the crack line
      float level = dO + sink + (tcE + recess) * (1.0 - fill) - 0.018 * fill * fill;
      // vd is only +0.01 away from cracks, so the spread must stay below that
      float dFill = max(level, vd - 0.006 * fill);
      dCore = smin(dCore, dFill, 0.02);
    }
  }
  if (uChocGone > 0.0) {
    float g = (1.0 - hn) * 0.3 + sn3(q * 1.3 + 5.0) * 0.7;
    float keep = g - uChocGone;
    dShell = max(dShell, -keep * 0.45);
  }
  P.shell = dShell;
  P.core = dCore;
  P.body = min(dShell, dCore);
}

// --------------------------------------------------------------- stick ----

// Half width along a Magnum-style stick. The visible handle starts narrow
// where it leaves the ice cream and fans out to a broad rounded end; inside
// the ice cream (hidden until it melts) it widens again into a broad paddle.
// The flare is mirrored exactly above and below the pinch.
float stickHalfWidth(float y) {
  return 0.62 + 0.33 * smoothstep(0.15, 3.75, abs(y - STICK_WAIST_Y));
}

float sdStickBase(vec3 p) {
  // the stick is an exact mirror image of itself across the pinch
  float ym = STICK_WAIST_Y - abs(p.y - STICK_WAIST_Y);
  float yc0 = STICK_Y0 + STICK_END_R;
  float d2;
  if (ym < yc0) {
    d2 = length(vec2(p.x, ym - yc0)) - stickHalfWidth(yc0);
  } else {
    d2 = (abs(p.x) - stickHalfWidth(ym)) * 0.95;
  }
  float re = 0.06;
  vec2 w = vec2(d2 + re, abs(p.z) - STICK_HT + re);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - re;
}

float engraveMask(vec3 p) {
  vec2 uv = vec2(p.x / (2.0 * STICK_HW) + 0.5, (p.y - TEXT_Y0) / (TEXT_Y1 - TEXT_Y0));
  if (p.z < 0.0) uv.x = 1.0 - uv.x;
  if (uv.y <= 0.0 || uv.y >= 1.0 || uv.x <= 0.0 || uv.x >= 1.0) return 0.0;
  return texture(uTextTex, vec2(uv.x, 1.0 - uv.y)).r;
}

float sdStick(vec3 p) {
  float d = sdStickBase(p);
  if (d < 0.06 && abs(p.z) > 0.05) d += 0.032 * engraveMask(p);
  return d;
}

// -------------------------------------------------------------- liquid ----

float liquid(vec3 p, bool full, out float chocW) {
  chocW = 0.0;
  if (uPrimCount == 0) return 1e5;
  vec3 o = max(uLiqMin - p, p - uLiqMax);
  float bd = length(max(o, 0.0));
  if (bd > 0.25) return bd;
  float d = 1e5;
  for (int i = 0; i < MAX_PRIMS; i++) {
    if (i >= uPrimCount) break;
    vec4 A = texelFetch(uDyn, ivec2(i, 0), 0);
    vec4 B = texelFetch(uDyn, ivec2(i, 1), 0);
    float di = sdRoundCone(p, A.xyz, B.xyz, A.w, B.w);
    if (full) {
      float m = texelFetch(uDyn, ivec2(i, 2), 0).x;
      chocW = mix(chocW, m, sminMix(d, di, 0.05));
    }
    d = smin(d, di, 0.04);
  }
  return d;
}

vec3 qrot(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

float crumbs(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < MAX_CRUMBS; i++) {
    if (i >= uCrumbCount) break;
    vec4 ps = texelFetch(uDyn, ivec2(i, 9), 0);
    vec3 rp = p - ps.xyz;
    float bs = length(rp) - ps.w * 1.3;
    if (bs > 0.03) { d = min(d, bs); continue; }
    vec4 qq = texelFetch(uDyn, ivec2(i, 10), 0);
    vec3 lp = qrot(vec4(-qq.xyz, qq.w), rp) / ps.w;
    vec3 b = vec3(1.0, 0.72, 0.28);
    vec3 dq = abs(lp) - b + 0.12;
    float db = length(max(dq, 0.0)) + min(max(dq.x, max(dq.y, dq.z)), 0.0) - 0.12;
    db = max(db, dot(lp, normalize(vec3(0.7, 0.5, 0.2))) - 0.55);
    d = min(d, db * ps.w);
  }
  return d;
}

// --------------------------------------------------------------- scene ----

const vec3 BODY_MIN = vec3(-3.5, -10.1, -2.45);
const vec3 BODY_MAX = vec3(3.5, 6.0, 2.45);

float scene(vec3 p, bool full, out Parts P) {
  P.shell = 1e5; P.core = 1e5; P.body = 1e5; P.stick = 1e5;
  P.liq = 1e5; P.liqC = 0.0; P.frag = 1e5; P.fragSide = 0.0; P.crumb = 1e5;
  P.outer = 1e5; P.hn = 0.0; P.fill = 0.0; P.hole = 0.0; P.sink = 0.0; P.cao = 1.0; P.q = p;

  vec3 o = max(BODY_MIN - p, p - BODY_MAX);
  float bb = length(max(o, 0.0));
  float d;
  if (bb < 0.15) {
    bodyEval(p, P);
    P.stick = sdStick(p);
    d = smin(P.body, P.stick, uStickK);
  } else {
    d = bb + 0.05;
  }
  P.liq = liquid(p, full, P.liqC);
  d = smin(d, P.liq, 0.13);
  if (uCrumbCount > 0) {
    P.crumb = crumbs(p);
    d = min(d, P.crumb);
  }
  return d;
}

float map(vec3 p) {
  Parts P;
  return scene(p, false, P);
}

vec3 calcNormal(vec3 p, float eps) {
  const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * map(p + k.xyy * eps) + k.yyx * map(p + k.yyx * eps) +
                   k.yxy * map(p + k.yxy * eps) + k.xxx * map(p + k.xxx * eps));
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i) / 4.0;
    float h = 0.015 + 0.55 * fi * fi;
    float d = map(p + n * h);
    occ += max(h - d, 0.0) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 1.6 * occ, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.03;
  for (int i = 0; i < 36; i++) {
    float h = map(ro + rd * t);
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.03, 0.6);
    if (res < 0.002 || t > 14.0) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}

// thickness probe for subsurface scattering
float translucency(vec3 p, vec3 n) {
  float acc = 0.0;
  for (int i = 1; i <= 4; i++) {
    float h = 0.07 * float(i);
    acc += clamp(-map(p - n * h) / h, 0.0, 1.0);
  }
  return 1.0 - acc * 0.25;
}

// ----------------------------------------------------------- lighting -----

const vec3 KEY_DIR = vec3(-0.6396, 0.4864, 0.5946);

float rectLight(vec3 d, vec3 c, vec3 u, vec2 size, float soft) {
  float cd = dot(d, c);
  if (cd <= 0.0) return 0.0;
  vec3 r = normalize(cross(u, c));
  vec3 uu = cross(c, r);
  vec2 xy = vec2(dot(d, r), dot(d, uu)) / cd;
  vec2 q = abs(xy) - size;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return 1.0 - smoothstep(-soft, soft, sd);
}

vec3 envRad(vec3 d, float rough) {
  float soft = 0.02 + rough * 0.8;
  vec3 col = mix(vec3(0.06, 0.055, 0.05), vec3(0.32, 0.32, 0.33), smoothstep(-0.45, 0.8, d.y));
  col *= 0.55 + 0.45 * smoothstep(-0.9, 0.6, d.z);
  float fade = 1.0 / (1.0 + rough * 2.5);
  col += vec3(1.0, 0.965, 0.92) * 6.0 * fade * rectLight(d, KEY_DIR, vec3(0, 1, 0), vec2(0.42, 0.62), soft);
  col += vec3(0.94, 0.96, 1.0) * 4.0 * fade * rectLight(d, normalize(vec3(0.93, 0.1, 0.18)), vec3(0, 1, 0), vec2(0.09, 0.95), soft);
  col += vec3(1.0) * 2.2 * fade * rectLight(d, normalize(vec3(0.05, 1.0, 0.22)), vec3(0, 0, -1), vec2(0.55, 0.35), soft);
  col += vec3(1.0, 0.98, 0.95) * 3.2 * fade * rectLight(d, normalize(vec3(-0.6, 0.15, -0.78)), vec3(0, 1, 0), vec2(0.07, 0.85), soft);
  col += vec3(1.0) * 0.9 * fade * rectLight(d, normalize(vec3(0.25, 0.05, 1.0)), vec3(0, 1, 0), vec2(0.55, 0.45), soft * 1.5);
  col += vec3(1.0, 0.99, 0.97) * 3.0 * fade * rectLight(d, normalize(vec3(-0.2, 0.62, 0.76)), vec3(0, 1, 0), vec2(0.7, 0.22), soft);
  return col;
}

vec3 envIrr(vec3 n) {
  float up = n.y * 0.5 + 0.5;
  vec3 c = mix(vec3(0.3, 0.29, 0.28), vec3(0.82, 0.82, 0.84), up);
  c += vec3(0.94, 0.96, 1.0) * 0.38 * max(dot(n, normalize(vec3(0.93, 0.1, 0.18))), 0.0);
  c += 0.35 * max(dot(n, normalize(vec3(0.05, 1.0, 0.22))), 0.0);
  c += 0.3 * max(dot(n, normalize(vec3(-0.6, 0.15, -0.78))), 0.0);
  c += 0.25 * max(dot(n, normalize(vec3(0.25, 0.05, 1.0))), 0.0);
  return c;
}

vec2 envBRDFApprox(float r, float NoV) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 r4 = r * c0 + c1;
  float a004 = min(r4.x * r4.x, exp2(-9.28 * NoV)) * r4.x + r4.y;
  return vec2(-1.04, 1.04) * a004 + r4.zw;
}

float ggx(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (3.14159 * d * d);
}

vec3 bumpNormal(vec3 p, vec3 n, float freq, float amp) {
  if (amp <= 0.0) return n;
  float e = 0.35 / freq;
  vec3 s = p * freq;
  vec3 g;
  if (freq < 4.0) {
    float c = sn3(s);
    g = vec3(sn3(s + vec3(0.35, 0, 0)), sn3(s + vec3(0, 0.35, 0)), sn3(s + vec3(0, 0, 0.35))) - c;
  } else {
    float c = vnoise3(s);
    g = vec3(vnoise3(s + vec3(0.35, 0, 0)), vnoise3(s + vec3(0, 0.35, 0)), vnoise3(s + vec3(0, 0, 0.35))) - c;
  }
  g /= e;
  g -= n * dot(g, n);
  return normalize(n - amp * g / freq);
}

vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

struct Mat {
  vec3 albedo;
  float rough;
  float sss;
  vec3 sssCol;
  float spec;
};

Mat mixMat(Mat a, Mat b, float t) {
  Mat m;
  m.albedo = mix(a.albedo, b.albedo, t);
  m.rough = mix(a.rough, b.rough, t);
  m.sss = mix(a.sss, b.sss, t);
  m.sssCol = mix(a.sssCol, b.sssCol, t);
  m.spec = mix(a.spec, b.spec, t);
  return m;
}

Mat chocolate(vec3 p, float melt) {
  Mat m;
  vec3 solid = srgb(vec3(0.275, 0.158, 0.098));
  vec3 soft = srgb(vec3(0.48, 0.3, 0.18));
  m.albedo = mix(solid, soft, melt);
  m.rough = mix(0.13, 0.07, melt) * (0.8 + 0.45 * sn3(p * 2.3 + 9.0));
  m.sss = 0.05 + 0.25 * melt;
  m.sssCol = srgb(vec3(0.6, 0.3, 0.14));
  m.spec = 1.0;
  return m;
}

Mat vanilla(float melt) {
  Mat m;
  m.albedo = mix(srgb(vec3(0.93, 0.885, 0.77)), srgb(vec3(0.96, 0.9, 0.74)), melt);
  m.rough = mix(0.62, 0.14, melt);
  m.sss = mix(0.55, 0.85, melt);
  m.sssCol = srgb(vec3(1.0, 0.86, 0.62));
  m.spec = mix(0.6, 1.0, melt);
  return m;
}

Mat fracture() {
  Mat m;
  m.albedo = srgb(vec3(0.42, 0.25, 0.15));
  m.rough = 0.78;
  m.sss = 0.05;
  m.sssCol = srgb(vec3(0.6, 0.3, 0.14));
  m.spec = 0.5;
  return m;
}

Mat wood(vec3 p, float engr) {
  Mat m;
  // pressed birch: warm tan, matte and fuzzy, mottled rather than striped,
  // with fine fibres running along the stick and the odd darker fleck
  vec2 w = p.xy + vec2(0.0, p.z * 3.0);
  float mott = vnoise2(w * vec2(7.0, 2.2) + 3.0) * 0.6 + vnoise2(w * vec2(16.0, 5.0)) * 0.4;
  float fib = vnoise2(w * vec2(85.0, 4.0));
  float fib2 = vnoise2(w * vec2(160.0, 9.0) + 11.0);
  float speck = smoothstep(0.8, 0.95, vnoise2(w * vec2(45.0, 22.0) + 7.0));
  vec3 base = srgb(vec3(0.86, 0.72, 0.53));
  vec3 dark = srgb(vec3(0.73, 0.57, 0.38));
  vec3 c = mix(base, dark, 0.45 * mott + 0.22 * fib + 0.12 * fib2);
  c = mix(c, srgb(vec3(0.56, 0.41, 0.26)), speck * 0.45);
  // where the ice cream used to sit the wood is damp and a little stained
  float inBar = smoothstep(BAR_BOTTOM - 0.4, BAR_BOTTOM + 0.6, p.y);
  float damp = inBar * uWet;
  c = mix(c, c * srgb(vec3(0.86, 0.78, 0.68)), damp * 0.75);
  vec3 burnt = srgb(vec3(0.3, 0.17, 0.09));
  c = mix(c, burnt, smoothstep(0.08, 0.7, engr) * 0.92);
  m.albedo = c;
  m.rough = mix(0.86, 0.45, damp) + 0.06 * engr;
  m.sss = 0.06;
  m.sssCol = srgb(vec3(0.9, 0.7, 0.45));
  m.spec = 0.7;
  return m;
}

vec3 shade(vec3 p, vec3 rd, float pix) {
  Parts P;
  scene(p, true, P);
  vec3 n = calcNormal(p, max(0.0012, pix * 0.6));
  vec3 V = -rd;

  // ------- material selection
  Mat m;
  float bumpAmp = 0.0;
  float bumpFreq = 1.0;
  float bumpAmp2 = 0.0;
  float bumpFreq2 = 1.0;
  float best = min(min(P.body, P.stick), min(P.liq, min(P.frag, P.crumb)));

  float chocLocal = clamp(uMeltC * (0.75 + 0.45 * P.hn) + (sn3(p * 0.8 + 2.0) - 0.5) * 0.3 * uMeltC, 0.0, 1.0);

  if (P.frag <= best + 1e-5) {
    if (P.fragSide < 0.5) { m = chocolate(p, uMeltC * 0.8); bumpAmp = 0.06; bumpFreq = 1.6; }
    else if (P.fragSide < 1.5) { m = fracture(); bumpAmp = 0.5; bumpFreq = 30.0; }
    else { m = vanilla(0.1); m.albedo *= 0.96; bumpAmp = 0.35; bumpFreq = 22.0; }
  } else if (P.crumb <= best + 1e-5) {
    m = fracture();
    m.albedo = mix(m.albedo, srgb(vec3(0.36, 0.2, 0.11)), 0.5);
    bumpAmp = 0.5; bumpFreq = 25.0;
  } else {
    // body (shell / core), stick, liquid blend
    Mat bm;
    if (P.shell <= P.core) {
      if (P.outer + P.sink < -0.008) {
        bm = fracture();
        bumpAmp = 0.45; bumpFreq = 32.0;
      } else {
        bm = chocolate(p, chocLocal);
        bumpAmp = mix(0.05, 0.03, chocLocal); bumpFreq = 1.15;
        bumpAmp2 = mix(0.008, 0.0, chocLocal); bumpFreq2 = 46.0;
      }
    } else {
      float vm = clamp(uMeltV * 1.15 + P.fill * 0.6 + P.hole * uMeltV * 0.4, 0.0, 1.0);
      bm = vanilla(vm);
      bm.albedo *= P.cao;
      bm.spec *= P.cao;
      bumpAmp = mix(0.42, 0.04, vm); bumpFreq = 21.0;
      bumpAmp2 = mix(0.08, 0.0, vm); bumpFreq2 = 3.0;
    }
    float engr = 0.0;
    if (P.stick < 0.05 && abs(p.z) > 0.05) engr = engraveMask(p);
    Mat sm = wood(p, engr);
    float ws = sminMix(P.body, P.stick, uStickK);
    if (ws > 0.5) { bumpAmp = 0.22; bumpFreq = 55.0; bumpAmp2 = 0.0; }
    bm = mixMat(bm, sm, ws);
    float dbs = smin(P.body, P.stick, uStickK);
    float wl = sminMix(dbs, P.liq, 0.13);
    if (wl > 0.0) {
      Mat lv = vanilla(1.0);
      lv.albedo = srgb(vec3(0.99, 0.94, 0.8));
      Mat lc = chocolate(p, 1.0);
      lc.albedo = srgb(vec3(0.4, 0.235, 0.135));
      lc.rough = 0.08;
      Mat lm = mixMat(lv, lc, P.liqC);
      lm.rough = 0.07;
      bm = mixMat(bm, lm, wl);
      bumpAmp *= 1.0 - wl;
      bumpAmp2 *= 1.0 - wl;
    }
    m = bm;
  }

  vec3 nb = bumpNormal(p, n, bumpFreq, bumpAmp);
  nb = bumpNormal(p * 1.37, nb, bumpFreq2, bumpAmp2);

  // ------- lighting (in world space)
  vec3 nW = normalize(uObjRot * nb);
  vec3 vW = normalize(uObjRot * V);
  vec3 lW = KEY_DIR;
  vec3 lO = transpose(uObjRot) * lW;

  float ao = calcAO(p, n);
  float NoL = dot(nW, lW);
  float sh = NoL > 0.0 ? softShadow(p + n * 0.01, lO) : 0.0;
  float NoV = clamp(dot(nW, vW), 1e-3, 1.0);

  float F0 = 0.045;
  vec2 ab = envBRDFApprox(m.rough, NoV);
  float specW = F0 * ab.x + ab.y;
  vec3 R = reflect(-vW, nW);
  float specOcc = clamp(pow(NoV + ao, 2.0) - 1.0 + ao, 0.0, 1.0);
  vec3 spec = envRad(R, m.rough) * specW * specOcc * m.spec;
  // the key softbox reflection gets shadowed too
  spec *= mix(1.0, 0.35 + 0.65 * sh, smoothstep(0.6, 0.95, dot(R, lW)));

  vec3 keyCol = vec3(1.0, 0.965, 0.92) * 1.9;
  float wrap = m.sss * 0.5;
  float diffK = clamp((NoL + wrap) / ((1.0 + wrap) * (1.0 + wrap)), 0.0, 1.0);
  vec3 diff = m.albedo * (envIrr(nW) * ao * 0.62 + keyCol * diffK * mix(sh, 1.0, m.sss * 0.35));

  // subsurface: light bleeding through thin parts and softening the terminator
  vec3 sss = vec3(0.0);
  if (m.sss > 0.02) {
    float tr = translucency(p, n);
    float back = pow(clamp(dot(vW, -lW + nW * 0.4), 0.0, 1.0), 2.0);
    sss = m.sssCol * m.albedo * m.sss * (tr * (0.55 + 1.6 * back) * 0.9 + 0.12 * ao) * keyCol * 0.55;
  }

  // a touch of GGX for the sharp sun-like key glint on glossy surfaces
  vec3 H = normalize(lW + vW);
  float a = max(m.rough * m.rough, 0.004);
  vec3 glint = keyCol * ggx(max(dot(nW, H), 0.0), a) * max(NoL, 0.0) * sh * 0.06 * m.spec * (F0 + (1.0 - F0) * pow(1.0 - max(dot(H, vW), 0.0), 5.0));

  vec3 col = diff * (1.0 - specW) + spec + sss + min(glint, vec3(6.0));
  return col;
}

bool boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float t0, out float t1) {
  vec3 inv = 1.0 / rd;
  vec3 ta = (bmin - ro) * inv;
  vec3 tb = (bmax - ro) * inv;
  vec3 tmn = min(ta, tb);
  vec3 tmx = max(ta, tb);
  t0 = max(max(tmn.x, tmn.y), tmn.z);
  t1 = min(min(tmx.x, tmx.y), tmx.z);
  return t1 > max(t0, 0.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec3 rd = normalize(uCamBasis * vec3(uv * uTanHalfFov, 1.0));
  vec3 ro = uCamPos;
  float pixAngle = 2.0 * uTanHalfFov / uRes.y;

  vec3 bg = vec3(1.0);
  float t0, t1;
  if (!boxHit(ro, rd, uBoundMin, uBoundMax, t0, t1)) {
    outColor = vec4(bg, 1.0);
    return;
  }
  float t = max(t0, 0.0);
  float minRatio = 1e9;
  float tBest = t;
  bool hit = false;
  for (int i = 0; i < 180; i++) {
    vec3 p = ro + rd * t;
    float d = map(p);
    float pix = t * pixAngle;
    if (d < pix * 0.3) { hit = true; break; }
    float ratio = d / pix;
    if (ratio < minRatio) { minRatio = ratio; tBest = t; }
    t += d * 0.78;
    if (t > t1) break;
  }
  float cov = 1.0;
  if (!hit) {
    cov = clamp((1.0 - minRatio) / 0.7, 0.0, 1.0);
    t = tBest;
    if (cov <= 0.0) {
      outColor = vec4(bg, 1.0);
      return;
    }
  }
  vec3 p = ro + rd * t;
  vec3 col = shade(p, rd, t * pixAngle);
  col = aces(col * uExposure);
  col = pow(col, vec3(1.0 / 2.2));
  // tiny dither against banding in the smooth gradients
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) / 255.0;
  outColor = vec4(mix(bg, col, cov), 1.0);
}
