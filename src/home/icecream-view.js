import { playStep } from "./choices.js";
import { mountCard } from "../card/card.js";
import { hakataFace } from "../card/hakata.js";
import { mountAnvil } from "../anvil/anvil.js";
import { mountTea } from "../tea/tea.js";
import { mountSword } from "../sword/sword.js";

// Clicking the Magic Choc in the PLAY list opens a slideshow on
// the right, on the same yellow. Its first slide is the full ice cream page
// (/icecream/, in a frame); the others are placeholders for now. A widget on
// the right (up arrow, count, down arrow, or the arrow keys) moves between
// them. Choosing ABOUT, PLAY or WORK again closes it. Back/forward work too,
// via the #icecream hash. On phones the right side is too narrow, so the
// link just goes to /icecream/ as usual.

// The slides, in order. Replace the placeholders with real ones later.
// Each can set the page colour while it's on screen (or keeps the yellow).
const YELLOW = "#efff47";
const SLIDES = [
  { kind: "icecream", label: "Magic Choc ice cream", page: YELLOW },
  { kind: "card", label: "Slate card, in Hakata-ori", page: YELLOW },
  { kind: "anvil", label: "Amplified Anvil, ARC Raiders", page: YELLOW },
  { kind: "tea", label: "Sri Lankan green tea", page: YELLOW },
  { kind: "sword", label: "Demon-Destroyer Sword, Black Clover", page: YELLOW },
];

// 7x7 pixel arrows, drawn like CONTACT's
const ARROW_UP = '<rect x="3" y="1" width="1" height="1"/><rect x="2" y="2" width="3" height="1"/><rect x="1" y="3" width="5" height="1"/><rect x="0" y="4" width="7" height="1"/>';
const ARROW_DOWN = '<rect x="0" y="2" width="7" height="1"/><rect x="1" y="3" width="5" height="1"/><rect x="2" y="4" width="3" height="1"/><rect x="3" y="5" width="1" height="1"/>';

const pad = (n) => String(n).padStart(2, "0");

// Sets the page colour (null: back to the yellow), and the browser's.
const themeMeta = document.querySelector('meta[name="theme-color"]');
function setPage(color) {
  const root = document.documentElement;
  if (color && color !== YELLOW) root.style.setProperty("--page", color);
  else root.style.removeProperty("--page");
  themeMeta?.setAttribute("content", color || YELLOW);
}

