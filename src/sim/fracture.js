import { BAR_BOTTOM, BAR_HEIGHT, crossSection, deformRef, fromChart, toChart } from "./shape.js";
import { mulMat3, quatIntegrate, rand } from "./math.js";

// Cracks live in a texture that wraps all the way around the shell like a
// label (see toChart in shape.js: u around the bar, y up it), so they run
// over the rounded sides and onto the back without a seam:
//   R  crack / crushed-hole mask (the shell is missing where R > 0.5)
//   G  soft halo around cracks: where squeezed-out vanilla can show
//   B  how far that bit of shell has been pushed into the ice cream
export const CRACK_W = 1536;
export const CRACK_H = 1152;
const PX = 100; // texels per cm
const Y1 = 6.1; // top of the mapped area (bottom is Y1 - CRACK_H / PX = -5.42)
const GRAVITY = 900; // cm/s^2
const STEP = 0.055;

/** Keep the part of a convex polygon closer to seed a than to seed b. */
function clipHalf(poly, a, b) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  const side = (p) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i];
    const Q = poly[(i + 1) % poly.length];
    const sp = side(P);
    const sq = side(Q);
    if (sp <= 0) out.push(P);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
    }
  }
  return out;
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

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
 * A brittle shell. Every press shatters a patch around the finger
 * into irregular, straight-edged plates (small near the finger, larger
 * further out), all at once, like a snap. Edges stop where they meet older
 * cracks, so the shell keeps breaking up finer. Plates that broke free are
 * pushed into the soft ice cream by their own amounts; pressing one again
 * pops it right out. Now and then a press makes one long, gently curving
 * split instead. Nothing grows, nothing caps out, nothing cancels.
 */
