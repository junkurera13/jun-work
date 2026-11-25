#version 300 es
precision highp float;
precision highp int;

out vec4 outColor;

uniform vec2 uRes;
uniform mat3 uRot;          // object -> world orthonormal rotation
uniform float uDist;        // camera distance in object units
uniform float uTanHalfFov;
uniform sampler2D uScreen;  // live 480x400 Gizmo OS screen canvas
uniform float uBacklight;   // screen backlight intensity (0 = off, 0.25..1 = on)
uniform float uPttPress;    // 0..1 physical depression of hot-pink PTT bar
uniform float uUpPress;     // 0..1 physical press of right Up rocker
uniform float uDownPress;   // 0..1 physical press of right Down rocker
uniform float uSelectPress; // 0..1 physical press of right circular Select button

// ---------------------------------------------------------------------------
// Material IDs
// ---------------------------------------------------------------------------
const float MAT_SHELL    = 1.0; // matte bead-blasted acid-yellow polycarbonate
const float MAT_SCREEN   = 2.0; // flush glossy OLED cover glass (samples uScreen)
const float MAT_DARK     = 3.0; // recessed speaker holes, mic pinhole, screws, lens barrel
const float MAT_PINK     = 4.0; // tactile hot-pink ribbed Push-To-Talk side button
const float MAT_BUTTON   = 5.0; // right-edge acid-yellow rocker & circular select button
const float MAT_CAM_RING = 6.0; // glossy black anodized camera housing ring
const float MAT_LENS     = 7.0; // convex AR-coated glass camera lens element

// ---------------------------------------------------------------------------
// Exact CAD Dimensions (H = 2.00, W = 1.82, D = 0.37)
// ---------------------------------------------------------------------------
const float HW = 0.910;
const float HH = 1.000;
const float HD = 0.185;
const float R_CORNER = 0.145;
const float R_CHAMFER = 0.040;

// Front screen rect (+Z face): equal 0.115 bezel margin on top, left, and right
const vec2 SCR_C = vec2(0.000, 0.240);
const vec2 SCR_H = vec2(0.795, 0.645);
const float SCR_R = 0.086;

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

float sdRoundBox2D(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  return sdBox(p, b - r) - r;
}