export function setupIcecreamView(stage) {
  const link = stage.querySelector(".live-choc");
  if (!link) return;
  const lists = stage.querySelectorAll("[data-list]");
  const wide = matchMedia("(min-width: 641px)");

  let view; // the open slideshow, or null
  let slides; // its slide area
  let count; // its "01 / 04"
  let index = 0;
  let unmount = null; // stops the card slide's drawing

  // The whole ice cream page is scaled down so its ice cream is the same
  // size, and at the same height, as the Magic Choc in the PLAY list.
  // Measured: its chocolate body is 1/1.508 of the frame's height for every
  // list item height (--item-h), and its centre sits 2.85% of an item height
  // below the list's.
  // Reads a CSS length (like var(--item-h)) in pixels.
  const measure = (value) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;height:${value}`;
    stage.append(probe);
    const px = probe.offsetHeight;
    probe.remove();
    return px;
  };
  const fit = () => {
    const frame = view?.querySelector("iframe");
    if (!frame) return;
    const itemH = measure("var(--item-h)");
    // the list sits its items this far above the middle; match it
    const up = measure("var(--play-up, 0px)");
    // The scale it needs: below 1 the whole page shrinks; above 1 it would
    // spill past the edges, so the page stays full size and zooms its own
    // camera in by the rest instead.
    const want = (1.508 * itemH) / stage.clientHeight;
    const k = Math.min(want, 1);
    const zoom = String(want / k);
    const lift = 0.0285 * itemH + up;
    frame.style.transform = `scale(${k})`;
    // The frame itself stays put (so its painting stays centred and whole);
    // the page raises just the ice cream by this much, in its own pixels.
    const raise = String(lift / k);
    // Where the ice cream's top and bottom land, in the page's own pixels,
    // so it can space the weather words and the flavours evenly around it.
    // (Measured in the frame: from the chocolate's top at 3.7% of an item's
    // height to the stick's end at 95.8%.)
    const H = stage.clientHeight;
    const itemTop = H / 2 - up - itemH / 2;
    const toFrame = (y) => Math.round((y - H / 2) / k + H / 2);
    const iceTop = String(toFrame(itemTop + 0.037 * itemH));
    const iceBottom = String(toFrame(itemTop + 0.958 * itemH));
    if (frame.dataset.zoom !== zoom || frame.dataset.raise !== raise || frame.dataset.iceTop !== iceTop || frame.dataset.iceBottom !== iceBottom) {
      frame.dataset.zoom = zoom;
      frame.dataset.raise = raise;
      frame.dataset.iceTop = iceTop;
      frame.dataset.iceBottom = iceBottom;
      frame.contentWindow?.dispatchEvent(new Event("resize"));
    }
  };
  addEventListener("resize", fit);

  const makeFrame = () => {
    const frame = document.createElement("iframe");
    // the ice cream page takes on this page's yellow
    frame.dataset.page = SLIDES[0].page;
    frame.src = "/icecream/";
    frame.title = "Magic Choc ice cream";
    frame.allow = "autoplay";
    frame.addEventListener("load", () => frame.classList.add("is-loaded"), { once: true });
    return frame;
  };

  // Show slide i (wrapping round). The ice cream frame only exists while its
  // slide is showing, so its sound stops when you move on.
  const show = (i, { focus = false } = {}) => {
    index = (i + SLIDES.length) % SLIDES.length;
    const slide = SLIDES[index];
    unmount?.();
    unmount = null;
    let el;
    if (slide.kind === "icecream") {
      el = makeFrame();
    } else if (slide.kind === "card") {
      el = document.createElement("div");
      el.className = "slide-card";
      unmount = mountCard(el, { face: hakataFace() }).destroy;
    } else if (slide.kind === "anvil") {
      el = document.createElement("div");
      el.className = "slide-anvil";
      unmount = mountAnvil(el).destroy;
    } else if (slide.kind === "tea") {
      el = document.createElement("div");
      el.className = "slide-tea";
      el.style.cssText = "position:absolute;inset:0";
      unmount = mountTea(el).destroy;
    } else if (slide.kind === "sword") {
      el = document.createElement("div");
      el.className = "slide-sword";
      unmount = mountSword(el).destroy;
    } else {
      el = document.createElement("div");
      el.className = "slide-placeholder";
      el.innerHTML = `<span>${pad(index + 1)}</span><span>PLACEHOLDER</span>`;
    }
    setPage(slide.page);
    el.classList.add("slide");
    el.setAttribute("aria-label", slide.label);
    slides.replaceChildren(el);
    count.textContent = `${pad(index + 1)} / ${pad(SLIDES.length)}`;
    fit();
    if (focus && el.tagName === "IFRAME") el.focus();
  };

  const build = () => {
    view = document.createElement("section");
    view.className = "icecream-view";
    view.setAttribute("aria-label", "Play slideshow");
    view.setAttribute("aria-roledescription", "carousel");
    slides = document.createElement("div");
    slides.className = "slides";
    slides.setAttribute("aria-live", "polite");
    view.append(slides);
    stage.insertBefore(view, nav);
  };

  // The arrows and count stay at the right edge whenever PLAY is showing,
  // with the slideshow open or not (the CSS shows and hides them). With it
  // closed the list's Magic Choc counts as slide 1, so an arrow opens the
  // slideshow on the slide before or after it.
  const nav = document.createElement("nav");
  nav.className = "slide-nav";
  nav.setAttribute("aria-label", "Slides");
  nav.innerHTML = `
    <button class="box icon" type="button" data-step="-1" aria-label="Previous slide"><svg viewBox="0 0 7 7" aria-hidden="true">${ARROW_UP}</svg></button>
    <span class="slide-count"></span>
    <button class="box icon" type="button" data-step="1" aria-label="Next slide"><svg viewBox="0 0 7 7" aria-hidden="true">${ARROW_DOWN}</svg></button>`;
  count = nav.querySelector(".slide-count");
  const resetCount = () => {
    index = 0;
    count.textContent = `${pad(1)} / ${pad(SLIDES.length)}`;
  };
  resetCount();
  stage.append(nav);
  nav.addEventListener("click", (e) => {
    const step = Number(e.target.closest("[data-step]")?.dataset.step);
    if (step) go(step);
  });

  const open = (start = 0) => {
    if (!view) {
      build();
      show(start, { focus: true });
    }
    for (const list of lists) list.hidden = true;
  };

  // Closing removes everything, which stops the ice cream's sound and frees
  // its WebGL; reopening starts again at the ice cream.
  const removeView = () => {
    setPage(null);
    unmount?.();
    unmount = null;
    view?.remove();
    view = null;
    resetCount();
  };

  const close = () => {
    if (!view) return;
    removeView();
    // show whichever list the menu has selected
    const word = document.querySelector('.choice[aria-pressed="true"]')?.getAttribute("aria-label");
    for (const list of lists) list.hidden = list.dataset.list !== word;
  };

  const sync = () => (location.hash === "#icecream" && wide.matches ? open() : close());

  link.addEventListener("click", (e) => {
    if (!wide.matches || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (location.hash !== "#icecream") history.pushState(null, "", "#icecream");
    open();
  });

  // Step to the slide before or after. Slide 1 is the ice cream as it sits
  // in the list (still, until you click it), so stepping back onto it
  // closes the slideshow rather than opening the full ice cream.
  function go(step) {
    playStep(step);
    const next = (index + step + SLIDES.length) % SLIDES.length;
    if (next === 0) {
      if (location.hash === "#icecream") history.pushState(null, "", location.pathname);
      close();
      return;
    }
    if (view) return show(next);
    if (location.hash !== "#icecream") history.pushState(null, "", "#icecream");
    open(next);
  }

  // arrow keys move between slides (when focus isn't inside the ice cream)
  addEventListener("keydown", (e) => {
    if (!view || e.altKey || e.metaKey || e.ctrlKey) return;
    const step = { ArrowUp: -1, ArrowDown: 1, PageUp: -1, PageDown: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    go(step);
  });

  // ABOUT / PLAY / WORK close it (their own click handler picks the list)
  for (const choice of document.querySelectorAll(".choice")) {
    choice.addEventListener("click", () => {
      if (location.hash === "#icecream") history.pushState(null, "", location.pathname);
      removeView();
    });
  }

  addEventListener("popstate", sync);
  wide.addEventListener("change", sync);
  sync();
}
