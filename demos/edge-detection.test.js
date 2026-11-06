/* Numeric checks for the edge-detection core and for the kernels shown in the notes.
   Run: node demos/edge-detection.test.js */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const core = require("./edge-detection.js");

function impulse(w, h, x, y, v) {
  const g = new Uint8Array(w * h);
  g[y * w + x] = v;
  return g;
}

function apply(g, w, h, k) {
  const out = new Int16Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const yy = y + j < 0 ? 0 : y + j >= h ? h - 1 : y + j;
          const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i;
          s += k[(j + 1) * 3 + (i + 1)] * g[yy * w + xx];
        }
      }
      out[y * w + x] = s;
    }
  }
  return out;
}

{
  const g = new Uint8Array(25);
  g.fill(40);
  const L = core.laplacian(g, 5, 5);
  assert.ok([...L].every((v) => v === 0), "constant image, including the border, is zero");
}

{
  const g = impulse(5, 5, 2, 2, 100);
  const L = core.laplacian(g, 5, 5);
  assert.strictEqual(L[2 * 5 + 2], -400, "bright peak is negative at the centre");
  assert.strictEqual(L[1 * 5 + 2], 100);
  assert.strictEqual(L[3 * 5 + 2], 100);
  assert.strictEqual(L[2 * 5 + 1], 100);
  assert.strictEqual(L[2 * 5 + 3], 100);
  assert.strictEqual(L[1 * 5 + 1], 0, "diagonal neighbour is zero: not the weighted kernel");
}

{
  const w = 7, h = 5;
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = x * 3;
  const L = core.laplacian(g, w, h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    assert.strictEqual(L[y * w + x], 0, "interior of a ramp has zero Laplacian");
  }
}

{
  const w = 8, h = 6;
  const g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (i * 17 + 3) % 256;
  const Kx = [0, 0, 0, 1, -2, 1, 0, 0, 0];
  const Ky = [0, 1, 0, 0, -2, 0, 0, 1, 0];
  const K4 = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  const Kw = [1, 4, 1, 4, -20, 4, 1, 4, 1];
  const L = core.laplacian(g, w, h);
  const sx = apply(g, w, h, Kx);
  const sy = apply(g, w, h, Ky);
  const s4 = apply(g, w, h, K4);
  const sw = apply(g, w, h, Kw);
  for (let i = 0; i < L.length; i++) {
    assert.strictEqual(L[i], sx[i] + sy[i]);
    assert.strictEqual(L[i], s4[i]);
  }
  assert.ok([...L].some((v, i) => v !== sw[i]), "demo kernel is not the weighted eight-neighbour kernel");
}

{
  const g = impulse(5, 5, 2, 2, 100);
  const L = core.laplacian(g, 5, 5);
  const z = core.zeroCrossings(L, 5, 5, 50);
  const a = core.absAtLeast(L, 50);
  assert.strictEqual(a[12], 255, "centre passes the absolute threshold");
  assert.strictEqual(z[12], 0, "centre is not the zero-crossing mark");
  assert.strictEqual(z[13], 255, "neighbour closer to zero is the crossing");
  assert.strictEqual(z[6], 255, "exact zero beside a nonzero sample is a crossing");
  assert.strictEqual(a[6], 0, "that zero fails the absolute threshold");
  const zHi = core.zeroCrossings(L, 5, 5, 150);
  assert.strictEqual(zHi[6], 0, "a jump of 100 is dropped when T is 150");
  assert.strictEqual(zHi[13], 255, "the jump of 500 remains");
}

{
  const w = 8, h = 6;
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = x < 4 ? 0 : 200;
  const s = core.sobel(g, w, h);
  assert.ok(s.gx[3 * w + 3] > 0, "vertical step, brighter on the right, gives positive Gx");
  assert.strictEqual(s.gy[3 * w + 2], 0);
}

{
  const w = 6, h = 8;
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = y < 4 ? 0 : 180;
  const s = core.sobel(g, w, h);
  assert.ok(s.gy[3 * w + 3] > 0, "horizontal step, brighter below, gives positive Gy");
  assert.strictEqual(s.gx[2 * w + 3], 0);
}

{
  const gx = Int16Array.from([3]);
  const gy = Int16Array.from([4]);
  const l1 = core.strength(gx, gy, false);
  const l2 = core.strength(gx, gy, true);
  assert.strictEqual(l1[0], 7);
  assert.strictEqual(l2[0], 25);
  assert.notStrictEqual(l1[0], 4);
  assert.notStrictEqual(l2[0], 5);
}

