import { WEATHERS } from "../sim/melt.js";

/**
 * Picking a word changes the painted sky and how fast the ice cream melts.
 * Arrow keys move between the weather buttons.
 */
export class WeatherPicker {
  constructor(root, { value, onChange }) {
    this.onChange = onChange;
    this.buttons = WEATHERS.map((w, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "weather-word";
      b.setAttribute("role", "radio");
      b.textContent = w.word;
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
