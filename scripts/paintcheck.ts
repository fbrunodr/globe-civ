// P9: the terrain shader paints with the same noise as paint.ts, so props,
// rivers and tests (CPU) agree with what is drawn (GPU). Evaluates the
// border noise at random points on the GPU (headless Chrome) and compares.
//
//   npm run paintcheck

import { chromium } from 'playwright-core';
import { borderNoise, cellHash } from '../src/paint.ts';
import { PAINT_NOISE_GLSL } from '../src/terrainMaterial.ts';
import { mulberry32 } from '../src/rng.ts';

const CHROME = process.env['CHROME'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SIDE = 64; // SIDE² points
const FREQ = 3.4 / 0.04;
const TOLERANCE = 2e-3;

const rand = mulberry32(9);
const pts: number[] = [];
for (let i = 0; i < SIDE * SIDE; i++) {
  const u = rand() * 2 - 1, th = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  pts.push(s * Math.cos(th), u, s * Math.sin(th), 1 + Math.floor(rand() * 8388607));
}
const cpu = Array.from({ length: SIDE * SIDE }, (_, i) => borderNoise(pts[i * 4], pts[i * 4 + 1], pts[i * 4 + 2], pts[i * 4 + 3], FREQ));
const cpuHash = Array.from({ length: SIDE * SIDE }, (_, i) => cellHash(i - 2000, 3 * i - 5000, 7 - i, i * 31 + 1) >>> 8);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--enable-gpu', '--use-angle=metal'] });
try {
  const page = await browser.newPage();
  // tsx (esbuild) wraps named functions in __name(); define it in the page too.
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  await page.goto('about:blank');
  const gpu = await page.evaluate(({ glsl, pts, side, freq }) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    const gl = canvas.getContext('webgl2')!;
    gl.getExtension('EXT_color_buffer_float');
    const vs = `#version 300 es
      in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
    const fs = `#version 300 es
      precision highp float; precision highp int;
      uniform highp sampler2D uPts; uniform float uFreq; uniform int uMode;
      out vec4 o;
      ${glsl}
      void main() {
        ivec2 c = ivec2(gl_FragCoord.xy);
        int i = c.y * ${side} + c.x;
        vec4 q = texelFetch(uPts, c, 0);
        if (uMode == 0) o = vec4(pEta(q.xyz, uint(q.w)), 0.0, 0.0, 1.0);
        else o = vec4(float(pHash(ivec3(i - 2000, 3 * i - 5000, 7 - i), uint(i * 31 + 1)) >> 8), 0.0, 0.0, 1.0); // < 2^24: exact
      }`;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'compile');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, side, side, 0, gl.RGBA, gl.FLOAT, new Float32Array(pts));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const target = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, target);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, side, side, 0, gl.RGBA, gl.FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.viewport(0, 0, side, side);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, 'uPts'), 0);
    gl.uniform1f(gl.getUniformLocation(prog, 'uFreq'), freq);
    const run = (mode: number) => {
      gl.uniform1i(gl.getUniformLocation(prog, 'uMode'), mode);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const out = new Float32Array(side * side * 4);
      gl.readPixels(0, 0, side, side, gl.RGBA, gl.FLOAT, out);
      return Array.from({ length: side * side }, (_, i) => out[i * 4]);
    };
    return { eta: run(0), hash: run(1) };
  }, { glsl: PAINT_NOISE_GLSL, pts, side: SIDE, freq: FREQ });

  let worst = 0, hashWorst = 0;
  for (let i = 0; i < cpu.length; i++) {
    worst = Math.max(worst, Math.abs(cpu[i] - gpu.eta[i]));
    hashWorst = Math.max(hashWorst, Math.abs(cpuHash[i] - gpu.hash[i]));
  }
  console.log(`P9 hash: ${hashWorst === 0 ? 'identical' : `differs by up to ${hashWorst}`} on ${cpu.length} lattice cells (must be identical)`);
  console.log(`P9 border noise: worst difference ${worst.toExponential(2)} over ${cpu.length} points (limit ${TOLERANCE})`);
  if (hashWorst > 0 || worst > TOLERANCE) process.exitCode = 1;
  else console.log('P9 ok: shader and paint.ts paint the same borders.');
} finally {
  await browser.close();
}
