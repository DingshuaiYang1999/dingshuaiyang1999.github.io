/* Harris corner detector. Plain JavaScript. The only photograph is the site portrait.
   Derivatives are 3×3 Sobel correlation (same signs as the edge-detection page).
   An optional Gaussian pre-smooth is the derivative scale. A second Gaussian,
   on the products Ix², Iy² and IxIy, is the integration scale. */
(function (root) {
  "use strict";

  function toGray(rgba, w, h) {
    var g = new Float64Array(w * h);
    for (var i = 0, j = 0; i < g.length; i++, j += 4) {
      g[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    }
    return g;
  }

  function reflect101(i, n) {
    if (n <= 1) return 0;
    while (i < 0 || i >= n) { if (i < 0) i = -i; if (i >= n) i = 2 * n - 2 - i; }
    return i;
  }

  function gaussianKernel(ksize, sigma) {
    var k = new Float64Array(ksize), c = (ksize - 1) / 2, sum = 0, i, t;
    var s2 = sigma > 0 ? sigma * sigma : 1;
    for (i = 0; i < ksize; i++) {
      t = i - c;
      k[i] = Math.exp(-(t * t) / (2 * s2));
      sum += k[i];
    }
    for (i = 0; i < ksize; i++) k[i] /= sum;
    return k;
  }

  /* Separable Gaussian, reflect-101, no rounding. ksize <= 1 copies the input. */
  function gaussianBlur(src, w, h, ksize, sigma) {
    var out = new Float64Array(w * h);
    if (!(ksize > 1)) {
      for (var i = 0; i < src.length; i++) out[i] = src[i];
      return out;
    }
    var k = gaussianKernel(ksize, sigma), rx = (ksize - 1) / 2;
    var tmp = new Float64Array(w * h);
    var idx = new Int32Array(w + 2 * rx), i, x, y, s;
    for (i = 0; i < idx.length; i++) idx[i] = reflect101(i - rx, w);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; for (i = 0; i < ksize; i++) s += k[i] * src[y * w + idx[x + i]];
      tmp[y * w + x] = s;
    }
    var idy = new Int32Array(h + 2 * rx);
    for (i = 0; i < idy.length; i++) idy[i] = reflect101(i - rx, h);
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      s = 0; for (i = 0; i < ksize; i++) s += k[i] * tmp[idy[y + i] * w + x];
      out[y * w + x] = s;
    }
    return out;
  }

  /* 3×3 Sobel correlation, replicate border. Positive x: brighter to the right.
     Positive y: brighter downward. */
  function sobel(g, w, h) {
    var ix = new Float64Array(w * h), iy = new Float64Array(w * h);
    for (var y = 0; y < h; y++) {
      var y0 = (y > 0 ? y - 1 : 0) * w, y1 = y * w, y2 = (y < h - 1 ? y + 1 : y) * w;
      for (var x = 0; x < w; x++) {
        var xa = x > 0 ? x - 1 : 0, xb = x < w - 1 ? x + 1 : x;
        var a = g[y0 + xa], b = g[y0 + x], c = g[y0 + xb];
        var d = g[y1 + xa], f = g[y1 + xb];
        var gg = g[y2 + xa], hh = g[y2 + x], ii = g[y2 + xb];
        ix[y1 + x] = (c + 2 * f + ii) - (a + 2 * d + gg);
        iy[y1 + x] = (gg + 2 * hh + ii) - (a + 2 * b + c);
      }
    }
    return { ix: ix, iy: iy };
  }

  /* Keep R > threshold if it is the unique maximum in the odd window, or the
     tied maximum with the smallest row-major index. Neighbours outside the
     image are ignored. */
  function suppress(R, w, h, nms, thr) {
    var out = new Uint8Array(w * h);
    var r = Math.max(0, (nms - 1) / 2 | 0);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = y * w + x, v = R[i];
      if (!(v > thr) || !(v > 0)) continue;
      var ok = true;
      for (var dy = -r; dy <= r && ok; dy++) for (var dx = -r; dx <= r; dx++) {
        if (!dx && !dy) continue;
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var j = ny * w + nx, u = R[j];
        if (u > v || (u === v && j < i)) { ok = false; break; }
      }
      if (ok) out[i] = 255;
    }
    return out;
  }

  function harris(gray, w, h, p) {
    var n = w * h;
    var src = (p.ksizeD > 1) ? gaussianBlur(gray, w, h, p.ksizeD, p.sigmaD) : gray;
    var s = sobel(src, w, h);
    var ixx = new Float64Array(n), iyy = new Float64Array(n), ixy = new Float64Array(n), i;
    for (i = 0; i < n; i++) {
      ixx[i] = s.ix[i] * s.ix[i];
      iyy[i] = s.iy[i] * s.iy[i];
      ixy[i] = s.ix[i] * s.iy[i];
    }
    var A = gaussianBlur(ixx, w, h, p.ksizeI, p.sigmaI);
    var B = gaussianBlur(iyy, w, h, p.ksizeI, p.sigmaI);
    var C = gaussianBlur(ixy, w, h, p.ksizeI, p.sigmaI);
    var R = new Float64Array(n), maxPos = 0, det, tr;
    for (i = 0; i < n; i++) {
      det = A[i] * B[i] - C[i] * C[i];
      tr = A[i] + B[i];
      R[i] = det - p.alpha * tr * tr;
      if (R[i] > maxPos) maxPos = R[i];
    }
    var frac = p.relThresh > 0 ? p.relThresh : 0;
    var thr = frac * maxPos;
    return {
      ix: s.ix, iy: s.iy, ixx: ixx, iyy: iyy, ixy: ixy,
      A: A, B: B, C: C, R: R, maxPos: maxPos, threshold: thr,
      corners: suppress(R, w, h, p.nms, thr)
    };
  }

  var core = {
    toGray: toGray, gaussianBlur: gaussianBlur, sobel: sobel, suppress: suppress, harris: harris
  };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.HarrisCore = core;
  if (typeof document === "undefined") return;

  var $ = function (id) { return document.getElementById(id); };
  var DEFAULTS = { ksizeD: 3, sigmaD: 1, ksizeI: 5, sigmaI: 1.5, alpha: 0.04, relThresh: 0.08, nms: 5 };
  var S = { w: 0, h: 0, rgba: null, gray: null, applied: null, last: null };
  var MAX_SIDE = 400;

  function say(m) { $("status").textContent = m; }
  function selection() {
    return {
      ksizeD: Number($("ksizeD").value), sigmaD: Number($("sigmaD").value),
      ksizeI: Number($("ksizeI").value), sigmaI: Number($("sigmaI").value),
      alpha: Number($("alpha").value), relThresh: Number($("rel").value),
      nms: Number($("nms").value)
    };
  }
  function same(a, b) {
    if (!a || !b) return false;
    var k;
    for (k in a) if (a[k] !== b[k]) return false;
    return true;
  }
  function refreshStale() {
    var stale = !!(S.applied && !same(S.applied, selection()));
    $("stale-note").hidden = !stale;
    $("btn-play").classList.toggle("primary", stale);
    $("btn-play").classList.toggle("secondary", !stale);
  }
  function showSelected() {
    var s = selection();
    $("ksizeD-out").textContent = s.ksizeD <= 1 ? "off" : (s.ksizeD + " × " + s.ksizeD);
    $("sigmaD-out").textContent = s.sigmaD.toFixed(1);
    $("ksizeI-out").textContent = s.ksizeI + " × " + s.ksizeI;
    $("sigmaI-out").textContent = s.sigmaI.toFixed(1);
    $("alpha-out").textContent = s.alpha.toFixed(2);
    $("rel-out").textContent = s.relThresh.toFixed(2);
    $("nms-out").textContent = s.nms + " × " + s.nms;
    refreshStale();
  }
  function writeControls(p) {
    $("ksizeD").value = p.ksizeD; $("sigmaD").value = p.sigmaD;
    $("ksizeI").value = p.ksizeI; $("sigmaI").value = p.sigmaI;
    $("alpha").value = p.alpha; $("rel").value = p.relThresh; $("nms").value = p.nms;
    showSelected();
  }

  var off = document.createElement("canvas"), offCtx = off.getContext("2d", { willReadFrequently: true });
  var ids = ["p-overlay", "p-r", "s-ix", "s-iy", "s-ixy", "s-ixx", "s-iyy", "s-a", "s-b", "s-c"];
  var ctxs = {};
  function layout() {
    ids.forEach(function (id) {
      var c = $(id); if (!c) return;
      if (c.width !== S.w || c.height !== S.h) { c.width = S.w; c.height = S.h; }
      ctxs[id] = c.getContext("2d");
    });
  }
  function paintAbs(id, arr) {
    var n = arr.length, m = 1e-12, i, g = ctxs[id], img, d, j;
    for (i = 0; i < n; i++) m = Math.max(m, Math.abs(arr[i]));
    img = g.createImageData(S.w, S.h); d = img.data;
    for (i = 0, j = 0; i < n; i++, j += 4) {
      var v = Math.round(128 + (arr[i] / m) * 127);
      if (v < 0) v = 0; else if (v > 255) v = 255;
      d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  function paintPos(id, arr) {
    var n = arr.length, m = 1e-12, i, g = ctxs[id], img, d, j, v;
    for (i = 0; i < n; i++) if (arr[i] > m) m = arr[i];
    img = g.createImageData(S.w, S.h); d = img.data;
    for (i = 0, j = 0; i < n; i++, j += 4) {
      v = Math.round(Math.max(0, arr[i]) / m * 255);
      if (v > 255) v = 255;
      d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  function overlay(corners) {
    var g = ctxs["p-overlay"];
    g.putImageData(new ImageData(new Uint8ClampedArray(S.rgba), S.w, S.h), 0, 0);
    g.strokeStyle = "#e23d2b";
    g.lineWidth = 1.5;
    var n = 0, i, x, y;
    for (i = 0; i < corners.length; i++) if (corners[i]) {
      n++;
      x = i % S.w; y = (i / S.w) | 0;
      g.beginPath();
      g.arc(x + 0.5, y + 0.5, 3.5, 0, Math.PI * 2);
      g.stroke();
    }
    return n;
  }

  function render(p) {
    if (!S.gray) return;
    var t0 = performance.now();
    var r = core.harris(S.gray, S.w, S.h, p);
    S.last = r;
    var n = overlay(r.corners);
    paintAbs("p-r", r.R);
    paintAbs("s-ix", r.ix); paintAbs("s-iy", r.iy); paintAbs("s-ixy", r.ixy);
    paintPos("s-ixx", r.ixx); paintPos("s-iyy", r.iyy);
    paintPos("s-a", r.A); paintPos("s-b", r.B); paintAbs("s-c", r.C);
    $("st-count").textContent = String(n);
    $("st-max").textContent = r.maxPos.toExponential(2);
    $("st-thr").textContent = r.threshold.toExponential(2);
    $("st-time").textContent = (performance.now() - t0).toFixed(1) + " ms";
  }

  function applySelection() {
    var s = selection();
    S.applied = s;
    render(s);
    refreshStale();
    say("Corners updated for the selected settings.");
  }

  function loadPortrait() {
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.max(8, Math.round(img.naturalWidth * scale));
      var h = Math.max(8, Math.round(img.naturalHeight * scale));
      off.width = w; off.height = h;
      offCtx.drawImage(img, 0, 0, w, h);
      S.w = w; S.h = h;
      S.rgba = offCtx.getImageData(0, 0, w, h).data;
      S.gray = core.toGray(S.rgba, w, h);
      layout();
      S.applied = selection();
      render(S.applied);
      refreshStale();
      say("Portrait loaded (" + w + " × " + h + "). Change a setting, then press Run.");
    };
    img.onerror = function () { say("The portrait could not be loaded."); };
    img.src = "../assets/avatar.jpg";
  }

  ["ksizeD", "sigmaD", "ksizeI", "sigmaI", "alpha", "rel", "nms"].forEach(function (id) {
    $(id).addEventListener("input", showSelected);
  });
  $("btn-play").addEventListener("click", applySelection);
  $("btn-defaults").addEventListener("click", function () {
    writeControls(DEFAULTS);
    say(S.applied && !same(S.applied, DEFAULTS)
      ? "Selected values are the defaults. Press Run to update the pictures."
      : "The pictures already show the defaults.");
  });
  writeControls(DEFAULTS);
  loadPortrait();
})(typeof window !== "undefined" ? window : globalThis);
