/**
 * A little macOS-style dock of ice creams floating along the bottom (no shelf). Icons swell as the
 * pointer glides over them (neighbours swell a little and get pushed aside),
 * the name floats above the one you're on, a dot marks the one on screen, and
 * picking one gives it a bounce. Arrow keys move between them.
 */

const MAX = 1.75; // magnification right under the pointer
const REACH = 2.6; // how far the swell spreads, in icon widths

export class Dock {
  constructor(root, { items, value = 0, onChange, reduceMotion = false }) {
    this.root = root;
    this.onChange = onChange;
    this.reduceMotion = reduceMotion;
    this.scale = items.map(() => 1);
    this.hover = false;
    this.mx = 0;
    this.raf = 0;

    root.classList.add("dock");
    root.setAttribute("role", "radiogroup");

    this.buttons = items.map((item, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dock-item";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", item.name);
      b.dataset.flavor = item.id;
      b.innerHTML = `<span class="dock-label" aria-hidden="true"></span><span class="dock-icon"><img alt="" draggable="false" /></span><span class="dock-dot" aria-hidden="true"></span>`;
      b.querySelector(".dock-label").textContent = item.name;
      b.addEventListener("click", () => {
        this.bounce(i);
        this.set(i);
      });
      b.addEventListener("keydown", (e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const n = (this.value + step + items.length) % items.length;
        this.bounce(n);
        this.set(n);
        this.buttons[n].focus();
      });
      root.appendChild(b);
      return b;
    });

    root.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" || this.reduceMotion) return;
      this.mx = e.clientX;
      this.hover = true;
      this.kick();
    });
    root.addEventListener("pointerleave", () => {
      this.hover = false;
      this.kick();
    });

    this.set(value, false);
  }

  setIcon(i, src) {
    const img = this.buttons[i].querySelector("img");
    img.src = src;
  }

  set(i, notify = true) {
    const changed = i !== this.value;
    this.value = i;
    this.buttons.forEach((b, j) => {
      const on = j === i;
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    if (changed && notify) this.onChange?.(i);
  }

  /** the little hop an app gives when you open it */
  bounce(i) {
    if (this.reduceMotion) return;
    const icon = this.buttons[i].querySelector(".dock-icon");
    icon.animate(
      [
        { transform: "translateY(0)", easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" },
        { transform: "translateY(-38%)", offset: 0.38, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)" },
        { transform: "translateY(0)", offset: 0.7, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" },
        { transform: "translateY(-9%)", offset: 0.85, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)" },
        { transform: "translateY(0)" },
      ],
      { duration: 620 },
    );
  }

  kick() {
    if (!this.raf) {
      this.prev = performance.now();
      this.raf = requestAnimationFrame((t) => this.tick(t));
    }
  }

  tick(now) {
    const dt = Math.min(0.05, (now - this.prev) / 1000);
    this.prev = now;
    const size = parseFloat(getComputedStyle(this.root).getPropertyValue("--dock-size")) || 44;
    const gap = parseFloat(getComputedStyle(this.root).getPropertyValue("--dock-gap")) || 10;
    // measure against where the icons sit at rest (the dock stays centred),
    // so swelling icons never move the target under the pointer
    const rect = this.root.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    const n = this.buttons.length;
    const reach = REACH * size;
    const k = 1 - Math.exp(-dt * 18);
    let moving = false;
    for (let i = 0; i < n; i++) {
      let target = 1;
      if (this.hover) {
        const c = mid + (i - (n - 1) / 2) * (size + gap);
        const d = Math.abs(this.mx - c);
        if (d < reach) target = 1 + ((MAX - 1) * (1 + Math.cos((Math.PI * d) / reach))) / 2;
      }
      const s = this.scale[i] + (target - this.scale[i]) * k;
      this.scale[i] = Math.abs(target - s) < 0.002 ? target : s;
      if (this.scale[i] !== target) moving = true;
      this.buttons[i].style.setProperty("--s", this.scale[i].toFixed(4));
    }
    this.raf = moving ? requestAnimationFrame((t) => this.tick(t)) : 0;
  }
}
