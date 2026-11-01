// The calculator: a scientific calculator with a history, functions of several variables, calculus and a solver,
// and a plotter for functions, polar and parametric curves. A line is parsed once into a tree (a Pratt parser) and
// compiled into closures, so the plotter can evaluate the same expression for three hundred values without parsing
// again. Every name a closure binds (a function's parameters, the t of integ(..., t, ...), the plot's x) is a cell,
// an object { v }, set by whoever binds it. A plot is sampled a slice of columns at a time, sized so that no turn
// runs long on the device even with Wi-Fi up. Sampling and saving run as detached promise chains (sleep, then
// work), never as a handler's returned promise: that would hold the turn open and keep keys from arriving.
const CALC_HIST = 100, CALC_FUNCS = 16, CALC_DEPTH = 32, CALC_PARAMS = 4, CALC_GRAPHS = 4;
const CALC_FUEL = 200000;   // closure nodes one line may evaluate in loops and calls; calibrated on the P4
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
function calcIsPrime(n) {
  if (!calcInt(n) || n > 1e10) return NaN;
  if (n < 2) return 0;
  if (n < 4) return 1;
  if (n % 2 === 0 || n % 3 === 0) return 0;
  for (let i = 5; i * i <= n; i += 6) if (n % i === 0 || n % (i + 2) === 0) return 0;
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
let calcDepth = 0, calcFuel = CALC_FUEL;
const calcCache = new Map();   // "params|source" -> { body, cells } of user functions
// Loops (calculus, sums) and user-function calls burn fuel by the nodes they evaluate; a step that runs out stops.
function calcBurn(n) { if ((calcFuel -= n) < 0) throw new Error("too much work for one step"); }
function calcFresh() { calcDepth = 0; calcFuel = CALC_FUEL; }

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
  const key = def.ps.join(",") + "|" + def.src;
  let u = calcCache.get(key);
  if (!u) {
    const cells = def.ps.map(() => ({ v: 0 }));
    const body = calcCompile(calcParse(def.src, (n) => !def.ps.includes(n) && calcIsFunc(s, n)).tree,
      { s, scope: new Map(def.ps.map((p, i) => [p, cells[i]])) });
    u = { body, cells };
    calcCache.set(key, u);
  }
  return u;
}
function calcCallUser(s, name, vals) {
  if (calcDepth >= CALC_DEPTH) throw new Error("too deep: does " + name + " call itself?");
  const u = calcUserFn(s, name);
  calcBurn(u.body.size);
  const old = u.cells.map((c) => c.v);
  calcDepth++;
  try { u.cells.forEach((c, i) => { c.v = vals[i]; }); return u.body(); }
  finally { calcDepth--; u.cells.forEach((c, i) => { c.v = old[i]; }); }
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
function calcInteg(f, [a, b]) {
  calcReal(a, "the lower limit"); calcReal(b, "the upper limit");
  if (a === b) return 0;
  const parts = [[a, b, ...calcGK(f, a, b)]];
  for (let n = 1; n < 30; n++) {
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
let plotFns = [];   // compiled curves, parallel to s.plot.curves (functions do not belong in the state)

const plotX = (v, c) => v.x0 + c * (v.x1 - v.x0) / (PLOT_W - 1);
const plotPy = (v, y) => (v.y1 - y) * (PLOT_H - 1) / (v.y1 - v.y0);
const plotPx = (v, x) => (x - v.x0) * (PLOT_W - 1) / (v.x1 - v.x0);

function plotCompile(s, src) {
  const st = calcParse(src, (n) => n !== "x" && calcIsFunc(s, n));
  if (st.kind !== "expr") throw new Error("plot an expression in x, like sin(x)");
  const cell = { v: 0 }, body = calcCompile(st.tree, { s, scope: new Map([["x", cell]]) });
  const f = (x) => { cell.v = x; return body(); };
  f.size = body.size;
  return f;
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
  s.plot = { curves, col: 0, max, slice: Math.min(max, 32), grid: plotGrid(s.view), ops: [], ms: 0, t0: now(), slices: 0, worst: 0 };
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
      try { calcFresh(); y = f(x); } catch (e) { if (!p.curves[k].err) p.curves[k].err = e.message; }
      p.curves[k].ys[c] = typeof y === "number" && Number.isFinite(y) ? y : null;
    }
  }
  p.col = end;
  // on the device now() is wall-clock time and the slice follows the real speed; on the host it does not move
  const ms = now() - t0;
  p.ms = ms; p.slices++; p.worst = Math.max(p.worst, ms);
  if (end === PLOT_W) log("plot of " + p.curves.length + " curve(s), " + plotFns.reduce((n, f) => n + (f ? f.size : 0), 0) + " nodes: " +
    Math.round(now() - p.t0) + " ms in " + p.slices +  " slices (slowest " + p.worst.toFixed(1) + " ms), slice now " + p.slice + " columns");
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
  const rec = { v: 2, hist: s.hist, vars: s.vars, funcs: s.funcs, graph: s.graph, view: s.view, angle: s.angle, fmt: s.fmt, ans: s.ans };
  try { store.set("calc", rec); s.dirty = false; }
  catch (e) {
    if (s.hist.length > 10) { s.hist.splice(0, s.hist.length >> 1); return calcSave(s); }
    s.note = "Not saved: " + e.message;
  }
}
function calcLoad(s) {
  let r = null;
  try { r = store.get("calc", null); } catch (_) {}
  if (!r || (r.v !== 1 && r.v !== 2)) return;   // version 1: deg instead of angle, one parameter p per function
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
  if (Array.isArray(r.graph)) s.graph = r.graph.filter((g) => typeof g === "string").slice(0, CALC_GRAPHS);
  if (r.view && [r.view.x0, r.view.x1, r.view.y0, r.view.y1].every(num) && r.view.x1 > r.view.x0 && r.view.y1 > r.view.y0) s.view = r.view;
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
  return Object.keys(s.vars).sort().map((n) => ({ kind: "var", name: n, label: n, right: calcFormat(s.vars[n]) }))
    .concat(Object.keys(s.funcs).sort().map((n) => ({ kind: "func", name: n, label: n + "(" + s.funcs[n].ps.join(", ") + ")", right: s.funcs[n].src })));
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
    case "f4":
      if (once) { s.angle = { rad: "deg", deg: "grad", grad: "rad" }[s.angle]; s.note = { rad: "Radians", deg: "Degrees", grad: "Gradians" }[s.angle]; calcChanged(s); }
      return;
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
  return s.angle.toUpperCase() + " · ans = " + calcShow(s, s.ans);
}

app("calc")
  .title("Calc")
  .state({ line: "", cur: 0, sel: -1, hist: [], vars: {}, funcs: {}, ans: 0, angle: "rad", fmt: { mode: "norm", digits: 10, base: 10 },
           note: "", mode: "calc", nsel: 0,
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
    const items = (s.sel < 0 ? s.hist.slice(-12) : s.hist).map((h) => ({ label: h.e, right: calcEntryText(s, h), rightColor: h.ok ? "ink" : "accent" }));
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
