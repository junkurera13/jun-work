/**
 * "Create your own": a small panel above the plus circle where you pick a
 * shape, a coating and a flavour, then make it. What you make joins the row
 * like the others (and is remembered in this browser).
 */

export const SHAPES = [
  { id: "bar", name: "bar" },
  { id: "lolly", name: "lolly" },
  { id: "grooved", name: "grooved" },
  { id: "wedge", name: "wedge" },
  { id: "tube", name: "tube" },
];

export const COATS = [
  { id: 0, name: "dark choc" },
  { id: 1, name: "white choc" },
  { id: 2, name: "no coating" },
];

// core ids match uCore in scene.frag.glsl. Rose and passionfruit coconut are
// ices (they crack); the rest are creamy (uncoated, they dent instead)
export const CORES = [
  { id: 0, name: "vanilla" },
  { id: 1, name: "blueberry" },
  { id: 2, name: "strawberry milk" },
  { id: 3, name: "mint choc" },
  { id: 4, name: "rose" },
  { id: 5, name: "passionfruit coconut" },
];

/** A recipe ({ shape, coat, core }) -> a flavor entry like the ones in flavors.js. */
export function makeFlavor(recipe, n) {
  const { shape, coat, core } = recipe;
  const coreName = CORES.find((c) => c.id === core)?.name ?? "vanilla";
  const coated = coat < 2;
  const icy = core >= 4;
  const lolly = shape !== "bar";
  // lolly moulds: 0 pillow, 1 grooved, 2 wedge, 3 mint tube (cookie crust), 4 plain tube
  const mould = { lolly: 0, grooved: 1, wedge: 2, tube: core === 3 ? 3 : 4 }[shape] ?? 0;
  const tube = shape === "tube";
  const coatName = coat === 0 ? "dark choc" : "white choc";
  return {
    id: `custom-${n}`,
    name: `${coreName} ${shape}${coated ? `, ${coatName}` : ""}`,
    faluda: lolly,
    mould,
    custom: { coat, core },
    recipe,
    soft: !coated && !icy,
    shell: coated ? "choc" : icy ? "ice" : "soft",
    // coated: the coating, part melted away to show the flavour inside. Drawn
    // on the bar's shape, whose framing keeps clear of the studio reflection
    // (flat lolly faces mirror it and come out grey)
    swatch: coated
      ? { x: -0.6, y: -2.6, half: 1.6, peel: 0.5, asBar: true }
      : { x: 0, y: shape === "bar" ? -1.2 : 0.4, half: tube ? 1.05 : 1.45 },
    label: `A ${coreName} ice cream you made: a ${shape}${coated ? ` in ${coatName}` : ""}. ${
      coated || icy ? "Tap it to crack it." : "Press it to leave a soft dent."
    }`,
  };
}

const STORE = "jun-work:custom-ice-creams";
const MAX_SAVED = 8;

/** Recipes made in this browser before (newest last). Never throws. */
export function loadRecipes() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) || "[]");
    return Array.isArray(list)
      ? list.filter((r) => SHAPES.some((s) => s.id === r.shape) && COATS.some((c) => c.id === r.coat) && CORES.some((c) => c.id === r.core))
      : [];
  } catch {
    return [];
  }
}

export function saveRecipes(list) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list.slice(-MAX_SAVED)));
  } catch {
    /* private window or storage blocked: it just won't be remembered */
  }
}

export class Maker {
  constructor({ onMake, onToggle }) {
    this.onMake = onMake;
    this.onToggle = onToggle;
    this.recipe = { shape: "lolly", coat: 2, core: 2 };
    this.open = false;

    const el = document.createElement("div");
    el.className = "maker";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "create your own ice cream");
    el.hidden = true;
    el.innerHTML = `<p class="maker-heading">create your own</p>`;
    el.appendChild(this.group("shape", "shape", SHAPES));
    el.appendChild(this.group("coating", "coat", COATS));
    el.appendChild(this.group("flavour", "core", CORES));
    const make = document.createElement("button");
    make.type = "button";
    make.className = "maker-make";
    make.textContent = "make it";
    make.addEventListener("click", () => {
      this.onMake?.({ ...this.recipe });
      this.close();
    });
    el.appendChild(make);
    document.body.appendChild(el);
    this.el = el;

    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close(true);
      }
    });
    document.addEventListener("pointerdown", (e) => {
      if (!this.open) return;
      if (this.el.contains(e.target) || e.target.closest?.(".dock-add")) return;
      this.close();
    });
  }

  group(title, key, options) {
    const g = document.createElement("div");
    g.className = "maker-group";
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", title);
    g.innerHTML = `<span class="maker-title" aria-hidden="true">${title}</span><div class="maker-options"></div>`;
    const row = g.querySelector(".maker-options");
    for (const opt of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "maker-chip";
      b.textContent = opt.name;
      b.setAttribute("aria-pressed", String(this.recipe[key] === opt.id));
      b.addEventListener("click", () => {
        this.recipe[key] = opt.id;
        for (const other of row.children) other.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-pressed", "true");
      });
      row.appendChild(b);
    }
    return g;
  }

  toggle() {
    if (this.open) this.close(true);
    else this.show();
  }

  show() {
    this.open = true;
    this.el.hidden = false;
    // next frame, so the fade-in transition runs
    requestAnimationFrame(() => this.el.classList.add("is-open"));
    this.onToggle?.(true);
    this.el.querySelector('.maker-chip[aria-pressed="true"]')?.focus({ preventScroll: true });
  }

  close(returnFocus = false) {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove("is-open");
    this.onToggle?.(false, returnFocus);
    setTimeout(() => {
      if (!this.open) this.el.hidden = true;
    }, 200);
  }
}
