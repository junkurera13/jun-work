import { smoothstep } from "./shape.js";

// Seconds for a complete melt at 1x (Breeze).
export const MELT_SECONDS = 540;

/**
 * Turns a single melt progress value P (0 = straight from the freezer,
 * 1 = only the stick is left) into all of the shape / material parameters.
 * Magic Choc: the vanilla inside starts going first; the chocolate shell follows
 * a little behind. Faluda: the rose ice runs first and the vanilla holds on.
 */
export function meltParams(P, faluda = false, mould = 0) {
  // the coconut and strawberry milk lollies are one solid ice all the way through
  const solid = mould > 0;
  const f = Math.pow(smoothstep(0.08, 1.0, P), 1.25);
  // the top slumps, but never squashes flat: the last of the ice cream stays
  // a rounded lump that shrinks onto the stick and melts away
  const sag = 1 / Math.max(1 - 0.72 * f, 0.3);
  const erode = 0.85 * smoothstep(0.12, 0.92, P) + 3.2 * smoothstep(0.86, 1.0, P);
  const bulge = 0.1 * smoothstep(0.1, 0.7, P) * (1 - smoothstep(0.7, 0.9, P));
  return {
    P,
    faluda,
    mould,
    sag,
    erode,
    bulge,
    taper: 0.42 * smoothstep(0.15, 0.85, P),
    morph: 0.85 * smoothstep(0.1, 0.75, P),
    shrink: 0.68 * smoothstep(0.5, 0.97, P),
    // Magic Choc: the vanilla goes first and the thin chocolate follows.
    // Faluda: the other way round. The rose ice is outside, meets the warm
    // air first and turns straight into runny syrup; the vanilla inside is
    // insulated by it and its fat and air hold their shape for longer.
    // Passionfruit coconut, strawberry milk: solid, so inside and out go together.
    meltV: solid ? smoothstep(0.0, 0.7, P) : faluda ? smoothstep(0.2, 0.95, P) : smoothstep(0.0, 0.8, P),
    meltC: faluda ? smoothstep(0.0, 0.7, P) : smoothstep(0.12, 0.92, P),
    // (solid ice has no separate shell to melt off: it just erodes)
    chocGone: solid ? 0 : faluda ? 1.1 * smoothstep(0.26, 0.86, P) : 1.1 * smoothstep(0.38, 1.0, P),
    stickK: 0.16 * smoothstep(0.3, 0.6, P) * (1 - smoothstep(0.96, 1.0, P)),
    wet: smoothstep(0.4, 0.75, P),
  };
}

// The weather sets the melt speed (relative to Breeze) and tints the light
// on the ice cream. Order matches the painted backdrops in background.glsl.
export const WEATHERS = [
  { id: "snow", icon: "\u2744\ufe0f", word: "snow", label: "Snow", rate: 0, tint: [0.92, 0.96, 1.06] },
  { id: "rain", icon: "\ud83c\udf27\ufe0f", word: "rain", label: "Rain", rate: 0.4, tint: [0.88, 0.92, 0.98] },
  { id: "normal", icon: "\u26c5", word: "breeze", label: "Breeze", rate: 1, tint: [1, 1, 1] },
  { id: "summer", icon: "\u2600\ufe0f", word: "sunshine", label: "Sunshine", rate: 3, tint: [1.07, 1.01, 0.92] },
  { id: "brutal", icon: "\ud83d\udd25", word: "heatwave", label: "Heatwave", rate: 7, tint: [1.14, 0.99, 0.84] },
];
export const WEATHER_DEFAULT = WEATHERS.findIndex((weather) => weather.id === "summer");
