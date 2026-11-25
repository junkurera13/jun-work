// Live Gizmo 1 OS screen renderer (480x400 offscreen canvas sampled by the
// 3D WebGL2 shader):
//   - Boot: exact 24-slot ODD/ITY flipbook (125ms/frame, 5050ms min) + real
//     boot.wav chime at 2875ms
//   - Home: Gizmo's drawn world from the Gizmo web app (sky-view.tsx & sky.ts:
//     cotton-candy sky, sunlit clouds, rolling lime hill & sprouts) with
//     transparent hot-pink Gizmo breathing and blinking on the hill crest
//   - Listening: holding the pink button makes Gizmo cup his ear on the hill

import { playBootChime, playButtonClick, preloadBootChime } from "./sound.js";

const W = 480;
const H = 400;

// Exact firmware boot timing from body/firmware/include/gizmo/assets_generated.h
const BOOT_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 11, 12, 13, 12, 11, 10, 10, 12, 13, 12, 14];
const BOOT_PERIOD_MS = 125;
const BOOT_CHIME_AT_MS = 2875;
const BOOT_MIN_MS = 5050;

// Smooth 4-stage blink sequence from web/app/app/gizmo-character.tsx
// RGBA gizmo-sheet.webp layout (4x3, 360x360 cells):
//   0=open, 1=lid-1, 2=lid-2, 3=lid-3, 4=shut
//   5..11 = listen-1..7
const BLINK_STEPS = [
  [1, 0], [2, 28], [3, 56], [4, 84], [3, 140], [2, 176], [1, 212], [0, 248],
];
const LISTEN_SLOTS = [5, 6, 7, 8, 9, 10, 11, 11, 11, 11, 11, 11, 11, 11, 10, 9, 10, 11, 11, 11];
const ACTION_PERIOD_MS = 130;

const BOOT_CELL_W = 480;
const BOOT_CELL_H = 360;
const BOOT_COLS = 5;

const CHAR_CELL = 360;
const CHAR_COLS = 4;

// Gizmo's drawn world coordinates & paths traced verbatim from web/app/app/sky-view.tsx (1448 x 1086)
const WORLD_W = 1448;
const WORLD_H = 1086;
const SKY_STOPS = [
  [0.00, "#90c3fd"],
  [0.22, "#b2c4fd"],
  [0.37, "#d6c3f9"],
  [0.52, "#f6c3e8"],
  [0.60, "#fdc8dd"],
  [0.69, "#fed8c9"],
];
const CLOUDS = [
  {
    path: new Path2D("M124.8 344.2A75 48.25 0 0 1 202.2 296A83.5 83.5 0 0 1 362.6 300.5A67 44.75 0 0 1 428.5 345.2A67 48.6 0 0 1 361.5 393.8H199.8A75 49.6 0 0 1 124.8 344.2Z"),
    top: 238,
    bottom: 394,
  },
  {
    path: new Path2D("M1128 551A49.25 35.25 0 0 1 1186.7 516.4A66.5 66.5 0 0 1 1312.9 515A46.25 34.25 0 0 1 1365 549A46.25 37.3 0 0 1 1318.8 586.3H1177.2A49.25 35.3 0 0 1 1128 551Z"),
    top: 470,
    bottom: 587,
  },
];
const HILL_PATH = new Path2D(
  "M0 845.7C4 844.4 12 841.5 24 837.9C36 834.3 52 829.3 72 824.1C92 819 120 812.2 144 806.8C168 801.5 186 797.4 216 791.9C246 786.5 290 779.1 324 774.1C358 769.1 394 765 420 762C446 759 462 757.5 480 755.8C498 754.1 502 753.6 528 752C554 750.4 602 747.5 636 746.1C670 744.8 698 744 732 744C766 743.9 808 744.8 840 745.8C872 746.9 894 748 924 750C954 752.1 990 755 1020 758C1050 760.9 1076 764.1 1104 767.7C1132 771.4 1156 774.6 1188 780C1220 785.4 1264 793.4 1296 800.1C1328 806.8 1354.8 813.6 1380 820.2C1405.2 826.7 1435.8 836.3 1447 839.5L1448 1086L0 1086Z"
);
const HILL_STOPS = [
  [0.0, "#c8f26c"],
  [0.3, "#b4e677"],
  [0.6, "#9cdb7e"],
  [1.0, "#86d37f"],
];
const LEAVES = [
  [207.8, 857.6, 19, 9.2, 114.2],
  [178.2, 863, 15.2, 8.1, 57.8],
  [1226, 877.7, 23.2, 10.5, 101.3],
  [1197.8, 885.5, 16.8, 8.9, 60.5],
  [1251.3, 893, 15.1, 8, 138.7],
];

