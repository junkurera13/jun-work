import fragSrc from "../shaders/scene.frag.glsl?raw";
import commonSrc from "../shaders/common.glsl?raw";
import bgFragSrc from "../shaders/bg.frag.glsl?raw";
import backgroundSrc from "../shaders/background.glsl?raw";

const withIncludes = (s) =>
  s.replace('#include "common.glsl"', commonSrc).replace('#include "background.glsl"', backgroundSrc);

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const DYN_W = 64;
export const DYN_H = 12;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.parallel = gl.getExtension("KHR_parallel_shader_compile");

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, withIncludes(fragSrc));
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    this.prog = prog;
    this.vs = vs;
    this.fs = fs;
    // the painted weather backdrop, drawn full screen behind the ice cream
    const bfs = compile(gl, gl.FRAGMENT_SHADER, withIncludes(bgFragSrc));
    const bprog = gl.createProgram();
    gl.attachShader(bprog, vs);
    gl.attachShader(bprog, bfs);
    gl.linkProgram(bprog);
    this.bgProg = bprog;
    this.bgFs = bfs;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.crackTex = this.byteTex();
    this.dynTex = this.floatTex(DYN_W, DYN_H);
    this.dyn = new Float32Array(DYN_W * DYN_H * 4);

    this.scale = 1;
    this.frameTimes = [];
    this.lastResize = 0;
  }

  /** Resolves once the (large) shader has compiled, without blocking the page. */
  ready() {
    const gl = this.gl;
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.parallel && !gl.getProgramParameter(this.prog, this.parallel.COMPLETION_STATUS_KHR)) {
          setTimeout(check, 30);
          return;
        }
        if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
          const log = gl.getShaderInfoLog(this.fs) || gl.getProgramInfoLog(this.prog);
          reject(new Error(log));
          return;
        }
        if (!gl.getProgramParameter(this.bgProg, gl.LINK_STATUS)) {
          reject(new Error(gl.getShaderInfoLog(this.bgFs) || gl.getProgramInfoLog(this.bgProg)));
          return;
        }
        this.setup();
        resolve();
      };
      check();
    });
  }

  setup() {
    const gl = this.gl;
    gl.useProgram(this.prog);
    this.u = {};
    const n = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(this.prog, i);
      const name = info.name.replace(/\[0\]$/, "");
      this.u[name] = gl.getUniformLocation(this.prog, info.name);
    }
    gl.uniform1i(this.u.uCrackTex, 0);
    gl.uniform1i(this.u.uDyn, 1);
    gl.uniform1i(this.u.uTextTex, 2);
    this.bu = {};
    for (const name of ["uRes", "uTime", "uWeatherA", "uWeatherB", "uBackdropInsetsY"]) this.bu[name] = gl.getUniformLocation(this.bgProg, name);
  }

  floatTex(w, h) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  setTextTexture(canvas) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textTex = t;
  }

  byteTex() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // wraps around the bar
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /** The crack canvas (see sim/fracture.js) -> texture. */
  uploadCracks(canvas) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.crackTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    // blurred levels tell the shader how much crack is nearby
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  uploadDyn() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dynTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, DYN_W, DYN_H, gl.RGBA, gl.FLOAT, this.dyn);
  }

  /** Keep the canvas matched to the viewport, with an adaptive resolution scale. */
  resize(force = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr * this.scale));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr * this.scale));
    if (force || w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  adapt(frameMs) {
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length < 40) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    this.frameTimes.length = 0;
    // Only change the scale here. Resizing the canvas wipes it, so the new
    // size is applied by resize() at the start of the next frame, right
    // before drawing (doing it after a draw flashed a blank frame).
    // Going up needs a long run of fast frames, so it doesn't flip-flop.
    if (med > 24) {
      this.scale = Math.max(0.45, this.scale * 0.85);
      this.fastRuns = 0;
    } else if (med < 13 && this.scale < 1) {
      this.fastRuns = (this.fastRuns || 0) + 1;
      if (this.fastRuns >= 3) {
        this.scale = Math.min(1, this.scale * 1.08);
        this.fastRuns = 0;
      }
    } else {
      this.fastRuns = 0;
    }
  }

  draw(U, scissor) {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const scaleY = H / Math.max(1, this.canvas.clientHeight);
    const backdropTop = U.backdropInsetTop * scaleY;
    const backdropBottom = U.backdropInsetBottom * scaleY;
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(this.vao);
    // 1. the painted weather backdrop, full screen
    gl.useProgram(this.bgProg);
    gl.uniform2f(this.bu.uRes, W, H);
    gl.uniform1f(this.bu.uTime, U.time);
    gl.uniform4fv(this.bu.uWeatherA, U.weatherA);
    gl.uniform1f(this.bu.uWeatherB, U.weatherB);
    gl.uniform2f(this.bu.uBackdropInsetsY, backdropTop, backdropBottom);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 2. the ice cream, only where it can be
    if (scissor) {
      const x0 = Math.max(0, Math.floor(scissor[0] * W));
      const y0 = Math.max(0, Math.floor(scissor[1] * H));
      const x1 = Math.min(W, Math.ceil(scissor[2] * W));
      const y1 = Math.min(H, Math.ceil(scissor[3] * H));
      if (x1 <= x0 || y1 <= y0) return;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x0, y0, x1 - x0, y1 - y0);
    }
    this.drawScene(U, W, H, backdropTop, backdropBottom, false);
  }

  /**
   * Render the ice cream alone (transparent background) into a small
   * offscreen image, e.g. for the flavor dock. Returns a canvas.
   */
  thumbnail(U, w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(this.vao);
    this.drawScene(U, w, h, 0, 0, true);
    const px = new Uint8ClampedArray(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    // GL rows run bottom-up
    const flipped = new Uint8ClampedArray(px.length);
    const row = w * 4;
    for (let y = 0; y < h; y++) flipped.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").putImageData(new ImageData(flipped, w, h), 0, 0);
    return c;
  }

  drawScene(U, W, H, backdropTop, backdropBottom, thumb) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    const u = this.u;
    gl.uniform1i(u.uThumb, thumb ? 1 : 0);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform4fv(u.uWeatherA, U.weatherA);
    gl.uniform1f(u.uWeatherB, U.weatherB);
    gl.uniform2f(u.uBackdropInsetsY, backdropTop, backdropBottom);
    gl.uniform3fv(u.uLightTint, U.lightTint);
    gl.uniform3f(u.uCamPos, U.camPos.x, U.camPos.y, U.camPos.z);
    gl.uniformMatrix3fv(u.uCamBasis, false, U.camBasis);
    gl.uniform1f(u.uTanHalfFov, U.tanHalfFov);
    gl.uniformMatrix3fv(u.uObjRot, false, U.objRot);
    gl.uniform1f(u.uTime, U.time);
    gl.uniform3fv(u.uBoundMin, U.boundMin);
    gl.uniform3fv(u.uBoundMax, U.boundMax);
    const M = U.melt;
    gl.uniform1i(u.uFaluda, M.faluda ? 1 : 0);
    gl.uniform1f(u.uSag, M.sag);
    gl.uniform1f(u.uBulge, M.bulge);
    gl.uniform1f(u.uTaper, M.taper);
    gl.uniform1f(u.uMorph, M.morph);
    gl.uniform1f(u.uShrink, M.shrink);
    gl.uniform1f(u.uErode, M.erode);
    gl.uniform1f(u.uMeltV, M.meltV);
    gl.uniform1f(u.uMeltC, M.meltC);
    gl.uniform1f(u.uChocGone, M.chocGone);
    gl.uniform1f(u.uStickK, M.stickK);
    gl.uniform1f(u.uWet, M.wet);
    gl.uniform1f(u.uCracks, U.cracks ? 1 : 0);
    gl.uniform1f(u.uOoze, U.ooze);
    gl.uniform1i(u.uPrimCount, U.primCount);
    gl.uniform1i(u.uCrumbCount, U.crumbCount);
    gl.uniform3fv(u.uLiqMin, U.liqMin);
    gl.uniform3fv(u.uLiqMax, U.liqMax);
    gl.uniform1f(u.uExposure, U.exposure);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.crackTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dynTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