{
  const g = new Uint8Array(16);
  g.fill(30);
  assert.ok([...core.gaussianBlur(g, 4, 4, 5, 1.4)].every((v) => v === 30));
  assert.ok([...core.gaussianBlur(g, 4, 4, 1, 3)].every((v) => v === 30), "ksize 1 leaves the image unchanged");
}

function gauss(x, y, s = 1) {
  return Math.exp(-(x * x + y * y) / (2 * s * s)) / (2 * Math.PI * s * s);
}
function logg(x, y, s = 1) {
  const s2 = s * s;
  return ((x * x + y * y - 2 * s2) / (s2 * s2)) * gauss(x, y, s);
}
assert.ok(gauss(0, 0) > gauss(2, 0) && gauss(2, 0) > 0);
function dgdx(x, y) { return -x * gauss(x, y); }
function dgdy(x, y) { return -y * gauss(x, y); }
assert.ok(dgdx(-1, 0) > 0 && dgdx(1, 0) < 0);
assert.ok(dgdy(0, -1) > 0 && dgdy(0, 1) < 0);
assert.ok(logg(0, 0) < 0 && logg(2, 0) > 0);
assert.ok(Math.abs(logg(Math.sqrt(2), 0)) < 1e-12);
assert.ok(Math.abs(logg(0, 0)) > logg(2, 0) * 4, "the positive ring is lower than the bowl");

const html = fs.readFileSync(path.join(__dirname, "edge-detection.html"), "utf8");
function matrix(name) {
  const re = new RegExp('data-kernel="' + name + '"[\\s\\S]*?<mtable>([\\s\\S]*?)</mtable>');
  const m = html.match(re);
  assert.ok(m, "missing kernel " + name);
  return [...m[1].matchAll(/<mtr>([\s\S]*?)<\/mtr>/g)].map((r) =>
    [...r[1].matchAll(/<mtd>([\s\S]*?)<\/mtd>/g)].map((c) =>
      Number(c[1].replace(/<[^>]+>/g, "").replace(/\s+/g, "").replace(/−/g, "-").replace(/\+/g, ""))
    )
  );
}
assert.deepStrictEqual(matrix("sobel-x"), [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]);
assert.deepStrictEqual(matrix("sobel-y"), [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]);
assert.deepStrictEqual(matrix("d2-dx2"), [[0, 0, 0], [1, -2, 1], [0, 0, 0]]);
assert.deepStrictEqual(matrix("d2-dy2"), [[0, 1, 0], [0, -2, 0], [0, 1, 0]]);
assert.deepStrictEqual(matrix("demo-four"), [[0, 1, 0], [1, -4, 1], [0, 1, 0]]);
assert.deepStrictEqual(matrix("weighted-eight"), [[1, 4, 1], [4, -20, 4], [1, 4, 1]]);
assert.ok(html.includes("Not used"));
assert.ok(html.includes("not the unweighted eight-neighbour kernel"));
assert.ok(!html.includes("\\begin"));
assert.ok(!html.includes("\\frac"));
assert.ok(html.includes('data-sigma="1"'));
assert.ok(html.includes("does not sample this surface"));
assert.ok(html.includes("not the 3 × 3 matrices"));
assert.ok(html.includes("The max norm is defined above and is not computed"));

{
  const defaults = { ksize: 5, sigma: 1.4, low: 50, high: 150, l2: false, lapT: 16, signed: false, steps: false };
  const selected = { ksize: 9, sigma: 2.2, low: 12, high: 40, l2: true, lapT: 25, signed: true, steps: true };
  const snapshot = Object.assign({}, selected);
  const applied = core.settingFields(selected);
  assert.deepStrictEqual(selected, snapshot, "reading a selection does not change the selected numbers");
  assert.strictEqual(applied.sigma, 2.2);
  assert.strictEqual(applied.ksize, 9);
  assert.strictEqual(applied.low, 12);
  assert.strictEqual(applied.high, 40);
  assert.strictEqual(applied.l2, true);
  assert.strictEqual(applied.lapT, 25);
  assert.strictEqual(core.settingsStale(defaults, selected), true);
  assert.strictEqual(core.settingsStale(applied, selected), false);
  selected.sigma = 4.1;
  assert.strictEqual(applied.sigma, 2.2, "the applied copy stays at the values from the click");
  assert.strictEqual(core.settingsStale(applied, selected), true);
  const g = new Uint8Array(64);
  for (let i = 0; i < g.length; i++) g[i] = i % 8 > 3 ? 220 : 8;
  const loose = core.process(g, 8, 8, { ksize: 3, sigma: 1, low: 1, high: 5, l2: false }, {});
  const tight = core.process(g, 8, 8, { ksize: 3, sigma: 1, low: 1, high: 8000, l2: false }, {});
  const count = (r) => [...r.edges].reduce((n, v) => n + (v ? 1 : 0), 0);
  assert.ok(count(loose) > count(tight), "the edge map follows the thresholds that were passed in");
}

