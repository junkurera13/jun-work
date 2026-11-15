# Jun Park

A blank white page with one Magic Choc vanilla ice cream on it.

- **Tap / click** the chocolate shell to crack it. Tap a cracked piece again and it snaps off.
- **Drag** to turn it around.
- It **melts** slowly by itself: the vanilla goes first, leaking from the bottom (and
  welling up through any cracks), then the chocolate softens. Drips run down the
  surface and the stick and fall off the bottom of the screen. Keep watching and the
  stick comes out.
- The **dial** at the bottom sets the temperature, which sets the melt speed
  (−18° is frozen, 29° is the default, 45° is very fast). Drag it, scroll on it or use
  the arrow keys. Double-click it to reset. ↺ gives you a new ice cream.

Everything is rendered live in one ray-marched fragment shader (no meshes and no
image assets). The crack sounds are synthesised with WebAudio.

The previous portfolio still lives at [`/archive/`](archive/index.html). It isn't linked from
the new page.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Where things are

| Path | What it does |
| --- | --- |
| `src/shaders/scene.frag.glsl` | The ray marcher: SDF model, fracture field, liquid, materials and studio lighting |
| `src/shaders/common.glsl` | Shared SDF / noise helpers (the bar shape lives here) |
| `src/sim/shape.js` | JS mirror of the SDF, used for picking and to keep drips on the surface |
| `src/sim/melt.js` | Melt timeline, plus the temperature → speed mapping |
| `src/sim/fracture.js` | Crack network, pieces that snap off, crumbs |
| `src/sim/liquid.js` | Rivulets, hanging drops, pinch-off and falling drops |
| `src/audio/crack.js` | Procedural chocolate-snap sounds |
| `src/ui/dial.js` | Temperature dial |
| `archive/` | The old portfolio |

Run `__ice.setMelt(0.6)` or `__ice.setTemp(45)` in the console to jump around the melt.
