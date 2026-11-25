#version 300 es
precision highp float;
precision highp int;

out vec4 outColor;

uniform vec2 uRes;
uniform mat3 uRot;          // object -> world orthonormal rotation
uniform float uDist;        // camera distance in object units
uniform float uTanHalfFov;
uniform float uTime;
uniform float uSurge;       // Anti-Magic surge intensity (0..1)
uniform float uSurgeProg;   // Anti-Magic wave progress along blade (0..1.5)

// ---------------------------------------------------------------------------
// Material IDs
// ---------------------------------------------------------------------------
const float MAT_BLADE  = 1.0; // ancient forged hammered dark iron blade & guard
const float MAT_GRIP   = 2.0; // dark weathered forged grip & subtle matte wrap
const float MAT_POMMEL = 3.0; // ancient blackened iron bolster & pommel tip

// ---------------------------------------------------------------------------
// Noise, Voronoi Hammer Marks & SDF Primitives
// ---------------------------------------------------------------------------
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

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), u.x),
        mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x),
        mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y),
    u.z
  );
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise3(p);
    p = p * 2.04 + vec3(11.3, 7.1, 5.9);
    a *= 0.5;
  }
  return v;
}

// Hand-forged hammer peen cellular dimples (returns vec3(distToCellCenter, gradX, gradY))
vec3 voronoiHammer(vec2 x) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float md = 8.0;
  vec2 mr = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = hash22(n + g);
      vec2 r = g + (0.15 + 0.70 * o) - f;
      float d = dot(r, r);
      if (d < md) {
        md = d;
        mr = r;
      }
    }
  }
  return vec3(sqrt(md), mr.x, mr.y);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float smax(float a, float b, float k) {
  return -smin(-a, -b, k);
}

vec2 opU(vec2 a, vec2 b) {
  return (a.x < b.x) ? a : b;
}

float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
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

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// ---------------------------------------------------------------------------
// Exact 2D Silhouette & Clover Cutout of Asta's Demon-Destroyer Sword
// Total length L = 3.20: y in [-1.60 (crescent tip) .. +1.60 (pommel tip)]
// ---------------------------------------------------------------------------

// 2D distance to the signature 3-leaf clover + long tapered needle stem cutout
float sdClover2D(vec2 p) {
  float ax = abs(p.x);
  // 1. Center round clover lobe (closest to arched crescent tip)
  float dFront = length(p - vec2(0.0, -1.392)) - 0.062;
  // 2. Twin flanking round lobes (crisp trefoil clefts!)
  float dSide  = length(vec2(ax - 0.058, p.y + 1.300)) - 0.055;
  // 3. Small inner hub joining the three leaves cleanly
  float dHub   = length(p - vec2(0.0, -1.330)) - 0.040;
  float dLeaves = smin(min(dFront, dHub), dSide, 0.005);

  // 4. Long razor-tapered needle stem slot pointing toward hilt (y = -1.270 .. -0.920)
  float tStem = clamp((p.y + 1.275) / 0.355, 0.0, 1.0);
  float stemW = mix(0.028, 0.001, pow(tStem, 0.90));
  float dyStem = max(-1.285 - p.y, p.y + 0.920);
  float dStem = max(ax - stemW, dyStem);
  if (p.y > -0.920) dStem = length(vec2(max(ax - 0.001, 0.0), p.y + 0.920));

  return smin(dLeaves, dStem, 0.006);
}

// 2D half-width profile of the broad leaf-waisted blade + dramatic concave crescent horn flare
float bladeHalfWidth(float y) {
  float u = clamp((y + 1.60) / 3.20, 0.0, 1.0);

  // Imposing double-tapered broadsword shaft measured from Image 2:
  // ~0.184 behind crescent -> ~0.150 mid waist -> ~0.204 at ricasso shoulder
  float waistDip = -0.040 * exp(-pow((u - 0.43) / 0.22, 2.0));
  float linearW  = mix(0.184, 0.206, smoothstep(0.10, 0.74, u));
  float w = linearW + waistDip;

  // Dramatic swept concave crescent flare starting at y = -1.10, sweeping out to
  // iconic horned tips at y = -1.435 (halfW = 0.332) matching Image 1 & Image 2!
  float tFlare = clamp((-1.10 - y) / 0.34, 0.0, 1.6);
  w += 0.148 * pow(tFlare, 2.10);

  return w;
}