{
  const page = fs.readFileSync(path.join(__dirname, "edge-detection.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "edge-detection.js"), "utf8");
  assert.ok(page.includes(">Play demo</button>"));
  assert.ok(page.includes("The pictures change only when you press Play demo."));
  assert.ok(page.includes("The pictures still show the previous settings."));
  assert.ok(!page.includes("Auto demo"));
  assert.ok(!page.includes("Play demo makes"));
  assert.ok(!js.includes("tourSample"));
  assert.ok(!js.includes("startTour"));
  assert.ok(!js.includes("requestAnimationFrame"));
  assert.ok(js.includes("applySelection"));
  assert.ok(page.includes("Derivative of a Gaussian"));
  assert.ok(page.includes("unit brightness ramp has gain 8"));
  assert.ok(page.includes("id=\"pair-dog\""));
  assert.ok(page.includes("id=\"pair-sobel\""));
}

{
  function ramp(w, h, slopeX, slopeY, offset) {
    const g = new Float64Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = offset + slopeX * x + slopeY * y;
    return g;
  }
  function sum(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }
  const ker = core.dogKernels(7, 1.4);
  assert.ok(Math.abs(sum(ker.dx)) < 1e-12, "derivative taps sum to zero");
  assert.strictEqual(ker.rampGain, 8);
  const kerB = core.dogKernels(7, 1.4);
  assert.strictEqual(ker.dx[0], kerB.dx[0], "the scale is fixed by sigma and the window, not by an image");
  assert.deepStrictEqual(core.dogKernels(1, 1.4).rampGain, 0);

  const w = 41, h = 21, ksize = 7, sigma = 1.2;
  const gxRamp = core.dogGradients(ramp(w, h, 1, 0, 30), w, h, ksize, sigma);
  const gyRamp = core.dogGradients(ramp(w, h, 0, 1, 5), w, h, ksize, sigma);
  const flat = core.dogGradients(ramp(w, h, 0, 0, 40), w, h, ksize, sigma);
  const steep = core.dogGradients(ramp(w, h, 3, 0, 0), w, h, ksize, sigma);
  const c = 10 * w + 20;
  assert.ok(Math.abs(flat.gx[c]) < 1e-6 && Math.abs(flat.gy[c]) < 1e-6, "constant image");
  assert.ok(Math.abs(gxRamp.gx[c] - 8) < 1e-4, "unit ramp in x has gain 8, got " + gxRamp.gx[c]);
  assert.ok(Math.abs(gxRamp.gy[c]) < 1e-4, "unit ramp in x has no y response");
  assert.ok(Math.abs(gyRamp.gy[c] - 8) < 1e-4, "unit ramp in y has gain 8, got " + gyRamp.gy[c]);
  assert.ok(Math.abs(gyRamp.gx[c]) < 1e-4);
  assert.ok(Math.abs(steep.gx[c] - 24) < 1e-3, "slope 3 is three times the unit gain, not a per-image normalisation");

  const step = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) step[y * w + x] = x < 20 ? 0 : 180;
  const stepG = core.dogGradients(step, w, h, ksize, sigma);
  assert.ok(stepG.gx[10 * w + 20] > 0, "bright on the right is a positive x derivative");
  const sobelStep = new Uint8Array(step.length);
  for (let i = 0; i < step.length; i++) sobelStep[i] = step[i];
  const sobelG = core.sobel(sobelStep, w, h);
  assert.ok(sobelG.gx[10 * w + 20] > 0, "Sobel agrees on the sign of that step");

  const blur = core.gaussianBlur(sobelStep, w, h, ksize, sigma);
  const sobelOnBlur = core.sobel(blur, w, h);
  const dogC = core.cannyFromGradients(stepG.gx, stepG.gy, w, h, 20, 60, false);
  const sobelC = core.cannyFromGradients(sobelOnBlur.gx, sobelOnBlur.gy, w, h, 20, 60, false);
  assert.strictEqual(dogC.edges.length, step.length);
  assert.strictEqual(sobelC.edges.length, step.length);
  assert.ok([...dogC.edges].some((v) => v === 255));
  assert.ok([...sobelC.edges].some((v) => v === 255));
}

console.log("edge-detection tests passed");