const loadImg = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

// Pre-render the static world layers (sky, soft sun, hill, sprouts) once onto a
// crisp 480x400 backdrop so only the drifting clouds and breathing Gizmo redraw.
function buildWorldBackdrop() {
  const bg = document.createElement("canvas");
  bg.width = W;
  bg.height = H;
  const ctx = bg.getContext("2d");

  // Fit 1448x1086 world cleanly covering 480x400 (centered horizontally)
  const scale = Math.max(W / WORLD_W, H / WORLD_H);
  const ox = (W - WORLD_W * scale) / 2;
  const oy = (H - WORLD_H * scale) / 2;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  // Cotton-candy midday sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  for (const [stop, color] of SKY_STOPS) skyGrad.addColorStop(stop, color);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Soft midday sun glowing softly behind the upper-right sky
  const sunX = 1040;
  const sunY = 255;
  const sunR = 46;
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR * 4.2);
  glow.addColorStop(0.0, "rgba(255, 244, 204, 0.55)");
  glow.addColorStop(0.4, "rgba(255, 244, 204, 0.18)");
  glow.addColorStop(1.0, "rgba(255, 244, 204, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR * 4.2, 0, Math.PI * 2);
  ctx.fill();

  const disc = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  disc.addColorStop(0.0, "rgba(255, 251, 234, 0.78)");
  disc.addColorStop(0.72, "rgba(255, 251, 234, 0.72)");
  disc.addColorStop(1.0, "rgba(255, 251, 234, 0)");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  // Rolling sunlit lime-green hill
  const hillGrad = ctx.createLinearGradient(0, 744, 0, WORLD_H);
  for (const [stop, color] of HILL_STOPS) hillGrad.addColorStop(stop, color);
  ctx.fillStyle = hillGrad;
  ctx.fill(HILL_PATH);

  // Cute sprout leaves tucked onto the left and right hill slopes
  ctx.fillStyle = "#56ad5e";
  for (const [cx, cy, rx, ry, deg] of LEAVES) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
  return { canvas: bg, scale, ox, oy };
}

export class GizmoScreen {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d");

    this.world = buildWorldBackdrop();

    this.state = "off"; // off | boot | idle | listening | shutdown
    this.stateSince = 0;
    this.bootChiming = false;
    this.dirty = true;
    this.lastRenderKey = "";
    this.lastAnimDraw = 0;

    // Blink schedule matching gizmo-character.tsx
    this.blinkStart = 0;
    this.nextBlinkAt = 0;

    this.brightnessStep = 8;
    this.volumeStep = 8;

    this.bootSheet = null;
    this.charSheet = null;
    this.listeners = new Set();

    loadImg("/gizmo/boot-sheet.webp").then((img) => {
      this.bootSheet = img;
      this.dirty = true;
    });
    loadImg("/gizmo/gizmo-sheet.webp").then((img) => {
      this.charSheet = img;
      this.dirty = true;
    });

    this.clearBlack();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  isPoweredOn() {
    return this.state !== "off" && this.state !== "shutdown";
  }

  getBacklight(now) {
    const level = 0.25 + (this.brightnessStep / 10) * 0.75;
    if (this.state === "off") return 0;
    if (this.state === "boot") {
      const elapsed = now - this.stateSince;
      return level * Math.min(1, elapsed / 220);
    }
    if (this.state === "shutdown") {
      const elapsed = now - this.stateSince;
      return level * Math.max(0, 1 - elapsed / 260);
    }
    return level;
  }

  powerOn(now = performance.now()) {
    if (this.isPoweredOn()) return;
    preloadBootChime();
    playButtonClick("powerOn", this.volumeStep);
    this.state = "boot";
    this.stateSince = now;
    this.bootChiming = false;
    this.nextBlinkAt = now + BOOT_MIN_MS + 1800;
    this.dirty = true;
    this.lastRenderKey = "";
    this.emit();
  }

  powerOff(now = performance.now()) {
    if (this.state === "off" || this.state === "shutdown") return;
    playButtonClick("powerOff", this.volumeStep);
    this.state = "shutdown";
    this.stateSince = now;
    this.dirty = true;
    this.lastRenderKey = "";
    this.emit();
  }

  togglePower(now = performance.now()) {
    if (this.isPoweredOn()) this.powerOff(now);
    else this.powerOn(now);
  }

