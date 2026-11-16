import "./styles.css";
import { Renderer } from "./render/renderer.js";
import { engravingCanvas } from "./render/engraving.js";
import { CrackAudio } from "./audio/crack.js";
import { WeatherAudio } from "./audio/weather.js";
import { WeatherPicker } from "./ui/weather.js";
import { Dock } from "./ui/dock.js";
import { FLAVORS } from "./flavors.js";
import { Fracture } from "./sim/fracture.js";
import { Liquid } from "./sim/liquid.js";
import { MELT_SECONDS, WEATHERS, WEATHER_DEFAULT, meltParams } from "./sim/melt.js";
import { bodyOuter, sdStick, STICK_Y0 } from "./sim/shape.js";
import { mat3FromQuat, mulMat3, mulMat3T, quatFromAxisAngle, quatMul } from "./sim/math.js";

const canvas = document.querySelector("#scene");
const controls = document.querySelector(".controls");
const weatherRoot = document.querySelector(".weather");
const resetBtn = document.querySelector(".reset");
const soundBtn = document.querySelector(".sound-toggle");
const dockRoot = document.querySelector(".flavors");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const FOV = (24 * Math.PI) / 180;
const TAN = Math.tan(FOV / 2);
const OBJ_CENTER_Y = -1.95; // middle of bar + stick in object space
const OBJ_Y_OFFSET = -0.35;
const REST_YAW = -0.4;

let renderer;
try {
  renderer = new Renderer(canvas);
} catch {
  document.body.classList.add("no-webgl");
}

const audio = new CrackAudio();
const ambience = new WeatherAudio(() => audio.ensure(), WEATHER_DEFAULT);
const fracture = new Fracture();
const liquid = new Liquid();

const state = {
  P: 0,
  flavor: 0,
  faluda: FLAVORS[0].faluda,
  passion: !!FLAVORS[0].passion,
  weather: WEATHER_DEFAULT,
  // eased blend of the weathers (for the painted sky, light and melt speed)
  weatherW: WEATHERS.map((_, i) => (i === WEATHER_DEFAULT ? 1 : 0)),
  yaw: REST_YAW,
  pitch: 0,
  yawVel: 0,
  pitchVel: 0,
  lastInput: -10,
  appear: 0, // 0 -> 1 entrance animation
  time: 0,
  shake: 0,
};

const weather = new WeatherPicker(weatherRoot, {
  value: WEATHER_DEFAULT,
  onChange: (i) => {
    state.weather = i;
    audio.tick(0.8 + i * 0.15);
    ambience.setWeather(i);
  },
});

// Browsers require a gesture before playing audio. Start with the current
// weather on the first interaction, then follow the picker until muted.
function startSound() {
  if (!renderer || audio.muted) return;
  ambience.enable();
}
window.addEventListener("pointerdown", startSound, { once: true });
window.addEventListener("keydown", startSound, { once: true });
soundBtn.addEventListener("click", () => {
  audio.muted = !audio.muted;
  soundBtn.setAttribute("aria-pressed", String(audio.muted));
  soundBtn.title = audio.muted ? "Turn sounds on" : "Mute sounds";
  ambience.setEnabled(!audio.muted);
});
document.addEventListener("visibilitychange", () => ambience.setHidden(document.hidden));

// --------------------------------------------------------------- camera ----

const cam = { pos: { x: 0, y: 0, z: 50 }, basis: [], D: 50 };