// Exact 2D signed distance to the full blade silhouette (negative inside, positive outside)
float sdBlade2D(vec2 p) {
  float ax = abs(p.x);
  float y = p.y;

  // 1. Lateral blade sides (conservative Lipschitz scale for steep concave crescent flare)
  float w = bladeHalfWidth(y);
  float dSide = (ax - w) * 0.68;

  // 2. Convex arched crescent front cutting edge ONLY bounding the bottom tip!
  // Passes through (0, -1.600) and sweeps up to (±0.330, -1.431) meeting the flared
  // concave sides in two razor-sharp swept crescent horns!
  float yTipEdge = -1.600 + 1.55 * ax * ax;
  float slopeTip = 3.10 * ax;
  float dTipArc = (yTipEdge - y) * inversesqrt(1.0 + slopeTip * slopeTip);

  float dBlade = smax(dSide, dTipArc, 0.003);

  // 3. Upper termination smoothly meeting the bolster neck at y = +1.07
  dBlade = smax(dBlade, y - 1.07, 0.008);

  // 4. Deep semicircular ricasso cutouts (chokes) carving into both sides right below the crossguard
  // Creates crisp wide blade shoulders at y = +0.735 and pinches waist to halfW = 0.078
  float dChoke = length(vec2(ax - 0.214, y - 0.850)) - 0.135;
  dBlade = smax(dBlade, -dChoke, 0.005);

  // 5. Upper concave sweeps above the crossguard tapering cleanly into the handle bolster
  float dUpperChoke = length(vec2(ax - 0.220, y - 1.080)) - 0.150;
  dBlade = smax(dBlade, -dUpperChoke, 0.006);

  return dBlade;
}

