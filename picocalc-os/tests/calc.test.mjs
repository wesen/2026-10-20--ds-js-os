import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/apps/calc.js", import.meta.url), "utf8");
const plain = (x) => JSON.parse(JSON.stringify(x));   // values made in the VM have the VM's prototypes

// The calculator in a VM with a fake builder, store, clock and sleep. Timers fire only when the test says so.
function setup(saved = null) {
  const def = { handlers: {} }, stored = { calc: saved }, timers = [];
  let clock = 0, cost = 0;
  const builder = {
    title() { return this; }, state(v) { def.state = v; return this; }, onStart(fn) { def.start = fn; return this; },
    on(name, fn) { def.handlers[name] = fn; return this; }, screen(fn) { def.screen = fn; return this; }, hints(fn) { def.hints = fn; return this; },
  };
  const context = vm.createContext({ app: () => builder, Date, Math, log: () => {},
    now: () => { clock += cost; return clock; },
    sleep: (ms) => new Promise((resolve) => timers.push({ at: clock + ms, resolve })),
    store: { get: (k, d) => (stored[k] == null ? d : JSON.parse(JSON.stringify(stored[k]))), set: (k, v) => { stored[k] = JSON.parse(JSON.stringify(v)); } },
    ui: {
      col: (o, ...kids) => ({ t: "col", ...o, kids }), text: (s, o) => ({ t: "text", s, ...o }), list: (items, sel, o) => ({ t: "list", items, sel, ...o }),
      input: (value, o) => ({ t: "input", value, ...o }), canvas: (w, h, ops, o) => ({ t: "canvas", w, h, ops, ...o }),
    },
  });
  vm.runInContext(source, context);
  const s = JSON.parse(JSON.stringify(def.state));
  def.start(s);
  def.handlers.focus(s);
  const key = (name, ch = "", state = "down") => def.handlers.key(s, { key: name, ch, state }, { from: "compositor" });
  const type = (text) => { for (const c of text) key(c === " " ? "space" : c, c); };
  const run = (line) => { s.line = ""; s.cur = 0; type(line); key("enter"); return plain(s.hist.at(-1)); };
  // advance the fake clock, firing due timers and letting their continuations run
  const advance = async (ms) => {
    const until = clock + ms;
    for (;;) {
      await new Promise((r) => setImmediate(r));
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > until) break;
      const t = timers.shift(); clock = Math.max(clock, t.at); t.resolve();
    }
    clock = until;
    await new Promise((r) => setImmediate(r));
  };
  const fn = (name) => vm.runInContext(name, context);
  return { s, def, key, type, run, advance, fn, stored, setCost: (c) => { cost = c; } };
}
const value = (h, line) => { const r = h.run(line); assert.equal(r.ok, true, line + " -> " + r.r); return r.r; };

test("precedence, associativity, unary minus and implicit multiplication", () => {
  const h = setup();
  const cases = {
    "1 - 2 - 3": "= -4", "2 + 3 * 4": "= 14", "2^3^2": "= 512", "-2^2": "= -4", "2^-1": "= 0.5", "(-2)^2": "= 4",
    "7 % 3": "= 1", "3!": "= 6", "3!^2": "= 36", "2pi": "= 6.28318530718", "3(1+1)": "= 6", "(1+2)(3+4)": "= 21",
    "1/2pi": "= 1.57079632679", "2sin(pi/2)": "= 2", "0x1F + 0b101": "= 36", "2e3": "= 2000", "2e": "= 5.43656365692",
    ".5 + 1.": "= 1.5", "0.1 + 0.2": "= 0.3", "2/3": "= 0.666666666667",
  };
  for (const [line, want] of Object.entries(cases)) assert.equal(value(h, line), want, line);
});

test("functions, constants, ans and degree mode", () => {
  const h = setup();
  const cases = {
    "sqrt(2)": "= 1.41421356237", "cbrt(27)": "= 3", "abs(-3)": "= 3", "floor(-2.5)": "= -3", "round(2.5)": "= 3",
    "ln(e)": "= 1", "log(1000)": "= 3", "log2(1024)": "= 10", "exp(0)": "= 1", "fact(5)": "= 120", "nCr(5, 2)": "= 10",
    "nPr(5, 2)": "= 20", "gcd(12, 18)": "= 6", "lcm(4, 6)": "= 12", "mod(-1, 3)": "= 2", "min(3, 1, 2)": "= 1",
    "max(3, 1, 2)": "= 3", "hypot(3, 4)": "= 5", "atan2(1, 1)": "= 0.785398163397", "pow(2, 10)": "= 1024",
    "tau / 2": "= 3.14159265359", "deg(pi)": "= 180", "rad(180)": "= 3.14159265359",
  };
  for (const [line, want] of Object.entries(cases)) assert.equal(value(h, line), want, line);
  value(h, "6 * 7");
  assert.equal(value(h, "ans + 1"), "= 43");
  h.key("f4");
  assert.equal(value(h, "sin(30)"), "= 0.5");
  assert.equal(value(h, "asin(1)"), "= 90");
  h.key("f4");                                    // gradians: a right angle is 100
  assert.equal(value(h, "sin(100)"), "= 1");
  assert.equal(value(h, "acos(0)"), "= 100");
  h.key("f4");
  assert.equal(value(h, "sin(pi/6)"), "= 0.5");
});