  pttDown(now = performance.now()) {
    if (this.state === "off" || this.state === "shutdown") {
      this.powerOn(now);
      return;
    }
    playButtonClick("pttDown", this.volumeStep);
    if (this.state === "boot") return;
    this.state = "listening";
    this.stateSince = now;
    this.dirty = true;
    this.emit();
  }

  pttUp(now = performance.now()) {
    if (this.state !== "listening") return;
    playButtonClick("pttUp", this.volumeStep);
    this.state = "idle";
    this.stateSince = now;
    this.dirty = true;
    this.emit();
  }

  clearBlack() {
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, W, H);
  }

  currentBlinkFrame(now) {
    if (now >= this.nextBlinkAt) {
      this.blinkStart = now;
      this.nextBlinkAt = now + 2600 + Math.random() * 3400;
    }
    const bt = now - this.blinkStart;
    if (bt < 0 || bt >= 260) return 0;
    let frame = 0;
    for (const [f, at] of BLINK_STEPS) {
      if (bt >= at) frame = f;
    }
    return frame;
  }

  /** Advance state machine & redraw canvas cleanly. Returns true when texture changed. */
  update(now) {
    const elapsed = now - this.stateSince;

    if (this.state === "off") {
      if (this.dirty) {
        this.clearBlack();
        this.dirty = false;
        return true;
      }
      return false;
    }

    if (this.state === "shutdown") {
      if (elapsed >= 260) {
        this.state = "off";
        this.clearBlack();
        this.dirty = false;
        this.emit();
        return true;
      }
      const p = elapsed / 260;
      const ctx = this.ctx;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      const barH = Math.max(2, H * (1 - p) * (1 - p));
      const barW = W * Math.max(0.08, 1 - Math.pow(p, 2.5));
      ctx.fillStyle = `rgba(255,255,255,${(1 - p) * 0.85})`;
      ctx.fillRect((W - barW) / 2, (H - barH) / 2, barW, barH);
      return true;
    }

    if (this.state === "boot") {
      if (!this.bootChiming && elapsed >= BOOT_CHIME_AT_MS) {
        this.bootChiming = true;
        playBootChime(this.volumeStep);
      }
      if (elapsed >= BOOT_MIN_MS) {
        this.state = "idle";
        this.stateSince = now;
        this.nextBlinkAt = now + 2000;
        this.lastRenderKey = "";
        this.dirty = true;
        this.emit();
        return this.update(now);
      }
      const slot = Math.min(BOOT_SLOTS.length - 1, Math.floor(elapsed / BOOT_PERIOD_MS));
      const frame = BOOT_SLOTS[slot];
      const key = `boot:${frame}:${Boolean(this.bootSheet)}`;
      if (key === this.lastRenderKey && !this.dirty) return false;
      this.lastRenderKey = key;
      this.dirty = false;
      this.drawBootFrame(frame);
      return true;
    }

    // Home / Listening on Gizmo's drawn sky & hill world:
    // throttle gently to ~30fps for smooth breathing & drifting clouds without wasted uploads
    if (!this.dirty && now - this.lastAnimDraw < 33) return false;
    this.lastAnimDraw = now;
    this.dirty = false;

    let charFrame = 0;
    if (this.state === "idle") {
      charFrame = this.currentBlinkFrame(now);
    } else if (this.state === "listening") {
      const slot = Math.min(LISTEN_SLOTS.length - 1, Math.floor(elapsed / ACTION_PERIOD_MS));
      charFrame = LISTEN_SLOTS[slot];
    }

    this.drawWorldHome(charFrame, now, elapsed);
    return true;
  }

  drawBootFrame(frameIndex) {
    const ctx = this.ctx;
    this.clearBlack();
    if (!this.bootSheet) return;
    const c = frameIndex % BOOT_COLS;
    const r = Math.floor(frameIndex / BOOT_COLS);
    ctx.drawImage(
      this.bootSheet,
      c * BOOT_CELL_W,
      r * BOOT_CELL_H,
      BOOT_CELL_W,
      BOOT_CELL_H,
      0,
      (H - BOOT_CELL_H) / 2,
      BOOT_CELL_W,
      BOOT_CELL_H
    );
  }

  drawWorldHome(charIndex, now, elapsed) {
    const ctx = this.ctx;
    const { canvas: bg, scale, ox, oy } = this.world;

    // 1. Pre-rendered cotton-candy sky, sun, lime hill & sprouts
    ctx.drawImage(bg, 0, 0);

    // 2. White-pink drawn clouds floating softly behind Gizmo
    const drift1 = Math.sin(now * 0.00022) * 28;
    const drift2 = Math.cos(now * 0.00018 + 1.1) * 24;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    CLOUDS.forEach((cloud, i) => {
      ctx.save();
      ctx.translate(i === 0 ? drift1 : drift2, 0);
      const cg = ctx.createLinearGradient(0, cloud.top, 0, cloud.bottom);
      cg.addColorStop(0.0, "#fdf4f3");
      cg.addColorStop(0.45, "#fdf4f3");
      cg.addColorStop(1.0, "#fed2f0");
      ctx.fillStyle = cg;
      ctx.fill(cloud.path);
      ctx.restore();
    });
    ctx.restore();

    // 3. Gizmo standing right on the crest of his hill (matching screen.css: height ~56%, feet on hill!)
    const breathe = 0.5 - 0.5 * Math.cos((now / 3800) * Math.PI * 2); // smooth 3.8s cycle
    const size = Math.round(H * 0.58);
    const feetY = Math.round(H * 0.805);
    const bobY = -breathe * 4.5;

    // Soft elliptical ground shadow right under his feet on the lime hill (gz-shadow)
    const shW = size * 0.30 * (1 - breathe * 0.05);
    const shH = size * 0.048;
    const shGrad = ctx.createRadialGradient(W / 2, feetY - 2, 0, W / 2, feetY - 2, shW);
    shGrad.addColorStop(0, `rgba(23, 45, 22, ${0.26 - breathe * 0.04})`);
    shGrad.addColorStop(1, "rgba(23, 45, 22, 0)");
    ctx.save();
    ctx.translate(W / 2, feetY - 2);
    ctx.scale(1, shH / shW);
    ctx.fillStyle = shGrad;
    ctx.beginPath();
    ctx.arc(0, 0, shW, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Transparent hot-pink Gizmo sprite
    if (this.charSheet) {
      const c = charIndex % CHAR_COLS;
      const r = Math.floor(charIndex / CHAR_COLS);
      const dx = Math.round((W - size) / 2);
      const dy = Math.round(feetY - size * 0.96 + bobY);
      ctx.drawImage(this.charSheet, c * CHAR_CELL, r * CHAR_CELL, CHAR_CELL, CHAR_CELL, dx, dy, size, size);
    }

    // 4. Clean translucent top HUD pill (clock + battery) floating lightly over the sky
    this.drawHud(new Date(), true);

    // 5. While listening (pink button held): animated hot-pink voice pulse at bottom of hill
    if (this.state === "listening") {
      const bars = 7;
      const bw = 6;
      const gap = 8;
      const totalW = bars * bw + (bars - 1) * gap;
      const x0 = (W - totalW) / 2;
      const yBase = H - 28;
      ctx.fillStyle = "#ff0078";
      for (let i = 0; i < bars; i++) {
        const wave = 0.5 + 0.5 * Math.sin(elapsed * 0.014 + i * 1.15);
        const h = 5 + wave * (i === 3 ? 16 : i === 2 || i === 4 ? 12 : 7);
        ctx.beginPath();
        ctx.roundRect(x0 + i * (bw + gap), yBase - h / 2, bw, h, 3);
        ctx.fill();
      }
    }
  }

  drawHud(date, pill = false) {
    const ctx = this.ctx;
    const h24 = date.getHours();
    const h12 = h24 % 12 || 12;
    const clock = `${h12}:${String(date.getMinutes()).padStart(2, "0")}`;

    const capH = 15;
    ctx.font = `600 18px "Figtree", -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textBaseline = "top";
    const clockW = Math.ceil(ctx.measureText(clock).width);

    const groupGap = 11;
    const bodyW = capH * 2;
    const bodyH = capH;
    const nubGap = 2;
    const nubW = 3;
    const nubH = 6;
    const battW = bodyW + nubGap + nubW;
    const totalW = clockW + groupGap + battW;

    const x = Math.round((W - totalW) / 2);
    const top = 22;

    if (pill) {
      // Soft dark glass pill matching screen.css header buttons over the bright sky
      ctx.fillStyle = "rgba(18, 22, 34, 0.28)";
      ctx.beginPath();
      ctx.roundRect(x - 14, top - 6, totalW + 28, capH + 14, 999);
      ctx.fill();
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillText(clock, x, top - 1);

    const bx = x + clockW + groupGap;
    const by = top + 1;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(bx, by, bodyW, bodyH, 3.5);
    ctx.stroke();

    const pad = 3.2;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(bx + pad, by + pad, bodyW - pad * 2, bodyH - pad * 2, 1.5);
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(bx + bodyW + nubGap, by + (bodyH - nubH) / 2, nubW, nubH, 1.5);
    ctx.fill();
  }
}
