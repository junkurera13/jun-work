// WORK: black interactive spatial canvas on the right of the menu.
// Projects live in distinct Figma-style spatial sections ([data-project]) on
// the infinite board. Drag empty canvas (or scroll) to pan, pinch / +/- to
// zoom, click bottom-left project chips to jump between projects, click any
// artifact card to focus it cleanly, and use top-right expand for full-page view.

import { mountGizmo } from "../gizmo/gizmo.js";
import { setupOddbox } from "../oddbox/oddbox.js";
import { setupSlate } from "../slate/slate.js";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.2;
const BASE_GRID = 28;
const ZOOM_STEP = 1.25;

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
    videos: [...sec.querySelectorAll("video")],
    visible: null,
  }));

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
    const fitZ = Math.max(MIN_ZOOM, Math.min(maxZ, availW / br.w, availH / br.h));
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
    fitElement(sec, { padX: 46, padTop: 64, padBottom: 88, maxZ: 1.02, instant });
  };

  const toggleFocusCard = (card) => {
    if (focusedCard === card) {
      fitProject(activeProject);
      return;
    }
    clearFocus();
    focusedCard = card;
    card.classList.add("is-focused");
    fitElement(card, { padX: 64, padTop: 68, padBottom: 92, maxZ: 1.75 });
  };

  const animateZoom = (nextZoom) => {
    clearFocus();
    const curZoom = targetZoom ?? zoom;
    const curX = targetX ?? panX;
    const curY = targetY ?? panY;
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
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
      if (focusedCard) fitElement(focusedCard, { padX: 64, padTop: 64, padBottom: 72, maxZ: 1.75 });
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

  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.button !== 1) return;
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
        const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
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
    if (viewW > 0 && !hasInitialFit) {
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
