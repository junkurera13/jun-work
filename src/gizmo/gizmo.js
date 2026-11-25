// Oddware Gizmo 1: interactive raymarched WebGL2 3D handheld device with its
// real live firmware bootup, blinking Gizmo OS, and clickable physical hardware
// controls (hot-pink ribbed PTT bar, right-edge up/down rocker, circular select
// button, and glossy OLED screen). Drag to spin 360 deg; click to power on or
// press any physical button.

import fragSrc from "./gizmo.frag.glsl?raw";
import { GizmoScreen } from "./screen.js";
import { playButtonClick } from "./sound.js";

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Column-major 3x3 rotations
const rotX = (a) => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)];
const rotY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)];
const rotZ = (a) => [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const mul = (a, b) => {
  const o = new Array(9);
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 3; r++)
      o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
  return o;
};
const mulMat3T = (m, x, y, z) => [
  m[0] * x + m[1] * y + m[2] * z,
  m[3] * x + m[4] * y + m[5] * z,
  m[6] * x + m[7] * y + m[8] * z,
];

// Resting pose: sits straight and upright facing the viewer; dragging orbits full 360 deg.
const REST = { x: 0.0, y: 0.0, z: 0.0 };
const FOV = (26 * Math.PI) / 180;
const MODEL_R = 1.24;
const FILL = 0.86;

// Ray-box intersection for 3D physical button picking in object space
function hitAABB(ro, rd, bMin, bMax) {
  let tMin = -1e9;
  let tMax = 1e9;
  for (let i = 0; i < 3; i++) {
    const inv = 1 / (rd[i] || 1e-9);
    let t0 = (bMin[i] - ro[i]) * inv;
    let t1 = (bMax[i] - ro[i]) * inv;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tMin = Math.max(tMin, t0);
    tMax = Math.min(tMax, t1);
  }
  return tMax >= Math.max(tMin, 0) ? Math.max(tMin, 0) : null;
}

const BODY_BOX = { min: [-1.07, -1.03, -0.22], max: [0.98, 1.03, 0.22] };

const HIT_ZONES = [
  { id: "ptt",    min: [-1.07, -0.24, -0.14], max: [-0.85, 0.78, 0.14] },
  { id: "up",     min: [0.87, 0.36, -0.12],   max: [0.98, 0.69, 0.12] },
  { id: "down",   min: [0.87, 0.04, -0.12],   max: [0.98, 0.36, 0.12] },
  { id: "select", min: [0.87, -0.35, -0.12],  max: [0.98, -0.14, 0.12] },
];

/**
 * Mount the 3D Oddware Gizmo 1 in host. Returns controller API + destroy().
 */
