// The calculator: an expression language with variables and one-argument functions, a history the user can walk
// back through, and a plotter. A line is parsed once into a tree (a Pratt parser) and compiled into closures, so
// the plotter can evaluate the same expression for three hundred values of x without parsing again. A plot is
// sampled a slice of columns at a time, sized so that no turn runs long on the device even with Wi-Fi up. Sampling
// and saving run as detached promise chains (sleep, then work), never as a handler's returned promise: that would
// hold the turn open and keep keys from arriving.
const CALC_HIST = 100, CALC_FUNCS = 16, CALC_DEPTH = 32, CALC_GRAPHS = 3;
const PLOT_W = 306, PLOT_H = 230, PLOT_COLORS = ["accent", "blue", "ok"];
const PLOT_VIEW = { x0: -10, x1: 10, y0: -7.5, y1: 7.5 };

// ---- tokens --------------------------------------------------------------------------------------------------
const CALC_TOKEN = /\s*(?:(0x[0-9a-fA-F]+|0b[01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\S))/y;

function calcTokens(line) {
  if (line.length > 256) throw new Error("a line holds at most 256 characters");
  const out = [];
  CALC_TOKEN.lastIndex = 0;
  let m;
  while ((m = CALC_TOKEN.exec(line))) {
    const text = m[1] || m[2] || m[3], at = m.index + m[0].length - text.length;
    if (m[1]) {
      const v = /^0x/.test(text) ? parseInt(text.slice(2), 16) : /^0b/.test(text) ? parseInt(text.slice(2), 2) : Number(text);
      out.push({ t: "num", v, at });
    } else if (m[2]) out.push({ t: "name", v: text, at });
    else if ("+-*/%^!(),=".includes(text)) out.push({ t: "op", v: text, at });
    else throw new Error("unexpected " + text);
    if (out.length > 128) throw new Error("a line holds at most 128 tokens");
  }
  return out;
}

// ---- names ---------------------------------------------------------------------------------------------------
const CALC_CONST = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };
const calcRad = (c, v) => (c.s.deg ? v * Math.PI / 180 : v), calcDeg = (c, v) => (c.s.deg ? v * 180 / Math.PI : v);
const calcInt = (v) => Number.isInteger(v);
function calcFact(n) {
  if (!calcInt(n) || n < 0) return NaN;
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
function calcGcd(a, b) {
  if (!calcInt(a) || !calcInt(b)) return NaN;
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
// name: [arity (-1: one or more), (ctx) => implementation]
const CALC_FN = {
  sqrt: [1, () => Math.sqrt], cbrt: [1, () => Math.cbrt], abs: [1, () => Math.abs], sign: [1, () => Math.sign],
  floor: [1, () => Math.floor], ceil: [1, () => Math.ceil], round: [1, () => Math.round], trunc: [1, () => Math.trunc],
  sin: [1, (c) => (v) => Math.sin(calcRad(c, v))], cos: [1, (c) => (v) => Math.cos(calcRad(c, v))],
  tan: [1, (c) => (v) => Math.tan(calcRad(c, v))],
  asin: [1, (c) => (v) => calcDeg(c, Math.asin(v))], acos: [1, (c) => (v) => calcDeg(c, Math.acos(v))],
  atan: [1, (c) => (v) => calcDeg(c, Math.atan(v))], atan2: [2, (c) => (y, x) => calcDeg(c, Math.atan2(y, x))],
  sinh: [1, () => Math.sinh], cosh: [1, () => Math.cosh], tanh: [1, () => Math.tanh],
  ln: [1, () => Math.log], log: [1, () => Math.log10], log2: [1, () => Math.log2], exp: [1, () => Math.exp],
  fact: [1, () => calcFact], deg: [1, () => (v) => v * 180 / Math.PI], rad: [1, () => (v) => v * Math.PI / 180],
  pow: [2, () => Math.pow], mod: [2, () => (a, b) => a - b * Math.floor(a / b)],
  nCr: [2, () => (n, k) => (calcInt(n) && calcInt(k) && k >= 0 && k <= n ? Math.round(calcFact(n) / calcFact(k) / calcFact(n - k)) : NaN)],
  nPr: [2, () => (n, k) => (calcInt(n) && calcInt(k) && k >= 0 && k <= n ? Math.round(calcFact(n) / calcFact(n - k)) : NaN)],
  gcd: [2, () => calcGcd], lcm: [2, () => (a, b) => (a && b ? Math.abs(a * b) / calcGcd(a, b) : 0)],
  min: [-1, () => Math.min], max: [-1, () => Math.max], hypot: [-1, () => Math.hypot],
};
const calcBuiltin = (n) => Object.prototype.hasOwnProperty.call(CALC_FN, n) || Object.prototype.hasOwnProperty.call(CALC_CONST, n) || n === "ans";
const calcIsFunc = (s, n) => Object.prototype.hasOwnProperty.call(CALC_FN, n) || Object.prototype.hasOwnProperty.call(s.funcs, n);

// ---- parsing: a statement into a tree ------------------------------------------------------------------------
// statement := name "=" expr | name "(" name ")" "=" expr | expr. See the guide, section 3.2, for the grammar.
function calcParse(line, isFunc) {
  const toks = calcTokens(line);
  if (!toks.length) throw new Error("nothing to calculate");
  let i = 0, depth = 0, kind = "expr", name = null, param = null, body = line;
  const peek = () => toks[i], next = () => toks[i++];
  const isOp = (t, v) => !!t && t.t === "op" && t.v === v;
  if (toks[0].t === "name" && isOp(toks[1], "=")) { kind = "var"; name = toks[0].v; i = 2; }
  else if (toks[0].t === "name" && isOp(toks[1], "(") && toks[2] && toks[2].t === "name" && isOp(toks[3], ")") && isOp(toks[4], "=")) {
    kind = "func"; name = toks[0].v; param = toks[2].v; i = 5;
  }
  if (kind !== "expr") {
    if (i >= toks.length) throw new Error("nothing after =");
    body = line.slice(toks[i].at).trim();
  }
  const isCall = (n) => n !== param && isFunc(n);

  function expr(min) {
    if (++depth > 40) throw new Error("too deeply nested");
    let left = unary();
    for (;;) {
      const t = peek();
      let op = null, p = 0, explicit = true;
      if (isOp(t, "+") || isOp(t, "-")) { op = t.v; p = 1; }
      else if (isOp(t, "*") || isOp(t, "/") || isOp(t, "%")) { op = t.v; p = 2; }
      else if (t && (t.t === "name" || isOp(t, "("))) { op = "*"; p = 2; explicit = false; }   // 2x, 3(x+1), (a)(b)
      if (!op || p < min) break;
      if (explicit) next();
      left = { op, a: left, b: expr(p + 1) };
    }
    depth--;
    return left;
  }
  function unary() {
    const t = peek();
    if (isOp(t, "-") || isOp(t, "+")) { next(); const a = unary(); return t.v === "-" ? { op: "neg", a } : a; }
    return power();
  }
  function power() {
    const base = postfix();
    if (isOp(peek(), "^")) { next(); return { op: "^", a: base, b: unary() }; }
    return base;
  }
  function postfix() {
    let a = primary();
    while (isOp(peek(), "!")) { next(); a = { op: "!", a }; }
    return a;
  }
  function primary() {
    const t = next();
    if (!t) throw new Error("the line ends too soon");
    if (t.t === "num") return { num: t.v };
    if (t.t === "name") {
      if (isOp(peek(), "(") && isCall(t.v)) {
        next();
        const args = [];
        if (!isOp(peek(), ")")) {
          args.push(expr(1));
          while (isOp(peek(), ",")) { next(); args.push(expr(1)); }
        }
        if (!isOp(next(), ")")) throw new Error("missing )");
        return { call: t.v, args };
      }
      if (Object.prototype.hasOwnProperty.call(CALC_FN, t.v)) throw new Error(t.v + " needs parentheses: " + t.v + "(...)");
      return { name: t.v };
    }
    if (isOp(t, "(")) {
      const a = expr(1);
      if (!isOp(next(), ")")) throw new Error("missing )");
      return a;
    }
    throw new Error(t.v === ")" ? "unexpected )" : t.v + " needs a number before it");
  }
  const tree = expr(1);
  if (i < toks.length) throw new Error("unexpected " + toks[i].v);
  return { kind, name, param, body, tree };
}

// ---- compiling a tree into closures ----------------------------------------------------------------------------
// ctx = { s, param }: s holds vars, funcs, ans and the angle mode, read when the function runs, so a compiled
// function follows later assignments. The result carries its node count in .size.
let calcDepth = 0;
const calcCache = new Map();   // "param|source" -> compiled user function bodies

function calcCompile(tree, ctx) {
  let size = 0;
  function c(n) {
    size++;
    if ("num" in n) { const v = n.num; return () => v; }
    if (n.name !== undefined) {
      const nm = n.name;
      if (nm === ctx.param) return (x) => x;
      if (Object.prototype.hasOwnProperty.call(CALC_CONST, nm)) { const v = CALC_CONST[nm]; return () => v; }
      if (nm === "ans") return () => ctx.s.ans;
      if (!Object.prototype.hasOwnProperty.call(ctx.s.vars, nm)) throw new Error("unknown name " + nm);
      return () => {
        const v = ctx.s.vars[nm];
        if (v === undefined) throw new Error("unknown name " + nm);
        return v;
      };
    }
    if (n.call !== undefined) {
      const args = n.args.map(c), nm = n.call;
      if (Object.prototype.hasOwnProperty.call(CALC_FN, nm)) {
        const [arity, make] = CALC_FN[nm], f = make(ctx);
        if (arity > 0 && args.length !== arity) throw new Error(nm + " takes " + arity + (arity === 1 ? " argument" : " arguments"));
        if (arity < 0 && !args.length) throw new Error(nm + " takes at least one argument");
        if (args.length === 1) { const a = args[0]; return (x) => f(a(x)); }
        if (args.length === 2) { const [a, b] = args; return (x) => f(a(x), b(x)); }
        return (x) => f.apply(null, args.map((a) => a(x)));
      }
      if (args.length !== 1) throw new Error(nm + " takes 1 argument");
      const a = args[0];
      return (x) => calcCallUser(ctx.s, nm, a(x));
    }
    const a = c(n.a), b = n.b ? c(n.b) : null;
    switch (n.op) {
      case "+": return (x) => a(x) + b(x);
      case "-": return (x) => a(x) - b(x);
      case "*": return (x) => a(x) * b(x);
      case "/": return (x) => a(x) / b(x);
      case "%": return (x) => a(x) % b(x);
      case "^": return (x) => Math.pow(a(x), b(x));
      case "neg": return (x) => -a(x);
      case "!": return (x) => calcFact(a(x));
    }
    throw new Error("cannot compile " + n.op);
  }
  const f = c(tree);
  f.size = size;
  return f;
}

function calcUserFn(s, name) {
  const def = s.funcs[name];
  if (!def) throw new Error("unknown function " + name);
  const key = def.p + "|" + def.src;
  let f = calcCache.get(key);
  if (!f) {
    f = calcCompile(calcParse(def.src, (n) => calcIsFunc(s, n)).tree, { s, param: def.p });
    calcCache.set(key, f);
  }
  return f;
}
function calcCallUser(s, name, v) {
  if (calcDepth >= CALC_DEPTH) throw new Error("too deep: does " + name + " call itself?");
  calcDepth++;
  try { return calcUserFn(s, name)(v); } finally { calcDepth--; }
}

// ---- numbers as text -----------------------------------------------------------------------------------------
// "1.2300e+5" -> "1.23e5", "0.50000" -> "0.5": toPrecision itself switches to exponent form below 1e-6
function calcTidy(str) {
  const [m, e] = str.split("e"), t = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
  return e === undefined ? t : t + "e" + (e[0] === "+" ? e.slice(1) : e);
}
function calcFormat(v, digits) {
  const d = digits || 12;
  if (Object.is(v, -0)) return "0";
  if (Number.isNaN(v)) return "not a number";
  if (!Number.isFinite(v)) return v > 0 ? "infinite" : "-infinite";
  const a = Math.abs(v);
  if (calcInt(v) && a < 1e15 && (!digits || a < Math.pow(10, d))) return String(v);
  if (a >= 1e15 || a < 1e-9) return calcTidy(v.toExponential(d - 1));
  return calcTidy(v.toPrecision(d));
}

// ---- running a line ------------------------------------------------------------------------------------------
function calcValue(v) {
  if (Number.isNaN(v)) throw new Error("not a real number");
  if (!Number.isFinite(v)) throw new Error("infinite");
  return v;
}
// Evaluates or defines; returns what the history shows on the right. Throws with a message for the user.
function calcRun(s, line) {
  const st = calcParse(line, (n) => calcIsFunc(s, n));
  calcDepth = 0;
  if (st.kind === "func") {
    if (calcBuiltin(st.name)) throw new Error(st.name + " is built in");
    if (Object.prototype.hasOwnProperty.call(s.vars, st.name)) throw new Error(st.name + " is a variable");
    if (calcBuiltin(st.param)) throw new Error(st.param + " is built in");
    if (!s.funcs[st.name] && Object.keys(s.funcs).length >= CALC_FUNCS) throw new Error("at most " + CALC_FUNCS + " functions");
    calcCompile(st.tree, { s, param: st.param });   // unknown names fail here, not when plotted
    s.funcs[st.name] = { p: st.param, src: st.body };
    return st.name + "(" + st.param + ") defined";
  }
  const v = calcValue(calcCompile(st.tree, { s, param: null })());
  if (st.kind === "var") {
    if (calcBuiltin(st.name)) throw new Error(st.name + " is built in");
    if (Object.prototype.hasOwnProperty.call(s.funcs, st.name)) throw new Error(st.name + " is a function");
    s.vars[st.name] = v;
    s.ans = v;
    return st.name + " = " + calcFormat(v);
  }
  s.ans = v;
  return "= " + calcFormat(v);
}

// ---- the plotter ---------------------------------------------------------------------------------------------
let plotFns = [];   // compiled curves, parallel to s.plot.curves (functions do not belong in the state)

const plotX = (v, c) => v.x0 + c * (v.x1 - v.x0) / (PLOT_W - 1);
const plotPy = (v, y) => (v.y1 - y) * (PLOT_H - 1) / (v.y1 - v.y0);
const plotPx = (v, x) => (x - v.x0) * (PLOT_W - 1) / (v.x1 - v.x0);

function plotCompile(s, src) {
  const st = calcParse(src, (n) => calcIsFunc(s, n));
  if (st.kind !== "expr") throw new Error("plot an expression in x, like sin(x)");
  return calcCompile(st.tree, { s, param: "x" });
}
// Start (or restart) sampling for the current view and curves.
function plotReset(s) {
  plotFns = [];
  const curves = s.graph.map((src) => {
    try { plotFns.push(plotCompile(s, src)); return { src, ys: [], err: "" }; }
    catch (e) { plotFns.push(null); return { src, ys: [], err: e.message }; }
  });
  const size = plotFns.reduce((n, f) => n + (f ? f.size : 0), 0) || 1;
  const max = Math.max(8, Math.min(PLOT_W, Math.floor(3000 / size)));
  s.plot = { curves, col: 0, max, slice: Math.min(max, 32), grid: plotGrid(s.view), ops: [], ms: 0 };
  if (s.trace && s.trace.k >= curves.length) s.trace.k = 0;
}
function plotSample(s) {
  const p = s.plot;
  if (!p || p.col >= PLOT_W) return;
  const t0 = now(), end = Math.min(PLOT_W, p.col + p.slice), v = s.view;
  for (let c = p.col; c < end; c++) {
    const x = plotX(v, c);
    for (let k = 0; k < p.curves.length; k++) {
      const f = plotFns[k];
      if (!f) continue;
      let y = null;
      try { calcDepth = 0; y = f(x); } catch (e) { if (!p.curves[k].err) p.curves[k].err = e.message; }
      p.curves[k].ys[c] = typeof y === "number" && Number.isFinite(y) ? y : null;
    }
  }
  p.col = end;
  // on the device now() is wall-clock time and the slice follows the real speed; on the host it does not move
  const ms = now() - t0;
  p.ms = ms;
  if (ms > 20) p.slice = Math.max(8, Math.floor(p.slice / 2));
  else if (ms < 6) p.slice = Math.min(p.max, Math.ceil(p.slice * 1.5));
  plotBuild(s);
}

// The part of the segment between adjacent columns (xa, ya) -> (xb, yb) inside 0 <= y <= H-1, or null.
function plotClip(xa, ya, xb, yb) {
  const lo = 0, hi = PLOT_H - 1;
  if ((ya < lo && yb < lo) || (ya > hi && yb > hi)) return null;
  const X = (y) => xa + (xb - xa) * (y - ya) / (yb - ya);   // only used when the segment crosses y
  let x0 = xa, y0 = ya, x1 = xb, y1 = yb;
  if (ya < lo) { x0 = X(lo); y0 = lo; } else if (ya > hi) { x0 = X(hi); y0 = hi; }
  if (yb < lo) { x1 = X(lo); y1 = lo; } else if (yb > hi) { x1 = X(hi); y1 = hi; }
  return [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
}
// Polylines for one curve's samples: broken at missing values and where the curve jumps across the whole view.
function plotPolys(v, ys, upto) {
  const polys = [];
  let run = null;
  for (let c = 1; c < upto; c++) {
    const a = ys[c - 1], b = ys[c];
    let seg = null;
    if (a != null && b != null && !((a > v.y1 && b < v.y0) || (a < v.y0 && b > v.y1)))
      seg = plotClip(c - 1, plotPy(v, a), c, plotPy(v, b));
    if (!seg) { run = null; continue; }
    if (run && run[run.length - 2] === seg[0] && run[run.length - 1] === seg[1]) run.push(seg[2], seg[3]);
    else { run = seg.slice(); polys.push(run); }
  }
  return polys;
}
function plotStep(span) {
  const raw = span / 5, p10 = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p10;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p10;
}
function plotGrid(v) {
  const ops = [], sx = plotStep(v.x1 - v.x0), sy = plotStep(v.y1 - v.y0);
  const ax = Math.round(plotPx(v, 0)), ay = Math.round(plotPy(v, 0));
  const lx = Math.min(PLOT_H - 14, Math.max(2, ay + 3)), ly = Math.min(PLOT_W - 40, Math.max(2, ax + 3));
  const label = (n) => calcFormat(Math.abs(n) < 1e-12 ? 0 : n, 4);
  for (let x = Math.ceil(v.x0 / sx) * sx, i = 0; x <= v.x1 && i < 40; x += sx, i++) {
    const px = Math.round(plotPx(v, x));
    ops.push(["line", px, 0, px, PLOT_H - 1, "soft"]);
    const t = label(x);   // a label that would run past the canvas is left out
    if (Math.abs(x) > sx / 2 && px >= 2 && px + 2 + 6 * t.length <= PLOT_W - 2) ops.push(["text", px + 2, lx, t, "s", "muted"]);
  }
  for (let y = Math.ceil(v.y0 / sy) * sy, i = 0; y <= v.y1 && i < 40; y += sy, i++) {
    const py = Math.round(plotPy(v, y));
    ops.push(["line", 0, py, PLOT_W - 1, py, "soft"]);
    if (Math.abs(y) > sy / 2 && py >= 13) ops.push(["text", ly, py - 12, label(y), "s", "muted"]);
  }
  if (ax >= 0 && ax < PLOT_W) ops.push(["line", ax, 0, ax, PLOT_H - 1, "muted"]);
  if (ay >= 0 && ay < PLOT_H) ops.push(["line", 0, ay, PLOT_W - 1, ay, "muted"]);
  return ops;
}
function plotBuild(s) {
  const p = s.plot, v = s.view, ops = p.grid.slice();
  const legend = p.curves.map((cv, k) => (k + 1) + " " + cv.src + (cv.err ? "  (" + cv.err + ")" : ""));
  p.curves.forEach((cv, k) => { for (const poly of plotPolys(v, cv.ys, p.col)) ops.push(["poly", poly, PLOT_COLORS[k]]); });
  if (legend.length) ops.push(["fill", 1, 1, Math.min(PLOT_W - 2, 8 + 6 * Math.max(...legend.map((l) => l.length))), 4 + 13 * legend.length, "#ffffff"]);
  legend.forEach((l, k) => ops.push(["text", 4, 3 + 13 * k, l, "s", PLOT_COLORS[k], PLOT_W - 8]));
  p.ops = ops;
}
function plotTraceOps(s) {
  const t = s.trace, p = s.plot;
  if (!t || !p || !p.curves[t.k]) return [];
  const y = p.curves[t.k].ys[t.c], ops = [["line", t.c, 0, t.c, PLOT_H - 1, "faint"]];
  if (y != null) {
    const py = Math.round(plotPy(s.view, y));
    if (py >= 0 && py < PLOT_H) ops.push(["rect", t.c - 3, py - 3, 7, 7, "ink"]);
  }
  return ops;
}
function plotStatus(s) {
  const t = s.trace, p = s.plot;
  if (s.note) return s.note;
  if (t && p && p.curves[t.k]) {
    const y = p.curves[t.k].ys[t.c];
    return (t.k + 1) + ": x = " + calcFormat(plotX(s.view, t.c), 6) + "   y = " + (y == null ? "none" : calcFormat(y, 8));
  }
  const v = s.view;
  return "x " + calcFormat(v.x0, 4) + " .. " + calcFormat(v.x1, 4) + "   y " + calcFormat(v.y0, 4) + " .. " + calcFormat(v.y1, 4) + (s.deg ? "   DEG" : "");
}
function plotFit(s) {
  const p = s.plot, k = s.trace ? s.trace.k : 0, ys = p && p.curves[k] ? p.curves[k].ys.filter((y) => y != null) : [];
  if (!ys.length) { s.note = "Nothing to fit yet."; return; }
  let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.05;
  s.view = { x0: s.view.x0, x1: s.view.x1, y0: lo - pad, y1: hi + pad };
}
function plotZoom(s, f) {
  const v = s.view, cx = s.trace ? plotX(v, s.trace.c) : (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
  s.view = { x0: cx - (cx - v.x0) * f, x1: cx + (v.x1 - cx) * f, y0: cy - (cy - v.y0) * f, y1: cy + (v.y1 - cy) * f };
}
function plotKey(s, k, once) {
  const v = s.view, w = v.x1 - v.x0, h = v.y1 - v.y0, t = s.trace;
  s.note = "";
  if (k.key === "esc") { if (!once) return false; if (t) s.trace = null; else s.mode = "calc"; return false; }
  if (k.key === "enter") { if (once) s.trace = t ? null : { c: PLOT_W >> 1, k: 0 }; return false; }
  if (t) {
    const n = s.plot ? s.plot.curves.length : 0;
    if (k.key === "left" || k.key === "right") { t.c = Math.max(0, Math.min(PLOT_W - 1, t.c + (k.key === "left" ? -1 : 1))); return false; }
    if (k.key === "pgup" || k.key === "pgdn") { t.c = Math.max(0, Math.min(PLOT_W - 1, t.c + (k.key === "pgup" ? -10 : 10))); return false; }
    if ((k.key === "up" || k.key === "down") && n) { t.k = (t.k + (k.key === "up" ? n - 1 : 1)) % n; return false; }
  } else if (k.key === "left" || k.key === "right") { const d = (k.key === "left" ? -w : w) / 4; s.view = { x0: v.x0 + d, x1: v.x1 + d, y0: v.y0, y1: v.y1 }; return true; }
  else if (k.key === "up" || k.key === "down") { const d = (k.key === "down" ? -h : h) / 4; s.view = { x0: v.x0, x1: v.x1, y0: v.y0 + d, y1: v.y1 + d }; return true; }
  if (!once) return false;
  if (k.ch === "+" || k.ch === "=") { plotZoom(s, 0.5); return true; }
  if (k.ch === "-") { plotZoom(s, 2); return true; }
  if (k.ch === "0") { s.view = Object.assign({}, PLOT_VIEW); return true; }
  if (k.ch === "a") { plotFit(s); return true; }
  if (k.key === "del" || k.key === "backspace") {
    const i = t ? t.k : 0;
    if (!s.graph.length) return false;
    s.note = "Removed " + s.graph[i];
    s.graph.splice(i, 1);
    if (t) t.k = 0;
    if (!s.graph.length) { s.trace = null; s.mode = "calc"; }
    return true;
  }
  return false;
}
// Samples slice by slice until the plot is complete or leaves the screen; at most one chain runs at a time.
async function plotRun(s) {
  if (s.plotting) return;
  s.plotting = true;
  try {
    while (s.mode === "plot" && s.focused && s.plot && s.plot.col < PLOT_W) {
      await sleep(30);
      if (s.mode === "plot" && s.focused && s.plot) plotSample(s);
    }
  } finally { s.plotting = false; }
}
function plotOpen(s, src) {
  if (src) {
    if (Object.prototype.hasOwnProperty.call(s.funcs, src)) src = src + "(x)";   // "f" plots f(x)
    try { plotCompile(s, src); } catch (e) { s.note = e.message; return; }
    s.graph = [src].concat(s.graph.filter((g) => g !== src)).slice(0, CALC_GRAPHS);
    s.line = ""; s.cur = 0;
  }
  if (!s.graph.length) { s.note = "Type a function of x, like sin(x), then F2."; return; }
  s.mode = "plot"; s.note = "";
  plotReset(s); plotSample(s); plotRun(s);
  calcChanged(s);
}

// ---- the app -------------------------------------------------------------------------------------------------
// Saving waits 3 seconds after a change, so a burst of Enters is one write (on the P4 an NVS commit), and
// happens at once when the app leaves the screen.
function calcChanged(s) {
  s.dirty = true;
  if (s.saving) return;
  s.saving = true;
  sleep(3000).then(() => { s.saving = false; calcSave(s); });
}
function calcSave(s) {
  if (!s.dirty) return;
  const rec = { v: 1, hist: s.hist, vars: s.vars, funcs: s.funcs, graph: s.graph, view: s.view, deg: s.deg, ans: s.ans };
  try { store.set("calc", rec); s.dirty = false; }
  catch (e) {
    if (s.hist.length > 10) { s.hist.splice(0, s.hist.length >> 1); return calcSave(s); }
    s.note = "Not saved: " + e.message;
  }
}
function calcLoad(s) {
  let r = null;
  try { r = store.get("calc", null); } catch (_) {}
  if (!r || r.v !== 1) return;
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (Array.isArray(r.hist)) s.hist = r.hist.filter((h) => h && typeof h.e === "string" && typeof h.r === "string").slice(-CALC_HIST);
  if (r.vars && typeof r.vars === "object") for (const [k, v] of Object.entries(r.vars)) if (!calcBuiltin(k) && num(v)) s.vars[k] = v;
  if (r.funcs && typeof r.funcs === "object")
    for (const [k, f] of Object.entries(r.funcs)) if (!calcBuiltin(k) && f && typeof f.p === "string" && typeof f.src === "string") s.funcs[k] = { p: f.p, src: f.src };
  for (const k of Object.keys(s.funcs)) {   // a stored function that no longer compiles is dropped
    try { calcUserFn(s, k); } catch (e) { delete s.funcs[k]; s.note = "Dropped " + k + ": " + e.message; }
  }
  if (Array.isArray(r.graph)) s.graph = r.graph.filter((g) => typeof g === "string").slice(0, CALC_GRAPHS);
  if (r.view && [r.view.x0, r.view.x1, r.view.y0, r.view.y1].every(num) && r.view.x1 > r.view.x0 && r.view.y1 > r.view.y0) s.view = r.view;
  s.deg = r.deg === true;
  if (num(r.ans)) s.ans = r.ans;
}

function calcEnter(s) {
  const line = s.line.trim();
  if (!line) return;
  let entry;
  try { entry = { e: line, r: calcRun(s, line), ok: true, v: s.ans }; }
  catch (e) { entry = { e: line, r: e.message, ok: false }; }
  s.hist.push(entry);
  if (s.hist.length > CALC_HIST) s.hist.splice(0, s.hist.length - CALC_HIST);
  if (entry.ok) { s.line = ""; s.cur = 0; s.note = ""; }
  else s.note = entry.r;   // a failed line stays, to be corrected
  calcChanged(s);
}
function calcInsert(s, text) {
  const cs = Array.from(s.line);
  cs.splice(s.cur, 0, ...Array.from(text));
  s.line = cs.join(""); s.cur += Array.from(text).length;
}
function calcNames(s) {
  return Object.keys(s.vars).sort().map((n) => ({ kind: "var", name: n, label: n, right: calcFormat(s.vars[n]) }))
    .concat(Object.keys(s.funcs).sort().map((n) => ({ kind: "func", name: n, label: n + "(" + s.funcs[n].p + ")", right: s.funcs[n].src })));
}

function calcKey(s, k) {
  if (!k || k.state === "up") return;
  const once = k.state !== "hold";
  if (s.mode === "plot") {
    const changed = plotKey(s, k, once);
    if (changed && s.mode === "plot") { plotReset(s); plotSample(s); plotRun(s); }
    if (changed) calcChanged(s);
    return;
  }
  if (s.mode === "names") {
    const names = calcNames(s);
    if (k.key === "up") s.nsel = Math.max(0, s.nsel - 1);
    else if (k.key === "down") s.nsel = Math.min(Math.max(0, names.length - 1), s.nsel + 1);
    else if ((k.key === "del" || k.key === "backspace") && once && names[s.nsel]) {
      const n = names[s.nsel];
      if (n.kind === "var") delete s.vars[n.name]; else delete s.funcs[n.name];
      s.nsel = Math.min(s.nsel, Math.max(0, names.length - 2));
      calcChanged(s);
    } else if ((k.key === "esc" || k.key === "f3") && once) s.mode = "calc";
    return;
  }
  if (k.key !== "f5") s.clearArmed = false;
  const chars = Array.from(s.line);
  switch (k.key) {
    case "enter":
      if (!once) return;
      if (s.sel >= 0) { s.line = s.hist[s.sel].e; s.cur = Array.from(s.line).length; s.sel = -1; return; }
      return calcEnter(s);
    case "tab":
      if (once && s.sel >= 0 && s.hist[s.sel].ok && typeof s.hist[s.sel].v === "number") { const v = calcFormat(s.hist[s.sel].v); s.sel = -1; calcInsert(s, v); }
      return;
    case "up": if (s.hist.length) s.sel = s.sel < 0 ? s.hist.length - 1 : Math.max(0, s.sel - 1); return;
    case "down": if (s.sel >= 0) { s.sel++; if (s.sel >= s.hist.length) s.sel = -1; } return;
    case "esc": if (!once) return; if (s.sel >= 0) s.sel = -1; else { s.line = ""; s.cur = 0; s.note = ""; } return;
    case "f2": if (once) plotOpen(s, s.line.trim()); return;
    case "f3": if (once) { s.mode = "names"; s.nsel = 0; s.sel = -1; } return;
    case "f4": if (once) { s.deg = !s.deg; s.note = s.deg ? "Degrees" : "Radians"; calcChanged(s); } return;
    case "f5":
      if (!once) return;
      if (!s.clearArmed) { s.clearArmed = true; s.note = "F5 again clears the history (" + s.hist.length + " entries)."; return; }
      s.hist = []; s.sel = -1; s.clearArmed = false; s.note = "History cleared."; calcChanged(s);
      return;
    case "backspace": if (s.cur > 0) { chars.splice(s.cur - 1, 1); s.cur--; s.line = chars.join(""); } return;
    case "del": chars.splice(s.cur, 1); s.line = chars.join(""); return;
    case "left": s.cur = Math.max(0, s.cur - 1); return;
    case "right": s.cur = Math.min(chars.length, s.cur + 1); return;
    case "home": s.cur = 0; return;
    case "end": s.cur = chars.length; return;
  }
  const ch = k.ch || (k.key === "space" ? " " : "");
  if (!ch || chars.length >= 256) return;
  s.sel = -1;
  if (!s.line && "+*/^%".includes(ch) && s.hist.some((h) => h.ok)) calcInsert(s, "ans");   // continue from the last result
  calcInsert(s, ch);
}

function calcStatus(s) {
  if (s.note) return s.note;
  return (s.deg ? "DEG" : "RAD") + " · ans = " + calcFormat(s.ans);
}

app("calc")
  .title("Calc")
  .state({ line: "", cur: 0, sel: -1, hist: [], vars: {}, funcs: {}, ans: 0, deg: false, note: "", mode: "calc", nsel: 0,
           clearArmed: false, graph: [], view: Object.assign({}, PLOT_VIEW), plot: null, trace: null, dirty: false,
           saving: false, plotting: false, focused: false })
  .onStart((s) => { calcLoad(s); })
  .on("key", (s, k, msg) => { if (msg.from === "compositor") calcKey(s, k); })
  .on("focus", (s) => { s.focused = true; if (s.mode === "plot") plotRun(s); })
  .on("blur", (s) => { s.focused = false; calcSave(s); })
  .screen((s) => {
    if (s.mode === "plot" && s.plot)
      return ui.col({ gap: 4 },
        ui.canvas(PLOT_W, PLOT_H, s.plot.ops.concat(plotTraceOps(s)), { bg: "#ffffff", border: "line" }),
        ui.text(plotStatus(s), { font: "s", color: s.note ? "accent" : "ink" }));
    if (s.mode === "names") {
      const names = calcNames(s);
      return ui.col({ gap: 6 },
        ui.text("Variables and functions", { font: "m" }),
        names.length ? ui.list(names.map((n) => ({ label: n.label, right: n.right, rightColor: "ink" })), s.nsel, { font: "s", lead: 6, grow: 1 })
          : ui.text("None yet. Define one with r = 2.5 or f(x) = x^2 - 2.", { font: "s", color: "muted", wrap: true, grow: 1 }));
    }
    const items = (s.sel < 0 ? s.hist.slice(-12) : s.hist).map((h) => ({ label: h.e, right: h.r, rightColor: h.ok ? "ink" : "accent" }));
    return ui.col({ gap: 4 },
      items.length ? ui.list(items, s.sel, { font: "s", lead: 6, grow: 1 })
        : ui.text("Type an expression and press Enter: 2pi r, sqrt(2), f(x) = x^2 - 2, then f(3). F2 plots a function of x.",
            { font: "s", color: "muted", wrap: true, grow: 1 }),
      ui.input(s.line, { cursor: s.cur, prompt: "▸ ", font: "m" }),
      ui.text(calcStatus(s), { font: "s", color: s.note ? "accent" : "muted" }));
  })
  .hints((s) => s.mode === "plot" ? (s.trace ? "←→ move ↑↓ curve ⏎ stop Esc back" : "arrows pan +- zoom 0 reset a fit ⏎ trace")
    : s.mode === "names" ? "Del remove  Esc back" : s.sel >= 0 ? "⏎ edit  Tab result  Esc back"
    : "F2 graph F3 names F4 deg/rad F5 clear");
