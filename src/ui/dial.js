import { TEMP_DEFAULT, TEMP_MAX, TEMP_MIN, describeTemp } from "../sim/melt.js";

const SWEEP = 270; // degrees of knob travel
const NS = "http://www.w3.org/2000/svg";

/**
 * A small temperature knob. Warmer = faster melting. Drag it (any direction),
 * scroll on it, or use the arrow keys. Double click returns to a normal
 * Sunday afternoon.
 */
export class Dial {
  constructor(root, { onChange, onTick }) {
    this.root = root;
    this.onChange = onChange;
    this.onTick = onTick;
    this.value = TEMP_DEFAULT;
    this.knob = root.querySelector(".dial");
    this.temp = root.querySelector(".dial-temp");
    this.desc = root.querySelector(".dial-desc");
    this.build();
    this.bind();
    this.set(TEMP_DEFAULT, false);
  }

  build() {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("aria-hidden", "true");
    const ticks = document.createElementNS(NS, "g");
    ticks.setAttribute("class", "dial-ticks");
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const a = ((-SWEEP / 2 + (SWEEP * i) / n) * Math.PI) / 180;
      const r0 = i % 7 === 0 ? 18.6 : 19.8;
      const l = document.createElementNS(NS, "line");
      l.setAttribute("x1", 24 + Math.sin(a) * r0);
      l.setAttribute("y1", 24 - Math.cos(a) * r0);
      l.setAttribute("x2", 24 + Math.sin(a) * 22);
      l.setAttribute("y2", 24 - Math.cos(a) * 22);
      l.dataset.i = i;
      ticks.appendChild(l);
    }
    svg.appendChild(ticks);
    const face = document.createElementNS(NS, "circle");
    face.setAttribute("cx", 24);
    face.setAttribute("cy", 24);
    face.setAttribute("r", 14.5);
    face.setAttribute("class", "dial-face");
    svg.appendChild(face);
    const ind = document.createElementNS(NS, "g");
    ind.setAttribute("class", "dial-ind");
    const dot = document.createElementNS(NS, "line");
    dot.setAttribute("x1", 24);
    dot.setAttribute("y1", 12.5);
    dot.setAttribute("x2", 24);
    dot.setAttribute("y2", 17);
    ind.appendChild(dot);
    svg.appendChild(ind);
    this.ticks = [...ticks.children];
    this.ind = ind;
    this.knob.appendChild(svg);
  }

  bind() {
    const k = this.knob;
    let drag = null;
    k.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        k.setPointerCapture(e.pointerId);
      } catch {
        /* capture not available: window listeners below still end the drag */
      }
      drag = { id: e.pointerId, a: this.angleAt(e), v: this.value };
      k.classList.add("is-active");
    });
    // Turning the knob: the pointer's angle around the knob's centre drives
    // the indicator 1:1, so it feels the same at every point of the dial.
    k.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      // a mouse whose button is no longer down can't be dragging
      if (e.pointerType === "mouse" && e.buttons === 0) {
        end();
        return;
      }
      const a = this.angleAt(e);
      if (a === null) return; // too close to the centre to read an angle
      if (drag.a === null) {
        drag.a = a;
        return;
      }
      let d = a - drag.a;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      drag.a = a;
      const perDeg = (TEMP_MAX - TEMP_MIN) / SWEEP;
      drag.v = Math.max(TEMP_MIN, Math.min(TEMP_MAX, drag.v + ((d * 180) / Math.PI) * perDeg));
      this.set(drag.v);
    });
    const end = () => {
      if (!drag) return;
      const id = drag.id;
      drag = null;
      k.classList.remove("is-active");
      try {
        if (k.hasPointerCapture(id)) k.releasePointerCapture(id);
      } catch {
        /* already released */
      }
    };
    k.addEventListener("pointerup", end);
    k.addEventListener("pointercancel", end);
    k.addEventListener("lostpointercapture", end);
    window.addEventListener("pointerup", end);
    window.addEventListener("blur", end);
    k.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.set(this.value + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 5 : 1));
      },
      { passive: false },
    );
    k.addEventListener("dblclick", () => this.set(TEMP_DEFAULT));
    k.addEventListener("keydown", (e) => {
      const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 }[e.key];
      if (step) {
        e.preventDefault();
        this.set(this.value + step);
      } else if (e.key === "Home") {
        e.preventDefault();
        this.set(TEMP_MIN);
      } else if (e.key === "End") {
        e.preventDefault();
        this.set(TEMP_MAX);
      }
    });
  }

  /** Pointer angle around the knob centre, clockwise from 12 o'clock (radians). */
  angleAt(e) {
    const r = this.knob.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < 5) return null;
    return Math.atan2(dx, -dy);
  }

  set(v, notify = true) {
    v = Math.round(Math.max(TEMP_MIN, Math.min(TEMP_MAX, v)));
    const changed = v !== this.value;
    this.value = v;
    const t = (v - TEMP_MIN) / (TEMP_MAX - TEMP_MIN);
    this.ind.setAttribute("transform", `rotate(${-SWEEP / 2 + SWEEP * t} 24 24)`);
    const lit = Math.round(t * (this.ticks.length - 1));
    this.ticks.forEach((l, i) => l.classList.toggle("on", i <= lit));
    this.root.style.setProperty("--heat", t.toFixed(3));
    const label = `${v < 0 ? "−" : ""}${Math.abs(v)}°`;
    this.temp.textContent = label;
    this.desc.textContent = describeTemp(v);
    this.knob.setAttribute("aria-valuenow", String(v));
    this.knob.setAttribute("aria-valuetext", `${v} degrees Celsius, ${describeTemp(v)}`);
    if (changed && notify) {
      this.onTick?.(t);
      this.onChange?.(v);
    }
  }
}
