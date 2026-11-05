/* Neural-network decision-boundary playground. Plain JavaScript + <canvas>, no libraries.

   The "core" (no DOM) is a small fully connected network written from scratch. It mirrors the NumPy
   example nn_decision_boundary.py in github.com/DingshuaiYang1999/python-robotics-learning
   (05_computer_vision/neural_network):
     forward pass -> binary cross-entropy -> back-propagation -> mini-batch SGD with momentum or Adam. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Core                                                                 */
  /* ------------------------------------------------------------------ */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randn(rnd) { var u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

  /* f(z) and f'(z) written as a function of the activation a = f(z) */
  var ACTS = {
    relu: { f: function (z) { return z > 0 ? z : 0; }, d: function (a) { return a > 0 ? 1 : 0; } },
    tanh: { f: Math.tanh, d: function (a) { return 1 - a * a; } },
    sigmoid: { f: sigmoid, d: function (a) { return a * (1 - a); } }
  };

  /* sizes = [2, h1, ..., hL, 1]. Weight W[l] is stored row by row: W[l][j * nIn + i] connects unit i of layer l to unit j of layer l+1. */
  function createNet(hidden, act, seed) {
    var sizes = [2].concat(hidden, [1]), nl = sizes.length - 1, rnd = mulberry32(seed >>> 0);
    var net = { sizes: sizes, act: act, nl: nl, W: [], b: [], A: [], D: [], gW: [], gb: [], mW: [], vW: [], mb: [], vb: [], t: 0,
      rnd: mulberry32((seed ^ 0x9e3779b9) >>> 0), idx: null };
    for (var l = 0; l < nl; l++) {
      var nIn = sizes[l], nOut = sizes[l + 1], n = nIn * nOut;
      var scale = (l < nl - 1 && act === "relu") ? Math.sqrt(2 / nIn) : Math.sqrt(1 / nIn);   // He for ReLU, Xavier-like otherwise
      var w = new Float64Array(n);
      for (var k = 0; k < n; k++) w[k] = randn(rnd) * scale;
      net.W.push(w); net.b.push(new Float64Array(nOut));
      net.gW.push(new Float64Array(n)); net.gb.push(new Float64Array(nOut));
      net.mW.push(new Float64Array(n)); net.vW.push(new Float64Array(n));
      net.mb.push(new Float64Array(nOut)); net.vb.push(new Float64Array(nOut));
      net.D.push(new Float64Array(nOut));
    }
    for (l = 0; l <= nl; l++) net.A.push(new Float64Array(sizes[l]));
    return net;
  }
  function resetOptimizer(net) {
    net.t = 0;
    for (var l = 0; l < net.nl; l++) { net.mW[l].fill(0); net.vW[l].fill(0); net.mb[l].fill(0); net.vb[l].fill(0); }
  }

  /* One forward pass for the input (x, y); activations of every layer stay in net.A. Returns P(class 1). */
  function forward(net, x, y) {
    var A = net.A, nl = net.nl, f = ACTS[net.act].f;
    A[0][0] = x; A[0][1] = y;
    for (var l = 0; l < nl; l++) {
      var nIn = net.sizes[l], nOut = net.sizes[l + 1], W = net.W[l], b = net.b[l], a = A[l], o = A[l + 1], last = l === nl - 1;
      for (var j = 0; j < nOut; j++) {
        var s = b[j], base = j * nIn;
        for (var i = 0; i < nIn; i++) s += W[base + i] * a[i];
        o[j] = last ? sigmoid(s) : f(s);
      }
    }
    return A[nl][0];
  }

  /* Gradients of the binary cross-entropy for one sample, added to net.gW / net.gb. */
  function backward(net, label) {
    var nl = net.nl, A = net.A, D = net.D, df = ACTS[net.act].d;
    D[nl - 1][0] = A[nl][0] - label;                         // sigmoid + cross-entropy: dL/dz = p - y
    for (var l = nl - 1; l >= 0; l--) {
      var nIn = net.sizes[l], nOut = net.sizes[l + 1], a = A[l], d = D[l], W = net.W[l], gW = net.gW[l], gb = net.gb[l], i, j;
      var dp = l > 0 ? D[l - 1] : null;
      if (dp) for (i = 0; i < nIn; i++) dp[i] = 0;
      for (j = 0; j < nOut; j++) {
        var dj = d[j], base = j * nIn;
        gb[j] += dj;
        for (i = 0; i < nIn; i++) { gW[base + i] += dj * a[i]; if (dp) dp[i] += W[base + i] * dj; }
      }
      if (dp) for (i = 0; i < nIn; i++) dp[i] *= df(a[i]);
    }
  }

  /* Parameter update from the accumulated gradients of one mini-batch of `bs` samples. cfg: {opt, lr, l2}. */
  function applyUpdate(net, cfg, bs) {
    var B1 = 0.9, B2 = 0.999, EPS = 1e-8, adam = cfg.opt === "adam", t, c1, c2;
    if (adam) { t = ++net.t; c1 = 1 - Math.pow(B1, t); c2 = 1 - Math.pow(B2, t); }
    for (var l = 0; l < net.nl; l++) {
      for (var pass = 0; pass < 2; pass++) {
        var P = pass ? net.b[l] : net.W[l], G = pass ? net.gb[l] : net.gW[l], M = pass ? net.mb[l] : net.mW[l], V = pass ? net.vb[l] : net.vW[l];
        for (var k = 0; k < P.length; k++) {
          var g = G[k] / bs + (pass ? 0 : cfg.l2 * P[k]);        // L2 penalty acts on weights only, not on biases
          G[k] = 0;
          if (adam) {
            M[k] = B1 * M[k] + (1 - B1) * g; V[k] = B2 * V[k] + (1 - B2) * g * g;
            P[k] -= cfg.lr * (M[k] / c1) / (Math.sqrt(V[k] / c2) + EPS);
          } else {
            M[k] = 0.9 * M[k] - cfg.lr * g; P[k] += M[k];       // SGD with momentum 0.9
          }
        }
      }
    }
  }

  /* One epoch = one pass over all training points in shuffled mini-batches. */
  function trainEpoch(net, pts, cfg) {
    var n = pts.length, bs = cfg.batch || 10, i, j;
    if (!n) return;
    if (!net.idx || net.idx.length !== n) { net.idx = new Int32Array(n); for (i = 0; i < n; i++) net.idx[i] = i; }
    var idx = net.idx, rnd = net.rnd;
    for (i = n - 1; i > 0; i--) { j = Math.floor(rnd() * (i + 1)); var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp; }
    for (var s = 0; s < n; s += bs) {
      var e = Math.min(n, s + bs);
      for (var k = s; k < e; k++) { var p = pts[idx[k]]; forward(net, p.x, p.y); backward(net, p.c); }
      applyUpdate(net, cfg, e - s);
    }
  }

  function evaluate(net, pts) {
    var n = pts.length, loss = 0, ok = 0;
    for (var i = 0; i < n; i++) {
      var p = pts[i], q = forward(net, p.x, p.y);
      q = Math.min(1 - 1e-7, Math.max(1e-7, q));
      loss -= p.c ? Math.log(q) : Math.log(1 - q);
      if ((q >= 0.5) === (p.c === 1)) ok++;
    }
    return { loss: n ? loss / n : NaN, acc: n ? ok / n : NaN, n: n };
  }

  /* Predicted probability on an N x N grid covering [-1, 1]^2 (row 0 = top). */
  function gridPredict(net, N, out) {
    out = out || new Float32Array(N * N);
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) out[j * N + i] = forward(net, -1 + 2 * (i + 0.5) / N, 1 - 2 * (j + 0.5) / N);
    return out;
  }
  /* Activation of every unit (layers 0..L-1, outputs excluded) on an M x M grid: result[l][unit] = Float32Array(M * M). */
  function unitMaps(net, M) {
    var maps = [], l, u;
    for (l = 0; l < net.nl; l++) { maps.push([]); for (u = 0; u < net.sizes[l]; u++) maps[l].push(new Float32Array(M * M)); }
    for (var j = 0; j < M; j++) for (var i = 0; i < M; i++) {
      forward(net, -1 + 2 * (i + 0.5) / M, 1 - 2 * (j + 0.5) / M);
      for (l = 0; l < net.nl; l++) for (u = 0; u < net.sizes[l]; u++) maps[l][u][j * M + i] = net.A[l][u];
    }
    return maps;
  }

  /* ----- data sets on [-1, 1]^2; label c = 1 is drawn orange, c = 0 blue ----- */
  function clamp1(v) { return Math.max(-1, Math.min(1, v)); }
  function gen(kind, n, noise, rnd) {
    var pts = [], i, a, r, t, x, y, c, h = Math.floor(n / 2);
    function add(x, y, c) { pts.push({ x: clamp1(x), y: clamp1(y), c: c }); }
    if (kind === "circle") {
      for (i = 0; i < n; i++) {
        c = i % 2; a = rnd() * 2 * Math.PI;
        r = c ? rnd() * 0.5 : 0.7 + rnd() * 0.3;
        add(r * Math.cos(a) + randn(rnd) * noise * 0.3, r * Math.sin(a) + randn(rnd) * noise * 0.3, c);
      }
    } else if (kind === "xor") {
      for (i = 0; i < n; i++) {
        x = (rnd() * 0.9 + 0.1) * (rnd() < 0.5 ? -1 : 1); y = (rnd() * 0.9 + 0.1) * (rnd() < 0.5 ? -1 : 1);
        add(x + randn(rnd) * noise * 0.3, y + randn(rnd) * noise * 0.3, x * y > 0 ? 1 : 0);
      }
    } else if (kind === "spiral") {
      for (i = 0; i < n; i++) {
        c = i % 2; t = (Math.floor(i / 2) + rnd() * 0.5) / h;                     // 0..1 along the arm
        r = 0.08 + 0.9 * t; a = 1.25 * t * 2 * Math.PI + c * Math.PI;
        add(r * Math.sin(a) + randn(rnd) * noise * 0.3, r * Math.cos(a) + randn(rnd) * noise * 0.3, c);
      }
    } else if (kind === "gaussian") {
      for (i = 0; i < n; i++) {
        c = i % 2; var m = c ? 0.42 : -0.42, sd = 0.2 + noise * 0.5;
        add(m + randn(rnd) * sd, m + randn(rnd) * sd, c);
      }
    } else {                                                                       // "overfit": overlapping clouds with a few wrong labels
      for (i = 0; i < n; i++) {
        c = i % 2; var m2 = c ? 0.22 : -0.22;
        add(m2 + randn(rnd) * 0.34, m2 + randn(rnd) * 0.34, rnd() < 0.1 ? 1 - c : c);
      }
    }
    return pts;
  }
  /* Returns {train, test}. The presets keep a held-out test set; points drawn by the visitor are always training points. */
  function makeData(kind, noise, seed) {
    var rnd = mulberry32(seed >>> 0), all, train = [], test = [];
    if (kind === "overfit") return { train: gen(kind, 30, noise, rnd), test: gen(kind, 90, noise, rnd) };
    all = gen(kind, 200, noise, rnd);
    all.forEach(function (p, i) { (i % 5 === 4 ? test : train).push(p); });
    return { train: train, test: test };
  }

  var core = { mulberry32: mulberry32, createNet: createNet, resetOptimizer: resetOptimizer, forward: forward, trainEpoch: trainEpoch,
    evaluate: evaluate, gridPredict: gridPredict, unitMaps: unitMaps, makeData: makeData, gen: gen };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.NNCore = core;
  if (typeof document === "undefined") return;

  /* ------------------------------------------------------------------ */
  /* UI                                                                   */
  /* ------------------------------------------------------------------ */
  var $ = function (id) { return document.getElementById(id); };
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var LR_STEPS = [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1];
  var L2_STEPS = [0, 0.0001, 0.0003, 0.001, 0.003, 0.01];
  var GRID = 44, MINI = 14, MAX_POINTS = 400, MAX_HIST = 600;
  var PRESETS = {
    circle:   { label: "Circle",          noise: 0.1,  hidden: [4, 4], lrIdx: 2 },
    xor:      { label: "XOR",             noise: 0.1,  hidden: [4, 4] },
    spiral:   { label: "Spiral",          noise: 0.05, hidden: [8, 8, 8] },
    gaussian: { label: "Two clusters",    noise: 0.1,  hidden: [3] },
    overfit:  { label: "Overfit me (30 noisy points)", noise: 0, hidden: [8, 8, 8], lr: 0.03, l2: 0 }
  };
  var CHALLENGES = {
    spiral: { label: "Spiral within 300 epochs", preset: "spiral", budget: 300, goal: 0.95, fewest: false,
      text: "Separate the two spiral arms with at least 95 % accuracy within 300 epochs. Any network is allowed." },
    circle: { label: "Circle with the fewest neurons", preset: "circle", budget: 600, goal: 0.95, fewest: true,
      text: "Reach at least 95 % accuracy within 600 epochs using as few hidden neurons as possible." },
    xor:    { label: "XOR within 30 epochs", preset: "xor", budget: 30, goal: 0.95, fewest: false,
      text: "Reach at least 95 % accuracy within 30 epochs. Any network is allowed." }
  };

  var S = {
    preset: "circle", noise: 0.1, seed: 11, hidden: [4, 4], act: "tanh", lrIdx: 3, l2Idx: 0, opt: "adam", speed: 1,
    train: [], test: [], showTest: true, net: null, epoch: 0, playing: false, ended: null,
    hist: { e: [], tr: [], te: [], every: 1 }, last: null, cls: 0, tool: "add", challenge: null, cursor: { x: 0, y: 0, on: false }, hover: null
  };
  var statusEl = $("status");
  function say(m) { statusEl.textContent = m; }

  /* ---------- colours (follow the page theme) ---------- */
  function dark() { return document.documentElement.getAttribute("data-theme") === "dark"; }
  function pal() {
    return dark()
      ? { c0: [111, 163, 224], c1: [229, 152, 92], mid: [28, 34, 42], k: 0.62, bg: "#151a20", ink: "#e7e9ec", muted: "#a0a7b1", grid: "rgba(255,255,255,0.10)", rule: "#353b44", pos: "#a98be6", neg: "#4fc4b3", tr: "#8fb4ec" }
      : { c0: [42, 111, 187], c1: [210, 130, 63], mid: [246, 247, 249], k: 0.72, bg: "#f7f8fa", ink: "#16181b", muted: "#5a6068", grid: "rgba(0,0,0,0.10)", rule: "#cfd3d9", pos: "#6d4ab5", neg: "#1f8f80", tr: "#04316a" };
  }
  function rgb(c) { return "rgb(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + ")"; }
  /* t in [0,1]: 0 = blue, 0.5 = neutral, 1 = orange */
  function ramp(P, t, out, o) {
    var u = Math.abs(t - 0.5) * 2 * P.k, tgt = t < 0.5 ? P.c0 : P.c1;
    out[o] = P.mid[0] + (tgt[0] - P.mid[0]) * u; out[o + 1] = P.mid[1] + (tgt[1] - P.mid[1]) * u; out[o + 2] = P.mid[2] + (tgt[2] - P.mid[2]) * u; out[o + 3] = 255;
  }

  /* ---------- canvases ---------- */
  var field = $("field"), fctx = field.getContext("2d"), fimg = document.createElement("canvas"), fimgCtx;
  fimg.width = GRID; fimg.height = GRID; fimgCtx = fimg.getContext("2d");
  var netCv = $("net"), nctx = netCv.getContext("2d");
  var lossCv = $("loss"), lctx = lossCv.getContext("2d");
  var miniCv = document.createElement("canvas"); miniCv.width = MINI; miniCv.height = MINI; var miniCtx = miniCv.getContext("2d");
  var FS = field.width;                                  // internal size of the square field (px)

  function toPx(x, y) { return [(x + 1) / 2 * FS, (1 - (y + 1) / 2) * FS]; }

  function drawField() {
    var P = pal(), g = fctx, i;
    var grid = core.gridPredict(S.net, GRID, S.gridBuf || (S.gridBuf = new Float32Array(GRID * GRID)));
    var img = fimgCtx.createImageData(GRID, GRID);
    for (i = 0; i < grid.length; i++) ramp(P, grid[i], img.data, i * 4);
    fimgCtx.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(fimg, 0, 0, FS, FS);
    // axes
    g.strokeStyle = P.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(FS / 2, 0); g.lineTo(FS / 2, FS); g.moveTo(0, FS / 2); g.lineTo(FS, FS / 2); g.stroke();
    // points
    function mark(p, test) {
      var q = toPx(p.x, p.y), col = rgb(p.c ? P.c1 : P.c0), r = 7;
      g.lineWidth = 2.5; g.strokeStyle = P.bg; g.fillStyle = col;
      g.beginPath();
      if (p.c) g.rect(q[0] - r + 0.5, q[1] - r + 0.5, 2 * r - 1, 2 * r - 1); else g.arc(q[0], q[1], r, 0, Math.PI * 2);
      if (test) { g.fillStyle = P.bg; g.fill(); g.lineWidth = 3; g.strokeStyle = col; g.stroke(); }
      else { g.stroke(); g.fill(); g.lineWidth = 1; g.strokeStyle = P.ink; g.stroke(); }
    }
    S.train.forEach(function (p) { mark(p, false); });
    if (S.showTest) S.test.forEach(function (p) { mark(p, true); });
    if (S.cursor.on) {
      var c = toPx(S.cursor.x, S.cursor.y);
      g.lineWidth = 2; g.strokeStyle = P.ink; g.setLineDash([5, 4]); g.beginPath(); g.arc(c[0], c[1], 13, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
  }

  /* ----- network diagram ----- */
  var edgeList = [], nodeList = [];
  function fitCanvas(cv) {
    var r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(10, Math.round(r.width * d)), h = Math.max(10, Math.round(r.height * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { w: r.width, h: r.height, d: d };
  }
  function drawNet() {
    var P = pal(), z = fitCanvas(netCv), g = nctx, W = z.w, H = z.h, net = S.net, sizes = net.sizes, C = sizes.length, maxN = Math.max.apply(null, sizes);
    g.setTransform(z.d, 0, 0, z.d, 0, 0);
    g.clearRect(0, 0, W, H);
    var s = Math.max(14, Math.min(40, Math.floor((H - 16) / maxN) - 6, Math.floor((W - 12) / C * 0.6)));
    var padX = s / 2 + 8, xs = [], i, j, l;
    for (l = 0; l < C; l++) xs.push(C === 1 ? W / 2 : padX + l * (W - 2 * padX) / (C - 1));
    function ypos(n, k) { var span = Math.min(H - 16, n * (s + 8)); return H / 2 - span / 2 + (k + 0.5) * span / n; }
    var wmax = 1e-6;
    for (l = 0; l < net.nl; l++) for (i = 0; i < net.W[l].length; i++) wmax = Math.max(wmax, Math.abs(net.W[l][i]));
    edgeList = []; nodeList = [];
    var hover = S.hover;
    for (l = 0; l < net.nl; l++) {
      for (j = 0; j < sizes[l + 1]; j++) for (i = 0; i < sizes[l]; i++) {
        var w = net.W[l][j * sizes[l] + i], x1 = xs[l] + s / 2, y1 = ypos(sizes[l], i), x2 = xs[l + 1] - s / 2, y2 = ypos(sizes[l + 1], j);
        var isH = hover && hover.kind === "edge" && hover.l === l && hover.i === i && hover.j === j;
        g.strokeStyle = w >= 0 ? P.pos : P.neg; g.globalAlpha = isH ? 1 : 0.28 + 0.62 * Math.min(1, Math.abs(w) / wmax);
        g.lineWidth = (0.6 + 4.2 * Math.abs(w) / wmax) + (isH ? 1.5 : 0); g.setLineDash(w >= 0 ? [] : [6, 3]);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        edgeList.push({ x1: x1, y1: y1, x2: x2, y2: y2, w: w, l: l, i: i, j: j });
      }
    }
    g.setLineDash([]); g.globalAlpha = 1;
    var maps = core.unitMaps(net, MINI), grid = S.gridBuf, mimg = miniCtx.createImageData(MINI, MINI), u, k;
    function paintMini(vals, mode, m) {
      for (k = 0; k < vals.length; k++) {
        var v = vals[k], t = mode === "p" ? v : (mode === "x" ? v : 0.5 + 0.5 * v / m);
        ramp(P, Math.max(0, Math.min(1, t)), mimg.data, k * 4);
      }
      miniCtx.putImageData(mimg, 0, 0);
    }
    function node(l, u, label) {
      var cx = xs[l], cy = ypos(sizes[l], u), n = sizes[l];
      var vals = maps[l] ? maps[l][u] : null, mode = "x", m = 1;
      if (l === 0) { mode = "x"; vals = Array.prototype.map.call(maps[0][u], function (v) { return 0.5 + 0.5 * v; }); }
      else { var mx = 1e-9; for (k = 0; k < vals.length; k++) mx = Math.max(mx, Math.abs(vals[k])); m = mx; mode = S.act === "sigmoid" ? "p" : "m"; }
      paintMini(vals, mode, m);
      g.imageSmoothingEnabled = true;
      g.save(); g.beginPath(); roundRect(g, cx - s / 2, cy - s / 2, s, s, 5); g.clip(); g.drawImage(miniCv, cx - s / 2, cy - s / 2, s, s); g.restore();
      g.lineWidth = 1.5; g.strokeStyle = P.ink; g.beginPath(); roundRect(g, cx - s / 2, cy - s / 2, s, s, 5); g.stroke();
      if (label) {
        g.font = "700 12px system-ui, sans-serif"; g.textAlign = "left"; g.textBaseline = "middle";
        g.fillStyle = P.bg; g.globalAlpha = 0.8; g.fillRect(cx - s / 2 + 2, cy - s / 2 + 2, 11, 14); g.globalAlpha = 1;
        g.fillStyle = P.ink; g.fillText(label, cx - s / 2 + 4.5, cy - s / 2 + 9.5);
      }
      nodeList.push({ cx: cx, cy: cy, s: s, l: l, u: u });
    }
    for (l = 0; l < net.nl; l++) for (u = 0; u < sizes[l]; u++) node(l, u, l === 0 ? (u ? "y" : "x") : "");
    // output node: the same picture as the main field, down-scaled
    var oy = ypos(1, 0), ox = xs[C - 1], os = Math.min(s * 1.25, 46);
    g.save(); g.beginPath(); roundRect(g, ox - os / 2, oy - os / 2, os, os, 5); g.clip();
    var oimg = miniCtx.createImageData(MINI, MINI), og = core.gridPredict(net, MINI);
    for (k = 0; k < og.length; k++) ramp(P, og[k], oimg.data, k * 4);
    miniCtx.putImageData(oimg, 0, 0); g.drawImage(miniCv, ox - os / 2, oy - os / 2, os, os); g.restore();
    g.lineWidth = 2; g.strokeStyle = P.ink; g.beginPath(); roundRect(g, ox - os / 2, oy - os / 2, os, os, 5); g.stroke();
    g.fillStyle = P.ink; g.font = "600 12px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "top"; g.fillText("output", ox, oy + os / 2 + 2);
    nodeList.push({ cx: ox, cy: oy, s: os, l: net.nl, u: 0 });
  }
  function roundRect(g, x, y, w, h, r) {
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function segDist(px, py, e) {
    var dx = e.x2 - e.x1, dy = e.y2 - e.y1, t = ((px - e.x1) * dx + (py - e.y1) * dy) / (dx * dx + dy * dy || 1);
    t = Math.max(0, Math.min(1, t)); var x = e.x1 + t * dx - px, y = e.y1 + t * dy - py; return Math.sqrt(x * x + y * y);
  }
  function layerName(l) { return l === 0 ? "input" : (l === S.net.nl ? "output" : "hidden layer " + l); }
  function unitName(l, u) { return l === 0 ? (u ? "input y" : "input x") : (l === S.net.nl ? "the output" : "neuron " + (u + 1) + " of hidden layer " + l); }
  function netPointer(ev) {
    var r = netCv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, best = null, bd = 7, i;
    for (i = 0; i < nodeList.length; i++) { var n = nodeList[i]; if (Math.abs(px - n.cx) <= n.s / 2 && Math.abs(py - n.cy) <= n.s / 2) { best = { kind: "node", l: n.l, u: n.u }; break; } }
    if (!best) for (i = 0; i < edgeList.length; i++) { var d = segDist(px, py, edgeList[i]); if (d < bd) { bd = d; best = { kind: "edge", l: edgeList[i].l, i: edgeList[i].i, j: edgeList[i].j }; } }
    S.hover = best; showReadout(); if (!S.playing) renderAll();
  }
  function showReadout() {
    var h = S.hover, el = $("net-readout"), net = S.net;
    if (!h) { el.textContent = "Point at a connection or a neuron to read its value."; return; }
    if (h.kind === "edge") {
      var w = net.W[h.l][h.j * net.sizes[h.l] + h.i];
      el.textContent = "Weight " + (w >= 0 ? "+" : "−") + Math.abs(w).toFixed(3) + ": from " + unitName(h.l, h.i) + " to " + unitName(h.l + 1, h.j) + ".";
    } else if (h.l === 0) el.textContent = "Network input " + (h.u ? "y" : "x") + ": the small picture shows its value across the plane.";
    else if (h.l === net.nl) el.textContent = "Output: the probability of the orange class; the picture is the same as the large field.";
    else el.textContent = "Neuron " + (h.u + 1) + " of hidden layer " + h.l + ": bias " + net.b[h.l - 1][h.u].toFixed(3) + ". The picture shows what this neuron responds to.";
  }

  /* ----- loss curve ----- */
  function drawLoss() {
    var P = pal(), z = fitCanvas(lossCv), g = lctx, W = z.w, H = z.h, h = S.hist;
    g.setTransform(z.d, 0, 0, z.d, 0, 0); g.clearRect(0, 0, W, H);
    var L = 38, R = 8, T = 8, B = 20, pw = W - L - R, ph = H - T - B, i;
    var n = h.e.length, ymax = 0.8;
    for (i = 0; i < n; i++) { ymax = Math.max(ymax, h.tr[i] || 0, isNaN(h.te[i]) ? 0 : h.te[i]); }
    ymax = Math.min(3, Math.ceil(ymax * 5) / 5);
    var xmax = Math.max(50, S.epoch);
    function X(e) { return L + e / xmax * pw; } function Y(v) { return T + ph - Math.min(v, ymax) / ymax * ph; }
    g.font = "12px system-ui, sans-serif"; g.fillStyle = P.muted; g.strokeStyle = P.grid; g.lineWidth = 1; g.textAlign = "right"; g.textBaseline = "middle";
    var ticks = ymax > 1.6 ? [0, 1, 2, 3] : (ymax > 0.9 ? [0, 0.5, 1, 1.5] : [0, 0.2, 0.4, 0.6, 0.8]);
    ticks.forEach(function (v) { if (v > ymax + 1e-9) return; g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke(); g.fillText(v.toFixed(1), L - 5, Y(v)); });
    g.strokeStyle = P.muted; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(L, Y(0.6931)); g.lineTo(W - R, Y(0.6931)); g.stroke(); g.setLineDash([]);
    g.textAlign = "left"; g.textBaseline = "bottom"; g.fillText("chance level (0.69)", L + 4, Y(0.6931) - 2);
    g.textBaseline = "top"; g.textAlign = "center"; g.fillText("0", L, H - B + 4); g.textAlign = "right"; g.fillText(String(xmax) + " epochs", W - R, H - B + 4);
    function line(arr, col, dash) {
      g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(dash || []); g.beginPath(); var started = false;
      for (var k = 0; k < arr.length; k++) { if (isNaN(arr[k])) continue; var x = X(h.e[k]), y = Y(arr[k]); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); }
      g.stroke(); g.setLineDash([]);
    }
    line(h.tr, P.tr); if (S.test.length) line(h.te, rgb(P.c1), [6, 3]);
  }

  /* ---------- state helpers ---------- */
  function hiddenCount() { return S.hidden.reduce(function (a, b) { return a + b; }, 0); }
  function cfg() { return { opt: S.opt, lr: LR_STEPS[S.lrIdx], l2: L2_STEPS[S.l2Idx], batch: 10 }; }
  function allPts() { return S.train.concat(S.test); }

  function newNet() {
    S.net = core.createNet(S.hidden, S.act, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
    S.epoch = 0; S.hist = { e: [], tr: [], te: [], every: 1 }; S.ended = null; S.gridBuf = null; recordPoint(true);
    updateChallengeUI();
  }
  function loadData(kind, regenerate) {
    var pr = PRESETS[kind]; S.preset = kind;
    if (regenerate) S.seed = (S.seed * 1103515245 + 12345) >>> 0;
    var d = core.makeData(kind, S.noise, S.seed); S.train = d.train; S.test = d.test;
  }
  function recordPoint(force) {
    var h = S.hist, tr = core.evaluate(S.net, S.train), te = core.evaluate(S.net, S.test), all = core.evaluate(S.net, allPts());
    S.last = { tr: tr, te: te, all: all };
    if (force || S.epoch % h.every === 0) {
      h.e.push(S.epoch); h.tr.push(tr.loss); h.te.push(te.loss);
      if (h.e.length > MAX_HIST) { h.every *= 2; h.e = h.e.filter(function (_, i) { return i % 2 === 0; }); h.tr = h.tr.filter(function (_, i) { return i % 2 === 0; }); h.te = h.te.filter(function (_, i) { return i % 2 === 0; }); }
    }
  }
  function epochs(n) {
    var c = cfg(), ch = S.challenge;
    for (var i = 0; i < n; i++) {
      core.trainEpoch(S.net, S.train, c); S.epoch++; recordPoint(false);
      if (ch) {
        if (S.last.all.acc >= ch.goal) { finishChallenge(true); return; }
        if (S.epoch >= ch.budget) { finishChallenge(false); return; }
      }
    }
  }

  /* ---------- challenge ---------- */
  function bestKey(id) { return "nn-best-" + id; }
  function getBest(id) { try { var v = localStorage.getItem(bestKey(id)); return v == null ? null : Number(v); } catch (e) { return null; } }
  function setBest(id, v) { try { localStorage.setItem(bestKey(id), String(v)); } catch (e) {} }
  function finishChallenge(won) {
    var ch = S.challenge, id = S.challengeId; S.playing = false; S.ended = won ? "won" : "lost";
    var msg;
    if (won) {
      var score = ch.fewest ? hiddenCount() : S.epoch, prev = getBest(id), better = prev == null || score < prev;
      if (better) setBest(id, score);
      msg = "Solved after " + S.epoch + " epochs with " + hiddenCount() + " hidden neuron" + (hiddenCount() === 1 ? "" : "s") + " (accuracy " + pct(S.last.all.acc) + "). " +
        (ch.fewest ? (better ? "New best: " : "Best so far: ") + (better ? score : prev) + " neurons." : (better ? "New best: " : "Best so far: ") + (better ? score : prev) + " epochs.") +
        " Press Reset to try again" + (ch.fewest ? " with fewer neurons." : " with a smaller network or other settings.");
    } else {
      msg = "Not solved within " + ch.budget + " epochs (accuracy " + pct(S.last.all.acc) + "). Press Reset to try again, or change the network first.";
    }
    $("chal-result").textContent = msg; $("chal-result").dataset.state = won ? "ok" : "fail";
    say(msg); syncPlayButton(); updateChallengeUI();
  }
  function updateChallengeUI() {
    var ch = S.challenge, box = $("chal-box"), id = S.challengeId;
    $("chal-exit").hidden = !ch;
    $("chal-text").textContent = ch ? ch.text + " Changing any setting starts a new attempt." : "Choose a challenge for a fixed goal, or stay in free play and use your own points.";
    $("chal-progress").hidden = !ch;
    if (ch) {
      $("chal-progress-text").textContent = "Epoch " + S.epoch + " of " + ch.budget + " · accuracy " + (S.last ? pct(S.last.all.acc) : "—") + " (goal " + pct(ch.goal) + ") · " + hiddenCount() + " hidden neurons";
      $("chal-bar").value = Math.min(ch.budget, S.epoch); $("chal-bar").max = ch.budget;
      var b = getBest(id); $("chal-best").textContent = b == null ? "No result saved yet in this browser." : "Best in this browser: " + b + (ch.fewest ? " hidden neurons." : " epochs.");
      if (!S.ended) { $("chal-result").textContent = ""; $("chal-result").dataset.state = ""; }
    } else { $("chal-best").textContent = ""; $("chal-result").textContent = ""; }
    box.dataset.active = ch ? "1" : "0";
    ["preset", "noise", "btn-regen", "btn-clear"].forEach(function (k) { $(k).disabled = !!ch; });
    document.querySelector('[data-tool="add"]').disabled = !!ch; document.querySelector('[data-tool="erase"]').disabled = !!ch;
  }
  function startChallenge(id) {
    var ch = CHALLENGES[id]; S.challenge = ch; S.challengeId = id; $("chal").value = id;
    S.noise = PRESETS[ch.preset].noise; S.seed = 2024; loadData(ch.preset, false);
    $("preset").value = ch.preset; $("noise").value = S.noise; $("noise-out").textContent = Math.round(S.noise * 100) + " %";
    S.hidden = id === "circle" ? [4] : [4, 4]; S.act = "tanh"; S.lrIdx = 3; S.l2Idx = 0; S.opt = "adam";
    syncControls(); newNet(); S.playing = true; syncPlayButton(); renderAll();
    say("Challenge started: " + ch.label + ". Training is running.");
  }
  function exitChallenge() {
    S.challenge = null; S.challengeId = null; $("chal").value = "";
    updateChallengeUI(); say("Free play. Click the field to add your own points."); renderAll();
  }

  /* ---------- architecture controls ---------- */
  function buildArch() {
    var box = $("arch"); box.textContent = "";
    function stepper(label, value, onMinus, onPlus, minDisabled, maxDisabled, id) {
      var d = document.createElement("div"); d.className = "stepper";
      var lab = document.createElement("span"); lab.className = "st-label"; lab.textContent = label;
      var m = document.createElement("button"); m.type = "button"; m.className = "st-btn"; m.textContent = "−"; m.setAttribute("aria-label", "Remove one " + id); m.disabled = minDisabled; m.addEventListener("click", onMinus);
      var v = document.createElement("output"); v.className = "st-val"; v.textContent = value;
      var p = document.createElement("button"); p.type = "button"; p.className = "st-btn"; p.textContent = "+"; p.setAttribute("aria-label", "Add one " + id); p.disabled = maxDisabled; p.addEventListener("click", onPlus);
      d.appendChild(lab); d.appendChild(m); d.appendChild(v); d.appendChild(p); return d;
    }
    box.appendChild(stepper("Hidden layers", S.hidden.length, function () { S.hidden.pop(); archChanged(); }, function () { S.hidden.push(S.hidden.length ? S.hidden[S.hidden.length - 1] : 4); archChanged(); }, S.hidden.length <= 0, S.hidden.length >= 4, "hidden layer"));
    S.hidden.forEach(function (n, i) {
      box.appendChild(stepper("Layer " + (i + 1), n, function () { S.hidden[i]--; archChanged(); }, function () { S.hidden[i]++; archChanged(); }, n <= 1, n >= 8, "neuron in layer " + (i + 1)));
    });
    $("arch-note").textContent = S.hidden.length ? "" : "With no hidden layer the network is a single logistic unit and can only draw a straight line.";
  }
  function archChanged() { buildArch(); newNet(); say(S.hidden.length + " hidden layer" + (S.hidden.length === 1 ? "" : "s") + ", " + hiddenCount() + " hidden neurons. Training restarted with new random weights."); renderAll(); }

  /* ---------- rendering + loop ---------- */
  function pct(v) { return isNaN(v) ? "—" : (v * 100).toFixed(1) + " %"; }
  function updateStats() {
    var l = S.last, params = 0, i;
    for (i = 0; i < S.net.nl; i++) params += S.net.W[i].length + S.net.b[i].length;
    $("st-epoch").textContent = String(S.epoch);
    $("st-train").textContent = l.tr.n ? l.tr.loss.toFixed(3) + " · " + pct(l.tr.acc) : "—";
    $("st-test").textContent = l.te.n ? l.te.loss.toFixed(3) + " · " + pct(l.te.acc) : "—";
    $("st-net").textContent = hiddenCount() + " neurons · " + params + " weights";
    var note = $("overfit-note");
    var over = l.te.n >= 20 && S.epoch >= 100 && l.te.loss > l.tr.loss + 0.12 && l.te.loss > 0.5;
    note.hidden = !over;
    $("pts-count").textContent = S.train.length + " training point" + (S.train.length === 1 ? "" : "s") + (S.test.length ? " + " + S.test.length + " test points" : "");
    if (S.challenge) updateChallengeUI();
  }
  var raf = 0, queued = false;
  function renderAll() { drawField(); drawNet(); drawLoss(); updateStats(); }
  var SPEEDS = { 0: 10, 1: 30, 2: 90, 3: 300 };             // epochs per second
  var lastT = 0, acc = 0;
  function frame(now) {
    raf = 0;
    if (!S.playing) return;
    var dt = Math.min(100, now - (lastT || now)); lastT = now;
    acc += SPEEDS[S.speed] * dt / 1000;
    var n = Math.min(40, Math.floor(acc)); acc -= Math.floor(acc);
    if (n > 0 && S.train.length) epochs(n);
    renderAll(); raf = requestAnimationFrame(frame);
  }
  function kick() { if (S.playing && !raf) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function syncPlayButton() {
    var b = $("btn-play"); b.textContent = S.playing ? "⏸ Pause" : "▶ Play"; b.setAttribute("aria-pressed", String(S.playing));
    $("btn-step").disabled = S.playing;
  }
  function setPlaying(v) {
    if (v && S.ended) { newNet(); }
    S.playing = v; syncPlayButton(); if (v) kick();
    if (!v) renderAll();
  }

  /* ---------- controls ---------- */
  function syncControls() {
    $("act").value = S.act; $("lr").value = S.lrIdx; $("lr-out").textContent = String(LR_STEPS[S.lrIdx]);
    $("l2").value = S.l2Idx; $("l2-out").textContent = L2_STEPS[S.l2Idx] === 0 ? "off" : String(L2_STEPS[S.l2Idx]);
    $("opt").value = S.opt; $("speed").value = S.speed; $("speed-out").textContent = SPEEDS[S.speed] + " epochs/s"; buildArch();
  }
  function settingsChanged(msg) { if (S.challenge) { newNet(); } if (msg) say(msg); renderAll(); kick(); }
  $("act").addEventListener("change", function () { S.act = $("act").value; newNet(); say("Activation: " + $("act").selectedOptions[0].textContent + ". Training restarted with new random weights."); renderAll(); });
  $("lr").addEventListener("input", function () { S.lrIdx = Number($("lr").value); $("lr-out").textContent = String(LR_STEPS[S.lrIdx]); settingsChanged(); });
  $("l2").addEventListener("input", function () { S.l2Idx = Number($("l2").value); $("l2-out").textContent = L2_STEPS[S.l2Idx] === 0 ? "off" : String(L2_STEPS[S.l2Idx]); settingsChanged(); });
  $("opt").addEventListener("change", function () { S.opt = $("opt").value; core.resetOptimizer(S.net); settingsChanged("Optimiser: " + $("opt").selectedOptions[0].textContent + ". The learning rate may need adjusting."); });
  $("speed").addEventListener("input", function () { S.speed = Number($("speed").value); $("speed-out").textContent = SPEEDS[S.speed] + " epochs/s"; });
  $("btn-play").addEventListener("click", function () { setPlaying(!S.playing); say(S.playing ? "Training." : "Paused. Press Step to train one epoch at a time."); });
  $("btn-step").addEventListener("click", function () { if (S.ended) newNet(); if (S.train.length) epochs(1); renderAll(); });
  $("btn-reset").addEventListener("click", function () { var was = S.playing || S.ended; newNet(); S.playing = was; syncPlayButton(); renderAll(); kick(); say("Weights re-initialised at random. Epoch counter reset."); });

  $("preset").addEventListener("change", function () {
    var k = $("preset").value, pr = PRESETS[k];
    S.noise = pr.noise; $("noise").value = S.noise; $("noise-out").textContent = Math.round(S.noise * 100) + " %";
    loadData(k, false);
    if (k === "overfit") {
      S.hidden = pr.hidden.slice(); S.act = "tanh"; S.lrIdx = 3; S.l2Idx = 0; S.opt = "adam"; syncControls();
      say("Overfit me: 30 noisy training points, a large network and no regularisation. Watch the test loss (dashed) rise while the training loss falls.");
    } else say("Data set: " + pr.label + ".");
    newNet(); S.playing = true; syncPlayButton(); renderAll(); kick();
  });
  $("noise").addEventListener("input", function () { S.noise = Number($("noise").value); $("noise-out").textContent = Math.round(S.noise * 100) + " %"; loadData(S.preset, false); newNet(); renderAll(); kick(); });
  $("btn-regen").addEventListener("click", function () { loadData(S.preset, true); newNet(); say("New random sample of the same data set."); renderAll(); kick(); });
  $("btn-clear").addEventListener("click", function () { S.train = []; S.test = []; S.hist = { e: [], tr: [], te: [], every: 1 }; S.epoch = 0; S.net = core.createNet(S.hidden, S.act, (Date.now() >>> 0)); recordPoint(true); say("All points removed. Click the field to add points of both colours; training continues while you add them."); renderAll(); kick(); });
  $("show-test").addEventListener("change", function () { S.showTest = $("show-test").checked; renderAll(); });
  document.querySelectorAll('input[name="cls"]').forEach(function (r) { r.addEventListener("change", function () { S.cls = Number(r.value); }); });
  document.querySelectorAll(".tool").forEach(function (b) { b.addEventListener("click", function () {
    S.tool = b.dataset.tool; document.querySelectorAll(".tool").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); }); toolHint();
  }); });
  $("chal").addEventListener("change", function () { var v = $("chal").value; if (v) startChallenge(v); else exitChallenge(); });
  $("chal-exit").addEventListener("click", exitChallenge);
  function toolHint() { $("tool-hint").textContent = S.tool === "add" ? "Click or tap the field to add a point of the selected colour. Training keeps running while you add points." : "Click or tap close to a point to remove it."; }

  /* ---------- field interaction (tap = add / erase) ---------- */
  var down = null;
  function fieldPos(ev) { var r = field.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * 2 - 1, y: 1 - (ev.clientY - r.top) / r.height * 2 }; }
  function addPoint(x, y) {
    if (S.challenge) { say("The challenge uses a fixed data set. Leave the challenge to add your own points."); return; }
    if (S.tool === "erase") {
      var best = -1, bd = 0.09, i, arr = S.train;
      for (i = 0; i < arr.length; i++) { var d = Math.hypot(arr[i].x - x, arr[i].y - y); if (d < bd) { bd = d; best = i; } }
      if (best >= 0) { arr.splice(best, 1); say("Point removed."); } else {
        arr = S.test; for (i = 0; i < arr.length; i++) { var d2 = Math.hypot(arr[i].x - x, arr[i].y - y); if (d2 < bd) { bd = d2; best = i; } }
        if (best >= 0) { arr.splice(best, 1); say("Test point removed."); }
      }
    } else {
      if (S.train.length >= MAX_POINTS) { say("The limit of " + MAX_POINTS + " points has been reached."); return; }
      S.train.push({ x: clamp1(x), y: clamp1(y), c: S.cls });
      say("Added a " + (S.cls ? "orange square" : "blue circle") + ". " + S.train.length + " training points.");
    }
    S.net.idx = null; recordPoint(false); renderAll(); kick();
  }
  field.addEventListener("pointerdown", function (e) { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
  field.addEventListener("pointerup", function (e) {
    if (!down || down.id !== e.pointerId) return;
    var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (moved < 10 && dt < 700) { var p = fieldPos(e); S.cursor.on = false; addPoint(p.x, p.y); }
  });
  field.addEventListener("pointercancel", function () { down = null; });
  field.addEventListener("keydown", function (e) {
    var step = e.shiftKey ? 0.15 : 0.05, c = S.cursor, handled = true;
    if (!c.on) { c.on = true; }
    if (e.key === "ArrowLeft") c.x = clamp1(c.x - step); else if (e.key === "ArrowRight") c.x = clamp1(c.x + step);
    else if (e.key === "ArrowUp") c.y = clamp1(c.y + step); else if (e.key === "ArrowDown") c.y = clamp1(c.y - step);
    else if (e.key === " " || e.key === "Enter") addPoint(c.x, c.y);
    else if (e.key === "1" || e.key === "2") { S.cls = Number(e.key) - 1; document.querySelector('input[name="cls"][value="' + S.cls + '"]').checked = true; }
    else handled = false;
    if (handled) { e.preventDefault(); if (!S.playing) renderAll(); }
  });
  field.addEventListener("focus", function () { S.cursor.on = true; if (!S.playing) renderAll(); });
  field.addEventListener("blur", function () { S.cursor.on = false; if (!S.playing) renderAll(); });
  netCv.addEventListener("pointermove", netPointer); netCv.addEventListener("pointerdown", netPointer);
  netCv.addEventListener("pointerleave", function () { S.hover = null; showReadout(); if (!S.playing) renderAll(); });

  window.addEventListener("resize", function () { if (!S.playing) renderAll(); });
  new MutationObserver(function () { renderAll(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) kick(); });

  /* ---------- init ---------- */
  function init() {
    var q = new URLSearchParams(location.search);
    PRESETS.circle && Object.keys(PRESETS).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = PRESETS[k].label; $("preset").appendChild(o); });
    Object.keys(CHALLENGES).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = CHALLENGES[k].label; $("chal").appendChild(o); });
    var p = q.get("preset"); if (!PRESETS[p]) p = "circle";
    S.preset = p; S.noise = PRESETS[p].noise; $("preset").value = p; $("noise").value = S.noise; $("noise-out").textContent = Math.round(S.noise * 100) + " %";
    S.hidden = PRESETS[p].hidden.slice(); if (PRESETS[p].lrIdx != null) S.lrIdx = PRESETS[p].lrIdx;
    loadData(p, false); syncControls(); newNet(); toolHint(); showReadout();
    root.__nn = { state: S, core: core, render: renderAll, epochs: epochs, startChallenge: startChallenge };
    renderAll();
    if (q.get("challenge") && CHALLENGES[q.get("challenge")]) startChallenge(q.get("challenge"));
    else if (reduced) { S.playing = false; say("Training is paused because reduced motion is requested. Press Play to start."); }
    else { S.playing = true; say("Training has started automatically. The background colour shows the network’s current answer for every position."); }
    syncPlayButton(); kick();
  }
  init();
})(typeof window !== "undefined" ? window : globalThis);
