import fragSrc from "../shaders/scene.frag.glsl?raw";
import commonSrc from "../shaders/common.glsl?raw";
import { CELL_TEX_H, CELL_TEX_W } from "../sim/fracture.js";

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

    const src = fragSrc.replace('#include "common.glsl"', commonSrc);
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, src);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    this.prog = prog;
    this.vs = vs;
    this.fs = fs;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.cellTex = this.floatTex(CELL_TEX_W, CELL_TEX_H);
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
    gl.uniform1i(this.u.uCellTex, 0);
    gl.uniform1i(this.u.uDyn, 1);
    gl.uniform1i(this.u.uTextTex, 2);
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

  uploadCells(data) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cellTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CELL_TEX_W, CELL_TEX_H, gl.RGBA, gl.FLOAT, data);
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
    const before = this.scale;
    if (med > 24) this.scale = Math.max(0.45, this.scale * 0.85);
    else if (med < 14.5 && this.scale < 1) this.scale = Math.min(1, this.scale * 1.08);
    if (Math.abs(before - this.scale) > 1e-3) this.resize(true);
  }

  draw(U, scissor) {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (scissor) {
      const x0 = Math.max(0, Math.floor(scissor[0] * W));
      const y0 = Math.max(0, Math.floor(scissor[1] * H));
      const x1 = Math.min(W, Math.ceil(scissor[2] * W));
      const y1 = Math.min(H, Math.ceil(scissor[3] * H));
      if (x1 <= x0 || y1 <= y0) return;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(x0, y0, x1 - x0, y1 - y0);
    }
    gl.useProgram(this.prog);
    const u = this.u;
    gl.uniform2f(u.uRes, W, H);
    gl.uniform3f(u.uCamPos, U.camPos.x, U.camPos.y, U.camPos.z);
    gl.uniformMatrix3fv(u.uCamBasis, false, U.camBasis);
    gl.uniform1f(u.uTanHalfFov, U.tanHalfFov);
    gl.uniformMatrix3fv(u.uObjRot, false, U.objRot);
    gl.uniform1f(u.uTime, U.time);
    gl.uniform3fv(u.uBoundMin, U.boundMin);
    gl.uniform3fv(u.uBoundMax, U.boundMax);
    const M = U.melt;
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
    gl.uniform1i(u.uImpactCount, U.impacts);
    gl.uniform1i(u.uPrimCount, U.primCount);
    gl.uniform1i(u.uCrumbCount, U.crumbCount);
    gl.uniform3fv(u.uLiqMin, U.liqMin);
    gl.uniform3fv(u.uLiqMax, U.liqMax);
    gl.uniform1f(u.uExposure, U.exposure);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cellTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.dynTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