function updateCamera() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const aspect = w / h;
  const needH = 15.3 / 0.64;
  const needW = 7.2 / 0.78;
  const D = Math.max(needH / (2 * TAN), needW / (2 * TAN * aspect));
  cam.D = D;
  const elev = 0.09;
  cam.pos = { x: 0, y: Math.sin(elev) * D, z: Math.cos(elev) * D };
  // basis looking at the origin
  const f = norm({ x: -cam.pos.x, y: -cam.pos.y, z: -cam.pos.z });
  const r = norm(cross(f, { x: 0, y: 1, z: 0 }));
  const u = cross(r, f);
  cam.right = r;
  cam.up = u;
  cam.fwd = f;
  cam.aspect = aspect;
  cam.floorY = -D * TAN - 1;
}

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function norm(a) {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

// ---------------------------------------------------------------- world ----

const world = {
  quat: [0, 0, 0, 1],
  rot: mat3FromQuat([0, 0, 0, 1]),
  pos: { x: 0, y: 0, z: 0 },
  objToWorld(x, y, z) {
    const p = mulMat3(this.rot, x, y, z);
    return { x: p.x + this.pos.x, y: p.y + this.pos.y, z: p.z + this.pos.z };
  },
  worldToObj(x, y, z) {
    return mulMat3T(this.rot, x - this.pos.x, y - this.pos.y, z - this.pos.z);
  },
  worldDirToObj(x, y, z) {
    return mulMat3T(this.rot, x, y, z);
  },
};

function easeOutBack(t) {
  const c1 = 1.25;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function updateWorld() {
  const t = state.time;
  const idle = reduceMotion ? 0 : 1;
  const a = easeOutBack(Math.min(1, state.appear));
  const sway = idle * Math.min(1, Math.max(0, t - state.lastInput - 1.5) / 3);
  const yaw = state.yaw + sway * 0.09 * Math.sin(t * 0.33) + (1 - a) * 0.9;
  const pitch = state.pitch + sway * 0.03 * Math.sin(t * 0.27 + 1.0);
  const roll = sway * 0.022 * Math.sin(t * 0.41 + 2.0) + state.shake * 0.012 * Math.sin(t * 90);
  let q = quatFromAxisAngle(0, 1, 0, yaw);
  q = quatMul(q, quatFromAxisAngle(1, 0, 0, pitch));
  q = quatMul(quatFromAxisAngle(0, 0, 1, roll), q);
  world.quat = q;
  world.rot = mat3FromQuat(q);
  const bob = idle * 0.14 * Math.sin(t * 0.6);
  const drop = (1 - a) * 26;
  world.pos = {
    x: state.shake * 0.03 * Math.sin(t * 77),
    y: -OBJ_CENTER_Y + OBJ_Y_OFFSET + bob + drop,
    z: 0,
  };
}

// --------------------------------------------------------------- picking ---

function sceneDistJS(x, y, z, M) {
  return Math.min(bodyOuter(x, y, z, M), sdStick(x, y, z, M.faluda));
}

function pick(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ux = (clientX - rect.left - rect.width / 2) / (rect.height / 2);
  const uy = (rect.height / 2 - (clientY - rect.top)) / (rect.height / 2);
  const dw = norm({
    x: cam.right.x * ux * TAN + cam.up.x * uy * TAN + cam.fwd.x,
    y: cam.right.y * ux * TAN + cam.up.y * uy * TAN + cam.fwd.y,
    z: cam.right.z * ux * TAN + cam.up.z * uy * TAN + cam.fwd.z,
  });
  const ro = world.worldToObj(cam.pos.x, cam.pos.y, cam.pos.z);
  const rd = world.worldDirToObj(dw.x, dw.y, dw.z);
  const M = meltParams(state.P, state.faluda, state.passion);
  let t = cam.D - 12;
  for (let i = 0; i < 140; i++) {
    const x = ro.x + rd.x * t;
    const y = ro.y + rd.y * t;
    const z = ro.z + rd.z * t;
    const d = sceneDistJS(x, y, z, M);
    if (d < 0.004) {
      const e = 0.003;
      const n = norm({
        x: sceneDistJS(x + e, y, z, M) - sceneDistJS(x - e, y, z, M),
        y: sceneDistJS(x, y + e, z, M) - sceneDistJS(x, y - e, z, M),
        z: sceneDistJS(x, y, z + e, M) - sceneDistJS(x, y, z - e, M),
      });
      const onBody = bodyOuter(x, y, z, M) < sdStick(x, y, z, M.faluda) + 0.002;
      return { x, y, z, normal: n, onBody, M };
    }
    t += d * 0.85;
    if (t > cam.D + 12) break;
  }
  return null;
}

// ---------------------------------------------------------------- input ----

let pointer = null;
let hoverPending = false;

function onDown(e) {
  if (e.button !== undefined && e.button > 0) return;
  audio.ensure();
  try {
    canvas.setPointerCapture?.(e.pointerId);
  } catch {
    /* synthetic pointer */
  }
  pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() };
  state.lastInput = state.time;
  if (state.appear < 0.9) return;
  const hit = pick(e.clientX, e.clientY);
  if (!hit) return;
  if (state.P >= 0.995) {
    newIceCream();
    return;
  }
  if (hit.onBody) {
    const res = fracture.press(hit, state.time, hit.M, world);
    if (res) {
      const pan = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.slop = 14; // a finger wobbles; don't start turning the bar too eagerly
      audio.crack(res.type === "crunch" ? "pop" : "crack", pan, res.type === "crunch" ? 1 : 0.85);
      state.shake = res.type === "crunch" ? 0.9 : 0.6;
      if (navigator.vibrate) navigator.vibrate(res.type === "crunch" ? 14 : 9);
      canvas.classList.add("has-cracked");
      revealReset();
    }
  }
}

function onMove(e) {
  if (pointer && e.pointerId === pointer.id) {
    const dx = e.clientX - pointer.x;
    const dy = e.clientY - pointer.y;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (Math.hypot(e.clientX - pointer.sx, e.clientY - pointer.sy) > (pointer.slop || 4)) {
      pointer.moved = true;
    }
    if (pointer.moved) {
      state.yaw += dx * 0.0085;
      state.pitch = Math.max(-0.32, Math.min(0.32, state.pitch + dy * 0.0045));
      state.yawVel = dx * 0.0085 * 60;
      state.pitchVel = dy * 0.0045 * 60;
      state.lastInput = state.time;
      canvas.classList.add("is-dragging");
    }
    return;
  }
  if (!hoverPending && e.pointerType === "mouse") {
    hoverPending = true;
    requestAnimationFrame(() => {
      hoverPending = false;
      const hit = pick(e.clientX, e.clientY);
      canvas.classList.toggle("is-hover", !!hit && (hit.onBody || state.P >= 0.995));
    });
  }
}

function onUp(e) {
  if (!pointer || e.pointerId !== pointer.id) return;
  if (!pointer.moved) {
    state.yawVel = 0;
    state.pitchVel = 0;
  }
  pointer = null;
  canvas.classList.remove("is-dragging");
}

canvas.addEventListener("pointerdown", onDown);
window.addEventListener("pointermove", onMove);
window.addEventListener("pointerup", onUp);
window.addEventListener("pointercancel", onUp);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

window.addEventListener("keydown", (e) => {
  if (e.target === resetBtn || e.target.closest?.(".controls, .dock")) return;
  if (e.key === "ArrowLeft") state.yawVel -= 2;
  if (e.key === "ArrowRight") state.yawVel += 2;
});

let resetRevealFrame = 0;

function revealReset() {
  if (resetRevealFrame || resetBtn.classList.contains("is-visible")) return;
  resetBtn.hidden = false;
  resetRevealFrame = requestAnimationFrame(() => {
    resetRevealFrame = 0;
    resetBtn.inert = false;
    resetBtn.classList.add("is-visible");
  });
}

function newIceCream() {
  state.P = 0;
  state.appear = 0;
  state.yaw = REST_YAW;
  state.pitch = 0;
  state.yawVel = 0;
  state.pitchVel = 0;
  fracture.reset(state.faluda);
  liquid.reset(state.faluda, state.passion);
  canvas.classList.remove("has-cracked");
  cancelAnimationFrame(resetRevealFrame);
  resetRevealFrame = 0;
  resetBtn.inert = true;
  resetBtn.classList.remove("is-visible");
  if (renderer) renderer.uploadCracks(fracture.canvas);
}

resetBtn.addEventListener("click", () => {
  audio.ensure();
  newIceCream();
});

function selectFlavor(i) {
  if (i === state.flavor) return;
  const flavor = FLAVORS[i];
  state.flavor = i;
  state.faluda = flavor.faluda;
  state.passion = !!flavor.passion;
  audio.material = flavor.shell;
  canvas.setAttribute("aria-label", flavor.label);
  pointer = null;
  state.shake = 0;
  canvas.classList.remove("is-dragging", "is-hover");
  newIceCream();
}

const dock = new Dock(dockRoot, {
  items: FLAVORS,
  value: state.flavor,
  onChange: (i) => {
    audio.tick(1.1 + i * 0.12);
    selectFlavor(i);
  },
});

// Each picker circle is a round window onto that ice cream's own surface:
// a close-up of the front of the bar, turned and lit just like the big one,
// so it shows the real thing (the gloss streak on the chocolate, the frost on
// the rose ice). The page crops it to a circle.
function renderSwatch(flavor, { x, y, half }) {
  const px = 96;
  const ss = 2; // supersampled, then scaled down for smooth edges
  const tan = 0.05;
  const D = half / tan;
  const rot = mat3FromQuat(quatFromAxisAngle(0, 1, 0, REST_YAW));
  const look = mulMat3(rot, x, y, 0);
  const camObj = mulMat3T(rot, look.x, look.y, D);
  const ro = mulMat3T(rot, 1, 0, 0);
  const uo = mulMat3T(rot, 0, 1, 0);
  const fo = mulMat3T(rot, 0, 0, -1);
  const img = renderer.thumbnail(
    {
      camPos: camObj,
      camBasis: [ro.x, ro.y, ro.z, uo.x, uo.y, uo.z, fo.x, fo.y, fo.z],
      tanHalfFov: tan,
      objRot: rot,
      time: 0,
      boundMin: BODY_BOX.min,
      boundMax: BODY_BOX.max,
      melt: meltParams(0, flavor.faluda, !!flavor.passion),
      cracks: false,
      ooze: 0,
      primCount: 0,
      crumbCount: 0,
      liqMin: [0, 0, 0],
      liqMax: [0, 0, 0],
      exposure: 1.0,
      weatherA: [0, 0, 1, 0],
      weatherB: 0,
      lightTint: [1, 1, 1],
    },
    px * ss,
    px * ss,
  );
  const out = document.createElement("canvas");
  out.width = px;
  out.height = px;
  const g = out.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, px, px);
  return out.toDataURL("image/png");
}

