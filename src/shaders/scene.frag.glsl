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
uniform bool uFaluda;
uniform bool uCoco;      // passionfruit coconut: grooved lolly mould, coconut ice under passionfruit
uniform bool uWhite;     // white chocolate shell over blueberry yoghurt ice cream (Magic Choc shape)
uniform int uMould;      // which lolly mould (shape only; see MOULD_* in common.glsl)
uniform bool uCustom;    // an ice cream the visitor made: shape + coating + flavour
uniform bool uCoated;    // custom: dipped in a chocolate coating (colours below, sRGB)
uniform vec3 uCoatCol;   //   frozen
uniform vec3 uCoatMelt;  //   softened
uniform float uCoatSss;  //   how much light it lets through
uniform vec3 uCoatSssCol;
uniform float uCoatGloss; //  roughness multiplier (lower = glossier)
uniform int uCore;       // custom: 0 vanilla, 1 blueberry yoghurt, 2 strawberry milk, 3 mint choc chip,
                         // 4 rose ice, 5 passionfruit coconut, 6 chocolate, 7 matcha, 8 mango sorbet,
                         // 9 cookies & cream
uniform bool uMint;      // mint choc: a slim cylinder of mint cream with cookie crumbs
uniform bool uBerry;     // strawberry milk: tapered wedge mould, pink milk ice with crushed berries
uniform bool uThumb;      // picker icon: no backdrop, coverage goes to alpha

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
#include "background.glsl"

int lollyMould() { return uMould; }
// a made-up ice cream with a chocolate coating
bool customCoated() { return uCustom && uCoated; }
// the flavours that are ices, not creams (uncoated, they crack instead of denting)
bool coreIcy() { return uCore == 4 || uCore == 5 || uCore == 8; }
// the creamy pops (strawberry milk, mint choc, and uncoated creamy ones you
// make) never crack: a press leaves a dent
bool softLolly() { return uBerry || uMint || (uCustom && !uCoated && !coreIcy()); }
// a thick wall of ice that cracks like the faluda's
bool iceShell() { return uFaluda && !softLolly() && !customCoated(); }
// passionfruit coconut (its seed sacs bulge)
bool cocoFlavor() { return uCoco || (uCustom && uCore == 5 && !customCoated()); }

uniform vec3 uLightTint; // the weather tints the light on the ice cream

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
  float cnear;      // how much crack is nearby (ice whitens around a break)
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
  float d = sdMelting(q, uMorph, uFaluda, lollyMould());
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
// Chart that wraps all the way around the bar (mirrors toChart in shape.js),
// as a fraction of the way around: the texture repeats, so there's no seam.
float crackS(vec3 q) {
  float y = q.y;
  // the mint tube is round: just the angle around it
  if (uFaluda && (uMould == MOULD_MINT || uMould == MOULD_TUBE)) return atan(q.x, q.z) / 6.2831853;
  if (uFaluda) {
    float w = lollyHalfWidth(y, lollyMould());
    float th = lollyHalfThick(y, lollyMould());
    float nx = abs(q.x) / w;
    float nz = abs(q.z) / th;
    float arc = nx <= nz ? w * nx / max(nz, 1e-5) : w + th * (1.0 - nz / nx);
    float halfPerimeter = 2.0 * (w + th);
    float u = q.z >= 0.0 ? arc : halfPerimeter - arc;
    return (q.x < 0.0 ? -u : u) / (2.0 * halfPerimeter);
  }
  float a = mix(2.98, 2.58, smoothstep(-3.2, 5.6, y));
  float n = mix(3.2, 2.62, smoothstep(-4.8, 5.6, y));
  float sy = min(abs(y - BAR_MID) / 5.2, 0.999);
  float W = max(a * pow(1.0 - pow(sy, n), 1.0 / n), 0.05);
  float T = max(1.85 * pow(1.0 - pow(sy, 2.6), 1.0 / 2.6), 0.05);
  float R = 0.5 * (W + T);
  float e = (W - T) / (W + T);
  float phi = atan(q.x / W, q.z / T);
  return (phi - 0.5 * e * sin(2.0 * phi)) / 6.2831853;
}

float crackField(vec3 q, out float sink, out float fill, out float inHole, out float holeEdge,
                 out float recess, out float gapAO, out float sinkCore, out vec2 nearOut) {
  vec2 uv = vec2(crackS(q) + 0.5, (6.1 - q.y) / 11.52);
  if (softLolly()) {
    // The milk lolly never cracks: the texture only holds dents (B). Read a
    // slightly blurred copy so the 8-bit steps don't show as rings, and let
    // repeated presses deepen with diminishing returns so a dent can never
    // punch through. As it melts the dents slowly relax.
    float b = textureLod(uCrackTex, uv, 1.3).b;
    float dent = 0.42 * (1.0 - exp(-2.3 * b)) * (1.0 - 0.6 * smoothstep(0.2, 0.7, uMeltC));
    sink = dent;
    sinkCore = dent;
    fill = 0.0; inHole = 0.0; holeEdge = 1e5; recess = 0.0; gapAO = 1.0;
    nearOut = vec2(0.0);
    return 0.3;
  }
  vec4 t0 = textureLod(uCrackTex, uv, 0.0);
  vec4 tb = textureLod(uCrackTex, uv, 2.5);
  // blurred copies of the crack mask (mip levels): how much crack is nearby
  float near = textureLod(uCrackTex, uv, 2.0).r;
  float wide = textureLod(uCrackTex, uv, 3.5).r;
  nearOut = vec2(near, wide);
  // Melting doesn't heal anything: it softens it. Crisp breaks slump into
  // rounded, blurred edges, hairline cracks fill in and fade, steps between
  // plates smooth out, and holes stay open with soft melted rims.
  float soft = smoothstep(0.25, 0.8, uMeltC);
  vec4 t = mix(t0, vec4(clamp(tb.r * 1.35, 0.0, 1.0), tb.g, tb.b, tb.a), soft);
  float crisp = 1.0 - soft;
  // pushed-in plates, plus chipped, rounded lips curling down into each crack
  float lip = 0.045 * smoothstep(0.04, 0.5, near) * (1.0 - smoothstep(0.35, 0.6, t.r)) * crisp;
  // as it melts, the chocolate slumps down into every crack and hole edge
  // until it meets the vanilla flush: the breaks melt into smooth curves
  float slump = smoothstep(0.2, 0.55, uMeltC);
  float rim = SHELL_T * 1.2 * smoothstep(0.0, 0.7, near) * slump;
  // pushed-in plates level out too, so no steps are left behind
  // (the milk lolly takes deep, soft dents instead of shallow pushed-in plates)
  float pushK = softLolly() ? 0.55 : 0.13;
  sink = t.b * pushK * mix(1.0, 0.5, soft) * (1.0 - slump) + lip + rim;
  // the ice cream under the shell follows the plates only softly, so popped
  // neighbouring chips leave one smooth vanilla surface, not steps
  float smoothSink = textureLod(uCrackTex, uv, 3.0).b * pushK * mix(1.0, 0.5, soft) * (1.0 - slump);
  // ...but never above a plate that's still there
  float openHole = smoothstep(0.6, 0.9, wide);
  sinkCore = mix(max(smoothSink, sink - 0.5 * SHELL_T), smoothSink, openHole);
  // the soft ice cream under a crack is pushed down and away: you look down
  // into the gap past the chocolate walls (it slumps flatter as it melts)
  recess = 0.09 * smoothstep(0.03, 0.45, wide) * mix(1.0, 0.45, soft);
  // narrow, deep gaps are shadowed inside; wide openings stay bright
  gapAO = mix(mix(0.72, 0.9, soft), 1.0, smoothstep(0.12, 0.6, near));
  // only right next to an actual crack
  fill = uOoze * smoothstep(0.02, 0.25, near);
  // inside a popped-out chip (a wide open area, not a thin crack)
  inHole = openHole;
  holeEdge = inHole > 0.5 ? -0.2 : 1e5;
  // R crosses 0.5 at the crack edge; a gentle slope keeps the ray marcher
  // from overshooting the crack walls (softer still once it's melting)
  // Far from any crack the void must be clearly 'not here', otherwise it
  // clips the shell a hair below the surface and bends the normals everywhere.
  // ...and inside a crack or an open hole it must be clearly 'void', deep
  // enough that rays at any resolution pass through to the ice cream.
  return (0.5 - t.r) * mix(0.01, 0.006, soft)
       + 0.25 * (1.0 - smoothstep(0.0, 0.06, near))
       - 0.03 * smoothstep(0.3, 0.8, near) * (1.0 - slump * (1.0 - openHole))
       - 0.1 * smoothstep(0.6, 1.0, wide)
       // thin cracks fill in with softened chocolate as it melts (holes stay)
       + 0.012 * slump * (1.0 - openHole);
}

