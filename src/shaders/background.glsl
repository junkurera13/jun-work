// ---------------------------------------------------------------------------
// The painted weather backdrop: a soft, grainy, painterly panel whose rounded
// edges dissolve into the white page. Five simple skies, cross-faded by
// weight: snowy, rainy, normal, summer, brutal summer.
// Needs common.glsl (hash / noise) and: uRes, uTime, uWeatherA, uWeatherB.
// ---------------------------------------------------------------------------

uniform vec4 uWeatherA; // snow, rain, normal, summer
uniform float uWeatherB; // brutal summer
uniform float uTopInset; // room kept clear for the weather words (px)

float fbm2(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise2(p);
    p = p * 2.03 + vec2(13.1, 7.7);
    a *= 0.5;
  }
  return s;
}

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// soft clouds drifting across
float clouds(vec2 q, float t, float cover) {
  float n = fbm2(q * vec2(1.6, 2.6) + vec2(t * 0.012, 0.0));
  n += 0.35 * fbm2(q * 4.0 - vec2(t * 0.02, 0.0));
  return smoothstep(0.62 - cover, 0.95 - cover, n);
}

float snowfall(vec2 q, float t) {
  float acc = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 7.0 + fi * 6.0;
    vec2 g = q * sc;
    g.y += t * (0.55 + 0.35 * fi);
    g.x += 0.35 * sin(t * 0.4 + fi * 2.0 + g.y * 0.6);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    vec2 o = (hash22(id + fi * 13.0) - 0.5) * 0.6;
    float r = 0.07 + 0.06 * hash12(id + 3.0);
    float on = step(0.45, hash12(id + 7.0 + fi));
    acc += (1.0 - smoothstep(r * 0.35, r, length(f - o))) * on * (0.55 + 0.2 * fi);
  }
  return clamp(acc, 0.0, 1.0);
}

float rainfall(vec2 q, float t) {
  float acc = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 g = vec2(q.x + q.y * 0.18, q.y) * vec2(38.0 + fi * 22.0, 3.2 + fi * 1.6);
    g.y += t * (7.0 + fi * 3.0);
    vec2 id = floor(g);
    vec2 f = fract(g);
    float x0 = 0.2 + 0.6 * hash12(id + fi * 7.0);
    float on = step(0.6, hash12(id + 19.0 + fi));
    float line = (1.0 - smoothstep(0.0, 0.07, abs(f.x - x0))) * smoothstep(0.05, 0.35, f.y) * (1.0 - smoothstep(0.45, 0.8, f.y));
    acc += line * on * (0.45 + 0.15 * fi);
  }
  return clamp(acc, 0.0, 1.0);
}

vec3 skyGrad(vec2 uv, vec3 top, vec3 bottom) {
  return mix(bottom, top, smoothstep(0.0, 1.0, uv.y));
}

vec3 sceneSnow(vec2 uv, vec2 q, float t) {
  vec3 c = skyGrad(uv, vec3(0.74, 0.8, 0.86), vec3(0.9, 0.92, 0.95));
  c = mix(c, vec3(0.95, 0.96, 0.98), 0.5 * clouds(q, t, 0.25));
  c = mix(c, vec3(1.0), 0.85 * snowfall(q, t));
  return c;
}

vec3 sceneRain(vec2 uv, vec2 q, float t) {
  vec3 c = skyGrad(uv, vec3(0.5, 0.57, 0.63), vec3(0.7, 0.75, 0.78));
  c = mix(c, vec3(0.42, 0.48, 0.54), 0.45 * clouds(q * 0.8, t * 1.5, 0.3));
  c = mix(c, vec3(0.86, 0.9, 0.94), 0.55 * rainfall(q, t));
  return c;
}

vec3 sceneNormal(vec2 uv, vec2 q, float t) {
  vec3 c = skyGrad(uv, vec3(0.56, 0.74, 0.9), vec3(0.86, 0.92, 0.96));
  c = mix(c, vec3(0.98, 0.98, 0.99), 0.85 * clouds(q, t, 0.12));
  return c;
}

vec3 sceneSummer(vec2 uv, vec2 q, float t, vec2 sun) {
  vec3 c = skyGrad(uv, vec3(0.42, 0.68, 0.92), vec3(0.98, 0.9, 0.72));
  float d = length(q - sun);
  c = mix(c, vec3(1.0, 0.96, 0.82), exp(-d * 4.0) * 0.8);
  c = mix(c, vec3(1.0, 0.99, 0.92), 1.0 - smoothstep(0.07, 0.085, d));
  c = mix(c, vec3(0.99, 0.98, 0.96), 0.6 * clouds(q, t, -0.02));
  return c;
}

vec3 sceneBrutal(vec2 uv, vec2 q, float t, vec2 sun) {
  // heat shimmer: everything wobbles a little
  q += 0.006 * vec2(sin(q.y * 38.0 - t * 3.2 + vnoise2(q * 6.0) * 4.0), 0.0);
  vec3 c = skyGrad(uv, vec3(0.98, 0.66, 0.32), vec3(1.0, 0.9, 0.66));
  float d = length(q - sun);
  c = mix(c, vec3(1.0, 0.95, 0.78), exp(-d * 2.4));
  c = mix(c, vec3(1.0, 0.99, 0.94), 1.0 - smoothstep(0.11, 0.13, d));
  return c;
}

/** Background colour at a pixel (linear-ish display colour, already final). */
vec3 background(vec2 fc) {
  float m = min(uRes.x, uRes.y);
  // the painting sits below the line of weather words
  vec2 c = vec2(0.5 * uRes.x, 0.5 * (uRes.y - uTopInset));
  vec2 hs = vec2(0.5 * uRes.x, 0.5 * (uRes.y - uTopInset)) - 0.055 * m;
  float r = 0.07 * m;
  float blur = 0.04 * m;
  vec2 q = fc / m;
  // watercolour-ish ragged edge that bleeds into the white page
  float edge = sdRoundRect(fc - c, hs, r) + (fbm2(q * 7.0) - 0.5) * blur * 1.2;
  float mask = 1.0 - smoothstep(-blur, blur * 0.4, edge);
  if (mask <= 0.0) return vec3(1.0);

  vec2 uv = (fc - (c - hs)) / (2.0 * hs);
  float t = uTime;
  vec2 sun = vec2(uRes.x / m * 0.78, uRes.y / m * 0.8);
  vec3 col = vec3(0.0);
  float wsum = 0.0;
  if (uWeatherA.x > 0.001) { col += uWeatherA.x * sceneSnow(uv, q, t); wsum += uWeatherA.x; }
  if (uWeatherA.y > 0.001) { col += uWeatherA.y * sceneRain(uv, q, t); wsum += uWeatherA.y; }
  if (uWeatherA.z > 0.001) { col += uWeatherA.z * sceneNormal(uv, q, t); wsum += uWeatherA.z; }
  if (uWeatherA.w > 0.001) { col += uWeatherA.w * sceneSummer(uv, q, t, sun); wsum += uWeatherA.w; }
  if (uWeatherB > 0.001) { col += uWeatherB * sceneBrutal(uv, q, t, sun); wsum += uWeatherB; }
  col /= max(wsum, 1e-3);

  // painterly: uneven pigment, paper grain, and kept pale so the ice cream leads
  col *= 0.93 + 0.12 * fbm2(q * 3.2 + 4.0);
  col += (hash12(fc) - 0.5) * 0.045 + (vnoise2(fc * 0.35) - 0.5) * 0.025;
  col = mix(col, vec3(1.0), 0.14);
  return mix(vec3(1.0), clamp(col, 0.0, 1.0), mask);
}
