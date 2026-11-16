# Jun Park

A blank white page with one Magic Choc vanilla ice cream on it.

- **Tap / click** the chocolate shell to break it: a patch around your finger snaps into
  irregular plates that sink into the soft ice cream. Cracks stop where they meet older ones, so
  the shell breaks up finer the more you press. Press a broken plate again to pop it out.
- **Drag** to turn it around.
- It **melts** slowly by itself: the vanilla goes first, leaking from the bottom (and
  welling up through any cracks), then the chocolate softens. Drips run down the
  surface and the stick and fall off the bottom of the screen. Keep watching and the
  stick comes out.
- The **weather words** along the top (snow · rain · breeze · sunshine · heatwave) change the painted sky behind it and
  how fast it melts: snow freezes it, brutal summer melts it in about a minute. ↺ gives you a new
  ice cream.

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
| `src/sim/melt.js` | Melt timeline, plus each weather's melt speed and light tint |
| `src/sim/fracture.js` | Crack paths (painted into a texture the shader reads), crushing, flying chips |
| `src/sim/liquid.js` | Rivulets, hanging drops, pinch-off and falling drops |
| `src/audio/crack.js` | Procedural chocolate-snap sounds |
| `src/shaders/background.glsl` | The painted weather backdrop that fades into the white page |
| `src/ui/weather.js` | The line of weather words |
| `archive/` | The old portfolio |

Run `__ice.setMelt(0.6)` or `__ice.setWeather(4)` in the console to jump around the melt.
