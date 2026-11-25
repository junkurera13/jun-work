// The live Magic Choc for the home page: the real ice cream from the ice
// cream page, drawn on a see-through canvas, slowly turning all the way
// round. It only renders while it's on screen.
import { Renderer } from "../render/renderer.js";
import { engravingCanvas } from "../render/engraving.js";
import { FLAVORS } from "../flavors.js";
import { meltParams } from "../sim/melt.js";
import { mat3FromQuat, mulMat3T, quatFromAxisAngle, quatMul } from "../sim/math.js";

// shared with src/main.js
const REST_YAW = -0.4;
const BODY_BOX = { min: [-3.6, -10.05, -2.5], max: [3.6, 6.05, 2.5] };

// Framing (cm, object space): the same window as the still placeholder
// (/images/play/magic-choc.webp), so the live one lands exactly on top of it.
const CENTER_Y = -1.942;
const HALF = 7.912; // half the canvas height
const TAN = 0.05; // a long lens: almost no perspective, like the picker
const D = HALF / TAN;

const SPIN_SPEED = (2 * Math.PI) / 18; // one full turn every 18 s
const SPIN_RAMP = 2; // seconds to get up to speed
// Hovering: it spins up to this many times faster, rises a little and tips
// toward the pointer, then settles back when the pointer leaves. (Kept
// small: the canvas fits the bar closely, so a bigger lift or a sideways
// lean would clip it.)
const HOVER_SPIN = 5;
const HOVER_LIFT = 0.15; // world units
const HOVER_TIP = 0.14; // radians toward the camera, pointer at the top or bottom
const HOVER_EASE = 6; // per second

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Mount on a wrapper holding the still <img> and a <canvas>. Adds
 * "is-live" to the wrapper once the first real frame is on the canvas; if
 * WebGL isn't available the still simply stays.
 */
export function mountMagicChoc(wrapper) {
  const canvas = wrapper.querySelector("canvas");
  let renderer;
  try {
    renderer = new Renderer(canvas, { transparent: true });
  } catch {
    return;
  }
  renderer.setTextTexture(engravingCanvas());
  const melt = meltParams(0, FLAVORS[0]);

  let ready = false;
  let inView = false;
  let running = false;
  let t = 0;
  let last = 0;
  let spin = 0;
  // hover: how far into it (0 to 1, eased), and where the pointer is
  // (-1 to 1 across the wrapper)
  let hover = 0;
  let hoverTarget = 0;
  let px = 0;
  let py = 0;
  let pxT = 0;
  let pyT = 0;
  if (!reduceMotion) {
    const link = wrapper.closest("a") || wrapper;
    link.addEventListener("pointerenter", () => (hoverTarget = 1));
    link.addEventListener("pointerleave", () => {
      hoverTarget = 0;
      pxT = pyT = 0;
    });
    link.addEventListener("pointermove", (e) => {
      const r = wrapper.getBoundingClientRect();
      pxT = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      pyT = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    });
    link.addEventListener("focus", () => (hoverTarget = 1));
    link.addEventListener("blur", () => (hoverTarget = 0));
  }

  // moves time on by dt seconds
  function step(dt) {
    t += dt;
    const k = Math.min(1, dt * HOVER_EASE);
    hover += (hoverTarget - hover) * k;
    px += (pxT - px) * k;
    py += (pyT - py) * k;
    // a slow, full turn: it starts from the resting angle (matching the
    // still) and speeds up gently over the first SPIN_RAMP seconds; hover
    // spins it faster
    spin += SPIN_SPEED * Math.min(1, t / SPIN_RAMP) * (1 + (HOVER_SPIN - 1) * hover) * dt;
  }

  function draw() {
    const yaw = REST_YAW + spin + 0.35 * hover * px;
    // plus the little wobble and bob from src/main.js (updateWorld), and
    // the hover's lean toward the pointer and lift
    const sway = reduceMotion ? 0 : Math.min(1, Math.max(0, t - 1.5) / 3);
    const pitch = sway * 0.03 * Math.sin(t * 0.27 + 1.0) + HOVER_TIP * hover * py;
    const roll = sway * 0.022 * Math.sin(t * 0.41 + 2.0);
    const bob = reduceMotion ? 0 : 0.14 * Math.sin(t * 0.6) + HOVER_LIFT * hover;
    let q = quatFromAxisAngle(0, 1, 0, yaw);
    q = quatMul(q, quatFromAxisAngle(1, 0, 0, pitch));
    q = quatMul(quatFromAxisAngle(0, 0, 1, roll), q);
    const rot = mat3FromQuat(q);

    // a fixed camera looking down -z at the frame; the bar turns and bobs
    const camPos = mulMat3T(rot, 0, CENTER_Y - bob, D);
    const r = mulMat3T(rot, 1, 0, 0);
    const u = mulMat3T(rot, 0, 1, 0);
    const f = mulMat3T(rot, 0, 0, -1);

    renderer.resize();
    renderer.draw({
      camPos,
      camBasis: [r.x, r.y, r.z, u.x, u.y, u.z, f.x, f.y, f.z],
      tanHalfFov: TAN,
      objRot: rot,
      time: t,
      boundMin: BODY_BOX.min,
      boundMax: BODY_BOX.max,
      melt,
      cracks: false,
      ooze: 0,
      primCount: 0,
      crumbCount: 0,
      liqMin: [0, 0, 0],
      liqMax: [0, 0, 0],
      exposure: 1.0,
      // the same studio light as the picker icons and the still
      weatherA: [0, 0, 1, 0],
      weatherB: 0,
      lightTint: [1, 1, 1],
    });
    wrapper.classList.add("is-live");
  }

  // (clientWidth is 0 while its list is hidden: drawing then would shrink
  // the canvas to 1x1, and that pixel showed, stretched, on switching back)
  const shouldRun = () => ready && inView && !document.hidden && canvas.clientWidth > 0;

  // No adaptive resolution here (unlike the full-screen ice cream page): the
  // canvas is small, and adapt() misread a slow display's frame pace as a
  // slow GPU and dropped it to half resolution, leaving jagged edges.
  function frame(now) {
    if (!shouldRun()) {
      running = false;
      return;
    }
    requestAnimationFrame(frame);
    step(Math.min(0.05, (now - last) / 1000));
    last = now;
    draw();
  }

  function update() {
    if (!shouldRun()) return;
    if (reduceMotion) {
      draw(); // one still, resting frame
      return;
    }
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // stops when scrolled away, when its list is hidden, or the tab is hidden
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    update();
  }).observe(canvas);
  document.addEventListener("visibilitychange", update);
  // When its list is shown again (or the window resizes), draw straight
  // away: this runs after layout but before the paint, so the ice cream is
  // there on the very first frame instead of popping in a frame or two late.
  new ResizeObserver(() => {
    if (ready && canvas.clientWidth > 0 && !document.hidden) draw();
    update();
  }).observe(canvas);

  renderer
    .ready()
    .then(() => {
      ready = true;
      update();
    })
    .catch((err) => console.error(err));
}
