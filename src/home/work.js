// WORK: black interactive spatial canvas on the right of the menu.
// Projects live in distinct Figma-style spatial sections ([data-project]) on
// the infinite board (side by side; stacked top to bottom on phones). Drag
// empty canvas (or scroll) to pan, pinch (trackpad or two fingers) / +/- to
// zoom, click bottom-left project chips to jump between projects, click any
// artifact card to focus it cleanly, and use top-right expand for full-page view.

import { mountGizmo } from "../gizmo/gizmo.js";
import { setupOddbox } from "../oddbox/oddbox.js";
import { setupSlate } from "../slate/slate.js";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.2;
const BASE_GRID = 28;
const ZOOM_STEP = 1.25;
// On phones (and upright tablets) the projects stack vertically, this far apart (board pixels)
const STACK_GAP = 160;
// (the same query as the phone layout in layout.css)
const narrowMQ = matchMedia("(max-width: 640px), (orientation: portrait) and (max-width: 1024px)");

export function setupWork() {
  const viewport = document.querySelector(".work-canvas");
  if (!viewport) return;

  const board = viewport.querySelector(".work-board");
  const grid = viewport.querySelector(".work-grid");
  const gizmoHost = viewport.querySelector(".work-gizmo");
  const fsBtn = viewport.querySelector(".work-fullscreen");
  const projNav = viewport.querySelector(".work-projects");
  const zoomGroup = viewport.querySelector(".work-zoom");
  const zoomReadout = viewport.querySelector(".work-zoom-readout");
  const sections = [...viewport.querySelectorAll(".work-section[data-project]")];
  const cards = [...viewport.querySelectorAll(".work-card[data-focus]")];

  if (gizmoHost) mountGizmo(gizmoHost);
  setupOddbox();
  setupSlate();

  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let vx = 0;
  let vy = 0;

  let targetX = null;
  let targetY = null;
  let targetZoom = null;

  let panning = false;
  let pointerId = null;
  let downCard = null;
  let lastX = 0;
  let lastY = 0;
  let panMoved = 0;
  let raf = 0;
  let lastNow = performance.now();

  let activeProject = sections.some((s) => s.dataset.project === "slate")
    ? "slate"
    : (sections[0]?.dataset.project ?? null);
  let focusedCard = null;
  let hasInitialFit = false;
  let viewW = 0;
  let viewH = 0;
  let layoutMode = null; // "wide" | "narrow", once laid out
  // two-finger pinch: the fingers down, and the gesture's starting state
  const touches = new Map();
  let pinch = null;
  let lastZoomText = "";
  let lastGridStep = -1;
  let movingCanvas = false;
  let settleTimer = 0;

  // Pre-cache each section's static board coordinates & videos to avoid any
  // getBoundingClientRect() layout thrashing during pan/zoom frames.
  const sectionMeta = sections.map((sec) => ({
    el: sec,
    id: sec.dataset.project,
    x: parseFloat(sec.style.getPropertyValue("--x")) || 0,
    y: parseFloat(sec.style.getPropertyValue("--y")) || 0,
    hw: (sec.offsetWidth || 1400) / 2,
    hh: 460,
    homeX: parseFloat(sec.style.getPropertyValue("--x")) || 0,
    homeY: parseFloat(sec.style.getPropertyValue("--y")) || 0,
    videos: [...sec.querySelectorAll("video")],
    visible: null,
  }));

  // The sections sit side by side, as placed in index.html. On phones that
  // row is far wider than the screen, so they stack top to bottom instead
  // (needs the canvas shown, to measure them).
  // Stacked, a project shows about a quarter size, so its title, tags and
  // brief would be a few pixels tall: each header is scaled up (--head-zoom)
  // to read at its normal size when the project fills the width.
  let layoutW = 0;
  const layoutSections = (narrow) => {
    viewport.classList.toggle("is-stacked", narrow);
    layoutW = viewW;
    for (const s of sectionMeta) {
      const fitZ = (viewW - 24) / (s.el.offsetWidth || 2 * s.hw);
      if (narrow && fitZ > 0 && fitZ < 1) s.el.style.setProperty("--head-zoom", (1 / fitZ).toFixed(3));
      else s.el.style.removeProperty("--head-zoom");
    }
    let y = 0;
    for (const s of sectionMeta) {
      if (narrow) {
        const h = s.el.offsetHeight || 2 * s.hh;
        s.x = 0;
        s.y = y + h / 2;
        y += h + STACK_GAP;
      } else {
        s.x = s.homeX;
        s.y = s.homeY;
      }
      s.el.style.setProperty("--x", `${s.x}px`);
      s.el.style.setProperty("--y", `${s.y}px`);
      if (s.el.offsetHeight > 0) s.hh = s.el.offsetHeight / 2;
    }
    if (narrow) {
      // centre the stack on the board's origin, like the row
      const mid = (y - STACK_GAP) / 2;
      for (const s of sectionMeta) {
        s.y -= mid;
        s.el.style.setProperty("--y", `${s.y}px`);
      }
    }
  };

  // Zoom can go far enough out to show a whole project, even on a phone.
  const minZoom = () => Math.min(MIN_ZOOM, viewW > 0 ? (viewW - 24) / 1500 : MIN_ZOOM);
  const clampZoom = (z) => Math.max(minZoom(), Math.min(MAX_ZOOM, z));
  const isNarrow = () => narrowMQ.matches;

  const syncVisibility = () => {
    if (viewport.hidden || viewW <= 0 || viewH <= 0) {
      for (const s of sectionMeta) {
        if (s.visible !== false) {
          s.visible = false;
          s.el.classList.add("is-offscreen");
          for (const v of s.videos) v.pause();
        }
      }
      return;
    }
    // Strictly on-screen culling so adjacent off-screen rooms never wake extra H.264 decoders
    const minX = (-viewW / 2 - panX) / zoom;
    const maxX = (viewW / 2 - panX) / zoom;
    const minY = (-viewH / 2 - panY) / zoom;
    const maxY = (viewH / 2 - panY) / zoom;
    for (const s of sectionMeta) {
      const onScreen = s.x + s.hw > minX && s.x - s.hw < maxX && s.y + s.hh > minY && s.y - s.hh < maxY;
      if (onScreen !== s.visible) {
        s.visible = onScreen;
        s.el.classList.toggle("is-offscreen", !onScreen);
      }
      for (const v of s.videos) {
        if (onScreen && !movingCanvas) {
          if (v.paused) v.play().catch(() => {});
        } else if (!v.paused) {
          v.pause();
        }
      }
    }
  };

  // Pause heavy video decoding while actively dragging/wheeling/gliding; resume
  // cleanly once motion settles so pan & zoom stay locked at 60-120fps.
  const markMoving = () => {
    if (!movingCanvas) {
      movingCanvas = true;
      viewport.classList.add("is-moving");
      syncVisibility();
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (panning || targetX !== null || Math.abs(vx) > 2 || Math.abs(vy) > 2) {
        markMoving();
        return;
      }
      movingCanvas = false;
      viewport.classList.remove("is-moving");
      syncVisibility();
    }, 140);
  };

  // Build bottom-left project jump pills from all [data-project] sections
  const projBtns = new Map();
  if (projNav) {
    for (const sec of sections) {
      const id = sec.dataset.project;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "work-btn work-proj-btn";
      btn.dataset.targetProject = id;
      btn.innerHTML = `<span class="work-proj-num">${sec.dataset.num || ""}</span><span>${sec.dataset.label || id}</span>`;
      projNav.append(btn);
      projBtns.set(id, btn);
    }
  }

  const syncProjectNav = () => {
    for (const [id, btn] of projBtns) {
      btn.setAttribute("aria-current", id === activeProject ? "true" : "false");
    }
    // On phones the chips scroll sideways: keep the current one in view
    const btn = projBtns.get(activeProject);
    if (btn && projNav && projNav.scrollWidth > projNav.clientWidth) {
      const pad = 12;
      const left = btn.offsetLeft - pad;
      const right = btn.offsetLeft + btn.offsetWidth + pad - projNav.clientWidth;
      if (projNav.scrollLeft > left) projNav.scrollTo({ left, behavior: "smooth" });
      else if (projNav.scrollLeft < right) projNav.scrollTo({ left: right, behavior: "smooth" });
    }
  };

  const clearFocus = () => {
    if (!focusedCard) return;
    focusedCard.classList.remove("is-focused");
    focusedCard = null;
  };

  // Board-space bounds of an element inside .work-board (independent of current transform)
  const boardRectOf = (el) => {
    const vr = viewport.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (vr.width === 0 || er.width === 0 || zoom === 0) return null;
    const cx = vr.left + vr.width / 2;
    const cy = vr.top + vr.height / 2;
    return {
      x: (er.left + er.width / 2 - cx - panX) / zoom,
      y: (er.top + er.height / 2 - cy - panY) / zoom,
      w: er.width / zoom,
      h: er.height / zoom,
    };
  };

  const updateNearestProject = () => {
    if (sectionMeta.length <= 1) return;
    const viewCenterX = -panX / zoom;
    const viewCenterY = -panY / zoom;
    let best = activeProject;
    let bestD = Infinity;
    for (const s of sectionMeta) {
      const d = Math.hypot(s.x - viewCenterX, s.y - viewCenterY);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    if (best !== activeProject) {
      activeProject = best;
      syncProjectNav();
    }
  };

  const apply = () => {
    if (board) {
      board.style.transform = `translate3d(${panX.toFixed(2)}px, ${panY.toFixed(2)}px, 0) scale(${zoom.toFixed(4)})`;
    }
    if (grid && viewW > 0) {
      const step = BASE_GRID * zoom;
      if (Math.abs(step - lastGridStep) > 0.05) {
        lastGridStep = step;
        grid.style.backgroundSize = `${step.toFixed(2)}px ${step.toFixed(2)}px`;
      }
      // Pure GPU-composited modulo translate3d (zero background-position repaints!)
      const ox = (((viewW / 2 + panX) % step) + step) % step;
      const oy = (((viewH / 2 + panY) % step) + step) % step;
      grid.style.transform = `translate3d(${ox.toFixed(2)}px, ${oy.toFixed(2)}px, 0)`;
    }
    if (zoomReadout) {
      const nextText = `${Math.round(zoom * 100)}%`;
      if (nextText !== lastZoomText) {
        lastZoomText = nextText;
        zoomReadout.textContent = nextText;
      }
    }
    syncVisibility();
  };

  const kick = () => {
    markMoving();
    if (raf) return;
    lastNow = performance.now();
    raf = requestAnimationFrame(step);
  };

  function step(now) {
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    let moving = false;

    if (targetX !== null) {
      const k = 1 - Math.exp(-11 * dt);
      panX += (targetX - panX) * k;
      panY += (targetY - panY) * k;
      zoom += (targetZoom - zoom) * k;
      if (Math.hypot(targetX - panX, targetY - panY) < 0.3 && Math.abs(targetZoom - zoom) < 0.002) {
        panX = targetX;
        panY = targetY;
        zoom = targetZoom;
        targetX = targetY = targetZoom = null;
      } else {
        moving = true;
      }
    } else if (!panning && (Math.abs(vx) > 2 || Math.abs(vy) > 2)) {
      panX += vx * dt;
      panY += vy * dt;
      const damp = Math.exp(-7.5 * dt);
      vx *= damp;
      vy *= damp;
      moving = true;
    } else {
      vx = vy = 0;
    }

    apply();
    updateNearestProject();
    if (moving) raf = requestAnimationFrame(step);
    else raf = 0;
  }

  // Smoothly frame any board element (a project section or a focused artifact card)
  const fitElement = (el, { padX = 56, padTop = 62, padBottom = 68, maxZ = 1.05, instant = false } = {}) => {
    const vr = viewport.getBoundingClientRect();
    if (vr.width <= 0 || vr.height <= 0 || !el) return;
    const br = boardRectOf(el);
    if (!br) return;

    const availW = Math.max(120, vr.width - padX * 2);
    const availH = Math.max(120, vr.height - padTop - padBottom);
    const fitZ = Math.max(minZoom(), Math.min(maxZ, availW / br.w, availH / br.h));
    const offsetY = (padTop - padBottom) / 2;
    const tx = -br.x * fitZ;
    const ty = -br.y * fitZ + offsetY;

    vx = vy = 0;
    if (instant) {
      panX = tx;
      panY = ty;
      zoom = fitZ;
      targetX = targetY = targetZoom = null;
      apply();
    } else {
      targetX = tx;
      targetY = ty;
      targetZoom = fitZ;
      kick();
    }
  };

  const fitProject = (projectId = activeProject, instant = false) => {
    const sec = sections.find((s) => s.dataset.project === projectId) ?? sections[0];
    if (!sec) return;
    clearFocus();
    activeProject = sec.dataset.project;
    syncProjectNav();
    // (on phones: fit the width and leave the neighbours peeking above and
    // below, as there's height to spare)
    const pads = isNarrow() ? { padX: 12, padTop: 60, padBottom: 60 } : { padX: 46, padTop: 64, padBottom: 88 };
    fitElement(sec, { ...pads, maxZ: 1.02, instant });
  };

  const fitCard = (card) =>
    fitElement(card, isNarrow() ? { padX: 16, padTop: 60, padBottom: 64, maxZ: 1.75 } : { padX: 64, padTop: 68, padBottom: 92, maxZ: 1.75 });

  const toggleFocusCard = (card) => {
    if (focusedCard === card) {
      fitProject(activeProject);
      return;
    }
    clearFocus();
    focusedCard = card;
    card.classList.add("is-focused");
    fitCard(card);
  };

  const animateZoom = (nextZoom) => {
    clearFocus();
    const curZoom = targetZoom ?? zoom;
    const curX = targetX ?? panX;
    const curY = targetY ?? panY;
    const clamped = clampZoom(nextZoom);
    const ratio = clamped / curZoom;
    targetZoom = clamped;
    targetX = curX * ratio;
    targetY = curY * ratio;
    vx = vy = 0;
    kick();
  };

  const setFullscreen = (on) => {
    viewport.classList.toggle("is-fullscreen", on);
    fsBtn?.setAttribute("aria-pressed", String(on));
    fsBtn?.setAttribute("aria-label", on ? "Exit fullscreen canvas" : "Expand canvas fullscreen");
    requestAnimationFrame(() => {
      if (focusedCard) fitCard(focusedCard);
      else fitProject(activeProject);
    });
  };

  // Prevent canvas pan/recenter when clicking overlay controls or external project links
  const stopControl = (e) => e.stopPropagation();
  for (const ctrl of [fsBtn, projNav, zoomGroup, ...viewport.querySelectorAll(".work-site-link")]) {
    ctrl?.addEventListener("pointerdown", stopControl);
    ctrl?.addEventListener("dblclick", stopControl);
  }

  fsBtn?.addEventListener("click", () => {
    setFullscreen(!viewport.classList.contains("is-fullscreen"));
  });

  projNav?.addEventListener("click", (e) => {
    const id = e.target.closest("[data-target-project]")?.dataset.targetProject;
    if (id) fitProject(id);
  });

  zoomGroup?.addEventListener("click", (e) => {
    const action = e.target.closest("[data-zoom]")?.dataset.zoom;
    if (action === "in") animateZoom((targetZoom ?? zoom) * ZOOM_STEP);
    else if (action === "out") animateZoom((targetZoom ?? zoom) / ZOOM_STEP);
    else if (action === "reset") fitProject(activeProject);
  });

  // Keyboard activation for focused cards (mouse/touch taps are handled in endPan)
  for (const card of cards) {
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleFocusCard(card);
      }
    });
  }

  // Keyboard shortcuts while WORK canvas is visible
  addEventListener("keydown", (e) => {
    if (viewport.hidden || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === "Escape") {
      if (focusedCard) fitProject(activeProject);
      else if (viewport.classList.contains("is-fullscreen")) setFullscreen(false);
    } else if (e.key === "+" || e.key === "=") {
      animateZoom((targetZoom ?? zoom) * ZOOM_STEP);
    } else if (e.key === "-") {
      animateZoom((targetZoom ?? zoom) / ZOOM_STEP);
    } else if (e.key === "0") {
      fitProject(activeProject);
    }
  });

  // Centre of the viewport, for zooming about a point
  const viewCentre = () => {
    const r = viewport.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const startPinch = () => {
    const [a, b] = [...touches.values()];
    const c = viewCentre();
    pinch = {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      // the board point under the fingers' midpoint stays under it
      bx: ((a.x + b.x) / 2 - c.x - panX) / zoom,
      by: ((a.y + b.y) / 2 - c.y - panY) / zoom,
      zoom,
    };
    // a pinch is never a tap on a card, and not a pan
    panning = false;
    pointerId = null;
    downCard = null;
    vx = vy = 0;
    targetX = targetY = targetZoom = null;
    clearFocus();
    markMoving();
  };
  const movePinch = () => {
    const [a, b] = [...touches.values()];
    const c = viewCentre();
    zoom = clampZoom((pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist);
    panX = (a.x + b.x) / 2 - c.x - pinch.bx * zoom;
    panY = (a.y + b.y) / 2 - c.y - pinch.by * zoom;
    markMoving();
    apply();
    updateNearestProject();
  };

  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.pointerType === "touch") {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      viewport.setPointerCapture?.(e.pointerId);
      if (touches.size === 2) {
        startPinch();
        return;
      }
      if (touches.size > 2) return;
    }
    panning = true;
    pointerId = e.pointerId;
    downCard = e.target.closest(".work-card[data-focus]");
    lastX = e.clientX;
    lastY = e.clientY;
    panMoved = 0;
    vx = vy = 0;
    targetX = targetY = targetZoom = null;
    viewport.setPointerCapture?.(e.pointerId);
    viewport.classList.add("is-panning");
  });

  viewport.addEventListener("pointermove", (e) => {
    if (touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size >= 2) {
        movePinch();
        return;
      }
    }
    if (!panning || e.pointerId !== pointerId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    panMoved += Math.hypot(dx, dy);
    if (panMoved > 6) {
      downCard = null;
      clearFocus();
      markMoving();
    }
    panX += dx;
    panY += dy;
    vx = Math.max(-1800, Math.min(1800, dx * 28));
    vy = Math.max(-1800, Math.min(1800, dy * 28));
    apply();
  });

  const endPan = (e) => {
    if (touches.delete(e.pointerId) && pinch) {
      if (touches.size < 2) {
        pinch = null;
        viewport.releasePointerCapture?.(e.pointerId);
        // the finger still down carries on panning (but can't tap a card)
        const [rest] = [...touches.entries()];
        if (rest) {
          panning = true;
          pointerId = rest[0];
          lastX = rest[1].x;
          lastY = rest[1].y;
          panMoved = Infinity;
          vx = vy = 0;
        } else {
          kick();
        }
      }
      return;
    }
    if (!panning || e.pointerId !== pointerId) return;
    panning = false;
    pointerId = null;
    const clickedCard = panMoved < 6 ? downCard : null;
    downCard = null;
    viewport.releasePointerCapture?.(e.pointerId);
    viewport.classList.remove("is-panning");
    if (clickedCard) {
      toggleFocusCard(clickedCard);
      return;
    }
    if (Math.hypot(vx, vy) > 4) kick();
  };
  viewport.addEventListener("pointerup", endPan);
  viewport.addEventListener("pointercancel", endPan);

  // Two-finger trackpad scroll pans; pinch (ctrlKey/metaKey) zooms around cursor
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      clearFocus();
      markMoving();
      targetX = targetY = targetZoom = null;
      vx = vy = 0;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.008);
        const nextZoom = clampZoom(zoom * factor);
        const ratio = nextZoom / zoom;
        const r = viewport.getBoundingClientRect();
        const cx = e.clientX - (r.left + r.width / 2);
        const cy = e.clientY - (r.top + r.height / 2);
        panX = cx - (cx - panX) * ratio;
        panY = cy - (cy - panY) * ratio;
        zoom = nextZoom;
      } else {
        panX -= e.deltaX;
        panY -= e.deltaY;
      }
      apply();
      updateNearestProject();
    },
    { passive: false }
  );

  // Double-clicking empty black canvas fits the active project cleanly back into view
  viewport.addEventListener("dblclick", (e) => {
    if (e.target.closest(".work-gizmo, .work-card, .work-btn, .work-zoom, .work-projects")) return;
    fitProject(activeProject);
  });

  // Fit Gizmo 1 automatically the moment WORK becomes visible, cache viewport
  // dimensions, and pause off-screen videos whenever WORK is hidden.
  new ResizeObserver(() => {
    const r = viewport.getBoundingClientRect();
    viewW = r.width;
    viewH = r.height;
    for (const s of sectionMeta) {
      if (s.el.offsetWidth > 0) s.hw = s.el.offsetWidth / 2;
      if (s.el.offsetHeight > 0) s.hh = s.el.offsetHeight / 2;
    }
    const mode = isNarrow() ? "narrow" : "wide";
    if (viewW > 0 && (mode !== layoutMode || (mode === "narrow" && Math.abs(viewW - layoutW) > 1))) {
      // first shown, crossed between phone and wider, or a stacked canvas
      // changed width: (re)place the projects and frame the current one
      layoutMode = mode;
      layoutSections(mode === "narrow");
      hasInitialFit = true;
      fitProject(activeProject, true);
    } else if (viewW > 0 && !hasInitialFit) {
      hasInitialFit = true;
      fitProject(activeProject, true);
    } else {
      apply();
    }
  }).observe(viewport);

  new MutationObserver(() => syncVisibility()).observe(viewport, { attributes: true, attributeFilter: ["hidden"] });

  syncProjectNav();
  apply();
}
