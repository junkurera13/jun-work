import {
  CELL,
  SHELL_T,
  bodyOuter,
  cellAtRef,
  cellSeed,
  deformRef,
  refToObj,
  sdBar,
} from "./shape.js";
import { mat3FromQuat, mat3TMul, mulMat3, mulMat3T, quatIntegrate, rand } from "./math.js";

const GX0 = -4;
const GY0 = -6;
const NX = 8;
const NY = 12;
export const CELL_TEX_W = NX * 2;
export const CELL_TEX_H = NY;

const GRAVITY = 900; // cm/s^2

function key(gx, gy, face) {
  return `${face}:${gx}:${gy}`;
}

/**
 * Owns the chocolate shell's fracture state: which cells are cracked, how
 * far each crack has opened, which pieces have snapped off, how much vanilla
 * is welling up through the cracks, plus the flying shards and crumbs.
 */
export class Fracture {
  constructor() {
    this.data = new Float32Array(CELL_TEX_W * CELL_TEX_H * 4);
    this.reset();
  }

  reset() {
    this.cells = new Map();
    this.fragments = [];
    this.crumbs = [];
    this.data.fill(0);
    this.any = false;
    this.dirty = true;
  }

  cell(gx, gy, face) {
    if (gx < GX0 || gx >= GX0 + NX || gy < GY0 || gy >= GY0 + NY) return null;
    const k = key(gx, gy, face);
    let c = this.cells.get(k);
    if (!c) {
      c = { gx, gy, face, cracked: false, crackAt: 0, open: 0, removed: false, sink: 0, sinkTarget: 0, fill: 0, source: null };
      this.cells.set(k, c);
    }
    return c;
  }

  /**
   * React to a tap on the shell.
   * @returns {{type: 'crack'|'pop'|'squish', strength: number} | null}
   */
  impact(hit, now, M, world) {
    const q = deformRef(hit.x, hit.y, hit.z, M.sag, M.bulge, M.taper, M.shrink);
    const face = q.z >= 0 ? 0 : 1;
    const v = cellAtRef(q.x, q.y);
    const c = this.cell(v.cell[0], v.cell[1], face);
    if (!c) return null;
    const nearSeam = Math.abs(q.z) < 0.55;

    if (c.removed) {
      this.crackAround(q, face, 1.3, now, nearSeam);
      this.spawnCrumbs(hit, 2, world, M);
      return { type: "squish", strength: 0.5 };
    }
    if (c.cracked && now - c.crackAt > 0.05) {
      this.removeCell(c, now, M, world, hit);
      this.crackAround(q, face, 1.7 + rand(0, 0.5), now, nearSeam);
      this.spawnCrumbs(hit, 3 + Math.floor(rand(0, 3)), world, M);
      return { type: "pop", strength: 1 };
    }
    this.crackAround(q, face, 2.1 + rand(0, 0.7), now, nearSeam);
    this.spawnCrumbs(hit, 2 + Math.floor(rand(0, 3)), world, M);
    return { type: "crack", strength: 1 };
  }

  crackAround(q, face, radius, now, nearSeam) {
    const faces = nearSeam ? [face, 1 - face] : [face];
    for (const f of faces) {
      const r = f === face ? radius : radius * 0.6;
      for (let gy = GY0; gy < GY0 + NY; gy++) {
        for (let gx = GX0; gx < GX0 + NX; gx++) {
          const s = cellSeed(gx, gy);
          const d = Math.hypot(s[0] - q.x, s[1] - q.y);
          if (d > r) continue;
          // only cells that actually lie on the bar
          if (sdBar(s[0], s[1], 0) > 0.25) continue;
          const c = this.cell(gx, gy, f);
          if (c.cracked) continue;
          c.cracked = true;
          c.crackAt = now + d / 38 + (f === face ? 0 : 0.03);
          c.sinkTarget = rand(0.004, 0.022);
          this.any = true;
        }
      }
    }
  }