test("variables and functions of one argument", () => {
  const h = setup();
  assert.equal(value(h, "r = 2.5"), "r = 2.5");
  assert.equal(value(h, "pi r^2"), "= 19.6349540849");
  assert.equal(value(h, "f(x) = x^2 - 2"), "f(x) defined");
  assert.equal(value(h, "f(3)"), "= 7");
  assert.equal(value(h, "2f(r)"), "= 8.5");
  assert.equal(value(h, "g(t) = r t"), "g(t) defined");
  value(h, "r = 4");
  assert.equal(value(h, "g(2)"), "= 8");   // g follows r
  assert.equal(value(h, "x(t) = t(1+t)"), "x(t) defined");   // a parameter before ( multiplies
  assert.equal(value(h, "x(2)"), "= 6");
  // a(x) = b(x), b(x) = a(x): indirect recursion is stopped, not a crash
  value(h, "a(x) = x");
  value(h, "b(x) = a(x)");
  value(h, "a(x) = b(x)");
  const r = h.run("a(1)");
  assert.equal(r.ok, false); assert.match(r.r, /too deep/);
});

test("errors say what is wrong and keep the line", () => {
  const h = setup();
  const cases = {
    "2 + * 3": /\* needs a number before it/, "sin 30": /sin needs parentheses/, "q + 1": /unknown name q/,
    "(1 + 2": /missing \)/, "pi = 3": /pi is built in/, "1/0": /infinite/, "sqrt(-1)": /not a real number/,
    "2 3": /unexpected 3/, "sin(1, 2)": /sin takes 1 argument/, "f(x) = q x": /unknown name q/, "1 +": /ends too soon/,
    "1 $ 2": /unexpected \$/, "max()": /at least one/,
  };
  for (const [line, re] of Object.entries(cases)) {
    const r = h.run(line);
    assert.equal(r.ok, false, line); assert.match(r.r, re, line);
    assert.equal(h.s.line, line); assert.match(h.s.note, re);
  }
});

test("number formatting", () => {
  const h = setup(), fmt = h.fn("calcFormat");
  assert.equal(fmt(12), "12"); assert.equal(fmt(-0), "0"); assert.equal(fmt(1099511627776), "1099511627776");
  assert.equal(fmt(6.02214076e23), "6.02214076e23"); assert.equal(fmt(1.6e-19), "1.6e-19"); assert.equal(fmt(1e-7), "1e-7");
  assert.equal(fmt(123456.789), "123456.789"); assert.equal(fmt(1e15), "1e15"); assert.equal(fmt(2.5, 4), "2.5");
  assert.equal(fmt(12345, 4), "1.235e4"); assert.equal(fmt(NaN), "not a number"); assert.equal(fmt(-Infinity), "-infinite");
});

test("history: recall with Enter, insert a result with Tab, continue from ans, clear with two F5", () => {
  const h = setup();
  value(h, "6 * 7"); value(h, "1 + 1");
  h.key("up"); h.key("up");
  assert.equal(h.s.sel, 0);
  h.key("tab");
  assert.equal(h.s.line, "42"); assert.equal(h.s.sel, -1);
  h.key("esc");
  h.key("up"); h.key("enter");
  assert.equal(h.s.line, "1 + 1"); assert.equal(h.s.sel, -1);
  h.key("esc"); h.type("*3"); h.key("enter");
  assert.deepEqual(plain(h.s.hist.at(-1)).e, "ans*3"); assert.equal(h.s.hist.at(-1).r, "= 6");
  h.type("-1"); assert.equal(h.s.line, "-1");   // a leading minus starts a negative number
  h.key("esc"); h.key("f5"); assert.equal(h.s.hist.length, 3);
  h.key("f5"); assert.equal(h.s.hist.length, 0);
  for (let i = 0; i < 105; i++) h.run(String(i));
  assert.equal(h.s.hist.length, 100); assert.equal(h.s.hist[0].e, "5");
});

