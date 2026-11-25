#version 300 es
precision highp float;
precision highp int;

out vec4 outColor;

uniform vec2 uRes;
uniform mat3 uRot;          // object -> world orthonormal rotation
uniform float uDist;        // camera distance in object units
uniform float uTanHalfFov;
uniform float uTime;
uniform float uHammer;      // hammer rotation (radians, 0 = rest, + = struck forward)
uniform float uTrigger;     // trigger pull (0..1)
uniform float uCylAngle;    // cylinder index angle (radians, steps 60 deg per shot)
uniform float uFlash;       // muzzle flash intensity (0..1)

// ---------------------------------------------------------------------------
// Material IDs
// ---------------------------------------------------------------------------
const float MAT_SILVER     = 1.0; // brushed machined stainless steel / aluminum
const float MAT_KNURL      = 2.0; // fine diamond-knurled steel collar
const float MAT_DARK_METAL = 3.0; // blackened / blued gunmetal vents, band & bore
const float MAT_GRIP       = 4.0; // contoured dark espresso walnut / composite grip
const float MAT_CHROME     = 5.0; // polished steel sight rib, pins, lanyard loop

// Shift object space so the gun rotates cleanly around its visual center
const vec3 GUN_CENTER = vec3(-0.08, -0.22, 0.0);

// ---------------------------------------------------------------------------
// Noise & SDF Primitives
// ---------------------------------------------------------------------------
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
  for (int i = 0; i < 3; i++) {
    v += a * vnoise3(p);
    p = p * 2.07 + vec3(13.1, 7.7, 5.3);
    a *= 0.5;
  }
  return v;
}

mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
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

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  return sdBox(p, b - r) - r;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdCylX(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.yz), p.x)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdRoundCylX(vec3 p, float h, float r, float rad) {
  return sdCylX(p, h - rad, r - rad) - rad;
}

