/**
 * "Create your own": a modal where you build an ice cream from a shape, a
 * coating and a flavour, and watch it take shape in a live preview, turning
 * slowly, as you choose. What you make joins the picker row like the others
 * (and is remembered in this browser).
 */

// little outline silhouettes for the shape chips
const SHAPE_ICONS = {
  bar: `<path d="M12 3c4 0 6 3 6 8v7c0 3-2 4-6 4s-6-1-6-4v-7c0-5 2-8 6-8Z"/><path d="M12 22v6"/>`,
  lolly: `<path d="M6 9c0-4 2.5-6 6-6s6 2 6 6v12H6Z"/><path d="M12 21v7"/>`,
  grooved: `<path d="M6 6c0-2 1-3 3-3h6c2 0 3 1 3 3v15H6Z"/><path d="M10 6v12M14 6v12"/><path d="M12 21v7"/>`,
  wedge: `<path d="M9.5 3h5l4 18h-13Z"/><path d="M12 21v7"/>`,
  tube: `<path d="M9 5a3 2 0 0 1 6 0v16H9Z"/><path d="M12 21v7"/>`,
};

export const SHAPES = [
  { id: "bar", name: "bar" },
  { id: "lolly", name: "lolly" },
  { id: "grooved", name: "grooved" },
  { id: "wedge", name: "wedge" },
  { id: "tube", name: "tube" },
];

// Coatings: chocolate shells in different colours (sRGB). sss is how much
// light gets through; gloss multiplies roughness (lower is shinier).
export const COATS = [
  { id: "dark", name: "dark choc", col: [0.275, 0.158, 0.098], melt: [0.48, 0.3, 0.18], sss: 0.05, sssCol: [0.6, 0.3, 0.14], gloss: 1 },
  { id: "milk", name: "milk choc", col: [0.45, 0.28, 0.17], melt: [0.6, 0.4, 0.26], sss: 0.1, sssCol: [0.75, 0.45, 0.25], gloss: 1 },
  { id: "white", name: "white choc", col: [0.95, 0.9, 0.77], melt: [0.97, 0.91, 0.76], sss: 0.3, sssCol: [1, 0.9, 0.7], gloss: 1 },
  { id: "ruby", name: "ruby choc", col: [0.84, 0.43, 0.5], melt: [0.92, 0.58, 0.62], sss: 0.25, sssCol: [1, 0.55, 0.6], gloss: 1 },
  { id: "caramel", name: "caramel", col: [0.72, 0.44, 0.17], melt: [0.84, 0.58, 0.3], sss: 0.3, sssCol: [1, 0.7, 0.35], gloss: 0.8 },
  { id: "matcha", name: "matcha choc", col: [0.55, 0.66, 0.36], melt: [0.66, 0.75, 0.47], sss: 0.2, sssCol: [0.8, 0.95, 0.6], gloss: 1.1 },
  { id: "none", name: "no coating" },
];

// Flavours: ids match uCore in scene.frag.glsl. Icy ones crack when bare;
// creamy ones dent. dot is the chip's colour swatch.
export const CORES = [
  { id: 0, name: "vanilla", dot: "#f1dca0" },
  { id: 6, name: "chocolate", dot: "#6b4128" },
  { id: 9, name: "cookies & cream", dot: "linear-gradient(135deg, #f3efe7 55%, #2a2321 56%)" },
  { id: 2, name: "strawberry milk", dot: "#eb9e9a" },
  { id: 1, name: "blueberry yoghurt", dot: "linear-gradient(135deg, #f2eef2 50%, #8a4f8c 51%)" },
  { id: 3, name: "mint choc chip", dot: "#cfe2a8" },
  { id: 7, name: "matcha", dot: "#a7bb73" },
  { id: 8, name: "mango sorbet", dot: "#f7a432", icy: true },
  { id: 4, name: "rose", dot: "#e0396a", icy: true },
  { id: 5, name: "passionfruit coconut", dot: "linear-gradient(180deg, #f6b71f 45%, #f6f4ee 46%)", icy: true },
];