export function mountGizmo(host) {
  const canvas = document.createElement("canvas");
  canvas.className = "gizmo-canvas";
  host.append(canvas);

  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) {
    host.classList.add("no-webgl");
    return { destroy: () => canvas.remove(), togglePower: () => {}, onStateChange: () => () => {} };
  }

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));

  const u = {};
  for (const name of [
    "uRes", "uRot", "uDist", "uTanHalfFov", "uScreen", "uBacklight",
    "uPttPress", "uUpPress", "uDownPress", "uSelectPress",
  ]) {
    u[name] = gl.getUniformLocation(prog, name);
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Live OLED screen texture bound to unit 0
  const screen = new GizmoScreen();
  const screenTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, screenTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screen.canvas);

  let destroyed = false;

  // Orbit & animation state
  let yaw = REST.y;
  let pitch = REST.x;
  let roll = REST.z;
  let vYaw = 0;
  let vPitch = 0;
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  let activePointer = null;
  let downHit = null;
  let pttHeld = false;

  // Smooth spring state for physical button depressions
  let pttPress = 0;
  let pttPulseUntil = 0;
  let pttHoldTimer = 0;
  let pttHoldingListen = false;
  let upPress = 0;
  let downPress = 0;
  let selectPress = 0;
  let upPulseUntil = 0;
  let downPulseUntil = 0;
  let selectPulseUntil = 0;

  // Last frame camera state for exact 3D button raycasting
  let curRot = mul(rotX(REST.x), mul(rotY(REST.y), rotZ(REST.z)));
  let curDist = 6.2;
  let curTanH = Math.tan(FOV / 2);

  let inView = true;

  function screenRay(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const fx = (clientX - r.left) / r.width;
    const fy = 1 - (clientY - r.top) / r.height;
    const aspect = r.width / r.height;
    const ux = (fx * 2 - 1) * aspect;
    const uy = fy * 2 - 1;
    const rdx = ux * curTanH;
    const rdy = uy * curTanH;
    const rdz = -1;
    const invLen = 1 / Math.hypot(rdx, rdy, rdz);
    return {
      ro: mulMat3T(curRot, 0, 0, curDist),
      rd: mulMat3T(curRot, rdx * invLen, rdy * invLen, rdz * invLen),
    };
  }

  function pickControl(clientX, clientY) {
    const ray = screenRay(clientX, clientY);
    if (!ray) return null;
    let bestId = null;
    let bestT = Infinity;
    for (const z of HIT_ZONES) {
      const ht = hitAABB(ray.ro, ray.rd, z.min, z.max);
      if (ht !== null && ht < bestT) {
        bestT = ht;
        bestId = z.id;
      }
    }
    return bestId;
  }

  function hitsDevice(clientX, clientY) {
    const ray = screenRay(clientX, clientY);
    return ray ? hitAABB(ray.ro, ray.rd, BODY_BOX.min, BODY_BOX.max) !== null : false;
  }

  const onDown = (e) => {
    if (e.button !== 0) return;
    downHit = pickControl(e.clientX, e.clientY);
    // Let clicks on empty transparent margin around the 3D device bubble up to pan the canvas
    if (!downHit && !hitsDevice(e.clientX, e.clientY)) return;
    e.stopPropagation();

    activePointer = e.pointerId;
    host.setPointerCapture?.(e.pointerId);
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    vYaw = 0;
    vPitch = 0;

    // Hot-pink side button: tap toggles power ON/OFF; holding while awake listens
    if (downHit === "ptt") {
      pttHeld = true;
      pttHoldingListen = false;
      host.style.cursor = "pointer";
      if (screen.isPoweredOn()) {
        pttHoldTimer = setTimeout(() => {
          if (!pttHeld) return;
          pttHoldingListen = true;
          screen.pttDown(performance.now());
        }, 320);
      }
      return;
    }
    host.style.cursor = "grabbing";
  };

  const onMove = (e) => {
    if (!dragging || e.pointerId !== activePointer) {
      const hoverHit = pickControl(e.clientX, e.clientY);
      if (hoverHit) host.style.cursor = "pointer";
      else if (hitsDevice(e.clientX, e.clientY)) host.style.cursor = "grab";
      else host.style.cursor = "";
      return;
    }
    e.stopPropagation();

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.hypot(dx, dy);

    // If user drags significantly while pressing the pink button, orbit instead
    if (pttHeld && moved > 10) {
      clearTimeout(pttHoldTimer);
      pttHeld = false;
      if (pttHoldingListen) {
        pttHoldingListen = false;
        screen.pttUp(performance.now());
      }
      host.style.cursor = "grabbing";
    }
    if (pttHeld) return;

    const sens = 0.0085;
    yaw += dx * sens;
    pitch = Math.max(-1.25, Math.min(1.25, pitch + dy * sens));
    vYaw = dx * sens * 28;
    vPitch = dy * sens * 28;
  };

  const onUp = (e) => {
    if (!dragging || e.pointerId !== activePointer) return;
    dragging = false;
    activePointer = null;
    host.releasePointerCapture?.(e.pointerId);
    host.style.cursor = "grab";

    const now = performance.now();
    if (pttHeld) {
      clearTimeout(pttHoldTimer);
      pttHeld = false;
      if (pttHoldingListen) {
        pttHoldingListen = false;
        screen.pttUp(now);
      } else {
        pttPulseUntil = now + 170;
        screen.togglePower(now);
      }
      downHit = null;
      return;
    }

    // Tactile physical clicks on the right-edge rocker & select buttons (no screen action)
    if (moved < 6) {
      if (downHit === "up") {
        upPulseUntil = now + 150;
        playButtonClick("rocker");
      } else if (downHit === "down") {
        downPulseUntil = now + 150;
        playButtonClick("rocker");
      } else if (downHit === "select") {
        selectPulseUntil = now + 160;
        playButtonClick("select");
      }
    }
    downHit = null;
  };

  const onDblClick = (e) => {
    if (!hitsDevice(e.clientX, e.clientY)) return;
    e.stopPropagation();
    yaw = REST.y;
    pitch = REST.x;
    roll = REST.z;
    vYaw = vPitch = 0;
  };

  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointercancel", onUp);
  host.addEventListener("dblclick", onDblClick);
  host.style.touchAction = "none";

  // Pause raymarching cleanly when scrolled out of view in the WORK list
  const io = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
  });
  io.observe(canvas);

  let raf = 0;
  let last = performance.now();
  let needsRender = true;
  let lastBacklight = -1;
  let lastYaw = NaN;
  let lastPitch = NaN;

  const resize = () => {
    const dpr = Math.min(1.75, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      needsRender = true;
    }
  };

  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (!inView || document.hidden || canvas.clientWidth === 0) {
      last = now;
      return;
    }

    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // Update live Gizmo OS screen canvas & re-upload texture only when changed
    if (screen.update(now)) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, screenTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, screen.canvas);
      needsRender = true;
    }

    // Smooth physical button travel springs
    const bk = Math.min(1, dt * 22);
    const pttT = pttHeld || now < pttPulseUntil ? 1 : 0;
    const upT = now < upPulseUntil ? 1 : 0;
    const downT = now < downPulseUntil ? 1 : 0;
    const selT = now < selectPulseUntil ? 1 : 0;
    const btnDelta =
      Math.abs(pttT - pttPress) +
      Math.abs(upT - upPress) +
      Math.abs(downT - downPress) +
      Math.abs(selT - selectPress);
    if (btnDelta > 0.0005) {
      pttPress += (pttT - pttPress) * bk;
      upPress += (upT - upPress) * bk;
      downPress += (downT - downPress) * bk;
      selectPress += (selT - selectPress) * bk;
      needsRender = true;
    } else if (btnDelta > 0) {
      pttPress = pttT;
      upPress = upT;
      downPress = downT;
      selectPress = selT;
      needsRender = true;
    }

    if (!dragging && (Math.abs(vYaw) > 0.0008 || Math.abs(vPitch) > 0.0008)) {
      yaw += vYaw * dt;
      pitch = Math.max(-1.25, Math.min(1.25, pitch + vPitch * dt));
      const damp = Math.exp(-5.2 * dt);
      vYaw *= damp;
      vPitch *= damp;
      needsRender = true;
    } else if (!dragging) {
      vYaw = vPitch = 0;
    }

    resize();

    const backlight = screen.getBacklight(now);
    if (
      dragging ||
      yaw !== lastYaw ||
      pitch !== lastPitch ||
      Math.abs(backlight - lastBacklight) > 0.0005
    ) {
      needsRender = true;
    }

    // Skip expensive full-screen SDF raymarching when Gizmo is completely static!
    if (!needsRender) return;
    needsRender = false;
    lastYaw = yaw;
    lastPitch = pitch;
    lastBacklight = backlight;

    const ax = pitch;
    const ay = yaw;
    const az = roll;

    curRot = mul(rotX(ax), mul(rotY(ay), rotZ(az)));

    const aspect = canvas.width / canvas.height;
    curTanH = Math.tan(FOV / 2);
    const distH = MODEL_R / (FILL * curTanH);
    const distW = MODEL_R / (FILL * curTanH * aspect);
    curDist = Math.max(distH, distW);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, screenTex);
    gl.uniform1i(u.uScreen, 0);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniformMatrix3fv(u.uRot, false, curRot);
    gl.uniform1f(u.uDist, curDist);
    gl.uniform1f(u.uTanHalfFov, curTanH);
    gl.uniform1f(u.uBacklight, backlight);
    gl.uniform1f(u.uPttPress, pttPress);
    gl.uniform1f(u.uUpPress, upPress);
    gl.uniform1f(u.uDownPress, downPress);
    gl.uniform1f(u.uSelectPress, selectPress);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    host.classList.add("is-live");
  }

  raf = requestAnimationFrame(frame);

  return {
    powerOn: () => {
      selectPulseUntil = performance.now() + 160;
      screen.powerOn(performance.now());
    },
    powerOff: () => {
      selectPulseUntil = performance.now() + 160;
      screen.powerOff(performance.now());
    },
    togglePower: () => {
      selectPulseUntil = performance.now() + 160;
      screen.togglePower(performance.now());
    },
    isPoweredOn: () => screen.isPoweredOn(),
    onStateChange: (fn) => screen.onChange(fn),
    destroy() {
      destroyed = true;
      clearTimeout(pttHoldTimer);
      cancelAnimationFrame(raf);
      io.disconnect();
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      host.removeEventListener("dblclick", onDblClick);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}