function renderOrbs() {
  FLAVORS.forEach((flavor, i) => dock.setIcon(i, renderSwatch(flavor, flavor.swatch)));
}

// ----------------------------------------------------------------- loop ----

const BODY_BOX = { min: [-3.6, -10.05, -2.5], max: [3.6, 6.05, 2.5] };

function sceneBounds() {
  const min = BODY_BOX.min.slice();
  const max = BODY_BOX.max.slice();
  return { min, max };
}

function grow(b, p, r) {
  b.min[0] = Math.min(b.min[0], p.x - r);
  b.min[1] = Math.min(b.min[1], p.y - r);
  b.min[2] = Math.min(b.min[2], p.z - r);
  b.max[0] = Math.max(b.max[0], p.x + r);
  b.max[1] = Math.max(b.max[1], p.y + r);
  b.max[2] = Math.max(b.max[2], p.z + r);
}

function project(p) {
  const w = world.objToWorld(p.x, p.y, p.z);
  const d = { x: w.x - cam.pos.x, y: w.y - cam.pos.y, z: w.z - cam.pos.z };
  const z = d.x * cam.fwd.x + d.y * cam.fwd.y + d.z * cam.fwd.z;
  const x = (d.x * cam.right.x + d.y * cam.right.y + d.z * cam.right.z) / (z * TAN);
  const y = (d.x * cam.up.x + d.y * cam.up.y + d.z * cam.up.z) / (z * TAN);
  // to 0..1 screen (uv.x is scaled by aspect)
  return { x: 0.5 + x / (2 * cam.aspect), y: 0.5 + y / 2 };
}

