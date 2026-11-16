import { deformRef, sdBar } from "./shape.js";
import { mulMat3, quatIntegrate, rand } from "./math.js";

// Cracks live in a texture over the shell, in the bar's reference space,
// front face on the left half and back face on the right half:
//   R  crack / crushed-hole mask (the shell is missing where R > 0.5)
//   G  soft halo around cracks: where squeezed-out vanilla can show
//   B  how far that bit of shell has been pushed into the ice cream
export const CRACK_W = 1280;
export const CRACK_H = 1152;
const FACE_W = CRACK_W / 2;
const X0 = -3.2;
const X1 = 3.2;
const Y1 = 6.1; // top of the mapped area (bottom is Y1 - CRACK_H / PX = -5.42)
const PX = FACE_W / (X1 - X0); // texels per cm (100)
const GRAVITY = 900; // cm/s^2
const CRACK_SPEED = 26; // cm/s: fast, but you can still see it run
const STEP = 0.055;

function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  // intersection parameter along a->b with segment c->d, or -1
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : -1;
}

/**
 * A brittle chocolate shell. Every press is its own little fracture event:
 * a few jagged cracks run out from the finger at a fixed length, wandering
 * and occasionally branching, and they stop dead when they run into an
 * existing crack, just like real fractures do. A short curved crack near the
 * centre cuts out small plates that get pushed into the soft ice cream.
 * Pressing the same spot again crushes it into a little hole and flicks out
 * chips. Nothing grows, nothing caps out, nothing cancels.
 */
