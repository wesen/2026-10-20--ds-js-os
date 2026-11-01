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
  const context = vm.createContext({ app: () => builder, Date, Math,
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
  assert.equal(h.stored.calc.vars.r, 3); assert.equal(h.stored.calc.deg, true);
  value(h, "f(2)");
  h.def.handlers.blur(h.s);
  assert.equal(h.stored.calc.hist.length, 3);
  const again = setup(h.stored.calc);
  assert.equal(again.s.deg, true); assert.equal(value(again, "f(2)"), "= 6"); assert.equal(again.s.hist.length, 4);
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
