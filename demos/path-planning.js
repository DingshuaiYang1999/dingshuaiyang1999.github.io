/* Path-planning visualizer: RRT, Bidirectional RRT, PRM (+ optional RRT*).
   Plain JavaScript + <canvas>, no dependencies.

   The three main algorithms are a port of the Python versions in
   github.com/DingshuaiYang1999/python-robotics-learning (04_robotics/path_planning).
   The world is 800 x 500 units; obstacles live in a bitmap so that rectangles,
   brush strokes and the eraser all share one collision test. */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Core: world, collision checks, algorithms (no DOM below this banner) */
  /* ------------------------------------------------------------------ */

  var W = 800, H = 500;
  var MARGIN = 20;            // keep-out border around the map
  var COLLISION_STEP = 4;     // same as COLLISION_STEP in rrt.py / bidirectional_rrt.py
  var MERGE_RADIUS = 4;       // do not add a node closer than this to an existing one
  var OBSTACLE_CLEARANCE = 2; // padding around obstacles for RRT-style planners
  var PRM_POINT_CLEARANCE = 10, PRM_EDGE_CLEARANCE = 7, PRM_MIN_SPACING = 16, PRM_EDGE_STEP = 5; // as in prm.py

  function mulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function dilate(src, r) {
    r = Math.ceil(r);
    if (r <= 0) return src;
    var tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
    var pre = new Int32Array(Math.max(W, H) + 1);
    var x, y, lo, hi;
    for (y = 0; y < H; y++) {
      pre[0] = 0;
      for (x = 0; x < W; x++) pre[x + 1] = pre[x] + src[y * W + x];
      for (x = 0; x < W; x++) {
        lo = Math.max(0, x - r); hi = Math.min(W - 1, x + r);
        tmp[y * W + x] = pre[hi + 1] - pre[lo] > 0 ? 1 : 0;
      }
    }
    for (x = 0; x < W; x++) {
      pre[0] = 0;
      for (y = 0; y < H; y++) pre[y + 1] = pre[y] + tmp[y * W + x];
      for (y = 0; y < H; y++) {
        lo = Math.max(0, y - r); hi = Math.min(H - 1, y + r);
        out[y * W + x] = pre[hi + 1] - pre[lo] > 0 ? 1 : 0;
      }
    }
    return out;
  }

  function World() {
    this.solid = new Uint8Array(W * H);
    this.rev = 0;
    this._cache = {};
  }
  World.prototype.touch = function () { this._cache = {}; this.rev++; };
  World.prototype.clear = function () { this.solid.fill(0); this.touch(); };
  World.prototype.fillRect = function (x0, y0, x1, y1, v) {
    var xa = Math.max(0, Math.floor(Math.min(x0, x1))), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1)) - 1);
    var ya = Math.max(0, Math.floor(Math.min(y0, y1))), yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1)) - 1);
    for (var y = ya; y <= yb; y++) for (var x = xa; x <= xb; x++) this.solid[y * W + x] = v;
    this.touch();
  };
  World.prototype.fillCircle = function (cx, cy, r, v) {
    var r2 = r * r;
    var ya = Math.max(0, Math.floor(cy - r)), yb = Math.min(H - 1, Math.ceil(cy + r));
    var xa = Math.max(0, Math.floor(cx - r)), xb = Math.min(W - 1, Math.ceil(cx + r));
    for (var y = ya; y <= yb; y++) for (var x = xa; x <= xb; x++) {
      var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) this.solid[y * W + x] = v;
    }
    this.touch();
  };
  World.prototype.isSolid = function (x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    return this.solid[(y | 0) * W + (x | 0)] === 1;
  };
  World.prototype.mask = function (r) {
    var key = String(r);
    if (!this._cache[key]) this._cache[key] = dilate(this.solid, r);
    return this._cache[key];
  };
  /* free(x, y): inside the map margin and at least `r` units away from every obstacle. */
  World.prototype.checker = function (r, margin) {
    var m = this.mask(r), mg = margin == null ? MARGIN : margin;
    return function (x, y) {
      if (x < mg || x > W - mg || y < mg || y > H - mg) return false;
      return m[(y | 0) * W + (x | 0)] === 0;
    };
  };

  function segmentFree(free, a, b, stepLen) {
    var total = dist(a, b);
    var steps = Math.max(2, Math.floor(total / stepLen));
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      if (!free(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }

  function pathLength(pts) {
    var s = 0;
    for (var i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
    return s;
  }

  /* Greedy "shortcut" smoothing: from each point jump to the farthest point that is still
     visible in a straight collision-free line. Shorter than the raw path, but not optimal. */
  function shortcut(pts, free) {
    if (!pts || pts.length < 3) return pts;
    var out = [pts[0]], i = 0, last = pts.length - 1;
    while (i < last) {
      var j = last;
      while (j > i + 1 && !segmentFree(free, pts[i], pts[j], COLLISION_STEP)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  function nearestIndex(nodes, t) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < nodes.length; i++) {
      var dx = nodes[i].x - t.x, dy = nodes[i].y - t.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function branch(nodes, idx) { // root -> idx
    var out = [];
    for (var c = idx; c !== -1; c = nodes[c].parent) out.push({ x: nodes[c].x, y: nodes[c].y });
    return out.reverse();
  }

  /* ---- RRT (rrt.py: run_rrt / steer_toward) ---------------------------------------- */
  function createRRT(ctx) {
    var start = ctx.start, goal = ctx.goal, P = ctx.params, rng = ctx.rng;
    var free = ctx.world.checker(OBSTACLE_CLEARANCE);
    var nodes = [{ x: start.x, y: start.y, parent: -1 }];
    var a = { kind: "rrt", nodes: nodes, iter: 0, maxIter: P.iterations, done: false, success: false,
      goalIdx: -1, sample: null, nearest: null, added: null, goalSamples: 0, failReason: "" };

    function steer(from, target, isGoal) {
      var total = dist(from, target);
      if (total < 1e-9) return null;
      if (isGoal && segmentFree(free, from, goal, COLLISION_STEP)) return { x: goal.x, y: goal.y, isGoal: true };
      var maxTravel = Math.min(P.step, total);
      var dx = (target.x - from.x) / total, dy = (target.y - from.y) / total;
      var last = null, travel = COLLISION_STEP, c;
      while (travel < maxTravel) {
        c = { x: from.x + dx * travel, y: from.y + dy * travel };
        if (!free(c.x, c.y)) break;
        last = c;
        travel += COLLISION_STEP;
      }
      c = { x: from.x + dx * maxTravel, y: from.y + dy * maxTravel };
      if (free(c.x, c.y)) last = c;
      return last;
    }

    a.step = function () {
      if (a.done) return false;
      a.iter++;
      var isGoal = rng() < P.bias, target;
      if (isGoal) { target = goal; a.goalSamples++; }
      else target = { x: MARGIN + rng() * (W - 2 * MARGIN), y: MARGIN + rng() * (H - 2 * MARGIN) };
      var ni = nearestIndex(nodes, target);
      a.sample = target; a.nearest = nodes[ni]; a.added = null;
      var changed = false;
      var cand = steer(nodes[ni], target, isGoal);
      if (cand && segmentFree(free, nodes[ni], cand, COLLISION_STEP)) {
        var close = false;
        for (var i = 0; i < nodes.length; i++) if (dist(cand, nodes[i]) < MERGE_RADIUS) { close = true; break; }
        if (!close) {
          nodes.push({ x: cand.x, y: cand.y, parent: ni });
          var ci = nodes.length - 1;
          a.added = nodes[ci]; changed = true;
          if (cand.isGoal) { a.goalIdx = ci; a.success = true; }
          else if (dist(cand, goal) <= P.step && segmentFree(free, cand, goal, COLLISION_STEP)) {
            nodes.push({ x: goal.x, y: goal.y, parent: ci });
            a.goalIdx = nodes.length - 1; a.success = true;
          }
        }
      }
      if (a.success) a.done = true;
      else if (a.iter >= a.maxIter) { a.done = true; a.failReason = "iterations"; }
      return changed;
    };
    a.path = function () { return a.success ? branch(nodes, a.goalIdx) : null; };
    a.nodeCount = function () { return nodes.length; };
    return a;
  }

  /* ---- Bidirectional RRT (bidirectional_rrt.py: run_bidirectional_search) ---------- */
  function createBiRRT(ctx) {
    var start = ctx.start, goal = ctx.goal, P = ctx.params, rng = ctx.rng;
    var free = ctx.world.checker(OBSTACLE_CLEARANCE);
    var startTree = { name: "start", nodes: [{ x: start.x, y: start.y, parent: -1 }] };
    var goalTree = { name: "goal", nodes: [{ x: goal.x, y: goal.y, parent: -1 }] };
    var active = startTree, passive = goalTree;
    var a = { kind: "birrt", startTree: startTree, goalTree: goalTree, iter: 0, maxIter: P.iterations, done: false,
      success: false, sample: null, nearest: null, added: null, meet: null, failReason: "" };

    function extendOnce(from, target) {
      var total = dist(from, target);
      if (total < 1e-9) return null;
      var travel = Math.min(P.step, total);
      var c = { x: from.x + (target.x - from.x) / total * travel, y: from.y + (target.y - from.y) / total * travel };
      if (segmentFree(free, from, c, COLLISION_STEP)) return total <= P.step ? { x: target.x, y: target.y } : c;
      return null;
    }
    function appendUnique(tree, parent, p) {
      for (var i = 0; i < tree.nodes.length; i++) if (dist(p, tree.nodes[i]) < MERGE_RADIUS) return -1;
      tree.nodes.push({ x: p.x, y: p.y, parent: parent });
      return tree.nodes.length - 1;
    }
    /* Greedy "connect": keep extending the other tree toward the new node until it arrives or gets stuck. */
    function tryConnect(tree, target) {
      for (;;) {
        var ni = nearestIndex(tree.nodes, target);
        var np = extendOnce(tree.nodes[ni], target);
        if (!np) return -1;
        var idx = appendUnique(tree, ni, np);
        if (idx < 0) return -1;
        a.added = tree.nodes[idx];
        if (dist(np, target) < 1e-6) return idx;
      }
    }

    a.step = function () {
      if (a.done) return false;
      a.iter++;
      var sample = { x: MARGIN + rng() * (W - 2 * MARGIN), y: MARGIN + rng() * (H - 2 * MARGIN) };
      var changed = false;
      var ni = nearestIndex(active.nodes, sample);
      a.sample = sample; a.nearest = active.nodes[ni]; a.added = null;
      var np = extendOnce(active.nodes[ni], sample);
      var newIdx = np ? appendUnique(active, ni, np) : -1;
      if (newIdx >= 0) {
        changed = true;
        a.added = active.nodes[newIdx];
        var other = tryConnect(passive, active.nodes[newIdx]);
        if (other >= 0) {
          var sIdx = active === startTree ? newIdx : other, gIdx = active === startTree ? other : newIdx;
          var fromStart = branch(startTree.nodes, sIdx), fromGoal = branch(goalTree.nodes, gIdx);
          a.pathPts = fromStart.concat(fromGoal.slice(0, -1).reverse());
          a.meet = { x: active.nodes[newIdx].x, y: active.nodes[newIdx].y };
          a.success = true; a.done = true;
          return true;
        }
        if (active.nodes.length > passive.nodes.length) { var t = active; active = passive; passive = t; }
      }
      if (a.iter >= a.maxIter) { a.done = true; a.failReason = "iterations"; }
      return changed;
    };
    a.activeName = function () { return active.name; };
    a.path = function () { return a.success ? a.pathPts : null; };
    a.nodeCount = function () { return startTree.nodes.length + goalTree.nodes.length; };
    return a;
  }

  /* ---- PRM (prm.py: sample_free_points / build_roadmap / search_roadmap) ----------- */
  function MinHeap() { this.h = []; }
  MinHeap.prototype.push = function (item) {
    var h = this.h, i = h.length; h.push(item);
    while (i > 0) { var p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; var t = h[p]; h[p] = h[i]; h[i] = t; i = p; }
  };
  MinHeap.prototype.pop = function () {
    var h = this.h, top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last; var i = 0, n = h.length;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < n && h[l][0] < h[m][0]) m = l;
        if (r < n && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        var t = h[m]; h[m] = h[i]; h[i] = t; i = m;
      }
    }
    return top;
  };
  MinHeap.prototype.size = function () { return this.h.length; };

  function createPRM(ctx) {
    var start = ctx.start, goal = ctx.goal, P = ctx.params, rng = ctx.rng;
    var pointFree = ctx.world.checker(PRM_POINT_CLEARANCE);
    var edgeFree = ctx.world.checker(PRM_EDGE_CLEARANCE);
    var useHeuristic = P.search !== "dijkstra";
    var points = [{ x: start.x, y: start.y }, { x: goal.x, y: goal.y }];
    var adj = [{}, {}];
    var edges = [];
    var a = { kind: "prm", points: points, edges: edges, phase: "sample", targetSamples: P.samples, done: false, success: false,
      connectIdx: 0, visited: [], iter: 0, sampleShortfall: false, cost: 0, current: -1, failReason: "" };
    var frontier, came = {}, costs = {}, seen = {};

    a.step = function () {
      if (a.done) return false;
      a.iter++;
      if (a.phase === "sample") {
        if (points.length - 2 < P.samples) {
          for (var tries = 0; tries < 500; tries++) {
            var p = { x: MARGIN + rng() * (W - 2 * MARGIN), y: MARGIN + rng() * (H - 2 * MARGIN) };
            if (!pointFree(p.x, p.y)) continue;
            var ok = true;
            for (var i = 2; i < points.length; i++) if (dist(p, points[i]) < PRM_MIN_SPACING) { ok = false; break; }
            if (!ok) continue;
            points.push(p); adj.push({});
            return true;
          }
          a.sampleShortfall = true;   // map too crowded to place more points
        }
        a.phase = "connect";
        return false;
      }
      if (a.phase === "connect") {
        if (a.connectIdx < points.length) {
          var idx = a.connectIdx++, pt = points[idx], cands = [];
          for (var o = 0; o < points.length; o++) if (o !== idx) cands.push([dist(pt, points[o]), o]);
          cands.sort(function (x, y) { return x[0] - y[0]; });
          var connected = 0;
          for (var c = 0; c < cands.length; c++) {
            var d = cands[c][0], other = cands[c][1];
            if (d > P.radius) break;
            if (adj[idx][other] !== undefined) continue;
            if (!segmentFree(edgeFree, pt, points[other], PRM_EDGE_STEP)) continue;
            adj[idx][other] = d; adj[other][idx] = d; edges.push([idx, other]);
            connected++;
            if (connected >= P.neighbors) break;
          }
          a.current = idx;
          return true;
        }
        a.phase = "search"; a.current = -1;
        frontier = new MinHeap();
        costs[0] = 0;
        frontier.push([useHeuristic ? dist(points[0], points[1]) : 0, 0, 0]);
        return false;
      }
      if (a.phase === "search") {
        if (!frontier.size()) { a.done = true; a.failReason = adj[0] && Object.keys(adj[0]).length === 0 ? "start" :
          (Object.keys(adj[1]).length === 0 ? "goal" : "disconnected"); return true; }
        var top = frontier.pop(), g = top[1], node = top[2];
        if (seen[node]) return false;
        seen[node] = true; a.visited.push(node); a.current = node;
        if (node === 1) {
          var path = [1], cur = 1;
          while (cur !== 0) { cur = came[cur]; path.push(cur); }
          path.reverse();
          a.pathIdx = path; a.cost = costs[1]; a.success = true; a.done = true; a.phase = "done";
          return true;
        }
        for (var nb in adj[node]) {
          nb = +nb;
          var cc = g + adj[node][nb];
          if (costs[nb] !== undefined && cc >= costs[nb]) continue;
          costs[nb] = cc; came[nb] = node;
          frontier.push([cc + (useHeuristic ? dist(points[nb], points[1]) : 0), cc, nb]);
        }
        return true;
      }
      return false;
    };
    a.path = function () { return a.success ? a.pathIdx.map(function (i) { return { x: points[i].x, y: points[i].y }; }) : null; };
    a.nodeCount = function () { return points.length; };
    return a;
  }

  /* ---- RRT* (extra: not in the Python repo) ---------------------------------------- */
  function createRRTStar(ctx) {
    var start = ctx.start, goal = ctx.goal, P = ctx.params, rng = ctx.rng;
    var free = ctx.world.checker(OBSTACLE_CLEARANCE);
    var nodes = [{ x: start.x, y: start.y, parent: -1, cost: 0, kids: [] }];
    var a = { kind: "rrtstar", nodes: nodes, iter: 0, maxIter: P.iterations, done: false, success: false,
      bestNode: -1, bestCost: Infinity, firstIter: 0, sample: null, nearest: null, added: null, improved: false, failReason: "" };

    function steer(from, target, isGoal) { // same local planner as RRT
      var total = dist(from, target);
      if (total < 1e-9) return null;
      var maxTravel = Math.min(P.step, total);
      var dx = (target.x - from.x) / total, dy = (target.y - from.y) / total;
      var last = null, travel = COLLISION_STEP, c;
      while (travel < maxTravel) {
        c = { x: from.x + dx * travel, y: from.y + dy * travel };
        if (!free(c.x, c.y)) break;
        last = c; travel += COLLISION_STEP;
      }
      c = { x: from.x + dx * maxTravel, y: from.y + dy * maxTravel };
      if (free(c.x, c.y)) last = c;
      return last;
    }
    function setCost(idx, cost) { // update a node and everything below it
      var stack = [[idx, cost]];
      while (stack.length) {
        var it = stack.pop(), n = nodes[it[0]];
        n.cost = it[1];
        for (var k = 0; k < n.kids.length; k++) stack.push([n.kids[k], it[1] + dist(n, nodes[n.kids[k]])]);
      }
    }
    function tryGoal(idx) {
      var n = nodes[idx], d = dist(n, goal);
      if (d > P.step * 1.5 || n.cost + d >= a.bestCost) return;
      if (!segmentFree(free, n, goal, COLLISION_STEP)) return;
      a.bestNode = idx; a.bestCost = n.cost + d;
      if (!a.success) { a.success = true; a.firstIter = a.iter; }
      a.improved = true;
    }

    a.step = function () {
      if (a.done) return false;
      a.iter++; a.improved = false;
      var isGoal = rng() < P.bias;
      var target = isGoal ? goal : { x: MARGIN + rng() * (W - 2 * MARGIN), y: MARGIN + rng() * (H - 2 * MARGIN) };
      var ni = nearestIndex(nodes, target);
      a.sample = target; a.nearest = nodes[ni]; a.added = null;
      var changed = false;
      var cand = steer(nodes[ni], target, isGoal);
      if (cand && segmentFree(free, nodes[ni], cand, COLLISION_STEP)) {
        var near = [], dup = false, i;
        for (i = 0; i < nodes.length; i++) {
          var d = dist(nodes[i], cand);
          if (d < MERGE_RADIUS) { dup = true; break; }
          if (d <= P.rewire) near.push([i, d]);
        }
        if (!dup) {
          // 1) choose the cheapest collision-free parent among the neighbours
          var bestParent = ni, bestC = nodes[ni].cost + dist(nodes[ni], cand);
          var visible = [];
          for (i = 0; i < near.length; i++) {
            var nn = nodes[near[i][0]];
            if (!segmentFree(free, nn, cand, COLLISION_STEP)) continue;
            visible.push(near[i]);
            if (nn.cost + near[i][1] < bestC) { bestC = nn.cost + near[i][1]; bestParent = near[i][0]; }
          }
          nodes.push({ x: cand.x, y: cand.y, parent: bestParent, cost: bestC, kids: [] });
          var newIdx = nodes.length - 1;
          nodes[bestParent].kids.push(newIdx);
          a.added = nodes[newIdx]; changed = true;
          // 2) rewire: neighbours that become cheaper through the new node switch parent
          var touched = [newIdx];
          for (i = 0; i < visible.length; i++) {
            var oi = visible[i][0];
            if (oi === bestParent || oi === 0) continue;
            var o = nodes[oi], viaNew = bestC + visible[i][1];
            if (viaNew < o.cost - 1e-9) {
              var oldKids = nodes[o.parent].kids, at = oldKids.indexOf(oi);
              if (at >= 0) oldKids.splice(at, 1);
              o.parent = newIdx; nodes[newIdx].kids.push(oi);
              setCost(oi, viaNew);
              touched.push(oi);
            }
          }
          for (i = 0; i < touched.length; i++) tryGoal(touched[i]);
        }
      }
      if (a.bestNode >= 0) { // costs of the current best branch may have dropped through rewiring
        var nc = nodes[a.bestNode].cost + dist(nodes[a.bestNode], goal);
        if (nc < a.bestCost - 1e-9) { a.bestCost = nc; a.improved = true; }
      }
      if (a.iter >= a.maxIter) { a.done = true; if (!a.success) a.failReason = "iterations"; }
      return changed;
    };
    a.path = function () {
      if (a.bestNode < 0) return null;
      return branch(nodes, a.bestNode).concat([{ x: goal.x, y: goal.y }]);
    };
    a.nodeCount = function () { return nodes.length; };
    return a;
  }

  var FACTORIES = { rrt: createRRT, birrt: createBiRRT, prm: createPRM, rrtstar: createRRTStar };
  function createAlgorithm(kind, ctx) { return FACTORIES[kind](ctx); }

  /* ---- Maps ------------------------------------------------------------------------ */
  var SX = 800 / 760; // the Python bidirectional map is 760 x 500
  function wallRects() { // obstacles of bidirectional_rrt.py, stretched to 800 wide
    var r = [[180, 0, 46, 180], [180, 250, 46, 250], [355, 0, 46, 120], [355, 190, 46, 310],
      [530, 0, 46, 175], [530, 245, 46, 255], [620, 140, 66, 42]];
    return r.map(function (q) { return [q[0] * SX, q[1], q[2] * SX, q[3]]; });
  }
  var PRESETS = {
    walls: { label: "Walls with gaps (from my Python demo)", rects: wallRects },
    narrow: { label: "Narrow passage", rects: function () {
      return [[380, 0, 40, 225], [380, 275, 40, 225], [170, 120, 90, 70], [560, 310, 100, 80]]; } },
    cup: { label: "Dead-end cup (traps greedy growth)", rects: function () {
      return [[250, 190, 300, 24], [250, 300, 300, 24], [526, 190, 24, 134], [120, 60, 120, 40], [600, 400, 120, 40]]; } },
    empty: { label: "Empty field", rects: function () { return []; } }
  };

  function loadPreset(world, key) {
    world.clear();
    (PRESETS[key].rects)().forEach(function (r) { world.fillRect(r[0], r[1], r[0] + r[2], r[1] + r[3], 1); });
  }

  function coarseSolvable(world, start, goal) { // flood fill on a coarse grid
    var m = world.mask(6), cs = 10, cw = W / cs, ch = H / cs;
    function ok(cx, cy) { var x = cx * cs + cs / 2, y = cy * cs + cs / 2; return x > MARGIN && x < W - MARGIN && y > MARGIN && y < H - MARGIN && m[(y | 0) * W + (x | 0)] === 0; }
    var sx = Math.floor(start.x / cs), sy = Math.floor(start.y / cs), gx = Math.floor(goal.x / cs), gy = Math.floor(goal.y / cs);
    var seen = new Uint8Array(cw * ch), q = [[sx, sy]]; seen[sy * cw + sx] = 1;
    while (q.length) {
      var c = q.pop();
      if (Math.abs(c[0] - gx) <= 1 && Math.abs(c[1] - gy) <= 1) return true;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = c[0] + d[0], ny = c[1] + d[1];
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch || seen[ny * cw + nx]) return;
        if (!ok(nx, ny) && !(Math.abs(nx - gx) <= 1 && Math.abs(ny - gy) <= 1)) return;
        seen[ny * cw + nx] = 1; q.push([nx, ny]);
      });
    }
    return false;
  }

  /* Random rectangles, as in prm.py generate_obstacles (sizes scaled by 0.8 for the 800x500 world);
     retried until a coarse flood fill says start and goal are connected. */
  function randomObstacles(world, rng, start, goal) {
    for (var attempt = 0; attempt < 40; attempt++) {
      var rects = [], tries = 0;
      while (rects.length < 8 && tries < 800) {
        tries++;
        var w = Math.round(60 + rng() * 60), h = Math.round(44 + rng() * 60);
        var x = Math.round(MARGIN + 16 + rng() * (W - 2 * MARGIN - w - 32)), y = Math.round(MARGIN + 16 + rng() * (H - 2 * MARGIN - h - 32));
        var near = [start, goal].some(function (p) { return p.x >= x - 56 && p.x <= x + w + 56 && p.y >= y - 56 && p.y <= y + h + 56; });
        if (near) continue;
        var overlap = rects.some(function (r) { return !(x + w + 18 < r[0] || r[0] + r[2] + 18 < x || y + h + 18 < r[1] || r[1] + r[3] + 18 < y); });
        if (overlap) continue;
        rects.push([x, y, w, h]);
      }
      world.clear();
      rects.forEach(function (r) { world.fillRect(r[0], r[1], r[0] + r[2], r[1] + r[3], 1); });
      if (coarseSolvable(world, start, goal)) return true;
    }
    return false;
  }

  var core = { W: W, H: H, MARGIN: MARGIN, World: World, createAlgorithm: createAlgorithm, mulberry32: mulberry32,
    segmentFree: segmentFree, shortcut: shortcut, pathLength: pathLength, loadPreset: loadPreset, PRESETS: PRESETS,
    randomObstacles: randomObstacles, COLLISION_STEP: COLLISION_STEP, OBSTACLE_CLEARANCE: OBSTACLE_CLEARANCE, dist: dist };
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  root.PathPlanningCore = core;
  if (typeof document === "undefined") return;

  /* ------------------------------------------------------------------ */
  /* UI                                                                   */
  /* ------------------------------------------------------------------ */

  var $ = function (id) { return document.getElementById(id); };
  var START0 = { x: 60, y: 440 }, GOAL0 = { x: 740, y: 60 };

  var ALGOS = {
    rrt: { name: "RRT", full: "Rapidly-exploring Random Tree",
      params: [
        { id: "step", label: "Step size", min: 5, max: 60, step: 1, value: 20, hint: "How far the tree grows toward each random point." },
        { id: "iterations", label: "Max iterations", min: 100, max: 20000, step: 100, value: 5000, hint: "Give up after this many random samples." },
        { id: "bias", label: "Goal bias", min: 0, max: 0.5, step: 0.01, value: 0.08, hint: "Chance that a random sample is the goal itself.", fmt: function (v) { return Math.round(v * 100) + "%"; } }
      ],
      legend: [["tree", "Tree grown from the start"], ["sample", "Random sample (ring)"], ["new", "Newest branch"], ["path", "Path found"]],
      explain: {
        tech: '<p>Let T be a tree rooted at x<sub>start</sub>. Each iteration draws x<sub>rand</sub> uniformly from the free space (with probability p<sub>goal</sub> it is x<sub>goal</sub> instead, the “goal bias”), finds x<sub>near</sub> = argmin<sub>x∈T</sub> ‖x − x<sub>rand</sub>‖ by a linear scan, and steers one step:</p><p class="formula">x<sub>new</sub> = x<sub>near</sub> + min(δ, ‖x<sub>rand</sub> − x<sub>near</sub>‖) · (x<sub>rand</sub> − x<sub>near</sub>) / ‖x<sub>rand</sub> − x<sub>near</sub>‖</p><p>The node is added only if the segment x<sub>near</sub>→x<sub>new</sub> is collision-free (tested at 4-unit intervals against the obstacle bitmap, padded by a small clearance). The search stops when the segment from a new node to x<sub>goal</sub> is free. RRT is probabilistically complete (the probability of finding an existing path tends to 1 as the number of samples grows) but not asymptotically optimal. The step size δ trades exploration speed against the ability to pass through narrow gaps.</p>',
        summary: "RRT searches by growing a tree of short branches out of the start point, like a plant exploring a room. It never plans a whole route in advance; it just keeps trying random directions.",
        steps: ["Pick a random point on the map (now and then, pick the goal itself).", "Find the closest branch tip already in the tree.", "Grow one short step from that tip toward the random point, but only if the way is clear.", "Stop as soon as a branch can reach the goal, then read the path back along the branches."],
        notice: "The tree spreads into big open areas first, then squeezes through gaps. A higher goal bias makes it rush toward the goal, but it can also get stuck in dead ends.",
        limits: "RRT is not optimal. It stops at the first path it finds, so the route is usually wiggly and longer than necessary. Try “Smooth the path”, or switch to RRT*."
      } },
    birrt: { name: "Bidirectional RRT", full: "Bidirectional RRT (two trees)",
      params: [
        { id: "step", label: "Step size", min: 5, max: 60, step: 1, value: 20, hint: "How far a tree grows per extension." },
        { id: "iterations", label: "Max iterations", min: 100, max: 20000, step: 100, value: 3000, hint: "Give up after this many random samples." }
      ],
      legend: [["tree", "Tree from the start"], ["tree2", "Tree from the goal"], ["sample", "Random sample (ring)"], ["path", "Path found"]],
      explain: {
        tech: '<p>Two trees T<sub>a</sub> (from x<sub>start</sub>) and T<sub>b</sub> (from x<sub>goal</sub>) are grown. In each iteration T<sub>a</sub> is extended toward a random sample as in RRT, giving x<sub>new</sub>. Then T<sub>b</sub> repeatedly extends toward x<sub>new</sub> (the “connect” step) until it reaches it, is blocked by an obstacle, or the iteration budget ends. If T<sub>b</sub> reaches x<sub>new</sub>, the path is the branch from x<sub>start</sub> to x<sub>new</sub> joined with the branch from x<sub>goal</sub>. Otherwise the roles of the trees are exchanged. The result is probabilistically complete and usually needs fewer samples than single-tree RRT, but it is also not optimal.</p>',
        summary: "Two trees grow at the same time: one from the start and one from the goal. The search is finished the moment they touch, which usually takes far fewer samples than one tree reaching a faraway goal.",
        steps: ["Grow the smaller tree one step toward a random point.", "Then let the other tree try to chase that new tip, step by step.", "If it gets there, the two trees are joined: start and goal are connected.", "Otherwise swap roles and repeat."],
        notice: "Watch the blue and orange trees reach out toward each other. In maps with a narrow gap in the middle, the meeting point usually lands right in the gap.",
        limits: "Like RRT, it returns the first connection it finds, not the shortest one. The path often has a sharp kink where the two trees met."
      } },
    prm: { name: "PRM", full: "Probabilistic Roadmap",
      params: [
        { id: "samples", label: "Samples", min: 20, max: 1000, step: 10, value: 200, hint: "How many random free points to scatter on the map." },
        { id: "radius", label: "Connection radius", min: 40, max: 400, step: 5, value: 180, hint: "Only points closer than this may be linked." },
        { id: "neighbors", label: "Neighbours (k)", min: 2, max: 30, step: 1, value: 12, hint: "Each point links to at most this many neighbours it can see." }
      ],
      select: { id: "search", label: "Graph search", options: [["astar", "A* (guided by distance to goal)"], ["dijkstra", "Dijkstra (no guidance)"]] },
      legend: [["sample", "Sampled point"], ["edge", "Safe connection"], ["visited", "Explored by the search"], ["path", "Shortest path in the roadmap"]],
      explain: {
        tech: '<p>PRM has two phases. <strong>Learning phase:</strong> draw N random configurations in free space (rejecting points within a clearance of obstacles and points too close to an existing sample), then connect each sample to up to k nearest samples within the connection radius r when the straight segment is collision-free. This builds an undirected weighted graph G = (V, E) with edge weight equal to segment length. <strong>Query phase:</strong> connect x<sub>start</sub> and x<sub>goal</sub> to the roadmap and search G.</p><p class="formula">Dijkstra: expand the node with the smallest g(n).  A*: expand the node with the smallest f(n) = g(n) + h(n), h(n) = ‖n − x<sub>goal</sub>‖</p><p>The Euclidean heuristic h is admissible and consistent here, so A* returns the same shortest roadmap path as Dijkstra while usually exploring fewer nodes. The path is optimal only within the roadmap; as N grows (with a suitable radius) it approaches the true shortest path. The roadmap is independent of the query, so it can be reused for many start–goal pairs in a static map.</p>',
        summary: "PRM first builds a road network. It scatters random points over the free space and links nearby points with straight lines that do not touch an obstacle. Then a graph search finds the shortest route along those roads from start to goal.",
        steps: ["Scatter random points that are not inside (or too close to) obstacles.", "Link each point to its nearest neighbours when the straight line between them is clear.", "Run A* (or Dijkstra) on that network from start to goal.", "Highlight the cheapest chain of roads."],
        notice: "The roadmap does not depend on where you start or end, so a real robot could reuse it for many trips in the same static map. Add more samples to see the path get closer to the true shortest route.",
        limits: "The path is the shortest one inside the roadmap, not necessarily the shortest possible path on the map. With too few samples (or a small radius) the roadmap may not connect the start to the goal at all."
      } },
    rrtstar: { name: "RRT* (extra)", full: "RRT* (asymptotically optimal RRT)",
      params: [
        { id: "step", label: "Step size", min: 5, max: 60, step: 1, value: 20, hint: "How far the tree grows toward each random point." },
        { id: "iterations", label: "Max iterations", min: 100, max: 8000, step: 100, value: 3000, hint: "RRT* keeps improving until this many samples." },
        { id: "bias", label: "Goal bias", min: 0, max: 0.5, step: 0.01, value: 0.05, hint: "Chance that a random sample is the goal itself.", fmt: function (v) { return Math.round(v * 100) + "%"; } },
        { id: "rewire", label: "Rewire radius", min: 15, max: 150, step: 5, value: 50, hint: "New nodes look for better parents and shortcuts within this distance." }
      ],
      legend: [["tree", "Tree"], ["sample", "Random sample (ring)"], ["new", "Newest branch"], ["path", "Best path so far"]],
      explain: {
        tech: '<p>RRT* adds two steps to RRT. <strong>Choose parent:</strong> among the nodes within the rewire radius r of x<sub>new</sub> that can see it, pick the one minimising cost-to-come c(x<sub>near</sub>) + ‖x<sub>near</sub> − x<sub>new</sub>‖. <strong>Rewire:</strong> for each neighbour x within r, if</p><p class="formula">c(x<sub>new</sub>) + ‖x<sub>new</sub> − x‖ &lt; c(x)</p><p>and the segment is free, x switches its parent to x<sub>new</sub>. With a suitable radius that shrinks like (log n / n)<sup>1/d</sup>, RRT* is asymptotically optimal: the cost of the best path converges to the optimum as the number of samples grows. This page uses a fixed rewire radius, which is a common simplification, and keeps sampling after the first solution so that the best path improves. The extra neighbour search and rewiring make each iteration more expensive than RRT.</p>',
        summary: "RRT* is a refinement of RRT that keeps polishing the answer. Every new branch picks the cheapest parent nearby, then offers its neighbours a cheaper route through itself (“rewiring”). The path found gets shorter as sampling continues.",
        steps: ["Grow the tree like RRT.", "Among nearby nodes, connect the new node to whichever gives the shortest trip back to the start.", "Check whether the new node can give any neighbour a shorter trip; if so, rewire that neighbour.", "Keep sampling after the first path appears; the best path keeps improving."],
        notice: "After the goal is first reached, keep watching: the yellow path straightens out over time. This is an extra algorithm I added here; it is not in the Python repository.",
        limits: "“Optimal” only in the limit: with infinite samples the path converges to the shortest one, but in any finite run it is just the best path found so far. It needs more computation than plain RRT."
      } }
  };
  var ORDER = ["rrt", "birrt", "prm", "rrtstar"];
  var ALIASES = { "bidirectional-rrt": "birrt", bidirectional: "birrt", bi: "birrt", "bi-rrt": "birrt", birrt: "birrt",
    rrt: "rrt", prm: "prm", "rrt*": "rrtstar", rrtstar: "rrtstar", "rrt-star": "rrtstar" };
  var SPEEDS = [4, 10, 25, 60, 150, 400, 1000, 2500, 6000, Infinity];
  var SPEED_NAMES = ["very slow", "slow", "slow", "medium", "medium", "fast", "fast", "very fast", "very fast", "instant"];

  var S = {
    algo: "rrt", tool: "rect", brush: 14, speed: 5,
    start: { x: START0.x, y: START0.y }, goal: { x: GOAL0.x, y: GOAL0.y },
    values: {}, world: new World(), alg: null, running: false, ms: 0, runSeed: null, randomCount: 0,
    smoothPath: null, rawPath: null, pathAnim: null, resultText: "", note: "",
    drag: null, kbd: { x: 400, y: 250, on: false }
  };
  ORDER.forEach(function (k) {
    S.values[k] = {};
    ALGOS[k].params.forEach(function (p) { S.values[k][p.id] = p.value; });
    if (ALGOS[k].select) S.values[k][ALGOS[k].select.id] = ALGOS[k].select.options[0][0];
  });
  loadPreset(S.world, "walls");

  var canvas = $("map"), ctx = canvas.getContext("2d");
  var obstacleLayer = document.createElement("canvas"); obstacleLayer.width = W; obstacleLayer.height = H;
  var obstacleRev = -1, colorsKey = "", colors = {};
  var raf = 0, lastTs = 0, acc = 0, cssW = 800;

  function readColors() {
    var cs = getComputedStyle(canvas), key = document.documentElement.getAttribute("data-theme") + "|" + cs.getPropertyValue("--pl-obstacle");
    if (key === colorsKey) return;
    colorsKey = key; obstacleRev = -1;
    ["bg", "grid", "obstacle", "tree", "tree2", "path", "casing", "start", "goal", "sample", "visited", "edge", "ring", "label"].forEach(function (n) {
      colors[n] = cs.getPropertyValue("--pl-" + n).trim();
    });
  }
  function status(msg) { $("status").textContent = msg; }

  /* ----- layout / canvas sizing ----- */
  function resize() {
    var box = canvas.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1);
    cssW = box.width || 800;
    var pw = Math.round(cssW * dpr);
    if (canvas.width !== pw) { canvas.width = pw; canvas.height = Math.round(pw * H / W); }
    kick();
  }
  function px(n) { return n * W / cssW; } // CSS pixels -> world units

  /* ----- drawing ----- */
  function drawObstacles() {
    if (obstacleRev === S.world.rev) return;
    var lc = obstacleLayer.getContext("2d"), img = lc.createImageData(W, H), d = img.data, solid = S.world.solid;
    var m = /(\d+)[^\d]+(\d+)[^\d]+(\d+)/.exec(colors.obstacle) || [0, 40, 52, 70];
    for (var i = 0, n = W * H; i < n; i++) {
      if (solid[i]) { var o = i * 4; d[o] = +m[1]; d[o + 1] = +m[2]; d[o + 2] = +m[3]; d[o + 3] = 255; }
    }
    lc.putImageData(img, 0, 0);
    obstacleRev = S.world.rev;
  }
  function line(a, b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  function dot(p, r, fill) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fillStyle = fill; ctx.fill(); }
  function ring(p, r, stroke, lw) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  function polyline(pts, upto) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    var left = upto == null ? Infinity : upto;
    for (var i = 1; i < pts.length && left > 0; i++) {
      var seg = dist(pts[i - 1], pts[i]);
      if (seg <= left) { ctx.lineTo(pts[i].x, pts[i].y); left -= seg; }
      else { var t = left / seg; ctx.lineTo(pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t); left = 0; }
    }
  }
  function strokePath(pts, upto, width, dashed) {
    if (!pts || pts.length < 2) return;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    polyline(pts, upto); ctx.strokeStyle = colors.casing; ctx.lineWidth = px(width + 3); ctx.setLineDash([]); ctx.stroke();
    polyline(pts, upto); ctx.strokeStyle = colors.path; ctx.lineWidth = px(width); ctx.setLineDash(dashed ? [px(6), px(5)] : []); ctx.stroke();
    ctx.setLineDash([]);
  }
  function drawTree(nodes, color, lw) {
    ctx.beginPath();
    for (var i = 1; i < nodes.length; i++) { var n = nodes[i]; if (n.parent >= 0) line(nodes[n.parent], n); }
    ctx.strokeStyle = color; ctx.lineWidth = px(lw); ctx.stroke();
  }
  function marker(p, fill, letter) {
    var r = px(11);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = px(2); ctx.strokeStyle = "#ffffff"; ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.font = "700 " + px(12) + "px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(letter, p.x, p.y + px(0.5));
  }

  function draw() {
    readColors(); drawObstacles();
    var sc = canvas.width / W;
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, W, H);
    ctx.beginPath();
    for (var gx = 0; gx <= W; gx += 40) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
    for (var gy = 0; gy <= H; gy += 40) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
    ctx.strokeStyle = colors.grid; ctx.lineWidth = px(1); ctx.stroke();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(obstacleLayer, 0, 0, W, H);

    var a = S.alg;
    if (a) {
      if (a.kind === "rrt" || a.kind === "rrtstar") {
        drawTree(a.nodes, colors.tree, 1.4);
        if (a.added && !a.done) { var par = a.nodes[a.added.parent]; ctx.beginPath(); line(par, a.added); ctx.strokeStyle = colors.path; ctx.lineWidth = px(2.5); ctx.stroke(); }
      } else if (a.kind === "birrt") {
        drawTree(a.startTree.nodes, colors.tree, 1.4); drawTree(a.goalTree.nodes, colors.tree2, 1.4);
      } else if (a.kind === "prm") {
        ctx.beginPath();
        for (var e = 0; e < a.edges.length; e++) line(a.points[a.edges[e][0]], a.points[a.edges[e][1]]);
        ctx.strokeStyle = colors.edge; ctx.lineWidth = px(1); ctx.stroke();
        for (var i = 2; i < a.points.length; i++) dot(a.points[i], px(2.6), colors.sample);
        for (var v = 0; v < a.visited.length; v++) if (a.visited[v] > 1) dot(a.points[a.visited[v]], px(3.4), colors.visited);
        if (a.phase === "connect" && a.current >= 0) ring(a.points[a.current], px(7), colors.ring, px(1.6));
      }
      if (a.sample && !a.done && a.kind !== "prm") {
        ring(a.sample, px(5), colors.sample, px(1.6));
        if (a.nearest) { ring(a.nearest, px(6.5), colors.ring, px(1.6)); }
      }
      var showPath = S.rawPath;
      if (showPath) {
        var total = pathLength(showPath), upto = S.pathAnim ? total * S.pathAnim.t : null;
        var smooth = S.smoothPath && (!S.pathAnim || S.pathAnim.t >= 1);
        strokePath(showPath, upto, smooth ? 2 : 4, smooth);
        if (smooth) strokePath(S.smoothPath, null, 4, false);
      }
    }
    if (S.drag && S.drag.rect) {
      var r = S.drag.rect;
      ctx.fillStyle = colors.obstacle; ctx.globalAlpha = 0.55;
      ctx.fillRect(Math.min(r.x0, r.x1), Math.min(r.y0, r.y1), Math.abs(r.x1 - r.x0), Math.abs(r.y1 - r.y0));
      ctx.globalAlpha = 1;
    }
    if (S.drag && S.drag.cursor && (S.tool === "brush" || S.tool === "erase") && S.drag.kind === "paint") {
      ring(S.drag.cursor, S.brush, colors.ring, px(1.5));
    }
    marker(S.start, colors.start, "S"); marker(S.goal, colors.goal, "G");
    if (S.kbd.on) {
      var k = S.kbd; ctx.beginPath(); ctx.moveTo(k.x - px(10), k.y); ctx.lineTo(k.x + px(10), k.y); ctx.moveTo(k.x, k.y - px(10)); ctx.lineTo(k.x, k.y + px(10));
      ctx.strokeStyle = colors.label; ctx.lineWidth = px(2); ctx.stroke();
      ring(k, S.brush, colors.label, px(1)); 
    }
  }

  /* ----- stats / status ----- */
  function fmtMs(ms) { return ms < 1000 ? ms.toFixed(ms < 10 ? 1 : 0) + " ms" : (ms / 1000).toFixed(2) + " s"; }
  function fmtLen(n) { return n.toFixed(0) + " units"; }
  function updateStats() {
    var a = S.alg, spec = S.algo, f = S.values[spec], it = "—", nodes = "—", plen = "—", result = "—", ilabel = "Iterations";
    if (spec === "prm") ilabel = a && a.phase === "sample" ? "Samples" : a && a.phase === "connect" ? "Linking points" : a ? "Search steps" : "Samples";
    if (a) {
      if (a.kind === "prm") {
        if (a.phase === "sample") it = (a.points.length - 2) + " / " + a.targetSamples;
        else if (a.phase === "connect") it = a.connectIdx + " / " + a.points.length;
        else it = String(a.visited.length);
        nodes = (a.points.length - 2) + " pts, " + a.edges.length + " links";
      } else {
        it = a.iter + " / " + a.maxIter;
        nodes = String(a.nodeCount());
      }
    } else if (spec === "prm") it = "0 / " + f.samples; else it = "0 / " + f.iterations;
    var best = a && a.path ? a.path() : null;
    if (best) {
      var raw = pathLength(best);
      plen = fmtLen(raw);
      if (S.smoothPath) plen = fmtLen(pathLength(S.smoothPath)) + " (raw " + raw.toFixed(0) + ")";
    }
    if (S.resultText) result = S.resultText;
    else if (S.running) result = "Searching…";
    $("st-iter-l").textContent = ilabel;
    $("st-iter").textContent = it; $("st-nodes").textContent = nodes; $("st-path").textContent = plen;
    $("st-time").textContent = a ? fmtMs(S.ms) : "—"; $("st-result").textContent = result;
    $("st-result").parentNode.setAttribute("data-state", S.resultState || "");
    $("note").textContent = S.note;
  }

  function resetSearch(msg) {
    S.running = false; S.alg = null; S.ms = 0; S.rawPath = null; S.smoothPath = null; S.pathAnim = null;
    S.resultText = ""; S.resultState = ""; S.note = ""; acc = 0;
    syncRunButton(); updateStats();
    if (msg) status(msg);
    kick();
  }

  function syncRunButton() {
    var b = $("btn-run"), done = S.alg && S.alg.done;
    b.textContent = S.running ? "⏸ Pause" : done ? "↻ Run again" : S.alg ? "▶ Resume" : "▶ Run";
    b.setAttribute("aria-label", S.running ? "Pause the search" : done ? "Run the search again" : S.alg ? "Resume the search" : "Run the search");
    $("btn-step").disabled = !!done;
  }

  function getSeed() {
    if ($("seed-fixed").checked) { var v = parseInt($("seed").value, 10); return isFinite(v) ? v : 27; }
    return Math.floor(Math.random() * 1000000);
  }
  function currentParams() {
    var p = {}, v = S.values[S.algo];
    Object.keys(v).forEach(function (k) { p[k] = v[k]; });
    return p;
  }
  function startFree() { return !S.world.isSolid(S.start.x, S.start.y) && !S.world.isSolid(S.goal.x, S.goal.y); }

  function createAlg() {
    if (!startFree()) { status("The start or goal is inside an obstacle. Move it or erase the obstacle."); return false; }
    var seed = getSeed(); S.runSeed = seed;
    S.alg = createAlgorithm(S.algo, { world: S.world, start: S.start, goal: S.goal, params: currentParams(), rng: mulberry32(seed) });
    S.ms = 0; S.rawPath = null; S.smoothPath = null; S.pathAnim = null; S.resultText = ""; S.resultState = ""; S.note = ""; acc = 0;
    return true;
  }

  var PHASE_TEXT = {
    sample: "Step 1 of 3: scattering random points in free space…",
    connect: "Step 2 of 3: linking neighbouring points with collision-free straight lines…",
    search: "Step 3 of 3: searching the roadmap for the cheapest route from S to G…"
  };
  var lastPhase = "";
  function phaseStatus() {
    var a = S.alg; if (!a || a.done) return;
    if (a.kind === "prm") { if (a.phase !== lastPhase) { lastPhase = a.phase; status(PHASE_TEXT[a.phase]); } }
    else if (!lastPhase) { lastPhase = "run"; status(S.algo === "birrt" ? "Growing two trees toward each other…" : S.algo === "rrtstar" ? "Growing the tree and rewiring for shorter routes…" : "Growing the tree toward random points…"); }
  }

  function computeSmooth() {
    var a = S.alg, p = a && a.path ? a.path() : null;
    S.rawPath = p; S.smoothPath = null;
    if (p && $("smooth").checked) {
      var s = shortcut(p, S.world.checker(OBSTACLE_CLEARANCE));
      S.smoothPath = pathLength(s) < pathLength(p) - 0.5 ? s : p.length > 2 ? s : null;
      if (S.smoothPath && S.smoothPath.length === p.length) S.smoothPath = null; // nothing to cut
    }
  }

  function finish() {
    var a = S.alg, spec = S.algo, p = a.path ? a.path() : null;
    S.running = false; lastPhase = "";
    computeSmooth();
    if (a.success && p) {
      var instant = SPEEDS[S.speed - 1] === Infinity || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
      S.pathAnim = instant ? null : { t: 0 };
      if (spec === "prm") { S.resultText = "Shortest path in the roadmap"; S.resultState = "ok";
        S.note = "A* / Dijkstra gives the shortest path inside this roadmap; the true shortest path on the map can be a little shorter. More samples get closer."; }
      else if (spec === "rrtstar") { S.resultText = "Best path so far"; S.resultState = "ok";
        S.note = "RRT* is only asymptotically optimal: this is the best path found within the iterations used (first path at iteration " + a.firstIter + "). Raise “Max iterations” to keep improving it."; }
      else { S.resultText = "Found a path"; S.resultState = "ok";
        S.note = "RRT is not optimal: it returns the first path it finds, which is usually longer than the shortest one." + (spec === "birrt" ? " Both trees met after " + a.iter + " iterations." : ""); }
      status((spec === "prm" ? "Done. Shortest path in the roadmap: " : spec === "rrtstar" ? "Done. Best path found: " : "Done. Found a path: ") + pathLength(S.smoothPath || p).toFixed(0) + " units" + (S.smoothPath ? " after smoothing" : "") + ". Seed " + S.runSeed + ".");
    } else {
      S.resultText = "No path found"; S.resultState = "fail";
      if (spec === "prm") {
        var why = a.failReason === "start" ? "The start has no safe connection to any sample; it may be too close to an obstacle." :
          a.failReason === "goal" ? "The goal has no safe connection to any sample; it may be too close to an obstacle." :
          "The roadmap is split into pieces that do not link start and goal.";
        S.note = why + " Try more samples, a larger connection radius, or clear some obstacles.";
        status("No path found in the roadmap. " + why);
      } else {
        S.note = "No path within " + a.maxIter + " iterations. The goal may be walled off, or the gaps may be too narrow for this step size. Try more iterations, a smaller step, a different seed, or open a gap.";
        status("No path found after " + a.iter + " iterations. Try more iterations, a smaller step, or open a gap in the walls.");
      }
    }
    syncRunButton(); updateStats(); kick();
  }

  function advance(n, budgetMs) {
    var a = S.alg, t0 = performance.now(), i = 0;
    while (!a.done && (budgetMs ? performance.now() - t0 < budgetMs : i < n)) { a.step(); i++; }
    S.ms += performance.now() - t0;
    phaseStatus();
    if (a.done) finish();
    return i;
  }

  function tick(ts) {
    raf = 0;
    var again = false;
    if (S.running && S.alg && !S.alg.done) {
      var rate = SPEEDS[S.speed - 1], dt = lastTs ? Math.min(ts - lastTs, 50) : 16;
      if (rate === Infinity) advance(0, 12);
      else { acc += rate * dt / 1000; var n = Math.floor(acc); acc -= n; if (n > 0) advance(n); }
      again = S.running;
      updateStats();
    }
    if (S.pathAnim) {
      S.pathAnim.t = Math.min(1, S.pathAnim.t + (lastTs ? Math.min(ts - lastTs, 50) : 16) / 900);
      if (S.pathAnim.t >= 1) S.pathAnim = null; else again = true;
    }
    lastTs = again ? ts : 0;
    draw();
    if (again) raf = requestAnimationFrame(tick);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  /* ----- controls ----- */
  function run() {
    if (S.running) { S.running = false; lastTs = 0; syncRunButton(); status("Paused. Press Resume, Step, or Reset."); kick(); return; }
    if (!S.alg || S.alg.done) { lastPhase = ""; if (!createAlg()) return; }
    S.running = true; lastTs = 0; syncRunButton(); phaseStatus(); updateStats(); kick();
  }
  function stepOnce() {
    if (S.running) { S.running = false; syncRunButton(); }
    if (S.alg && S.alg.done) return;
    if (!S.alg) { lastPhase = ""; if (!createAlg()) return; }
    for (var k = 0; k < 400 && !S.alg.done; k++) { var before = S.alg.iter; S.alg.step(); if (S.alg.kind === "prm" ? true : S.alg.added) break; }
    if (S.alg.done) finish(); else { phaseStatus(); status("Stepped. Iteration " + S.alg.iter + "."); syncRunButton(); updateStats(); kick(); }
  }

  function buildParams() {
    var spec = ALGOS[S.algo], box = $("params"), v = S.values[S.algo];
    box.textContent = "";
    spec.params.forEach(function (p) {
      var wrap = document.createElement("div"); wrap.className = "pl-param";
      var id = "p-" + p.id, hid = id + "-hint";
      var label = document.createElement("label"); label.setAttribute("for", id); label.textContent = p.label;
      var out = document.createElement("output"); out.setAttribute("for", id); out.id = id + "-out";
      var fmt = p.fmt || function (x) { return String(x); };
      out.textContent = fmt(v[p.id]);
      var input = document.createElement("input"); input.type = "range"; input.id = id;
      input.min = p.min; input.max = p.max; input.step = p.step; input.value = v[p.id]; input.setAttribute("aria-describedby", hid);
      input.addEventListener("input", function () {
        v[p.id] = parseFloat(input.value); out.textContent = fmt(v[p.id]);
        resetSearch("Settings changed. Press Run to start again.");
      });
      var hint = document.createElement("p"); hint.className = "pl-hint"; hint.id = hid; hint.textContent = p.hint;
      var head = document.createElement("div"); head.className = "pl-param-head"; head.appendChild(label); head.appendChild(out);
      wrap.appendChild(head); wrap.appendChild(input); wrap.appendChild(hint); box.appendChild(wrap);
    });
    if (spec.select) {
      var wrap2 = document.createElement("div"); wrap2.className = "pl-param";
      var l2 = document.createElement("label"); l2.setAttribute("for", "p-" + spec.select.id); l2.textContent = spec.select.label;
      var sel = document.createElement("select"); sel.id = "p-" + spec.select.id;
      spec.select.options.forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op); });
      sel.value = v[spec.select.id];
      sel.addEventListener("change", function () { v[spec.select.id] = sel.value; resetSearch("Settings changed. Press Run to start again."); });
      wrap2.appendChild(l2); wrap2.appendChild(sel); box.appendChild(wrap2);
    }
  }

  function swatch(kind) { return '<span class="sw sw-' + kind + '" aria-hidden="true"></span>'; }
  function buildExplain() {
    var spec = ALGOS[S.algo], ex = spec.explain, h = "";
    h += "<h2 id=\"explain-title\">" + spec.full + "</h2><p>" + ex.summary + "</p><h3>In simple steps</h3><ol>";
    ex.steps.forEach(function (s) { h += "<li>" + s + "</li>"; });
    h += "</ol><h3>What to watch for</h3><p>" + ex.notice + "</p><h3>Good to know</h3><p>" + ex.limits + "</p>";
    h += "<details class=\"how-it-works\"><summary>How it works (technical details)</summary><div class=\"how-body\">" + ex.tech + "<p>Reference code: <a href=\"https://github.com/DingshuaiYang1999/python-robotics-learning/tree/main/04_robotics/path_planning\" target=\"_blank\" rel=\"noopener\">Python implementations on GitHub<span class=\"visually-hidden\"> (opens in a new tab)</span></a>.</p></div></details>";
    $("explain").innerHTML = h;
    var lg = "";
    spec.legend.forEach(function (l) { lg += "<li>" + swatch(l[0]) + l[1] + "</li>"; });
    lg = "<li>" + swatch("start") + "Start (S)</li><li>" + swatch("goal") + "Goal (G)</li><li>" + swatch("obstacle") + "Obstacle</li>" + lg;
    $("legend").innerHTML = lg;
  }

  function setAlgo(k, fromUrl) {
    if (!ALGOS[k]) return;
    S.algo = k;
    ORDER.forEach(function (o) { $("algo-" + o).checked = o === k; });
    buildParams(); buildExplain();
    document.title = ALGOS[k].name.replace(" (extra)", "") + " path-planning visualizer · Dingshuai Yang";
    if (!fromUrl) {
      try { var u = new URL(location.href); u.searchParams.set("algo", k); history.replaceState(null, "", u); } catch (e) {}
    }
    resetSearch("Selected " + ALGOS[k].full + ". Press Run to start the search.");
  }

  function setTool(t) {
    S.tool = t;
    document.querySelectorAll("[data-tool]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-tool") === t ? "true" : "false"); });
    $("brush-wrap").hidden = !(t === "brush" || t === "erase");
    var hints = { start: "Click or drag on the map to place the start (S).", goal: "Click or drag on the map to place the goal (G).",
      rect: "Drag on the map to draw a rectangular obstacle.", brush: "Paint obstacles by dragging on the map.", erase: "Drag over obstacles to erase them." };
    $("tool-hint").textContent = hints[t] + " You can always drag S and G directly.";
    canvas.style.cursor = t === "brush" || t === "erase" ? "crosshair" : t === "rect" ? "crosshair" : "pointer";
  }

  function mapChanged(msg) { resetSearch(msg || "Map changed. Press Run to search again."); }

  function protectEnds() {
    S.world.fillCircle(S.start.x, S.start.y, 14, 0); S.world.fillCircle(S.goal.x, S.goal.y, 14, 0);
  }

  /* ----- pointer interaction ----- */
  function toWorld(ev) {
    var r = canvas.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height };
  }
  function clampPoint(p) { return { x: Math.min(W - MARGIN, Math.max(MARGIN, p.x)), y: Math.min(H - MARGIN, Math.max(MARGIN, p.y)) }; }
  function placeEnd(which, p) {
    p = clampPoint(p);
    var other = which === "start" ? S.goal : S.start;
    if (S.world.isSolid(p.x, p.y) || dist(p, other) < 26) return false;
    S[which] = p; mapChanged(); return true;
  }
  function stamp(p, q, val) {
    var d = dist(p, q), n = Math.max(1, Math.ceil(d / Math.max(2, S.brush / 3)));
    for (var i = 0; i <= n; i++) S.world.fillCircle(p.x + (q.x - p.x) * i / n, p.y + (q.y - p.y) * i / n, S.brush, val);
    protectEnds();
  }

  canvas.addEventListener("pointerdown", function (ev) {
    if (ev.button !== undefined && ev.button !== 0 && ev.pointerType === "mouse") return;
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    var p = toWorld(ev), hit = px(24);
    if (dist(p, S.start) <= hit && dist(p, S.start) <= dist(p, S.goal)) S.drag = { kind: "end", which: "start" };
    else if (dist(p, S.goal) <= hit) S.drag = { kind: "end", which: "goal" };
    else if (S.tool === "start" || S.tool === "goal") { S.drag = { kind: "end", which: S.tool }; placeEnd(S.tool, p); }
    else if (S.tool === "rect") S.drag = { kind: "rect", rect: { x0: p.x, y0: p.y, x1: p.x, y1: p.y } };
    else { S.drag = { kind: "paint", last: p, cursor: p }; if (S.alg) mapChanged(); stamp(p, p, S.tool === "erase" ? 0 : 1); }
    if (S.drag.kind === "end" && S.drag.which && dist(p, S[S.drag.which]) <= hit) { /* grabbed a marker */ }
    kick();
  });
  canvas.addEventListener("pointermove", function (ev) {
    if (!S.drag) return;
    var p = toWorld(ev), d = S.drag;
    if (d.kind === "end") placeEnd(d.which, p);
    else if (d.kind === "rect") { d.rect.x1 = p.x; d.rect.y1 = p.y; }
    else if (d.kind === "paint") { if (S.alg) mapChanged(); stamp(d.last, p, S.tool === "erase" ? 0 : 1); d.last = p; d.cursor = p; }
    kick();
  });
  function endDrag(ev) {
    var d = S.drag; if (!d) return;
    if (d.kind === "rect") {
      var r = d.rect;
      if (Math.abs(r.x1 - r.x0) > 3 && Math.abs(r.y1 - r.y0) > 3) { S.world.fillRect(r.x0, r.y0, r.x1, r.y1, 1); protectEnds(); mapChanged(); }
    }
    S.drag = null; kick();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  /* keyboard: arrow keys move a crosshair; S / G place the ends; Space paints; E erases */
  canvas.addEventListener("keydown", function (ev) {
    var k = S.kbd, stepPx = ev.shiftKey ? 40 : 10, used = true;
    if (!k.on) k.on = true;
    switch (ev.key) {
      case "ArrowLeft": k.x -= stepPx; break; case "ArrowRight": k.x += stepPx; break;
      case "ArrowUp": k.y -= stepPx; break; case "ArrowDown": k.y += stepPx; break;
      case "s": case "S": if (!placeEnd("start", k)) status("Cannot place the start there."); else status("Start moved."); break;
      case "g": case "G": if (!placeEnd("goal", k)) status("Cannot place the goal there."); else status("Goal moved."); break;
      case " ": case "Enter": S.world.fillCircle(k.x, k.y, S.brush, 1); protectEnds(); mapChanged("Obstacle added."); break;
      case "e": case "E": case "Delete": case "Backspace": S.world.fillCircle(k.x, k.y, S.brush, 0); mapChanged("Obstacle erased."); break;
      default: used = false;
    }
    k.x = Math.min(W - 1, Math.max(0, k.x)); k.y = Math.min(H - 1, Math.max(0, k.y));
    if (used) { ev.preventDefault(); kick(); }
  });
  canvas.addEventListener("focus", function () { if (canvas.matches(":focus-visible")) { S.kbd.on = true; kick(); } });
  canvas.addEventListener("blur", function () { S.kbd.on = false; kick(); });

  /* ----- wiring ----- */
  function init() {
    ORDER.forEach(function (k) {
      $("algo-" + k).addEventListener("change", function () { if (this.checked) setAlgo(k); });
    });
    document.querySelectorAll("[data-tool]").forEach(function (b) { b.addEventListener("click", function () { setTool(b.getAttribute("data-tool")); }); });
    $("btn-run").addEventListener("click", run);
    $("btn-step").addEventListener("click", stepOnce);
    $("btn-reset").addEventListener("click", function () { resetSearch("Reset. The map is kept; press Run to search again."); });
    var speed = $("speed");
    function setSpeed() { S.speed = parseInt(speed.value, 10); speed.setAttribute("aria-valuetext", SPEED_NAMES[S.speed - 1]); $("speed-out").textContent = SPEED_NAMES[S.speed - 1]; }
    speed.addEventListener("input", setSpeed); setSpeed();
    var br = $("brush");
    br.addEventListener("input", function () { S.brush = parseInt(br.value, 10); $("brush-out").textContent = S.brush; kick(); });
    var preset = $("preset");
    Object.keys(PRESETS).forEach(function (k) { var o = document.createElement("option"); o.value = k; o.textContent = PRESETS[k].label; preset.appendChild(o); });
    preset.addEventListener("change", function () { loadPreset(S.world, preset.value); protectEnds(); mapChanged("Loaded map: " + PRESETS[preset.value].label + "."); });
    $("btn-random").addEventListener("click", function () {
      var base = $("seed-fixed").checked ? (parseInt($("seed").value, 10) || 27) : Math.floor(Math.random() * 1e6);
      S.randomCount++;
      var ok = randomObstacles(S.world, mulberry32(base * 7919 + S.randomCount), S.start, S.goal);
      protectEnds(); mapChanged(ok ? "Random obstacles added. Press Run." : "Could not place random obstacles that leave a route; try again.");
    });
    $("btn-clear").addEventListener("click", function () { S.world.clear(); mapChanged("All obstacles cleared."); });
    $("btn-swap").addEventListener("click", function () { var t = S.start; S.start = S.goal; S.goal = t; mapChanged("Start and goal swapped."); });
    $("smooth").addEventListener("change", function () {
      if (S.alg && S.alg.done) { computeSmooth(); S.pathAnim = null; updateStats(); status($("smooth").checked ? (S.smoothPath ? "Smoothed: removed unnecessary detours." : "Nothing to smooth: the path is already straight where it can be.") : "Showing the raw path."); kick(); }
    });
    $("seed-fixed").addEventListener("change", function () { $("seed").disabled = !this.checked; });
    $("seed").addEventListener("change", function () { resetSearch("Seed changed. Press Run to start again."); });
    window.addEventListener("resize", resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    new MutationObserver(function () { kick(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    if (window.matchMedia) { var mq = matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", function () { kick(); }); }

    var q = new URLSearchParams(location.search), a = ALIASES[(q.get("algo") || "").toLowerCase()] || "rrt";
    if (q.get("seed") && isFinite(parseInt(q.get("seed"), 10))) { $("seed").value = parseInt(q.get("seed"), 10); }
    setTool("rect"); setAlgo(a, true); resize();
    root.__planner = { state: S, setAlgo: setAlgo, run: run };
  }
  init();
})(typeof window !== "undefined" ? window : globalThis);
