// The card base: a lit, physical-feeling bank card drawn with WebGL. It
// takes a face (see face.js: colour, finish and height images for the front
// and the back), tilts toward the pointer, sways gently when left alone,
// flips over when clicked, and lights its foil, gloss and embossing as it
// moves. One card per designer = one face; this stays put.

import { CARD_ASPECT, placeholderFace } from "./face.js";

const VERT = `#version 300 es
in vec2 aPos;          // -1..1 across the card
uniform mat3 uRot;     // the card's turn
uniform vec2 uHalf;    // half its width and height (world units)
uniform float uDist;   // camera distance
uniform vec2 uProj;    // tan(half fov) * aspect, tan(half fov)
out vec2 vUV;
out vec3 vPos;
void main() {
  vUV = aPos * 0.5 + 0.5;
  vec3 p = uRot * vec3(aPos * uHalf, 0.0);
  vPos = p;
  float z = uDist - p.z; // depth in front of the camera
  gl_Position = vec4(p.x / uProj.x, p.y / uProj.y, 0.0, z);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
in vec3 vPos;
uniform sampler2D uColor;
uniform sampler2D uFinish;
uniform sampler2D uHeight;
uniform sampler2D uBackColor;
uniform sampler2D uBackFinish;
uniform sampler2D uBackHeight;
uniform mat3 uRot;
uniform vec2 uHalf;
uniform float uDist;
uniform float uRadius;
uniform vec2 uTexel;
uniform float uBump;
out vec4 outColor;

// a soft studio: dark below, bright above, and two light strips that sweep
// across the foil as the card turns
vec3 studio(vec3 r) {
  vec3 c = mix(vec3(0.05, 0.05, 0.06), vec3(0.75, 0.76, 0.78), smoothstep(-0.6, 0.9, r.y));
  float strip1 = exp(-pow((r.y * 0.9 + r.x * 0.55 - 0.3) * 6.0, 2.0));
  float strip2 = exp(-pow((r.x - r.y * 0.35 + 0.5) * 8.0, 2.0));
  return c * 0.55 + vec3(1.0, 0.99, 0.97) * (strip1 * 1.5 + strip2 * 0.7);
}

void main() {
  // the rounded corners
  vec2 p = (vUV - 0.5) * 2.0 * uHalf;
  vec2 q = abs(p) - (uHalf - uRadius);
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  float aa = fwidth(sd);
  float alpha = 1.0 - smoothstep(-aa, aa, sd);
  if (alpha <= 0.0) discard;

  // the back is seen from behind, so its images run the other way across
  bool front = gl_FrontFacing;
  vec2 uv = vec2(front ? vUV.x : 1.0 - vUV.x, 1.0 - vUV.y); // images run top down
  // Slopes are measured across at least one screen pixel's worth of image:
  // finer than that, threads far smaller than a pixel shimmered into moiré.
  // (Bumps that small average out, so they flatten, as they would.)
  vec2 step = max(uTexel, fwidth(uv));
  vec2 ex = vec2(step.x, 0.0);
  vec2 ey = vec2(0.0, step.y);
  vec2 fade = uTexel / step;
  vec3 base;
  vec2 fin;
  float hx;
  float hy;
  if (front) {
    base = texture(uColor, uv).rgb;
    fin = texture(uFinish, uv).rg;
    hx = texture(uHeight, uv + ex).r - texture(uHeight, uv - ex).r;
    hy = texture(uHeight, uv - ey).r - texture(uHeight, uv + ey).r;
  } else {
    base = texture(uBackColor, uv).rgb;
    fin = texture(uBackFinish, uv).rg;
    hx = texture(uBackHeight, uv + ex).r - texture(uBackHeight, uv - ex).r;
    hy = texture(uBackHeight, uv - ey).r - texture(uBackHeight, uv + ey).r;
  }
  base = pow(base, vec3(2.2));
  float metal = fin.r;
  float gloss = fin.g;

  // embossing: the height image's slope bends the surface (the back's
  // surface faces the other way, and its across runs the other way)
  vec3 nt = normalize(vec3(-hx * uBump * fade.x, -hy * uBump * fade.y, 1.0));
  float side = front ? 1.0 : -1.0;
  vec3 n = normalize(side * (uRot[0] * nt.x + uRot[2] * nt.z) + uRot[1] * nt.y);

  vec3 v = normalize(vec3(0.0, 0.0, uDist) - vPos);
  vec3 l = normalize(vec3(-0.45, 0.65, 0.7));
  vec3 r = reflect(-v, n);
  float ndl = max(dot(n, l), 0.0);

  vec3 diffuse = base * (0.3 + 0.8 * ndl);
  vec3 f0 = mix(vec3(0.04), base, metal);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 f = f0 + (1.0 - f0) * fres;
  vec3 reflection = studio(r) * f * mix(gloss * 0.6, 1.0, metal);
  float shine = mix(12.0, 400.0, gloss);
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), shine) * (shine + 8.0) / 60.0 * gloss;

  vec3 c = diffuse * (1.0 - metal) + reflection + spec * mix(vec3(0.5), base, metal);
  c = pow(c, vec3(1.0 / 2.2));
  outColor = vec4(c * alpha, alpha);
}`;

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// column-major 3x3 rotations
const rotX = (a) => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)];
const rotY = (a) => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)];
const rotZ = (a) => [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const mul = (a, b) => {
  const o = new Array(9);
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
  return o;
};

// The resting pose: turned a little, like a card lying on a table seen from
// just above (Ramp-style), and how far the pointer can tip it.
const REST = { x: -0.32, y: 0.22, z: -0.1 };
const TILT = { x: 0.3, y: 0.42 };
const FOV = (24 * Math.PI) / 180;
// how much of the area the card fills (the rest leaves room to tilt)
const FILL_W = 0.66;
const FILL_H = 0.48;

/**
 * Mount a card in host (it fills it). Returns { destroy }. face is a promise
 * or value from face.js; by default the placeholder.
 */
export function mountCard(host, { face = placeholderFace() } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "card-canvas";
  host.append(canvas);
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
  if (!gl) {
    host.classList.add("no-webgl");
    return { destroy: () => canvas.remove() };
  }

  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const u = {};
  for (const name of ["uRot", "uHalf", "uDist", "uProj", "uColor", "uFinish", "uHeight", "uBackColor", "uBackFinish", "uBackHeight", "uRadius", "uTexel", "uBump"])
    u[name] = gl.getUniformLocation(prog, name);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
  const texture = (unit, source) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    return t;
  };

  let ready = false;
  let texel = [1 / 1600, 1 / 1009];
  Promise.resolve(face)
    .then((f) => {
      if (destroyed) return;
      texture(0, f.front.color);
      texture(1, f.front.finish);
      texture(2, f.front.height);
      texture(3, f.back.color);
      texture(4, f.back.finish);
      texture(5, f.back.height);
      const hm = f.front.height;
      texel = [1 / (hm.width || hm.naturalWidth), 1 / (hm.height || hm.naturalHeight)];
      ready = true;
    })
    .catch((err) => console.error(err));

  // pointer: where it is over the host (-1..1), and whether it's there
  let px = 0;
  let py = 0;
  let over = 0;
  let tx = 0;
  let ty = 0;
  let overTarget = 0;
  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    overTarget = 1;
  };
  const onLeave = () => {
    overTarget = 0;
    tx = ty = 0;
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);

  // Clicking the card flips it over (a half turn about its own upright
  // axis), with a little lift toward you on the way round.
  let flips = 0; // half turns asked for
  let flipFrom = 0;
  let flipStart = -1;
  let flipAngle = 0;
  const FLIP_TIME = 0.9;
  const onClick = () => {
    flipFrom = flipAngle;
    flips += 1;
    flipStart = t;
  };
  host.addEventListener("click", onClick);
  host.style.cursor = "pointer";

  let destroyed = false;
  let raf = 0;
  let t = 0;
  let last = performance.now();
  let dpr = 1;

  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    const k = Math.min(1, dt * 5);
    px += (tx - px) * k;
    py += (ty - py) * k;
    over += (overTarget - over) * k;
    if (!ready) return;
    resize();

    // left alone it sways slowly; under the pointer it follows it instead
    const sway = reduceMotion ? 0 : 1 - over;
    const ax = REST.x + py * TILT.x * over + sway * 0.05 * Math.sin(t * 0.5);
    // the flip: eased, with a slight overshoot that settles
    let lift = 0;
    if (flipStart >= 0) {
      const s = Math.min(1, (t - flipStart) / FLIP_TIME);
      const c1 = 1.4;
      const e = 1 + (c1 + 1) * Math.pow(s - 1, 3) + c1 * Math.pow(s - 1, 2); // ease out, back
      flipAngle = flipFrom + (flips * Math.PI - flipFrom) * e;
      lift = Math.sin(Math.min(1, s * 1.2) * Math.PI) * 0.35;
      if (s >= 1) flipStart = -1;
    }
    // (the flip is the innermost turn, so the rest pose and the pointer's
    // tilt act the same way on either side)
    const ay = REST.y + px * TILT.y * over + sway * 0.12 * Math.sin(t * 0.35 + 1) + flipAngle;
    const az = REST.z + sway * 0.02 * Math.sin(t * 0.42 + 2);
    const rot = mul(rotZ(az), mul(rotX(ax), rotY(ay)));
    const flipDist = lift;

    const aspect = canvas.width / canvas.height;
    const tanH = Math.tan(FOV / 2);
    const half = [CARD_ASPECT / 2, 0.5];
    // far enough back that the card fits with room to tilt
    const dist = Math.max(1 / (FILL_H * 2 * tanH), CARD_ASPECT / (FILL_W * 2 * tanH * aspect)) - flipDist;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    gl.uniformMatrix3fv(u.uRot, false, rot);
    gl.uniform2f(u.uHalf, half[0], half[1]);
    gl.uniform1f(u.uDist, dist);
    gl.uniform2f(u.uProj, tanH * aspect, tanH);
    gl.uniform1f(u.uRadius, 3.18 / 53.98); // a real card's corner
    gl.uniform2f(u.uTexel, texel[0] * 1.5, texel[1] * 1.5);
    gl.uniform1f(u.uBump, 6.0);
    gl.uniform1i(u.uColor, 0);
    gl.uniform1i(u.uFinish, 1);
    gl.uniform1i(u.uHeight, 2);
    gl.uniform1i(u.uBackColor, 3);
    gl.uniform1i(u.uBackFinish, 4);
    gl.uniform1i(u.uBackHeight, 5);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    host.classList.add("is-live");
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("click", onClick);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    },
  };
}
