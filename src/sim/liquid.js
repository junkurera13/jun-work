import { BAR_BOTTOM, STICK_HT, STICK_Y0, bodyOuter, refToObj, smoothstep } from "./shape.js";
import { rand } from "./math.js";

const GRAVITY = 980;
const MAX_PRIMS = 64;

/**
 * Melted ice cream: little rivulets that crawl down the surface (or down the
 * stick), gather into a hanging bead at the lowest point, neck, pinch off and
 * fall away below the screen. Everything is rendered as smooth-blended round
 * cones in the ray marcher.
 */
export class Liquid {
  constructor() {
    this.reset();
  }

  reset() {
    this.streams = new Map();
    this.falling = [];
    this.seed();
  }

  seed() {
    // fixed melt sources for one ice cream (reference space)
    const s = [];
    s.push({ id: "stickF", kind: "stick", mat: 0, x: 0.16, side: 1, from: 0.012, feed: (M) => 0.35 + 1.1 * M.meltV });
    s.push({ id: "cornerL", kind: "bottom", mat: 0, x: -1.75, side: 0, from: 0.05, feed: (M) => 0.25 + 1.0 * M.meltV });
    s.push({ id: "stickB", kind: "stick", mat: 0, x: -0.14, side: -1, from: 0.09, feed: (M) => 0.3 + 1.0 * M.meltV });
    s.push({ id: "cornerR", kind: "bottom", mat: 0, x: 1.9, side: 0, from: 0.17, feed: (M) => 0.2 + 0.9 * M.meltV });
    s.push({ id: "stickF2", kind: "stick", mat: 1, x: -0.22, side: 1, from: 0.3, feed: (M) => 0.2 + 0.8 * M.meltC });
    const th = [0.07, 0.16, 0.26, 0.36, 0.48, 0.62];
    for (let i = 0; i < th.length; i++) {
      s.push({
        id: `choc${i}`,
        kind: "face",
        mat: 1,
        x: rand(-1.9, 1.9),
        y: rand(-0.5, 3.8),
        side: i % 2 === 0 ? 1 : -1,
        fromC: th[i],
        feed: (M) => 0.25 + 0.9 * M.meltC,
      });
    }
    for (let i = 0; i < 3; i++) {
      s.push({
        id: `top${i}`,
        kind: "face",
        mat: 0,
        x: rand(-1.4, 1.4),
        y: 4.3,
        side: i % 2 === 0 ? 1 : -1,
        from: 0.36 + i * 0.08,
        feed: (M) => 0.5 + 0.8 * M.meltV,
      });
    }
    this.sources = s;
  }

