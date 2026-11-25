// Lightweight 2D canvas renderer for Slate's Right-Cmd Voice Mode waveform
// pills (28 staggered bars: white for Listening, amber->coral warm() for
// Talking), replacing 56 simultaneous CSS keyframe layers. Automatically stops
// drawing whenever 03 SLATE is off-screen, hidden, or the canvas is moving.

const BAR_COUNT = 28;
const BARS = Array.from({ length: BAR_COUNT }, (_, i) => ({
  delay: (i * 97) % 600,
  dur: 460 + ((i * 53) % 300),
}));

function warm(index) {
  const t = index / (BAR_COUNT - 1);
  return `rgb(255 ${Math.round(184 - 92 * t)} ${Math.round(77 + 35 * t)})`;
}

const WARM_COLORS = Array.from({ length: BAR_COUNT }, (_, i) => warm(i));

export function setupSlate() {
  const hosts = [...document.querySelectorAll(".sl-quick-wave")];
  if (!hosts.length) return;

  const viewport = document.querySelector(".work-canvas");
  const section = document.querySelector('.work-section[data-project="slate"]');
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const entries = hosts.map((host) => {
    const canvas = document.createElement("canvas");
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = 174;
    const h = 18;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    host.textContent = "";
    host.append(canvas);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    return { canvas, ctx, w, h, speaking: host.dataset.voice === "speaking" };
  });

  const drawFrame = (now) => {
    for (const { ctx, w, h, speaking } of entries) {
      ctx.clearRect(0, 0, w, h);
      const barW = 2.5;
      const gap = (w - BAR_COUNT * barW) / (BAR_COUNT - 1);
      for (let i = 0; i < BAR_COUNT; i++) {
        const b = BARS[i];
        // Smooth ease-in-out alternate wave matching quick.css quick-wob
        const phase = reduceMotion ? 0.5 : ((now + b.delay) / b.dur) % 2;
        const tri = phase <= 1 ? phase : 2 - phase;
        const ease = 0.5 - 0.5 * Math.cos(tri * Math.PI);
        const frac = 0.14 + (0.95 - 0.14) * ease;
        const bh = Math.max(2.5, h * frac);
        const x = i * (barW + gap);
        const y = (h - bh) / 2;
        ctx.fillStyle = speaking ? WARM_COLORS[i] : "#ffffff";
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, 1.5);
        ctx.fill();
      }
    }
  };

  drawFrame(0);
  if (reduceMotion) return;

  let lastDraw = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if (
      document.hidden ||
      viewport?.hidden ||
      viewport?.classList.contains("is-moving") ||
      section?.classList.contains("is-offscreen")
    ) {
      return;
    }
    // 24fps is silky for soft voice bars with minimal CPU cost
    if (now - lastDraw < 41) return;
    lastDraw = now;
    drawFrame(now);
  }
  requestAnimationFrame(tick);
}