float sdCylZ(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdCylX(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.yz), p.x)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// 2D equilateral-ish triangle pointing +Y (dir = +1) or -Y (dir = -1)
float sdTri2D(vec2 p, float r, float dir) {
  p.y *= dir;
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

// ---------------------------------------------------------------------------
// Oddware Gizmo 1 Complete 3D Hardware SDF
// ---------------------------------------------------------------------------
vec2 map(vec3 p) {
  // Fast coarse bounding box early-out
  float b = sdBox(p, vec3(1.06, 1.08, 0.24));
  if (b > 0.20) return vec2(b, MAT_SHELL);

  // 1. Main Chamfered Rectangular Handheld Shell
  float dXY = sdRoundBox2D(p.xy, vec2(HW, HH), R_CORNER);
  float dZ  = abs(p.z) - HD;
  // Crisp industrial-design 45-deg chamfered front & back perimeter edges (Image 3!)
  float dChamfer = (dXY + dZ + R_CHAMFER) * 0.7071068;
  float dBody = smax(smax(dXY, dZ, 0.008), dChamfer, 0.010);

  vec2 res = vec2(1e5, MAT_SHELL);

  // -------------------------------------------------------------------------
  // 2. FRONT FACE (+Z): Glossy Screen Glass, Mic Pinhole & 7x26 Speaker Grille
  // -------------------------------------------------------------------------
  if (p.z > 0.04) {
    // Subtle recessed pocket around the flush screen glass
    float dScr2D = sdRoundBox2D(p.xy - SCR_C, SCR_H, SCR_R);
    float dScrPocket = max(dScr2D, -(p.z - (HD - 0.009)));
    dBody = smax(dBody, -dScrPocket, 0.0035);

    // Flush glossy glass panel sitting cleanly inside the bezel lip
    float dGlass = max(dScr2D - 0.001, abs(p.z - (HD - 0.006)) - 0.0045);
    res = opU(res, vec2(dGlass, MAT_SCREEN));

    // Tiny mic pinhole dot centered inside the upper-left bezel
    float dMic = sdCylZ(p - vec3(-0.848, 0.745, HD), 0.024, 0.0125);
    dBody = smax(dBody, -dMic, 0.0025);
    float dMicBack = max(length(p.xy - vec2(-0.848, 0.745)) - 0.015, abs(p.z - (HD - 0.016)) - 0.008);
    res = opU(res, vec2(dMicBack, MAT_DARK));

    // Signature 7-row x 26-column speaker grille centered cleanly with ~0.156 bottom chin
    if (p.y < -0.45 && p.y > -0.90 && abs(p.x) < 0.83) {
      float pitchX = 0.0612;
      float pitchY = 0.0542;
      float ix = clamp(round(p.x / pitchX - 0.5) + 0.5, -12.5, 12.5);
      float iy = clamp(round((p.y + 0.6655) / pitchY), -3.0, 3.0);
      vec2 hc = vec2(ix * pitchX, -0.6655 + iy * pitchY);
      float dHole2D = length(p.xy - hc) - 0.0160;
      float dHoleCut = max(dHole2D, -(p.z - (HD - 0.024)));
      dBody = smax(dBody, -dHoleCut, 0.003);

      // Dark acoustic speaker mesh backing recessed behind the perforations
      float dGrilleBox = sdRoundBox(p - vec3(0.0, -0.6655, HD - 0.026), vec3(0.785, 0.180, 0.012), 0.004);
      res = opU(res, vec2(dGrilleBox, MAT_DARK));
    }
  }

  // -------------------------------------------------------------------------
  // 3. BACK FACE (-Z): World Camera Lens (top-right) & 3 Black Phillips Screws
  // -------------------------------------------------------------------------
  if (p.z < -0.04) {
    // 3a. World Camera Lens Module at (-0.725, +0.813) — same side as pink PTT!
    vec2 camC = vec2(-0.725, 0.813);
    float rCam = length(p.xy - camC);
    // Chamfered yellow countersunk well
    float dCamWell = max(rCam - 0.114, p.z + (HD - 0.022));
    dBody = smax(dBody, -dCamWell, 0.012);

    // Glossy black outer camera bezel ring
    float dCamOuter = max(rCam - 0.102, abs(p.z + (HD - 0.010)) - 0.012);
    float dCamHole  = max(rCam - 0.072, p.z + (HD - 0.024));
    float dCamRing  = smax(dCamOuter, -dCamHole, 0.004);
    res = opU(res, vec2(dCamRing, MAT_CAM_RING));

    // Stepped matte dark inner lens barrel
    float dBarrel = max(rCam - 0.076, abs(p.z + (HD - 0.022)) - 0.008);
    float dLensHole = max(rCam - 0.044, p.z + (HD - 0.032));
    dBarrel = smax(dBarrel, -dLensHole, 0.003);
    res = opU(res, vec2(dBarrel, MAT_DARK));

    // Convex domed anti-reflective glass lens element
    float dLens = length(p - vec3(camC, -(HD - 0.062))) - 0.056;
    dLens = max(dLens, rCam - 0.046);
    res = opU(res, vec2(dLens, MAT_LENS));

    // 3b. 3 Recessed Black Phillips Screws: back top-left, bottom-left, bottom-right
    if (abs(p.x) > 0.62 && abs(p.y) > 0.70 && !(p.x < 0.0 && p.y > 0.0)) {
      vec2 sc = (p.y > 0.0) ? vec2(0.766, 0.848) : (p.x > 0.0 ? vec2(0.768, -0.863) : vec2(-0.763, -0.863));
      vec2 sp = p.xy - sc;
      float rScr = length(sp);
      // Chamfered yellow countersunk well
      float dScrWell = max(rScr - 0.048, p.z + (HD - 0.024));
      dBody = smax(dBody, -dScrWell, 0.008);

      // Black domed screw head
      float dHead = max(rScr - 0.038, abs(p.z + (HD - 0.018)) - 0.010);
      // Crisp recessed Phillips cross slot (+)
      float crossH = sdBox(vec3(sp, p.z + (HD - 0.007)), vec3(0.022, 0.0055, 0.011));
      float crossV = sdBox(vec3(sp, p.z + (HD - 0.007)), vec3(0.0055, 0.022, 0.011));
      dHead = smax(dHead, -min(crossH, crossV), 0.0015);
      res = opU(res, vec2(dHead, MAT_DARK));
    }
  }

  // -------------------------------------------------------------------------
  // 4. LEFT EDGE (-X): Hot-Pink Ribbed Push-To-Talk / Power Button
  // -------------------------------------------------------------------------
  if (p.x < -0.78) {
    // Recess slot on left edge where PTT bar slides in
    float dPttSlot = sdRoundBox(p - vec3(-HW, 0.275, 0.0), vec3(0.030, 0.478, 0.092), 0.018);
    dBody = smax(dBody, -dPttSlot, 0.004);

    // Protruding hot-pink tactile bar (slides inward cleanly when uPttPress > 0!)
    float pressShift = uPttPress * 0.044;
    vec3 pp = p - vec3(-HW - 0.038 + pressShift, 0.275, 0.0);
    float dPtt = sdRoundBox(pp, vec3(0.056, 0.464, 0.078), 0.020);
    // Crisp angled chamfered top & bottom ramps matching Image 1 & Image 2
    float rampT = (pp.y - 0.422) * 0.68 - (pp.x + 0.015) * 0.73;
    float rampB = (-pp.y - 0.422) * 0.68 - (pp.x + 0.015) * 0.73;
    dPtt = smax(dPtt, max(rampT, rampB), 0.009);
    // Fine diagonal tactile grip serrations tucked cleanly along outer face (Image 1 & 2)
    float ribMask = smoothstep(-0.025, -0.048, pp.x) * smoothstep(0.415, 0.375, abs(pp.y)) * smoothstep(0.068, 0.042, abs(pp.z));
    float ribs = 0.0020 * sin(pp.y * 165.0 + pp.z * 58.0) * ribMask;
    dPtt += ribs;
    res = opU(res, vec2(dPtt, MAT_PINK));
  }

  // -------------------------------------------------------------------------
  // 5. RIGHT EDGE (+X): Volume / Navigate Pill Rocker (▲ / ▼) & Circular Select
  // -------------------------------------------------------------------------
  if (p.x > 0.78) {
    // 5a. Pill-shaped Up/Down Rocker (center y = +0.364)
    vec2 rp = vec2(p.z, p.y - 0.364);
    float dRockWell2D = sdRoundBox2D(rp, vec2(0.092, 0.312), 0.092);
    float dRockWell = max(dRockWell2D, -(p.x - (HW - 0.020)));
    dBody = smax(dBody, -dRockWell, 0.004);

    // Flush matching yellow pill rocker tilting slightly inward on top (uUpPress) or bottom (uDownPress)
    float tilt = (uDownPress - uUpPress) * 0.06;
    float pressIn = (uUpPress + uDownPress) * 0.014;
    float xFace = HW + 0.004 - pressIn + (p.y - 0.364) * tilt;
    float dRock2D = sdRoundBox2D(rp, vec2(0.083, 0.303), 0.083);
    float dRock = max(dRock2D, abs(p.x - (xFace - 0.016)) - 0.016);
    // Subtle soft rounded top rim on rocker face
    dRock = smax(dRock, (dRock2D + (p.x - xFace) + 0.008) * 0.7071, 0.004);

    // Crisp center horizontal divider seam splitting Up and Down halves (Image 3!)
    float dSplit = sdBox(vec3(p.x - xFace, p.y - 0.364, p.z), vec3(0.014, 0.0045, 0.090));
    dRock = smax(dRock, -dSplit, 0.0015);

    // Debossed Up triangle ▲ (y = +0.520) and Down triangle ▼ (y = +0.208)
    float dTriUp = max(sdTri2D(vec2(p.z, p.y - 0.520), 0.025, 1.0), -(p.x - (xFace - 0.006)));
    float dTriDn = max(sdTri2D(vec2(p.z, p.y - 0.208), 0.025, -1.0), -(p.x - (xFace - 0.006)));
    dRock = smax(dRock, -min(dTriUp, dTriDn), 0.0018);

    res = opU(res, vec2(dRock, MAT_BUTTON));

    // 5b. Circular Select Button (center y = -0.247, radius 0.082)
    float rSel = length(vec2(p.z, p.y + 0.247));
    float dSelWell = max(rSel - 0.091, -(p.x - (HW - 0.020)));
    dBody = smax(dBody, -dSelWell, 0.004);

    float selFace = HW + 0.004 - uSelectPress * 0.018;
    float dSel = max(rSel - 0.082, abs(p.x - (selFace - 0.016)) - 0.016);
    dSel = smax(dSel, (rSel - 0.082 + (p.x - selFace) + 0.008) * 0.7071, 0.004);
    res = opU(res, vec2(dSel, MAT_BUTTON));
  }

  // -------------------------------------------------------------------------
  // 6. BOTTOM EDGE (-Y): Clean Recessed USB-C Charging Port
  // -------------------------------------------------------------------------
  if (p.y < -0.90) {
    float dUsb = sdRoundBox(p - vec3(0.0, -HH, 0.0), vec3(0.115, 0.032, 0.036), 0.032);
    dBody = smax(dBody, -dUsb, 0.004);
    float dUsbIn = sdRoundBox(p - vec3(0.0, -HH + 0.028, 0.0), vec3(0.110, 0.012, 0.030), 0.008);
    res = opU(res, vec2(dUsbIn, MAT_DARK));
  }

  res = opU(res, vec2(dBody, MAT_SHELL));
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
    float h = 0.010 + 0.035 * float(i);
    float d = mapDist(p + h * n);
    occ += (h - d) * sca;
    sca *= 0.70;
  }
  return clamp(1.0 - 2.9 * occ, 0.14, 1.0);
}

float calcSoftShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
  float res = 1.0;
  float t = mint;
  for (int i = 0; i < 18; i++) {
    float h = mapDist(ro + rd * t);
    if (h < 0.0005) return 0.0;
    res = min(res, k * h / t);
    t += clamp(h, 0.008, 0.10);
    if (t > maxt) break;
  }
  return clamp(res, 0.0, 1.0);
}

// ---------------------------------------------------------------------------
// Crisp Industrial Design Studio Environment Map (world space)
// ---------------------------------------------------------------------------
vec3 studioEnv(vec3 r, float rough) {
  vec3 floorDark = vec3(0.08, 0.09, 0.06);
  vec3 midStudio = vec3(0.32, 0.34, 0.32);
  vec3 topStudio = vec3(0.86, 0.88, 0.86);

  vec3 env = mix(floorDark, midStudio, smoothstep(-0.6, 0.15, r.y));
  env = mix(env, topStudio, smoothstep(0.15, 0.90, r.y));

  float sharp = mix(1.0, 0.22, rough);
  float w1 = mix(7.5, 2.0, rough);
  float w2 = mix(9.0, 2.5, rough);

  // Clean diagonal overhead softbox reflection (glides dramatically over the black glass screen!)
  float s1 = exp(-pow((r.y * 0.78 + r.x * 0.52 - 0.46) * w1, 2.0)) * smoothstep(-0.2, 0.4, r.z + 0.5);
  // Crisp side rim softbox defining the chamfered polycarbonate bevels
  float s2 = exp(-pow((r.x * 0.85 - r.y * 0.35 + 0.62) * w2, 2.0));

  env += vec3(1.15, 1.16, 1.18) * s1 * (1.15 * sharp + 0.30);
  env += vec3(0.85, 0.88, 0.92) * s2 * (0.75 * sharp + 0.18);
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
// Material Shading + Live Emissive Glass Screen
// ---------------------------------------------------------------------------
vec3 shade(vec3 p, vec3 nObj, vec3 vObj, float matId) {
  float ao = calcAO(p, nObj);

  // Tactile bead-blasted polycarbonate micro-stipple
  float stipple = vnoise3(p * 175.0);
  float micro2  = vnoise3(p * 320.0 + 4.7);

  // Oddware acid-yellow-green shell (linearized RGB matching Image 1/2/3's tactile polycarbonate,
  // subtly deeper & richer than the #efff47 page so the physical shell pops cleanly!)
  vec3 shellCol = vec3(0.56, 0.68, 0.006);

  vec3 albedo = shellCol;
  float metal = 0.0;
  float rough = 0.46;
  vec3 bump = vec3(0.0);
  vec3 emissive = vec3(0.0);

  if (matId == MAT_SHELL || matId == MAT_BUTTON) {
    // Slightly richer contrast on buttons & chamfer recesses
    float toneVar = 0.94 + 0.12 * stipple;
    albedo = shellCol * toneVar;
    if (matId == MAT_BUTTON) albedo *= 0.97;
    metal = 0.0;
    rough = 0.44 + 0.10 * (1.0 - stipple);
    bump = (vec3(stipple, micro2, vnoise3(p * 180.0 + 11.3)) - 0.5) * 0.028;

    // Subtle real screen-glow bleed onto the chamfered inner bezel lip when Gizmo is awake!
    if (uBacklight > 0.01 && p.z > 0.12) {
      float dScr = sdRoundBox2D(p.xy - SCR_C, SCR_H, SCR_R);
      float nearBezel = smoothstep(0.055, 0.0, dScr) * smoothstep(-0.02, 0.005, dScr);
      emissive += vec3(0.28, 0.10, 0.22) * nearBezel * uBacklight * 0.35;
    }
  } else if (matId == MAT_PINK) {
    // Vibrant Oddware hot-pink matte soft-touch PTT bar (#ff0078)
    albedo = vec3(0.95, 0.008, 0.19) * (0.95 + 0.10 * stipple);
    metal = 0.0;
    rough = 0.36 + 0.10 * (1.0 - stipple);
    bump = (vec3(stipple, micro2, vnoise3(p * 190.0 + 2.1)) - 0.5) * 0.024;
  } else if (matId == MAT_SCREEN) {
    // Deep laminated jet-black OLED cover glass
    albedo = vec3(0.002, 0.0025, 0.003);
    metal = 0.0;
    rough = 0.032;

    // Sample live Gizmo 1 OS canvas texture inside a concentrically rounded active LCD area!
    if (uBacklight > 0.002) {
      vec2 activeH = SCR_H - vec2(0.022);
      float dActive = sdRoundBox2D(p.xy - SCR_C, activeH, SCR_R - 0.020);
      float activeMask = smoothstep(0.004, -0.002, dActive);
      if (activeMask > 0.001) {
        vec2 padUv = (p.xy - (SCR_C - activeH)) / (2.0 * activeH);
        padUv.y = 1.0 - padUv.y; // canvas top-down Y
        vec3 px = texture(uScreen, clamp(padUv, 0.0, 1.0)).rgb;
        vec3 pxLin = pow(px, vec3(2.2));
        float vig = 1.0 - 0.07 * dot((padUv - 0.5) * 1.4, (padUv - 0.5) * 1.4);
        emissive = pxLin * uBacklight * 1.26 * vig * activeMask;
      }
    }
  } else if (matId == MAT_CAM_RING) {
    // Glossy black anodized aluminum camera ring
    albedo = vec3(0.015, 0.017, 0.020);
    metal = 0.78;
    rough = 0.14;
  } else if (matId == MAT_LENS) {
    // Deep convex multi-coated sapphire-indigo optical camera lens element
    vec2 camC = vec2(-0.725, 0.813);
    float lr = length(p.xy - camC);
    float aperture = smoothstep(0.020, 0.014, lr);
    albedo = mix(vec3(0.010, 0.026, 0.068), vec3(0.002, 0.004, 0.010), aperture);
    metal = 0.18;
    rough = 0.024;
  } else {
    // MAT_DARK: speaker perforations, screws, inner barrel, USB-C interior
    albedo = vec3(0.014, 0.016, 0.018);
    metal = 0.35;
    rough = 0.42;
  }

  vec3 nLocal = normalize(nObj + bump);
  vec3 nW = normalize(uRot * nLocal);
  vec3 vW = normalize(uRot * vObj);
  float ndv = max(dot(nW, vW), 0.001);

  vec3 f0 = mix(vec3(0.04), albedo, metal);
  if (matId == MAT_SCREEN) f0 = vec3(0.045); // realistic glass IOR 1.52
  if (matId == MAT_LENS)   f0 = vec3(0.06, 0.10, 0.22); // indigo-blue AR lens coating!

  float a2 = pow(max(rough, 0.03), 4.0);

  // Key Light (world space: crisp high upper-left studio key)
  vec3 lKeyW = normalize(vec3(-0.48, 0.72, 0.62));
  vec3 lKeyObj = normalize(transpose(uRot) * lKeyW);
  float ndlKey = max(dot(nW, lKeyW), 0.0);
  float shad = (ndlKey > 0.001) ? calcSoftShadow(p + nObj * 0.005, lKeyObj, 0.012, 1.5, 14.0) : 0.0;
  shad = mix(0.32, 1.0, shad);

  vec3 hKey = normalize(lKeyW + vW);
  float ndhKey = max(dot(nW, hKey), 0.0);
  float vdhKey = max(dot(vW, hKey), 0.0);
  vec3 fKey = f0 + (1.0 - f0) * pow(1.0 - vdhKey, 5.0);
  vec3 specKey = (D_GGX(ndhKey, a2) * G_Smith(ndv, ndlKey, rough) * fKey) / max(4.0 * ndv * ndlKey, 0.001);
  vec3 diffKey = (1.0 - fKey) * (1.0 - metal) * albedo / 3.14159265;
  vec3 col = (diffKey + specKey) * vec3(2.20, 2.20, 2.22) * ndlKey * shad;

  // Soft Fill / Rim Light (opposite lower-right edge definition)
  vec3 lRimW = normalize(vec3(0.68, 0.36, -0.58));
  float ndlRim = max(dot(nW, lRimW), 0.0);
  vec3 hRim = normalize(lRimW + vW);
  float ndhRim = max(dot(nW, hRim), 0.0);
  vec3 fRim = f0 + (1.0 - f0) * pow(1.0 - max(dot(vW, hRim), 0.0), 5.0);
  vec3 specRim = (D_GGX(ndhRim, a2) * G_Smith(ndv, ndlRim, rough) * fRim) / max(4.0 * ndv * ndlRim, 0.001);
  col += ((1.0 - metal) * albedo * 0.35 + specRim) * vec3(0.95, 1.00, 1.06) * ndlRim * ao;

  // Studio IBL Ambient Diffuse & Specular Reflections
  vec3 reflW = reflect(-vW, nW);
  vec3 fEnv = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - ndv, 5.0);
  vec3 envSample = studioEnv(reflW, rough);
  if (matId == MAT_SCREEN) {
    // Crisp high-contrast glass reflection streak without washing deep black OLED into gray
    envSample = pow(max(envSample - 0.14, 0.0), vec3(1.55)) * 0.42;
  }
  float specScale = (matId == MAT_SCREEN) ? 0.55 : mix(0.85, 0.30, rough);
  vec3 envSpec = envSample * fEnv * specScale;
  vec3 envDiff = (matId == MAT_SCREEN) ? vec3(0.0) : studioEnv(nW, 0.95) * albedo * (1.0 - metal) * 0.72;
  col += (envDiff + envSpec) * mix(0.28, 1.0, ao);

  // Add self-lit OLED screen pixels cleanly beneath glossy cover-glass reflections!
  col += emissive;

  return col;
}

