import { WEATHERS } from "../sim/melt.js";

const SPEAKER_ON =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h2.2L8.5 3.5v9L5.2 10H3z"/><path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 4a5.6 5.6 0 0 1 0 8"/></svg>';
const SPEAKER_OFF =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h2.2L8.5 3.5v9L5.2 10H3z"/><path d="M11 6.2l3.4 3.6M14.4 6.2L11 9.8"/></svg>';

/**
 * A quiet line of words across the top: the weather. The current one is a
 * little darker, with a tiny speaker beside it that turns the sounds on/off.
 * Picking a word changes the painted sky and how fast the ice cream melts.
 */
export class WeatherPicker {
  constructor(root, { value, onChange, onSound, soundOn = true }) {
    this.root = root;
    this.onChange = onChange;
    this.onSound = onSound;
    this.soundOn = soundOn;
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
    this.sound = document.createElement("button");
    this.sound.type = "button";
    this.sound.className = "weather-sound";
    this.sound.addEventListener("click", () => {
      this.soundOn = !this.soundOn;
      this.paintSound();
      this.onSound?.(this.soundOn);
    });
    this.paintSound();
    this.set(value, false);
  }

  paintSound() {
    this.sound.innerHTML = this.soundOn ? SPEAKER_ON : SPEAKER_OFF;
    this.sound.setAttribute("aria-label", this.soundOn ? "Sound on" : "Sound off");
    this.sound.setAttribute("aria-pressed", this.soundOn ? "true" : "false");
  }

  set(i, notify = true) {
    const changed = i !== this.value;
    this.value = i;
    this.items.forEach(({ item, b }, j) => {
      const on = j === i;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      if (on) item.appendChild(this.sound);
    });
    if (changed && notify) this.onChange?.(i);
  }
}
