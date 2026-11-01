// The calculator: a scientific calculator with a history, functions of several variables, calculus and a solver,
// a plotter for functions, polar and parametric curves, and help pages for every built-in name. A line is parsed
// once into a tree (a Pratt parser) and compiled into closures, so the plotter can evaluate the same expression for
// three hundred values without parsing again. Every name a closure binds (a function's parameters, the t of
// integ(..., t, ...), the plot's x) is a cell, an object { v }, set by whoever binds it. A plot is sampled a slice of
// columns at a time, sized so that no turn runs long on the device even with Wi-Fi up. Sampling and saving run as
// detached promise chains (sleep, then work), never as a handler's returned promise: that would hold the turn open
// and keep keys from arriving.
const CALC_HIST = 100, CALC_FUNCS = 16, CALC_DEPTH = 32, CALC_PARAMS = 4, CALC_GRAPHS = 4;
const CALC_FUEL = 30000;   // closure nodes one line may evaluate in loops and calls: about 120 ms on the P4
const PLOT_W = 306, PLOT_H = 230, PLOT_COLORS = ["accent", "blue", "ok", "warn"];
const PLOT_VIEW = { x0: -10, x1: 10, y0: -7.5, y1: 7.5 };

// ---- tokens --------------------------------------------------------------------------------------------------
const CALC_TOKEN = /\s*(?:(0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|\S))/y;
const CALC_OPS = ["+", "-", "*", "/", "%", "^", "!", "(", ")", ",", "=", "<", ">", "<=", ">=", "==", "!="];

function calcTokens(line) {
  if (line.length > 256) throw new Error("a line holds at most 256 characters");
  const out = [];
  CALC_TOKEN.lastIndex = 0;
  let m;
  while ((m = CALC_TOKEN.exec(line))) {
    const text = m[1] || m[2] || m[3], at = m.index + m[0].length - text.length;
    if (m[1]) {
      const base = { "0x": 16, "0b": 2, "0o": 8 }[text.slice(0, 2)];
      out.push({ t: "num", v: base ? parseInt(text.slice(2), base) : Number(text), at });
    } else if (m[2]) out.push({ t: "name", v: text, at });
    else if (CALC_OPS.includes(text)) out.push({ t: "op", v: text, at });
    else throw new Error("unexpected " + text);
    if (out.length > 128) throw new Error("a line holds at most 128 tokens");
  }
  return out;
}

// ---- numbers -------------------------------------------------------------------------------------------------
const calcInt = (v) => Number.isInteger(v);
const CALC_TURN = { rad: 2 * Math.PI, deg: 360, grad: 400 };
const calcRad = (c, v) => v * 2 * Math.PI / CALC_TURN[c.s.angle], calcAng = (c, v) => v * CALC_TURN[c.s.angle] / (2 * Math.PI);
function calcFact(n) {
  if (!calcInt(n) || n < 0) return NaN;
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
// Lanczos (g = 7, nine coefficients), with the reflection formula below 1/2
const CALC_LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
function calcGamma(x) {
  if (calcInt(x) && x <= 0) return NaN;
  if (calcInt(x) && x <= 171) return calcFact(x - 1);
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * calcGamma(1 - x));
  x -= 1;
  let a = CALC_LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += CALC_LANCZOS[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}
function calcGcd(a, b) {
  if (!calcInt(a) || !calcInt(b)) return NaN;
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
// Trial division up to 2^32: on the P4 (doubles in software) a pass of the loop costs about 8 us, as much as one
// and a half nodes, and the largest primes take about 90 ms.
function calcIsPrime(n) {
  if (!calcInt(n) || n > 4294967296) return NaN;
  if (n < 2) return 0;
  if (n < 4) return 1;
  if (n % 2 === 0 || n % 3 === 0) return 0;
  for (let i = 5, k = 0, r = Math.floor(Math.sqrt(n)); i <= r; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return 0;
    if (++k === 200) { k = 0; calcBurn(300); }
  }
  return 1;
}
function calcRound(x, d) {
  if (d === undefined) return Math.round(x);
  if (!calcInt(d) || d < 0 || d > 15) return NaN;
  return Number(Math.round(Number(x + "e" + d)) + "e-" + d);
}
const calcMean = (...v) => v.reduce((a, b) => a + b, 0) / v.length;
function calcVar(...v) {
  if (v.length < 2) return NaN;
  const m = calcMean(...v);
  return v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1);
}
function calcMedian(...v) {
  const s = v.slice().sort((a, b) => a - b), n = s.length;
  return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// ---- names ---------------------------------------------------------------------------------------------------
// CODATA 2018; names people use for their own variables (c, g, h, k, R) stay free
const CALC_CONST = {
  pi: Math.PI, e: Math.E, tau: 2 * Math.PI,
  c0: 299792458, g0: 9.80665, Gc: 6.6743e-11, hP: 6.62607015e-34, hbar: 6.62607015e-34 / (2 * Math.PI), kB: 1.380649e-23,
  NA: 6.02214076e23, R0: 8.314462618, qe: 1.602176634e-19, me: 9.1093837015e-31, mp: 1.67262192369e-27,
  eps0: 8.8541878128e-12, mu0: 1.25663706212e-6,
};
// name: [fewest arguments, most (Infinity: any number), (ctx) => implementation]
const CALC_FN = {
  sqrt: [1, 1, () => Math.sqrt], cbrt: [1, 1, () => Math.cbrt], abs: [1, 1, () => Math.abs], sign: [1, 1, () => Math.sign],
  root: [2, 2, () => (x, n) => (x < 0 && calcInt(n) && n % 2 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n))],
  floor: [1, 1, () => Math.floor], ceil: [1, 1, () => Math.ceil], round: [1, 2, () => calcRound], trunc: [1, 1, () => Math.trunc],
  frac: [1, 1, () => (x) => x - Math.trunc(x)],
  sin: [1, 1, (c) => (v) => Math.sin(calcRad(c, v))], cos: [1, 1, (c) => (v) => Math.cos(calcRad(c, v))],
  tan: [1, 1, (c) => (v) => Math.tan(calcRad(c, v))], sec: [1, 1, (c) => (v) => 1 / Math.cos(calcRad(c, v))],
  csc: [1, 1, (c) => (v) => 1 / Math.sin(calcRad(c, v))], cot: [1, 1, (c) => (v) => 1 / Math.tan(calcRad(c, v))],
  asin: [1, 1, (c) => (v) => calcAng(c, Math.asin(v))], acos: [1, 1, (c) => (v) => calcAng(c, Math.acos(v))],
  atan: [1, 1, (c) => (v) => calcAng(c, Math.atan(v))], acot: [1, 1, (c) => (v) => calcAng(c, Math.atan(1 / v))],
  atan2: [2, 2, (c) => (y, x) => calcAng(c, Math.atan2(y, x))],
  sinh: [1, 1, () => Math.sinh], cosh: [1, 1, () => Math.cosh], tanh: [1, 1, () => Math.tanh],
  asinh: [1, 1, () => Math.asinh], acosh: [1, 1, () => Math.acosh], atanh: [1, 1, () => Math.atanh],
  ln: [1, 1, () => Math.log], log: [1, 2, () => (x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b))],
  log2: [1, 1, () => Math.log2], exp: [1, 1, () => Math.exp], pow: [2, 2, () => Math.pow],
  fact: [1, 1, () => calcFact], gamma: [1, 1, () => calcGamma],
  deg: [1, 1, () => (v) => v * 180 / Math.PI], rad: [1, 1, () => (v) => v * Math.PI / 180],
  mod: [2, 2, () => (a, b) => a - b * Math.floor(a / b)],
  nCr: [2, 2, () => (n, k) => (calcInt(n) && calcInt(k) && k >= 0 && k <= n ? Math.round(calcFact(n) / calcFact(k) / calcFact(n - k)) : NaN)],
  nPr: [2, 2, () => (n, k) => (calcInt(n) && calcInt(k) && k >= 0 && k <= n ? Math.round(calcFact(n) / calcFact(n - k)) : NaN)],
  gcd: [2, 2, () => calcGcd], lcm: [2, 2, () => (a, b) => (a && b ? Math.abs(a * b) / calcGcd(a, b) : 0)],
  isprime: [1, 1, () => calcIsPrime],
  min: [1, Infinity, () => Math.min], max: [1, Infinity, () => Math.max], hypot: [1, Infinity, () => Math.hypot],
  sum: [1, Infinity, () => (...v) => v.reduce((a, b) => a + b, 0)], mean: [1, Infinity, () => calcMean],
  median: [1, Infinity, () => calcMedian], var: [2, Infinity, () => calcVar], sd: [2, Infinity, () => (...v) => Math.sqrt(calcVar(...v))],
  rand: [0, 0, () => () => Math.random()],
  randint: [2, 2, () => (a, b) => (calcInt(a) && calcInt(b) && a <= b ? a + Math.floor(Math.random() * (b - a + 1)) : NaN)],
};
// Forms that bind a name in their first argument (deriv, integ, solve, sigma, prod), take theirs lazily (if), or
// belong to graphs (polar, param, whose t is implicit): [fewest arguments, most, binds a name]
const CALC_FORM = { deriv: [3, 3, true], integ: [4, 4, true], solve: [3, 4, true], sigma: [4, 4, true], prod: [4, 4, true],
  if: [3, 3, false], polar: [1, 1, false], param: [2, 2, false] };
const calcHas = (o, n) => Object.prototype.hasOwnProperty.call(o, n);
const calcArgs = (n) => (n === 0 ? "no arguments" : n === 1 ? "1 argument" : n + " arguments");
const calcArity = (nm, lo, hi) => nm + " takes " + (lo === hi ? calcArgs(lo) : hi === Infinity ? "at least " + (lo === 1 ? "one argument" : calcArgs(lo))
  : lo + " or " + calcArgs(hi));
const calcBuiltin = (n) => calcHas(CALC_FN, n) || calcHas(CALC_CONST, n) || calcHas(CALC_FORM, n) || n === "ans";
const calcIsFunc = (s, n) => calcHas(CALC_FN, n) || calcHas(CALC_FORM, n) || calcHas(s.funcs, n);