test("names view lists and removes variables and functions", () => {
  const h = setup();
  value(h, "r = 2"); value(h, "f(x) = x + r");
  h.key("f3");
  const shot = plain(h.def.screen(h.s));
  assert.deepEqual(shot.kids[1].items.map((i) => [i.label, i.right]), [["r", "2"], ["f(x)", "x + r"]]);
  h.key("down"); h.key("del");
  assert.deepEqual(Object.keys(h.s.funcs), []);
  h.key("esc"); assert.equal(h.s.mode, "calc");
});

test("state is saved 3 seconds after a change and on blur, and restored", async () => {
  const h = setup();
  value(h, "r = 3"); value(h, "f(x) = r x"); h.key("f4");
  assert.equal(h.stored.calc, null);
  await h.advance(3000);
  assert.equal(h.stored.calc.vars.r, 3); assert.equal(h.stored.calc.angle, "deg");
  value(h, "f(2)");
  h.def.handlers.blur(h.s);
  assert.equal(h.stored.calc.hist.length, 3);
  const again = setup(h.stored.calc);
  assert.equal(again.s.angle, "deg"); assert.equal(value(again, "f(2)"), "= 6"); assert.equal(again.s.hist.length, 4);
  const broken = setup({ ...h.stored.calc, funcs: { f: { p: "x", src: "x +" } } });
  assert.match(broken.s.note, /Dropped f/);
});

test("plot: sampling in slices, gaps for undefined values, breaks at asymptotes", async () => {
  const h = setup();
  h.type("tan(x)"); h.key("f2");
  assert.equal(h.s.mode, "plot"); assert.deepEqual(plain(h.s.graph), ["tan(x)"]);
  const p = h.s.plot;
  assert.equal(p.col, 32);   // the first slice is computed at once
  await h.advance(2000);
  assert.equal(p.col, 306);
  // tan(x) on [-10, 10] has asymptotes at odd multiples of pi/2: seven of them, so eight pieces
  const polys = p.ops.filter((o) => o[0] === "poly");
  assert.ok(polys.length >= 7 && polys.length <= 9, "pieces: " + polys.length);
  for (const [, pts] of polys) for (let i = 1; i < pts.length; i += 2) assert.ok(pts[i] >= 0 && pts[i] <= 229);
  h.key("esc"); h.s.line = ""; h.type("sqrt(x)"); h.key("f2");
  await h.advance(2000);
  const sq = h.s.plot.curves[0].ys;
  assert.equal(sq[0], null); assert.equal(sq[152], null); assert.ok(sq[160] > 0);
  assert.deepEqual(plain(h.s.graph), ["sqrt(x)", "tan(x)"]);
});

test("plot: slices shrink when sampling is slow and grow when it is fast", async () => {
  const h = setup();
  h.setCost(15);   // every now() call moves the clock: a slice measures as 15 ms... then 30 ms with two calls
  h.type("x^2"); h.key("f2");
  const before = h.s.plot.slice;
  h.setCost(25); await h.advance(30);
  assert.ok(h.s.plot.slice < before, "slow: " + before + " -> " + h.s.plot.slice);
  h.setCost(0); await h.advance(300);
  assert.ok(h.s.plot.slice > 8);
});

test("plot keys: pan, zoom, reset, fit, trace and remove", async () => {
  const h = setup();
  value(h, "f(x) = x^2");
  h.type("f"); h.key("f2");
  assert.deepEqual(plain(h.s.graph), ["f(x)"]);
  await h.advance(2000);
  h.key("right"); assert.deepEqual(plain(h.s.view), { x0: -5, x1: 15, y0: -7.5, y1: 7.5 });
  h.key("+", "+"); assert.deepEqual(plain(h.s.view), { x0: 0, x1: 10, y0: -3.75, y1: 3.75 });
  h.key("0", "0"); assert.deepEqual(plain(h.s.view), { x0: -10, x1: 10, y0: -7.5, y1: 7.5 });
  await h.advance(2000);
  h.key("a", "a");
  assert.ok(h.s.view.y1 > 100 && h.s.view.y0 < 0);
  await h.advance(2000);
  h.key("enter");
  assert.deepEqual(plain(h.s.trace), { c: 153, k: 0 });
  h.key("right"); h.key("pgdn");
  assert.match(h.fn("plotStatus")(h.s), /^1: x = /);
  h.key("esc"); assert.equal(h.s.trace, null); assert.equal(h.s.mode, "plot");
  h.key("del"); assert.equal(h.s.mode, "calc"); assert.deepEqual(plain(h.s.graph), []);
});

