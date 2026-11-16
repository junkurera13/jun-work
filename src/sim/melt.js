import { smoothstep } from "./shape.js";

// Seconds for a complete melt at 1x (the default temperature).
export const MELT_SECONDS = 540;

/**
 * Turns a single melt progress value P (0 = straight from the freezer,
 * 1 = only the stick is left) into all of the shape / material parameters.
 * The vanilla inside starts going first; the chocolate shell follows a little
 * behind, so they never melt in lockstep but never drift far apart either.
 */
export function meltParams(P) {
  const f = Math.pow(smoothstep(0.08, 1.0, P), 1.25);
  // the top slumps, but never squashes flat: the last of the ice cream stays
  // a rounded lump that shrinks onto the stick and melts away
  const sag = 1 / Math.max(1 - 0.72 * f, 0.3);
  const erode = 0.85 * smoothstep(0.12, 0.92, P) + 3.2 * smoothstep(0.86, 1.0, P);
  const bulge = 0.1 * smoothstep(0.1, 0.7, P) * (1 - smoothstep(0.7, 0.9, P));
  return {
    P,
    sag,
    erode,
    bulge,
    taper: 0.42 * smoothstep(0.15, 0.85, P),
    morph: 0.85 * smoothstep(0.1, 0.75, P),
    shrink: 0.68 * smoothstep(0.5, 0.97, P),
    meltV: smoothstep(0.0, 0.8, P),
    meltC: smoothstep(0.12, 0.92, P),
    chocGone: 1.1 * smoothstep(0.38, 1.0, P),
    stickK: 0.16 * smoothstep(0.3, 0.6, P) * (1 - smoothstep(0.96, 1.0, P)),
    wet: smoothstep(0.4, 0.75, P),
  };
}

// The weather sets the melt speed (x the default pace) and tints the light
// on the ice cream. Order matches the painted backdrops in background.glsl.
export const WEATHERS = [
  { id: "snow", icon: "\u2744\ufe0f", word: "snow", label: "Snow", rate: 0, tint: [0.92, 0.96, 1.06] },
  { id: "rain", icon: "\ud83c\udf27\ufe0f", word: "rain", label: "Rain", rate: 0.4, tint: [0.88, 0.92, 0.98] },
  { id: "normal", icon: "\u26c5", word: "breeze", label: "Breeze", rate: 1, tint: [1, 1, 1] },
  { id: "summer", icon: "\u2600\ufe0f", word: "sunshine", label: "Sunshine", rate: 3, tint: [1.07, 1.01, 0.92] },
  { id: "brutal", icon: "\ud83d\udd25", word: "heatwave", label: "Heatwave", rate: 7, tint: [1.14, 0.99, 0.84] },
];
export const WEATHER_DEFAULT = 2;
