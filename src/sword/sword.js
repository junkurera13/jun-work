// Asta's Demon-Destroyer Sword (Black Clover): a live raymarched WebGL2
// ancient forged dark-iron greatsword. Sweeps diagonally across the stage,
// tilts toward the pointer so studio light slides across its hammered facets
// and central diamond ridge, orbits 360 degrees when dragged, and unleashes
// an Anti-Magic Causality Break surge (with Web Audio) when clicked.

import fragSrc from "./sword.frag.glsl?raw";
import { playAntiMagicSurge, playBladeHum } from "./sound.js";

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

// Hero pose matching the reference diagonal: flared crescent tip + hollow
// clover sweeping bottom-left, twin-bulb crossguard & tapered handle top-right,
// turned slightly toward the key light (-Y yaw) so the hammered ancient iron
// patina and dual-tone central diamond ridge immediately pop in 3D.
const REST = { x: 0.08, y: -0.20, z: -0.76 };
const HOVER_TILT = { x: 0.18, y: 0.28 };
const FOV = (26 * Math.PI) / 180;

// Bounding radius along diagonal (commanding hero presence with room for surge twist & 360 spin)
const MODEL_R = 1.38;
const FILL = 0.93;

/**
 * Mount the Demon-Destroyer Sword inside host (fills it). Returns { destroy, triggerSurge }.
 */
export function mountSword(host) {
  const canvas = document.createElement("canvas");
  canvas.className = "sword-canvas";
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
    return { destroy: () => canvas.remove() };
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
  for (const name of ["uRes", "uRot", "uDist", "uTanHalfFov", "uTime", "uSurge", "uSurgeProg"]) {
    u[name] = gl.getUniformLocation(prog, name);
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // 360-degree drag orbit state with smooth inertia
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
  let spinAccum = 0;

  // Hover tilt state
  let px = 0;
  let py = 0;
  let tx = 0;
  let ty = 0;
  let over = 0;
  let overTarget = 0;

  // Anti-Magic Causality Break surge state
  let surgeTime = -10;

  const triggerSurge = () => {
    if (t - surgeTime < 0.4) return;
    surgeTime = t;
    playAntiMagicSurge();
  };

  const onDown = (e) => {
    if (e.button !== 0) return;
    activePointer = e.pointerId;
    host.setPointerCapture?.(e.pointerId);
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    vYaw = 0;
    vPitch = 0;
    host.style.cursor = "grabbing";
  };

  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    overTarget = 1;

    if (!dragging || e.pointerId !== activePointer) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.hypot(dx, dy);

    const sens = 0.0085;
    yaw += dx * sens;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * sens));
    vYaw = dx * sens * 30;
    vPitch = dy * sens * 30;

    spinAccum += Math.abs(dx * sens);
    if (spinAccum > Math.PI / 2) {
      spinAccum = 0;
      playBladeHum();
    }
  };

  const onUp = (e) => {
    if (!dragging || e.pointerId !== activePointer) return;
    dragging = false;
    activePointer = null;
    host.releasePointerCapture?.(e.pointerId);
    host.style.cursor = "grab";
    if (moved < 6) triggerSurge();
  };

  const onLeave = () => {
    overTarget = 0;
    tx = ty = 0;
  };

  const onDblClick = () => {
    yaw = REST.y;
    pitch = REST.x;
    roll = REST.z;
    vYaw = vPitch = 0;
  };

  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerup", onUp);
  host.addEventListener("pointercancel", onUp);
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("dblclick", onDblClick);
  host.style.cursor = "grab";
  host.style.touchAction = "none";

  let destroyed = false;
  let raf = 0;
  let t = 0;
  let last = performance.now();

  const resize = () => {
    const dpr = Math.min(1.75, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;

    const k = Math.min(1, dt * 6);
    px += (tx - px) * k;
    py += (ty - py) * k;
    over += (overTarget - over) * k;

    if (!dragging) {
      yaw += vYaw * dt;
      pitch = Math.max(-1.2, Math.min(1.2, pitch + vPitch * dt));
      const damp = Math.exp(-5.0 * dt);
      vYaw *= damp;
      vPitch *= damp;
    }

    resize();

    // Anti-Magic surge animation: fast slash twist + crimson wave racing up the blade
    const st = t - surgeTime;
    let surge = 0;
    let surgeProg = 0;
    let slashRoll = 0;
    let slashYaw = 0;
    let slashZoom = 0;

    if (st >= 0 && st < 1.55) {
      // Quick ignition ramp -> sustained burning aura -> smooth cool-down
      const rise = Math.min(1, st / 0.07);
      const decay = Math.exp(-Math.max(0, st - 0.35) * 2.6);
      surge = rise * decay;
      // Wave races rapidly from clover (0.0) past the crossguard (1.45)
      surgeProg = Math.min(1.5, st * 2.4);

      // Kinetic diagonal severing kick + subtle demonic vibration
      const kick = Math.sin(Math.min(1, st / 0.09) * Math.PI * 0.5) * Math.exp(-Math.max(0, st - 0.06) * 6.2);
      const vibe = Math.sin(st * 75.0) * Math.exp(-st * 7.5) * 0.018;
      slashRoll = kick * 0.24 + vibe;
      slashYaw = -kick * 0.32;
      slashZoom = -kick * 0.28;
    }

    const sway = reduceMotion || dragging ? 0 : 1 - over * 0.65;
    const ax = pitch + py * HOVER_TILT.x * over * (dragging ? 0 : 1) + sway * 0.045 * Math.sin(t * 0.52);
    const ay = yaw + px * HOVER_TILT.y * over * (dragging ? 0 : 1) + sway * 0.14 * Math.sin(t * 0.36 + 0.8) + slashYaw;
    const az = roll + sway * 0.025 * Math.sin(t * 0.44 + 1.6) + slashRoll;

    // Apply blade axial spin/tilt in Y & X, then diagonal hero roll in Z so the sword sweeps gracefully
    const rot = mul(rotZ(az), mul(rotX(ax), rotY(ay)));

    const aspect = canvas.width / canvas.height;
    const tanH = Math.tan(FOV / 2);
    const distH = MODEL_R / (FILL * tanH);
    const distW = MODEL_R / (FILL * tanH * aspect);
    const dist = Math.max(distH, distW) + slashZoom;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniformMatrix3fv(u.uRot, false, rot);
    gl.uniform1f(u.uDist, dist);
    gl.uniform1f(u.uTanHalfFov, tanH);
    gl.uniform1f(u.uTime, t);
    gl.uniform1f(u.uSurge, surge);
    gl.uniform1f(u.uSurgeProg, surgeProg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    host.classList.add("is-live");
  }

  raf = requestAnimationFrame(frame);

  return {
    triggerSurge,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("dblclick", onDblClick);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}
