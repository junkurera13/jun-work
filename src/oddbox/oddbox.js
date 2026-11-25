// Live interactive Oddbox Kids components inside the WORK spatial canvas:
//   1. Live Interactive App Home / Discover Shelf (discover.tsx):
//      All episodes / Adventures / History tabs with squash-bounce pop,
//      yellow jelly-wobble ShelfArrow buttons with real Web Audio boing,
//      white-ring spring hover episode cards, and the spinning + Create card.
//   2. Interactive 4-dot spinning pink menu toggle & reliable teasing Parents Lock.

import { playOddbox } from "./sound.js";

const EPISODES = [
  { id: "flying", kind: "History", title: "The Flying Machine", minutes: 8, img: "/oddbox/episodes/flying-machine.webp" },
  { id: "sea", kind: "Adventures", title: "Lights in the dark", minutes: 5, img: "/oddbox/episodes/deep-sea.webp" },
  { id: "everest", kind: "History", title: "Up to base camp", minutes: 6, img: "/oddbox/episodes/everest.webp" },
  { id: "bees", kind: "Adventures", title: "A hive on the move", minutes: 5, img: "/oddbox/episodes/bees.webp" },
];

// Pok alien badge for the Discover top-right header pill
const POK_HTML = `<span class="ob-avatar-circle" style="background:#1f9cf0"><svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M38 50 32 28M62 50 68 28" stroke="#ff7a1a" stroke-width="6" stroke-linecap="round"/>
  <path d="M24 100V68a26 23 0 0 1 52 0v32z" fill="#ff7a1a"/>
  <circle cx="31" cy="24" r="10.5" fill="#fff"/><circle cx="34" cy="27" r="5.25" fill="#000"/>
  <circle cx="69" cy="24" r="12" fill="#fff"/><circle cx="65" cy="26" r="6" fill="#000"/>
  <path d="M38 72h24" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
  <path d="m41 74 3.5 7 3.5-7zM52 74l3.5 7 3.5-7z" fill="#fff"/>
</svg></span>`;

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const stopCanvas = (el) => {
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
  el.addEventListener("dblclick", (e) => e.stopPropagation());
};

// Exact squash-and-bounce tab pop from discover.tsx
function popTab(el) {
  if (reduceMotion()) return;
  el.animate(
    [{ scale: "1" }, { scale: "0.9", offset: 0.3 }, { scale: "1.06", offset: 0.65 }, { scale: "1" }],
    { duration: 380, easing: "ease-out" }
  );
}

// Exact jelly wobble arrow bounce from discover.tsx ShelfArrow
function boingArrow(el) {
  if (reduceMotion()) return;
  el.animate(
    [
      { scale: "1.05 1.05" },
      { scale: "0.8 1.14", offset: 0.18 },
      { scale: "1.16 0.92", offset: 0.38 },
      { scale: "0.96 1.08", offset: 0.56 },
      { scale: "1.08 1.01", offset: 0.74 },
      { scale: "1.05 1.05" },
    ],
    { duration: 620, easing: "ease-out" }
  );
}

