/**
 * The flavor picker: a row of little circles in the bottom-left corner of the
 * painting, each a round window onto that ice cream's own surface. Hovering
 * one swells it and shows its name; the one on screen is bigger. Arrow keys
 * move between them. A plus circle at the end makes a new one.
 */
export class Dock {
  constructor(root, { items, value = 0, onChange, onAdd }) {
    this.root = root;
    this.onChange = onChange;

    root.classList.add("dock");
    root.setAttribute("role", "radiogroup");

    this.buttons = [];
    for (const item of items) this.buttons.push(this.makeButton(item));

    // a plus circle at the end of the row: make your own ice cream
    this.addButton = document.createElement("button");
    this.addButton.type = "button";
    this.addButton.className = "dock-item dock-add";
    this.addButton.setAttribute("aria-label", "create your own ice cream");
    this.addButton.setAttribute("aria-haspopup", "dialog");
    this.addButton.setAttribute("aria-expanded", "false");
    this.addButton.innerHTML =
      `<span class="dock-label" aria-hidden="true">create your own</span>` +
      `<span class="dock-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v10M7 12h10" /></svg></span>`;
    this.addButton.addEventListener("click", () => onAdd?.());
    root.appendChild(this.addButton);

    this.set(value, false);
  }

  makeButton(item) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dock-item";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", item.name);
    b.dataset.flavor = item.id;
    b.innerHTML = `<span class="dock-label" aria-hidden="true"></span><span class="dock-icon"><img alt="" draggable="false" /></span>`;
    b.querySelector(".dock-label").textContent = item.name;
    b.addEventListener("click", () => this.set(this.buttons.indexOf(b)));
    b.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      const count = this.buttons.length;
      const n = (this.value + step + count) % count;
      this.set(n);
      this.buttons[n].focus();
    });
    // new circles go just before the plus
    this.root.insertBefore(b, this.addButton ?? null);
    return b;
  }

  /** Add a circle for a new ice cream; returns its index. */
  add(item) {
    const b = this.makeButton(item);
    b.tabIndex = -1;
    b.setAttribute("aria-checked", "false");
    this.buttons.push(b);
    return this.buttons.length - 1;
  }

  setExpanded(open) {
    this.addButton.setAttribute("aria-expanded", open ? "true" : "false");
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