test("plot: clipping and tick steps", () => {
  const h = setup(), clip = h.fn("plotClip"), step = h.fn("plotStep");
  assert.deepEqual(plain(clip(0, -10, 1, 10)), [1, 0, 1, 10]);
  assert.deepEqual(plain(clip(0, 220, 2, 240)), [0, 220, 1, 229]);
  assert.equal(clip(0, -5, 1, -1), null);
  assert.equal(step(20), 5); assert.equal(step(15), 2); assert.equal(step(0.3), 0.05); assert.equal(step(1000), 200);
  const g = plain(h.fn("plotGrid")({ x0: -10, x1: 10, y0: -7.5, y1: 7.5 }));
  assert.ok(g.some((o) => o[0] === "text" && o[3] === "5"));
  assert.ok(g.filter((o) => o[5] === "muted" && o[0] === "line").length === 2);
});

test("keys from anyone but the compositor are ignored", () => {
  const h = setup();
  h.def.handlers.key(h.s, { key: "1", ch: "1", state: "down" }, { from: "sandbox" });
  assert.equal(h.s.line, "");
});

// ---- PICOCALC-SCI: the scientific engine ---------------------------------------------------------------------
test("sci: more functions, statistics, constants", () => {
  const h = setup();
  const cases = {
    "sec(0)": "= 1", "cot(pi/4)": "= 1", "csc(pi/2)": "= 1", "acot(1)": "= 0.785398163397", "asinh(sinh(2))": "= 2",
    "atanh(0.5)": "= 0.549306144334", "log(8, 2)": "= 3", "root(-8, 3)": "= -2", "root(16, 4)": "= 2", "gamma(5)": "= 24",
    "gamma(0.5)^2": "= 3.14159265359", "round(2.345, 2)": "= 2.35", "frac(-2.5)": "= -0.5", "isprime(97)": "= 1",
    "isprime(91)": "= 0", "sum(1, 2, 3)": "= 6", "mean(2, 4, 9)": "= 5", "median(3, 1, 2)": "= 2", "median(1, 2, 3, 4)": "= 2.5",
    "var(2, 4, 4, 4, 5, 5, 7, 9)": "= 4.57142857143", "sd(2, 4, 4, 4, 5, 5, 7, 9)": "= 2.1380899353", "randint(3, 3)": "= 3",
    "c0": "= 299792458", "NA": "= 6.02214076e23", "hbar / hP * tau": "= 1", "0o17": "= 15",
  };
  for (const [line, want] of Object.entries(cases)) assert.equal(value(h, line), want, line);
  const r = h.run("rand()");
  assert.equal(r.ok, true); assert.ok(h.s.ans >= 0 && h.s.ans < 1);
  assert.match(h.run("me = 2").r, /me is built in/);
});

test("sci: comparisons, if, recursion and the work limit", () => {
  const h = setup();
  const cases = { "3 > 2": "= 1", "2 == 2": "= 1", "1 != 1": "= 0", "1 + 1 < 3": "= 1", "2 <= 1": "= 0", "if(2 > 1, 10, 20)": "= 10",
    "if(0, 1/0, 5)": "= 5" };
    for (const [line, want] of Object.entries(cases)) assert.equal(value(h, line), want, line);
  assert.equal(value(h, "fact2(n) = if(n < 2, 1, n fact2(n - 1))"), "fact2(n) defined");
  assert.equal(value(h, "fact2(10)"), "= 3628800");
  value(h, "fib(n) = if(n < 2, n, fib(n - 1) + fib(n - 2))");
  assert.equal(value(h, "fib(15)"), "= 610");
  assert.match(h.run("fib(30)").r, /too much work/);
  assert.match(h.run("fact2(40)").r, /too deep/);
});

test("sci: functions of several variables", () => {
  const h = setup();
  assert.equal(value(h, "f(x, y) = x^2 + y^2"), "f(x, y) defined");
  assert.equal(value(h, "f(3, 4)"), "= 25");
  assert.equal(value(h, "g(a, b, c) = a b + c"), "g(a, b, c) defined");
  assert.equal(value(h, "g(2, 3, f(1, 1))"), "= 8");
  assert.match(h.run("f(1)").r, /f takes 2 arguments/);
  assert.match(h.run("k(x, x) = 1").r, /its own name/);
  assert.match(h.run("k(a, b, c, d, e2) = 1").r, /at most 4/);
  h.key("f3");
  assert.deepEqual(plain(h.def.screen(h.s)).kids[1].items.map((i) => i.label), ["f(x, y)", "g(a, b, c)"]);
});