// ---- parsing: a statement into a tree ------------------------------------------------------------------------
// statement := name "=" expr | name "(" name {"," name} ")" "=" expr | expr
// expr := comparison; comparison := sum {cmp sum}; sum := product {+- product}; product := unary {*/% unary | implicit}
// unary := -+ unary | power; power := postfix [^ unary]; postfix := primary {!}
function calcParse(line, isFunc) {
  const toks = calcTokens(line);
  if (!toks.length) throw new Error("nothing to calculate");
  let i = 0, depth = 0, kind = "expr", name = null, params = [], body = line;
  const peek = () => toks[i], next = () => toks[i++];
  const isOp = (t, v) => !!t && t.t === "op" && t.v === v;
  if (toks[0].t === "name" && isOp(toks[1], "=")) { kind = "var"; name = toks[0].v; i = 2; }
  else if (toks[0].t === "name" && isOp(toks[1], "(")) {
    // f(a, b) = ... : a definition only if names and commas lead to ") ="
    let j = 2;
    const ps = [];
    while (toks[j] && toks[j].t === "name") { ps.push(toks[j].v); j++; if (isOp(toks[j], ",")) j++; else break; }
    if (ps.length && isOp(toks[j], ")") && isOp(toks[j + 1], "=")) { kind = "func"; name = toks[0].v; params = ps; i = j + 2; }
  }
  if (kind !== "expr") {
    if (i >= toks.length) throw new Error("nothing after =");
    body = line.slice(toks[i].at).trim();
  }
  // a function's own name is callable in its body, so it can call itself (if() lets it stop)
  const isCall = (n) => !params.includes(n) && ((kind === "func" && n === name) || isFunc(n));
  const CMP = ["<", ">", "<=", ">=", "==", "!="];

  function expr(min) {
    if (++depth > 40) throw new Error("too deeply nested");
    let left = unary();
    for (;;) {
      const t = peek();
      let op = null, p = 0, explicit = true;
      if (t && t.t === "op" && CMP.includes(t.v)) { op = t.v; p = 1; }
      else if (isOp(t, "+") || isOp(t, "-")) { op = t.v; p = 2; }
      else if (isOp(t, "*") || isOp(t, "/") || isOp(t, "%")) { op = t.v; p = 3; }
      else if (t && (t.t === "name" || isOp(t, "("))) { op = "*"; p = 3; explicit = false; }   // 2x, 3(x+1), (a)(b)
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
  function args() {
    const out = [];
    if (!isOp(peek(), ")")) {
      out.push(expr(1));
      while (isOp(peek(), ",")) { next(); out.push(expr(1)); }
    }
    if (!isOp(next(), ")")) throw new Error("missing )");
    return out;
  }
  function primary() {
    const t = next();
    if (!t) throw new Error("the line ends too soon");
    if (t.t === "num") return { num: t.v };
    if (t.t === "name") {
      if (isOp(peek(), "(") && isCall(t.v)) {
        next();
        if (calcHas(CALC_FORM, t.v)) {
          const [lo, hi, binds] = CALC_FORM[t.v], a = args();
          if (a.length < lo || a.length > hi) throw new Error(calcArity(t.v, lo, hi));
          if (!binds) return { form: t.v, args: a };
          const v = a[1];
          if (!v || v.name === undefined) throw new Error(t.v + "'s second argument is the name it varies, like x");
          if (calcBuiltin(v.name) || isFunc(v.name)) throw new Error(v.name + " cannot be the name " + t.v + " varies");
          return { form: t.v, bound: v.name, body: a[0], args: a.slice(2) };
        }
        return { call: t.v, args: args() };
      }
      if (calcHas(CALC_FN, t.v) || calcHas(CALC_FORM, t.v)) throw new Error(t.v + " needs parentheses: " + t.v + "(...)");
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
  return { kind, name, params, body, tree };
}

// ---- compiling a tree into closures ----------------------------------------------------------------------------
// ctx = { s, scope }: scope maps bound names to cells; s holds vars, funcs, ans and the angle mode, read when the
// closure runs, so a compiled function follows later assignments. The result carries its node count in .size.
let calcDepth = 0, calcFuel = CALC_FUEL, calcTick = 0, calcT0 = -1;
const calcCache = new Map();   // "params|source" -> { body, cells } of user functions
const calcByName = new Map();   // name -> { def, u }, so that a call does not build the key while def is the same
// Loops (calculus, sums) and user-function calls burn fuel by the nodes they evaluate; a step that runs out stops.
// Every thousand units the clock is read too: fuel does not see the garbage collector, and a step that has run for
// CALC_MS stops as well, so that it ends well inside the world's turn, with room for drawing the result.
const CALC_MS = 120;   // the world's budget is 200 ms (js/system.json)
function calcBurn(n) {
  if ((calcFuel -= n) < 0) throw new Error("too much work for one step");
  if ((calcTick += n) < 1000) return;
  calcTick = 0;
  const t = now();
  if (calcT0 < 0) calcT0 = t;
  else if (t - calcT0 > CALC_MS) throw new Error("too much work for one step");
}
function calcFresh(fuel) { calcDepth = 0; calcFuel = fuel || CALC_FUEL; calcTick = 0; calcT0 = -1; }

function calcCompile(tree, ctx) {
  let size = 0;
  function c(n, scope) {
    size++;
    if ("num" in n) { const v = n.num; return () => v; }
    if (n.name !== undefined) {
      const nm = n.name;
      if (scope.has(nm)) { const cell = scope.get(nm); return () => cell.v; }
      if (calcHas(CALC_CONST, nm)) { const v = CALC_CONST[nm]; return () => v; }
      if (nm === "ans") return () => ctx.s.ans;
      if (!calcHas(ctx.s.vars, nm)) throw new Error("unknown name " + nm);
      return () => {
        const v = ctx.s.vars[nm];
        if (v === undefined) throw new Error("unknown name " + nm);
        return v;
      };
    }
    if (n.form !== undefined) return calcForm(n, scope, c);
    if (n.call !== undefined) {
      const args = n.args.map((a) => c(a, scope)), nm = n.call;
      if (calcHas(CALC_FN, nm)) {
        const [lo, hi, make] = CALC_FN[nm], f = make(ctx);
        if (args.length < lo || args.length > hi) throw new Error(calcArity(nm, lo, hi));
        if (args.length === 0) return () => f();
        if (args.length === 1) { const a = args[0]; return () => f(a()); }
        if (args.length === 2) { const [a, b] = args; return () => f(a(), b()); }
        return () => f.apply(null, args.map((a) => a()));
      }
      const def = ctx.s.funcs[nm];
      if (def && def.ps.length !== args.length) throw new Error(calcArity(nm, def.ps.length, def.ps.length));
      return () => calcCallUser(ctx.s, nm, args.map((a) => a()));
    }
    const a = c(n.a, scope), b = n.b ? c(n.b, scope) : null;
    switch (n.op) {
      case "+": return () => a() + b();
      case "-": return () => a() - b();
      case "*": return () => a() * b();
      case "/": return () => a() / b();
      case "%": return () => a() % b();
      case "^": return () => Math.pow(a(), b());
      case "neg": return () => -a();
      case "!": return () => calcFact(a());
      case "<": return () => +(a() < b());
      case ">": return () => +(a() > b());
      case "<=": return () => +(a() <= b());
      case ">=": return () => +(a() >= b());
      case "==": return () => +(a() === b());
      case "!=": return () => +(a() !== b());
    }
    throw new Error("cannot compile " + n.op);
  }
  // a special form: its arguments, and for those that bind a name, its body over a new cell
  function calcForm(n, scope, c) {
    const args = n.args.map((a) => c(a, scope));
    if (n.form === "if") { const [p, a, b] = args; return () => (p() ? a() : b()); }
    if (n.form === "polar" || n.form === "param") throw new Error(n.form + "(...) draws a curve: type it, then F2");
    const cell = { v: 0 }, inner = new Map(scope);
    inner.set(n.bound, cell);
    const before = size, body = c(n.body, inner), cost = size - before;
    // f(t): the body at t, with the cell restored afterwards, so the same form can run inside itself
    const at = (t) => { calcBurn(cost); const old = cell.v; cell.v = t; try { return body(); } finally { cell.v = old; } };
    const run = CALC_CALCULUS[n.form];
    return () => run(at, args.map((a) => a()));
  }
  const f = c(tree, ctx.scope || new Map());
  f.size = size;
  return f;
}

function calcUserFn(s, name) {
  const def = s.funcs[name];
  if (!def) throw new Error("unknown function " + name);
  const hit = calcByName.get(name);
  if (hit && hit.def === def) return hit.u;
  const key = def.ps.join(",") + "|" + def.src;
  let u = calcCache.get(key);
  if (!u) {
    const cells = def.ps.map(() => ({ v: 0 }));
    const body = calcCompile(calcParse(def.src, (n) => !def.ps.includes(n) && calcIsFunc(s, n)).tree,
      { s, scope: new Map(def.ps.map((p, i) => [p, cells[i]])) });
    u = { body, cells };
    calcCache.set(key, u);
  }
  calcByName.set(name, { def, u });
  return u;
}
function calcCallUser(s, name, vals) {
  if (calcDepth >= CALC_DEPTH) throw new Error("too deep: does " + name + " call itself?");
  const u = calcUserFn(s, name), cs = u.cells, old = [];
  calcBurn(u.body.size);
  for (let i = 0; i < cs.length; i++) { old.push(cs[i].v); cs[i].v = vals[i]; }
  calcDepth++;
  try { return u.body(); }
  finally { calcDepth--; for (let i = 0; i < cs.length; i++) cs[i].v = old[i]; }
}

// ---- calculus and solving ------------------------------------------------------------------------------------
const calcReal = (v, what) => { if (!Number.isFinite(v)) throw new Error(what + " must be a finite number"); return v; };
function calcDeriv(f, [a]) {
  calcReal(a, "the point");
  const h = 1e-3 * Math.max(1, Math.abs(a)), d = (h) => (f(a + h) - f(a - h)) / (2 * h);
  return (4 * d(h / 2) - d(h)) / 3;   // Richardson: the h^2 error terms cancel
}
// Gauss-Kronrod 7/15 on one interval: [the 15-point result, its difference from the 7-point one]
const GK_X = [0.991455371120812639, 0.949107912342758525, 0.864864423359769073, 0.741531185599394440, 0.586087235467691130,
  0.405845151377397167, 0.207784955007898468, 0];
const GK_W = [0.022935322010529225, 0.063092092629978553, 0.104790010322250184, 0.140653259715525919, 0.169004726639267903,
  0.190350578064785410, 0.204432940075298892, 0.209482141084727828];
const G7_W = [0.129484966168869693, 0.279705391489276668, 0.381830050505118945, 0.417959183673469388];
function calcGK(f, a, b) {
  const c = (a + b) / 2, h = (b - a) / 2, fc = f(c);
  let k = fc * GK_W[7], g = fc * G7_W[3];
  for (let j = 0; j < 7; j++) {
    const x = h * GK_X[j], s = f(c - x) + f(c + x);
    k += GK_W[j] * s;
    if (j % 2) g += G7_W[(j - 1) / 2] * s;
  }
  return [k * h, Math.abs((k - g) * h)];
}
const CALC_PARTS = 100;   // an end where f is infinite, like 1/sqrt(x) at 0, needs about 50 halvings
function calcInteg(f, [a, b]) {
  calcReal(a, "the lower limit"); calcReal(b, "the upper limit");
  if (a === b) return 0;
  const parts = [[a, b, ...calcGK(f, a, b)]];
  for (let n = 1; n < CALC_PARTS; n++) {
    calcBurn(parts.length);   // the integrator's own work
    let total = 0, err = 0, worst = 0;
    parts.forEach((p, i) => { total += p[2]; err += p[3]; if (p[3] > parts[worst][3]) worst = i; });
    if (!Number.isFinite(total)) throw new Error("the integral does not converge here");
    if (err <= Math.max(1e-12, 1e-10 * Math.abs(total))) return total;
    const [lo, hi] = parts[worst], mid = (lo + hi) / 2;
    parts.splice(worst, 1, [lo, mid, ...calcGK(f, lo, mid)], [mid, hi, ...calcGK(f, mid, hi)]);
  }
  const total = parts.reduce((t, p) => t + p[2], 0), err = parts.reduce((t, p) => t + p[3], 0);
  if (!(err <= 1e-6 * Math.max(1, Math.abs(total)))) throw new Error("the integral does not converge here");
  return total;
}
// A root in [a, b] where f changes sign, by bisection to the last bit; refuses a sign change that is a pole.
function calcBisect(f, a, b, fa, fb) {
  for (let n = 0; n < 200; n++) {
    const m = (a + b) / 2;
    if (m === a || m === b) break;
    const fm = f(m);
    if (fm === 0) return m;
    if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else { b = m; fb = fm; }
  }
  const x = Math.abs(fa) < Math.abs(fb) ? a : b, fx = Math.min(Math.abs(fa), Math.abs(fb));
  if (!(fx <= 1e-6 * Math.max(1, Math.abs(x)))) throw new Error("no root near " + calcFormat(x, 6) + " (a pole?)");
  return x;
}
function calcSolve(f, [a, b]) {
  calcReal(a, "the start");
  if (b !== undefined) {
    calcReal(b, "the end");
    const fa = f(a), fb = f(b);
    if (fa === 0) return a;
    if (fb === 0) return b;
    if (!((fa < 0) !== (fb < 0))) throw new Error("no sign change between " + calcFormat(a, 6) + " and " + calcFormat(b, 6));
    return calcBisect(f, a, b, fa, fb);
  }
  // secant from the guess; if it wanders off, look outward for a sign change and bisect it
  let x0 = a, x1 = a + 1e-3 * Math.max(1, Math.abs(a)), f0 = f(x0), f1 = f(x1);
  for (let n = 0; n < 50 && Number.isFinite(f1); n++) {
    if (f1 === 0) return x1;
    if (f1 === f0) break;
    const x2 = x1 - f1 * (x1 - x0) / (f1 - f0);
    if (!Number.isFinite(x2)) break;
    x0 = x1; f0 = f1; x1 = x2; f1 = f(x1);
    if (Math.abs(x1 - x0) <= 1e-14 * Math.max(1, Math.abs(x1)) && Math.abs(f1) <= 1e-9 * Math.max(1, Math.abs(x1))) return x1;
  }
  const fa = f(a);
  let d = 0.1 * Math.max(1, Math.abs(a));
  for (let n = 0; n < 40; n++, d *= 1.6) {
    for (const x of [a - d, a + d]) {
      const fx = f(x);
      if (Number.isFinite(fx) && Number.isFinite(fa) && (fx < 0) !== (fa < 0)) return calcBisect(f, Math.min(a, x), Math.max(a, x), x < a ? fx : fa, x < a ? fa : fx);
    }
  }
  throw new Error("no solution found near " + calcFormat(a, 6));
}
function calcLoop(name, empty, add) {
  return (f, [a, b]) => {
    if (!calcInt(a) || !calcInt(b)) throw new Error(name + " counts in whole numbers: its limits must be integers");
    if (b - a >= 10000) throw new Error(name + " adds at most 10000 terms");
    let r = empty;
    for (let k = a; k <= b; k++) r = add(r, f(k));
    return r;
  };
}
const CALC_CALCULUS = { deriv: calcDeriv, integ: calcInteg, solve: calcSolve,
  sigma: calcLoop("sigma", 0, (r, v) => r + v), prod: calcLoop("prod", 1, (r, v) => r * v) };

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
const calcExp = (e) => "e" + (e[0] === "+" ? e.slice(1) : e);   // "e+5" -> "e5"
// p/q with q <= 10000 equal to v within 1e-12, by continued fractions; null if there is none
function calcFraction(v) {
  let h0 = 1, h1 = 0, k0 = 0, k1 = 1, x = v;
  for (let n = 0; n < 40; n++) {
    const a = Math.floor(x), h = a * h0 + h1, k = a * k0 + k1;
    if (k > 10000) break;
    h1 = h0; h0 = h; k1 = k0; k0 = k;
    if (Math.abs(v - h / k) <= 1e-12 * Math.max(1, Math.abs(v))) return [h, k];
    if (x === a) break;
    x = 1 / (x - a);
  }
  return null;
}
// v in the display format s.fmt = { mode: norm|fix|sci|eng|frac, digits, base: 10|16|2|8 }
function calcShow(s, v) {
  const f = s.fmt || { mode: "norm", digits: 10, base: 10 }, d = f.mode === "eng" ? Math.max(3, f.digits) : f.digits;
  if (!Number.isFinite(v) || Object.is(v, -0)) return calcFormat(v);
  if (f.base !== 10 && calcInt(v) && Math.abs(v) <= 9007199254740992)
    return (v < 0 ? "-" : "") + { 16: "0x", 2: "0b", 8: "0o" }[f.base] + Math.abs(v).toString(f.base).toUpperCase();
  const a = Math.abs(v);
  if (f.mode === "fix" && a < 1e15) return v.toFixed(d);
  if (f.mode === "sci" || (f.mode === "fix" && a >= 1e15)) { const [m, e] = v.toExponential(d - 1).split("e"); return m + calcExp(e); }
  if (f.mode === "eng") {
    if (v === 0) return (0).toPrecision(d);
    let e = Math.floor(Math.log10(a) / 3) * 3, m = Number((v / Math.pow(10, e)).toPrecision(d));
    if (Math.abs(m) >= 1000) { e += 3; m = Number((v / Math.pow(10, e)).toPrecision(d)); }
    return m.toPrecision(d).replace(/e\+?/, "e") + (e ? "e" + e : "");
  }
  if (f.mode === "frac" && !calcInt(v)) { const q = calcFraction(v); if (q) return q[0] + "/" + q[1]; }
  return calcFormat(v);
}

// ---- running a line ------------------------------------------------------------------------------------------
function calcValue(v) {
  if (Number.isNaN(v)) throw new Error("not a real number");
  if (!Number.isFinite(v)) throw new Error("infinite");
  return v;
}
// Evaluates or defines; returns { text, v, name } for the history. Throws with a message for the user.
function calcRun(s, line) {
  const st = calcParse(line, (n) => calcIsFunc(s, n));
  calcFresh();
  if (st.kind === "func") {
    if (calcBuiltin(st.name)) throw new Error(st.name + " is built in");
    if (calcHas(s.vars, st.name)) throw new Error(st.name + " is a variable");
    if (st.params.length > CALC_PARAMS) throw new Error("a function takes at most " + CALC_PARAMS + " arguments");
    for (const p of st.params) if (calcBuiltin(p)) throw new Error(p + " is built in");
    if (new Set(st.params).size !== st.params.length) throw new Error("each argument needs its own name");
    if (!s.funcs[st.name] && Object.keys(s.funcs).length >= CALC_FUNCS) throw new Error("at most " + CALC_FUNCS + " functions");
    const cells = new Map(st.params.map((p) => [p, { v: 0 }]));
    calcCompile(st.tree, { s, scope: cells });   // unknown names fail here, not when plotted
    s.funcs[st.name] = { ps: st.params, src: st.body };
    return { text: st.name + "(" + st.params.join(", ") + ") defined" };
  }
  const v = calcValue(calcCompile(st.tree, { s })());
  if (st.kind === "var") {
    if (calcBuiltin(st.name)) throw new Error(st.name + " is built in");
    if (calcHas(s.funcs, st.name)) throw new Error(st.name + " is a function");
    s.vars[st.name] = v;
    s.ans = v;
    return { text: st.name + " = " + calcShow(s, v), v, name: st.name };
  }
  s.ans = v;
  return { text: "= " + calcShow(s, v), v };
}
// A history entry as it is shown now: values in the current format, other results as they were written.
const calcEntryText = (s, h) => (h.ok && typeof h.v === "number" ? (h.name ? h.name + " = " : "= ") + calcShow(s, h.v) : h.r);

// ---- the plotter ---------------------------------------------------------------------------------------------
// Curves are { src, on } in s.graphs: a function of x, polar(r) or param(x, y) in t. Every curve that is on is
// sampled at PLOT_W steps: the columns for a function, values of t for the others.
const PLOT_TINT = ["#f6c9ca", "#c9d6ef", "#c5e0cf", "#f2ddb5"];   // shaded areas, in the curves' colours
const CALC_CELL_FUEL = 5000;   // one plot column or table cell: about 25 ms on the P4
let plotFns = [];   // compiled curves, parallel to s.plot.curves (functions do not belong in the state)

const plotX = (v, c) => v.x0 + c * (v.x1 - v.x0) / (PLOT_W - 1);
const plotPy = (v, y) => (v.y1 - y) * (PLOT_H - 1) / (v.y1 - v.y0);
const plotPx = (v, x) => (x - v.x0) * (PLOT_W - 1) / (v.x1 - v.x0);
const plotCol = (v, x) => Math.max(0, Math.min(PLOT_W - 1, Math.round(plotPx(v, x))));
const plotTRange = (s) => s.tview || { t0: 0, t1: CALC_TURN[s.angle] };   // one full turn until the window sets it
const plotT = (s, c) => { const r = plotTRange(s); return r.t0 + c * (r.t1 - r.t0) / (PLOT_W - 1); };

// { kind: "fx", f(x) } or { kind: "polar" | "param", f(t) -> [x, y] }, with the node count in size
function plotCompile(s, src) {
  const st = calcParse(src, (n) => n !== "x" && n !== "t" && calcIsFunc(s, n));
  if (st.kind !== "expr") throw new Error("plot an expression in x, like sin(x)");
  const tree = st.tree, cell = { v: 0 };
  if (tree.form === "polar" || tree.form === "param") {
    const scope = new Map([["t", cell]]), [a, b] = tree.args.map((n) => calcCompile(n, { s, scope })), ctx = { s };
    const f = tree.form === "polar"
      ? (t) => { cell.v = t; const r = a(), th = calcRad(ctx, t); return [r * Math.cos(th), r * Math.sin(th)]; }
      : (t) => { cell.v = t; return [a(), b()]; };
    return { kind: tree.form, f, size: a.size + (b ? b.size : 0) };
  }
  const body = calcCompile(tree, { s, scope: new Map([["x", cell]]) });
  return { kind: "fx", f: (x) => { cell.v = x; return body(); }, size: body.size };
}
const plotKind = (src) => (/^\s*polar\s*\(/.test(src) ? "polar" : /^\s*param\s*\(/.test(src) ? "param" : "fx");

// Start (or restart) sampling for the current view and curves.
function plotReset(s) {
  plotFns = [];
  const curves = [];
  s.graphs.forEach((g, slot) => {
    if (!g.on) return;
    let fn = null, err = "";
    try { fn = plotCompile(s, g.src); } catch (e) { err = e.message; }
    plotFns.push(fn);
    curves.push({ slot, src: g.src, kind: fn ? fn.kind : plotKind(g.src), xs: [], ys: [], ops: [], err });
  });
  const size = plotFns.reduce((n, f) => n + (f ? f.size : 0), 0) || 1;
  const max = Math.max(8, Math.min(PLOT_W, Math.floor(3000 / size)));
  s.plot = { curves, col: 0, built: 1, max, slice: Math.min(max, 32), grid: plotGrid(s.view), ops: [], ms: 0, t0: now(), slices: 0, worst: 0 };
  if (s.trace && s.trace.k >= curves.length) s.trace.k = 0;
  if (s.trace && !curves.length) s.trace = null;
}
// One slice of columns, ended early once 25 ms have gone (on the device now() is the wall clock).
function plotSample(s) {
  const p = s.plot;
  if (!p || p.col >= PLOT_W) return;
  const t0 = now(), start = p.col, v = s.view;
  for (let c = start; c < PLOT_W; c++) {
    const x = plotX(v, c), t = plotT(s, c);
    for (let k = 0; k < p.curves.length; k++) {
      const fn = plotFns[k], cv = p.curves[k];
      if (!fn) continue;
      let y = null, px = null;
      try {
        calcFresh(CALC_CELL_FUEL);
        if (fn.kind === "fx") y = fn.f(x);
        else [px, y] = fn.f(t);
      } catch (e) { if (!cv.err) cv.err = e.message; }
      cv.ys[c] = typeof y === "number" && Number.isFinite(y) ? y : null;
      if (fn.kind !== "fx") cv.xs[c] = typeof px === "number" && Number.isFinite(px) ? px : null;
    }
    p.col = c + 1;
    if (p.col - start >= p.slice || now() - t0 > 25) break;
  }
  const ms = now() - t0;
  p.ms = ms; p.slices++; p.worst = Math.max(p.worst, ms);
  if (p.col === PLOT_W) log("plot of " + p.curves.length + " curve(s), " + plotFns.reduce((n, f) => n + (f ? f.size : 0), 0) + " nodes: " +
    Math.round(now() - p.t0) + " ms in " + p.slices + " slices (slowest " + p.worst.toFixed(1) + " ms), slice now " + p.slice + " columns");
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
// Any segment clipped to the canvas (Liang-Barsky), for polar and parametric curves; null if it misses it.
function plotClipRect(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  let a = 0, b = 1;
  for (const [p, q] of [[-dx, x0], [dx, PLOT_W - 1 - x0], [-dy, y0], [dy, PLOT_H - 1 - y0]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > b) return null; if (r > a) a = r; }
    else { if (r < a) return null; if (r < b) b = r; }
  }
  return [Math.round(x0 + a * dx), Math.round(y0 + a * dy), Math.round(x0 + b * dx), Math.round(y0 + b * dy)];
}
// Joins segments that meet into polylines.
function plotJoin(polys, seg, run) {
  if (!seg) return null;
  if (run && run[run.length - 2] === seg[0] && run[run.length - 1] === seg[1]) { run.push(seg[2], seg[3]); return run; }
  const r = seg.slice();
  polys.push(r);
  return r;
}
// Polylines for one function's samples: broken at missing values and where it jumps across the whole view.
// From column from-1 on, so that a later call continues where an earlier one stopped.
function plotPolys(v, ys, upto, from = 1) {
  const polys = [];
  let run = null;
  for (let c = from; c < upto; c++) {
    const a = ys[c - 1], b = ys[c];
    const ok = a != null && b != null && !((a > v.y1 && b < v.y0) || (a < v.y0 && b > v.y1));
    run = plotJoin(polys, ok ? plotClip(c - 1, plotPy(v, a), c, plotPy(v, b)) : null, run);
  }
  return polys;
}
function plotParamPolys(v, xs, ys, upto, from = 1) {
  const polys = [];
  let run = null;
  for (let c = from; c < upto; c++) {
    const ok = xs[c - 1] != null && ys[c - 1] != null && xs[c] != null && ys[c] != null;
    run = plotJoin(polys, ok ? plotClipRect(plotPx(v, xs[c - 1]), plotPy(v, ys[c - 1]), plotPx(v, xs[c]), plotPy(v, ys[c])) : null, run);
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
// An area between a function and the x axis, as one vertical line per column.
function plotShadeOps(s) {
  const sh = s.shade, p = s.plot, v = s.view;
  const k = sh && p ? p.curves.findIndex((cv) => cv.slot === sh.slot && cv.kind === "fx") : -1;
  if (k < 0) return [];
  const ys = p.curves[k].ys, ops = [], ay = Math.max(0, Math.min(PLOT_H - 1, Math.round(plotPy(v, 0))));
  for (let c = plotCol(v, Math.min(sh.xa, sh.xb)); c <= plotCol(v, Math.max(sh.xa, sh.xb)) && c < p.col; c++) {
    if (ys[c] == null) continue;
    const py = Math.max(0, Math.min(PLOT_H - 1, Math.round(plotPy(v, ys[c]))));
    ops.push(["line", c, Math.min(py, ay), c, Math.max(py, ay), PLOT_TINT[sh.slot]]);
  }
  return ops;
}
// The curves' polylines for the columns sampled since the last call (on the P4, redrawing four whole curves takes
// over 100 ms); then the whole picture.
function plotBuild(s) {
  const p = s.plot, v = s.view;
  if (p.col > p.built) {
    for (const cv of p.curves) {
      const polys = cv.kind === "fx" ? plotPolys(v, cv.ys, p.col, p.built) : plotParamPolys(v, cv.xs, cv.ys, p.col, p.built);
      for (const poly of polys) cv.ops.push(["poly", poly, PLOT_COLORS[cv.slot]]);
    }
    p.built = p.col;
  }
  plotCompose(s);
}
// Grid, shading, curves, mark and legend, in that order; the analysis keys change only the shading and the mark.
function plotCompose(s) {
  const p = s.plot, v = s.view;
  let ops = p.grid.concat(plotShadeOps(s));
  for (const cv of p.curves) ops = ops.concat(cv.ops);
  if (s.mark) { const c = plotCol(v, s.mark.x); ops.push(["line", c, 0, c, PLOT_H - 1, "faint"]); }
  const legend = p.curves.map((cv) => (cv.slot + 1) + " " + cv.src + (cv.err ? "  (" + cv.err + ")" : ""));
  if (legend.length) ops.push(["fill", 1, 1, Math.min(PLOT_W - 2, 8 + 6 * Math.max(...legend.map((l) => l.length))), 4 + 13 * legend.length, "#ffffff"]);
  legend.forEach((l, k) => ops.push(["text", 4, 3 + 13 * k, l, "s", PLOT_COLORS[p.curves[k].slot], PLOT_W - 8]));
  p.ops = ops;
}
// The traced point: (x, y) of curve k at step c, or null
function plotPoint(s, k, c) {
  const cv = s.plot && s.plot.curves[k];
  if (!cv || cv.ys[c] == null) return null;
  if (cv.kind === "fx") return [plotX(s.view, c), cv.ys[c]];
  return cv.xs[c] == null ? null : [cv.xs[c], cv.ys[c]];
}
function plotTraceOps(s) {
  const t = s.trace, p = s.plot;
  if (!t || !p || !p.curves[t.k]) return [];
  const fx = p.curves[t.k].kind === "fx", pt = plotPoint(s, t.k, t.c), ops = fx ? [["line", t.c, 0, t.c, PLOT_H - 1, "faint"]] : [];
  if (pt) {
    const px = Math.round(plotPx(s.view, pt[0])), py = Math.round(plotPy(s.view, pt[1]));
    if (py >= 0 && py < PLOT_H && px >= 0 && px < PLOT_W) ops.push(["rect", px - 3, py - 3, 7, 7, "ink"]);
  }
  return ops;
}
function plotStatus(s) {
  const t = s.trace, p = s.plot;
  if (s.note) return s.note;
  if (t && p && p.curves[t.k]) {
    const cv = p.curves[t.k], pt = plotPoint(s, t.k, t.c), n = cv.slot + 1;
    if (cv.kind === "fx") return n + ": x = " + calcFormat(plotX(s.view, t.c), 6) + "   y = " + (pt ? calcFormat(pt[1], 8) : "none");
    return n + ": t = " + calcFormat(plotT(s, t.c), 5) + "  x = " + (pt ? calcFormat(pt[0], 5) : "none") + "  y = " + (pt ? calcFormat(pt[1], 5) : "none");
  }
  const v = s.view;
  return "x " + calcFormat(v.x0, 4) + " .. " + calcFormat(v.x1, 4) + "   y " + calcFormat(v.y0, 4) + " .. " + calcFormat(v.y1, 4) + (s.angle !== "rad" ? "   " + s.angle.toUpperCase() : "");
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
  const v = s.view, pt = s.trace ? plotPoint(s, s.trace.k, s.trace.c) : null;
  const cx = pt ? pt[0] : (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
  s.view = { x0: cx - (cx - v.x0) * f, x1: cx + (v.x1 - cx) * f, y0: cy - (cy - v.y0) * f, y1: cy + (v.y1 - cy) * f };
}

// ---- analysing a traced function ---------------------------------------------------------------------------------
// Candidates are found among the samples, nearest to the cursor first, and refined on the function itself.
function plotTraced(s) {
  const t = s.trace, cv = t && s.plot && s.plot.curves[t.k], fn = cv && plotFns[t.k];
  if (!fn || fn.kind !== "fx") throw new Error("this works on functions of x; trace one with up and down");
  return { cv, f: fn.f };
}
const plotNear = (c, list) => list.sort((a, b) => Math.abs(a - c) - Math.abs(b - c));
// sign changes of d (an array over the columns), nearest first, refined by bisection of g
function plotZero(s, ds, g, what) {
  const v = s.view, js = [];
  for (let j = 0; j + 1 < PLOT_W; j++) {
    const a = ds[j], b = ds[j + 1];
    if (a != null && b != null && (a === 0 || (a < 0) !== (b < 0))) js.push(j);
  }
  for (const j of plotNear(s.trace.c - 0.5, js).slice(0, 12)) {
    const xa = plotX(v, j), xb = plotX(v, j + 1);
    try { calcFresh(); const fa = g(xa); return fa === 0 ? xa : calcBisect(g, xa, xb, fa, g(xb)); } catch (e) { /* a pole: the next one */ }
  }
  throw new Error("no " + what + " on the screen");
}
function calcGolden(f, a, b, sign) {
  const r = (Math.sqrt(5) - 1) / 2;
  let c = b - r * (b - a), d = a + r * (b - a), fc = sign * f(c), fd = sign * f(d);
  for (let i = 0; i < 100 && b - a > 1e-12 * Math.max(1, Math.abs(a) + Math.abs(b)); i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = sign * f(c); }
    else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = sign * f(d); }
  }
  return (a + b) / 2;
}
function plotExtremum(s, ys, f, sign) {
  const v = s.view, js = [];
  for (let j = 1; j + 1 < PLOT_W; j++) {
    const a = ys[j - 1], m = ys[j], b = ys[j + 1];
    if (a != null && m != null && b != null && sign * m <= sign * a && sign * m <= sign * b && (a !== m || m !== b)) js.push(j);
  }
  const j = plotNear(s.trace.c, js)[0];
  if (j === undefined) throw new Error("no " + (sign > 0 ? "minimum" : "maximum") + " on the screen");
  calcFresh();
  return calcGolden(f, plotX(v, j - 1), plotX(v, j + 1), sign);
}
const plotNum = (v) => calcFormat(Math.abs(v) < 1e-13 ? 0 : v, 10);
function plotAnalyze(s, key) {
  const v = s.view, t = s.trace;
  try {
    const { cv, f } = plotTraced(s), x0 = plotX(v, t.c);
    let x = null;
    if (key === "r") { x = plotZero(s, cv.ys, f, "root"); s.note = "root  x = " + plotNum(x); }
    else if (key === "n" || key === "x") {
      x = plotExtremum(s, cv.ys, f, key === "n" ? 1 : -1);
      calcFresh();
      s.note = (key === "n" ? "minimum" : "maximum") + "  x = " + calcFormat(x, 8) + "  y = " + plotNum(f(x));
    } else if (key === "i") {
      const k2 = s.plot.curves.findIndex((o, k) => k !== t.k && o.kind === "fx" && plotFns[k]);
      if (k2 < 0) throw new Error("intersect needs a second function on the graph");
      const g2 = plotFns[k2].f, other = s.plot.curves[k2].ys;
      x = plotZero(s, cv.ys.map((y, c) => (y == null || other[c] == null ? null : y - other[c])), (z) => f(z) - g2(z), "intersection");
      calcFresh();
      s.note = "meets " + (s.plot.curves[k2].slot + 1) + " at x = " + calcFormat(x, 10) + "  y = " + plotNum(f(x));
    } else if (key === "d") { calcFresh(); s.note = "dy/dx = " + plotNum(calcDeriv(f, [x0])) + " at x = " + calcFormat(x0, 6); }
    else if (key === "m") { s.mark = { x: x0 }; s.shade = null; s.note = "Marked x = " + calcFormat(x0, 6) + ". Move, then s for the area."; }
    else if (key === "s") {
      if (!s.mark) throw new Error("m marks where the area starts");
      calcFresh();
      const a = calcInteg(f, [s.mark.x, x0]);
      s.shade = { slot: cv.slot, xa: s.mark.x, xb: x0 };
      s.note = "area " + calcFormat(s.mark.x, 5) + " .. " + calcFormat(x0, 5) + " = " + plotNum(a);
    } else return false;
    if (x !== null) t.c = plotCol(v, x);
  } catch (e) { s.note = e.message; }
  plotCompose(s);
  return true;
}

function plotKey(s, k, once) {
  const v = s.view, w = v.x1 - v.x0, h = v.y1 - v.y0, t = s.trace;
  s.note = "";
  if (k.key === "esc") { if (!once) return false; if (t) s.trace = null; else s.mode = "calc"; return false; }
  if (k.key === "enter") { if (once && s.plot && s.plot.curves.length) s.trace = t ? null : { c: PLOT_W >> 1, k: 0 }; return false; }
  if (t) {
    const n = s.plot ? s.plot.curves.length : 0;
    if (k.key === "left" || k.key === "right") { t.c = Math.max(0, Math.min(PLOT_W - 1, t.c + (k.key === "left" ? -1 : 1))); return false; }
    if (k.key === "pgup" || k.key === "pgdn") { t.c = Math.max(0, Math.min(PLOT_W - 1, t.c + (k.key === "pgup" ? -10 : 10))); return false; }
    if ((k.key === "up" || k.key === "down") && n) { t.k = (t.k + (k.key === "up" ? n - 1 : 1)) % n; return false; }
    if (once && "rnxidms".includes(k.ch || "_")) { plotAnalyze(s, k.ch); return false; }
  } else if (k.key === "left" || k.key === "right") { const d = (k.key === "left" ? -w : w) / 4; s.view = { x0: v.x0 + d, x1: v.x1 + d, y0: v.y0, y1: v.y1 }; return true; }
  else if (k.key === "up" || k.key === "down") { const d = (k.key === "down" ? -h : h) / 4; s.view = { x0: v.x0, x1: v.x1, y0: v.y0 + d, y1: v.y1 + d }; return true; }
  if (!once) return false;
  if (k.ch === "+" || k.ch === "=") { plotZoom(s, 0.5); return true; }
  if (k.ch === "-") { plotZoom(s, 2); return true; }
  if (k.ch === "0") { s.view = Object.assign({}, PLOT_VIEW); return true; }
  if (k.ch === "a") { plotFit(s); return true; }
  if (k.key === "del" || k.key === "backspace") {
    const cv = s.plot && s.plot.curves[t ? t.k : 0];
    if (!cv) return false;
    s.note = "Removed " + cv.src;
    s.graphs.splice(cv.slot, 1);
    if (s.shade && s.shade.slot === cv.slot) s.shade = null;
    if (t) t.k = 0;
    if (!s.graphs.some((g) => g.on)) { s.trace = null; s.mode = "calc"; }
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
function plotShow(s) { s.mode = "plot"; s.note = ""; plotReset(s); plotSample(s); plotRun(s); }
// F2: the line becomes the first curve (a defined function's name plots f(x)); an empty line shows the graph.
function plotOpen(s, src) {
  if (src) {
    if (calcHas(s.funcs, src)) src = src + "(x)";
    try { plotCompile(s, src); } catch (e) { s.note = e.message; return; }
    s.graphs = [{ src, on: true }].concat(s.graphs.filter((g) => g.src !== src)).slice(0, CALC_GRAPHS);
    s.shade = null; s.mark = null;
    s.line = ""; s.cur = 0;
  }
  if (!s.graphs.some((g) => g.on)) { s.note = s.graphs.length ? "All curves are off: F8 turns them on." : "Type a function of x, like sin(x), then F2."; return; }
  plotShow(s);
  calcChanged(s);
}

// ---- the table, the window and the curve list ------------------------------------------------------------------
const TABLE_ROWS = 12;
function tableBuild(s) {
  const cols = [];
  s.graphs.forEach((g, slot) => {
    if (!g.on) return;
    try { const c = plotCompile(s, g.src); if (c.kind === "fx") cols.push({ slot, f: c.f }); }
    catch (e) { cols.push({ slot, err: e.message }); }
  });
  const { start, step } = s.table, rows = [];
  for (let i = 0; i < TABLE_ROWS; i++) {
    const x = Number((start + i * step).toPrecision(12));
    rows.push([calcFormat(x, 7)].concat(cols.map((c) => {
      if (!c.f) return "error";
      try { calcFresh(CALC_CELL_FUEL); const y = c.f(x); return Number.isFinite(y) ? calcFormat(y, 7) : "none"; }
      catch (e) { return "error"; }
    })));
  }
  s.tab = { slots: cols.map((c) => c.slot), rows, err: cols.filter((c) => c.err).map((c) => (c.slot + 1) + ": " + c.err)[0] || "" };
}
function tableKey(s, k, once) {
  const { step } = s.table;
  if (k.key === "up") s.table.start -= step;
  else if (k.key === "down") s.table.start += step;
  else if (k.key === "pgup") s.table.start -= step * TABLE_ROWS;
  else if (k.key === "pgdn") s.table.start += step * TABLE_ROWS;
  else return false;
  s.table.start = Number(s.table.start.toPrecision(12));
  tableBuild(s);
  calcChanged(s);
  return true;
}

const WIN_FIELDS = [["x min", "x0"], ["x max", "x1"], ["y min", "y0"], ["y max", "y1"], ["t min", "t0"], ["t max", "t1"], ["table start", "start"], ["table step", "step"]];
function winValue(s, key) {
  if (key in s.view) return s.view[key];
  if (key === "t0" || key === "t1") return plotTRange(s)[key];
  return s.table[key];
}
// Sets one field from an expression, if the ranges stay valid.
function winApply(s, key, text) {
  const st = calcParse(text, (n) => calcIsFunc(s, n));
  if (st.kind !== "expr") throw new Error("type a number or an expression, like -2pi");
  calcFresh();
  const v = calcValue(calcCompile(st.tree, { s })());
  if (key in s.view) {
    const nv = Object.assign({}, s.view, { [key]: v });
    if (!(nv.x0 < nv.x1)) throw new Error("x min must be below x max");
    if (!(nv.y0 < nv.y1)) throw new Error("y min must be below y max");
    s.view = nv;
  } else if (key === "t0" || key === "t1") {
    const nt = Object.assign({}, plotTRange(s), { [key]: v });
    if (!(nt.t0 < nt.t1)) throw new Error("t min must be below t max");
    s.tview = nt;
  } else if (key === "step") {
    if (!(v > 0)) throw new Error("the table's step must be above 0");
    s.table.step = v;
  } else s.table.start = v;
}
function winKey(s, k, once) {
  const w = s.win, [label, key] = WIN_FIELDS[w.sel];
  if (w.edit !== null) {
    const cs = Array.from(w.edit);
    if (k.key === "esc" && once) { w.edit = null; s.note = ""; }
    else if (k.key === "enter" && once) {
      try { winApply(s, key, w.edit); w.edit = null; s.note = label + " set."; calcChanged(s); } catch (e) { s.note = e.message; }
    } else if (k.key === "backspace") w.edit = cs.slice(0, -1).join("");
    else if (k.ch && cs.length < 64) w.edit += k.ch;
    else if (k.key === "space") w.edit += " ";
    return;
  }
  s.note = "";
  if (k.key === "up") w.sel = Math.max(0, w.sel - 1);
  else if (k.key === "down") w.sel = Math.min(WIN_FIELDS.length - 1, w.sel + 1);
  else if (k.key === "enter" && once) w.edit = calcFormat(winValue(s, key));
  else if ((k.key === "del" || k.key === "backspace") && once && (key === "t0" || key === "t1")) { s.tview = null; s.note = "t follows the angle mode: one full turn."; calcChanged(s); }
  else if ((k.key === "del" || k.key === "backspace") && once && key in s.view) { s.view = Object.assign({}, PLOT_VIEW); s.note = "The standard window."; calcChanged(s); }
  else if (k.key === "esc" && once) calcBack(s);
  else if (k.ch && once && /[-0-9.(a-z]/.test(k.ch)) w.edit = k.ch;   // typing starts a new value
}

function curvesKey(s, k, once) {
  const g = s.graphs[s.csel];
  if (k.key === "up") s.csel = Math.max(0, s.csel - 1);
  else if (k.key === "down") s.csel = Math.min(Math.max(0, s.graphs.length - 1), s.csel + 1);
  else if (!once) return;
  else if ((k.key === "space" || k.ch === " ") && g) { g.on = !g.on; calcChanged(s); }
  else if ((k.key === "del" || k.key === "backspace") && g) {
    s.graphs.splice(s.csel, 1); s.shade = null;
    s.csel = Math.min(s.csel, Math.max(0, s.graphs.length - 1)); calcChanged(s);
  } else if (k.key === "enter" && g) {
    s.graphs.splice(s.csel, 1); s.shade = null;
    s.line = g.src; s.cur = Array.from(g.src).length; s.mode = "calc"; s.note = "Edit it, then F2 to plot it again.";
    calcChanged(s);
  } else if (k.key === "f2") plotOpen(s, "");
  else if (k.key === "esc") calcBack(s);
}

// Pages remember where they were opened from; Esc returns there.
function calcPage(s, mode) {
  if (s.mode === "calc" || s.mode === "plot") s.back = s.mode;
  s.note = "";
  s.mode = mode;
  if (mode === "table") tableBuild(s);
  if (mode === "window") s.win = { sel: 0, edit: null };
  if (mode === "curves") s.csel = 0;
  if (mode === "modes") s.msel = 0;
}
function calcBack(s) {
  s.note = "";
  if (s.back === "plot" && s.graphs.some((g) => g.on)) plotShow(s);
  else s.mode = "calc";
}

// ---- help ------------------------------------------------------------------------------------------------------
// The reference: one entry per built-in name, [name, form, sentence, example, result]. The help shows the example
// worked out now, in the current modes; a test checks that in the default modes it gives the result written here,
// so the reference cannot drift from the engine. A null result: the example varies (rand) or draws a curve.
const HELP_REF = [
  ["sin", "sin(x)", "The sine of x, an angle in the angle mode (F4).", "sin(pi/6)", "0.5"],
  ["cos", "cos(x)", "The cosine of x, an angle in the angle mode.", "cos(pi)", "-1"],
  ["tan", "tan(x)", "The tangent of x, an angle in the angle mode.", "tan(pi/4)", "1"],
  ["sec", "sec(x)", "The secant, 1/cos(x).", "sec(pi/3)", "2"],
  ["csc", "csc(x)", "The cosecant, 1/sin(x).", "csc(pi/6)", "2"],
  ["cot", "cot(x)", "The cotangent, 1/tan(x).", "cot(pi/4)", "1"],
  ["asin", "asin(x)", "The angle whose sine is x, from minus to plus a quarter turn, in the angle mode.", "asin(1)", "1.57079632679"],
  ["acos", "acos(x)", "The angle whose cosine is x, from 0 to half a turn.", "acos(-1)", "3.14159265359"],
  ["atan", "atan(x)", "The angle whose tangent is x, between minus and plus a quarter turn.", "atan(1)", "0.785398163397"],
  ["acot", "acot(x)", "The angle whose cotangent is x: atan(1/x).", "acot(1)", "0.785398163397"],
  ["atan2", "atan2(y, x)", "The angle of the point (x, y) from the x axis, right in every quadrant: from minus to plus half a turn.",
    "atan2(1, -1)", "2.35619449019"],
  ["deg", "deg(x)", "x radians in degrees, whatever the angle mode.", "deg(pi)", "180"],
  ["rad", "rad(x)", "x degrees in radians, whatever the angle mode.", "rad(180)", "3.14159265359"],
  ["sinh", "sinh(x)", "The hyperbolic sine, (e^x - e^-x)/2.", "sinh(1)", "1.17520119364"],
  ["cosh", "cosh(x)", "The hyperbolic cosine, (e^x + e^-x)/2.", "cosh(1)", "1.54308063482"],
  ["tanh", "tanh(x)", "The hyperbolic tangent, sinh(x)/cosh(x), between -1 and 1.", "tanh(1)", "0.761594155956"],
  ["asinh", "asinh(x)", "The inverse hyperbolic sine.", "asinh(1)", "0.88137358702"],
  ["acosh", "acosh(x)", "The inverse hyperbolic cosine, for x of 1 or more.", "acosh(2)", "1.31695789692"],
  ["atanh", "atanh(x)", "The inverse hyperbolic tangent, for x between -1 and 1.", "atanh(0.5)", "0.549306144334"],
  ["sqrt", "sqrt(x)", "The square root of x, for x of 0 or more.", "sqrt(2)", "1.41421356237"],
  ["cbrt", "cbrt(x)", "The cube root of x, of a negative x too.", "cbrt(-27)", "-3"],
  ["root", "root(x, n)", "The n-th root of x; for an odd whole n, of a negative x too.", "root(-32, 5)", "-2"],
  ["pow", "pow(x, y)", "x to the power y, the same as x^y.", "pow(2, 10)", "1024"],
  ["hypot", "hypot(x, y, ...)", "The square root of the sum of the squares: the length of a vector.", "hypot(3, 4)", "5"],
  ["exp", "exp(x)", "e to the power x.", "exp(1)", "2.71828182846"],
  ["ln", "ln(x)", "The natural logarithm, to base e.", "ln(e^3)", "3"],
  ["log", "log(x), log(x, b)", "The logarithm to base 10, or to base b.", "log(8, 2)", "3"],
  ["log2", "log2(x)", "The logarithm to base 2.", "log2(1024)", "10"],
  ["abs", "abs(x)", "The absolute value: x without its sign.", "abs(-2.5)", "2.5"],
  ["sign", "sign(x)", "-1, 0 or 1, as x is negative, zero or positive.", "sign(-3)", "-1"],
  ["floor", "floor(x)", "The greatest whole number not above x.", "floor(-2.5)", "-3"],
  ["ceil", "ceil(x)", "The least whole number not below x.", "ceil(2.1)", "3"],
  ["round", "round(x), round(x, d)", "x rounded to a whole number, or to d decimals; a half rounds up.", "round(2.71828, 2)", "2.72"],
  ["trunc", "trunc(x)", "x without its fractional part, rounded toward zero.", "trunc(-2.7)", "-2"],
  ["frac", "frac(x)", "The fractional part, x - trunc(x).", "frac(3.75)", "0.75"],
  ["fact", "fact(n)", "n factorial, 1*2*...*n, for a whole n; n! is the same.", "fact(5)", "120"],
  ["gamma", "gamma(x)", "The gamma function: gamma(n) is fact(n - 1), continued between whole numbers.", "gamma(0.5)", "1.77245385091"],
  ["nCr", "nCr(n, k)", "The number of ways to choose k of n things, in any order.", "nCr(5, 2)", "10"],
  ["nPr", "nPr(n, k)", "The number of ways to choose k of n things in order.", "nPr(5, 2)", "20"],
  ["gcd", "gcd(a, b)", "The greatest common divisor of two whole numbers.", "gcd(84, 36)", "12"],
  ["lcm", "lcm(a, b)", "The least common multiple of two whole numbers.", "lcm(4, 6)", "12"],
  ["mod", "mod(a, b)", "The remainder of a / b with the sign of b; a % b keeps the sign of a.", "mod(-7, 3)", "2"],
  ["isprime", "isprime(n)", "1 if the whole number n is a prime, 0 if not; n up to 2^32.", "isprime(97)", "1"],
  ["sum", "sum(a, b, ...)", "The sum of its arguments.", "sum(1, 2, 3, 4)", "10"],
  ["mean", "mean(a, b, ...)", "The arithmetic mean of its arguments.", "mean(2, 4, 9)", "5"],
  ["median", "median(a, b, ...)", "The middle value; of an even count, the mean of the two in the middle.", "median(3, 1, 4, 1, 5)", "3"],
  ["var", "var(a, b, ...)", "The sample variance, divided by n - 1, of two values or more.", "var(2, 4, 4, 4, 5, 5, 7, 9)", "4.57142857143"],
  ["sd", "sd(a, b, ...)", "The sample standard deviation, sqrt(var(...)).", "sd(2, 4, 4, 4, 5, 5, 7, 9)", "2.1380899353"],
  ["min", "min(a, b, ...)", "The least of its arguments.", "min(3, -1, 2)", "-1"],
  ["max", "max(a, b, ...)", "The greatest of its arguments.", "max(3, -1, 2)", "3"],
  ["rand", "rand()", "A random number from 0 up to 1, not 1 itself.", "rand()", null],
  ["randint", "randint(a, b)", "A random whole number from a to b, both included.", "randint(1, 6)", null],
  ["deriv", "deriv(f, x, a)", "The derivative of f in x at x = a: the slope of f there.", "deriv(x^3, x, 2)", "12"],
  ["integ", "integ(f, t, a, b)", "The integral of f over t from a to b: the area under f, to about 10 digits.", "integ(x^2, x, 0, 3)", "9"],
  ["solve", "solve(f, x, g), solve(f, x, a, b)", "A value of x where f is 0: near the guess g, or between a and b.",
    "solve(x^2 - 2, x, 1)", "1.41421356237"],
  ["sigma", "sigma(f, k, a, b)", "The sum of f for k = a, a + 1, ..., b; at most 10000 terms.", "sigma(k^2, k, 1, 10)", "385"],
  ["prod", "prod(f, k, a, b)", "The product of f for k = a, a + 1, ..., b; at most 10000 terms.", "prod(1 + 1/k, k, 1, 9)", "10"],
  ["if", "if(c, a, b)", "a if c is not 0, otherwise b; only the one chosen is worked out. < > <= >= == != give 1 or 0.",
    "if(2 > 1, 10, 20)", "10"],
  ["polar", "polar(r)", "For the graph: the point at distance r from the origin at the angle t, as t runs.", "polar(1 + cos(t))", null],
  ["param", "param(x, y)", "For the graph: the point (x, y) as t runs; x and y are expressions in t.", "param(cos(3t), sin(2t))", null],
  ["pi", "pi", "The ratio of a circle's circumference to its diameter.", "pi", "3.14159265359"],
  ["e", "e", "The base of the natural logarithm.", "e", "2.71828182846"],
  ["tau", "tau", "A full turn in radians, 2pi.", "tau", "6.28318530718"],
  ["c0", "c0", "The speed of light in vacuum, m/s.", "c0", "299792458"],
  ["g0", "g0", "Standard gravity, m/s^2.", "g0", "9.80665"],
  ["Gc", "Gc", "The gravitational constant, m^3/(kg s^2).", "Gc", "6.6743e-11"],
  ["hP", "hP", "The Planck constant, J s.", "hP", "6.62607015e-34"],
  ["hbar", "hbar", "The reduced Planck constant, hP/(2pi), J s.", "hbar", "1.05457181765e-34"],
  ["kB", "kB", "The Boltzmann constant, J/K.", "kB", "1.380649e-23"],
  ["NA", "NA", "The Avogadro constant, 1/mol.", "NA", "6.02214076e23"],
  ["R0", "R0", "The molar gas constant, J/(mol K).", "R0", "8.314462618"],
  ["qe", "qe", "The elementary charge, C.", "qe", "1.602176634e-19"],
  ["me", "me", "The mass of the electron, kg.", "me", "9.1093837015e-31"],
  ["mp", "mp", "The mass of the proton, kg.", "mp", "1.67262192369e-27"],
  ["eps0", "eps0", "The vacuum permittivity, F/m.", "eps0", "8.8541878128e-12"],
  ["mu0", "mu0", "The vacuum permeability, N/A^2.", "mu0", "0.00000125663706212"],
  ["ans", "ans", "The last result. A line that starts with + * / ^ or % continues from it.", "ans", null],
];
const HELP_ENTRY = new Map(HELP_REF.map((e) => [e[0], e]));
const HELP_SORTED = HELP_REF.slice().sort((a, b) => (a[0].toLowerCase() < b[0].toLowerCase() ? -1 : 1));
const HELP_COLS = 49, HELP_ROWS = 17, HELP_DETAIL = 5;

// Guides are paragraphs: "# " a heading, "| " an example (each one runs in a test, in order), "- key<tab>what" a
// key, anything else prose. Groups list entries of the reference.
const HELP_TOPICS = [
  { id: "start", title: "Start here", text: [
    "Type an expression and press Enter. The result goes into the history above the line.",
    "| 2pi * 3", "| sqrt(2)^2", "| sin(pi/6) + cos(0)",
    "↑ picks an earlier line: Enter brings it back to change, Tab puts its result into the line. Esc clears the line.",
    "Give a value a name, or define a function, and use them in later lines:",
    "| r = 2.5", "| 2pi r", "| area(d) = pi d^2/4", "| area(3)",
    "F2 draws the line on the graph when it is a function of x, like x^2 - 2 or area(x).",
    "A line that starts with + * / ^ or % continues from the last result: typing * 2 gives ans * 2.",
    "F4 sets the angle (radians to begin with) and how results look. F6 opens this help; with the cursor on a name in the line, it opens that name, and Enter there completes it.",
  ] },
  { id: "keys", title: "Keys", text: [
    "# Calculator",
    "- Enter\twork out the line", "- ↑ ↓\tpick a line from the history", "- Tab\tput the picked result into the line",
    "- Esc\tclear the line", "- F2\tdraw the line, or show the graph", "- F3\tyour variables and functions",
    "- F4\tmodes: angle, format, digits, base", "- F5\ttwice: clear the history", "- F6\thelp, on the name at the cursor",
    "- F7\ttable of the curves of x", "- F8\tthe curves", "- F9\tthe window",
    "# Graph",
    "- arrows\tmove the view", "- + -\tzoom in, zoom out", "- 0\tthe standard window", "- a\tfit y to the curves",
    "- Enter\ttrace a curve", "- Del\tremove the traced curve", "- Esc\tback to the calculator",
    "# Tracing",
    "- ← →\tmove along the curve; PgUp PgDn by 10", "- ↑ ↓\tthe other curves", "- r\tthe root nearest the cursor",
    "- n x\tthe nearest minimum, maximum", "- i\twhere it meets the next curve", "- d\tthe slope dy/dx here",
    "- m s\tmark here; s: the area from the mark", "- Esc\tstop tracing",
    "# Help",
    "- ↑ ↓\tchoose", "- Enter\topen; on a function, put it into the line", "- letters\tfind a function or constant",
    "- F6\tall topics", "- Esc\tback",
  ] },
  { id: "numbers", title: "Numbers and operators", text: [
    "Numbers: 42, 3.5, .5, 2e3 (2000), 1.5e-3. Whole numbers also in hex 0x1F, binary 0b101 and octal 0o17.",
    "# Operators, loosest first",
    "- < > <= >=\tcompare: 1 if true, 0 if not", "- == !=\tequal, not equal", "- + -\tadd, subtract",
    "- * / %\tmultiply, divide, remainder", "- -x\tminus", "- ^\tpower, from the right: 2^3^2 is 2^9",
    "- !\tfactorial: 5! is 120",
    "A number or a bracket next to a name or a bracket multiplies, as tightly as *:",
    "| 2pi", "| 3(1 + 1)", "| (1 + 2)(3 + 4)",
    "So 1/2pi is (1/2)pi. -2^2 is -4, because the power comes first; write (-2)^2 for 4.",
    "% is the remainder with the sign of the left side, as in 7 % 3; mod(a, b) takes the sign of b.",
    "ans is the last result. A line that starts with + * / ^ or % continues from it.",
    "Results show 12 digits unless F4 sets another format. A line holds up to 256 characters.",
  ] },
  { id: "names", title: "Variables and functions", text: [
    "A name and = store a value:",
    "| r = 2.5", "| v = 4/3 pi r^3",
    "A function is a name, its arguments in brackets, = and an expression:",
    "| f(x) = x^2 - 2", "| g(x, y) = sqrt(x^2 + y^2)", "| f(3) + g(3, 4)",
    "A function takes up to 4 arguments; you can keep 16 of them. Its expression uses the variables as they are when it runs.",
    "A function can call itself, with if() to stop:",
    "| fib(n) = if(n < 2, n, fib(n - 1) + fib(n - 2))", "| fib(13)",
    "It may go 32 calls deep.",
    "F3 lists your variables and functions: Enter puts one into the line, Del removes it. F6 on one of your names shows its value or definition.",
    "Built-in names cannot be redefined. Short names like c, g, h, k and R are yours to use: the physical constants have longer names, c0, g0, hP, kB, R0.",
    "Variables, functions, curves and the history are kept on the device.",
  ] },
  { id: "calculus", title: "Calculus and solving", text: [
    "These take an expression and the name it varies, which can be any name that is not built in or yours: x, t, k.",
    "| deriv(x^3, x, 2)",
    "The slope of x^3 at x = 2. It is worked out from points close to 2 on both sides, so the expression must be smooth there.",
    "| integ(x^2, x, 0, 3)",
    "The area under x^2 from 0 to 3. The range is split until two estimates agree, to about 10 digits. An end where the expression is infinite is fine if the area is finite; integ(1/x, x, 0, 1) says it does not converge.",
    "| integ(1/sqrt(x), x, 0, 1)",
    "| solve(x^2 - 2, x, 1)",
    "A root near 1. With two values, a root between them:",
    "| solve(cos(x) - x, x, 0, 1)",
    "A sign change at a pole, like tan at a quarter turn, is not taken for a root.",
    "| sigma(k^2, k, 1, 10)", "| prod(1 + 1/k, k, 1, 9)",
    "A sum and a product over whole k from a to b, at most 10000 terms.",
    "They nest, and may use your functions:",
    "| integ(deriv(t^3, t, x), x, 0, 2)",
    "A line that would take too long stops with \"too much work for one step\".",
    "On the graph, the trace keys r, n, x, i, d and s use the same methods on the traced curve.",
  ] },
  { id: "graphing", title: "Graphing", text: [
    "F2 draws the line as a curve:",
    "| x^3/8 - x", "| polar(2cos(3t))", "| param(cos(3t), sin(2t))",
    "A function of x is drawn across the window. polar(r) draws r as a function of t at the angle t; param(x, y) draws the point (x, y) as t runs. t runs once around, unless the window sets its range. One of your functions can be drawn by its name alone.",
    "Up to four curves are drawn together, each in its own colour, with their numbers at the top. A new curve comes first; a fifth pushes out the oldest. F2 on an empty line shows the graph again.",
    "# Pages",
    "- F8\tthe curves: space turns one off, Del removes it, Enter takes it back to the line",
    "- F9\tthe window: x, y and t ranges, the table's start and step",
    "- F7\ta table of the functions of x",
    "# The graph",
    "Arrows move the view a quarter, + and - zoom, 0 returns to the standard window, a fits y to the curves.",
    "# Tracing",
    "Enter puts a cursor on the first curve. ← → move it, PgUp and PgDn by ten, ↑ ↓ go to the other curves; the line under the graph shows where it is. On a function of x:",
    "- r\tthe root nearest the cursor", "- n x\tthe nearest minimum, maximum", "- i\twhere it meets the next curve",
    "- d\tthe slope dy/dx", "- m\tmark x; then s shades the area from the mark to the cursor and works it out",
    "The cursor moves to what was found. Esc stops tracing, and Esc again goes back to the calculator.",
    "A curve is worked out a few columns at a time, so the keys keep working while it is drawn.",
  ] },
  { id: "modes", title: "Modes and formats", text: [
    "F4 shows the modes: ↑ ↓ choose one, ← → change it, Esc goes back. The whole history is shown again in the new format.",
    "# Angle",
    "Radians, degrees or gradians (400 to a turn). sin, cos and tan take angles in it; asin, acos, atan and atan2 give them in it; polar() and param() go once around in it. deg() and rad() convert whatever the mode.",
    "# Format",
    "- normal\tup to 12 digits; 1.5e-12 when very large or small", "- fixed\ta fixed number of decimals",
    "- scientific\tdigits as 1.235e3", "- engineering\tpowers of ten in steps of three: 12.35e3",
    "- fraction\tp/q when it is exact, with q up to 10000: 0.375 is 3/8",
    "# Digits",
    "How many digits fixed, scientific and engineering show: 1 to 15.",
    "# Base",
    "Whole numbers in decimal, hex (0xFF), binary (0b101) or octal (0o17); other numbers stay decimal. You can type numbers in any base in any mode.",
    "The line under the input shows the modes that are not the default, and the last result.",
  ] },
  { id: "trig", title: "Trigonometry", tag: "trig", names: "sin cos tan sec csc cot asin acos atan acot atan2 deg rad" },
  { id: "hyp", title: "Hyperbolic functions", tag: "hyperbolic", names: "sinh cosh tanh asinh acosh atanh" },
  { id: "powers", title: "Powers and logarithms", tag: "powers", names: "sqrt cbrt root pow hypot exp ln log log2" },
  { id: "rounding", title: "Rounding and parts", tag: "rounding", names: "abs sign floor ceil round trunc frac" },
  { id: "integers", title: "Whole numbers and counting", tag: "integers", names: "fact gamma nCr nPr gcd lcm mod isprime" },
  { id: "stats", title: "Statistics and chance", tag: "statistics", names: "sum mean median var sd min max rand randint" },
  { id: "forms", title: "Calculus, sums and if", tag: "calculus", names: "deriv integ solve sigma prod if" },
  { id: "curves", title: "Curves for the graph", tag: "graph", names: "polar param" },
  { id: "consts", title: "Constants", tag: "constant", names: "pi e tau c0 g0 Gc hP hbar kB NA R0 qe me mp eps0 mu0" },
  { id: "index", title: "Index" },
];
const HELP_BY_ID = {}, HELP_GROUP = {};
for (const t of HELP_TOPICS) {
  HELP_BY_ID[t.id] = t;
  if (t.names) { t.entries = t.names.split(" ").map((n) => HELP_ENTRY.get(n)); for (const n of t.names.split(" ")) HELP_GROUP[n] = t.id; }
}
const helpTemplate = (e) => (e[1] === e[0] + "()" ? e[0] + "()" : e[1].startsWith(e[0] + "(") ? e[0] + "(" : e[0]);

function helpWrap(text, cols) {
  const out = [];
  let line = "";
  for (const w of text.split(" ")) {
    if (!line) line = w;
    else if (line.length + 1 + w.length <= cols) line += " " + w;
    else { out.push(line); line = w; }
    while (line.length > cols) { out.push(line.slice(0, cols)); line = line.slice(cols); }
  }
  out.push(line);
  return out;
}
// A guide as rows for ui.lines, wrapped here so the app knows how far it scrolls.
const helpRowCache = new Map();
function helpRows(t) {
  let rows = helpRowCache.get(t.id);
  if (rows) return rows;
  rows = [];
  let prev = null;
  for (const p of t.text) {
    const kind = p.startsWith("# ") ? "head" : p.startsWith("| ") ? "ex" : p.startsWith("- ") ? "key" : "text";
    if (rows.length && (kind === "text" || kind === "head") && prev !== "head") rows.push({ s: "" });
    if (kind === "head") rows.push({ s: p.slice(2), color: "accent" });
    else if (kind === "ex") helpWrap(p.slice(2), HELP_COLS - 2).forEach((r, i) => rows.push({ s: r, color: "blue", indent: i ? 4 : 2 }));
    else if (kind === "key") {
      const [key, what] = p.slice(2).split("\t"), w = Math.max(9, key.length + 2);
      helpWrap(what, HELP_COLS - w).forEach((r, i) => rows.push(i ? { s: r, indent: w } : { s: key.padEnd(w) + r }));
    } else helpWrap(p, HELP_COLS).forEach((r) => rows.push({ s: r }));
    prev = kind;
  }
  helpRowCache.set(t.id, rows);
  return rows;
}

// The index, filtered: names that start with the letters, then names that hold them, then (3 letters or more)
// entries whose sentence holds them.
function helpMatches(filter) {
  const f = filter.toLowerCase();
  if (!f) return HELP_SORTED;
  const a = [], b = [], c = [];
  for (const e of HELP_SORTED) {
    const n = e[0].toLowerCase();
    if (n.startsWith(f)) a.push(e);
    else if (n.includes(f)) b.push(e);
    else if (f.length >= 3 && e[2].toLowerCase().includes(f)) c.push(e);
  }
  return a.concat(b, c);
}
function helpItems(s, id) {
  if (id === "home") return HELP_TOPICS;
  if (id === "index") return helpMatches(s.help.filter);
  return HELP_BY_ID[id].entries || [];
}
const helpPage = (s) => s.help.stack[s.help.stack.length - 1];

// An example's value now, without touching ans or the history.
function helpValue(s, ex) {
  try {
    const st = calcParse(ex, (n) => calcIsFunc(s, n));
    calcFresh();
    return calcShow(s, calcValue(calcCompile(st.tree, { s })()));
  } catch (e) { return e.message; }
}
function helpDetail(s, e) {
  const curve = e[0] === "polar" || e[0] === "param";
  const rows = helpWrap(e[2], HELP_COLS).map((r) => ({ s: r }));
  helpWrap(e[3] + (curve ? "   F2 draws it" : " = " + helpValue(s, e[3])), HELP_COLS - 2)
    .forEach((r, i) => rows.push({ s: r, color: "blue", indent: i ? 4 : 2 }));
  return rows.slice(0, HELP_DETAIL);
}

// The name at the cursor, with its place in the line; or else the function whose brackets the cursor is in.
function calcWordAt(s) {
  const cs = Array.from(s.line), isW = (c) => !!c && /[A-Za-z0-9_]/.test(c);
  const around = (at) => {
    let a = at, b = at;
    while (a > 0 && isW(cs[a - 1])) a--;
    while (b < cs.length && isW(cs[b])) b++;
    while (a < b && /[0-9]/.test(cs[a])) a++;   // 2pi: the name is pi
    return a < b ? { name: cs.slice(a, b).join(""), a, b } : null;
  };
  const w = around(s.cur);
  if (w) return w;
  for (let i = s.cur - 1, depth = 0; i >= 0; i--) {
    if (cs[i] === ")") depth++;
    else if (cs[i] === "(" && depth-- === 0) { const f = around(i); return f ? { name: f.name } : null; }
  }
  return null;
}

function helpOpen(s, id, sel, word) {
  s.help = { from: s.mode, stack: [{ id, sel: sel || 0, top: 0 }], filter: "", word: word || null };
  s.mode = "help"; s.note = "";
}
// F6: help on what is in front of the user.
function helpF6(s) {
  if (s.mode === "help") { s.help.stack = [{ id: "home", sel: 0, top: 0 }]; s.help.filter = ""; return; }
  const page = { plot: "graphing", table: "graphing", window: "graphing", curves: "graphing", modes: "modes", names: "names" }[s.mode];
  if (page) return helpOpen(s, page);
  s.sel = -1;
  const w = calcWordAt(s);
  if (!w) return helpOpen(s, "home");
  if (calcHas(s.funcs, w.name)) { const f = s.funcs[w.name]; s.note = w.name + "(" + f.ps.join(", ") + ") = " + f.src; return; }
  if (calcHas(s.vars, w.name)) { s.note = w.name + " = " + calcShow(s, s.vars[w.name]); return; }
  const word = w.a === undefined ? null : { a: w.a, b: w.b };
  const e = HELP_ENTRY.get(w.name), g = e && HELP_GROUP[w.name];
  if (g) return helpOpen(s, g, HELP_BY_ID[g].entries.indexOf(e), word);
  helpOpen(s, "index", 0, word);
  s.help.filter = w.name.slice(0, 12);
}
// Enter or Tab on an entry: its template into the line, in place of the name F6 was pressed on.
function helpInsert(s, e) {
  let tpl = helpTemplate(e);
  const w = s.help.word;
  s.help = null; s.mode = "calc"; s.sel = -1; s.trace = null;
  if (w) {
    const cs = Array.from(s.line);
    if (tpl.endsWith("(") && cs[w.b] === "(") tpl = tpl.slice(0, -1);
    cs.splice(w.a, w.b - w.a);
    s.line = cs.join(""); s.cur = w.a;
  }
  calcInsert(s, tpl);
  s.note = e[1];   // the form, while its arguments are typed
}
function helpBack(s) {
  const h = s.help;
  h.stack.pop();
  if (h.stack.length) { if (helpPage(s).id !== "index") h.filter = ""; return; }
  const from = h.from;
  s.help = null;
  if (from === "plot") plotShow(s); else s.mode = from;
}
// Letters and digits search the index, from any help page.
function helpFind(s, k) {
  if (!k.ch || !/[A-Za-z0-9_]/.test(k.ch)) return false;
  const h = s.help;
  if (helpPage(s).id !== "index") { h.filter = ""; h.stack.push({ id: "index", sel: 0, top: 0 }); }
  h.filter = (h.filter + k.ch).slice(0, 12);
  helpPage(s).sel = 0;
  return true;
}
function helpKey(s, k, once) {
  const h = s.help, p = helpPage(s), t = HELP_BY_ID[p.id];
  if (k.key === "esc") { if (once) helpBack(s); return; }
  if (t && t.text) {   // a guide scrolls
    const max = Math.max(0, helpRows(t).length - HELP_ROWS);
    if (k.key === "up") p.top = Math.max(0, p.top - 1);
    else if (k.key === "down") p.top = Math.min(max, p.top + 1);
    else if (k.key === "pgup") p.top = Math.max(0, p.top - (HELP_ROWS - 1));
    else if (k.key === "pgdn" || k.key === "space") p.top = Math.min(max, p.top + HELP_ROWS - 1);
    else if (once) helpFind(s, k);
    return;
  }
  const items = helpItems(s, p.id), last = Math.max(0, items.length - 1);
  if (k.key === "up") p.sel = Math.max(0, p.sel - 1);
  else if (k.key === "down") p.sel = Math.min(last, p.sel + 1);
  else if (k.key === "pgup") p.sel = Math.max(0, p.sel - 8);
  else if (k.key === "pgdn") p.sel = Math.min(last, p.sel + 8);
  else if (!once) return;
  else if (k.key === "enter" || k.key === "tab" || k.key === "right") {
    const it = items[p.sel];
    if (!it) return;
    if (p.id === "home") h.stack.push({ id: it.id, sel: 0, top: 0 });
    else helpInsert(s, it);
  } else if (p.id === "index" && (k.key === "backspace" || k.key === "del")) { h.filter = h.filter.slice(0, -1); p.sel = 0; }
  else helpFind(s, k);
}

function helpScreen(s) {
  const h = s.help, p = helpPage(s), t = HELP_BY_ID[p.id];
  if (p.id === "home") {
    const items = HELP_TOPICS.map((x) => ({ label: x.title, right: x.text ? "guide" : x.entries ? x.entries.length + (x.id === "consts" ? " constants" : " functions") : "A-Z",
      rightColor: "muted" }));
    return ui.col({ gap: 4 },
      ui.text("Help", { font: "m" }),
      ui.list(items, p.sel, { font: "s", lead: 5, grow: 1 }),
      ui.text("Type letters to find a function or a constant.", { font: "s", color: "muted" }));
  }
  if (t.text) {
    const rows = helpRows(t), more = rows.length > HELP_ROWS;
    return ui.col({ gap: 4 },
      ui.text(t.title, { font: "m" }),
      ui.lines(rows.slice(p.top, p.top + HELP_ROWS), { font: "s", visible: HELP_ROWS }),
      ui.col({ grow: 1 }),
      ui.text(more ? "lines " + (p.top + 1) + "-" + Math.min(rows.length, p.top + HELP_ROWS) + " of " + rows.length : "", { font: "s", color: "muted" }));
  }
  const items = helpItems(s, p.id), e = items[p.sel], index = p.id === "index";
  return ui.col({ gap: 4 },
    index ? ui.input(h.filter, { cursor: Array.from(h.filter).length, prompt: "Find ", font: "m" }) : ui.text(t.title, { font: "m" }),
    items.length ? ui.list(items.map((x) => ({ label: x[1], right: index ? (HELP_BY_ID[HELP_GROUP[x[0]]] || {}).tag || "" : "", rightColor: "muted" })),
      p.sel, { font: "s", lead: 5, grow: 1 })
      : ui.col({ grow: 1 }, ui.text("Nothing matches " + h.filter + ".", { font: "s", color: "muted" })),
    e ? ui.lines(helpDetail(s, e), { font: "s", visible: HELP_DETAIL }) : null);
}

// ---- modes -----------------------------------------------------------------------------------------------------
const MODE_FORMATS = { norm: "normal", fix: "fixed", sci: "scientific", eng: "engineering", frac: "fraction" };
const MODE_FIELDS = [
  { label: "Angle", get: (s) => s.angle, set: (s, v) => { s.angle = v; }, values: ["rad", "deg", "grad"],
    names: { rad: "radians", deg: "degrees", grad: "gradians" } },
  { label: "Format", get: (s) => s.fmt.mode, set: (s, v) => { s.fmt.mode = v; }, values: Object.keys(MODE_FORMATS), names: MODE_FORMATS },
  { label: "Digits", get: (s) => s.fmt.digits, set: (s, v) => { s.fmt.digits = v; }, values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  { label: "Base", get: (s) => s.fmt.base, set: (s, v) => { s.fmt.base = v; }, values: [10, 16, 2, 8],
    names: { 10: "decimal", 16: "hex", 2: "binary", 8: "octal" } },
];
function modesKey(s, k, once) {
  const f = MODE_FIELDS[s.msel];
  s.note = "";
  if (k.key === "up") s.msel = Math.max(0, s.msel - 1);
  else if (k.key === "down") s.msel = Math.min(MODE_FIELDS.length - 1, s.msel + 1);
  else if (k.key === "left" || k.key === "right" || (k.key === "enter" && once)) {
    const vs = f.values, i = vs.indexOf(f.get(s)), d = k.key === "left" ? -1 : 1;
    f.set(s, vs[(i + d + vs.length) % vs.length]);
    calcChanged(s);
  } else if ((k.key === "esc" || k.key === "f4") && once) calcBack(s);
}
function modesScreen(s) {
  const usesDigits = ["fix", "sci", "eng"].includes(s.fmt.mode);
  const items = MODE_FIELDS.map((f) => {
    const v = f.get(s);
    return { label: f.label, right: f.names ? f.names[v] : String(v), rightColor: f.label === "Digits" && !usesDigits ? "muted" : "ink",
      detail: f.label === "Digits" ? (usesDigits ? "" : "not used by " + MODE_FORMATS[s.fmt.mode]) : f.label === "Base" ? "whole numbers" : "" };
  });
  const shown = [["asin(1)", CALC_TURN[s.angle] / 4], ["1/3", 1 / 3], ["2000pi", 2000 * Math.PI], ["0.375", 0.375], ["255", 255]]
    .map(([ex, v]) => ({ s: ex.padEnd(9) + "= " + calcShow(s, v), indent: 2 }));
  return ui.col({ gap: 6 },
    ui.list(items, s.msel, { font: "s", visible: MODE_FIELDS.length }),
    ui.text("Results look like this:", { font: "s", color: "muted" }),
    ui.lines(shown, { font: "s", visible: shown.length }),
    ui.col({ grow: 1 }),
    calcNoteText(s, "The whole history follows the format."));
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
  const rec = { v: 2, hist: s.hist, vars: s.vars, funcs: s.funcs, graphs: s.graphs, view: s.view, tview: s.tview, table: s.table,
    angle: s.angle, fmt: s.fmt, ans: s.ans };
  try { store.set("calc", rec); s.dirty = false; }
  catch (e) {
    if (s.hist.length > 10) { s.hist.splice(0, s.hist.length >> 1); return calcSave(s); }
    s.note = "Not saved: " + e.message;
  }
}
function calcLoad(s) {
  let r = null;
  try { r = store.get("calc", null); } catch (_) {}
  if (!r || (r.v !== 1 && r.v !== 2)) return;   // version 1: deg instead of angle, graph as strings, one parameter p
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (Array.isArray(r.hist))
    s.hist = r.hist.filter((h) => h && typeof h.e === "string" && typeof h.r === "string").slice(-CALC_HIST)
      .map((h) => ({ e: h.e, r: h.r, ok: !!h.ok, v: num(h.v) && h.ok ? h.v : undefined, name: typeof h.name === "string" ? h.name : undefined }));
  if (r.vars && typeof r.vars === "object") for (const [k, v] of Object.entries(r.vars)) if (!calcBuiltin(k) && num(v)) s.vars[k] = v;
  if (r.funcs && typeof r.funcs === "object")
    for (const [k, f] of Object.entries(r.funcs)) {
      const ps = f && (Array.isArray(f.ps) ? f.ps : typeof f.p === "string" ? [f.p] : null);
      if (!calcBuiltin(k) && ps && ps.length && ps.length <= CALC_PARAMS && ps.every((x) => typeof x === "string") && typeof f.src === "string") s.funcs[k] = { ps, src: f.src };
    }
  for (const k of Object.keys(s.funcs)) {   // a stored function that no longer compiles is dropped
    try { calcUserFn(s, k); } catch (e) { delete s.funcs[k]; s.note = "Dropped " + k + ": " + e.message; }
  }
  const graphs = Array.isArray(r.graphs) ? r.graphs : Array.isArray(r.graph) ? r.graph.map((src) => ({ src, on: true })) : [];
  s.graphs = graphs.filter((g) => g && typeof g.src === "string").slice(0, CALC_GRAPHS).map((g) => ({ src: g.src, on: g.on !== false }));
  if (r.view && [r.view.x0, r.view.x1, r.view.y0, r.view.y1].every(num) && r.view.x1 > r.view.x0 && r.view.y1 > r.view.y0) s.view = r.view;
  if (r.tview && num(r.tview.t0) && num(r.tview.t1) && r.tview.t1 > r.tview.t0) s.tview = { t0: r.tview.t0, t1: r.tview.t1 };
  if (r.table && num(r.table.start) && num(r.table.step) && r.table.step > 0) s.table = { start: r.table.start, step: r.table.step };
  s.angle = calcHas(CALC_TURN, r.angle) ? r.angle : r.deg === true ? "deg" : "rad";
  const fm = r.fmt;
  if (fm && ["norm", "fix", "sci", "eng", "frac"].includes(fm.mode) && calcInt(fm.digits) && fm.digits >= 1 && fm.digits <= 15 && [10, 16, 2, 8].includes(fm.base))
    s.fmt = { mode: fm.mode, digits: fm.digits, base: fm.base };
  if (num(r.ans)) s.ans = r.ans;
}

function calcEnter(s) {
  const line = s.line.trim();
  if (!line) return;
  let entry;
  try { const res = calcRun(s, line); entry = { e: line, r: res.text, ok: true, v: res.v, name: res.name }; }
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
  return Object.keys(s.vars).sort().map((n) => ({ kind: "var", name: n, label: n, right: calcShow(s, s.vars[n]) }))
    .concat(Object.keys(s.funcs).sort().map((n) => ({ kind: "func", name: n, label: n + "(" + s.funcs[n].ps.join(", ") + ")", right: s.funcs[n].src })));
}

function namesKey(s, k, once) {
  const names = calcNames(s);
  if (k.key === "up") s.nsel = Math.max(0, s.nsel - 1);
  else if (k.key === "down") s.nsel = Math.min(Math.max(0, names.length - 1), s.nsel + 1);
  else if ((k.key === "del" || k.key === "backspace") && once && names[s.nsel]) {
    const n = names[s.nsel];
    if (n.kind === "var") delete s.vars[n.name]; else delete s.funcs[n.name];
    s.nsel = Math.min(s.nsel, Math.max(0, names.length - 2));
    calcChanged(s);
  } else if (k.key === "enter" && once && names[s.nsel]) { s.mode = "calc"; calcInsert(s, names[s.nsel].name + (names[s.nsel].kind === "func" ? "(" : "")); }
  else if ((k.key === "esc" || k.key === "f3") && once) s.mode = "calc";
}

// F4 modes, F7 table, F8 curves, F9 window: from the calculator and from the graph
function calcPageKey(s, k) {
  const page = { f4: "modes", f7: "table", f8: "curves", f9: "window" }[k.key];
  if (!page) return false;
  calcPage(s, page);
  return true;
}

function calcKey(s, k) {
  if (!k || k.state === "up") return;
  const once = k.state !== "hold";
  if (k.key === "f6") { if (once) helpF6(s); return; }
  if (s.mode === "help") return helpKey(s, k, once);
  if (s.mode === "modes") return modesKey(s, k, once);
  if (s.mode === "plot") {
    if (once && calcPageKey(s, k)) return;
    const changed = plotKey(s, k, once);
    if (changed && s.mode === "plot") { plotReset(s); plotSample(s); plotRun(s); }
    if (changed) calcChanged(s);
    return;
  }
  if (s.mode === "names") return namesKey(s, k, once);
  if (s.mode === "table") {
    if (k.key === "esc" && once) return calcBack(s);
    if (k.key === "f9" && once) return calcPage(s, "window");
    if (k.key === "f2" && once) return plotOpen(s, "");
    return tableKey(s, k, once);
  }
  if (s.mode === "window") return winKey(s, k, once);
  if (s.mode === "curves") return curvesKey(s, k, once);
  if (k.key !== "f5") s.clearArmed = false;
  if (once && calcPageKey(s, k)) return;
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
  const f = s.fmt, mode = f.mode === "norm" ? "" : " " + f.mode.toUpperCase() + (f.mode === "frac" ? "" : " " + f.digits);
  return s.angle.toUpperCase() + mode + (f.base !== 10 ? " " + { 16: "HEX", 2: "BIN", 8: "OCT" }[f.base] : "") + " · ans = " + calcShow(s, s.ans);
}

// ---- screens -------------------------------------------------------------------------------------------------
const calcNoteText = (s, fallback) => ui.text(s.note || fallback, { font: "s", color: s.note ? "accent" : "muted" });
function tableScreen(s) {
  const t = s.tab, cw = t.slots.length ? Math.floor(236 / t.slots.length) : 236;
  const cols = [{ label: "x", w: 68, align: "right" }].concat(t.slots.map((slot) => ({ label: "y" + (slot + 1), w: cw, align: "right" })));
  const rows = t.rows.map((r) => r.map((c, i) => (i ? { s: c, color: c === "error" || c === "none" ? "muted" : PLOT_COLORS[t.slots[i - 1]] } : c)));
  return ui.col({ gap: 4 },
    t.slots.length ? ui.table(cols, rows, { font: "s", lead: 6, grow: 1 })
      : ui.col({ grow: 1 }, ui.text("No function of x is on. F2 plots one; F8 lists the curves.", { font: "s", color: "muted", wrap: true })),
    calcNoteText(s, t.err || "from " + calcFormat(s.table.start, 6) + " in steps of " + calcFormat(s.table.step, 6)));
}
function winScreen(s) {
  const w = s.win, items = WIN_FIELDS.map(([label, key]) => ({ label, right: (key[0] === "t" && key.length === 2 && !s.tview ? "auto " : "") + calcFormat(winValue(s, key), 8), rightColor: "ink" }));
  return ui.col({ gap: 6 },
    ui.list(items, w.sel, { font: "s", lead: 6, grow: 1 }),
    w.edit !== null ? ui.input(w.edit, { prompt: WIN_FIELDS[w.sel][0] + " = ", font: "m" }) : ui.gap(0),
    calcNoteText(s, "t is for polar() and param(); Del resets"));
}
function curvesScreen(s) {
  const kinds = { fx: "y(x)", polar: "polar", param: "param" };
  const items = s.graphs.map((g, i) => ({ icon: g.on ? "✓" : "·", iconColor: PLOT_COLORS[i], label: (i + 1) + "  " + g.src, color: g.on ? PLOT_COLORS[i] : "muted",
    right: kinds[plotKind(g.src)], rightColor: "muted" }));
  return ui.col({ gap: 6 },
    items.length ? ui.list(items, s.csel, { font: "s", lead: 7, grow: 1 })
      : ui.col({ grow: 1 }, ui.text("No curves. Type sin(x), polar(1 + cos(t)) or param(cos(3t), sin(2t)), then F2.", { font: "s", color: "muted", wrap: true })),
    calcNoteText(s, s.graphs.length + " of " + CALC_GRAPHS + " curves"));
}
function calcScreen(s) {
  if (s.mode === "plot" && s.plot)
    return ui.col({ gap: 4 },
      ui.canvas(PLOT_W, PLOT_H, s.plot.ops.concat(plotTraceOps(s)), { bg: "#ffffff", border: "line" }),
      ui.text(plotStatus(s), { font: "s", color: s.note ? "accent" : "ink" }));
  if (s.mode === "help" && s.help) return helpScreen(s);
  if (s.mode === "modes") return modesScreen(s);
  if (s.mode === "table" && s.tab) return tableScreen(s);
  if (s.mode === "window" && s.win) return winScreen(s);
  if (s.mode === "curves") return curvesScreen(s);
  if (s.mode === "names") {
    const names = calcNames(s);
    return ui.col({ gap: 6 },
      ui.text("Variables and functions", { font: "m" }),
      names.length ? ui.list(names.map((n) => ({ label: n.label, right: n.right, rightColor: "ink" })), s.nsel, { font: "s", lead: 6, grow: 1 })
        : ui.text("None yet. Define one with r = 2.5 or f(x) = x^2 - 2.", { font: "s", color: "muted", wrap: true, grow: 1 }));
  }
  const items = (s.sel < 0 ? s.hist.slice(-12) : s.hist).map((h) => ({ label: h.e, right: calcEntryText(s, h), rightColor: h.ok ? "ink" : "accent" }));
  return ui.col({ gap: 4 },
    items.length ? ui.list(items, s.sel, { font: "s", lead: 6, grow: 1 })
      : ui.text("Type an expression and press Enter: 2pi r, sqrt(2), f(x) = x^2 - 2, then f(3). F2 plots a function of x.",
          { font: "s", color: "muted", wrap: true, grow: 1 }),
    ui.input(s.line, { cursor: s.cur, prompt: "▸ ", font: "m" }),
    ui.text(calcStatus(s), { font: "s", color: s.note ? "accent" : "muted" }));
}
function calcHints(s) {
  if (s.mode === "help" && s.help) {
    const p = helpPage(s);
    if (p.id === "home") return "↑↓ ⏎ open  letters find  Esc back";
    if (HELP_BY_ID[p.id].text) return "↑↓ PgUp PgDn scroll  F6 topics  Esc back";
    return p.id === "index" ? "type to find  ⏎ insert  ⌫  Esc back" : "↑↓ choose  ⏎ insert  F6 topics  Esc back";
  }
  if (s.mode === "modes") return "↑↓ choose  ←→ change  Esc back";
  if (s.mode === "plot") return s.trace ? "←→ ↑↓  r root n min x max i meet d m s" : "arrows +- 0 a ⏎ trace F6 help F7-F9";
  if (s.mode === "names") return "⏎ insert  Del remove  Esc back";
  if (s.mode === "table") return "↑↓ PgUp PgDn scroll  F9 window  Esc back";
  if (s.mode === "window") return s.win && s.win.edit !== null ? "⏎ set  Esc cancel" : "↑↓ choose  ⏎ edit  Del reset  Esc back";
  if (s.mode === "curves") return "space on/off ⏎ edit Del remove F2 graph";
  return s.sel >= 0 ? "⏎ edit  Tab result  Esc back" : "F2 graph F3 vars F4 modes F6 help F7-F9";
}

app("calc")
  .title("Calc")
  .state({ line: "", cur: 0, sel: -1, hist: [], vars: {}, funcs: {}, ans: 0, angle: "rad", fmt: { mode: "norm", digits: 10, base: 10 },
           note: "", mode: "calc", back: "calc", nsel: 0, csel: 0, clearArmed: false, graphs: [], view: Object.assign({}, PLOT_VIEW),
           tview: null, table: { start: -5, step: 1 }, tab: null, win: null, mark: null, shade: null, plot: null, trace: null, help: null, msel: 0,
           dirty: false, saving: false, plotting: false, focused: false })
  .onStart((s) => { calcLoad(s); })
  .on("key", (s, k, msg) => { if (msg.from === "compositor") calcKey(s, k); })
  .on("focus", (s) => { s.focused = true; if (s.mode === "plot") plotRun(s); })
  .on("blur", (s) => { s.focused = false; calcSave(s); })
  .screen(calcScreen)
  .hints(calcHints);