void bodyEval(vec3 p, inout Parts P) {
  vec3 q;
  float hn;
  float dO = bodyOuter(p, q, hn);
  P.outer = dO;
  P.hn = hn;
  P.q = q;
  // the faluda's rose ice is a thick wall round the vanilla, not a thin coat
  float tcE = (uFaluda && !customCoated()) ? FALUDA_SHELL * (1.0 - 0.8 * uMeltC) : SHELL_T * (1.0 - 0.6 * uMeltC);
  float dCore = dO + tcE;
  float dShell = dO;
  // by the end the shell has melted away and the cracks fade out with it
  // Melting ice cream is smooth: the marks cracks leave in the vanilla
  // (deep gaps, ooze lines, sunken patches) melt away first, and the cracks
  // in the chocolate fade out while the shell is still melting off, well
  // before the bar is mostly vanilla.
  float crackFade = 1.0 - smoothstep(0.42, 0.68, uMeltC);
  float vanillaFade = 1.0 - smoothstep(0.25, 0.5, uMeltC);
  // (holes need checking until the chocolate itself is gone)
  if (uCracks > 0.5 && uChocGone < 1.05 && dO < 0.35 && dO > -0.6) {
    float sink, fill, inHole, holeEdge, recess, gapAO, sinkCore;
    vec2 nw;
    float vd = crackField(q, sink, fill, inHole, holeEdge, recess, gapAO, sinkCore, nw);
    P.cnear = nw.x * crackFade;
    sink *= crackFade;
    sinkCore *= vanillaFade;
    recess *= vanillaFade;
    fill *= vanillaFade;
    // thin cracks close up; popped holes stay open until the chocolate goes
    vd = mix(0.3, vd, max(crackFade, inHole));
    // the press pushes shell and ice cream in together
    float carve = vd;
    if (iceShell()) {
      // thick ice: a hairline break only opens a little way in (its pale,
      // frosted floor is what makes ice cracks look white); broken-out
      // pieces and crushed holes go right through to the vanilla
      float through = max(inHole, smoothstep(0.45, 0.85, nw.y));
      carve = max(vd, -(dO + sink) - mix(0.13, FALUDA_SHELL + 0.3, through));
    }
    dShell = max(dO + sink, -carve);
    dCore += sinkCore + recess;
    P.cao = gapAO;
    P.sink = sink;
    P.fill = fill;
    P.hole = inHole;
    if (inHole > 0.5) {
      // exposed vanilla in a crushed hole softens and slumps
      dCore += 0.2 * uMeltV * smoothstep(0.0, 0.4, -holeEdge) * vanillaFade;
    }
    if (fill > 0.0) {
      // softened vanilla creeps up *inside* the cracks, a little more as it
      // melts, until it forms a thin glossy bead along the crack line
      float level = dO + sink + (tcE + recess) * (1.0 - fill) - 0.018 * fill * fill;
      // vd is only +0.005 away from cracks, so the spread must stay below that
      float dFill = max(level, vd - 0.004 * fill);
      dCore = smin(dCore, dFill, 0.02);
    }
  }
  if (uChocGone > 0.0) {
    float g = (1.0 - hn) * 0.3 + sn3(q * 1.3 + 5.0) * 0.7;
    float keep = g - uChocGone;
    dShell = max(dShell, -keep * 0.45);
  }
  if (softLolly()) {
    // dents tilt the surface, so step the ray marcher a little more carefully
    dShell *= 0.8;
    dCore *= 0.8;
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
  if (uFaluda) {
    float profile = sdRoundedRect(p.xy - vec2(0.0, STICK_WAIST_Y), vec2(FALUDA_STICK_W, -STICK_WAIST_Y), FALUDA_STICK_W);
    return sdRoundedExtrusion(profile, p.z, STICK_HT, 0.06);
  }
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
  // same scale on both sticks so the letters keep their proportions
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
  P.outer = 1e5; P.hn = 0.0; P.fill = 0.0; P.hole = 0.0; P.sink = 0.0; P.cao = 1.0; P.cnear = 0.0; P.q = p;

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
  float sheen;  // frosty velvet glow at grazing angles
};

Mat mixMat(Mat a, Mat b, float t) {
  Mat m;
  m.albedo = mix(a.albedo, b.albedo, t);
  m.rough = mix(a.rough, b.rough, t);
  m.sss = mix(a.sss, b.sss, t);
  m.sssCol = mix(a.sssCol, b.sssCol, t);
  m.spec = mix(a.spec, b.spec, t);
  m.sheen = mix(a.sheen, b.sheen, t);
  return m;
}

// White chocolate: a creamy ivory, close to the colour of vanilla, just as
// glossy as the dark shell when frozen and more translucent (it's mostly
// cocoa butter and milk), softening to a buttery cream as it melts.
Mat whiteChocolate(vec3 p, float melt) {
  Mat m;
  m.albedo = mix(srgb(vec3(0.95, 0.9, 0.77)), srgb(vec3(0.97, 0.91, 0.76)), melt);
  m.rough = mix(0.14, 0.08, melt) * (0.8 + 0.45 * sn3(p * 2.3 + 9.0));
  m.sss = 0.3 + 0.3 * melt;
  m.sssCol = srgb(vec3(1.0, 0.9, 0.7));
  m.spec = 1.0;
  m.sheen = 0.0;
  return m;
}

Mat darkChocolate(vec3 p, float melt);
Mat chocolate(vec3 p, float melt) {
  if (uWhite) return whiteChocolate(p, melt);
  return darkChocolate(p, melt);
}

Mat darkChocolate(vec3 p, float melt) {
  Mat m;
  vec3 solid = srgb(vec3(0.275, 0.158, 0.098));
  vec3 soft = srgb(vec3(0.48, 0.3, 0.18));
  m.albedo = mix(solid, soft, melt);
  m.rough = mix(0.13, 0.07, melt) * (0.8 + 0.45 * sn3(p * 2.3 + 9.0));
  m.sss = 0.05 + 0.25 * melt;
  m.sssCol = srgb(vec3(0.6, 0.3, 0.14));
  m.spec = 1.0;
  m.sheen = 0.0;
  return m;
}

// Rose ice straight from the freezer: deep raspberry-rose, satin rather than
// shiny, with a pale frost bloom that gathers where the faces roll over into
// the sides and on the top, and a scatter of tiny ice crystals. As it melts
// the frost goes, the colour deepens and it turns wet and glossy.
Mat faludaIce(vec3 p, vec3 q, float melt) {
  Mat m;
  float thaw = smoothstep(0.0, 0.5, melt);
  // the syrup froze a touch unevenly: soft clouding, drawn out along the bar
  float cloud = sn3(p * vec3(1.4, 0.5, 1.4) + vec3(4.0, 1.0, 7.0));
  float cloud2 = vnoise3(p * vec3(4.5, 1.5, 4.5) + 2.0);
  float tone = clamp(0.3 + 0.9 * (cloud - 0.5) + 0.35 * (cloud2 - 0.5), 0.0, 1.0);
  vec3 deep = srgb(vec3(0.79, 0.05, 0.24));
  vec3 rose = srgb(vec3(0.92, 0.19, 0.38));
  vec3 c = mix(deep, rose, tone);
  // frost bloom
  float o = faludaOutline(q.xy, MOULD_FALUDA);
  float rim = 1.0 - smoothstep(0.25, 1.35, -o);
  float top = smoothstep(2.6, 5.6, q.y);
  float patchy = smoothstep(0.25, 0.75, sn3(p * 1.7 + 11.0) * 0.7 + sn3(p * 4.1 + 3.0) * 0.3);
  float frost = clamp(0.05 + 0.45 * rim + 0.12 * top, 0.0, 1.0) * mix(0.55, 1.0, patchy) * (1.0 - thaw);
  c = mix(c, srgb(vec3(0.97, 0.64, 0.72)), frost * 0.5);
  // tiny ice crystals catching the light: sparse, pin-sized
  float crystal = smoothstep(0.9, 0.97, vnoise3(p * 52.0 + 5.0)) * (1.0 - thaw);
  c = mix(c, srgb(vec3(1.0, 0.86, 0.91)), crystal * 0.4);
  // melting: wet syrup, a deeper, richer red-rose
  c = mix(c, srgb(vec3(0.78, 0.05, 0.26)), thaw * 0.45);
  m.albedo = c;
  m.rough = mix(0.36 + 0.24 * frost + 0.1 * crystal, 0.07, thaw);
  m.sss = 0.8;
  m.sssCol = srgb(vec3(1.0, 0.28, 0.38));
  m.spec = mix(0.75, 1.15, thaw);
  m.sheen = mix(0.12 + 0.5 * frost, 0.0, thaw);
  return m;
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// ------------------------------------------------- passionfruit coconut ----
// Creamy coconut ice with a layer of passionfruit pulp poured on top. The pulp
// line is wavy, and before it froze some of it ran down the faces in drips
// and thin streaks onto the white.

// The dip line on one face (side = +1 front, -1 back): gently wavy.
float cocoEdge(float x, float side) {
  return 1.45 + 0.2 * sin(x * 1.6 + side * 1.9) + 0.09 * sin(x * 3.7 + 0.4 + side);
}

// Signed distance to the edge of the pulp on one face (negative inside it).
// The drips grow out of the layer with a smooth, flared root and taper down
// to a soft rounded end, like syrup running before it froze.
float cocoDipDist(vec2 xy, float side) {
  float d = cocoEdge(xy.x, side) - xy.y;
  for (int i = 0; i < 5; i++) {
    vec2 h = hash22(vec2(float(i) * 3.7 + 1.0, side * 5.3 + 2.0));
    float h2 = hash12(vec2(float(i) * 1.9 + 4.0, side * 2.1 + 9.0));
    float x0 = -1.95 + 3.9 * (float(i) + 0.15 + 0.7 * h.x) / 5.0;
    bool thin = h.y > 0.6;
    float w = thin ? 0.05 + 0.03 * h2 : 0.13 + 0.1 * h2;
    float len = thin ? 0.9 + 2.0 * (h.y - 0.6) / 0.4 : 0.25 + 0.9 * h.y;
    float e0 = cocoEdge(x0, side);
    float x = xy.x + 0.035 * sin(xy.y * 2.3 + h2 * 6.0);
    float dd = sdRoundCone(vec3(x, xy.y, 0.0), vec3(x0, e0 + 0.2, 0.0), vec3(x0, e0 - len, 0.0), w * 1.2, w * 0.8);
    d = smin(d, dd, thin ? 0.16 : 0.3);
  }
  return d;
}

// How much passionfruit pulp is at this point (reference space). surface: on
// the outside, including the drips; otherwise just the layer itself. Front
// and back blend smoothly across the sides, so the line wraps round unbroken.
float cocoPulp(vec3 q, bool surface) {
  float wF = smoothstep(-0.75, 0.75, q.z);
  if (!surface) {
    float edge = mix(cocoEdge(q.x, -1.0), cocoEdge(q.x, 1.0), wF);
    return smoothstep(edge - 0.04, edge + 0.04, q.y);
  }
  if (q.y < -2.0) return 0.0;
  float d = mix(cocoDipDist(q.xy, -1.0), cocoDipDist(q.xy, 1.0), wF);
  return smoothstep(0.018, -0.018, d);
}

// Passionfruit seeds in the pulp layer: a dark olive-black oval inside a
// pale, glassy yellow-green sac of gel that bulges a little. Most sit just
// under the surface; deeper ones fade into the pulp. Reference space, so they
// ride along with the melting shape. x = seed, y = gel sac, z = sac rim.
// Writes the sacs' bulge into gSeedBump (a tilt for the normal).
vec3 gSeedBump = vec3(0.0);
const float SEED_CELL = 0.62;
vec3 passionSeeds(vec3 q, vec3 n) {
  gSeedBump = vec3(0.0);
  if (q.y < 1.0) return vec3(0.0);
  vec3 ci = floor(q / SEED_CELL);
  float seed = 0.0;
  float gel = 0.0;
  float rim = 0.0;
  for (int k = 0; k < 27; k++) {
    vec3 o = vec3(float(k % 3), float((k / 3) % 3), float(k / 9)) - 1.0;
    vec3 c = ci + o;
    vec3 h = hash33(c + 17.0);
    if (h.x > 0.42) continue;                 // not every cell has a seed
    vec3 ctr = (c + 0.18 + 0.64 * hash33(c * 1.7 + 3.1)) * SEED_CELL;
    if (cocoPulp(ctr, false) < 0.5) continue; // only in the passionfruit
    vec3 v = q - ctr;
    float depth = dot(v, n);                  // > 0: the seed is under the surface
    if (depth < -0.12 || depth > 0.3) continue;
    vec3 lat = v - n * depth;
    if (dot(lat, lat) > 0.2) continue;
    vec3 a = normalize(hash33(c * 2.3 + 9.0) - 0.5);
    a = a - n * dot(a, n);
    a = dot(a, a) > 1e-4 ? normalize(a) : normalize(cross(n, vec3(0.0, 0.0, 1.0)) + 1e-3);
    float along = dot(lat, a);
    float across = length(lat - a * along);
    float size = 0.85 + 0.3 * h.y;
    float dd = max(depth, 0.0);
    float vis = 1.0 - smoothstep(0.02, 0.28, dd);
    // the seed: a plump oval, a touch pointed at one end
    float ra = 0.19 * size;
    float rc = 0.14 * size * (1.0 - 0.18 * clamp(along / ra, -1.0, 1.0));
    float e = length(vec2(along / ra, across / rc));
    float soft = 0.12 + 1.2 * dd;
    seed = max(seed, (1.0 - smoothstep(1.0 - soft, 1.0 + soft, e)) * vis);
    // the gel sac round it
    vec3 gv = lat - a * 0.03 * size;
    float R = 0.33 * size;
    float gl = length(vec2(dot(gv, a) / (R * 1.12), length(gv - a * dot(gv, a)) / R));
    float sac = (1.0 - smoothstep(0.8, 1.0, gl)) * vis;
    gel = max(gel, sac);
    rim = max(rim, smoothstep(0.55, 0.9, gl) * (1.0 - smoothstep(0.9, 1.0, gl)) * vis);
    // it bulges: tilt the normal away from the sac centre
    float near = 1.0 - smoothstep(0.0, 0.1, dd);
    gSeedBump += gv / R * 0.22 * near * (1.0 - smoothstep(0.75, 1.05, gl));
  }
  return vec3(seed, gel, rim);
}

// Coconut ice is milky and opaque (a soft, frosty white); the passionfruit
// pulp is glossy golden orange, a little translucent, and paler where it runs
// thin. Melting, both go wet and glossy. inner: inside a break (no drips,
// no frost).
Mat cocoIce(vec3 p, vec3 q, vec3 n, float melt, bool inner) {
  Mat m;
  float thaw = smoothstep(0.0, 0.5, melt);
  float pulp = cocoPulp(q, !inner);
  // coconut: a soft warm white with faint milky clouding
  float cloud = sn3(p * vec3(1.6, 0.7, 1.6) + vec3(5.0, 2.0, 8.0));
  vec3 coco = mix(srgb(vec3(0.93, 0.925, 0.9)), srgb(vec3(0.97, 0.965, 0.945)), cloud);
  float crystal = inner ? 0.0 : smoothstep(0.9, 0.97, vnoise3(p * 52.0 + 2.0)) * (1.0 - thaw);
  coco = mix(coco, vec3(1.0), crystal * 0.5);
  // pulp
  float tone = clamp(0.5 + 0.9 * (sn3(p * vec3(1.8, 0.9, 1.8) + 3.0) - 0.5) + 0.4 * (vnoise3(p * 6.0 + 7.0) - 0.5), 0.0, 1.0);
  vec3 fruit = mix(srgb(vec3(0.93, 0.5, 0.02)), srgb(vec3(0.98, 0.62, 0.06)), tone);
  // thin at its edges (where it ran), so the white shows through a little
  float thin = 1.0 - smoothstep(0.0, 1.0, pulp);
  fruit = mix(fruit, srgb(vec3(1.0, 0.76, 0.28)), 0.45 * smoothstep(0.0, 0.6, (1.0 - pulp) * 2.0) * step(0.02, pulp));
  vec3 sd = vec3(0.0);
  if (pulp > 0.02) {
    sd = passionSeeds(q, n);
    sd *= pulp;
    gSeedBump *= pulp * (inner ? 0.0 : 1.0);
    // the gel: pale and glassy, yellow-green, brighter at its rim
    fruit = mix(fruit, srgb(vec3(0.86, 0.7, 0.2)), 0.6 * sd.y);
    fruit = mix(fruit, srgb(vec3(0.97, 0.82, 0.38)), 0.1 * sd.z);
    fruit = mix(fruit, srgb(vec3(0.13, 0.14, 0.07)), clamp(sd.x * 1.15, 0.0, 1.0));
  } else {
    gSeedBump = vec3(0.0);
  }
  vec3 c = mix(coco, fruit, pulp);
  // melting: the coconut goes a touch creamier, the pulp a juicier orange
  // (never darker or browner)
  c = mix(c, mix(c * vec3(0.98, 0.975, 0.95), srgb(vec3(0.97, 0.52, 0.02)), pulp), thaw * 0.3);
  m.albedo = c;
  float roughC = mix(0.5 + 0.12 * crystal, 0.12, thaw);
  float roughF = mix(0.2, 0.07, thaw);
  roughF = mix(roughF, 0.12, max(sd.y, sd.x) * 0.6);
  m.rough = mix(roughC, roughF, pulp);
  m.sss = mix(0.55, 0.85, pulp) * (1.0 - 0.7 * sd.x);
  m.sssCol = mix(srgb(vec3(1.0, 0.97, 0.9)), srgb(vec3(1.0, 0.6, 0.12)), pulp);
  m.spec = mix(mix(0.6, 1.1, thaw), 1.05, pulp);
  m.sheen = inner ? 0.0 : mix(0.3, 0.0, max(thaw, pulp));
  return m;
}

// ---------------------------------------------------- strawberry milk ----
// Strawberry milk frozen soft and creamy (more ice cream than ice): a soft
// salmon pink, matte and a little frosty, freckled all through with bits of
// crushed strawberry, from fine red specks to the odd bigger squashed piece.
// Reference space, so the freckles stay put as it melts and dents.
// inner: under the surface (no frost).
Mat berryMilk(vec3 p, vec3 q, float melt, bool inner) {
  Mat m;
  float thaw = smoothstep(0.0, 0.5, melt);
  // milky clouding and faint paler streaks from the mould
  float cloud = sn3(q * vec3(1.5, 0.6, 1.5) + vec3(2.0, 9.0, 4.0));
  float cloud2 = vnoise3(q * vec3(5.0, 2.0, 5.0) + 5.0);
  vec3 c = mix(srgb(vec3(0.89, 0.49, 0.49)), srgb(vec3(0.94, 0.6, 0.59)), clamp(cloud + 0.35 * (cloud2 - 0.5), 0.0, 1.0));
  // crushed strawberry: irregular patches (two scales of noise so the edges
  // are ragged), deepest red in their middles, plus a scatter of fine specks
  float f = vnoise3(q * 6.5 + 3.0) * 0.55 + vnoise3(q * 15.0 + 7.0) * 0.3 + vnoise3(q * 34.0 + 1.0) * 0.15;
  float bit = smoothstep(0.69, 0.735, f);
  float core = smoothstep(0.74, 0.8, f);
  float speck = smoothstep(0.87, 0.92, vnoise3(q * 30.0 + 11.0)) * 0.7
              + smoothstep(0.9, 0.94, vnoise3(q * 55.0 + 4.0)) * 0.45;
  speck = clamp(speck, 0.0, 1.0);
  // a pale pink halo where the juice has bled into the milk
  float bleed = smoothstep(0.6, 0.7, f) * (1.0 - bit);
  c = mix(c, srgb(vec3(0.88, 0.38, 0.4)), 0.55 * bleed);
  c = mix(c, srgb(vec3(0.85, 0.28, 0.31)), max(bit * 0.85, speck * 0.75));
  c = mix(c, srgb(vec3(0.76, 0.15, 0.2)), core * 0.85);
  float frost = 0.0;
  if (!inner) {
    // a faint frost on the shoulders and the flat top
    float o = faludaOutline(q.xy, MOULD_BERRY);
    float rim = 1.0 - smoothstep(0.15, 0.9, -o);
    frost = clamp(0.06 + 0.4 * rim, 0.0, 1.0) * (1.0 - thaw) * mix(0.6, 1.0, sn3(p * 2.2 + 6.0));
    c = mix(c, srgb(vec3(0.98, 0.8, 0.79)), 0.3 * frost * (1.0 - bit));
  }
  // melting: wetter and a touch deeper pink
  c = mix(c, c * vec3(0.98, 0.93, 0.93), thaw * 0.5);
  m.albedo = c;
  // the berry bits are a little glossier than the matte milk
  m.rough = mix(mix(0.62 + 0.1 * frost, 0.42, max(bit, speck)), 0.12, thaw);
  m.sss = mix(0.5, 0.75, thaw);
  m.sssCol = srgb(vec3(1.0, 0.62, 0.6));
  m.spec = mix(0.55, 1.0, thaw);
  m.sheen = inner ? 0.0 : mix(0.18 + 0.35 * frost, 0.0, thaw);
  return m;
}

// ---------------------------------------------------------- mint choc ----
// Mint ice cream frozen soft and creamy: a pale pistachio-mint, matte, with
// the odd chocolate chip pocket showing at the surface, a patchy dusting of
// chocolate cookie crumbs, and the bottom end packed with chopped cookie.
// Reference space, so it all stays put as it melts and dents.
// inner: under the surface (no frost).
// Chocolate chips folded through the mint: little flattened lumps scattered
// at random through the cream. Where the surface cuts through one, it shows.
// x = chip, y = the thin cream just over/around one (a soft shadow).
vec2 mintChips(vec3 q) {
  const float CELL = 1.05;
  vec3 ci = floor(q / CELL);
  float chip = 0.0;
  float rim = 0.0;
  for (int k = 0; k < 27; k++) {
    vec3 c = ci + vec3(float(k % 3), float((k / 3) % 3), float(k / 9)) - 1.0;
    vec3 h = hash33(c + 41.0);
    if (h.x > 0.3) continue;
    vec3 ctr = (c + 0.2 + 0.6 * hash33(c * 1.3 + 7.0)) * CELL;
    vec3 v = q - ctr;
    // flattened and turned at random, with a lumpy edge
    vec3 a = normalize(hash33(c * 2.9 + 5.0) - 0.5);
    float along = dot(v, a);
    float r = (0.16 + 0.12 * h.y) * (0.85 + 0.3 * vnoise3(q * 9.0 + c));
    float d = length(v + a * along * 0.8) / r;
    chip = max(chip, 1.0 - smoothstep(0.92, 1.0, d));
    rim = max(rim, (1.0 - smoothstep(1.0, 1.5, d)) * smoothstep(0.92, 1.0, d));
  }
  return vec2(chip, rim);
}

Mat mintCream(vec3 p, vec3 q, float melt, bool inner) {
  Mat m;
  float thaw = smoothstep(0.0, 0.5, melt);
  float cloud = sn3(q * vec3(1.4, 0.6, 1.4) + vec3(3.0, 8.0, 5.0));
  vec3 c = mix(srgb(vec3(0.66, 0.81, 0.45)), srgb(vec3(0.74, 0.86, 0.54)), clamp(cloud + 0.3 * (vnoise3(q * 5.0 + 2.0) - 0.5), 0.0, 1.0));
  // chocolate chips folded through: sparse dark pockets, a soft green shadow
  // round each where the cream is thin over it
  vec2 ch = mintChips(q);
  float chip = ch.x;
  c = mix(c, c * srgb(vec3(0.78, 0.84, 0.7)), 0.55 * ch.y);
  c = mix(c, srgb(vec3(0.16, 0.1, 0.075)), chip);
  // cookie crumbs dusted over it, thicker in patches
  float patchy = smoothstep(0.35, 0.72, sn3(q * 1.1 + 4.0));
  // (two scales blended so the bits are ragged, not blocky)
  float cf = vnoise3(q * 13.0 + 5.0) * 0.55 + vnoise3(q * 31.0 + 9.0) * 0.45;
  float crumbs = smoothstep(mix(0.81, 0.72, patchy), mix(0.84, 0.75, patchy), cf);
  crumbs = clamp(crumbs * (inner ? 0.5 : 1.0), 0.0, 1.0);
  vec3 cookie = mix(srgb(vec3(0.08, 0.065, 0.06)), srgb(vec3(0.24, 0.16, 0.11)), vnoise3(q * 40.0 + 3.0) * 0.8);
  c = mix(c, cookie, crumbs);
  // the crust of chopped cookie round the bottom, mint peeking between chunks
  float crust = mintCrustMask(q);
  float chunk = smoothstep(0.3, 0.6, vnoise3(q * 6.0 + 3.0) * 0.7 + vnoise3(q * 14.0 + 1.0) * 0.3);
  float crustK = crust * mix(0.45, 1.0, chunk);
  vec3 crustCol = mix(srgb(vec3(0.08, 0.065, 0.065)), srgb(vec3(0.22, 0.15, 0.11)), vnoise3(q * 22.0 + 6.0) * 0.8);
  c = mix(c, crustCol, crustK);
  float frost = inner ? 0.0 : (1.0 - thaw) * mix(0.5, 1.0, sn3(p * 2.2 + 6.0));
  c = mix(c, srgb(vec3(0.93, 0.97, 0.88)), 0.2 * frost * (1.0 - max(crumbs, crustK)));
  c = mix(c, c * vec3(0.97, 0.98, 0.95), thaw * 0.4);
  m.albedo = c;
  float rough = mix(0.6, 0.13, thaw);
  rough = mix(rough, 0.35, chip);
  rough = mix(rough, 0.8, max(crumbs, crustK) * (1.0 - thaw * 0.6));
  m.rough = rough;
  m.sss = mix(0.5, 0.75, thaw) * (1.0 - 0.8 * max(max(chip, crumbs), crustK));
  m.sssCol = srgb(vec3(0.85, 1.0, 0.75));
  m.spec = mix(0.55, 1.0, thaw);
  m.sheen = inner ? 0.0 : 0.15 * frost * (1.0 - crustK);
  return m;
}

Mat vanilla(float melt);
Mat blueberryYoghurt(vec3 q, float melt);

// A coating you pick for an ice cream you make: chocolate-like, its colours
// and gloss set from outside (dark, milk, white, ruby, caramel, matcha...).
Mat coatMaterial(vec3 p, float melt) {
  Mat m;
  m.albedo = mix(srgb(uCoatCol), srgb(uCoatMelt), melt);
  m.rough = mix(0.13, 0.07, melt) * (0.8 + 0.45 * sn3(p * 2.3 + 9.0)) * uCoatGloss;
  m.sss = uCoatSss + 0.25 * melt;
  m.sssCol = srgb(uCoatSssCol);
  m.spec = 1.0;
  m.sheen = 0.0;
  return m;
}

// A plain creamy ice cream base: soft milky clouding between two tones,
// matte when frozen, glossy as it melts.
Mat creamBase(vec3 q, float melt, vec3 a, vec3 b, vec3 sssCol) {
  Mat m;
  float cloud = sn3(q * vec3(1.4, 0.6, 1.4) + vec3(2.0, 7.0, 4.0));
  m.albedo = mix(srgb(a), srgb(b), clamp(cloud + 0.3 * (vnoise3(q * 5.0 + 3.0) - 0.5), 0.0, 1.0));
  m.rough = mix(0.58, 0.13, melt);
  m.sss = mix(0.45, 0.75, melt);
  m.sssCol = srgb(sssCol);
  m.spec = mix(0.55, 1.0, melt);
  m.sheen = 0.0;
  return m;
}

// Chocolate ice cream: deep cocoa brown with fine flecks of dark chocolate.
Mat chocolateCream(vec3 q, float melt) {
  Mat m = creamBase(q, melt, vec3(0.34, 0.19, 0.11), vec3(0.44, 0.26, 0.16), vec3(0.75, 0.42, 0.25));
  float fleck = smoothstep(0.82, 0.88, vnoise3(q * 24.0 + 6.0) * 0.6 + vnoise3(q * 50.0 + 1.0) * 0.4);
  m.albedo = mix(m.albedo, srgb(vec3(0.16, 0.08, 0.05)), fleck * 0.85);
  m.sss *= 0.6;
  return m;
}

// Matcha: a soft green-tea green, flecked with darker tea.
Mat matchaCream(vec3 q, float melt) {
  Mat m = creamBase(q, melt, vec3(0.56, 0.67, 0.34), vec3(0.65, 0.74, 0.44), vec3(0.8, 0.95, 0.6));
  float fleck = smoothstep(0.8, 0.86, vnoise3(q * 30.0 + 2.0) * 0.6 + vnoise3(q * 60.0 + 8.0) * 0.4);
  m.albedo = mix(m.albedo, srgb(vec3(0.36, 0.46, 0.2)), fleck * 0.7);
  return m;
}

// Mango sorbet: an ice, not a cream. Glowing golden orange, a little
// fibrous, frosty at the rims, glossy and juicy as it melts.
Mat mangoSorbet(vec3 p, vec3 q, float melt, bool inner) {
  Mat m;
  float thaw = smoothstep(0.0, 0.5, melt);
  float tone = clamp(0.5 + 0.9 * (sn3(q * vec3(1.6, 0.6, 1.6) + 5.0) - 0.5) + 0.3 * (vnoise3(q * 6.0) - 0.5), 0.0, 1.0);
  vec3 c = mix(srgb(vec3(0.95, 0.48, 0.05)), srgb(vec3(0.99, 0.62, 0.13)), tone);
  // stringy fibres of fruit, drawn out along the bar
  float fibre = smoothstep(0.62, 0.8, vnoise3(q * vec3(16.0, 3.0, 16.0) + 4.0));
  c = mix(c, srgb(vec3(0.93, 0.45, 0.04)), 0.35 * fibre);
  float frost = inner ? 0.0 : (1.0 - thaw) * mix(0.4, 1.0, sn3(p * 1.8 + 3.0));
  c = mix(c, srgb(vec3(1.0, 0.86, 0.6)), 0.25 * frost);
  float crystal = inner ? 0.0 : smoothstep(0.9, 0.97, vnoise3(p * 52.0 + 5.0)) * (1.0 - thaw);
  c = mix(c, srgb(vec3(1.0, 0.95, 0.85)), crystal * 0.4);
  m.albedo = c;
  m.rough = mix(0.34 + 0.2 * frost, 0.07, thaw);
  m.sss = 0.85;
  m.sssCol = srgb(vec3(1.0, 0.6, 0.15));
  m.spec = mix(0.8, 1.15, thaw);
  m.sheen = mix(0.1 + 0.4 * frost, 0.0, thaw);
  return m;
}

// Cookies & cream: sweet white cream full of dark chocolate cookie chunks,
// each with a grey smudge of crumb around it, and fine crumbs between.
Mat cookiesCream(vec3 q, float melt) {
  Mat m = creamBase(q, melt, vec3(0.93, 0.91, 0.87), vec3(0.97, 0.95, 0.92), vec3(1.0, 0.95, 0.88));
  float f = vnoise3(q * 3.4 + 12.0) * 0.6 + vnoise3(q * 9.0 + 3.0) * 0.3 + vnoise3(q * 22.0 + 7.0) * 0.1;
  float chunk = smoothstep(0.69, 0.72, f);
  float smudge = smoothstep(0.6, 0.69, f) * (1.0 - chunk);
  float crumbs = smoothstep(0.84, 0.89, vnoise3(q * 28.0 + 5.0) * 0.55 + vnoise3(q * 55.0 + 2.0) * 0.45);
  m.albedo = mix(m.albedo, srgb(vec3(0.62, 0.59, 0.57)), 0.45 * smudge);
  m.albedo = mix(m.albedo, srgb(vec3(0.12, 0.1, 0.1)), max(chunk, crumbs * 0.85));
  m.rough = mix(m.rough, 0.8, max(chunk, crumbs) * (1.0 - melt));
  m.sss *= 1.0 - 0.8 * max(chunk, crumbs);
  return m;
}

// The flavour of an ice cream you made, reusing the real ones' materials.
Mat customCore(vec3 p, vec3 q, vec3 n, float melt, bool inner) {
  if (uCore == 1) return blueberryYoghurt(q, melt);
  if (uCore == 2) return berryMilk(p, q, melt, inner);
  if (uCore == 3) return mintCream(p, q, melt, inner);
  if (uCore == 4) return faludaIce(p, q, melt);
  if (uCore == 5) return cocoIce(p, q, n, melt, inner);
  if (uCore == 6) return chocolateCream(q, melt);
  if (uCore == 7) return matchaCream(q, melt);
  if (uCore == 8) return mangoSorbet(p, q, melt, inner);
  if (uCore == 9) return cookiesCream(q, melt);
  return vanilla(melt);
}
// what it drips when it melts
vec3 customCoreDrip() {
  if (uCore == 1) return vec3(0.86, 0.77, 0.88);
  if (uCore == 2) return vec3(0.95, 0.66, 0.65);
  if (uCore == 3) return vec3(0.83, 0.9, 0.7);
  if (uCore == 4) return vec3(0.84, 0.1, 0.34);
  if (uCore == 5) return vec3(0.97, 0.96, 0.92);
  if (uCore == 6) return vec3(0.42, 0.25, 0.15);
  if (uCore == 7) return vec3(0.7, 0.78, 0.5);
  if (uCore == 8) return vec3(0.98, 0.62, 0.12);
  if (uCore == 9) return vec3(0.92, 0.9, 0.86);
  return vec3(0.99, 0.9, 0.66);
}

Mat shellMaterial(vec3 p, vec3 q, vec3 n, float melt) {
  if (uCustom) {
    if (uCoated) return coatMaterial(p, melt);
    return customCore(p, q, n, melt, false);
  }
  if (uMint) return mintCream(p, q, melt, false);
  if (uBerry) return berryMilk(p, q, melt, false);
  if (uCoco) return cocoIce(p, q, n, melt, false);
  if (uFaluda) return faludaIce(p, q, melt);
  return chocolate(p, melt);
}

Mat vanilla(float melt) {
  Mat m;
  // creamy vanilla, not snow: a warm buttery yellow that deepens a little as it softens
  m.albedo = mix(srgb(vec3(0.95, 0.87, 0.63)), srgb(vec3(0.97, 0.87, 0.6)), melt);
  m.rough = mix(0.62, 0.14, melt);
  m.sss = mix(0.55, 0.85, melt);
  m.sssCol = srgb(vec3(1.0, 0.8, 0.48));
  m.spec = mix(0.6, 1.0, melt);
  m.sheen = 0.0;
  return m;
}

// Blueberry yoghurt ice cream, soft-serve style: a cool creamy white, rippled
// through with ribbons of blueberry compote (deep purple at their hearts,
// bleeding out into lilac) and studded with squashed blueberry pieces (dark
// navy skins, purple flesh at their edges). Reference space, so the ripples
// ride along with the melting shape.
Mat blueberryYoghurt(vec3 q, float melt) {
  Mat m;
  // warp space so the ripples swirl instead of running in straight bands
  vec3 w = q + 0.7 * vec3(sn3(q * 0.7 + 1.0), sn3(q * 0.7 + 7.0), sn3(q * 0.7 + 13.0));
  float band1 = sin(w.y * 1.7 + w.x * 1.2 + 3.6 * sn3(w * 1.1 + 2.0));
  float band2 = sin(w.x * 2.2 - w.z * 1.6 + w.y * 0.9 + 4.2 * sn3(w * 1.5 + 3.0));
  // ribbons break up and come and go, like a hand-folded ripple
  float keep1 = smoothstep(0.28, 0.52, sn3(w * 1.7 + 5.0));
  float keep2 = smoothstep(0.34, 0.58, sn3(w * 2.1 + 11.0));
  float rib = max(smoothstep(0.6, 0.9, band1) * keep1, smoothstep(0.72, 0.94, band2) * keep2 * 0.85);
  float heart = max(smoothstep(0.88, 0.99, band1) * keep1, smoothstep(0.92, 0.995, band2) * keep2);
  float halo = max(smoothstep(0.05, 0.65, band1) * keep1, smoothstep(0.25, 0.75, band2) * keep2) * (1.0 - rib);
  // fine streaky striations along the ribbons
  float streak = vnoise3(w * vec3(9.0, 3.0, 9.0) + 4.0);
  vec3 c = mix(srgb(vec3(0.93, 0.91, 0.93)), srgb(vec3(0.97, 0.96, 0.95)), sn3(q * 1.3 + 8.0));
  c = mix(c, srgb(vec3(0.8, 0.67, 0.83)), 0.6 * halo * (0.65 + 0.35 * streak));
  c = mix(c, srgb(vec3(0.58, 0.3, 0.58)), rib * (0.75 + 0.25 * streak));
  c = mix(c, srgb(vec3(0.36, 0.1, 0.34)), heart);
  // blueberry pieces
  float f = vnoise3(q * 2.7 + 21.0) * 0.62 + vnoise3(q * 7.5 + 4.0) * 0.26 + vnoise3(q * 22.0 + 9.0) * 0.12;
  float flesh = smoothstep(0.7, 0.725, f);
  float skin = smoothstep(0.725, 0.77, f);
  c = mix(c, srgb(vec3(0.42, 0.18, 0.44)), flesh);
  c = mix(c, srgb(vec3(0.14, 0.11, 0.27)), skin);
  // melting: wetter, the purple bleeding a little further
  c = mix(c, c * vec3(0.96, 0.93, 0.97), melt * 0.5);
  m.albedo = c;
  m.rough = mix(mix(0.6, 0.35, max(rib, flesh)), 0.13, melt);
  m.sss = mix(0.5, 0.8, melt) * (1.0 - 0.6 * skin);
  m.sssCol = srgb(vec3(0.95, 0.86, 1.0));
  m.spec = mix(0.6, 1.0, max(melt, skin * 0.6));
  m.sheen = 0.0;
  return m;
}

// The ice cream inside a chocolate shell: vanilla, or blueberry yoghurt.
Mat creamCore(vec3 q, float melt) {
  if (uWhite) return blueberryYoghurt(q, melt);
  return vanilla(melt);
}

Mat fracture() {
  Mat m;
  if (uCustom && !uCoated) {
    m = customCore(vec3(0.0), vec3(0.0), vec3(0.0, 0.0, 1.0), 0.0, true);
    return m;
  }
  if (uMint) {
    m = mintCream(vec3(0.0), vec3(0.0), 0.0, true);
    return m;
  }
  if (uWhite) {
    // freshly snapped white chocolate: matte, creamy and a touch paler
    m.albedo = srgb(vec3(0.94, 0.89, 0.77));
    m.rough = 0.75;
    m.sss = 0.25;
    m.sssCol = srgb(vec3(1.0, 0.9, 0.7));
    m.spec = 0.5;
    m.sheen = 0.0;
    return m;
  }
  if (uBerry) {
    m = berryMilk(vec3(0.0), vec3(0.0), 0.0, true);
    return m;
  }
  if (customCoated()) {
    // freshly snapped coating: paler and matte where it broke
    m.albedo = srgb(mix(uCoatCol, vec3(1.0), 0.12));
    m.rough = 0.78;
    m.sss = uCoatSss * 0.8;
    m.sssCol = srgb(uCoatSssCol);
    m.spec = 0.5;
    m.sheen = 0.0;
    return m;
  }
  if (uCoco) {
    // freshly broken coconut ice: bright white and crystalline
    m.albedo = srgb(vec3(0.98, 0.975, 0.96));
    m.rough = 0.5;
    m.sss = 0.6;
    m.sssCol = srgb(vec3(1.0, 0.97, 0.9));
    m.spec = 0.9;
    m.sheen = 0.35;
    return m;
  }
  if (uFaluda) {
    // freshly broken ice: paler, crystalline and lit from within
    m.albedo = srgb(vec3(0.98, 0.5, 0.6));
    m.rough = 0.42;
    m.sss = 0.9;
    m.sssCol = srgb(vec3(1.0, 0.4, 0.56));
    m.spec = 0.9;
    m.sheen = 0.35;
    return m;
  }
  m.albedo = srgb(vec3(0.42, 0.25, 0.15));
  m.rough = 0.78;
  m.sss = 0.05;
  m.sssCol = srgb(vec3(0.6, 0.3, 0.14));
  m.spec = 0.5;
  m.sheen = 0.0;
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
  m.sheen = 0.0;
  return m;
}

vec3 shade(vec3 p, vec3 rd, float pix) {
  Parts P;
  scene(p, true, P);
  vec3 n = calcNormal(p, max(0.0012, pix * 0.6));
  vec3 V = -rd;

  // ------- material selection
  Mat m;
  vec3 seedBump = vec3(0.0);
  float bumpAmp = 0.0;
  float bumpFreq = 1.0;
  float bumpAmp2 = 0.0;
  float bumpFreq2 = 1.0;
  float best = min(min(P.body, P.stick), min(P.liq, min(P.frag, P.crumb)));

  float chocLocal = clamp(uMeltC * (0.75 + 0.45 * P.hn) + (sn3(p * 0.8 + 2.0) - 0.5) * 0.3 * uMeltC, 0.0, 1.0);

  if (P.frag <= best + 1e-5) {
    if (P.fragSide < 0.5) { m = shellMaterial(p, P.q, n, uMeltC * 0.8); bumpAmp = 0.06; bumpFreq = 1.6; }
    else if (P.fragSide < 1.5) { m = fracture(); bumpAmp = 0.5; bumpFreq = 30.0; }
    else if (uCoco) { m = cocoIce(p, P.q, n, uMeltC, true); bumpAmp = 0.2; bumpFreq = 22.0; }
    else if (uBerry) { m = berryMilk(p, P.q, uMeltC, true); bumpAmp = 0.2; bumpFreq = 22.0; }
    else if (uMint) { m = mintCream(p, P.q, uMeltC, true); bumpAmp = 0.2; bumpFreq = 22.0; }
    else if (uCustom) { m = customCore(p, P.q, n, 0.1, true); bumpAmp = 0.3; bumpFreq = 22.0; }
    else { m = creamCore(P.q, 0.1); m.albedo *= 0.96; bumpAmp = 0.35; bumpFreq = 22.0; }
  } else if (P.crumb <= best + 1e-5) {
    m = fracture();
    if (!uCustom) m.albedo = mix(m.albedo, srgb(uMint ? vec3(0.82, 0.89, 0.66) : uWhite ? vec3(0.93, 0.88, 0.75) : uBerry ? vec3(0.93, 0.6, 0.59) : uCoco ? vec3(0.95, 0.94, 0.9) : uFaluda ? vec3(0.91, 0.17, 0.47) : vec3(0.36, 0.2, 0.11)), 0.5);
    bumpAmp = 0.5; bumpFreq = 25.0;
  } else {
    // body (shell / core), stick, liquid blend
    Mat bm;
    if (P.shell <= P.core) {
      // (the milk lolly never breaks, so it has no raw broken edges)
      if (P.outer + P.sink < -0.008 && !softLolly()) {
        // raw broken edge when frozen; melted, it's just the soft shell again
        // (chocolate, or wet ice: never chocolate under the faluda's rose ice)
        float slumpS = smoothstep(0.2, 0.55, uMeltC);
        Mat soft;
        if (uCustom) soft = shellMaterial(p, P.q, n, chocLocal);
        else if (uCoco) soft = cocoIce(p, P.q, n, chocLocal, true);
        else if (uFaluda) soft = faludaIce(p, P.q, chocLocal);
        else soft = chocolate(p, chocLocal);
        bm = mixMat(fracture(), soft, slumpS);
        bumpAmp = 0.45 * (1.0 - slumpS); bumpFreq = 32.0;
      } else {
        bm = shellMaterial(p, P.q, n, chocLocal);
        bumpAmp = mix(0.05, 0.03, chocLocal); bumpFreq = 1.15;
        bumpAmp2 = (softLolly() ? 0.05 : iceShell() ? 0.035 : 0.008) * (1.0 - chocLocal); bumpFreq2 = 46.0;
        if (softLolly()) {
          // where a finger pressed, the surface is smoothed and a bit glossy
          float pressed = smoothstep(0.02, 0.15, P.sink);
          bumpAmp2 *= 1.0 - 0.8 * pressed;
          bm.rough = mix(bm.rough, 0.3, 0.6 * pressed);
          bm.sheen *= 1.0 - pressed;
        }
        if (iceShell()) {
          // ice turns white around a break (stress crazing)
          float craze = smoothstep(0.03, 0.4, P.cnear) * (1.0 - chocLocal);
          bm.albedo = mix(bm.albedo, srgb(cocoFlavor() ? vec3(1.0, 1.0, 0.98) : vec3(1.0, 0.8, 0.87)), 0.5 * craze);
          bm.rough = mix(bm.rough, 0.55, 0.5 * craze);
          bm.sheen += 0.4 * craze;
        }
      }
    } else if (uMint) {
      // solid mint cream all the way through
      bm = mintCream(p, P.q, chocLocal, true);
      bumpAmp = mix(0.15, 0.03, chocLocal); bumpFreq = 21.0;
    } else if (uBerry) {
      // solid strawberry milk all the way through
      bm = berryMilk(p, P.q, chocLocal, true);
      bumpAmp = mix(0.15, 0.03, chocLocal); bumpFreq = 21.0;
    } else if (uCoco) {
      // no vanilla in this one: under the outer ice is just more of the same
      bm = cocoIce(p, P.q, n, chocLocal, true);
      // (no extra darkening in the gaps: the shadows there are enough, and
      // darkened pulp starts to read as a brown layer)
      bumpAmp = mix(0.12, 0.03, chocLocal); bumpFreq = 21.0;
    } else {
      float vm = clamp(uMeltV * 1.15 + P.fill * 0.6 + P.hole * uMeltV * 0.4, 0.0, 1.0);
      if (uCustom) bm = customCore(p, P.q, n, vm, true);
      else bm = creamCore(P.q, vm);
      bm.albedo *= P.cao;
      bm.spec *= P.cao;
      bumpAmp = mix(0.42, 0.04, vm); bumpFreq = 21.0;
      bumpAmp2 = mix(0.08, 0.0, vm); bumpFreq2 = 3.0;
    }
    // the passionfruit gel sacs bulge (only on the body, not the stick or drips)
    if (cocoFlavor() && P.shell <= P.core) seedBump = gSeedBump;
    float engr = 0.0;
    if (P.stick < 0.05 && abs(p.z) > 0.05) engr = engraveMask(p);
    Mat sm = wood(p, engr);
    float ws = sminMix(P.body, P.stick, uStickK);
    seedBump *= 1.0 - ws;
    if (ws > 0.5) { bumpAmp = 0.22; bumpFreq = 55.0; bumpAmp2 = 0.0; }
    bm = mixMat(bm, sm, ws);
    float dbs = smin(P.body, P.stick, uStickK);
    float wl = sminMix(dbs, P.liq, 0.13);
    seedBump *= 1.0 - wl;
    if (wl > 0.0) {
      Mat lv = vanilla(1.0);
      lv.albedo = srgb(uMint ? vec3(0.83, 0.9, 0.7) : uWhite ? vec3(0.86, 0.77, 0.88) : uBerry ? vec3(0.95, 0.66, 0.65) : uCoco ? vec3(0.97, 0.96, 0.92) : uFaluda ? vec3(0.98, 0.76, 0.8) : vec3(0.99, 0.9, 0.66));
      Mat lc = shellMaterial(p, P.q, n, 1.0);
      lc.albedo = srgb(uMint ? vec3(0.83, 0.9, 0.7) : uWhite ? vec3(0.96, 0.91, 0.79) : uBerry ? vec3(0.95, 0.66, 0.65) : uCoco ? vec3(0.97, 0.56, 0.03) : uFaluda ? vec3(0.84, 0.1, 0.34) : vec3(0.4, 0.235, 0.135));
      if (uCustom) {
        lv.albedo = srgb(customCoreDrip());
        lc.albedo = srgb(uCoated ? uCoatMelt : customCoreDrip());
      }
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
  if (cocoFlavor()) nb = normalize(nb + seedBump);

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
  // frost: a pale velvety glow where the surface turns away from you
  if (m.sheen > 0.0) {
    float graze = pow(1.0 - NoV, 2.5);
    col += m.sheen * srgb(uCustom ? vec3(1.0, 0.97, 0.95) : uMint ? vec3(0.95, 1.0, 0.92) : uBerry ? vec3(1.0, 0.9, 0.9) : uCoco ? vec3(1.0, 0.99, 0.97) : vec3(1.0, 0.86, 0.91)) * graze
         * (envIrr(nW) * ao * 0.45 + keyCol * clamp(NoL + 0.3, 0.0, 1.0) * mix(sh, 1.0, 0.4) * 0.22);
  }
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

  vec3 bg = uThumb ? vec3(0.0) : background(gl_FragCoord.xy);
  float bgA = uThumb ? 0.0 : 1.0;
  float t0, t1;
  if (!boxHit(ro, rd, uBoundMin, uBoundMax, t0, t1)) {
    outColor = vec4(bg, bgA);
    return;
  }
  float t = max(t0, 0.0);
  float minRatio = 1e9;
  float tBest = t;
  bool hit = false;
  for (int i = 0; i < 240; i++) {
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
      outColor = vec4(bg, bgA);
      return;
    }
  }
  vec3 p = ro + rd * t;
  vec3 col = shade(p, rd, t * pixAngle);
  col = aces(col * uExposure * uLightTint);
  col = pow(col, vec3(1.0 / 2.2));
  // tiny dither against banding in the smooth gradients
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) / 255.0;
  outColor = uThumb ? vec4(col, cov) : vec4(mix(bg, col, cov), 1.0);
}