function scissorFor(b) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < 8; i++) {
    const p = {
      x: i & 1 ? b.max[0] : b.min[0],
      y: i & 2 ? b.max[1] : b.min[1],
      z: i & 4 ? b.max[2] : b.min[2],
    };
    const s = project(p);
    x0 = Math.min(x0, s.x);
    y0 = Math.min(y0, s.y);
    x1 = Math.max(x1, s.x);
    y1 = Math.max(y1, s.y);
  }
  const m = 0.01;
  return [x0 - m, y0 - m, x1 + m, y1 + m];
}

let last = performance.now();
let lastFrameStart = last;
let backdropInsetTop = 0;
let backdropInsetBottom = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  state.time += dt;

  // the weather washes in over ~1.5 s; speed, sky and light all follow it
  const ease = 1 - Math.exp(-dt * 2.2);
  state.weatherW = state.weatherW.map((w, i) => w + ((i === state.weather ? 1 : 0) - w) * ease);
  const rate = WEATHERS.reduce((a, w, i) => a + w.rate * state.weatherW[i], 0);
  const tint = [0, 1, 2].map((k) => WEATHERS.reduce((a, w, i) => a + w.tint[k] * state.weatherW[i], 0));

  // melting
  if (state.appear >= 1) state.P = Math.min(1, state.P + (dt * rate) / MELT_SECONDS);
  if (state.P > 0.04) revealReset();
  const M = meltParams(state.P, state.faluda, state.passion);

  // motion
  // the entrance runs on wall-clock time so it never drags on slow devices
  state.appear = Math.min(1, state.appear + Math.min(0.25, (now - (frame.prev ?? now)) / 1000) / 1.1);
  frame.prev = now;
  if (!pointer) {
    state.yaw += state.yawVel * dt;
    state.pitch = Math.max(-0.32, Math.min(0.32, state.pitch + state.pitchVel * dt));
    const k = Math.exp(-dt * 3.2);
    state.yawVel *= k;
    state.pitchVel *= k;
    // drift gently back towards the nicest angle when left alone
    if (state.time - state.lastInput > 6 && !reduceMotion) {
      const target = REST_YAW + Math.round((state.yaw - REST_YAW) / (2 * Math.PI)) * 2 * Math.PI;
      state.yaw += (target - state.yaw) * (1 - Math.exp(-dt * 0.25));
      state.pitch += (0 - state.pitch) * (1 - Math.exp(-dt * 0.25));
    }
  }
  state.shake = Math.max(0, state.shake - dt * 7);
  updateWorld();

  if (!renderer || !renderer.u) return;

  fracture.update(dt, state.time, rate, M, world, cam.floorY);
  if (fracture.texDirty) {
    renderer.uploadCracks(fracture.canvas);
    fracture.texDirty = false;
  }
  liquid.update(dt, state.time, rate, M, fracture.leakSources(), world, cam.floorY);

  const dyn = renderer.dyn;
  const liq = liquid.pack(dyn, 64, world);
  const fr = fracture.pack(dyn, 64, world);
  renderer.uploadDyn();

  const b = sceneBounds();
  if (liq.count) {
    grow(b, { x: liq.min[0], y: liq.min[1], z: liq.min[2] }, 0.1);
    grow(b, { x: liq.max[0], y: liq.max[1], z: liq.max[2] }, 0.1);
  }
  for (const [p, r] of fracture.bounds(world)) grow(b, p, r + 0.05);
  // the stick tip is the lowest point that is always there
  b.min[1] = Math.min(b.min[1], STICK_Y0 - 0.2);

  renderer.resize();
  const camObj = world.worldToObj(cam.pos.x, cam.pos.y, cam.pos.z);
  const r = world.worldDirToObj(cam.right.x, cam.right.y, cam.right.z);
  const u = world.worldDirToObj(cam.up.x, cam.up.y, cam.up.z);
  const f = world.worldDirToObj(cam.fwd.x, cam.fwd.y, cam.fwd.z);

  renderer.draw(
    {
      camPos: camObj,
      camBasis: [r.x, r.y, r.z, u.x, u.y, u.z, f.x, f.y, f.z],
      tanHalfFov: TAN,
      objRot: world.rot,
      time: state.time,
      boundMin: b.min,
      boundMax: b.max,
      melt: M,
      cracks: fracture.any,
      ooze: fracture.ooze,
      primCount: liq.count,
      crumbCount: fr.crumbs,
      liqMin: liq.count ? liq.min : [0, 0, 0],
      liqMax: liq.count ? liq.max : [0, 0, 0],
      exposure: 1.0,
      weatherA: state.weatherW.slice(0, 4),
      weatherB: state.weatherW[4],
      lightTint: tint,
      backdropInsetTop,
      backdropInsetBottom,
    },
    scissorFor(b),
  );

  const ft = now - lastFrameStart;
  lastFrameStart = now;
  if (ft < 200) renderer.adapt(ft);
}

