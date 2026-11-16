import { WEATHERS } from "../sim/melt.js";

/**
 * A quiet line of words across the top: the weather. The current one is a
 * little darker. Picking a word changes the painted sky and how fast the ice
 * cream melts.
 */
export class WeatherPicker {
  constructor(root, { value, onChange }) {
    this.root = root;
    this.onChange = onChange;
    this.items = WEATHERS.map((w, i) => {
      const item = document.createElement("span");
      item.className = "weather-item";
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
        this.items[n].b.focus();
      });
      item.appendChild(b);
      root.appendChild(item);
      return { item, b };
    });
    this.set(value, false);
  }

  set(i, notify = true) {
    const changed = i !== this.value;
    this.value = i;
    this.items.forEach(({ item, b }, j) => {
      const on = j === i;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
    });
    if (changed && notify) this.onChange?.(i);
  }
}
