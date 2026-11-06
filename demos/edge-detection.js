/* Sobel and Canny edge-detection explorer. Plain JavaScript + <canvas>, no dependencies.

   The "core" (no DOM) follows edge_detection.py in
   github.com/DingshuaiYang1999/python-robotics-learning (05_computer_vision/edge_detection),
   which in turn reproduces OpenCV's cv2.Canny:
     gray -> Gaussian blur -> Sobel (3x3, replicated border) -> non-maximum suppression
          -> double threshold -> hysteresis (8-connected).
   The only photograph is the portrait stored on this site; everything is computed in the browser. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Core                                                                 */
  /* ------------------------------------------------------------------ */
  function toGray(rgba, w, h) {
    var g = new Uint8Array(w * h);
    for (var i = 0, j = 0; i < g.length; i++, j += 4) {
      g[i] = Math.round(0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]);
    }
    return g;
  }

  function gaussianKernel(ksize, sigma) {
    var k = new Float64Array(ksize), c = (ksize - 1) / 2, sum = 0, i;
    for (i = 0; i < ksize; i++) { k[i] = Math.exp(-((i - c) * (i - c)) / (2 * sigma * sigma)); sum += k[i]; }
    for (i = 0; i < ksize; i++) k[i] /= sum;
    return k;
  }

  /* mirror index without repeating the edge pixel (OpenCV BORDER_REFLECT_101) */
  function reflect101(i, n) {
    if (n === 1) return 0;
    while (i < 0 || i >= n) { if (i < 0) i = -i; if (i >= n) i = 2 * n - 2 - i; }
    return i;
  }

  /* separable Gaussian blur, result rounded to uint8 like cv2.GaussianBlur */
  function gaussianBlur(gray, w, h, ksize, sigma) {
    if (ksize <= 1) return gray.slice();
    var k = gaussianKernel(ksize, sigma), r = (ksize - 1) / 2, tmp = new Float32Array(w * h), out = new Uint8Array(w * h);
    var x, y, i, s, idx = new Int32Array(w + 2 * r);
    for (i = 0; i < w + 2 * r; i++) idx[i] = reflect101(i - r, w);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; for (i = 0; i < ksize; i++) s += k[i] * gray[y * w + idx[x + i]];
      tmp[y * w + x] = s;
    }
    var idy = new Int32Array(h + 2 * r);
    for (i = 0; i < h + 2 * r; i++) idy[i] = reflect101(i - r, h);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; for (i = 0; i < ksize; i++) s += k[i] * tmp[idy[y + i] * w + x];
      out[y * w + x] = Math.max(0, Math.min(255, Math.round(s)));
    }
    return out;
  }

  /* 3x3 Sobel with replicated border (what cv2.Canny uses internally). Gx: left->right, Gy: top->bottom. */
  function sobel(g, w, h) {
    var gx = new Int16Array(w * h), gy = new Int16Array(w * h);
    for (var y = 0; y < h; y++) {
      var y0 = (y > 0 ? y - 1 : 0) * w, y1 = y * w, y2 = (y < h - 1 ? y + 1 : y) * w;
      for (var x = 0; x < w; x++) {
        var xa = x > 0 ? x - 1 : 0, xb = x < w - 1 ? x + 1 : x;
        var a = g[y0 + xa], b = g[y0 + x], c = g[y0 + xb], d = g[y1 + xa], f = g[y1 + xb], gg = g[y2 + xa], hh = g[y2 + x], ii = g[y2 + xb];
        gx[y1 + x] = (c + 2 * f + ii) - (a + 2 * d + gg);
        gy[y1 + x] = (gg + 2 * hh + ii) - (a + 2 * b + c);
      }
    }
    return { gx: gx, gy: gy };
  }

  /* Sobel on a unit ramp (brightness increases by 1 per pixel) returns 8 in the interior.
     Derivative-of-Gaussian kernels are scaled to that same ramp gain. The scale is a
     property of the kernel, not of a particular picture. */
  var SOBEL_RAMP_GAIN = 8;

  /* Separable correlation kernels for ∂G/∂x and ∂G/∂y.
     Analytic ∂G/∂x = −(x/σ²) G is positive for negative x. Convolution with that
     function is a positive response when brightness increases toward +x. Correlation
     with the flipped samples is the same operation: the weight on a positive offset
     (right, or down) is positive. The derivative taps are stored antisymmetric, so
     they sum to 0. smooth[] is the Gaussian factor along the other axis.
     Returns dx already multiplied so that a unit ramp has gain SOBEL_RAMP_GAIN. */
  function dogKernels(ksize, sigma) {
    var empty = { dx: new Float64Array([0]), smooth: new Float64Array([1]), rampGain: 0 };
    if (!(ksize > 1) || !(sigma > 0)) return empty;
    var r = (ksize - 1) / 2, s2 = sigma * sigma, i, t, g;
    var dx = new Float64Array(ksize), smooth = new Float64Array(ksize);
    for (i = 0; i < ksize; i++) {
      t = i - r;
      g = Math.exp(-(t * t) / (2 * s2));
      smooth[i] = g;
      dx[i] = t * g;
    }
    for (i = 0; i < r; i++) dx[i] = -dx[ksize - 1 - i];
    dx[r] = 0;
    var moment = 0, mass = 0;
    for (i = 0; i < ksize; i++) { moment += (i - r) * dx[i]; mass += smooth[i]; }
    var rawGain = moment * mass;
    var scale = rawGain !== 0 ? SOBEL_RAMP_GAIN / rawGain : 0;
    for (i = 0; i < ksize; i++) dx[i] *= scale;
    return { dx: dx, smooth: smooth, rampGain: rawGain !== 0 ? SOBEL_RAMP_GAIN : 0 };
  }

  /* Separable correlation. kx runs along x, ky along y. Borders are reflect-101. */
  function correlateSeparable(gray, w, h, kx, ky) {
    var out = new Float32Array(w * h);
    if (kx.length <= 1 && ky.length <= 1) return out;
    var rx = (kx.length - 1) / 2, ry = (ky.length - 1) / 2;
    var tmp = new Float32Array(w * h);
    var idx = new Int32Array(w + 2 * rx), idy = new Int32Array(h + 2 * ry), i, x, y, s;
    for (i = 0; i < idx.length; i++) idx[i] = reflect101(i - rx, w);
    for (i = 0; i < idy.length; i++) idy[i] = reflect101(i - ry, h);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; for (i = 0; i < kx.length; i++) s += kx[i] * gray[y * w + idx[x + i]];
      tmp[y * w + x] = s;
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; for (i = 0; i < ky.length; i++) s += ky[i] * tmp[idy[y + i] * w + x];
      out[y * w + x] = s;
    }
    return out;
  }

  /* Direct first derivatives of a Gaussian on the grayscale image. Not blur-then-Sobel. */
  function dogGradients(gray, w, h, ksize, sigma) {
    var z = new Float32Array(w * h);
    if (!(ksize > 1) || !(sigma > 0)) return { gx: z, gy: new Float32Array(w * h), rampGain: 0 };
    var ker = dogKernels(ksize, sigma);
    return {
      gx: correlateSeparable(gray, w, h, ker.dx, ker.smooth),
      gy: correlateSeparable(gray, w, h, ker.smooth, ker.dx),
      rampGain: ker.rampGain
    };
  }

  function cannyFromGradients(gx, gy, w, h, low, high, l2) {
    var m = strength(gx, gy, l2);
    var keep = nonMaxSuppress(gx, gy, m, w, h);
    var st = doubleThreshold(keep, m, low, high, l2);
    return { gx: gx, gy: gy, strength: m, thin: keep, state: st, edges: hysteresis(st, w, h) };
  }

  /* Discrete Laplacian: correlation with the symmetric 4-neighbour kernel
     [0 1 0; 1 -4 1; 0 1 0], negative centre, replicate border (same border as Sobel).
     Entrywise this is the second difference in x plus the second difference in y.
     The weighted eight-neighbour kernel (1, 4, −20) is not applied. */
  function laplacian(g, w, h) {
    var out = new Int16Array(w * h);
    for (var y = 0; y < h; y++) {
      var ym = (y > 0 ? y - 1 : 0) * w, y0 = y * w, yp = (y < h - 1 ? y + 1 : y) * w;
      for (var x = 0; x < w; x++) {
        var xm = x > 0 ? x - 1 : 0, xp = x < w - 1 ? x + 1 : x;
        out[y0 + x] = g[ym + x] + g[yp + x] + g[y0 + xm] + g[y0 + xp] - 4 * g[y0 + x];
      }
    }
    return out;
  }

  /* Sign-change edges. A 4-connected pair counts when the samples are not the same
     strict sign and |a − b| is at least minJump. The mark sits on the sample closer
     to zero; an exact tie marks the negative sample; an exact zero marks that sample.
     Thresholding |L| is a different test (see absAtLeast). */
  function zeroCrossings(lap, w, h, minJump) {
    var out = new Uint8Array(w * h);
    var jump = minJump > 0 ? minJump : 0;
    function pair(i, j) {
      var a = lap[i], b = lap[j];
      if ((a > 0 && b > 0) || (a < 0 && b < 0)) return;
      if (a === 0 && b === 0) return;
      if (Math.abs(a - b) < jump) return;
      if (a === 0) { out[i] = 255; return; }
      if (b === 0) { out[j] = 255; return; }
      var aa = a < 0 ? -a : a, bb = b < 0 ? -b : b;
      if (aa < bb) out[i] = 255;
      else if (bb < aa) out[j] = 255;
      else out[a < 0 ? i : j] = 255;
    }
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        if (x + 1 < w) pair(i, i + 1);
        if (y + 1 < h) pair(i, i + w);
      }
    }
    return out;
  }

  /* White where |L| ≥ t. At t = 0 every pixel passes. This is not a zero-crossing map. */
  function absAtLeast(lap, t) {
    var out = new Uint8Array(lap.length), thr = t > 0 ? t : 0, i, a;
    for (i = 0; i < lap.length; i++) {
      a = lap[i] < 0 ? -lap[i] : lap[i];
      if (a >= thr) out[i] = 255;
    }
    return out;
  }

  /* Gradient strength in comparable units: |Gx|+|Gy| (L1, OpenCV default) or Gx^2+Gy^2 (L2, thresholds squared). */
  function strength(gx, gy, l2) {
    var m = new Float32Array(gx.length);
    for (var i = 0; i < m.length; i++) m[i] = l2 ? gx[i] * gx[i] + gy[i] * gy[i] : Math.abs(gx[i]) + Math.abs(gy[i]);
    return m;
  }

  /* Keep only local maxima along the gradient direction (same comparison rule as OpenCV). */
  function nonMaxSuppress(gx, gy, m, w, h) {
    var keep = new Uint8Array(w * h), TG22 = 13573;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = y * w + x, v = m[i];
      if (v === 0) continue;
      var xs = gx[i], ys = gy[i], ax = Math.abs(xs), ay = Math.abs(ys) * 32768, tg22x = ax * TG22;
      var L = x > 0 ? m[i - 1] : 0, R = x < w - 1 ? m[i + 1] : 0, U = y > 0 ? m[i - w] : 0, D = y < h - 1 ? m[i + w] : 0;
      var ok;
      if (ay < tg22x) ok = v > L && v >= R;                 // gradient mostly horizontal: vertical edge
      else if (ay > tg22x + ax * 65536) ok = v > U && v >= D; // gradient mostly vertical: horizontal edge
      else {
        var UL = x > 0 && y > 0 ? m[i - w - 1] : 0, UR = x < w - 1 && y > 0 ? m[i - w + 1] : 0;
        var DL = x > 0 && y < h - 1 ? m[i + w - 1] : 0, DR = x < w - 1 && y < h - 1 ? m[i + w + 1] : 0;
        ok = (xs < 0) !== (ys < 0) && xs !== 0 && ys !== 0 ? (v > UR && v > DL) : (v > UL && v > DR);
      }
      if (ok) keep[i] = 1;
    }
    return keep;
  }

  /* 0 = rejected, 1 = weak candidate, 2 = strong */
  function doubleThreshold(keep, m, low, high, l2) {
    if (low > high) { var t = low; low = high; high = t; }
    var lo = l2 ? low * low : low, hi = l2 ? high * high : high, st = new Uint8Array(keep.length);
    for (var i = 0; i < st.length; i++) if (keep[i] && m[i] > lo) st[i] = m[i] > hi ? 2 : 1;
    return st;
  }

  /* keep weak pixels only if an 8-connected chain reaches a strong pixel */
  function hysteresis(st, w, h) {
    var out = new Uint8Array(w * h), stack = new Int32Array(w * h), sp = 0, i;
    for (i = 0; i < st.length; i++) if (st[i] === 2) { out[i] = 255; stack[sp++] = i; }
    while (sp) {
      i = stack[--sp];
      var x = i % w, y = (i / w) | 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var j = ny * w + nx;
        if (st[j] === 1 && !out[j]) { out[j] = 255; stack[sp++] = j; }
      }
    }
    return out;
  }

  /* Canny steps 2-5 on an already blurred uint8 image (cv2.Canny does not blur by itself). */
  function canny(blurred, w, h, low, high, l2, cache) {
    var key = blurred, c = cache || {};
    if (c.key !== key || c.l2 !== l2) {
      var s = sobel(blurred, w, h), m = strength(s.gx, s.gy, l2);
      c.key = key; c.l2 = l2; c.gx = s.gx; c.gy = s.gy; c.m = m; c.keep = nonMaxSuppress(s.gx, s.gy, m, w, h);
    }
    var st = doubleThreshold(c.keep, c.m, low, high, l2);
    return { gx: c.gx, gy: c.gy, strength: c.m, thin: c.keep, state: st, edges: hysteresis(st, w, h) };
  }

  /* All stages for one parameter set. */
  function process(gray, w, h, p, cache) {
    var t0 = typeof performance !== "undefined" ? performance.now() : 0;
    var c = cache || {};
    if (c.blurKey !== gray || c.ksize !== p.ksize || c.sigma !== p.sigma) {
      c.blurKey = gray; c.ksize = p.ksize; c.sigma = p.sigma;
      c.blurred = gaussianBlur(gray, w, h, p.ksize, p.sigma);
    }
    var r = canny(c.blurred, w, h, p.low, p.high, p.l2, c.canny || (c.canny = {}));
    r.gray = gray; r.blurred = c.blurred; r.ms = typeof performance !== "undefined" ? performance.now() - t0 : 0;
    return r;
  }

  /* Agreement of two binary edge maps: F1 where a pixel matches if the other map has an edge within `tol` px. */
  function agreement(a, b, w, h, tol) {
    tol = tol == null ? 1 : tol;
    function near(src) {
      var out = new Uint8Array(w * h);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (src[y * w + x]) {
        for (var dy = -tol; dy <= tol; dy++) for (var dx = -tol; dx <= tol; dx++) {
          var nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1;
        }
      }
      return out;
    }
    var na = near(a), nb = near(b), ca = 0, cb = 0, ma = 0, mb = 0, same = 0;
    for (var i = 0; i < a.length; i++) {
      var A = a[i] ? 1 : 0, B = b[i] ? 1 : 0;
      ca += A; cb += B; if (A && nb[i]) ma++; if (B && na[i]) mb++; if (A === B) same++;
    }
    var pr = ma / Math.max(ca, 1), rc = mb / Math.max(cb, 1);
    return { exact: same / a.length, f1: 2 * pr * rc / Math.max(pr + rc, 1e-12), edgesA: ca, edgesB: cb };
  }

  /* Selected controls versus the settings last drawn. Play copies selected onto applied.
     It does not rewrite the selected numbers. */
  function settingFields(p) {
    return {
      ksize: Number(p.ksize), sigma: Number(p.sigma), low: Number(p.low), high: Number(p.high),
      l2: !!p.l2, lapT: Number(p.lapT), signed: !!p.signed, steps: !!p.steps
    };
  }
  function settingsStale(applied, selected) {
    var a = settingFields(applied), b = settingFields(selected), k;
    for (k in a) if (a[k] !== b[k]) return true;
    return false;
  }

  var core = { toGray: toGray, gaussianKernel: gaussianKernel, gaussianBlur: gaussianBlur, sobel: sobel, strength: strength,
    laplacian: laplacian, zeroCrossings: zeroCrossings, absAtLeast: absAtLeast,
    dogKernels: dogKernels, dogGradients: dogGradients, cannyFromGradients: cannyFromGradients,
    settingFields: settingFields, settingsStale: settingsStale,
    nonMaxSuppress: nonMaxSuppress, doubleThreshold: doubleThreshold, hysteresis: hysteresis, canny: canny, process: process, agreement: agreement };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.EdgeCore = core;
  if (typeof document === "undefined") return;

  /* ------------------------------------------------------------------ */
  /* UI                                                                   */
  /* ------------------------------------------------------------------ */
  var $ = function (id) { return document.getElementById(id); };
  var DEFAULTS = { ksize: 5, sigma: 1.4, low: 50, high: 150, l2: false, lapT: 16, signed: false, steps: false };
  var S = {
    w: 0, h: 0, rgba: null, gray: null, params: { ksize: 5, sigma: 1.4, low: 50, high: 150, l2: false, lapT: 16 },
    signed: false, steps: false, cache: {}, last: null
  };
  var MAX_SIDE = 400;
  var statusEl = $("status");
  function say(m) { statusEl.textContent = m; }

  var off = document.createElement("canvas"), offCtx = off.getContext("2d", { willReadFrequently: true });

  function setImageFrom(src, sw, sh) {
    var scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    var w = Math.max(8, Math.round(sw * scale)), h = Math.max(8, Math.round(sh * scale));
    off.width = w; off.height = h;
    offCtx.imageSmoothingQuality = "high";
    offCtx.drawImage(src, 0, 0, w, h);
    S.w = w; S.h = h; S.rgba = offCtx.getImageData(0, 0, w, h).data; S.gray = toGray(S.rgba, w, h);
    S.cache = {};
    layoutPanels(); render();
  }
  /* The only input: the site owner's portrait that is already part of this repository (assets/avatar.jpg). */
  var PORTRAIT_URL = "../assets/avatar.jpg";
  function loadPortrait() {
    var img = new Image();
    img.onload = function () {
      setImageFrom(img, img.naturalWidth, img.naturalHeight);
      say("Portrait loaded (" + S.w + " × " + S.h + " pixels). Move the sliders to change the result.");
    };
    img.onerror = function () { say("The portrait could not be loaded."); };
    img.src = PORTRAIT_URL;
  }

  /* ----- panels ----- */
  var panelIds = ["p-orig", "p-gray", "p-sx", "p-sy", "p-mag", "p-canny", "s-blur", "s-thin", "s-thr", "s-final",
    "cmp-sobel", "cmp-canny", "cmp-lap", "pair-sobel", "pair-dog", "lap-signed", "lap-abs", "lap-thr", "lap-zero"];
  var ctxs = {};
  function layoutPanels() {
    panelIds.forEach(function (id) {
      var c = $(id); if (!c) return;
      if (c.width !== S.w || c.height !== S.h) { c.width = S.w; c.height = S.h; }
      c.style.aspectRatio = S.w + " / " + S.h;
      ctxs[id] = c.getContext("2d");
    });
  }
  function paintGray(id, arr) {
    var g = ctxs[id], img = g.createImageData(S.w, S.h), d = img.data;
    for (var i = 0, j = 0; i < arr.length; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = arr[i]; d[j + 3] = 255; }
    g.putImageData(img, 0, 0);
  }

  function render() {
    if (!S.gray) return;
    var p = S.params, r = process(S.gray, S.w, S.h, p, S.cache), n = S.w * S.h, i;
    S.last = r;
    // original colour
    ctxs["p-orig"].putImageData(new ImageData(new Uint8ClampedArray(S.rgba), S.w, S.h), 0, 0);
    paintGray("p-gray", r.gray);
    // Sobel panels share one scale so that x and y can be compared
    var mx = 1, sx = new Uint8Array(n), sy = new Uint8Array(n), mg = new Uint8Array(n), mmax = 1, v;
    for (i = 0; i < n; i++) { mx = Math.max(mx, Math.abs(r.gx[i]), Math.abs(r.gy[i])); }
    for (i = 0; i < n; i++) {
      if (S.signed) { sx[i] = 128 + (r.gx[i] / mx) * 127; sy[i] = 128 + (r.gy[i] / mx) * 127; }
      else { sx[i] = Math.abs(r.gx[i]) / mx * 255; sy[i] = Math.abs(r.gy[i]) / mx * 255; }
      v = Math.sqrt(r.gx[i] * r.gx[i] + r.gy[i] * r.gy[i]); mg[i] = v; if (v > mmax) mmax = v;
    }
    for (i = 0; i < n; i++) mg[i] = mg[i] / mmax * 255;
    paintGray("p-sx", sx); paintGray("p-sy", sy); paintGray("p-mag", mg); paintGray("p-canny", r.edges);
    /* Laplacian of the same blurred image. Displays do not share one scale with Sobel or Canny. */
    var lap = laplacian(r.blurred, S.w, S.h), zc = zeroCrossings(lap, S.w, S.h, p.lapT), ath = absAtLeast(lap, p.lapT);
    var lmax = 1, signedL = new Uint8Array(n), absL = new Uint8Array(n), sVal, aVal;
    for (i = 0; i < n; i++) { aVal = lap[i] < 0 ? -lap[i] : lap[i]; if (aVal > lmax) lmax = aVal; }
    for (i = 0; i < n; i++) {
      sVal = Math.round(128 + (lap[i] / lmax) * 127);
      signedL[i] = sVal < 0 ? 0 : sVal > 255 ? 255 : sVal;
      aVal = Math.round((lap[i] < 0 ? -lap[i] : lap[i]) / lmax * 255);
      absL[i] = aVal > 255 ? 255 : aVal;
    }
    paintGray("lap-signed", signedL); paintGray("lap-abs", absL); paintGray("lap-thr", ath); paintGray("lap-zero", zc);
    paintGray("cmp-sobel", mg); paintGray("cmp-canny", r.edges); paintGray("cmp-lap", zc);
    paintGray("pair-sobel", r.edges);
    var dog = dogGradients(S.gray, S.w, S.h, p.ksize, p.sigma);
    var dogC = cannyFromGradients(dog.gx, dog.gy, S.w, S.h, p.low, p.high, p.l2);
    paintGray("pair-dog", dogC.edges);
    if (S.steps) {
      var thin = new Uint8Array(n), thr = new Uint8Array(n);
      for (i = 0; i < n; i++) {
        thin[i] = r.thin[i] ? 255 : 0;
        thr[i] = r.state[i] === 2 ? 255 : r.state[i] === 1 ? 110 : 0;
      }
      paintGray("s-blur", r.blurred); paintGray("s-thin", thin); paintGray("s-thr", thr); paintGray("s-final", r.edges);
    }
    var strong = 0, weak = 0, kept = 0, thinN = 0;
    for (i = 0; i < n; i++) { if (r.state[i] === 2) strong++; else if (r.state[i] === 1) weak++; if (r.edges[i]) kept++; if (r.thin[i]) thinN++; }
    $("st-size").textContent = S.w + " × " + S.h;
    $("st-strong").textContent = strong.toLocaleString("en-US");
    $("st-weak").textContent = weak.toLocaleString("en-US");
    $("st-edges").textContent = kept.toLocaleString("en-US") + " (" + (kept / n * 100).toFixed(1) + " %)";
    $("st-time").textContent = r.ms.toFixed(1) + " ms";
    $("l2-note").textContent = p.l2 ? "Both Canny pictures compare Gx² + Gy² with the squared thresholds." : "Both Canny pictures use strength |Gx| + |Gy| (OpenCV’s default for the Sobel path).";
  }

  /* ----- controls -----
     Widgets show the selected values immediately. Pictures stay on the last Play
     until the user presses Play demo again. Play never writes the widgets. */
  function appliedSelection() {
    return { ksize: S.params.ksize, sigma: S.params.sigma, low: S.params.low, high: S.params.high, l2: S.params.l2, lapT: S.params.lapT, signed: S.signed, steps: S.steps };
  }
  function selection() {
    return {
      ksize: Number($("ksize").value), sigma: Number($("sigma").value),
      low: Number($("low").value), high: Number($("high").value),
      l2: $("l2").checked, lapT: Number($("lap-t").value),
      signed: $("signed").checked, steps: $("steps").checked
    };
  }
  function refreshStale() {
    var stale = settingsStale(appliedSelection(), selection());
    var note = $("stale-note"), btn = $("btn-play");
    if (note) note.hidden = !stale;
    if (btn) {
      btn.classList.toggle("primary", stale);
      btn.classList.toggle("secondary", !stale);
    }
    return stale;
  }
  function showSelected(which) {
    var v = Number($(which).value);
    if (which === "ksize") $("ksize-out").textContent = v + " × " + v;
    if (which === "sigma") $("sigma-out").textContent = v.toFixed(1);
    if (which === "low") $("low-out").textContent = String(Math.round(v));
    if (which === "high") $("high-out").textContent = String(Math.round(v));
    if (which === "lap-t") $("lap-t-out").textContent = String(Math.round(v));
    refreshStale();
  }
  function syncControls() {
    var p = S.params;
    $("ksize").value = p.ksize; $("sigma").value = p.sigma; $("low").value = p.low; $("high").value = p.high;
    $("l2").checked = p.l2; $("lap-t").value = p.lapT;
    $("signed").checked = S.signed; $("steps").checked = S.steps;
    $("steps-wrap").hidden = !S.steps;
    ["ksize", "sigma", "low", "high", "lap-t"].forEach(showSelected);
  }
  function applySelection() {
    var before = selection();
    var s = settingFields(before);
    S.params.ksize = s.ksize; S.params.sigma = s.sigma; S.params.low = s.low; S.params.high = s.high;
    S.params.l2 = s.l2; S.params.lapT = s.lapT; S.signed = s.signed; S.steps = s.steps;
    $("steps-wrap").hidden = !S.steps;
    if (S.steps) layoutPanels();
    render();
    refreshStale();
    say("Pictures updated for the selected settings.");
    return { before: before, after: selection() };
  }
  ["ksize", "sigma", "low", "high", "lap-t"].forEach(function (id) {
    $(id).addEventListener("input", function () { showSelected(id); });
  });
  ["l2", "signed", "steps"].forEach(function (id) {
    $(id).addEventListener("change", function () { refreshStale(); });
  });
  $("btn-defaults").addEventListener("click", function () {
    $("ksize").value = DEFAULTS.ksize; $("sigma").value = DEFAULTS.sigma;
    $("low").value = DEFAULTS.low; $("high").value = DEFAULTS.high;
    $("l2").checked = DEFAULTS.l2; $("lap-t").value = DEFAULTS.lapT;
    $("signed").checked = DEFAULTS.signed; $("steps").checked = DEFAULTS.steps;
    ["ksize", "sigma", "low", "high", "lap-t"].forEach(showSelected);
    say(refreshStale() ? "Selected values are the defaults. Press Play demo to update the pictures." : "The pictures already show the defaults.");
  });
  $("btn-play").addEventListener("click", function () { applySelection(); });

  /* ----- init ----- */
  function init() {
    var q = new URLSearchParams(location.search);
    if (q.get("steps") === "1") { $("steps").checked = true; S.steps = true; $("steps-wrap").hidden = false; }
    if (q.get("l2") === "1") S.params.l2 = true;
    if (q.get("lap") != null && !isNaN(Number(q.get("lap")))) S.params.lapT = Number(q.get("lap"));
    ["ksize", "sigma", "low", "high"].forEach(function (k) { if (q.get(k) != null && !isNaN(Number(q.get(k)))) S.params[k] = Number(q.get(k)); });
    syncControls();
    refreshStale();
    S.w = 400; S.h = 400; layoutPanels();
    loadPortrait();
    root.__edge = { state: S, core: core, render: render, applySelection: applySelection, selection: selection };
  }
  init();
})(typeof window !== "undefined" ? window : globalThis);
