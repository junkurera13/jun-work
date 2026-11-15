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
  const sag = 1 / Math.max(1 - 0.93 * f, 0.05);
  const erode = 0.6 * smoothstep(0.12, 0.9, P) + 3.4 * smoothstep(0.9, 1.0, P);
  const bulge = 0.1 * smoothstep(0.1, 0.7, P) * (1 - smoothstep(0.7, 0.9, P));
  return {
    P,
    sag,
    erode,
    bulge,
    taper: 0.42 * smoothstep(0.15, 0.85, P),
    morph: 0.85 * smoothstep(0.1, 0.75, P),
    shrink: 0.55 * smoothstep(0.55, 0.95, P),
    meltV: smoothstep(0.0, 0.8, P),
    meltC: smoothstep(0.12, 0.92, P),
    chocGone: 1.1 * smoothstep(0.38, 1.0, P),
    stickK: 0.16 * smoothstep(0.3, 0.6, P) * (1 - smoothstep(0.96, 1.0, P)),
    wet: smoothstep(0.4, 0.75, P),
  };
}

// Temperature dial -> melt speed multiplier.
export const TEMP_MIN = -18;
export const TEMP_MAX = 45;
export const TEMP_DEFAULT = 29;

export function rateForTemp(t) {
  if (t <= -4) return 0;
  const r = Math.pow(2, (t - TEMP_DEFAULT) / 4);
  // fade in smoothly just above freezing
  return r * smoothstep(-4, 6, t);
}

export function describeTemp(t) {
  if (t <= -4) return "frozen";
  if (t < 12) return "barely";
  if (t < 24) return "slow";
  if (t < 33) return "Sunday";
  if (t < 39) return "fast";
  return "very fast";
}
