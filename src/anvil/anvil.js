// The Amplified Anvil (ARC Raiders): a live raymarched WebGL2 hand cannon.
// Rests at its signature angled 3/4 profile, tilts subtly toward the pointer,
// orbits 360 degrees when dragged, and fires a single-action shot (hammer
// snap, muzzle flash, heavy upward recoil, cylinder index, and Web Audio)
// when clicked.

import fragSrc from "./anvil.frag.glsl?raw";
import { playAnvilShot, playCylinderTick } from "./sound.js";

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

// Hero resting pose: tilted up-left like the ARC Raiders icon, turned
// slightly toward the muzzle (+Y yaw) so the chamfered barrel crown, hollow
// bore, pill vents, knurled drum, and contoured grip all pop cleanly in 3D.
const REST = { x: 0.10, y: 0.28, z: -0.60 };
const HOVER_TILT = { x: 0.16, y: 0.24 };
const FOV = (26 * Math.PI) / 180;

// Model half-extents (commanding hero scale with breathing room for recoil & 360 spin)
const MODEL_R = 1.38;
const FILL = 0.90;

/**
 * Mount the Amplified Anvil inside host (fills it). Returns { destroy, fire }.
 */
export function mountAnvil(host) {
  const canvas = document.createElement("canvas");
  canvas.className = "anvil-canvas";
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
  for (const name of ["uRes", "uRot", "uDist", "uTanHalfFov", "uTime", "uHammer", "uTrigger", "uCylAngle", "uFlash"]) {
    u[name] = gl.getUniformLocation(prog, name);
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Orbit state (drag to inspect 360 deg with smooth inertia)
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
  let dragSpinAccum = 0;

  // Hover tilt state
  let px = 0;
  let py = 0;
  let tx = 0;
  let ty = 0;
  let over = 0;
  let overTarget = 0;

  // Firing animation state (single-action Anvil cycle)
  let shotTime = -10;
  let cylStep = 0;
  let cylAngle = 0;
  let cylFrom = 0;

  const fire = () => {
    // Allow rapid re-firing once the initial blast settles (> 0.28s)
    if (t - shotTime < 0.28) return;
    shotTime = t;
    cylFrom = cylAngle;
    cylStep += 1;
    playAnvilShot();
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
    pitch = Math.max(-1.15, Math.min(1.15, pitch + dy * sens));
    vYaw = dx * sens * 32;
    vPitch = dy * sens * 32;

    // Tactile ratchet tick every ~60 deg of horizontal spin
    dragSpinAccum += Math.abs(dx * sens);
    if (dragSpinAccum > Math.PI / 3) {
      dragSpinAccum = 0;
      playCylinderTick();
    }
  };

  const onUp = (e) => {
    if (!dragging || e.pointerId !== activePointer) return;
    dragging = false;
    activePointer = null;
    host.releasePointerCapture?.(e.pointerId);
    host.style.cursor = "grab";
    if (moved < 6) fire();
  };

  const onLeave = () => {
    overTarget = 0;
    tx = ty = 0;
  };

  const onDblClick = () => {
    // Double-click smoothly resets back to hero pose
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
    // Cap DPR cleanly for smooth 60fps raymarching on high-DPI displays
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
      pitch = Math.max(-1.15, Math.min(1.15, pitch + vPitch * dt));
      const damp = Math.exp(-5.5 * dt);
      vYaw *= damp;
      vPitch *= damp;
    }

    resize();

    // Firing cycle: 0..0.06s hammer strike & flash, 0..0.48s violent barrel kick + recovery,
    // 0.30..0.48s cylinder 60-deg index & hammer recock.
    const st = t - shotTime;
    let recoilRoll = 0;
    let recoilPitch = 0;
    let recoilBack = 0;
    let hammer = 0.0;
    let trigger = 0.0;
    let flash = 0.0;

    if (st >= 0 && st < 0.75) {
      // Muzzle flash peaks sharply in first 45ms
      flash = Math.exp(-st * 34.0) * (st < 0.012 ? st / 0.012 : 1.0);

      // Heavy single-action upward barrel kick (rotates muzzle UP = negative Z in our coords!)
      const kickEnv = Math.sin(Math.min(1, st / 0.085) * Math.PI * 0.5) * Math.exp(-Math.max(0, st - 0.055) * 6.8);
      const settleBounce = Math.sin(Math.max(0, st - 0.055) * 18.0) * Math.exp(-Math.max(0, st - 0.055) * 9.0) * 0.08;
      recoilRoll = -(kickEnv * 0.36 + settleBounce);
      recoilPitch = kickEnv * 0.08;
      recoilBack = kickEnv * 0.22;

      // Hammer snaps sharply forward (+rad) immediately, then cocks back between 0.28s and 0.46s
      if (st < 0.04) {
        hammer = (st / 0.04) * 0.46;
      } else if (st < 0.28) {
        hammer = 0.46;
      } else if (st < 0.46) {
        const u = (st - 0.28) / 0.18;
        const ease = 1 - Math.pow(1 - u, 3);
        hammer = 0.46 * (1 - ease);
      }

      // Trigger pull
      if (st < 0.05) trigger = st / 0.05;
      else if (st < 0.24) trigger = 1 - (st - 0.05) / 0.19;

      // Cylinder indexes 60 degrees during recock
      if (st >= 0.26) {
        const u = Math.min(1, (st - 0.26) / 0.18);
        const ease = 1 - Math.pow(1 - u, 3);
        cylAngle = cylFrom + (cylStep * (Math.PI / 3) - cylFrom) * ease;
      }
    } else if (cylStep > 0) {
      cylAngle = cylStep * (Math.PI / 3);
    }

    const sway = reduceMotion || dragging ? 0 : 1 - over * 0.65;
    const ax = pitch + py * HOVER_TILT.x * over * (dragging ? 0 : 1) + sway * 0.045 * Math.sin(t * 0.55) + recoilPitch;
    const ay = yaw + px * HOVER_TILT.y * over * (dragging ? 0 : 1) + sway * 0.11 * Math.sin(t * 0.38 + 0.9);
    const az = roll + sway * 0.025 * Math.sin(t * 0.46 + 1.8) + recoilRoll;

    // Apply object-space roll (hero diagonal tilt + barrel kick), then turntable pitch & yaw
    const rot = mul(rotX(ax), mul(rotY(ay), rotZ(az)));

    const aspect = canvas.width / canvas.height;
    const tanH = Math.tan(FOV / 2);
    // Keep the full bounding radius comfortably inside both width and height
    const distH = MODEL_R / (FILL * tanH);
    const distW = MODEL_R / (FILL * tanH * aspect);
    const dist = Math.max(distH, distW) + recoilBack;

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
    gl.uniform1f(u.uHammer, hammer);
    gl.uniform1f(u.uTrigger, trigger);
    gl.uniform1f(u.uCylAngle, cylAngle);
    gl.uniform1f(u.uFlash, flash);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    host.classList.add("is-live");
  }

  raf = requestAnimationFrame(frame);

  return {
    fire,
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