  /** surface depth on one side; null where the ice cream is gone or too thin to carry a drip */
  surfaceZ(x, y, side, M) {
    if (bodyOuter(x, y, 0, M) > -0.18) return null;
    let lo = 0;
    let hi = 2.6;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) * 0.5;
      if (bodyOuter(x, y, side * mid, M) < 0) lo = mid;
      else hi = mid;
    }
    return side * lo;
  }

  /** lowest y of the body at (x, z) */
  bottomY(x, z, M, yStart) {
    let y = yStart;
    if (bodyOuter(x, y, z, M) > 0) return null;
    let step = 0.4;
    while (y > BAR_BOTTOM - 1.5) {
      if (bodyOuter(x, y - step, z, M) > 0) break;
      y -= step;
    }
    let lo = y - step;
    let hi = y;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) * 0.5;
      if (bodyOuter(x, mid, z, M) < 0) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  update(dt, now, rate, M, leaks, world, floorY) {
    const active = new Set();
    const ox = (s) => refToObj(s.x, s.y ?? 0, 0, M.sag, M.bulge, M.taper, M.shrink);
    const bodyLeft = M.P < 0.985;

    for (const s of this.sources) {
      const on = bodyLeft && (s.fromC !== undefined ? M.meltC >= s.fromC : M.P >= s.from);
      if (on) active.add(s.id);
      this.touch(s, on, M);
    }
    for (const l of leaks) {
      const s = {
        id: l.id,
        kind: "face",
        mat: 0,
        x: l.x,
        y: l.y,
        side: l.side,
        feed: (MM) => (l.hole ? 0.55 : 0.25) + (l.hole ? 1.2 : 0.9) * MM.meltV + 0.4 * l.fill,
        fromCrack: true,
      };
      const on = bodyLeft && rate > 0 && (l.hole ? M.P > 0.0 : true);
      if (on) active.add(s.id);
      this.touch(s, on, M);
    }

    const speedK = rate > 0 ? 1 : 0.4;
    for (const st of this.streams.values()) {
      const src = st.src;
      if (!active.has(src.id)) st.alive = false;
      const feed = st.alive ? src.feed(M) : 0;
      st.feedNow = feed;

      // geometry of the run for the current (melted) shape
      st.prims = [];
      const r = st.r * (st.alive ? Math.min(1, 0.35 + st.age / 1.5) : Math.max(0, st.fade));
      if (!st.alive) st.fade -= dt / (st.lost ? 0.9 : 3.5);
      st.age += dt;

      if (src.kind === "stick") {
        const z0 = src.side * 0.12;
        const yb = this.bottomY(src.x * 1.2, z0, M, Math.min(BAR_BOTTOM + 3.5, BAR_BOTTOM + 9.6 / M.sag - 0.4));
        if (yb === null) {
          st.alive = false;
        }
        const top = { x: src.x, y: (yb ?? BAR_BOTTOM) + 0.05, z: src.side * (STICK_HT + r * 0.25) };
        const tipY = STICK_Y0 + 0.42;
        st.head = Math.min(st.head + dt * (0.5 + 0.15 * rate) * speedK, top.y - tipY + 0.0001);
        const hy = top.y - st.head;
        const head = { x: src.x * 0.85, y: hy, z: src.side * (STICK_HT + r * 0.3) };
        if (r > 0.01) st.prims.push([top, r * 0.65, head, r]);
        if (hy <= tipY + 1e-3) {
          const anchor = { x: src.x * 0.4, y: STICK_Y0 + 0.08, z: src.side * 0.03 };
          if (r > 0.01) st.prims.push([head, r, anchor, r * 0.9]);
          this.pendant(st, anchor, dt, rate, feed, world, now);
        }
      } else if (src.kind === "bottom") {
        const o = ox({ x: src.x, y: BAR_BOTTOM });
        const yb = this.bottomY(o.x, 0, M, BAR_BOTTOM + 1.5);
        if (yb === null) {
          st.alive = false;
          this.release(st, world);
        } else {
          this.pendant(st, { x: o.x, y: yb + 0.06, z: 0 }, dt, rate, feed, world, now);
        }
      } else {
        // face run
        const o = ox(src);
        // the origin rides the material; if that bit has already melted away
        // slide down to wherever the surface is now
        let z0 = this.surfaceZ(o.x, o.y - st.shift, src.side, M);
        let tries = 0;
        while (z0 === null && tries < 30 && o.y - st.shift > BAR_BOTTOM) {
          st.shift += 0.12;
          z0 = this.surfaceZ(o.x, o.y - st.shift, src.side, M);
          tries++;
        }
        if (z0 === null) {
          st.alive = false;
          st.lost = true;
          this.release(st, world);
          if (st.origin) st.origin.y -= dt * 2;
        } else {
          st.origin = { x: o.x, y: o.y - st.shift, z: z0 };
        }
        const og = st.origin;
        if (og && !st.lost) {
          const lift = -r * 0.42;
          const yb = this.bottomY(og.x, og.z * 0.5, M, og.y);
          const bottom = (yb ?? BAR_BOTTOM) + 0.25;
          st.head += dt * (0.32 + 0.12 * rate) * speedK * (st.alive ? 1 : 0.5);
          const len = Math.max(0, Math.min(st.head, og.y - bottom));
          const reached = st.head >= og.y - bottom;
          // a slightly meandering path, re-projected onto the melting surface
          const pts = [];
          const N = 3;
          for (let i = 0; i <= N; i++) {
            const k = i / N;
            const y = og.y - len * k;
            const x = og.x + Math.sin(st.wob + (og.y - y) * 0.9) * 0.14 * k;
            const sz = this.surfaceZ(x, y, src.side, M);
            if (sz === null && i > 0) break;
            const z = (sz ?? og.z) + src.side * lift * (0.4 + 0.6 * k);
            pts.push({ x, y, z });
          }
          const ok = pts.length === N + 1;
          if (!ok) {
            st.alive = false;
            st.lost = true;
          }
          if (ok && r > 0.01 && len > 0.02) {
            for (let i = 0; i < N; i++) {
              const ra = r * (0.3 + 0.7 * (i / N));
              const rb = r * (0.3 + 0.7 * ((i + 1) / N)) * (i === N - 1 && !reached ? 1.08 : 1);
              st.prims.push([pts[i], ra, pts[i + 1], rb]);
            }
          }
          if (ok && reached) {
            const head = pts[N];
            const anchor = { x: head.x, y: bottom - 0.21, z: og.z * 0.5 };
            if (r > 0.01) st.prims.push([head, r * 1.05, anchor, r * 0.95]);
            this.pendant(st, anchor, dt, rate, feed, world, now);
          }
        }
      }
    }

    // drop finished streams
    for (const [id, st] of this.streams) {
      if (!st.alive && st.fade <= 0 && !st.drop) this.streams.delete(id);
    }

    // falling drops
    for (const d of this.falling) {
      d.vel.y -= GRAVITY * dt;
      d.pos.x += d.vel.x * dt;
      d.pos.y += d.vel.y * dt;
      d.pos.z += d.vel.z * dt;
      d.age += dt;
    }
    this.falling = this.falling.filter((d) => d.pos.y > floorY - 2);
  }

  touch(src, on, M) {
    let st = this.streams.get(src.id);
    if (!st && on) {
      st = {
        src,
        alive: true,
        age: 0,
        fade: 1,
        head: 0,
        r: src.kind === "stick" ? rand(0.085, 0.105) : rand(0.13, 0.17) * (src.mat === 1 ? 0.88 : 1),
        shift: 0,
        lost: false,
        wob: rand(0, 6.28),
        drop: null,
        origin: null,
        prims: [],
      };
      this.streams.set(src.id, st);
    } else if (st) {
      st.src = src;
      if (on && !st.alive && st.fade > 0) st.alive = true;
    }
  }

  /** let go of whatever is hanging (the surface under it has melted away) */
  release(st, world) {
    const d = st.drop;
    if (!d || !d.anchor) {
      st.drop = null;
      return;
    }
    const r = 0.06 + (d.rMax - 0.06) * Math.cbrt(Math.min(1, d.s));
    if (r > 0.1) {
      const a = d.anchor;
      const wp = world.objToWorld(a.x, a.y - r, a.z);
      this.falling.push({ pos: wp, vel: { x: 0, y: -10, z: 0 }, r, mat: st.src.mat, age: 0 });
    }
    st.drop = null;
  }

  pendant(st, anchor, dt, rate, feed, world, now) {
    if (!st.drop) st.drop = { s: 0, neck: 0, phase: "grow", t: 0, rMax: rand(0.21, 0.3) };
    const d = st.drop;
    d.anchor = anchor;
    const rMax = d.rMax * (st.src.mat === 1 ? 0.92 : 1);
    if (d.phase === "grow") {
      d.s += (dt * feed * rate) / 5.5;
      if (!st.alive) {
        if (d.s > 0.45) {
          this.release(st, world);
          return;
        }
        d.s -= dt * 0.6;
      }
      if (d.s <= 0 && !st.alive) {
        st.drop = null;
        return;
      }
      d.s = Math.max(0, d.s);
      if (d.s >= 1) {
        d.phase = "neck";
        d.t = 0;
      }
    } else {
      d.t += dt / 0.42;
      if (d.t >= 1) {
        // pinch off
        const r = rMax;
        const c = { x: anchor.x, y: anchor.y - (r * 0.95 + 0.04 + 0.9), z: anchor.z };
        const wp = world.objToWorld(c.x, c.y, c.z);
        this.falling.push({ pos: wp, vel: { x: 0, y: -38, z: 0 }, r, mat: st.src.mat, age: 0 });
        if (Math.random() < 0.6) {
          const wp2 = world.objToWorld(c.x, c.y + r + 0.35, c.z);
          this.falling.push({ pos: wp2, vel: { x: 0, y: -20, z: 0 }, r: r * rand(0.22, 0.32), mat: st.src.mat, age: -0.0 });
        }
        d.phase = "grow";
        d.rMax = rand(0.21, 0.3);
        d.s = 0.18;
        d.t = 0;
        this.onDrip?.(st.src.mat, r);
      }
    }
    const s = d.phase === "grow" ? d.s : 1;
    const r = 0.06 + (rMax - 0.06) * Math.cbrt(s);
    let neck = 0;
    let neckR = r * 0.55;
    if (d.phase === "neck") {
      const t = d.t;
      neck = 0.9 * t * t;
      neckR = r * 0.55 * (1 - smoothstep(0.2, 1.0, t)) + 0.015;
    }
    const c = { x: anchor.x, y: anchor.y - (r * 0.95 + 0.04 * s + neck), z: anchor.z };
    st.prims.push([anchor, Math.min(neckR, st.r * 1.1 + 0.02), c, r]);
  }

  /** Pack all liquid into the dyn texture (rows 0-2). Returns prim count & bounds. */
  pack(dyn, width, world) {
    let n = 0;
    const min = [1e9, 1e9, 1e9];
    const max = [-1e9, -1e9, -1e9];
    const put = (a, ra, b, rb, mat) => {
      if (n >= MAX_PRIMS) return;
      let i = n * 4;
      dyn[i] = a.x; dyn[i + 1] = a.y; dyn[i + 2] = a.z; dyn[i + 3] = ra;
      i = (width + n) * 4;
      dyn[i] = b.x; dyn[i + 1] = b.y; dyn[i + 2] = b.z; dyn[i + 3] = rb;
      i = (2 * width + n) * 4;
      dyn[i] = mat;
      for (const [p, r] of [[a, ra], [b, rb]]) {
        min[0] = Math.min(min[0], p.x - r); max[0] = Math.max(max[0], p.x + r);
        min[1] = Math.min(min[1], p.y - r); max[1] = Math.max(max[1], p.y + r);
        min[2] = Math.min(min[2], p.z - r); max[2] = Math.max(max[2], p.z + r);
      }
      n++;
    };
    // falling drops first: they are the most visible
    const up = world.worldDirToObj(0, 1, 0);
    for (const d of this.falling) {
      const c = world.worldToObj(d.pos.x, d.pos.y, d.pos.z);
      const sp = Math.abs(d.vel.y);
      const wob = 1 + 0.07 * Math.sin(d.age * 70);
      const stretch = Math.min(0.32, 0.03 + sp * 0.0011);
      const t = { x: c.x + up.x * stretch, y: c.y + up.y * stretch, z: c.z + up.z * stretch };
      put(t, d.r * 0.55, c, d.r * wob, d.mat);
    }
    for (const st of this.streams.values()) {
      for (const [a, ra, b, rb] of st.prims) put(a, ra, b, rb, st.src.mat);
    }
    return { count: n, min, max };
  }
}
