import { WEATHERS } from "../sim/melt.js";

/**
 * A tiny row of weather buttons. Picking one changes the painted sky behind
 * the ice cream and how fast it melts. Arrow keys move between them.
 */
export class WeatherPicker {
  constructor(root, { value, onChange }) {
    this.root = root;
    this.onChange = onChange;
    this.buttons = WEATHERS.map((w, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "weather-btn";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", w.label);
      b.title = w.label;
      b.innerHTML = `<span aria-hidden="true">${w.icon}</span>`;
      b.addEventListener("click", () => this.set(i));
      b.addEventListener("keydown", (e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const n = (this.value + step + WEATHERS.length) % WEATHERS.length;
        this.set(n);
        this.buttons[n].focus();
      });
      root.appendChild(b);
      return b;
    });
    this.set(value, false);
  }

  set(i, notify = true) {
    const changed = i !== this.value;
    this.value = i;
    this.buttons.forEach((b, j) => {
      const on = j === i;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    if (changed && notify) this.onChange?.(i);
  }
}