// ----------------------------------------------------------------- boot ----

function updateLayout() {
  updateCamera();
  const shortSide = Math.min(canvas.clientWidth, canvas.clientHeight);
  const headerBottom = controls.getBoundingClientRect().bottom;
  backdropInsetTop = Math.min(
    Math.max(0.055 * shortSide, headerBottom + 0.024 * shortSide + 5),
    0.24 * canvas.clientHeight,
  );
  backdropInsetBottom = Math.max(0, backdropInsetTop - 16);
  const viewportInsetBottom = backdropInsetBottom - canvas.getBoundingClientRect().top;
  document.documentElement.style.setProperty("--backdrop-inset-bottom", `${viewportInsetBottom}px`);
}

updateLayout();
window.addEventListener("resize", () => {
  updateLayout();
  renderer?.resize();
});

if (renderer) {
  renderer.setTextTexture(engravingCanvas());
  renderer.resize(true);
  renderer
    .ready()
    .then(() => {
      renderer.uploadCracks(fracture.canvas);
      renderOrbs();
      document.body.classList.add("is-ready");
      state.appear = 0;
      last = performance.now();
      requestAnimationFrame(frame);
    })
    .catch((err) => {
      console.error(err);
      document.body.classList.add("no-webgl");
    });
}

// handy for poking at the simulation from the console
window.__ice = {
  state,
  setMelt: (p) => {
    state.P = Math.max(0, Math.min(1, p));
  },
  setWeather: (i) => weather.set(i),
  // older test hook: map a temperature onto the nearest weather
  setTemp: (t) => weather.set(t <= -4 ? 0 : t < 20 ? 1 : t < 33 ? 2 : t < 40 ? 3 : 4),
  tap: (x, y) => onDown({ clientX: x, clientY: y, pointerId: 1, button: 0 }) || onUp({ pointerId: 1 }),
  renew: newIceCream,
  // try a picker framing: __ice.swatch(0, { x, y, half }) -> image URL
  swatch: (i, sw) => renderSwatch(FLAVORS[i], sw),
  fracture,
};