export class Fracture {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = CRACK_W;
    this.canvas.height = CRACK_H;
    this.g = this.canvas.getContext("2d", { willReadFrequently: true });
    this.reset();
  }

  reset(faluda = false, coco = false) {
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
    this.off = 0;
    this.faluda = faluda;
    this.coco = coco;
  }

  /** Distance once around the bar at height y (cm). */
  period(y) {
    return 2 * Math.PI * crossSection(y, this.faluda, this.coco).R;
  }

  /**
   * Chart (u cm around the bar, y) -> texel. The texture's x is the fraction
   * of the way around the bar and it repeats, so there is no seam anywhere.
   */
  px(face, u, y) {
    return [(u / this.period(y) + 0.5) * CRACK_W + this.off, (Y1 - y) * PX];
  }

  /** Is chart point (u, y) within the height of the shell? */
  onShell(u, y) {
    if (this.faluda) return y >= BAR_BOTTOM && y <= BAR_BOTTOM + BAR_HEIGHT;
    return crossSection(y).W > 0.45;
  }

  /** Does a step a->b run into an existing crack? Returns t in [0,1] or -1. */
  arrest(face, ax, ay, bx, by, impactId, pathId, nearOrigin) {
    let best = -1;
    const list = this.segs[face];
    const P = this.period((ay + by) / 2);
    const miny = Math.min(ay, by) - 1e-3;
    const maxy = Math.max(ay, by) + 1e-3;
    for (const shift of [0, P, -P]) {
      const minx = Math.min(ax, bx) - 1e-3 + shift;
      const maxx = Math.max(ax, bx) + 1e-3 + shift;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (s[4] === impactId && (s[5] === pathId || nearOrigin)) continue;
        if (Math.max(s[1], s[3]) < miny || Math.min(s[1], s[3]) > maxy) continue;
        if (Math.max(s[0], s[2]) < minx || Math.min(s[0], s[2]) > maxx) continue;
        const t = segHit(ax + shift, ay, bx + shift, by, s[0], s[1], s[2], s[3]);
        if (t >= 0 && (best < 0 || t < best)) best = t;
      }
    }
    return best;
  }


  /** A press on the shell at a hit point (object space). */
  press(hit, now, M, world) {
    const q = deformRef(hit.x, hit.y, hit.z, M.sag, M.bulge, M.taper, M.shrink);
    const face = 0; // one chart all the way round
    const ch = toChart(q.x, q.y, q.z, this.faluda, this.coco);
    q.x = ch.u;
    this.any = true;
    this.ooze = Math.max(this.ooze, 0.22); // a press squeezes a little vanilla up
    let type = "crack";
    // Is the spot under the finger a piece that's already broken free (fully
    // enclosed by cracks or holes)? Then it pops out as a chip. Otherwise the
    // shell breaks into a few good-sized plates. Never cracks on top of cracks.
    const region = this.freePiece(q.x, q.y);
    if (region) {
      this.popRegion(region, now);
      const sz = Math.min(0.42, Math.max(0.12, Math.sqrt(region.area) * 0.42));
      this.spawnCrumbs(hit, 1 + Math.floor(rand(0, 2)), world, sz * 0.8, sz);
      this.spawnCrumbs(hit, 1 + Math.floor(rand(0, 3)), world, 0.04, 0.09);
      type = "crunch";
    } else {
      const imp = { id: this.nextId++, x: q.x, y: q.y, face, hole: 0, born: now, low: q.y, cells: [] };
      this.impacts.push(imp);
      if (Math.random() < 0.14) this.curvedSplit(imp, now);
      else this.shatter(imp, rand(1.4, 2.3), now);
      this.spawnCrumbs(hit, 2 + Math.floor(rand(0, 3)), world, 0.04, 0.1);
    }
    this.flush();
    return { type };
  }

  /** Draw everything right away: a crack is a snap, not a growth. */
  flush() {
    if (!this.ops.length) return;
    for (const op of this.ops) this.draw(op);
    this.ops = [];
    this.texDirty = true;
  }

  /**
   * Shatter a patch of shell around the press into irregular plates:
   * a Voronoi pattern of random seeds, small plates under the finger and
   * bigger ones further out. Edges are straight with a little jag, the outer
   * cracks peter out instead of closing, and every edge stops where it meets
   * an existing crack.
   */
  shatter(imp, R, now) {
    const { face, x, y, id } = imp;
    // seeds kept well apart so no plate is a tiny sliver: smallish plates
    // under the finger, bigger ones further out
    const seeds = [[x, y]];
    const want = 5 + Math.floor(rand(0, 4));
    for (let tries = 0; tries < 200 && seeds.length < want + 1; tries++) {
      const a = rand(0, Math.PI * 2);
      const r = R * Math.pow(rand(0.15, 1), 0.8);
      const p = [x + Math.cos(a) * r, y + Math.sin(a) * r];
      const minGap = 0.55 + 0.45 * (r / R);
      if (seeds.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > minGap)) seeds.push(p);
    }
    const B = R * 1.7;
    const box = [[x - B, y - B], [x + B, y - B], [x + B, y + B], [x - B, y + B]];
    const onBox = (p) => Math.abs(Math.abs(p[0] - x) - B) < 1e-6 || Math.abs(Math.abs(p[1] - y) - B) < 1e-6;
    const drawn = new Map();
    const edgeKey = (p, q2) => {
      const k1 = `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
      const k2 = `${q2[0].toFixed(4)},${q2[1].toFixed(4)}`;
      return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    };
    const cells = seeds.map((sd, i) => {
      let poly = box.map((p) => p.slice());
      for (let j = 0; j < seeds.length && poly.length; j++) {
        if (j !== i) poly = clipHalf(poly, sd, seeds[j]);
      }
      return { poly, seed: sd, closed: poly.length >= 3, removed: false, face, imp };
    });
    const newSegs = [];
    for (const cell of cells) {
      const P = cell.poly;
      for (let e = 0; e < P.length; e++) {
        const A = P[e];
        const Bp = P[(e + 1) % P.length];
        if (onBox(A) && onBox(Bp)) {
          cell.closed = false;
          continue;
        }
        const key = edgeKey(A, Bp);
        if (drawn.has(key)) {
          if (!drawn.get(key)) cell.closed = false;
          continue;
        }
        // near the press every edge breaks; further out fewer do
        const mx = (A[0] + Bp[0]) / 2;
        const my = (A[1] + Bp[1]) / 2;
        const d = Math.hypot(mx - x, my - y) / R;
        const keep = d < 0.7 || Math.random() < 1 - (d - 0.7) / 0.5;
        let ok = false;
        if (keep) ok = this.crackEdge(face, A, Bp, x, y, R, id, newSegs);
        drawn.set(key, ok);
        if (!ok) cell.closed = false;
      }
    }
    for (const sgm of newSegs) {
      this.segs[face].push(sgm);
      imp.low = Math.min(imp.low, sgm[1], sgm[3]);
    }
    // plates that are fully broken free get pushed in, each its own amount
    for (const cell of cells) {
      if (!cell.closed) continue;
      const d = Math.hypot(cell.seed[0] - x, cell.seed[1] - y) / R;
      const v = d < 0.35 ? rand(110, 230) : rand(30, 150);
      this.ops.push({ t: now, kind: "plate", face, poly: cell.poly, v: Math.floor(v) });
      imp.cells.push(cell);
    }
  }

  /**
   * One straight crack between two plate corners, with a slight jag. It is
   * walked from the end nearer the press and stops if it hits an older crack.
   * Returns false if nothing of it was drawn or it was cut short.
   */
  crackEdge(face, A, Bp, cx, cy, R, id, out) {
    let a = A;
    let b = Bp;
    if (Math.hypot(b[0] - cx, b[1] - cy) < Math.hypot(a[0] - cx, a[1] - cy)) [a, b] = [b, a];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-4) return false;
    const k = Math.max(1, Math.ceil(len / 0.14));
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const pts = [a];
    for (let i = 1; i < k; i++) {
      const t = i / k;
      const j = rand(-0.025, 0.025);
      pts.push([a[0] + (b[0] - a[0]) * t + nx * j, a[1] + (b[1] - a[1]) * t + ny * j]);
    }
    pts.push(b);
    let whole = true;
    let drewAny = false;
    for (let i = 1; i < pts.length; i++) {
      let [ax, ay] = pts[i - 1];
      let [bx, by] = pts[i];
      if (!this.onShell(ax, ay)) {
        whole = false;
        break;
      }
      const t = this.arrest(face, ax, ay, bx, by, -1, -1, false);
      if (t >= 0) {
        bx = ax + (bx - ax) * t;
        by = ay + (by - ay) * t;
        whole = false;
      }
      const d = Math.hypot((ax + bx) / 2 - cx, (ay + by) / 2 - cy) / R;
      const w = 0.14 - 0.07 * Math.min(1, d);
      out.push([ax, ay, bx, by, id, 0]);
      this.ops.push({ t: 0, kind: "line", face, ax, ay, bx, by, w });
      drewAny = true;
      if (t >= 0) break;
    }
    return drewAny && whole;
  }

  /** The rare one: a single long, gently curving split with one side dropping. */
  curvedSplit(imp, now) {
    const { face, x, y, id } = imp;
    const ang = rand(0, Math.PI);
    const w = rand(0.09, 0.13);
    const bend = rand(-0.035, 0.035);
    const a = this.track(imp, this.growCurve(face, x, y, ang, rand(1.8, 4.0), id, 0, w, bend));
    const b = this.track(imp, this.growCurve(face, x, y, ang + Math.PI, rand(1.8, 4.0), id, 1, w, -bend));
    const whole = [...b.slice().reverse(), ...a.slice(1)];
    this.dropSide(face, whole, Math.random() < 0.5 ? 1 : -1, rand(0.45, 0.8), rand(1.0, 1.6), now);
  }

  /** A smooth arc (constant bend, tiny jag) that stops at older cracks. */
  growCurve(face, x, y, ang, length, impactId, pathId, w0, bend) {
    const pts = [[x, y]];
    let a = ang;
    let travelled = 0;
    while (travelled < length) {
      a += bend + rand(-0.015, 0.015);
      const nx = x + Math.cos(a) * STEP;
      const ny = y + Math.sin(a) * STEP;
      if (!this.onShell(nx, ny)) break;
      const t = this.arrest(face, x, y, nx, ny, impactId, pathId, travelled < 0.2);
      if (t >= 0) {
        pts.push([x + (nx - x) * t, y + (ny - y) * t]);
        break;
      }
      x = nx;
      y = ny;
      travelled += STEP;
      pts.push([x, y]);
    }
    const n = pts.length;
    for (let i = 1; i < n; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      this.segs[face].push([ax, ay, bx, by, impactId, pathId]);
      const k = i / Math.max(n - 1, 1);
      this.ops.push({ t: 0, kind: "line", face, ax, ay, bx, by, w: w0 * (1 - 0.6 * k * k) + 0.015 });
    }
    return pts;
  }

  track(imp, pts) {
    for (const p of pts) imp.low = Math.min(imp.low, p[1]);
    return pts;
  }

  /**
   * One side of a crack drops into the ice cream (a smooth slope, deepest
   * at the crack), see drawDrop.
   */
  dropSide(face, pts, side, depth, width, t0) {
    if (pts.length < 3) return;
    const [sx, sy] = pts[0];
    const [ex, ey] = pts[pts.length - 1];
    let nx = -(ey - sy);
    let ny = ex - sx;
    const l = Math.hypot(nx, ny) || 1;
    nx = (nx / l) * side;
    ny = (ny / l) * side;
    this.ops.push({ t: t0, kind: "drop", face, pts, nx, ny, v: Math.floor(depth * 255), width });
  }

  /**
   * Flood-fill the crack map from (u, y). If the patch of shell there is
   * fully enclosed by cracks / holes and not too big, it's a free piece:
   * return its pixels. Otherwise (it's still attached) return null.
   */
  freePiece(u, y) {
    const [cx, cy] = this.px(0, u, y);
    const H = 230; // look up to 2.3 cm around
    const x0 = Math.max(0, Math.floor(cx - H));
    const y0 = Math.max(0, Math.floor(cy - H));
    const x1 = Math.min(CRACK_W, Math.ceil(cx + H));
    const y1 = Math.min(CRACK_H, Math.ceil(cy + H));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 8 || h < 8) return null;
    const img = this.g.getImageData(x0, y0, w, h).data;
    const S = 2; // work on a 2-texel grid
    const gw = Math.floor(w / S);
    const gh = Math.floor(h / S);
    const blocked = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        blocked[j * gw + i] = img[((j * S) * w + i * S) * 4] > 90 ? 1 : 0;
      }
    }
    // start at the finger (or the nearest un-cracked texel right next to it)
    let sx = Math.floor((cx - x0) / S);
    let sy = Math.floor((cy - y0) / S);
    if (sx < 0 || sy < 0 || sx >= gw || sy >= gh) return null;
    if (blocked[sy * gw + sx]) {
      let found = false;
      for (let r = 1; r <= 4 && !found; r++) {
        for (let dy = -r; dy <= r && !found; dy++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            const nx = sx + dx;
            const ny = sy + dy;
            if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && !blocked[ny * gw + nx]) {
              sx = nx;
              sy = ny;
              found = true;
            }
          }
        }
      }
      if (!found) return null;
    }
    const maxCells = Math.floor((3.4 * PX * PX) / (S * S)); // up to 3.4 cm^2
    const seen = new Uint8Array(gw * gh);
    const stack = [sy * gw + sx];
    seen[sy * gw + sx] = 1;
    const cells = [];
    while (stack.length) {
      const k = stack.pop();
      cells.push(k);
      if (cells.length > maxCells) return null; // still part of the big shell
      const i = k % gw;
      const j = (k / gw) | 0;
      if (i === 0 || j === 0 || i === gw - 1 || j === gh - 1) return null; // leaks out
      for (const n of [k - 1, k + 1, k - gw, k + gw]) {
        if (!seen[n] && !blocked[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    // a piece also has to be on the shell (not off the end of the bar)
    let minY = Infinity;
    for (const k of cells) minY = Math.min(minY, (k / gw) | 0);
    return { x0, y0, w, h, gw, S, cells, area: (cells.length * S * S) / (PX * PX), u, y };
  }

  /** Knock a free piece right out, showing the soft ice cream under it. */
  popRegion(region, now) {
    const { x0, y0, w, h, gw, S, cells } = region;
    if (!this.tmp) this.tmp = document.createElement("canvas");
    const c = this.tmp;
    if (c.width < w) c.width = w;
    if (c.height < h) c.height = h;
    const t = c.getContext("2d");
    t.globalCompositeOperation = "source-over";
    t.clearRect(0, 0, c.width, c.height);
    const id = t.createImageData(w, h);
    const d = id.data;
    let lowJ = 0;
    for (const k of cells) {
      const i = k % gw;
      const j = (k / gw) | 0;
      lowJ = Math.max(lowJ, j);
      // grow each cell by a texel so the piece takes its crack edges with it
      for (let yy = j * S - 1; yy < j * S + S + 1; yy++) {
        for (let xx = i * S - 1; xx < i * S + S + 1; xx++) {
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const o = (yy * w + xx) * 4;
          d[o] = 255;
          d[o + 1] = 120;
          d[o + 3] = 255;
        }
      }
    }
    t.putImageData(id, 0, 0);
    this.g.drawImage(c, 0, 0, w, h, x0, y0, w, h);
    this.texDirty = true;
    // remember it for drips: the lowest point of the hole
    const lowY = Y1 - (y0 + lowJ * S) / PX;
    this.impacts.push({ id: this.nextId++, x: region.u, y: region.y, face: 0, hole: 0.3, born: now, low: lowY, cells: [] });
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

  /** Draw an op, plus wrapped copies so anything crossing the back joins up. */
  draw(op) {
    for (const off of [-CRACK_W, 0, CRACK_W]) {
      this.off = off;
      this.drawOnce(op);
    }
    this.off = 0;
  }

  drawOnce(op) {
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
    const out = this.impacts.map((imp) => {
      const y = imp.hole > 0.15 ? imp.y - imp.hole * 0.9 : Math.max(imp.low, imp.y - 1.0);
      const r = fromChart(imp.x, y, this.faluda, this.coco);
      return { id: `i${imp.id}`, x: r.x + Math.sin(imp.id * 7.3) * 0.12, y, side: r.side, hole: imp.hole > 0.15, fill: this.ooze };
    });
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
