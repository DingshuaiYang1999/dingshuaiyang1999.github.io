/* k-Nearest Neighbours playground. Plain JavaScript + <canvas>, no dependencies.

   The classifier ("core") has no DOM code and mirrors knn_from_scratch.py in
   github.com/DingshuaiYang1999/python-robotics-learning (05_computer_vision/knn):
     - distance: Euclidean or Manhattan,
     - the k nearest points vote, equal distances are resolved by the lower point index,
     - if classes tie, the class holding the single nearest tied neighbour wins.
   The world is 800 x 600 units. */
(function (root) {
  "use strict";

  var W = 800, H = 600;

  /* ------------------------------------------------------------------ */
  /* Core                                                                 */
  /* ------------------------------------------------------------------ */
  function mulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) { // Box-Muller
    var u = 1 - rng(), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function distance(ax, ay, bx, by, metric) {
    var dx = ax - bx, dy = ay - by;
    return metric === "manhattan" ? Math.abs(dx) + Math.abs(dy) : Math.sqrt(dx * dx + dy * dy);
  }

  /* Indices and distances of the k nearest points, nearest first.
     Scanning in index order and inserting after entries of equal distance
     gives the same result as a stable sort. */
  function kNearest(points, qx, qy, k, metric, skip) {
    var best = []; // [{i, d}] sorted ascending
    k = Math.min(k, points.length - (skip >= 0 ? 1 : 0));
    for (var i = 0; i < points.length; i++) {
      if (i === skip) continue;
      var d = distance(points[i].x, points[i].y, qx, qy, metric);
      if (best.length === k && d >= best[k - 1].d) continue;
      var pos = best.length;
      while (pos > 0 && best[pos - 1].d > d) pos--;
      best.splice(pos, 0, { i: i, d: d });
      if (best.length > k) best.pop();
    }
    return best;
  }

  function classify(points, qx, qy, k, metric, nClasses, skip) {
    var nb = kNearest(points, qx, qy, k, metric, skip == null ? -1 : skip);
    var votes = new Array(nClasses).fill(0), j;
    for (j = 0; j < nb.length; j++) votes[points[nb[j].i].c]++;
    var max = 0, label = -1;
    for (j = 0; j < nClasses; j++) if (votes[j] > max) max = votes[j];
    for (j = 0; j < nb.length; j++) {            // nearest neighbour among the tied classes
      var c = points[nb[j].i].c;
      if (votes[c] === max) { label = c; break; }
    }
    var tied = 0;
    for (j = 0; j < nClasses; j++) if (votes[j] === max && max > 0) tied++;
    return { label: label, votes: votes, neighbors: nb, tie: tied > 1, k: nb.length };
  }

  function leaveOneOut(points, k, metric, nClasses) {
    if (points.length < 2) return null;
    var ok = 0;
    for (var i = 0; i < points.length; i++) {
      if (classify(points, points[i].x, points[i].y, k, metric, nClasses, i).label === points[i].c) ok++;
    }
    return ok / points.length;
  }

  var core = { W: W, H: H, distance: distance, kNearest: kNearest, classify: classify, leaveOneOut: leaveOneOut };

  /* ----- datasets (world units, 800 x 600) ----- */
  function clampPt(p) { p.x = Math.min(W - 14, Math.max(14, p.x)); p.y = Math.min(H - 14, Math.max(14, p.y)); return p; }

  var PRESETS = {
    blobs: { label: "Three clusters", classes: 3, make: function (rng) {
      var cs = [[230, 400], [570, 400], [400, 160]], pts = [];
      cs.forEach(function (c, ci) { for (var i = 0; i < 24; i++) pts.push(clampPt({ x: c[0] + gauss(rng) * 62, y: c[1] + gauss(rng) * 62, c: ci })); });
      return pts;
    } },
    moons: { label: "Two moons", classes: 2, make: function (rng) {
      var pts = [], i, t;
      for (i = 0; i < 40; i++) {
        t = rng() * Math.PI;
        pts.push(clampPt({ x: 290 + Math.cos(t) * 190 + gauss(rng) * 14, y: 270 - Math.sin(t) * 190 + gauss(rng) * 14, c: 0 }));
        t = rng() * Math.PI;
        pts.push(clampPt({ x: 510 - Math.cos(t) * 190 + gauss(rng) * 14, y: 330 + Math.sin(t) * 190 + gauss(rng) * 14, c: 1 }));
      }
      return pts;
    } },
    xor: { label: "Checkerboard", classes: 2, make: function (rng) {
      var pts = [], i;
      for (i = 0; i < 80; i++) {
        var qx = i % 2, qy = (i >> 1) % 2;
        pts.push(clampPt({ x: 60 + qx * 340 + rng() * 280, y: 60 + qy * 240 + rng() * 220, c: (qx + qy) % 2 }));
      }
      return pts;
    } },
    rings: { label: "Concentric rings", classes: 2, make: function (rng) {
      var pts = [], i, a, r;
      for (i = 0; i < 90; i++) {
        a = rng() * Math.PI * 2; r = i % 2 ? 90 + gauss(rng) * 12 : 215 + gauss(rng) * 14;
        pts.push(clampPt({ x: 400 + Math.cos(a) * r, y: 300 + Math.sin(a) * r, c: i % 2 }));
      }
      return pts;
    } },
    spiral: { label: "Three-arm spiral", classes: 3, make: function (rng) {
      var pts = [], arm, i, t, a;
      for (arm = 0; arm < 3; arm++) for (i = 0; i < 30; i++) {
        t = 0.12 + (i / 29) * 0.88; a = arm * Math.PI * 2 / 3 + t * 3.6;
        pts.push(clampPt({ x: 400 + Math.cos(a) * t * 250 + gauss(rng) * 7, y: 300 + Math.sin(a) * t * 250 + gauss(rng) * 7, c: arm }));
      }
      return pts;
    } },
    random: { label: "Random clusters", classes: 3, make: function (rng) {
      var n = 2 + Math.floor(rng() * 2), pts = [], ci, i, cx, cy, s;
      for (ci = 0; ci < n; ci++) {
        cx = 130 + rng() * 540; cy = 130 + rng() * 340; s = 40 + rng() * 40;
        for (i = 0; i < 22; i++) pts.push(clampPt({ x: cx + gauss(rng) * s, y: cy + gauss(rng) * s, c: ci }));
      }
      return pts;
    } },
    empty: { label: "Empty canvas", classes: 3, make: function () { return []; } }
  };
  core.presets = PRESETS;
  core.makePreset = function (name, seed) { return PRESETS[name].make(mulberry32(seed == null ? 7 : seed)); };

  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.KNNCore = core;
  if (typeof document === "undefined") return;

  /* ------------------------------------------------------------------ */
  /* UI                                                                   */
  /* ------------------------------------------------------------------ */
  var CLASS_NAMES = ["Blue circles", "Orange squares", "Green triangles"];
  var CLASS_SHORT = ["Blue", "Orange", "Green"];
  var PALETTE = {
    light: { cls: ["#2a6fbb", "#d2823f", "#1b8f7d"], bg: "#f7f8fa", ring: "#04316a", casing: "#ffffff", grid: "#e6e9ee" },
    dark: { cls: ["#6fa3e0", "#e5985c", "#2fb59f"], bg: "#151a20", ring: "#b3cdf3", casing: "#0b1218", grid: "#212830" }
  };
  function hexToRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("map"), ctx = canvas.getContext("2d");
  var statusEl = $("status");
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;

  var S = {
    points: [], nClasses: 3, cls: 0, tool: "add", k: 5, metric: "euclidean", boundary: true,
    qx: 400, qy: 300, preset: "blobs", seed: 7, drag: -1, tour: null
  };
  var dirtyHeat = true, dirty = true, heat = document.createElement("canvas");
  var GW = 160, GH = 120;
  heat.width = GW; heat.height = GH;
  var view = { w: 800, h: 600, dpr: 1, sx: 1 };

  function theme() { return document.documentElement.getAttribute("data-theme") === "dark" ? PALETTE.dark : PALETTE.light; }
  function say(msg) { statusEl.textContent = msg; }
  function usedClasses() {
    var n = 0;
    S.points.forEach(function (p) { if (p.c + 1 > n) n = p.c + 1; });
    return Math.max(n, 2);
  }
  function kMax() { return Math.max(1, Math.min(25, S.points.length || 1)); }

  /* ----- layout ----- */
  function resize() {
    var box = canvas.getBoundingClientRect(), dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    view.w = box.width; view.h = box.height; view.dpr = dpr; view.sx = box.width / W;
    canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
    dirty = true;
  }
  function toWorld(ev) {
    var r = canvas.getBoundingClientRect();
    return { x: Math.min(W, Math.max(0, (ev.clientX - r.left) / r.width * W)), y: Math.min(H, Math.max(0, (ev.clientY - r.top) / r.height * H)) };
  }

  /* ----- decision-boundary image ----- */
  function rebuildHeat() {
    var pal = theme(), bg = hexToRgb(pal.bg), cols = pal.cls.map(hexToRgb);
    var img = heat.getContext("2d").createImageData(GW, GH), d = img.data;
    var n = S.points.length, nc = Math.max(S.nClasses, 3);
    for (var gy = 0; gy < GH; gy++) for (var gx = 0; gx < GW; gx++) {
      var o = (gy * GW + gx) * 4, r = bg[0], g = bg[1], b = bg[2], a = 255;
      if (n > 0) {
        var res = classify(S.points, (gx + 0.5) / GW * W, (gy + 0.5) / GH * H, S.k, S.metric, nc);
        var frac = res.votes[res.label] / res.k, alpha = 0.16 + 0.36 * frac, c = cols[res.label];
        r = bg[0] + (c[0] - bg[0]) * alpha; g = bg[1] + (c[1] - bg[1]) * alpha; b = bg[2] + (c[2] - bg[2]) * alpha;
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
    }
    heat.getContext("2d").putImageData(img, 0, 0);
    dirtyHeat = false;
  }

  /* ----- drawing ----- */
  function marker(c, x, y, rad, fill, stroke, lw) {
    ctx.beginPath();
    if (c === 0) ctx.arc(x, y, rad, 0, Math.PI * 2);
    else if (c === 1) ctx.rect(x - rad * 0.88, y - rad * 0.88, rad * 1.76, rad * 1.76);
    else { ctx.moveTo(x, y - rad * 1.1); ctx.lineTo(x + rad * 1.05, y + rad * 0.8); ctx.lineTo(x - rad * 1.05, y + rad * 0.8); ctx.closePath(); }
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke();
  }
  var PT_R = function () { return coarse ? 8 : 6.5; };

  function draw() {
    dirty = false;
    var pal = theme(), sx = view.sx;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.w, view.h);
    if (S.boundary) {
      if (dirtyHeat) rebuildHeat();
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "low";
      ctx.drawImage(heat, 0, 0, view.w, view.h);
    } else {
      ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, view.w, view.h);
    }
    // faint grid
    ctx.strokeStyle = pal.grid; ctx.globalAlpha = S.boundary ? 0.5 : 1; ctx.lineWidth = 1; ctx.beginPath();
    for (var gx = 100; gx < W; gx += 100) { ctx.moveTo(gx * sx, 0); ctx.lineTo(gx * sx, view.h); }
    for (var gy = 100; gy < H; gy += 100) { ctx.moveTo(0, gy * sx); ctx.lineTo(view.w, gy * sx); }
    ctx.stroke(); ctx.globalAlpha = 1;

    var res = S.points.length ? classify(S.points, S.qx, S.qy, S.k, S.metric, Math.max(S.nClasses, 3)) : null;
    var qx = S.qx * sx, qy = S.qy * sx;
    if (res && res.neighbors.length) {
      // circle that just reaches the k-th neighbour (in the chosen metric)
      var far = res.neighbors[res.neighbors.length - 1].d * sx;
      ctx.lineWidth = 2; ctx.strokeStyle = pal.ring; ctx.setLineDash([7, 6]); ctx.globalAlpha = 0.85;
      ctx.beginPath();
      if (S.metric === "manhattan") { ctx.moveTo(qx, qy - far); ctx.lineTo(qx + far, qy); ctx.lineTo(qx, qy + far); ctx.lineTo(qx - far, qy); ctx.closePath(); }
      else ctx.arc(qx, qy, far, 0, Math.PI * 2);
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      // lines to neighbours
      ctx.lineWidth = 2;
      res.neighbors.forEach(function (n) {
        var p = S.points[n.i];
        ctx.strokeStyle = pal.cls[p.c]; ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(p.x * sx, p.y * sx); ctx.stroke();
      });
    }
    var r = PT_R(), nbSet = {};
    if (res) res.neighbors.forEach(function (n) { nbSet[n.i] = 1; });
    S.points.forEach(function (p, i) {
      if (nbSet[i]) { ctx.beginPath(); ctx.arc(p.x * sx, p.y * sx, r + 5, 0, Math.PI * 2); ctx.lineWidth = 2.5; ctx.strokeStyle = pal.ring; ctx.stroke(); }
      marker(p.c, p.x * sx, p.y * sx, r, pal.cls[p.c], pal.casing, 1.8);
    });
    // query marker: diamond filled with the predicted colour
    var qc = res && res.label >= 0 ? pal.cls[res.label] : pal.ring, qr = r + 5;
    ctx.beginPath(); ctx.moveTo(qx, qy - qr); ctx.lineTo(qx + qr, qy); ctx.lineTo(qx, qy + qr); ctx.lineTo(qx - qr, qy); ctx.closePath();
    ctx.fillStyle = qc; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = pal.casing; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = pal.ring; ctx.stroke();
    if (document.activeElement === canvas) {
      ctx.lineWidth = 3; ctx.strokeStyle = pal.ring; ctx.strokeRect(1.5, 1.5, view.w - 3, view.h - 3);
    }
    updateStats(res);
  }
  function kick() { if (!dirty) { dirty = true; } if (!kick.pending) { kick.pending = true; requestAnimationFrame(function () { kick.pending = false; if (dirty) draw(); }); } }
  function kickHeat() { dirtyHeat = true; kick(); }

  /* ----- stats ----- */
  var statTimer = 0, loo = { key: "", v: null };
  function updateStats(res) {
    $("st-pred").textContent = res && res.label >= 0 ? CLASS_SHORT[res.label] + (res.tie ? " (tie, nearest wins)" : "") : "—";
    $("st-pred").style.color = res && res.label >= 0 ? theme().cls[res.label] : "";
    var nc = Math.max(S.nClasses, 2), parts = [];
    if (res) for (var c = 0; c < nc; c++) parts.push(CLASS_SHORT[c] + " " + res.votes[c]);
    $("st-votes").textContent = res ? parts.join(" · ") : "—";
    $("st-points").textContent = String(S.points.length);
    var key = S.k + "|" + S.metric + "|" + S.points.length + "|" + (S.rev || 0);
    if (loo.key !== key) { loo.key = key; loo.v = leaveOneOut(S.points, S.k, S.metric, Math.max(S.nClasses, 3)); }
    $("st-loo").textContent = loo.v == null ? "—" : Math.round(loo.v * 100) + " %";
    var live = res && res.label >= 0 ? "Query predicted as " + CLASS_NAMES[res.label] + ". " + parts.join(", ") + " among the " + res.k + " nearest points." : "No points yet.";
    canvas.setAttribute("aria-description", live);
  }

  /* ----- state changes ----- */
  function touched() { S.rev = (S.rev || 0) + 1; syncK(); kickHeat(); }
  function syncK() {
    var kmx = kMax(), el = $("k");
    el.max = String(kmx);
    if (S.k > kmx) S.k = kmx;
    el.value = String(S.k); $("k-out").textContent = String(S.k);
    el.setAttribute("aria-valuetext", "k = " + S.k);
  }
  function setClass(c) {
    S.cls = c;
    document.querySelectorAll("input[name=cls]").forEach(function (i) { i.checked = Number(i.value) === c; });
  }
  function setTool(t) {
    S.tool = t;
    document.querySelectorAll(".tool").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.tool === t ? "true" : "false"); });
    canvas.style.cursor = t === "erase" ? "not-allowed" : "crosshair";
    $("tool-hint").textContent = {
      add: "Click or tap an empty spot to add a dot of the selected colour. Drag any dot to move it. Hover (mouse) moves the query diamond.",
      query: "Touch or click the picture to place the query diamond; the prediction follows your finger or pointer.",
      erase: "Click or tap a dot to remove it."
    }[t];
  }
  function loadPreset(name, seed) {
    stopTour();
    S.preset = name; S.seed = seed == null ? 7 : seed;
    S.points = PRESETS[name].make(mulberry32(S.seed));
    S.nClasses = PRESETS[name].classes;
    $("preset").value = name;
    if (S.cls >= S.nClasses && name !== "empty") setClass(0);
    document.querySelectorAll("input[name=cls]").forEach(function (i) { i.parentElement.hidden = false; });
    S.qx = W * 0.5; S.qy = H * 0.5;
    touched();
    say("Loaded: " + PRESETS[name].label + ", " + S.points.length + " points.");
  }
  function nearestIndex(x, y, rad) {
    var best = -1, bd = rad * rad;
    for (var i = S.points.length - 1; i >= 0; i--) {
      var dx = S.points[i].x - x, dy = S.points[i].y - y, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = i; }
    }
    return best;
  }
  function hitRadiusWorld() { return (coarse ? 22 : 14) / view.sx; }
  function addPoint(x, y, c) {
    S.points.push(clampPt({ x: x, y: y, c: c }));
    if (c + 1 > S.nClasses) S.nClasses = c + 1;
    touched();
    return S.points.length - 1;
  }

  /* ----- pointer interaction ----- */
  canvas.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    stopTour();
    canvas.focus({ preventScroll: true });
    var p = toWorld(ev), hit = nearestIndex(p.x, p.y, hitRadiusWorld());
    canvas.setPointerCapture(ev.pointerId);
    if (S.tool === "erase") {
      if (hit >= 0) { S.points.splice(hit, 1); touched(); say("Removed a point. " + S.points.length + " left."); }
      return;
    }
    if (S.tool === "query") { S.qx = p.x; S.qy = p.y; S.drag = -2; kick(); return; }
    if (hit >= 0) S.drag = hit;
    else {
      S.drag = addPoint(p.x, p.y, S.cls);
      say("Added a " + CLASS_NAMES[S.cls].toLowerCase().replace(/s$/, "") + " point. " + S.points.length + " points in total.");
    }
    canvas.style.cursor = "grabbing";
    ev.preventDefault();
  });
  canvas.addEventListener("pointermove", function (ev) {
    var p = toWorld(ev);
    if (S.drag >= 0) { var q = S.points[S.drag]; if (q) { q.x = p.x; q.y = p.y; clampPt(q); touched(); } return; }
    if (S.drag === -2) { S.qx = p.x; S.qy = p.y; kick(); return; }
    if (ev.pointerType === "mouse" && !S.tour) { S.qx = p.x; S.qy = p.y; kick(); }
    if (ev.pointerType === "mouse" && S.tool === "add") canvas.style.cursor = nearestIndex(p.x, p.y, hitRadiusWorld()) >= 0 ? "grab" : "crosshair";
  });
  function endDrag() { S.drag = -1; setTool(S.tool); }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  /* ----- keyboard ----- */
  canvas.addEventListener("keydown", function (ev) {
    var step = ev.shiftKey ? 40 : 12, handled = true;
    stopTour();
    if (ev.key === "ArrowLeft") S.qx = Math.max(0, S.qx - step);
    else if (ev.key === "ArrowRight") S.qx = Math.min(W, S.qx + step);
    else if (ev.key === "ArrowUp") S.qy = Math.max(0, S.qy - step);
    else if (ev.key === "ArrowDown") S.qy = Math.min(H, S.qy + step);
    else if (ev.key === " " || ev.key === "Enter") { addPoint(S.qx, S.qy, S.cls); say("Added a point at the query position. " + S.points.length + " points in total."); }
    else if (ev.key === "Backspace" || ev.key === "Delete") {
      var i = nearestIndex(S.qx, S.qy, 60);
      if (i >= 0) { S.points.splice(i, 1); touched(); say("Removed the nearest point. " + S.points.length + " left."); }
    } else if (ev.key >= "1" && ev.key <= "3") { setClass(Number(ev.key) - 1); say(CLASS_NAMES[S.cls] + " selected."); }
    else handled = false;
    if (handled) { ev.preventDefault(); kick(); }
  });
  canvas.addEventListener("focus", kick);
  canvas.addEventListener("blur", kick);

  /* ----- controls ----- */
  document.querySelectorAll("input[name=cls]").forEach(function (i) { i.addEventListener("change", function () { setClass(Number(i.value)); stopTour(); }); });
  document.querySelectorAll(".tool").forEach(function (b) { b.addEventListener("click", function () { stopTour(); setTool(b.dataset.tool); }); });
  $("k").addEventListener("input", function () { stopTour(); S.k = Number($("k").value); $("k-out").textContent = String(S.k); kickHeat(); });
  document.querySelectorAll("input[name=metric]").forEach(function (i) { i.addEventListener("change", function () { stopTour(); S.metric = i.value; kickHeat(); }); });
  $("boundary").addEventListener("change", function () { S.boundary = $("boundary").checked; kick(); });
  $("preset").addEventListener("change", function () { loadPreset($("preset").value, 7); });
  $("btn-random").addEventListener("click", function () { S.seed = (Math.random() * 1e6) | 0; loadPreset("random", S.seed); });
  $("btn-clear").addEventListener("click", function () { stopTour(); S.points = []; touched(); say("Canvas cleared. Click to add points."); });
  $("btn-shuffle").addEventListener("click", function () {
    stopTour();
    if (!S.points.length) return;
    var n = Math.max(1, Math.round(S.points.length * 0.1)), nc = Math.max(S.nClasses, 2), flipped = 0;
    for (var i = 0; i < n; i++) {
      var p = S.points[Math.floor(Math.random() * S.points.length)];
      p.c = (p.c + 1 + Math.floor(Math.random() * (nc - 1))) % nc; flipped++;
    }
    touched(); say("Changed the label of " + flipped + " points. Compare k = 1 with a larger k.");
  });
  $("btn-tour").addEventListener("click", function () { if (S.tour) stopTour(); else startTour(); });

  /* ----- autoplay tour: the query diamond glides over the data while k cycles ----- */
  function startTour() {
    if (S.tour) return;
    S.tour = { t0: performance.now(), raf: 0, lastK: -1 };
    $("btn-tour").textContent = "■ Stop demo";
    $("tour-note").hidden = false;
    var ks = [1, 3, 5, 9, 15];
    (function step(now) {
      if (!S.tour) return;
      var t = (now - S.tour.t0) / 1000;
      if (t > 14) { stopTour(); return; }
      S.qx = W * (0.5 + 0.36 * Math.sin(t * 0.9)); S.qy = H * (0.5 + 0.32 * Math.sin(t * 1.37 + 0.6));
      var k = Math.min(ks[Math.floor(t / 2.6) % ks.length], kMax());
      if (k !== S.k) { S.k = k; syncK(); dirtyHeat = true; }
      dirty = true; draw();
      S.tour.raf = requestAnimationFrame(step);
    })(performance.now());
  }
  function stopTour() {
    if (!S.tour) return;
    cancelAnimationFrame(S.tour.raf); S.tour = null;
    $("btn-tour").textContent = "▶ Play demo"; $("tour-note").hidden = true;
    kick();
  }

  /* ----- init ----- */
  function init() {
    var q = new URLSearchParams(location.search);
    var preset = q.get("preset"); if (!PRESETS[preset]) preset = "blobs";
    S.k = Math.max(1, Math.min(25, parseInt(q.get("k"), 10) || 5));
    if (q.get("metric") === "manhattan") { S.metric = "manhattan"; $("metric-l1").checked = true; }
    if (q.get("boundary") === "0") { S.boundary = false; $("boundary").checked = false; }
    var sel = $("preset");
    Object.keys(PRESETS).forEach(function (key) { var o = document.createElement("option"); o.value = key; o.textContent = PRESETS[key].label; sel.appendChild(o); });
    setTool("add"); setClass(0);
    resize();
    loadPreset(preset, 7);
    S.k = Math.min(S.k, kMax()); syncK();
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); kick(); }).observe(canvas); else window.addEventListener("resize", function () { resize(); kick(); });
    new MutationObserver(function () { dirtyHeat = true; kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    draw();
    say("Ready. " + S.points.length + " points loaded.");
    if (!reduced && q.get("tour") !== "0") startTour();
    root.__knn = { state: S, core: core, loadPreset: loadPreset };
  }
  init();
})(typeof window !== "undefined" ? window : globalThis);