test("sci: calculus and solving", () => {
  const h = setup();
  const cases = {
    "deriv(x^3, x, 2)": "= 12", "deriv(sin(x), x, 0)": "= 1", "integ(x^2, x, 0, 3)": "= 9", "integ(sin(x), x, 0, pi)": "= 2",
    "integ(1/x, x, 1, e)": "= 1", "integ(x, x, 2, 2)": "= 0", "integ(x, x, 1, 0)": "= -0.5",
    "solve(x^2 - 2, x, 1)": "= 1.41421356237", "solve(cos(x) - x, x, 0, 1)": "= 0.739085133215", "solve(x^3 - 8, x, 100)": "= 2",
    "sigma(k^2, k, 1, 10)": "= 385", "prod(k, k, 1, 5)": "= 120", "sigma(k, k, 5, 1)": "= 0",
    "integ(integ(x y, y, 0, 1), x, 0, 1)": "= 0.25",
  };
  for (const [line, want] of Object.entries(cases)) assert.equal(value(h, line), want, line);
  value(h, "F(x) = integ(t^2, t, 0, x)");
  assert.equal(value(h, "F(3)"), "= 9");
  assert.equal(value(h, "deriv(F(x), x, 2)"), "= 4");
  const errors = {
    "solve(x^2 + 1, x, 0)": /no solution found near 0/, "solve(tan(x), x, 1, 2)": /a pole/, "solve(x, x, 1, 2)": /no sign change/,
    "sigma(k, k, 1, 20000)": /at most 10000 terms/, "sigma(k, k, 0.5, 3)": /whole numbers/, "integ(x^2, pi, 0, 1)": /pi cannot be the name integ varies/,
    "deriv(x^2, 2, 1)": /the name it varies/, "integ(x, x, 0)": /integ takes 4 arguments/,
    "sigma(sigma(k j, k, 1, 1000), j, 1, 1000)": /too much work/, "polar(1)": /draws a curve/,
  };
  for (const [line, re] of Object.entries(errors)) assert.match(h.run(line).r, re, line);
});

test("sci: display formats and integer bases, applied to the whole history", () => {
  const h = setup(), show = (fmt, v) => { h.s.fmt = fmt; return h.fn("calcShow")(h.s, v); };
  const n = (mode, digits = 4, base = 10) => ({ mode, digits, base });
  assert.equal(show(n("fix", 2), 1234.5678), "1234.57");
  assert.equal(show(n("fix", 2), 0.000123), "0.00");
  assert.equal(show(n("sci"), 1234.5678), "1.235e3");
  assert.equal(show(n("sci"), 0.000123), "1.230e-4");
  assert.equal(show(n("eng"), 1234.5678), "1.235e3");
  assert.equal(show(n("eng"), 0.000123), "123.0e-6");
  assert.equal(show(n("eng"), 999999), "1.000e6");
  assert.equal(show(n("frac"), 0.75), "3/4");
  assert.equal(show(n("frac"), -1 / 3), "-1/3");
  assert.equal(show(n("frac"), Math.PI), "3.14159265359");
  assert.equal(show(n("norm", 4, 16), 255), "0xFF");
  assert.equal(show(n("norm", 4, 16), -10), "-0xA");
  assert.equal(show(n("norm", 4, 2), 5), "0b101");
  assert.equal(show(n("norm", 4, 8), 8), "0o10");
  assert.equal(show(n("norm", 4, 16), 2.5), "2.5");
  h.s.fmt = n("norm", 10, 10);
  value(h, "0.75"); value(h, "w = 0.5");
  h.s.fmt = n("frac", 10, 10);
  const right = plain(h.def.screen(h.s)).kids[0].items.map((i) => i.right);
  assert.deepEqual(right.slice(-2), ["= 3/4", "w = 1/2"]);
});

test("sci: a version 1 record is migrated", () => {
  const h = setup({ v: 1, hist: [{ e: "1+1", r: "= 2", ok: true, v: 2 }], vars: { r: 2 }, funcs: { f: { p: "x", src: "x^2 + r" } },
    graph: ["sin(x)"], view: { x0: -1, x1: 1, y0: -1, y1: 1 }, deg: true, ans: 2 });
  assert.equal(h.s.angle, "deg");
  assert.equal(value(h, "f(3)"), "= 11");
  assert.deepEqual(plain(h.s.funcs.f), { ps: ["x"], src: "x^2 + r" });
  assert.equal(value(h, "sin(90)"), "= 1");
});