const coatOf = (id) => COATS.find((c) => c.id === id) ?? COATS[0];
const coreOf = (id) => CORES.find((c) => c.id === id) ?? CORES[0];
const toCss = (rgb) => `rgb(${rgb.map((v) => Math.round(v * 255)).join(",")})`;

/** A short name for a recipe, e.g. "mango sorbet lolly in ruby choc". */
export function recipeName({ shape, coat, core }) {
  const c = coatOf(coat);
  return `${coreOf(core).name} ${shape}${c.col ? ` in ${c.name}` : ""}`;
}

/** A recipe ({ shape, coat, core }) -> a flavor entry like the ones in flavors.js. */
export function makeFlavor(recipe, n) {
  const { shape, core } = recipe;
  const coat = coatOf(recipe.coat);
  const coated = !!coat.col;
  const icy = !!coreOf(core).icy;
  const lolly = shape !== "bar";
  // lolly moulds: 0 pillow, 1 grooved, 2 wedge, 3 mint tube (cookie crust), 4 plain tube
  const mould = { lolly: 0, grooved: 1, wedge: 2, tube: core === 3 ? 3 : 4 }[shape] ?? 0;
  const tube = shape === "tube";
  const name = recipeName(recipe);
  return {
    id: `custom-${n}`,
    name,
    faluda: lolly,
    mould,
    custom: { coat: coated ? coat : null, core },
    recipe,
    soft: !coated && !icy,
    shell: coated ? "choc" : icy ? "ice" : "soft",
    // coated: the coating, part melted away to show the flavour inside. Drawn
    // on the bar's shape, whose framing keeps clear of the studio reflection
    // (flat lolly faces mirror it and come out grey)
    swatch: coated
      ? { x: -0.6, y: -2.6, half: 1.6, peel: 0.5, asBar: true }
      : { x: 0, y: shape === "bar" ? -1.2 : 0.4, half: tube ? 1.05 : 1.45 },
    label: `${name}, an ice cream you made. ${coated || icy ? "Tap it to crack it." : "Press it to leave a soft dent."}`,
  };
}

const STORE = "jun-work:custom-ice-creams";
const MAX_SAVED = 8;
// the first version stored the coating as a number
const OLD_COATS = { 0: "dark", 1: "white", 2: "none" };

/** Recipes made in this browser before (newest last). Never throws. */
export function loadRecipes() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE) || "[]");
    if (!Array.isArray(list)) return [];
    return list
      .map((r) => ({ ...r, coat: typeof r.coat === "number" ? OLD_COATS[r.coat] : r.coat }))
      .filter((r) => SHAPES.some((s) => s.id === r.shape) && COATS.some((c) => c.id === r.coat) && CORES.some((c) => c.id === r.core));
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

/**
 * The modal. renderPreview(flavor, { yaw, w, h }) draws the ice cream and
 * returns a canvas; onMake(recipe) adds it; onToggle(open) lets the page
 * pause its own scene underneath.
 */