float sdConeX(vec3 p, float h, float r1, float r2) {
  vec2 q = vec2(length(p.yz), p.x);
  vec2 k1 = vec2(r2, h);
  vec2 k2 = vec2(r2 - r1, 2.0 * h);
  vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

float sdCylZ(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// ---------------------------------------------------------------------------
// Amplified Anvil SDF
// Gun coordinates q:
//   -X = muzzle (-1.42), 0 = shroud rear, +X = breech / hammer (+1.18)
//   +Y = top rail (+0.29), 0 = barrel centerline, -Y = grip (-0.88)
//   +Z = left side facing camera, -Z = right side
// ---------------------------------------------------------------------------
vec2 mapBarrelShroud(vec3 q) {
  vec2 res = vec2(1e5, MAT_SILVER);

  float bShroud = sdBox(q - vec3(-0.62, 0.04, 0.0), vec3(0.92, 0.34, 0.22));
  if (bShroud > 0.25) return vec2(bShroud, MAT_SILVER);

  float az = abs(q.z);

  // 1. Main rectangular slab shroud with crisp upper/lower chamfers
  vec3 ps = q - vec3(-0.695, 0.0, 0.0);
  float dShroud = sdRoundBox(ps, vec3(0.695, 0.208, 0.144), 0.010);

  // Wide bright upper shoulder bevel (catches crisp studio rim highlight)
  float upBevel = (q.y * 0.77 + az * 0.64) - 0.207;
  // Crisper lower chamfer
  float dnBevel = (-q.y * 0.74 + az * 0.67) - 0.217;
  dShroud = smax(dShroud, upBevel, 0.007);
  dShroud = smax(dShroud, dnBevel, 0.006);

  // Shallow machined spine channel along the very top of the shroud
  float topChannel = sdBox(q - vec3(-0.66, 0.218, 0.0), vec3(0.62, 0.024, 0.036));
  dShroud = smax(dShroud, -topChannel, 0.004);

  // Crisp horizontal panel split groove between upper and lower pill rows
  float midSeam = sdBox(vec3(q.x + 0.695, q.y + 0.006, az - 0.148), vec3(0.680, 0.007, 0.018));
  dShroud = smax(dShroud, -midSeam, 0.0025);

  // Fine vertical collar seams near muzzle and receiver ends
  float endSeam1 = sdBox(vec3(q.x + 1.33, q.y, az - 0.148), vec3(0.004, 0.185, 0.010));
  float endSeam2 = sdBox(vec3(q.x + 0.045, q.y, az - 0.148), vec3(0.004, 0.185, 0.010));
  dShroud = smax(dShroud, -min(endSeam1, endSeam2), 0.002);

  // 2. Bold 3x2 recessed pill vents on both left and right sides
  float ix = clamp(round((q.x + 0.68) / 0.42), -1.0, 1.0);
  float sx = q.x - (-0.68 + ix * 0.42);
  bool upperRow = (q.y > -0.006);
  float ry = upperRow ? 0.075 : -0.095;
  float sy = q.y - ry;

  // Countersunk beveled pill pocket in the silver shroud
  vec3 pVent = vec3(sx, sy, az - 0.151);
  float dPocket = sdCapsule(pVent, vec3(-0.126, 0.0, 0.0), vec3(0.126, 0.0, 0.0), 0.044);
  dShroud = smax(dShroud, -dPocket, 0.0075);

  // Glossy dark anodized pill cores seated inside each cutout
  vec3 pCore = vec3(sx, sy, az - 0.112);
  float dPill = sdCapsule(pCore, vec3(-0.124, 0.0, 0.0), vec3(0.124, 0.0, 0.0), 0.036);
  // Subtle machined twin-rib flute along the lower vent bars (matches ref photo)
  if (!upperRow) {
    float ribGroove = sdBox(vec3(sx, sy, az - 0.149), vec3(0.128, 0.007, 0.014));
    dPill = smax(dPill, -ribGroove, 0.0025);
  }

  // 3. Recessed circular rivets / hex fasteners along the shroud (4 upper per side)
  // Stations: -1.31, -0.89, -0.47, -0.05
  float rxIdx = clamp(round((q.x + 0.68) / 0.42 - 0.5), -2.0, 1.0);
  float rxPos = -0.68 + (rxIdx + 0.5) * 0.42;
  float drx = q.x - rxPos;
  vec3 pRiv = vec3(drx, q.y - 0.075, az - 0.144);
  float dRivCut = sdCylZ(pRiv, 0.018, 0.019);
  dShroud = smax(dShroud, -dRivCut, 0.003);
  float dRivPin = sdCylZ(vec3(drx, q.y - 0.075, az - 0.133), 0.014, 0.012);

  // Smaller corner fastener bolts at front & rear of lower panel
  float lrX = (q.x < -0.68) ? -1.31 : -0.05;
  float dLowRivCut = sdCylZ(vec3(q.x - lrX, q.y + 0.095, az - 0.144), 0.015, 0.014);
  dShroud = smax(dShroud, -dLowRivCut, 0.0025);
  float dLowRivPin = sdCylZ(vec3(q.x - lrX, q.y + 0.095, az - 0.134), 0.012, 0.009);

  // 4. Recessed heavy barrel muzzle crown & deep hollow bore (flush & crisp like ref)
  vec3 pMuz = q - vec3(-1.39, 0.068, 0.0);
  float dMuzRing = sdRoundCylX(pMuz - vec3(-0.012, 0.0, 0.0), 0.032, 0.088, 0.007);
  float dBore    = sdCylX(pMuz - vec3(-0.14, 0.0, 0.0), 0.26, 0.056);

  // Subtle stepped dark muzzle crown lip recessed slightly inside the silver ring
  float dCrownStep = sdCylX(pMuz - vec3(-0.046, 0.0, 0.0), 0.010, 0.066);
  dShroud = smax(dShroud, -dBore, 0.004);
  float dMuzzle = smax(dMuzRing, -min(dBore, dCrownStep), 0.0035);

  // Dark recessed throat liner seated strictly INSIDE the silver muzzle crown
  float dBoreLiner = sdCylX(pMuz - vec3(0.065, 0.0, 0.0), 0.102, 0.060);
  dBoreLiner = max(dBoreLiner, -sdCylX(pMuz - vec3(-0.14, 0.0, 0.0), 0.24, 0.052));

  // Subtle recessed machined front slot below bore (clean, flush — no protruding black peg!)
  float dFrontNotch = sdRoundBox(q - vec3(-1.396, -0.095, 0.0), vec3(0.016, 0.032, 0.052), 0.006);
  dShroud = smax(dShroud, -dFrontNotch, 0.003);

  res = opU(res, vec2(min(dShroud, dMuzzle), MAT_SILVER));
  res = opU(res, vec2(min(dPill, min(dRivPin, min(dLowRivPin, dBoreLiner))), MAT_DARK_METAL));

  // 5. Sleek Low-Profile Top Sight Rail & Iron Sights (hugging the upper bevel like ref)
  // Compact ramped front sight blade right behind muzzle
  vec3 pFS = q - vec3(-1.315, 0.232, 0.0);
  float dFrontSight = sdRoundBox(pFS, vec3(0.052, 0.038, 0.020), 0.005);
  dFrontSight = smax(dFrontSight, (-pFS.x * 0.62 + pFS.y * 0.78) - 0.028, 0.004);
  dFrontSight = smax(dFrontSight, (pFS.x * 0.94 + pFS.y * 0.34) - 0.040, 0.003);

  // Sleek tapered top guide rib hugging close to the upper shroud spine
  float dTopRod = sdCapsule(q, vec3(-1.26, 0.220, 0.0), vec3(0.15, 0.242, 0.0), 0.0155);
  // Subtle low support bridge near rear of shroud
  float dStand = sdRoundBox(q - vec3(-0.08, 0.214, 0.0), vec3(0.048, 0.022, 0.024), 0.004);

  // Compact adjustable mid-rear sight turret above the shroud/cylinder junction
  vec3 pRS1 = q - vec3(0.165, 0.250, 0.0);
  float dRearSight1 = sdRoundBox(pRS1, vec3(0.052, 0.042, 0.042), 0.005);
  float dRS1Notch = sdBox(pRS1 - vec3(0.0, 0.020, 0.0), vec3(0.068, 0.028, 0.016));
  dRearSight1 = smax(dRearSight1, -dRS1Notch, 0.003);
  float dRSKnob = sdCylZ(pRS1 - vec3(0.0, -0.006, 0.0), 0.050, 0.014);

  res = opU(res, vec2(min(dFrontSight, min(dStand, dRearSight1)), MAT_SILVER));
  res = opU(res, vec2(dTopRod, MAT_CHROME));
  res = opU(res, vec2(dRSKnob, MAT_DARK_METAL));

  return res;
}

vec2 mapCylinderAndHammer(vec3 q) {
  vec2 res = vec2(1e5, MAT_SILVER);

  float bCyl = sdBox(q - vec3(0.55, 0.03, 0.0), vec3(0.76, 0.34, 0.30));
  if (bCyl > 0.25) return vec2(bCyl, MAT_SILVER);

  vec3 qc = q - vec3(0.0, 0.022, 0.0);

  // Rotating coordinates for the 6-shot cylinder drum
  vec3 qRot = qc;
  qRot.yz = rot2(uCylAngle) * qRot.yz;
  float ang = atan(qRot.z, qRot.y);

  // 1. Transition shoulder/collar from rectangular shroud into heavy round drum
  float dNeck = sdConeX(qc - vec3(0.085, 0.0, 0.0), 0.096, 0.168, 0.222) - 0.008;
  float neckFlat = sdRoundBox(qc - vec3(0.055, 0.0, 0.0), vec3(0.074, 0.184, 0.168), 0.016);
  dNeck = smin(dNeck, neckFlat, 0.022);
  float neckGroove = sdCylX(qc - vec3(0.18, 0.0, 0.0), 0.007, 0.245);
  dNeck = smax(dNeck, -max(neckGroove, -(length(qc.yz) - 0.208)), 0.003);

  // 2. Fine diamond-knurled front cylinder band (x = 0.18..0.415)
  float dKnurl = sdRoundCylX(qc - vec3(0.298, 0.0, 0.0), 0.120, 0.224, 0.007);
  // Subtle geometric diamond texture along silhouette
  float knurlRib = 0.0018 * sin(ang * 58.0 + qc.x * 230.0) * sin(ang * 58.0 - qc.x * 230.0);
  dKnurl += knurlRib;

  // 3. Smooth heavy brushed cylinder body (x = 0.415..0.695)
  float dDrum = sdRoundCylX(qc - vec3(0.555, 0.0, 0.0), 0.146, 0.229, 0.008);
  // 6 shallow machined flutes around the drum
  float fluteAng = mod(ang + 0.523599, 1.047198) - 0.523599;
  vec3 pFlute = vec3(qRot.x - 0.555, length(qRot.yz) - 0.242, fluteAng * 0.229);
  float dDrumFlute = sdCapsule(pFlute, vec3(-0.082, 0.0, 0.0), vec3(0.082, 0.0, 0.0), 0.020);
  dDrum = smax(dDrum, -dDrumFlute, 0.009);

  // Recessed oval side plate / detent right before the black retaining band
  vec3 pOval = vec3(qc.x - 0.60, qc.y - 0.005, abs(qc.z) - 0.230);
  float dOvalCut = sdCapsule(pOval, vec3(0.0, -0.024, 0.0), vec3(0.0, 0.024, 0.0), 0.026);
  dDrum = smax(dDrum, -dOvalCut, 0.004);
  float dOvalPad = sdCapsule(vec3(qc.x - 0.60, qc.y - 0.005, abs(qc.z) - 0.218), vec3(0.0, -0.019, 0.0), vec3(0.0, 0.019, 0.0), 0.018);

  // 4. Black retaining strap / ring around rear of cylinder (x = 0.695..0.775)
  float dBlackBand = sdRoundCylX(qc - vec3(0.735, 0.0, 0.0), 0.042, 0.237, 0.007);

  // 5. Rear stepped fluted breech cap (x = 0.775..0.99)
  float dBreech = sdRoundCylX(qc - vec3(0.882, 0.0, 0.0), 0.112, 0.200, 0.012);
  float bAng = mod(atan(qc.z, qc.y) + 0.523599, 1.047198) - 0.523599;
  vec3 pBFlute = vec3(qc.x - 0.882, length(qc.yz) - 0.216, bAng * 0.200);
  float dBFlute = sdCapsule(pBFlute, vec3(-0.072, 0.0, 0.0), vec3(0.072, 0.0, 0.0), 0.032);
  dBreech = smax(dBreech, -dBFlute, 0.008);
  float dBreechCap = sdRoundCylX(qc - vec3(0.985, 0.0, 0.0), 0.024, 0.158, 0.014);
  dBreech = smin(dBreech, dBreechCap, 0.014);

  // Secondary tiny top notch sight pin on drum
  vec3 pRS2 = q - vec3(0.56, 0.264, 0.0);
  float dRS2 = sdRoundBox(pRS2, vec3(0.022, 0.026, 0.024), 0.004);
  dRS2 = smax(dRS2, -sdBox(pRS2 - vec3(0.0, 0.016, 0.0), vec3(0.038, 0.018, 0.009)), 0.002);

  // 6. Exposed Recurved Single-Action Hammer
  // Positive uHammer rotates the hammer CCW (FORWARD into the breech firing pin!)
  vec3 pH = q - vec3(0.92, 0.02, 0.0);
  pH.xy = rot2(uHammer) * pH.xy;
  // Classic concave sweeping neck into an upturned thumb spur
  float hBase = sdCapsule(vec3(pH.x, pH.y, pH.z * 1.3), vec3(-0.03, 0.03, 0.0), vec3(0.10, 0.115, 0.0), 0.034) / 1.3;
  float hMid  = sdCapsule(vec3(pH.x, pH.y, pH.z * 1.3), vec3(0.095, 0.112, 0.0), vec3(0.185, 0.150, 0.0), 0.021) / 1.3;
  float hSpur = sdCapsule(vec3(pH.x, pH.y, pH.z * 1.3), vec3(0.175, 0.148, 0.0), vec3(0.245, 0.210, 0.0), 0.0145) / 1.3;
  float dHammer = smin(hBase, smin(hMid, hSpur, 0.022), 0.024);
  dHammer = smax(dHammer, abs(pH.z) - 0.023, 0.006);

  res = opU(res, vec2(min(dNeck, min(dDrum, min(dOvalPad, min(dBreech, min(dRS2, dHammer))))), MAT_SILVER));
  res = opU(res, vec2(dKnurl, MAT_KNURL));
  res = opU(res, vec2(dBlackBand, MAT_DARK_METAL));

  return res;
}

vec2 mapFrameAndGrip(vec3 q) {
  vec2 res = vec2(1e5, MAT_SILVER);

  float bLow = sdBox(q - vec3(0.68, -0.48, 0.0), vec3(0.82, 0.52, 0.24));
  if (bLow > 0.25) return vec2(bLow, MAT_SILVER);

  float az = abs(q.z);

  // 1. Under-barrel machined lug / cylinder crane housing
  vec3 pLug = q - vec3(0.16, -0.235, 0.0);
  float dLug = sdRoundBox(pLug, vec3(0.155, 0.094, 0.092), 0.011);
  dLug = smax(dLug, (-pLug.x * 0.85 - pLug.y * 0.52) - 0.155, 0.008);
  // Open side channel so the dark ribbed mini-cylinder gleams clearly on the side
  float dLugCut = sdRoundBox(vec3(q.x - 0.145, q.y + 0.264, az - 0.095), vec3(0.105, 0.044, 0.064), 0.007);
  dLug = smax(dLug, -dLugCut, 0.004);
  // Dark ribbed tactical mini-cylinder tucked into the lower side pocket
  float dMiniCyl = sdRoundCylX(q - vec3(0.145, -0.264, 0.0), 0.098, 0.043, 0.005);
  dMiniCyl += 0.0022 * sin(q.x * 165.0);

  // 2. Lower receiver frame spine + rear beavertail tang
  float dSpine = sdRoundBox(q - vec3(0.67, -0.195, 0.0), vec3(0.41, 0.088, 0.110), 0.016);
  float tangCut = (q.x - 1.03) * 0.55 - (q.y + 0.16) * 0.84 - 0.055;
  dSpine = smax(dSpine, tangCut, 0.015);
  dSpine = smax(dSpine, (-q.y * 0.65 + az * 0.76) - 0.252, 0.010);

  // Silver frame cheek wrapping behind the trigger cleanly along the grip shoulder
  vec3 pCheek = q - vec3(0.69, -0.268, 0.0);
  pCheek.xy = rot2(0.32) * pCheek.xy;
  float dGripBridge = sdRoundBox(pCheek, vec3(0.082, 0.072, 0.092), 0.014);
  float dFrame = smin(dLug, smin(dSpine, dGripBridge, 0.024), 0.020);

  // 3. Rear metal lanyard wire loop beneath the tang
  vec3 pLoop = q - vec3(1.02, -0.228, 0.0);
  pLoop.xy = rot2(0.30) * pLoop.xy;
  float loopArc = abs(length(pLoop.xy / vec2(0.102, 0.068)) - 1.0) * 0.070;
  float dLanyard = length(vec2(loopArc, pLoop.z)) - 0.0125;
  dLanyard = max(dLanyard, -(pLoop.x + 0.015));

  // 4. Rounded Elliptical Trigger Guard (sleek hollow steel loop)
  vec3 pTG = q - vec3(0.50, -0.322, 0.0);
  vec2 tgEll = pTG.xy / vec2(0.172, 0.144);
  float tgRing = abs(length(tgEll) - 1.0) * 0.146 - 0.0135;
  float dGuard = smax(tgRing, abs(pTG.z) - 0.034, 0.0055);
  dGuard = smax(dGuard, pTG.y - 0.132, 0.008);
  float dGuardFront = sdCapsule(q, vec3(0.28, -0.27, 0.0), vec3(0.35, -0.355, 0.0), 0.020);
  dGuardFront = smax(dGuardFront, abs(q.z) - 0.036, 0.005);
  dGuard = smin(dGuard, dGuardFront, 0.016);

  // 5. Curved Single-Action Trigger (pivots backward when pulled)
  vec3 pTr = q - vec3(0.555, -0.235, 0.0);
  pTr.xy = rot2(-0.18 + uTrigger * 0.42) * pTr.xy;
  float trArc = abs(length(pTr.xy - vec2(-0.105, -0.095)) - 0.120) - 0.013;
  float dTrig = max(trArc, max(pTr.y + 0.01, -(pTr.y + 0.170)));
  dTrig = max(dTrig, -(pTr.x + 0.042));
  dTrig = smax(dTrig, abs(pTr.z) - 0.016, 0.005);

  // 6. Contoured Dark Espresso Walnut / Composite Pistol Grip
  // Positive rot2(+0.42) sweeps the grip DOWN & BACKWARD (+X) at 24 deg (114 deg from barrel!)
  vec3 g = q - vec3(0.79, -0.22, 0.0);
  g.xy = rot2(0.42) * g.xy;

  // Grip runs from g.y = +0.02 (top under tang) down to g.y = -0.71 (bottom heel)
  float gy = clamp(-g.y / 0.71, 0.0, 1.0);

  // Sculpted front-strap contour: index groove -> prominent finger spur -> smooth palm curve
  float indexHollow =  0.036 * exp(-pow((gy - 0.21) / 0.10, 2.0));
  float fingerSpur  = -0.052 * exp(-pow((gy - 0.36) / 0.08, 2.0));
  float lowerGroove =  0.018 * exp(-pow((gy - 0.56) / 0.15, 2.0));
  float heelFlare   = -0.020 * smoothstep(0.65, 1.0, gy);
  float frontEdge   = -0.118 + indexHollow + fingerSpur + lowerGroove + heelFlare;

  // Backstrap: clean gentle swell tapering slightly at base
  float palmArch = 0.022 * sin(gy * 3.14159) + 0.012 * smoothstep(0.55, 1.0, gy);
  float backEdge = 0.122 + palmArch;

  float gxCenter = 0.5 * (frontEdge + backEdge);
  float gxHalf   = 0.5 * (backEdge - frontEdge);
  // Subtle palm swell in Z thickness
  float gzHalf   = 0.088 + 0.018 * sin(gy * 3.14159) - 0.008 * smoothstep(0.0, 0.18, gy);

  vec3 pGrip = vec3(g.x - gxCenter, g.y + 0.355, g.z);
  float dGrip = sdRoundBox(pGrip, vec3(gxHalf, 0.360, gzHalf), 0.032);
  // Subtle angled bottom plane matching reference pommel slope
  float botPlane = -(g.y + 0.695) + (g.x - 0.01) * 0.22;
  dGrip = smax(dGrip, botPlane, 0.016);
  dGrip = smax(dGrip, g.y - 0.03, 0.014);

  // Crisp side grip screw near upper-rear of panel (clearly visible in reference!)
  vec3 pGScr = vec3(g.x - 0.048, g.y + 0.125, abs(g.z) - gzHalf);
  float dGScrCut = sdCylZ(pGScr, 0.018, 0.020);
  dGrip = smax(dGrip, -dGScrCut, 0.003);
  float dGScrHead = sdCylZ(vec3(g.x - 0.048, g.y + 0.125, abs(g.z) - (gzHalf - 0.006)), 0.015, 0.015);

  // 7. Sleek Low-Profile Metal Pommel Accent & Bottom-Front Steel Boss (matches ref!)
  float pommelCut = (g.y + 0.648) - (g.x - 0.01) * 0.22;
  float dPommel = smax(dGrip - 0.003, pommelCut, 0.006);
  // Bright angled steel heel cap corner + front lanyard stud
  float dPommelStud = sdRoundBox(vec3(g.x + 0.105, g.y + 0.652, g.z), vec3(0.034, 0.026, 0.048), 0.010);
  dPommel = smin(dPommel, dPommelStud, 0.008);
  // Small bright screw pin on lower-front heel edge
  float dHeelPin = sdCylZ(vec3(g.x + 0.095, g.y + 0.625, abs(g.z) - (gzHalf - 0.004)), 0.012, 0.014);

  // Trim wood cleanly above the thin metal heel cap
  dGrip = smax(dGrip, -pommelCut + 0.003, 0.004);

  res = opU(res, vec2(min(dFrame, min(dGuard, dPommel)), MAT_SILVER));
  res = opU(res, vec2(dGrip, MAT_GRIP));
  res = opU(res, vec2(min(dMiniCyl, dTrig), MAT_DARK_METAL));
  res = opU(res, vec2(min(dLanyard, min(dGScrHead, dHeelPin)), MAT_CHROME));

  return res;
}

vec2 map(vec3 p) {
  vec3 q = p + GUN_CENTER;
  vec2 d = mapBarrelShroud(q);
  d = opU(d, mapCylinderAndHammer(q));
  d = opU(d, mapFrameAndGrip(q));
  return d;
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
    float h = 0.015 + 0.045 * float(i);
    float d = mapDist(p + h * n);
    occ += (h - d) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 2.8 * occ, 0.10, 1.0);
}

float calcSoftShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
  float res = 1.0;
  float t = mint;
  for (int i = 0; i < 24; i++) {
    float h = mapDist(ro + rd * t);
    if (h < 0.0005) return 0.0;
    res = min(res, k * h / t);
    t += clamp(h, 0.008, 0.12);
    if (t > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ---------------------------------------------------------------------------
// High-Contrast Studio Environment Map (world space)
// Dramatic dark-vs-bright studio bands make machined stainless steel gleam
// with real metallic depth instead of flat grey shading.
// ---------------------------------------------------------------------------
vec3 studioEnv(vec3 r, float rough) {
  vec3 darkFloor  = vec3(0.04, 0.05, 0.055);
  vec3 pageBounce = vec3(0.42, 0.46, 0.14); // subtle #efff47 page bounce from below
  vec3 horizonBand = vec3(0.11, 0.13, 0.16); // deep dark studio band for crisp metallic contrast
  vec3 upperCool  = vec3(0.56, 0.62, 0.70);
  vec3 zenith     = vec3(0.92, 0.96, 1.02);

  vec3 env = mix(darkFloor, horizonBand, smoothstep(-0.65, -0.05, r.y));
  env = mix(env, upperCool, smoothstep(0.02, 0.55, r.y));
  env = mix(env, zenith, smoothstep(0.55, 0.95, r.y));
  env += pageBounce * smoothstep(0.10, -0.85, r.y) * 0.20;

  float sharp = mix(1.0, 0.22, rough);
  float w1 = mix(8.5, 2.2, rough);
  float w2 = mix(10.0, 2.6, rough);
  float w3 = mix(6.5, 2.0, rough);

  // Main overhead diagonal studio softbox strip
  float s1 = exp(-pow((r.y * 0.80 + r.x * 0.45 - 0.46) * w1, 2.0)) * smoothstep(-0.25, 0.30, r.z + 0.5);
  // Crisp high-contrast front-left specular ribbon
  float s2 = exp(-pow((r.x * 0.84 - r.y * 0.42 + 0.55) * w2, 2.0)) * smoothstep(-0.25, 0.35, r.y + 0.25);
  // Cool rim kicker behind-right to outline chamfered edges
  float s3 = exp(-pow((r.z + 0.68 - r.y * 0.35) * w3, 2.0));

  env += vec3(1.35, 1.38, 1.44) * s1 * (1.35 * sharp + 0.32);
  env += vec3(0.96, 1.04, 1.18) * s2 * (0.95 * sharp + 0.22);
  env += vec3(0.76, 0.88, 1.08) * s3 * (0.65 * sharp + 0.16);

  return env;
}

// ---------------------------------------------------------------------------
// GGX Microfacet PBR Specular
// ---------------------------------------------------------------------------
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

vec3 shade(vec3 p, vec3 nObj, vec3 vObj, float matId) {
  vec3 q = p + GUN_CENTER;

  vec3 albedo = vec3(0.76, 0.79, 0.84);
  float metal = 0.94;
  float rough = 0.25;
  vec3 bump = vec3(0.0);

  float ao = calcAO(p, nObj);
  float wear = smoothstep(0.62, 0.98, ao);

  if (matId == MAT_SILVER) {
    // Anisotropic brushed steel along barrel axis + subtle battle-worn patina
    float brush = vnoise3(vec3(q.x * 8.0, q.y * 145.0, q.z * 145.0));
    float patina = fbm3(q * 6.5);
    float fineScratch = smoothstep(0.78, 0.96, vnoise3(vec3(q.x * 4.5, q.y * 190.0, q.z * 190.0)));
    albedo = mix(vec3(0.56, 0.61, 0.67), vec3(0.88, 0.91, 0.95), 0.52 + 0.28 * brush + 0.24 * (wear - 0.45));
    albedo *= mix(0.82, 1.06, patina);
    albedo = mix(albedo, vec3(0.95, 0.97, 1.0), fineScratch * 0.25);
    metal = 0.95;
    rough = clamp(0.22 + 0.14 * (1.0 - brush) + 0.12 * (1.0 - patina) - 0.07 * wear, 0.12, 0.46);
    bump = vec3(0.0, (brush - 0.5) * 0.045, (vnoise3(q * vec3(10.0, 150.0, 150.0) + 3.1) - 0.5) * 0.045);
  } else if (matId == MAT_KNURL) {
    // Tight fine diamond machined knurling on the front drum band
    vec3 qc = q - vec3(0.0, 0.022, 0.0);
    qc.yz = rot2(uCylAngle) * qc.yz;
    float ang = atan(qc.z, qc.y);
    float k1 = sin(ang * 58.0 + qc.x * 230.0);
    float k2 = sin(ang * 58.0 - qc.x * 230.0);
    float diamond = k1 * k2;
    float peak = smoothstep(-0.30, 0.50, diamond);
    albedo = mix(vec3(0.20, 0.23, 0.27), vec3(0.84, 0.87, 0.92), peak);
    metal = 0.92;
    rough = mix(0.54, 0.20, peak);
    vec3 tangentA = normalize(vec3(0.0, -qc.z, qc.y) + 1e-5);
    float dA = cos(ang * 58.0 + qc.x * 230.0) * k2 + k1 * cos(ang * 58.0 - qc.x * 230.0);
    float dX = cos(ang * 58.0 + qc.x * 230.0) * k2 - k1 * cos(ang * 58.0 - qc.x * 230.0);
    bump = (tangentA * dA + vec3(1.0, 0.0, 0.0) * dX) * 0.24;
  } else if (matId == MAT_DARK_METAL) {
    // Deep blued / blackened gunmetal with tight glossy specular edges
    float grain = vnoise3(q * vec3(24.0, 95.0, 95.0));
    albedo = mix(vec3(0.032, 0.038, 0.046), vec3(0.095, 0.108, 0.125), grain * 0.6 + wear * 0.4);
    metal = 0.85;
    rough = clamp(0.20 + 0.12 * (1.0 - grain) - 0.05 * wear, 0.13, 0.38);
    bump = (vec3(vnoise3(q * 80.0), vnoise3(q * 80.0 + 7.1), vnoise3(q * 80.0 + 13.7)) - 0.5) * 0.025;
  } else if (matId == MAT_GRIP) {
    // Deep dark espresso walnut / Bakelite polymer grip (matching ref's dark handle!)
    vec3 g = q - vec3(0.79, -0.22, 0.0);
    g.xy = rot2(0.42) * g.xy;
    float wood = fbm3(vec3(g.x * 16.0, g.y * 5.0, g.z * 22.0));
    float stipple = vnoise3(g * 160.0);
    vec3 darkEspresso = vec3(0.032, 0.022, 0.017);
    vec3 warmUmber    = vec3(0.088, 0.062, 0.044);
    albedo = mix(darkEspresso, warmUmber, smoothstep(0.22, 0.82, wood) * 0.8 + 0.2 * stipple);
    albedo = mix(albedo, vec3(0.11, 0.08, 0.06), wear * 0.25);
    metal = 0.04;
    rough = clamp(0.50 + 0.18 * (1.0 - stipple), 0.36, 0.76);
    bump = (vec3(vnoise3(g * 145.0), vnoise3(g * 145.0 + 4.3), vnoise3(g * 145.0 + 9.2)) - 0.5) * 0.085;
  } else { // MAT_CHROME
    float brush = vnoise3(vec3(q.x * 16.0, q.y * 120.0, q.z * 120.0));
    albedo = mix(vec3(0.76, 0.80, 0.85), vec3(0.95, 0.97, 1.0), 0.5 + 0.4 * brush);
    metal = 0.98;
    rough = clamp(0.12 + 0.07 * (1.0 - brush), 0.08, 0.24);
  }

  vec3 nLocal = normalize(nObj + bump);
  vec3 nW = normalize(uRot * nLocal);
  vec3 vW = normalize(uRot * vObj);
  float ndv = max(dot(nW, vW), 0.001);

  vec3 f0 = mix(vec3(0.04), albedo, metal);
  float a2 = pow(max(rough, 0.06), 4.0);

  // Key Light (world space: upper-left-front studio key)
  vec3 lKeyW = normalize(vec3(-0.48, 0.74, 0.58));
  vec3 lKeyObj = normalize(transpose(uRot) * lKeyW);
  float ndlKey = max(dot(nW, lKeyW), 0.0);
  float shad = (ndlKey > 0.001) ? calcSoftShadow(p + nObj * 0.006, lKeyObj, 0.015, 2.2, 12.0) : 0.0;
  shad = mix(0.20, 1.0, shad);

  vec3 hKey = normalize(lKeyW + vW);
  float ndhKey = max(dot(nW, hKey), 0.0);
  float vdhKey = max(dot(vW, hKey), 0.0);
  vec3 fKey = f0 + (1.0 - f0) * pow(1.0 - vdhKey, 5.0);
  vec3 specKey = (D_GGX(ndhKey, a2) * G_Smith(ndv, ndlKey, rough) * fKey) / max(4.0 * ndv * ndlKey, 0.001);
  vec3 diffKey = (1.0 - fKey) * (1.0 - metal) * albedo / 3.14159265;
  vec3 col = (diffKey + specKey) * vec3(2.35, 2.34, 2.40) * ndlKey * shad;

  // Rim / Edge Kicker Light (cool steel rim highlight)
  vec3 lRimW = normalize(vec3(0.65, 0.55, -0.52));
  float ndlRim = max(dot(nW, lRimW), 0.0);
  vec3 hRim = normalize(lRimW + vW);
  float ndhRim = max(dot(nW, hRim), 0.0);
  vec3 fRim = f0 + (1.0 - f0) * pow(1.0 - max(dot(vW, hRim), 0.0), 5.0);
  vec3 specRim = (D_GGX(ndhRim, a2) * G_Smith(ndv, ndlRim, rough) * fRim) / max(4.0 * ndv * ndlRim, 0.001);
  col += ((1.0 - metal) * albedo * 0.25 + specRim) * vec3(1.10, 1.22, 1.42) * ndlRim * ao;

  // Image-Based Studio Reflection + Ambient Diffuse
  vec3 reflW = reflect(-vW, nW);
  vec3 fEnv = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - ndv, 5.0);
  vec3 envSpec = studioEnv(reflW, rough) * fEnv * mix(1.05, 0.45, rough);
  vec3 envDiff = studioEnv(nW, 0.92) * albedo * (1.0 - metal) * 0.58;
  col += (envDiff + envSpec) * mix(0.22, 1.0, ao);

  // Dynamic Muzzle Flash Point Light illuminating the barrel & shroud when firing
  if (uFlash > 0.002) {
    vec3 muzPosObj = vec3(-1.54, 0.068, 0.0) - GUN_CENTER;
    vec3 toMuz = muzPosObj - p;
    float d2 = dot(toMuz, toMuz);
    vec3 lMuz = toMuz / sqrt(d2 + 1e-4);
    float ndlM = max(dot(nLocal, lMuz), 0.0);
    float atten = uFlash / (0.10 + 1.4 * d2);
    vec3 hM = normalize(lMuz + vObj);
    float ndhM = max(dot(nLocal, hM), 0.0);
    vec3 specM = D_GGX(ndhM, a2) * f0 * 0.42;
    vec3 flashCol = vec3(4.2, 1.85, 0.45);
    col += (albedo * (1.0 - metal) * 0.4 + specM + albedo * metal * 0.36) * flashCol * ndlM * atten;
  }

  return col;
}

// ---------------------------------------------------------------------------
// Crisp Incandescent Muzzle Flash Starburst (multi-petal fiery jet, zero muddy halo)
// ---------------------------------------------------------------------------
vec4 evalMuzzleFlash(vec3 ro, vec3 rd) {
  if (uFlash < 0.01) return vec4(0.0);
  vec3 mOrig = vec3(-1.43, 0.068, 0.0) - GUN_CENTER;
  vec3 fCenter = mOrig + vec3(-0.15 * uFlash, 0.0, 0.0);
  float tClosest = max(0.0, dot(fCenter - ro, rd));
  vec3 cp = ro + rd * tClosest - mOrig;

  float along = -cp.x;
  float rad = length(cp.yz);
  if (along < -0.03 || along > 0.56 || rad > 0.34) return vec4(0.0);

  // Forward supersonic lance + 4 sharp radial vent petals (angled 45 deg + axis)
  float lance = exp(-rad * rad * 260.0) * exp(-max(along, 0.0) * 6.8) * smoothstep(-0.02, 0.015, along);
  float ang = atan(cp.z, cp.y);
  float petals = pow(abs(cos(ang * 2.0 + 0.35)), 3.0);
  float star = exp(-rad * (14.5 - 6.5 * petals)) * exp(-abs(along - 0.055) * 17.5);
  float core = exp(-length(vec3(along - 0.03, cp.y, cp.z)) * 22.0);
  float raw = (lance * 2.4 + star * 1.45 + core * 1.6) * uFlash;

  // Crisp alpha ramp avoids low-alpha gray drop-shadow artifacts on neon yellow
  float alpha = smoothstep(0.24, 0.72, raw);
  if (alpha <= 0.001) return vec4(0.0);
  // Fiery orange-red rim -> blazing amber -> white-hot inner plasma core
  vec3 rimCol  = vec3(1.15, 0.28, 0.03);
  vec3 midCol  = vec3(1.65, 0.78, 0.14);
  vec3 hotCol  = vec3(2.80, 2.55, 1.95);
  vec3 c = mix(rimCol, midCol, smoothstep(0.24, 0.75, raw));
  c = mix(c, hotCol, smoothstep(0.75, 1.65, raw));
  return vec4(c, alpha);
}

// ---------------------------------------------------------------------------
// Ray-AABB Intersection
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

// ACES Filmic Tonemapping
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

  vec4 flash = evalMuzzleFlash(ro, rd);

  // Tight bounding box in centered object space (covers full backward-raked grip + hammer + muzzle)
  vec2 hitBox = intersectBox(ro, rd, vec3(-1.42, -0.74, -0.30), vec3(1.42, 0.60, 0.30));
  if (hitBox.y < max(hitBox.x, 0.0)) {
    if (flash.a > 0.001) {
      vec3 fc = pow(aces(flash.rgb), vec3(1.0 / 2.2));
      outColor = vec4(fc * flash.a, flash.a);
    } else {
      outColor = vec4(0.0);
    }
    return;
  }

  float t = max(hitBox.x, 0.0);
  float tMax = hitBox.y;
  float pxScale = uTanHalfFov / (0.5 * uRes.y);

  bool hit = false;
  float matId = MAT_SILVER;
  float minRatio = 1e9;
  float bestT = t;
  float bestMat = MAT_SILVER;

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
    col = pow(aces(col * 1.15), vec3(1.0 / 2.2));
  }

  if (flash.a > 0.001) {
    vec3 fc = pow(aces(flash.rgb), vec3(1.0 / 2.2));
    vec3 blended = mix(col * alpha, fc, flash.a);
    float outA = max(alpha, flash.a);
    outColor = vec4(blended, outA);
    return;
  }

  outColor = vec4(col * alpha, alpha);
}