export class Fracture {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = CRACK_W;
    this.canvas.height = CRACK_H;
    this.g = this.canvas.getContext("2d");
    this.reset();
  }

  reset() {
    const g = this.g;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#000";
    g.fillRect(0, 0, CRACK_W, CRACK_H);
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    g.lineJoin = "round";
    this.segs = [[], []]; // per face: [ax, ay, bx, by, impactId, pathId]
    this.impacts = [];
    this.ops = []; // timed drawing operations (cracks running)
    this.crumbs = [];
    this.ooze = 0;
    this.any = false;
    this.texDirty = true;
    this.nextId = 1;
  }

  px(face, x, y) {
    return [(x - X0) * PX + face * FACE_W, (Y1 - y) * PX];
  }

  onShell(x, y) {
    return sdBar(x, y, 0) < -0.08;
  }

  /** Does a step a->b run into an existing crack? Returns t in [0,1] or -1. */
  arrest(face, ax, ay, bx, by, impactId, pathId, nearOrigin) {
    let best = -1;
    const list = this.segs[face];
    const minx = Math.min(ax, bx) - 1e-3;
    const maxx = Math.max(ax, bx) + 1e-3;
    const miny = Math.min(ay, by) - 1e-3;
    const maxy = Math.max(ay, by) + 1e-3;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s[4] === impactId && (s[5] === pathId || nearOrigin)) continue;
      if (Math.max(s[0], s[2]) < minx || Math.min(s[0], s[2]) > maxx) continue;
      if (Math.max(s[1], s[3]) < miny || Math.min(s[1], s[3]) > maxy) continue;
      const t = segHit(ax, ay, bx, by, s[0], s[1], s[2], s[3]);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    return best;
  }

  /**
   * Walk one crack outwards. Cracks wander a little, kink now and then, and
   * stop at other cracks or when they run off the face. Returns the polyline.
   */
  growCrack(face, x, y, ang, length, impactId, pathId, t0, w0, wander = 0.12) {
    const pts = [[x, y]];
    let a = ang;
    let travelled = 0;
    const drift = rand(-0.4, 0.4);
    while (travelled < length) {
      a += rand(-wander, wander) + drift * 0.08;
      if (Math.random() < 0.035) a += rand(-0.45, 0.45); // a sudden kink
      const nx = x + Math.cos(a) * STEP;
      const ny = y + Math.sin(a) * STEP;
      if (!this.onShell(nx, ny)) break;
      const t = this.arrest(face, x, y, nx, ny, impactId, pathId, travelled < 0.25);
      if (t >= 0) {
        // run right into the other crack and stop there
        pts.push([x + (nx - x) * t, y + (ny - y) * t]);
        break;
      }
      x = nx;
      y = ny;
      travelled += STEP;
      pts.push([x, y]);
    }
    // register now (so later cracks stop at it); draw as it runs, tapering
    const n = pts.length;
    for (let i = 1; i < n; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      this.segs[face].push([ax, ay, bx, by, impactId, pathId]);
      const k = i / Math.max(n - 1, 1);
      const w = w0 * (1 - 0.7 * k * k) + 0.012;
      this.ops.push({ t: t0 + (STEP * i) / CRACK_SPEED, kind: "line", face, ax, ay, bx, by, w });
    }
    return pts;
  }

  /** A press on the shell at a hit point (object space). */
  press(hit, now, M, world) {
    const q = deformRef(hit.x, hit.y, hit.z, M.sag, M.bulge, M.taper, M.shrink);
    const face = q.z >= 0 ? 0 : 1;
    this.any = true;
    this.ooze = Math.max(this.ooze, 0.22); // a press squeezes a little vanilla up
    // pressing an existing break again crushes it
    let near = null;
    let bestD = 1e9;
    for (const imp of this.impacts) {
      if (imp.face !== face) continue;
      const d = Math.hypot(imp.x - q.x, imp.y - q.y);
      if (d < 0.42 && d < bestD) {
        near = imp;
        bestD = d;
      }
    }
    if (near) {
      this.crush(near, q, now);
      this.spawnCrumbs(hit, 3 + Math.floor(rand(0, 3)), world, 0.08, 0.2);
      return { type: "crunch" };
    }
    const imp = { id: this.nextId++, x: q.x, y: q.y, face, hole: 0, born: now, low: q.y };
    this.impacts.push(imp);
    const kind = this.fracture(imp, now);
    if (kind === "flake") this.spawnCrumbs(hit, 3 + Math.floor(rand(0, 3)), world, 0.12, 0.3);
    else this.spawnCrumbs(hit, 2 + Math.floor(rand(0, 3)), world, 0.04, 0.1);
    return { type: kind === "split" || kind === "flake" ? "crunch" : "crack" };
  }

  /**
   * The fracture pattern of one press. Each press picks its own kind of
   * break, and every length, angle, width and drop is random, so no two
   * presses ever look the same.
   */
  fracture(imp, now) {
    const r = Math.random();
    const kind = r < 0.32 ? "split" : r < 0.62 ? "star" : r < 0.85 ? "fork" : "flake";
    imp.kind = kind;
    if (kind === "split") this.split(imp, now);
    else if (kind === "star") this.star(imp, now);
    else if (kind === "fork") this.fork(imp, now);
    else this.flake(imp, now);
    return kind;
  }

  track(imp, pts) {
    for (const p of pts) imp.low = Math.min(imp.low, p[1]);
    return pts;
  }

  /**
   * One side of a crack drops into the ice cream: painted as a few strips
   * running along the crack, deepest right at the crack, easing back to
   * intact shell further away (the plate tilts on its far edge).
   */
  dropSide(face, pts, side, depth, width, t0) {
    if (pts.length < 3) return;
    // which way is "this side": the average normal of the whole crack
    const [sx, sy] = pts[0];
    const [ex, ey] = pts[pts.length - 1];
    let nx = -(ey - sy);
    let ny = ex - sx;
    const l = Math.hypot(nx, ny) || 1;
    nx = (nx / l) * side;
    ny = (ny / l) * side;
    this.ops.push({ t: t0, kind: "drop", face, pts, nx, ny, v: Math.floor(depth * 255), width });
  }

  /** A long crack straight across the face through the press. */
  split(imp, now) {
    const { face, x, y, id } = imp;
    const ang = rand(0, Math.PI);
    const w = rand(0.1, 0.15);
    const a = this.track(imp, this.growCrack(face, x, y, ang, rand(1.6, 4.2), id, 0, now, w, 0.07));
    const b = this.track(imp, this.growCrack(face, x, y, ang + Math.PI, rand(1.6, 4.2), id, 1, now, w, 0.07));
    const whole = [...b.slice().reverse(), ...a.slice(1)];
    const tEnd = now + (Math.max(a.length, b.length) * STEP) / CRACK_SPEED;
    const sideA = Math.random() < 0.5 ? 1 : -1;
    this.dropSide(face, whole, sideA, rand(0.45, 0.85), rand(0.9, 1.6), tEnd);
    // sometimes the other side gives a little too
    if (Math.random() < 0.4) this.dropSide(face, whole, -sideA, rand(0.12, 0.3), rand(0.6, 1.0), tEnd);
    // a couple of short side cracks feathering off the main one
    const n = Math.floor(rand(0, 2.6));
    for (let i = 0; i < n; i++) {
      const src = Math.random() < 0.5 ? a : b;
      if (src.length < 8) continue;
      const j = 4 + Math.floor(rand(0, src.length - 6));
      const [sx, sy] = src[j];
      const t0 = now + (STEP * j) / CRACK_SPEED;
      const base = Math.atan2(src[j + 1][1] - sy, src[j + 1][0] - sx);
      this.track(imp, this.growCrack(face, sx, sy, base + (Math.random() < 0.5 ? -1 : 1) * rand(0.5, 1.1), rand(0.3, 1.0), id, 10 + i, t0, w * 0.5, 0.1));
    }
  }

  /** Several long cracks bursting out, with sunken plates in the middle. */
  star(imp, now) {
    const { face, x, y, id } = imp;
    const k = 3 + Math.floor(rand(0, 4));
    const base = rand(0, Math.PI * 2);
    const rays = [];
    for (let i = 0; i < k; i++) {
      const ang = base + (i / k) * Math.PI * 2 + rand(-0.45, 0.45);
      const w = rand(0.075, 0.12);
      const pts = this.track(imp, this.growCrack(face, x, y, ang, rand(0.9, 2.6), id, i, now, w, 0.1));
      rays.push({ ang, pts });
      if (pts.length > 8 && Math.random() < 0.3) {
        const j = 4 + Math.floor(rand(0, pts.length - 6));
        const [bx, by] = pts[j];
        const t0 = now + (STEP * j) / CRACK_SPEED;
        this.track(imp, this.growCrack(face, bx, by, ang + (Math.random() < 0.5 ? -1 : 1) * rand(0.4, 0.9), rand(0.3, 1.1), id, 100 + i, t0, w * 0.55, 0.1));
      }
    }
    const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    rays.sort((p, q) => norm(p.ang) - norm(q.ang));
    const rho = rand(0.35, 0.7);
    // only one or two short ring cracks: a full ring looks like a symbol
    let arcs = 0;
    const maxArcs = Math.random() < 0.5 ? 1 : 2;
    const start = Math.floor(rand(0, rays.length));
    for (let jj = 0; jj < rays.length && arcs < maxArcs; jj++) {
      const i = (start + jj) % rays.length;
      const A = rays[i];
      const B = rays[(i + 1) % rays.length];
      const reach = (ray) => (ray.pts.length - 1) * STEP > rho + 0.05;
      if (!reach(A) || !reach(B) || Math.random() > 0.65) continue;
      arcs++;
      const a0 = norm(A.ang);
      let a1 = norm(B.ang);
      while (a1 <= a0) a1 += Math.PI * 2;
      if (a1 - a0 > 2.6) continue;
      const pts = [];
      const N = 10;
      const ph = rand(0, 6.28);
      for (let s = 0; s <= N; s++) {
        const aa = a0 + ((a1 - a0) * s) / N;
        const rr = rho * (1 + 0.14 * Math.sin(aa * 2.3 + ph) + rand(-0.025, 0.025));
        pts.push([x + Math.cos(aa) * rr, y + Math.sin(aa) * rr]);
      }
      const t0 = now + rho / CRACK_SPEED + 0.02;
      const w = rand(0.055, 0.085);
      for (let s = 1; s < pts.length; s++) {
        const [ax, ay] = pts[s - 1];
        const [bx, by] = pts[s];
        this.segs[face].push([ax, ay, bx, by, id, 200 + i]);
        this.ops.push({ t: t0 + s * 0.004, kind: "line", face, ax, ay, bx, by, w });
      }
      // the enclosed plate is pushed in as one piece, by its own amount
      this.ops.push({ t: t0 + 0.03, kind: "plate", face, poly: [[x, y], ...pts], v: Math.floor(rand(90, 230)) });
    }
  }

  /** One long crack that splits into two or three as it runs. */
  fork(imp, now) {
    const { face, x, y, id } = imp;
    const ang = rand(0, Math.PI * 2);
    const w = rand(0.1, 0.14);
    // the trunk runs both ways from the finger
    const back = this.track(imp, this.growCrack(face, x, y, ang + Math.PI, rand(0.4, 1.2), id, 0, now, w * 0.8, 0.08));
    const trunk = this.track(imp, this.growCrack(face, x, y, ang, rand(0.7, 1.5), id, 1, now, w, 0.07));
    if (trunk.length < 3) return;
    const [fx, fy] = trunk[trunk.length - 1];
    const [px, py] = trunk[trunk.length - 2];
    const dir = Math.atan2(fy - py, fx - px);
    const t0 = now + (trunk.length * STEP) / CRACK_SPEED;
    const n = Math.random() < 0.6 ? 2 : 3;
    const spread = rand(0.5, 1.0);
    const arms = [];
    for (let i = 0; i < n; i++) {
      const off = n === 2 ? (i === 0 ? -spread : spread) : (i - 1) * spread;
      arms.push(this.track(imp, this.growCrack(face, fx, fy, dir + off + rand(-0.15, 0.15), rand(0.9, 2.4), id, 2 + i, t0, w * 0.75, 0.1)));
    }
    // the wedge between the first two arms drops in
    const A = arms[0];
    const B = arms[arms.length - 1];
    if (A.length > 4 && B.length > 4) {
      const m = Math.min(A.length, B.length, 12);
      const poly = [[fx, fy], ...A.slice(1, m), ...B.slice(1, m).reverse()];
      this.ops.push({ t: t0 + (m * STEP) / CRACK_SPEED, kind: "plate", face, poly, v: Math.floor(rand(80, 200)) });
    }
    this.dropSide(face, [...back.slice().reverse(), ...trunk.slice(1)], Math.random() < 0.5 ? 1 : -1, rand(0.3, 0.6), rand(0.6, 1.1), t0);
  }

  /** A chunk of shell pops right out, with cracks running from the gap. */
  flake(imp, now) {
    const { face, x, y, id } = imp;
    const rr = rand(0.35, 0.7);
    const poly = [];
    const N = 9 + Math.floor(rand(0, 5));
    const rot = rand(0, Math.PI * 2);
    const stretch = rand(0.6, 1.0);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r0 = rr * rand(0.65, 1.25);
      const lx = Math.cos(a) * r0;
      const ly = Math.sin(a) * r0 * stretch;
      poly.push([x + lx * Math.cos(rot) - ly * Math.sin(rot), y + lx * Math.sin(rot) + ly * Math.cos(rot)]);
    }
    this.ops.push({ t: now + 0.02, kind: "hole", face, poly });
    imp.hole = rr;
    imp.chips = true;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      this.segs[face].push([ax, ay, bx, by, id, 50]);
    }
    const n = 2 + Math.floor(rand(0, 3));
    for (let i = 0; i < n; i++) {
      const [sx, sy] = poly[Math.floor(rand(0, poly.length))];
      const a = Math.atan2(sy - y, sx - x) + rand(-0.4, 0.4);
      this.track(imp, this.growCrack(face, sx, sy, a, rand(0.5, 1.8), id, 60 + i, now + 0.03, rand(0.07, 0.11), 0.1));
    }
  }

  /** Pressing the same spot again: crush it into a small hole. */
  crush(imp, q, now) {
    const { face, id } = imp;
    const grow = imp.hole < 0.42;
    if (grow) imp.hole = Math.min(0.42, imp.hole + rand(0.1, 0.15));
    const r = imp.hole;
    const poly = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = r * rand(0.7, 1.2);
      poly.push([imp.x + Math.cos(a) * rr, imp.y + Math.sin(a) * rr]);
    }
    this.ops.push({ t: now, kind: "hole", face, poly });
    this.ops.push({ t: now, kind: "dimple", face, x: imp.x, y: imp.y, r: r + 0.3, v: 45 });
    // crushing sends a few more short cracks out from the rim; they stop at
    // the existing ones, so the shell around just breaks up finer
    const n = grow ? 2 + Math.floor(rand(0, 2)) : 2;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sx = q.x + Math.cos(a) * (r * 0.9);
      const sy = q.y + Math.sin(a) * (r * 0.9);
      this.growCrack(face, sx, sy, a + rand(-0.3, 0.3), rand(0.25, 0.6), id, 300 + this.nextId++, now, 0.028);
    }
    this.ooze = Math.max(this.ooze, 0.4);
  }

  spawnCrumbs(hit, count, world, s0, s1) {
    const n = hit.normal;
    const nw = mulMat3(world.rot, n.x, n.y, n.z);
    for (let i = 0; i < count; i++) {
      const p = world.objToWorld(hit.x + rand(-0.15, 0.15), hit.y + rand(-0.15, 0.15), hit.z + n.z * 0.05);
      const sp = rand(12, 30);
      const q = [rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(-1, 1)];
      const l = Math.hypot(...q);
      this.crumbs.push({
        pos: p,
        vel: { x: nw.x * sp + rand(-10, 10), y: nw.y * sp + rand(8, 22), z: nw.z * sp + rand(-6, 6) },
        q: q.map((x) => x / l),
        w: { x: rand(-30, 30), y: rand(-30, 30), z: rand(-30, 30) },
        size: rand(s0, s1),
      });
    }
    while (this.crumbs.length > 24) this.crumbs.shift();
  }

  path(face, poly) {
    const g = this.g;
    g.beginPath();
    poly.forEach(([x, y], i) => {
      const [px, py] = this.px(face, x, y);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
  }

  draw(op) {
    const g = this.g;
    if (op.kind === "line") {
      const [ax, ay] = this.px(op.face, op.ax, op.ay);
      const [bx, by] = this.px(op.face, op.bx, op.by);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      // halo (G): where squeezed-out vanilla is allowed to show
      g.strokeStyle = "rgb(0,40,0)";
      g.lineWidth = 34;
      g.stroke();
      g.strokeStyle = "rgb(0,70,0)";
      g.lineWidth = Math.max(10, op.w * PX * 2.5);
      g.stroke();
      // the crack itself (R)
      g.strokeStyle = "rgb(255,0,0)";
      g.lineWidth = Math.max(1.9, op.w * PX);
      g.stroke();
    } else if (op.kind === "plate") {
      g.fillStyle = `rgb(0,0,${op.v})`;
      this.path(op.face, op.poly);
      g.fill();
    } else if (op.kind === "dimple") {
      const [cx, cy] = this.px(op.face, op.x, op.y);
      const R = op.r * PX;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, `rgb(0,40,${op.v})`);
      gr.addColorStop(1, "rgb(0,0,0)");
      g.fillStyle = gr;
      g.fillRect(cx - R, cy - R, R * 2, R * 2);
    } else if (op.kind === "drop") {
      this.drawDrop(op);
    } else if (op.kind === "hole") {
      g.fillStyle = "rgb(255,120,40)";
      this.path(op.face, op.poly);
      g.fill();
    }
  }

  /**
   * A smooth slope on one side of a crack: deepest right at the crack,
   * easing back to intact shell across the plate and towards both ends of
   * the crack. Built in a scratch canvas (one-sided clip, a linear gradient
   * across, a radial fade along), then added into the B channel.
   */
  drawDrop(op) {
    const P = op.pts.map(([x, y]) => this.px(op.face, x, y));
    const W = op.width * PX;
    // normal in texture space (texture y runs downwards)
    const nx = op.nx;
    const ny = -op.ny;
    let minx = Infinity;
    let miny = Infinity;
    let maxx = -Infinity;
    let maxy = -Infinity;
    for (const [x, y] of P) {
      for (const [qx, qy] of [[x, y], [x + nx * W, y + ny * W]]) {
        minx = Math.min(minx, qx);
        miny = Math.min(miny, qy);
        maxx = Math.max(maxx, qx);
        maxy = Math.max(maxy, qy);
      }
    }
    const ox = Math.floor(minx) - 2;
    const oy = Math.floor(miny) - 2;
    const w = Math.ceil(maxx - ox) + 4;
    const h = Math.ceil(maxy - oy) + 4;
    if (w <= 0 || h <= 0 || w > 4000 || h > 4000) return;
    if (!this.tmp) this.tmp = document.createElement("canvas");
    const c = this.tmp;
    if (c.width < w) c.width = w;
    if (c.height < h) c.height = h;
    const t = c.getContext("2d");
    t.globalCompositeOperation = "source-over";
    t.clearRect(0, 0, c.width, c.height);
    t.save();
    t.translate(-ox, -oy);
    // only this side of the crack
    t.beginPath();
    P.forEach(([x, y], i) => (i === 0 ? t.moveTo(x, y) : t.lineTo(x, y)));
    for (let i = P.length - 1; i >= 0; i--) t.lineTo(P[i][0] + nx * W * 1.5, P[i][1] + ny * W * 1.5);
    t.closePath();
    t.clip();
    const [sx, sy] = P[0];
    const [ex, ey] = P[P.length - 1];
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const lin = t.createLinearGradient(mx, my, mx + nx * W, my + ny * W);
    lin.addColorStop(0, `rgba(0,0,${op.v},1)`);
    lin.addColorStop(1, `rgba(0,0,${op.v},0)`);
    t.fillStyle = lin;
    t.fillRect(ox, oy, w, h);
    // ease off towards both ends of the crack (straight-edged, so the plate
    // reads as a flat piece hinging, not a round dent)
    t.globalCompositeOperation = "destination-in";
    const along = t.createLinearGradient(sx, sy, ex, ey);
    along.addColorStop(0, "rgba(0,0,0,0)");
    along.addColorStop(0.18, "rgba(0,0,0,1)");
    along.addColorStop(0.82, "rgba(0,0,0,1)");
    along.addColorStop(1, "rgba(0,0,0,0)");
    t.fillStyle = along;
    t.fillRect(ox, oy, w, h);
    t.restore();
    this.g.drawImage(c, 0, 0, w, h, ox, oy, w, h);
  }

  update(dt, now, rate, M, world, floorY) {
    // let the cracks run
    if (this.ops.length) {
      const later = [];
      let drew = false;
      for (const op of this.ops) {
        if (op.t <= now) {
          this.draw(op);
          drew = true;
        } else later.push(op);
      }
      this.ops = later;
      if (drew) this.texDirty = true;
    }
    // vanilla slowly wells up through the cracks as it softens
    if (this.any && rate > 0) this.ooze = Math.min(1, this.ooze + dt * rate * (0.011 + 0.09 * M.meltV));

    for (const c of this.crumbs) {
      c.vel.y -= GRAVITY * dt;
      c.pos.x += c.vel.x * dt;
      c.pos.y += c.vel.y * dt;
      c.pos.z += c.vel.z * dt;
      c.q = quatIntegrate(c.q, c.w.x, c.w.y, c.w.z, dt);
    }
    this.crumbs = this.crumbs.filter((c) => c.pos.y > floorY - 2);
  }

  /** Where vanilla is escaping through the shell (used to spawn drips). */
  leakSources() {
    if (this.ooze < 0.5) return [];
    const out = this.impacts.map((imp) => ({
      id: `i${imp.id}`,
      x: imp.x + Math.sin(imp.id * 7.3) * 0.12,
      y: imp.hole > 0.15 ? imp.y - imp.hole * 0.9 : Math.max(imp.low, imp.y - 1.0),
      side: imp.face === 0 ? 1 : -1,
      hole: imp.hole > 0.15,
      fill: this.ooze,
    }));
    out.sort((a, b) => a.y - b.y);
    return out.slice(0, 5);
  }

  /** Pack crumbs / chips into the dynamic texture (rows 9-10). */
  pack(dyn, width, world) {
    let ci = 0;
    const qi = world.quat;
    const a = [-qi[0], -qi[1], -qi[2], qi[3]];
    for (const c of this.crumbs) {
      const p = world.worldToObj(c.pos.x, c.pos.y, c.pos.z);
      const b = c.q;
      const rq = [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
      ];
      let i = (9 * width + ci) * 4;
      dyn[i] = p.x;
      dyn[i + 1] = p.y;
      dyn[i + 2] = p.z;
      dyn[i + 3] = c.size;
      i = (10 * width + ci) * 4;
      dyn[i] = rq[0];
      dyn[i + 1] = rq[1];
      dyn[i + 2] = rq[2];
      dyn[i + 3] = rq[3];
      ci++;
    }
    return { crumbs: ci };
  }

  bounds(world) {
    return this.crumbs.map((c) => [world.worldToObj(c.pos.x, c.pos.y, c.pos.z), c.size * 1.5]);
  }
}