  removeCell(c, now, M, world, hit) {
    c.removed = true;
    c.open = 1;
    c.fill = 0;
    this.any = true;
    this.dirty = true;
    // pivot: the cell seed on the current surface
    const s = cellSeed(c.gx, c.gy);
    const side = c.face === 0 ? 1 : -1;
    const o = refToObj(s[0], s[1], 0, M.sag, M.bulge, M.taper, M.shrink);
    let lo = 0;
    let hi = 2.4;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (bodyOuter(o.x, o.y, side * mid, M) < 0) lo = mid;
      else hi = mid;
    }
    const pivot = { x: o.x, y: o.y, z: side * (lo - SHELL_T * 0.5) };
    const wp = world.objToWorld(pivot.x, pivot.y, pivot.z);
    // outward push along the face normal, with a bit of spin and pop
    const n = mulMat3(world.rot, 0, 0, side);
    const out = rand(10, 18);
    const frag = {
      cell: c,
      ref: pivot,
      M: { sag: M.sag, bulge: M.bulge, taper: M.taper, morph: M.morph, shrink: M.shrink, erode: M.erode * 0.75, meltC: M.meltC },
      pos: wp,
      vel: {
        x: n.x * out + rand(-5, 5) + (pivot.x - hit.x) * 6,
        y: n.y * out + rand(6, 16),
        z: n.z * out + rand(-3, 3),
      },
      q: world.quat.slice(),
      w: { x: rand(-9, 9), y: rand(-4, 4), z: rand(-9, 9) },
      born: now,
      radius: CELL * 1.08,
    };
    this.fragments.push(frag);
    if (this.fragments.length > 12) this.fragments.shift();
  }

  spawnCrumbs(hit, count, world) {
    const n = hit.normal;
    for (let i = 0; i < count; i++) {
      const p = world.objToWorld(hit.x + rand(-0.2, 0.2), hit.y + rand(-0.2, 0.2), hit.z + n.z * 0.05);
      const nw = mulMat3(world.rot, n.x, n.y, n.z);
      const sp = rand(14, 34);
      this.crumbs.push({
        pos: p,
        vel: { x: nw.x * sp + rand(-12, 12), y: nw.y * sp + rand(8, 24), z: nw.z * sp + rand(-8, 8) },
        q: [rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(-1, 1)].map((x, _, a) => x / Math.hypot(...a)),
        w: { x: rand(-30, 30), y: rand(-30, 30), z: rand(-30, 30) },
        size: rand(0.035, 0.085),
      });
    }
    while (this.crumbs.length > 24) this.crumbs.shift();
  }

  update(dt, now, rate, M, world, floorY) {
    // cell animation
    for (const c of this.cells.values()) {
      if (c.cracked && !c.removed && now >= c.crackAt) {
        const before = c.open;
        c.open = Math.min(1, c.open + dt / 0.07);
        c.sink += (c.sinkTarget - c.sink) * Math.min(1, dt * 18);
        if (c.open !== before) this.dirty = true;
        // vanilla slowly wells up through the cracks as it softens
        if (c.open > 0.5 && rate > 0) {
          const before2 = c.fill;
          c.fill = Math.min(1, c.fill + dt * rate * (0.011 + 0.09 * M.meltV));
          if (Math.abs(c.fill - before2) > 1e-5) this.dirty = true;
        }
      }
    }

    // falling shards (world-space physics)
    for (const f of this.fragments) {
      f.vel.y -= GRAVITY * dt;
      f.pos.x += f.vel.x * dt;
      f.pos.y += f.vel.y * dt;
      f.pos.z += f.vel.z * dt;
      f.q = quatIntegrate(f.q, f.w.x, f.w.y, f.w.z, dt);
    }
    this.fragments = this.fragments.filter((f) => f.pos.y > floorY - 4);
    for (const c of this.crumbs) {
      c.vel.y -= GRAVITY * dt;
      c.pos.x += c.vel.x * dt;
      c.pos.y += c.vel.y * dt;
      c.pos.z += c.vel.z * dt;
      c.q = quatIntegrate(c.q, c.w.x, c.w.y, c.w.z, dt);
    }
    this.crumbs = this.crumbs.filter((c) => c.pos.y > floorY - 2);

    if (this.dirty) this.writeTexture();
  }

  writeTexture() {
    const d = this.data;
    d.fill(0);
    for (const c of this.cells.values()) {
      const tx = c.gx - GX0 + c.face * NX;
      const ty = c.gy - GY0;
      const i = (ty * CELL_TEX_W + tx) * 4;
      d[i] = c.removed ? 1 : c.open;
      d[i + 1] = c.removed ? 1 : 0;
      d[i + 2] = c.removed ? 0 : c.sink;
      d[i + 3] = c.removed ? 0 : c.fill;
    }
    this.dirty = false;
    this.texDirty = true;
  }

  /** Lowest point of a cell (reference space), found by walking down from its seed. */
  cellBottom(c) {
    const s = cellSeed(c.gx, c.gy);
    let y = s[1];
    for (let i = 0; i < 40; i++) {
      const v = cellAtRef(s[0], y - 0.05);
      if (v.cell[0] !== c.gx || v.cell[1] !== c.gy) break;
      y -= 0.05;
    }
    return { x: s[0], y: y - 0.02 };
  }

  /** Where vanilla is escaping through the shell (used to spawn drips). */
  leakSources() {
    const out = [];
    for (const c of this.cells.values()) {
      if (c.removed) {
        if (!c.source) c.source = this.cellBottom(c);
        out.push({ id: `h${c.face}:${c.gx}:${c.gy}`, x: c.source.x, y: c.source.y, side: c.face === 0 ? 1 : -1, hole: true, fill: 1 });
      } else if (c.cracked && c.fill > 0.55) {
        if (!c.source) c.source = this.cellBottom(c);
        out.push({ id: `c${c.face}:${c.gx}:${c.gy}`, x: c.source.x, y: c.source.y, side: c.face === 0 ? 1 : -1, hole: false, fill: c.fill });
      }
    }
    // the lowest leaks win: that's where the liquid would collect first
    out.sort((a, b) => a.y - b.y);
    return out.slice(0, 5);
  }

  /** Pack shards & crumbs into the dynamic texture (object space). */
  pack(dyn, width, world) {
    const R = world.rot;
    let fi = 0;
    for (const f of this.fragments) {
      const Rf = mat3FromQuat(f.q);
      // shard orientation relative to the ice cream; at birth this is identity
      const Rrel = mat3TMul(R, Rf);
      const p = world.worldToObj(f.pos.x, f.pos.y, f.pos.z);
      const put = (row, a, b, c, d) => {
        const i = (row * width + fi) * 4;
        dyn[i] = a;
        dyn[i + 1] = b;
        dyn[i + 2] = c;
        dyn[i + 3] = d;
      };
      put(3, Rrel[0], Rrel[1], Rrel[2], f.cell.gx);
      put(4, Rrel[3], Rrel[4], Rrel[5], f.cell.gy);
      put(5, Rrel[6], Rrel[7], Rrel[8], f.cell.face);
      put(6, p.x, p.y, p.z, f.radius);
      put(7, f.ref.x, f.ref.y, f.ref.z, f.M.sag);
      put(8, f.M.bulge, f.M.erode, f.M.meltC, f.M.taper);
      put(11, f.M.morph, f.M.shrink, 0, 0);
      fi++;
    }
    let ci = 0;
    const qi = world.quat;
    const qconj = [-qi[0], -qi[1], -qi[2], qi[3]];
    for (const c of this.crumbs) {
      const p = world.worldToObj(c.pos.x, c.pos.y, c.pos.z);
      // relative orientation: conj(objQuat) * crumbQuat
      const a = qconj;
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
    return { frags: fi, crumbs: ci };
  }

  bounds(world) {
    const pts = [];
    for (const f of this.fragments) {
      const p = world.worldToObj(f.pos.x, f.pos.y, f.pos.z);
      pts.push([p, f.radius]);
    }
    for (const c of this.crumbs) {
      const p = world.worldToObj(c.pos.x, c.pos.y, c.pos.z);
      pts.push([p, c.size * 1.5]);
    }
    return pts;
  }
}

export { mulMat3T };