// ---------------------------------------------------------------------------
// Ray-AABB Intersection & Filmic Tonemap
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

  vec2 hitBox = intersectBox(ro, rd, vec3(-1.04, -1.06, -0.24), vec3(1.04, 1.06, 0.24));
  if (hitBox.y < max(hitBox.x, 0.0)) {
    outColor = vec4(0.0);
    return;
  }

  float t = max(hitBox.x, 0.0);
  float tMax = hitBox.y;
  float pxScale = uTanHalfFov / (0.5 * uRes.y);

  bool hit = false;
  float matId = MAT_SHELL;
  float minRatio = 1e9;
  float bestT = t;
  float bestMat = MAT_SHELL;

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
    float eps = max(0.0005, t * pxScale * 0.55);
    vec3 n = calcNormal(p, eps);
    col = shade(p, n, -rd, matId);
    alpha = 1.0;
  } else if (minRatio < 1.15) {
    vec3 p = ro + rd * bestT;
    float eps = max(0.0007, bestT * pxScale * 0.75);
    vec3 n = calcNormal(p, eps);
    col = shade(p, n, -rd, bestMat);
    alpha = smoothstep(1.15, 0.0, minRatio);
  }

  if (alpha > 0.001) {
    // Keep glowing OLED screen colors vibrant & crisp while tonemapping physical shell nicely
    vec3 mapped = (matId == MAT_SCREEN && uBacklight > 0.01)
      ? mix(aces(col * 1.08), clamp(col, 0.0, 1.0), 0.35)
      : aces(col * 1.10);
    col = pow(mapped, vec3(1.0 / 2.2));
  }

  outColor = vec4(col * alpha, alpha);
}
