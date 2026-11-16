/**
 * The flavor picker: a row of little circles in the bottom-left corner of the
 * painting, each a round window onto that ice cream's own surface. Hovering
 * one swells it and shows its name; the one on screen is bigger. Arrow keys
 * move between them.
 */
export class Dock {
  constructor(root, { items, value = 0, onChange }) {
    this.root = root;
    this.onChange = onChange;

    root.classList.add("dock");
    root.setAttribute("role", "radiogroup");

    this.buttons = items.map((item, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dock-item";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", item.name);
      b.dataset.flavor = item.id;
      b.innerHTML = `<span class="dock-label" aria-hidden="true"></span><span class="dock-icon"><img alt="" draggable="false" /></span>`;
      b.querySelector(".dock-label").textContent = item.name;
      b.addEventListener("click", () => this.set(i));
      b.addEventListener("keydown", (e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const n = (this.value + step + items.length) % items.length;
        this.set(n);
        this.buttons[n].focus();
      });
      root.appendChild(b);
      return b;
    });

    this.set(value, false);
  }

  setIcon(i, src) {
    this.buttons[i].querySelector("img").src = src;
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
}