export class Maker {
  constructor({ renderPreview, onMake, onToggle, restYaw = 0 }) {
    this.renderPreview = renderPreview;
    this.onMake = onMake;
    this.onToggle = onToggle;
    this.restYaw = restYaw;
    this.recipe = { shape: "lolly", coat: "ruby", core: 8 };
    this.open = false;
    this.lastDraw = 0;
    this.drawEvery = 70; // ms between preview frames (adapts to how long one takes)

    const back = document.createElement("div");
    back.className = "maker-backdrop";
    back.hidden = true;
    back.innerHTML = `
      <div class="maker" role="dialog" aria-modal="true" aria-labelledby="maker-title">
        <div class="maker-stage">
          <canvas class="maker-preview" aria-hidden="true"></canvas>
          <p class="maker-name" aria-live="polite"></p>
        </div>
        <div class="maker-controls">
          <div class="maker-head">
            <h2 class="maker-heading" id="maker-title">create your own</h2>
            <button type="button" class="maker-close" aria-label="close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button>
          </div>
          <div class="maker-groups"></div>
          <div class="maker-actions">
            <button type="button" class="maker-cancel">cancel</button>
            <button type="button" class="maker-make">make it</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(back);
    this.back = back;
    this.dialog = back.querySelector(".maker");
    this.canvas = back.querySelector(".maker-preview");
    this.nameEl = back.querySelector(".maker-name");

    const groups = back.querySelector(".maker-groups");
    groups.appendChild(
      this.group("shape", "shape", SHAPES, (o) => `<svg class="maker-shape" viewBox="0 0 24 30" aria-hidden="true">${SHAPE_ICONS[o.id]}</svg>`),
    );
    groups.appendChild(
      this.group("coating", "coat", COATS, (o) =>
        o.col ? `<span class="maker-dot" style="background:${toCss(o.col)}"></span>` : `<span class="maker-dot maker-dot--none"></span>`,
      ),
    );
    groups.appendChild(this.group("flavour", "core", CORES, (o) => `<span class="maker-dot" style="background:${o.dot}"></span>`));

    back.querySelector(".maker-make").addEventListener("click", () => {
      this.onMake?.({ ...this.recipe });
      this.close(false);
    });
    back.querySelector(".maker-cancel").addEventListener("click", () => this.close(true));
    back.querySelector(".maker-close").addEventListener("click", () => this.close(true));
    back.addEventListener("pointerdown", (e) => {
      if (e.target === back) this.close(true);
    });
    back.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close(true);
      } else if (e.key === "Tab") {
        // keep focus inside the modal
        const items = [...this.dialog.querySelectorAll("button")];
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    this.tick = this.tick.bind(this);
    this.update();
  }

  group(title, key, options, lead) {
    const g = document.createElement("div");
    g.className = "maker-group";
    g.setAttribute("role", "group");
    g.setAttribute("aria-label", title);
    g.innerHTML = `<span class="maker-title" aria-hidden="true">${title}</span><div class="maker-options"></div>`;
    const row = g.querySelector(".maker-options");
    for (const opt of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `maker-chip maker-chip--${key}`;
      b.innerHTML = `${lead(opt)}<span>${opt.name}</span>`;
      b.setAttribute("aria-pressed", String(this.recipe[key] === opt.id));
      b.addEventListener("click", () => {
        this.recipe[key] = opt.id;
        for (const other of row.children) other.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-pressed", "true");
        this.update();
      });
      row.appendChild(b);
    }
    return g;
  }

  update() {
    this.nameEl.textContent = recipeName(this.recipe);
    this.draft = makeFlavor(this.recipe, "draft");
    this.lastDraw = 0; // redraw on the next tick
  }

  draw(now) {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(2, Math.round(c.clientWidth * dpr));
    const h = Math.max(2, Math.round(c.clientHeight * dpr));
    // a slow turn, so you see it from every side
    const yaw = this.restYaw + (now - this.openedAt) * 0.00045;
    const t0 = performance.now();
    const img = this.renderPreview?.(this.draft, { yaw, w, h });
    const took = performance.now() - t0;
    // slow the turntable down on machines where a frame is expensive
    this.drawEvery = Math.min(200, Math.max(50, took * 2.5));
    if (!img) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = c.getContext("2d");
    g.clearRect(0, 0, w, h);
    g.drawImage(img, 0, 0);
  }

  tick(now) {
    if (!this.open) return;
    requestAnimationFrame(this.tick);
    if (now - this.lastDraw < this.drawEvery) return;
    this.lastDraw = now;
    this.draw(now);
  }

  toggle() {
    if (this.open) this.close(true);
    else this.show();
  }

  show() {
    this.open = true;
    this.returnFocusTo = document.activeElement;
    this.back.hidden = false;
    this.openedAt = performance.now();
    this.lastDraw = 0;
    this.onToggle?.(true);
    // next frame, so the fade-in transition runs
    requestAnimationFrame(() => {
      this.back.classList.add("is-open");
      requestAnimationFrame(this.tick);
    });
    this.dialog.querySelector('.maker-chip[aria-pressed="true"]')?.focus({ preventScroll: true });
  }

  close(returnFocus = true) {
    if (!this.open) return;
    this.open = false;
    this.back.classList.remove("is-open");
    this.onToggle?.(false);
    if (returnFocus) this.returnFocusTo?.focus?.({ preventScroll: true });
    setTimeout(() => {
      if (!this.open) this.back.hidden = true;
    }, 220);
  }
}