// ---------------------------------------------------------------------------
// Complete 3D SDF of Asta's Demon-Destroyer Sword
// ---------------------------------------------------------------------------
vec2 map(vec3 p) {
  float b = sdBox(p, vec3(0.40, 1.66, 0.13));
  if (b > 0.22) return vec2(b, MAT_BLADE);

  float ax = abs(p.x);
  float az = abs(p.z);

  // 1. Main Forged Blade + Flared Crescent Tip + Hourglass Crossguard Throat
  float d2 = sdBlade2D(p.xy);

  // Distal taper: sturdy forged spine near guard (0.048), sleeker toward crescent tip (0.036)
  float tSpine = mix(0.036, 0.048, smoothstep(-1.45, 0.90, p.y));

  // Crisp forged diamond cross-section:
  // Outer bevel slopes cleanly from razor edge (d2 = 0) up at ~16 deg all around the blade & curved tip
  float dEdgeBevel = az * 0.960 + d2 * 0.270 - 0.0022;

  // Dynamic central diamond ridge: slope adapts cleanly to local blade half-width w so the ridge
  // NEVER clips the wide flared crescent horns (ax up to 0.33!) while keeping a crisp shinogi peak!
  float localW = max(bladeHalfWidth(p.y), 0.12);
  float ridgeSlope = (tSpine - 0.0022) / localW;
  float rNorm = inversesqrt(1.0 + ridgeSlope * ridgeSlope);
  float dCenterRidge = (az + ax * ridgeSlope - tSpine) * rNorm;

  // Combine outer bevel & dynamic diamond ridge cleanly
  float dSolidBlade = smax(dEdgeBevel, dCenterRidge, 0.005);

  // Subtle ancient battle nicks along the razor edge
  float edgeMask = smoothstep(-0.020, 0.0, d2) * smoothstep(0.68, 0.55, p.y) * smoothstep(-1.54, -1.40, p.y);
  float nick = smoothstep(0.78, 0.98, vnoise3(vec3(p.x * 16.0, p.y * 28.0, 2.7))) * 0.004 * edgeMask;
  float dBlade = smax(dSolidBlade, d2 + nick, 0.0020);

  // 2. Signature Through-Cutout: 3-Leaf Clover + Tapered Needle Stem Slot!
  if (p.y < -0.82 && p.y > -1.52 && ax < 0.18) {
    float dClover = sdClover2D(p.xy) - az * 0.24;
    dBlade = smax(dBlade, -dClover, 0.003);
  }

  // 3. Crossguard Twin Quillons with Bulbous Teardrop Finials (perpendicular to throat!)
  vec3 pq = vec3(ax, p.y, p.z);
  float dArm    = sdRoundCone(pq, vec3(0.068, 0.952, 0.0), vec3(0.258, 0.954, 0.0), 0.034, 0.018);
  float dCollar = sdRoundCone(pq, vec3(0.238, 0.954, 0.0), vec3(0.254, 0.954, 0.0), 0.023, 0.022);
  float dBulb   = sdRoundCone(pq, vec3(0.256, 0.954, 0.0), vec3(0.296, 0.954, 0.0), 0.021, 0.042);
  float dQuillon = smin(dArm, smin(dCollar, dBulb, 0.007), 0.010);

  dBlade = smin(dBlade, dQuillon, 0.020);

  float dGuardHeart = sdRoundCone(p, vec3(0.0, 0.86, 0.0), vec3(0.0, 1.05, 0.0), 0.040, 0.050);
  dGuardHeart = max(dGuardHeart, az - 0.050);
  dBlade = smin(dBlade, dGuardHeart, 0.022);

  vec2 res = vec2(dBlade, MAT_BLADE);

  // 4. Sculpted Smooth Bolster + Sleek Continuous Forged Handle & Rounded Pommel (y = +1.02 .. +1.60)
  if (p.y > 0.95) {
    float dBolster1 = sdRoundCone(p, vec3(0.0, 1.03, 0.0), vec3(0.0, 1.115, 0.0), 0.042, 0.060);
    float dBolster2 = sdRoundCone(p, vec3(0.0, 1.115, 0.0), vec3(0.0, 1.245, 0.0), 0.058, 0.034);
    float dBolster  = smin(dBolster1, dBolster2, 0.018);

    // Seamless sleek cylindrical grip curving cleanly into a smooth rounded torpedo pommel (no pen-nib step!)
    float dGrip = sdRoundCone(p, vec3(0.0, 1.225, 0.0), vec3(0.0, 1.565, 0.0), 0.033, 0.030);
    float dHilt = smin(dBolster, dGrip, 0.022);

    float matHilt = (p.y > 1.235 && p.y < 1.525) ? MAT_GRIP : MAT_POMMEL;
    res = opU(res, vec2(dHilt, matHilt));
  }

  return res;
}

float mapDist(vec3 p) {
  return map(p).x;
}

// ---------------------------------------------------------------------------
// Normals, AO & Soft Shadows
// ---------------------------------------------------------------------------
vec3 calcNormal(vec3 p, float eps) {
  vec2 e = vec2(1.0, -1.0) * 0.5773 * eps;
  return normalize(
    e.xyy * mapDist(p + e.xyy) +
    e.yyx * mapDist(p + e.yyx) +
    e.yxy * mapDist(p + e.yxy) +
    e.xxx * mapDist(p + e.xxx)
  );
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.014 + 0.042 * float(i);
    float d = mapDist(p + h * n);
    occ += (h - d) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 2.6 * occ, 0.10, 1.0);
}

float calcSoftShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
  float res = 1.0;
  float t = mint;
  for (int i = 0; i < 20; i++) {
    float h = mapDist(ro + rd * t);
    if (h < 0.0005) return 0.0;
    res = min(res, k * h / t);
    t += clamp(h, 0.008, 0.10);
    if (t > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ---------------------------------------------------------------------------
// Dramatic Ancient-Iron Studio Environment Map (world space)
// ---------------------------------------------------------------------------
vec3 studioEnv(vec3 r, float rough) {
  vec3 deepFloor  = vec3(0.025, 0.030, 0.040);
  vec3 pageBounce = vec3(0.36, 0.40, 0.11); // subtle #efff47 page bounce from below
  vec3 slateBand  = vec3(0.12, 0.15, 0.20);
  vec3 coolSky    = vec3(0.56, 0.64, 0.76);
  vec3 brightTop  = vec3(0.92, 0.96, 1.04);

  vec3 env = mix(deepFloor, slateBand, smoothstep(-0.60, -0.05, r.y));
  env = mix(env, coolSky, smoothstep(0.02, 0.55, r.y));
  env = mix(env, brightTop, smoothstep(0.58, 0.96, r.y));
  env += pageBounce * smoothstep(0.08, -0.88, r.y) * 0.16;

  float sharp = mix(1.0, 0.25, rough);
  float w1 = mix(7.0, 2.0, rough);
  float w2 = mix(8.5, 2.3, rough);
  float w3 = mix(5.5, 1.8, rough);

  float s1 = exp(-pow((r.y * 0.72 + r.x * 0.62 - 0.36) * w1, 2.0)) * smoothstep(-0.3, 0.35, r.z + 0.5);
  float s2 = exp(-pow((r.x * 0.76 - r.y * 0.55 + 0.52) * w2, 2.0));
  float s3 = exp(-pow((r.z + 0.64 - r.y * 0.28) * w3, 2.0));

  env += vec3(1.38, 1.44, 1.56) * s1 * (1.22 * sharp + 0.34);
  env += vec3(0.84, 0.96, 1.20) * s2 * (0.90 * sharp + 0.24);
  env += vec3(0.88, 0.98, 1.14) * s3 * (0.68 * sharp + 0.16);

  return env;
}

float D_GGX(float ndh, float a2) {
  float d = (ndh * ndh) * (a2 - 1.0) + 1.0;
  return a2 / (3.14159265 * d * d + 1e-6);
}

float G_Smith(float ndv, float ndl, float rough) {
  float r = rough + 1.0;
  float k = (r * r) * 0.125;
  float gv = ndv / (ndv * (1.0 - k) + k);
  float gl = ndl / (ndl * (1.0 - k) + k);
  return gv * gl;
}

// ---------------------------------------------------------------------------
// Ancient Hammered Forged Iron + Anti-Magic Vein Shading
// ---------------------------------------------------------------------------
vec3 shade(vec3 p, vec3 nObj, vec3 vObj, float matId) {
  float ao = calcAO(p, nObj);

  float d2 = sdBlade2D(p.xy);
  float dClover = sdClover2D(p.xy);
  float edgeWear  = smoothstep(-0.028, -0.001, d2) * smoothstep(0.95, 0.72, p.y);
  float ridgeWear = smoothstep(0.028, 0.0, abs(p.x)) * smoothstep(0.96, 0.65, p.y) * smoothstep(-1.42, -1.25, p.y);
  float cloverRim = smoothstep(0.026, 0.0, abs(dClover)) * smoothstep(-0.88, -1.00, p.y);

  // Domain-warped ancient forge mottling (matches Image 1's blotchy dark quenched iron!)
  vec3 warp = vec3(
    fbm3(p * 4.0 + vec3(1.7, 9.2, 3.1)),
    fbm3(p * 4.0 + vec3(8.3, 2.8, 6.4)),
    fbm3(p * 4.0 + vec3(4.1, 6.5, 1.2))
  );
  float mottleLarge = fbm3(p * 5.0 + warp * 1.55);
  float mottleFine  = fbm3(p * 17.0 + warp * 0.85);
  float forgePits   = smoothstep(0.62, 0.90, fbm3(p * 34.0 + vec3(7.4, 3.1, 11.2)));

  // Hand-forged hammer peen cellular marks across the blade flats
  vec3 ham = voronoiHammer(p.xy * 18.0 + vec2(sign(p.z) * 5.3, 0.0));
  vec3 hamSmall = voronoiHammer(p.xy * 44.0 + vec2(3.7, 9.1));
  float hammerHigh = smoothstep(0.18, 0.68, ham.x);

  float grain = vnoise3(vec3(p.x * 110.0, p.y * 14.0, p.z * 90.0));

  vec3 albedo;
  float metal;
  float rough;
  vec3 bump = vec3(0.0);

  if (matId == MAT_BLADE) {
    // Deep, ancient weathered dark-iron palette inspired directly by Image 1:
    // dark obsidian scale, stormy blue-slate patches, dusty pewter-iron, faint bronze/verdigris oxide
    vec3 obsidian   = vec3(0.026, 0.030, 0.038);
    vec3 darkSlate  = vec3(0.095, 0.114, 0.144);
    vec3 ashIron    = vec3(0.205, 0.232, 0.270);
    vec3 mossOxide  = vec3(0.056, 0.078, 0.068);
    vec3 warmBronze = vec3(0.115, 0.082, 0.054);

    float patchA = smoothstep(0.32, 0.68, mottleLarge);
    float patchB = smoothstep(0.46, 0.82, mottleFine);
    albedo = mix(obsidian, darkSlate, patchA);
    albedo = mix(albedo, ashIron, patchB * 0.58 * hammerHigh);
    // Subtle centuries-old moss/bronze oxidation tucked inside blotches & near crossguard heart
    albedo = mix(albedo, mossOxide, smoothstep(0.50, 0.78, warp.x) * 0.36 * (1.0 - edgeWear));
    float guardWarm = smoothstep(0.65, 0.96, p.y) * smoothstep(1.08, 0.98, p.y);
    albedo = mix(albedo, warmBronze, (smoothstep(0.60, 0.85, warp.y) * 0.22 + guardWarm * 0.28) * (1.0 - edgeWear));
    albedo *= mix(1.0, 0.42, forgePits);

    // Subtle burnished steel catch-light along sharp cutting edge, diamond spine & clover bevel
    float burnish = clamp(edgeWear * 0.72 + ridgeWear * 0.42 + cloverRim * 0.48, 0.0, 1.0);
    vec3 wornSteel = vec3(0.32, 0.36, 0.42) * (0.85 + 0.3 * grain);
    albedo = mix(albedo, wornSteel, burnish * 0.62);

    metal = mix(0.86, 0.95, burnish);
    rough = clamp(
      0.47 - 0.14 * hammerHigh + 0.18 * forgePits + 0.10 * (1.0 - patchA) - 0.20 * burnish,
      0.17, 0.75
    );

    vec2 hamGrad = (ham.yz * 0.052 + hamSmall.yz * 0.024) * (1.0 - 0.55 * edgeWear);
    float gBump = (grain - 0.5) * 0.030 + (forgePits - 0.5) * 0.055;
    bump = vec3(hamGrad.x + gBump, hamGrad.y, (mottleFine - 0.5) * 0.038);
  } else if (matId == MAT_GRIP) {
    // Sleek dark forged iron / fine matte weathered charcoal grip (matching Image 2!)
    float wrapNoise = fbm3(vec3(p.x * 32.0, p.y * 24.0, p.z * 32.0));
    float fineGrain = vnoise3(p * 140.0);
    albedo = mix(vec3(0.026, 0.028, 0.032), vec3(0.085, 0.090, 0.100), wrapNoise * 0.75 + 0.25 * fineGrain);
    metal = 0.72;
    rough = clamp(0.46 + 0.16 * (1.0 - wrapNoise), 0.32, 0.68);
    bump = (vec3(vnoise3(p * 95.0), vnoise3(p * 95.0 + 4.1), vnoise3(p * 95.0 + 8.7)) - 0.5) * 0.045;
  } else {
    // MAT_POMMEL: ancient blackened forged iron bolster & rounded pommel tip (unified dark tone)
    albedo = mix(vec3(0.032, 0.036, 0.044), vec3(0.115, 0.128, 0.148), smoothstep(0.3, 0.75, mottleLarge));
    metal = 0.88;
    rough = clamp(0.36 + 0.16 * (1.0 - hammerHigh), 0.24, 0.58);
    bump = vec3(ham.y, ham.z, (mottleFine - 0.5)) * 0.04;
  }

  vec3 nLocal = normalize(nObj + bump);
  vec3 nW = normalize(uRot * nLocal);
  vec3 vW = normalize(uRot * vObj);
  float ndv = max(dot(nW, vW), 0.001);

  vec3 f0 = mix(vec3(0.04), albedo, metal);
  float a2 = pow(max(rough, 0.06), 4.0);

  // Key Light (world space: angled high-left so one blade facet gleams & the other sits dark!)
  vec3 lKeyW = normalize(vec3(-0.62, 0.64, 0.54));
  vec3 lKeyObj = normalize(transpose(uRot) * lKeyW);
  float ndlKey = max(dot(nW, lKeyW), 0.0);
  float shad = (ndlKey > 0.001) ? calcSoftShadow(p + nObj * 0.006, lKeyObj, 0.014, 1.8, 12.0) : 0.0;
  shad = mix(0.24, 1.0, shad);

  vec3 hKey = normalize(lKeyW + vW);
  float ndhKey = max(dot(nW, hKey), 0.0);
  float vdhKey = max(dot(vW, hKey), 0.0);
  vec3 fKey = f0 + (1.0 - f0) * pow(1.0 - vdhKey, 5.0);
  vec3 specKey = (D_GGX(ndhKey, a2) * G_Smith(ndv, ndlKey, rough) * fKey) / max(4.0 * ndv * ndlKey, 0.001);
  vec3 diffKey = (1.0 - fKey) * (1.0 - metal) * albedo / 3.14159265;
  vec3 col = (diffKey + specKey) * vec3(2.40, 2.46, 2.58) * ndlKey * shad;

  // Cold Rim Kicker Light (opposite side — defines the sharp bevel & silhouette!)
  vec3 lRimW = normalize(vec3(0.72, 0.42, -0.52));
  float ndlRim = max(dot(nW, lRimW), 0.0);
  vec3 hRim = normalize(lRimW + vW);
  float ndhRim = max(dot(nW, hRim), 0.0);
  vec3 fRim = f0 + (1.0 - f0) * pow(1.0 - max(dot(vW, hRim), 0.0), 5.0);
  vec3 specRim = (D_GGX(ndhRim, a2) * G_Smith(ndv, ndlRim, rough) * fRim) / max(4.0 * ndv * ndlRim, 0.001);
  col += ((1.0 - metal) * albedo * 0.25 + specRim) * vec3(1.20, 1.36, 1.64) * ndlRim * ao;

  // Studio IBL Reflections + Diffuse
  vec3 reflW = reflect(-vW, nW);
  vec3 fEnv = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - ndv, 5.0);
  vec3 envSpec = studioEnv(reflW, rough) * fEnv * mix(1.18, 0.52, rough);
  vec3 envDiff = studioEnv(nW, 0.92) * albedo * (1.0 - metal) * 0.62;
  col += (envDiff + envSpec) * mix(0.24, 1.0, ao);

  // Cold grazing iron Fresnel rim
  float rimFres = pow(1.0 - ndv, 3.8);
  col += vec3(0.20, 0.25, 0.32) * rimFres * (0.42 + 0.58 * edgeWear) * ao;

  // -------------------------------------------------------------------------
  // Anti-Magic Surge (Causality Break!) — Deep obsidian darkening + razor-sharp
  // crimson-scarlet energy tracing the clover rim, central spine, edge & veins!
  // -------------------------------------------------------------------------
  if (uSurge > 0.005) {
    float uBlade = clamp((p.y + 1.58) / 2.65, 0.0, 1.0);
    float front = smoothstep(uSurgeProg + 0.14, uSurgeProg - 0.08, uBlade);
    float trail = smoothstep(uSurgeProg - 0.90, uSurgeProg - 0.10, uBlade);
    float waveMask = front * mix(0.45, 1.0, trail) * uSurge;

    // Fine jagged lightning fissures (razor-thin scarlet cracks, not chunky red blobs!)
    float nFiss = abs(fbm3(p * 11.5 + vec3(0.0, -uTime * 3.8, 0.0)) - 0.50);
    float veins = (1.0 - smoothstep(0.0, 0.036, nFiss)) * smoothstep(0.95, 0.72, p.y) * 1.15;

    // Sharp glowing Anti-Magic channels along clover cutout, razor cutting edges & central spine
    float edgeGlow = smoothstep(-0.016, -0.001, d2) * smoothstep(0.96, 0.74, p.y);
    float spineGlow = smoothstep(0.016, 0.0, abs(p.x)) * smoothstep(0.96, 0.72, p.y) * smoothstep(-1.42, -1.25, p.y);
    float energy = clamp(cloverRim * 2.6 + edgeGlow * 1.35 + spineGlow * 0.85 + veins, 0.0, 2.4) * waveMask;

    // Deepen blade iron into dramatic pitch-obsidian Anti-Magic coating during surge
    col = mix(col, col * vec3(0.22, 0.10, 0.12), clamp(waveMask * 0.65, 0.0, 0.65));
    vec3 crimson = mix(vec3(1.95, 0.03, 0.08), vec3(3.6, 0.38, 0.24), smoothstep(0.65, 1.9, energy));
    col += crimson * energy * 1.15;
  }

  return col;
}

// ---------------------------------------------------------------------------
// Anti-Magic Volumetric Aura (black-rimmed crimson plasma inside clover & edges)
// ---------------------------------------------------------------------------
vec4 evalAntiMagicAura(vec3 ro, vec3 rd) {
  if (uSurge < 0.015) return vec4(0.0);
  if (abs(rd.z) < 0.02) return vec4(0.0);
  float tPlane = -ro.z / rd.z;
  if (tPlane <= 0.0) return vec4(0.0);
  vec3 pp = ro + rd * tPlane;
  if (pp.y < -1.78 || pp.y > 1.25 || abs(pp.x) > 0.55) return vec4(0.0);

  float uBlade = clamp((pp.y + 1.58) / 2.65, 0.0, 1.0);
  float front = smoothstep(uSurgeProg + 0.14, uSurgeProg - 0.08, uBlade);

  // 1. Swirling crimson-black vortex inside the hollow 3-leaf clover cutout
  float dClover = sdClover2D(pp.xy);
  float inClover = smoothstep(0.018, -0.020, dClover);
  float nClover = fbm3(vec3(pp.xy * 18.0, uTime * 5.0));
  float cloverGlow = inClover * (0.72 + 0.78 * nClover) * uSurge;

  // 2. Crisp connected obsidian-and-crimson Anti-Magic flames hugging the razor edges
  float d2 = sdBlade2D(pp.xy);
  float turb = fbm3(vec3(pp.x * 13.0, pp.y * 9.0 - uTime * 7.5, uTime * 2.5));
  float reach = 0.058 * smoothstep(0.28, 0.85, turb) + 0.012;
  float edgeFlame = smoothstep(reach, 0.0, max(d2, 0.0)) * smoothstep(-0.015, 0.006, d2) * front * uSurge;

  float raw = cloverGlow * 1.45 + edgeFlame * 1.30;
  float alpha = smoothstep(0.32, 0.74, raw);
  if (alpha <= 0.001) return vec4(0.0);

  // Black Clover signature: pitch obsidian outer outline -> vivid scarlet-crimson core
  vec3 blackRim = vec3(0.04, 0.008, 0.015);
  vec3 deepRed  = vec3(1.85, 0.03, 0.08);
  vec3 hotCore  = vec3(3.10, 0.45, 0.30);
  vec3 c = mix(blackRim, deepRed, smoothstep(0.30, 0.68, raw));
  c = mix(c, hotCore, smoothstep(0.85, 1.50, raw));
  return vec4(c, alpha);
}

// ---------------------------------------------------------------------------
// Ray-AABB Intersection & ACES Tonemapping
// ---------------------------------------------------------------------------
vec2 intersectBox(vec3 ro, vec3 rd, vec3 bMin, vec3 bMax) {
  vec3 invD = 1.0 / rd;
  vec3 t0 = (bMin - ro) * invD;
  vec3 t1 = (bMax - ro) * invD;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tNear = max(max(tmin.x, tmin.y), tmin.z);
  float tFar  = min(min(tmax.x, tmax.y), tmax.z);
  return vec2(tNear, tFar);
}

vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * uRes.y);
  vec3 rdW = normalize(vec3(uv * uTanHalfFov, -1.0));
  vec3 roW = vec3(0.0, 0.0, uDist);

  mat3 invRot = transpose(uRot);
  vec3 ro = invRot * roW;
  vec3 rd = invRot * rdW;

  vec4 aura = evalAntiMagicAura(ro, rd);

  vec2 hitBox = intersectBox(ro, rd, vec3(-0.40, -1.66, -0.15), vec3(0.40, 1.66, 0.15));
  if (hitBox.y < max(hitBox.x, 0.0)) {
    if (aura.a > 0.001) {
      vec3 ac = pow(aces(aura.rgb), vec3(1.0 / 2.2));
      outColor = vec4(ac * aura.a, aura.a);
    } else {
      outColor = vec4(0.0);
    }
    return;
  }

  float t = max(hitBox.x, 0.0);
  float tMax = hitBox.y;
  float pxScale = uTanHalfFov / (0.5 * uRes.y);

  bool hit = false;
  float matId = MAT_BLADE;
  float minRatio = 1e9;
  float bestT = t;
  float bestMat = MAT_BLADE;

  for (int i = 0; i < 96; i++) {
    vec3 p = ro + rd * t;
    vec2 res = map(p);
    float d = res.x;
    float pxR = max(0.0005, t * pxScale);

    float ratio = d / pxR;
    if (ratio < minRatio) {
      minRatio = ratio;
      bestT = t;
      bestMat = res.y;
    }

    if (d < pxR * 0.25) {
      hit = true;
      matId = res.y;
      break;
    }
    t += d;
    if (t > tMax) break;
  }

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (hit) {
    vec3 p = ro + rd * t;
    float eps = max(0.0006, t * pxScale * 0.55);
    vec3 n = calcNormal(p, eps);
    col = shade(p, n, -rd, matId);
    alpha = 1.0;
  } else if (minRatio < 1.15) {
    vec3 p = ro + rd * bestT;
    float eps = max(0.0008, bestT * pxScale * 0.75);
    vec3 n = calcNormal(p, eps);
    col = shade(p, n, -rd, bestMat);
    alpha = smoothstep(1.15, 0.0, minRatio);
  }

  if (alpha > 0.001) {
    col = pow(aces(col * 1.18), vec3(1.0 / 2.2));
  }

  if (aura.a > 0.001) {
    vec3 ac = pow(aces(aura.rgb), vec3(1.0 / 2.2));
    vec3 outCol = col * alpha + ac * aura.a * (1.0 - alpha * 0.85);
    float outA = max(alpha, aura.a);
    outColor = vec4(outCol, outA);
    return;
  }

  outColor = vec4(col * alpha, alpha);
}
