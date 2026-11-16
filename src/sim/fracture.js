import { bodyOuter, deformRef, refToObj } from "./shape.js";
import { mulMat3, quatIntegrate, rand } from "./math.js";

// The impact data shares a small float texture with the shader:
// row 0: x, y, face, radius   row 1: depth, seed, hole, fill   row 2: strength
export const CELL_TEX_W = 16;
export const CELL_TEX_H = 12;
const MAX_IMPACTS = 16;
const GRAVITY = 900; // cm/s^2

/**
 * Presses on the chocolate shell. Each press is one impact: a crater whose
 * cracks run outwards from the finger, plates pushed into the ice cream,
 * vanilla squeezed up through the gaps. Holding presses deeper; pressing the
 * same spot again crushes it and flicks out small chips.
 */
export class Fracture {
  constructor() {
    this.data = new Float32Array(CELL_TEX_W * CELL_TEX_H * 4);
    this.reset();
  }

  reset() {
    this.impacts = [];
    this.crumbs = [];
    this.data.fill(0);
    this.any = false;
    this.texDirty = true;
  }

  /**
   * Start pressing at a hit point.
   * @returns {{type: 'crack'|'crunch', strength: number, impact: object} | null}
   */
  press(hit, now, M, world) {
    const q = deformRef(hit.x, hit.y, hit.z, M.sag, M.bulge, M.taper, M.shrink);
    const face = q.z >= 0 ? 1 : -1;
    let imp = null;
    let bestD = 1e9;
    for (const i of this.impacts) {
      if (i.face !== face) continue;
      const d = Math.hypot(i.x - q.x, i.y - q.y);
      if (d < Math.max(0.6, i.R * 0.5) && d < bestD) {
        imp = i;
        bestD = d;
      }
    }
    let type = "crack";
    if (imp) {
      // pressing into an existing crater: crush it further
      imp.target = Math.min(2.2, imp.target + 0.45);
      imp.R0 = Math.min(2.4, imp.R0 + 0.25);
      type = "crunch";
    } else {
      imp = {
        x: q.x,
        y: q.y,
        face,
        seed: rand(1, 97),
        strength: 0,
        target: 0.5,
        R: 0,
        R0: rand(1.15, 1.55),
        depth: 0,
        vel: 0,
        hole: 0,
        holeShown: 0,
        squish: 0,
        meltFill: 0,
        source: null,
      };
      this.impacts.push(imp);
      if (this.impacts.length > MAX_IMPACTS) this.impacts.shift();
    }
    this.any = true;
    this.spawnCrumbs(hit, type === "crunch" ? 3 : 2, world, 0.035, 0.07);
    return { type, strength: imp.target, impact: imp };
  }

  /** Keep pressing. Returns true when the crack should audibly creep further. */
  hold(imp, dt) {
    if (!imp || imp.target >= 2.2) return false;
    const before = imp.target;
    imp.target = Math.min(2.2, imp.target + dt * 0.85);
    imp.R0 = Math.min(2.4, imp.R0 + dt * 0.25);
    // a crackle roughly every tenth of a unit of extra pressure
    return Math.floor(before * 10) !== Math.floor(imp.target * 10);
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

  update(dt, now, rate, M, world, floorY) {
    for (const imp of this.impacts) {
      // pressure follows the finger quickly
      imp.strength += (imp.target - imp.strength) * Math.min(1, dt * 14);
      // the crack front races outwards
      const Rt = imp.R0 * (0.7 + 0.45 * Math.min(imp.strength, 1.6));
      imp.R += (Rt - imp.R) * Math.min(1, dt * 18);
      // the crater sinks on a slightly bouncy spring: squish, settle
      const dT = Math.min(0.065, 0.03 * imp.strength + 0.008);
      // (sub-stepped so a slow frame can never make it blow up)
      const steps = Math.ceil(dt / 0.006);
      const h = dt / steps;
      for (let k = 0; k < steps; k++) {
        const acc = (dT - imp.depth) * 1400 - imp.vel * 34;
        imp.vel += acc * h;
        imp.depth += imp.vel * h;
      }
      // crushed centre after hard presses
      const hT = imp.strength > 0.95 ? Math.min(0.36, 0.12 + 0.2 * (imp.strength - 0.95)) : 0;
      imp.hole += (hT - imp.hole) * Math.min(1, dt * 20);
      if (imp.hole - imp.holeShown > 0.04) {
        // chips of shell flick out of the crushed middle
        const n = Math.ceil((imp.hole - imp.holeShown) / 0.04);
        imp.holeShown = imp.hole;
        const o = this.surfacePoint(imp, M);
        if (o) this.spawnCrumbs(o, Math.min(4, n + 1), world, 0.09, 0.2);
      }
      // vanilla squeezed out by the press, then more as it melts
      imp.squish += (Math.min(0.75, imp.strength * 0.55) - imp.squish) * Math.min(1, dt * 6);
      if (rate > 0) imp.meltFill = Math.min(1, imp.meltFill + dt * rate * (0.011 + 0.09 * M.meltV));
    }

    for (const c of this.crumbs) {
      c.vel.y -= GRAVITY * dt;
      c.pos.x += c.vel.x * dt;
      c.pos.y += c.vel.y * dt;
      c.pos.z += c.vel.z * dt;
      c.q = quatIntegrate(c.q, c.w.x, c.w.y, c.w.z, dt);
    }
    this.crumbs = this.crumbs.filter((c) => c.pos.y > floorY - 2);

    this.writeTexture();
  }

  /** The press point on the current (melted) surface, in object space. */
  surfacePoint(imp, M) {
    const o = refToObj(imp.x, imp.y, 0, M.sag, M.bulge, M.taper, M.shrink);
    if (bodyOuter(o.x, o.y, 0, M) > 0) return null;
    let lo = 0;
    let hi = 2.6;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (bodyOuter(o.x, o.y, imp.face * mid, M) < 0) lo = mid;
      else hi = mid;
    }
    return { x: o.x, y: o.y, z: imp.face * lo, normal: { x: 0, y: 0, z: imp.face } };
  }

  writeTexture() {
    const d = this.data;
    d.fill(0);
    const W = CELL_TEX_W;
    this.impacts.forEach((imp, i) => {
      let k = i * 4;
      d[k] = imp.x;
      d[k + 1] = imp.y;
      d[k + 2] = imp.face;
      d[k + 3] = imp.R;
      k = (W + i) * 4;
      d[k] = Math.max(0, imp.depth);
      d[k + 1] = imp.seed;
      d[k + 2] = imp.hole;
      d[k + 3] = Math.min(1, imp.squish + imp.meltFill);
      k = (2 * W + i) * 4;
      d[k] = imp.strength;
    });
    this.texDirty = true;
  }

  /** Where vanilla is escaping through the shell (used to spawn drips). */
  leakSources() {
    const out = [];
    for (const imp of this.impacts) {
      const fill = Math.min(1, imp.squish * 0.5 + imp.meltFill);
      const hole = imp.hole > 0.2;
      if (fill < 0.55 && !(hole && imp.meltFill > 0.25)) continue;
      out.push({
        id: `i${imp.seed.toFixed(3)}`,
        x: imp.x + Math.sin(imp.seed) * 0.15,
        y: imp.y - (hole ? imp.hole * 0.9 : imp.R * 0.45),
        side: imp.face,
        hole,
        fill,
      });
    }
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