export function setupOddbox() {
  const appAvatarSlot = document.querySelector(".ob-app-avatar-slot");
  if (appAvatarSlot) appAvatarSlot.innerHTML = POK_HTML;

  // 1. Live Interactive App Home / Discover Shelf (seamless infinite loop matching discover.tsx)
  const appCard = document.querySelector(".ob-app-live");
  if (appCard) {
    const tabs = [...appCard.querySelectorAll(".ob-shelf-tab")];
    const track = appCard.querySelector(".ob-shelf-track");
    const prevBtn = appCard.querySelector('.ob-shelf-arrow[data-dir="left"]');
    const nextBtn = appCard.querySelector('.ob-shelf-arrow[data-dir="right"]');
    const COPIES = 5;
    let activeKind = null;
    let perSet = 5;
    let index = 0;

    const getItems = () => {
      const filtered = activeKind ? EPISODES.filter((e) => e.kind === activeKind) : EPISODES;
      return [...filtered, { id: "create", create: true, title: "Create" }];
    };

    const jumpTo = (nextIndex) => {
      index = nextIndex;
      track.style.transition = "none";
      track.style.setProperty("--offset", String(index));
      void track.offsetWidth;
      track.style.transition = "";
    };

    // Keep index inside the middle copy [2*perSet, 3*perSet - 1] invisibly (identical cards)
    const recentre = () => {
      const lo = perSet * 2;
      const hi = perSet * 3;
      let normalized = index;
      while (normalized < lo) normalized += perSet;
      while (normalized >= hi) normalized -= perSet;
      if (normalized !== index) jumpTo(normalized);
    };

    const renderShelf = () => {
      const items = getItems();
      perSet = items.length;
      track.innerHTML = "";

      for (let copy = 0; copy < COPIES; copy++) {
        items.forEach((item) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = item.create ? "ob-ep-card ob-ep-create" : "ob-ep-card";
          if (copy !== 2) {
            btn.setAttribute("aria-hidden", "true");
            btn.tabIndex = -1;
          }
          stopCanvas(btn);
          if (item.create) {
            btn.setAttribute("aria-label", "Create an episode");
            btn.innerHTML = `
              <span class="ob-ep-frame">
                <span class="ob-ep-media ob-ep-media--create">
                  <span class="ob-create-circle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                  </span>
                </span>
              </span>
              <span class="ob-ep-title">Create</span>`;
          } else {
            btn.setAttribute("aria-label", `${item.title} (${item.minutes}m)`);
            btn.innerHTML = `
              <span class="ob-ep-frame">
                <span class="ob-ep-media">
                  <img src="${item.img}" alt="" draggable="false" />
                  <span class="ob-ep-mins">${item.minutes}m</span>
                </span>
              </span>
              <span class="ob-ep-title">${item.title}</span>`;
          }
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            playOddbox("tap");
          });
          track.append(btn);
        });
      }

      // Start on middle copy (showing 3 episodes + Create immediately on All episodes)
      jumpTo(perSet * 2 + (activeKind ? 0 : 1));
    };

    track.addEventListener("transitionend", (e) => {
      if (e.propertyName === "transform") recentre();
    });

    tabs.forEach((tab) => {
      stopCanvas(tab);
      tab.addEventListener("click", (e) => {
        e.stopPropagation();
        activeKind = tab.dataset.kind || null;
        tabs.forEach((t) => t.setAttribute("aria-selected", String((t.dataset.kind || null) === activeKind)));
        playOddbox("tap");
        popTab(tab);
        renderShelf();
      });
    });

    const stepShelf = (dir, btn) => {
      recentre();
      index += dir;
      playOddbox(dir > 0 ? "boing" : "boingBack");
      boingArrow(btn);
      track.style.setProperty("--offset", String(index));
    };

    if (prevBtn) {
      stopCanvas(prevBtn);
      prevBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        stepShelf(-1, prevBtn);
      });
    }
    if (nextBtn) {
      stopCanvas(nextBtn);
      nextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        stepShelf(1, nextBtn);
      });
    }

    renderShelf();
  }

  // 2. Interactive 4-dot pink spinning menu toggle
  for (const menuBtn of document.querySelectorAll(".ob-dots-btn")) {
    stopCanvas(menuBtn);
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menuBtn.getAttribute("aria-pressed") !== "true";
      menuBtn.setAttribute("aria-pressed", String(open));
      playOddbox(open ? "pop" : "popClose");
    });
  }

  // 3. Parents Lock: pure CSS :hover opens shackle & wiggles body cleanly every time; click plays tap
  for (const lockBtn of document.querySelectorAll(".ob-lock-btn")) {
    stopCanvas(lockBtn);
    lockBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      playOddbox("tap");
    });
  }
}
