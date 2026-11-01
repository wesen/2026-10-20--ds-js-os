// Local times in these tests are New York's, as on the device with tz EST5EDT,M3.2.0,M11.1.0. Daylight saving time
// ends on Sunday 1 November 2026 at 2:00, the "today" of most tests.
process.env.TZ = "America/New_York";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/apps/agenda.js", import.meta.url), "utf8");
const plain = (x) => JSON.parse(JSON.stringify(x));
const NY = (y, m, d, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm).getTime();   // a New York local time

// The agenda in a VM with a fake notes folder, wall clock, store, compositor and editor.
async function setup({ text = "", wall = NY(2026, 11, 1, 9, 41), stored = {} } = {}) {
  const def = { handlers: {}, every: [] }, sent = [], asks = [], files = new Map([["todo.txt", text]]), handles = [];
  let vnow = 0;
  const clockState = { wall };
  const child = () => { const h = { revoked: 0, released: 0, revoke() { h.revoked++; }, release() { h.released++; } }; handles.push(h); return h; };
  const dir = {
    read: async (n) => { if (!files.has(n)) throw new Error("no file notes/" + n); return files.get(n); },
    write: async (n, t) => { files.set(n, t); return { bytes: t.length }; },
    at: () => child(),
  };
  const builder = {
    title() { return this; }, key() { return this; }, about() { return this; }, icon() { return this; },
    state(v) { def.state = v; return this; }, onStart(fn) { def.start = fn; return this; },
    on(name, fn) { def.handlers[name] = fn; return this; }, every(ms, fn) { def.every.push(fn); return this; },
    screen(fn) { def.screen = fn; return this; }, hints(fn) { def.hints = fn; return this; },
  };
  const context = vm.createContext({ app: () => builder, Date, now: () => vnow,
    clock: { wall: () => clockState.wall, set: () => clockState.wall != null, zone: () => "EST5EDT,M3.2.0,M11.1.0" },
    hw: { fs: (claim) => { assert.equal(claim, "fs:/notes"); return dir; } },
    store: { get: (k, d) => (k in stored ? JSON.parse(JSON.stringify(stored[k])) : d), set: (k, v) => { stored[k] = JSON.parse(JSON.stringify(v)); } },
    send: (to, type, payload) => sent.push(plain({ to, type, payload })),
    ask: async (to, type, payload) => { asks.push({ to, type, payload }); return { ok: true }; },
    ui: {
      col: (o, ...kids) => ({ t: "col", ...o, kids }), text: (s, o) => ({ t: "text", s, ...o }), list: (items, sel, o) => ({ t: "list", items, sel, ...o }),
      input: (value, o) => ({ t: "input", value, ...o }), gap: (h) => ({ t: "gap", h }),
    },
  });
  vm.runInContext(source, context);
  const s = JSON.parse(JSON.stringify(def.state));
  await def.start(s);
  const key = (name, ch = "") => def.handlers.key(s, { key: name, ch, state: "down" }, { from: "compositor" });
  const type = async (t) => { for (const c of t) await key(c === " " ? "space" : c, c); };
  const tick = (ms = 15000) => { vnow += ms; for (const f of def.every) f(s); };
  const rows = () => plain(s.rows).map((r) => (r.header ? "# " + r.header : (r.task.done ? "x " : "o ") + (r.task.time ? r.task.time + " " : "") + r.task.title));
  const fn = (name) => vm.runInContext(name, context);
  const settle = () => new Promise((r) => setImmediate(r));
  return { s, def, key, type, tick, rows, fn, files, sent, asks, handles, stored, clockState, settle };
}

test("lines: tasks, plain items, dates, times and reminders; other lines are not tasks", async () => {
  const h = await setup(), parse = (l) => plain(h.fn("agParse")(l));
  assert.deepEqual(parse("- [ ] dentist @2026-11-03 14:30 !15m"),
    { line: "- [ ] dentist @2026-11-03 14:30 !15m", done: false, title: "dentist", date: "2026-11-03", time: "14:30", lead: 15, leadText: "!15m" });
  assert.equal(parse("- [x] charge the PicoCalc").done, true);
  assert.deepEqual([parse("- write the editor").title, parse("- write the editor").done], ["write the editor", false]);
  assert.equal(parse("  - [ ] call @2026-11-02 the plumber").title, "call the plumber");
  assert.equal(parse("- [ ] x @2026-02-30").date, null);   // no such day
  assert.equal(parse("- [ ] y !2h").lead, 120);
  assert.equal(parse("# Todo"), null); assert.equal(parse("free text"), null); assert.equal(parse(""), null);
  assert.equal(h.fn("agToggled")("- write"), "- [x] write");
  assert.equal(h.fn("agToggled")("  - [X] done"), "  - [ ] done");
});

test("date expressions on Sunday 1 November 2026, at month and year ends, and errors", async () => {
  const h = await setup(), ex = h.fn("agExpand"), day = (y, m, d) => ({ y, m, d });
  const today = day(2026, 11, 1);
  const cases = {
    "a @today": "a @2026-11-01", "a @tom": "a @2026-11-02", "a @tue": "a @2026-11-03", "a @sun": "a @2026-11-08",
    "a @sunday 9": "a @2026-11-08 09:00", "a @+3d": "a @2026-11-04", "a @+2w": "a @2026-11-15", "a @11-15": "a @2026-11-15",
    "a @10-31": "a @2027-10-31", "a @2026-12-24 2pm": "a @2026-12-24 14:00", "a @tue 9:15am !15m": "a @2026-11-03 09:15 !15m",
    "a @today 12am": "a @2026-11-01 00:00", "a @today 12pm": "a @2026-11-01 12:00", "plain words": "plain words",
  };
  for (const [input, want] of Object.entries(cases)) assert.equal(ex(input, today), want, input);
  assert.equal(ex("a @+1d", day(2026, 1, 31)), "a @2026-02-01");
  assert.equal(ex("a @tom", day(2026, 12, 31)), "a @2027-01-01");
  assert.equal(ex("a @01-05", day(2026, 12, 31)), "a @2027-01-05");
  assert.equal(ex("a @2026-11-03", null), "a @2026-11-03");   // without a clock only full dates work
  for (const [input, re] of [["a @someday", /unknown date/], ["a @tue 25:00", /not a time/], ["a @today @tom", /one date/],
    ["a !soon", /reminder/], ["@today", /needs some words/], ["a @2026-02-30", /unknown date/]]) assert.throws(() => ex(input, today), re, input);
  assert.throws(() => ex("a @tue", null), /clock is not set/);
});

test("groups: overdue, today with untimed tasks first, tomorrow, later, no date; done hidden until F4", async () => {
  const h = await setup({ text: [
    "# Todo", "- [ ] standup @2026-10-31 09:00", "- [ ] dentist @2026-11-01 14:30 !15m", "- [ ] buy milk @2026-11-01",
    "- [ ] call Anna @2026-11-02", "- [ ] trip @2026-11-20", "- charge the PicoCalc", "- [x] write the editor", "" ].join("\n") });
  assert.deepEqual(h.rows(), ["# OVERDUE", "o 09:00 standup", "# TODAY · SUNDAY 1 NOV", "o buy milk", "o 14:30 dentist",
    "# TOMORROW · MON 2 NOV", "o call Anna", "# FRI 20 NOV", "o trip", "# NO DATE", "o charge the PicoCalc"]);
  assert.equal(h.s.sel, 1);   // the first task, not a header
  await h.key("f4");
  assert.deepEqual(h.rows().slice(-2), ["# DONE", "x write the editor"]);
  const shot = plain(h.def.screen(h.s));
  assert.equal(shot.kids[0].items[1].right, "Sat 31 Oct"); assert.equal(shot.kids[0].items[1].rightColor, "accent");
  assert.equal(shot.kids[0].items[4].right, "!15m");
  h.clockState.wall = null; h.fn("agRows")(h.s);
  assert.deepEqual(h.rows().slice(0, 3), ["# SAT 31 OCT 2026", "o 09:00 standup", "# SUN 1 NOV 2026"]);
});

test("keys: navigation skips headers; Enter ticks a task in the file; F2 adds; F3 edits; F5 twice deletes", async () => {
  const h = await setup({ text: "- [ ] a @2026-11-01\n- [ ] b\n" });
  assert.deepEqual(h.rows(), ["# TODAY · SUNDAY 1 NOV", "o a", "# NO DATE", "o b"]);
  await h.key("down"); assert.equal(h.s.sel, 3);
  await h.key("up"); assert.equal(h.s.sel, 1);
  await h.key("up"); assert.equal(h.s.sel, 1);
  await h.key("enter");
  assert.equal(h.files.get("todo.txt"), "- [x] a @2026-11-01\n- [ ] b\n");
  await h.key("f2"); await h.type("dentist @tue 2pm !15m"); await h.key("enter");
  assert.equal(h.files.get("todo.txt"), "- [x] a @2026-11-01\n- [ ] b\n- [ ] dentist @2026-11-03 14:00 !15m\n");
  h.s.sel = h.s.rows.findIndex((r) => r.task && r.task.title === "dentist");
  await h.key("f3");
  assert.equal(h.s.prompt.value, "dentist @2026-11-03 14:00 !15m");
  for (let i = 0; i < 10; i++) await h.key("backspace");   // "!15m", " ", "14:00"
  await h.type("9am"); await h.key("enter");
  assert.match(h.files.get("todo.txt"), /- \[ \] dentist @2026-11-03 09:00\n$/);
  h.s.sel = h.s.rows.findIndex((r) => r.task && r.task.title === "b");
  await h.key("f5"); assert.match(h.s.note, /F5 again deletes: b/);
  await h.key("f5");
  assert.equal(h.files.get("todo.txt"), "- [x] a @2026-11-01\n- [ ] dentist @2026-11-03 09:00\n");
  await h.key("f2"); await h.type("bad @someday"); await h.key("enter");
  assert.match(h.s.note, /unknown date/); assert.ok(h.s.prompt);   // the prompt stays to be corrected
});

test("a change to a file someone else edited meanwhile reloads instead of overwriting", async () => {
  const h = await setup({ text: "- [ ] a\n- [ ] b\n" });
  h.files.set("todo.txt", "- [ ] a (edited in the editor)\n- [ ] b\n- [ ] c\n");
  await h.key("enter");   // ticks "a", which no longer reads the same
  assert.match(h.s.note, /changed meanwhile; reloaded/);
  assert.equal(h.files.get("todo.txt"), "- [ ] a (edited in the editor)\n- [ ] b\n- [ ] c\n");
  assert.deepEqual(h.rows(), ["# NO DATE", "o a (edited in the editor)", "o b", "o c"]);
  await h.key("down"); await h.key("enter");
  assert.equal(h.files.get("todo.txt"), "- [ ] a (edited in the editor)\n- [x] b\n- [ ] c\n");
});

test("reminders: once, in local time across the end of daylight saving time, late ones marked, none without a clock", async () => {
  // 14:30 on 1 November is EST (UTC-5), after the 2:00 change: 19:30 UTC. Reminded 15 minutes before.
  const text = "- [ ] dentist @2026-11-01 14:30 !15m\n- [ ] lunch @2026-11-01 12:00\n- [x] old @2026-11-01 12:00\n";
  const h = await setup({ text, wall: Date.UTC(2026, 10, 1, 19, 14) });
  h.tick(); assert.equal(h.sent.length, 0);
  h.clockState.wall = Date.UTC(2026, 10, 1, 19, 15);
  h.tick();
  assert.deepEqual(h.sent, [{ to: "compositor", type: "notify", payload: { text: "dentist at 14:30", sub: "in 15m" } }]);
  h.tick(); assert.equal(h.sent.length, 1);
  // a restart remembers what fired
  const again = await setup({ text, wall: Date.UTC(2026, 10, 1, 19, 16), stored: h.stored });
  again.tick(); assert.equal(again.sent.length, 0);
  // 12:00 lunch, noticed at 13:30: late, within the two-hour window; the done task stays quiet
  const late = await setup({ text, wall: NY(2026, 11, 1, 13, 30) });
  assert.deepEqual(late.sent.map((m) => m.payload), [{ text: "lunch at 12:00", sub: "was due at 12:00" }]);
  const stale = await setup({ text, wall: NY(2026, 11, 1, 14, 1) });
  assert.equal(stale.sent.filter((m) => m.payload.text.startsWith("lunch")).length, 0);
  const noClock = await setup({ text, wall: null });
  noClock.tick(); assert.equal(noClock.sent.length, 0);
});

test("the background tick re-reads the file, so a task the agent added is reminded", async () => {
  const h = await setup({ text: "", wall: NY(2026, 11, 1, 16, 59) });
  h.files.set("todo.txt", "- [ ] call @2026-11-01 17:00\n");
  h.clockState.wall = NY(2026, 11, 1, 17, 0);
  h.tick(300001); await h.settle();
  assert.equal(h.sent.at(-1).payload.text, "call at 17:00");
});

test("F6 opens the file in the editor with a handle to it, and revokes the one given before", async () => {
  const h = await setup({ text: "- [ ] a\n" });
  await h.key("f6");
  assert.equal(h.asks[0].type, "open"); assert.equal(h.asks[0].payload.name, "notes/todo.txt");
  assert.deepEqual(h.sent.at(-1), { to: "compositor", type: "open", payload: { app: "editor" } });
  await h.key("f6");
  assert.equal(h.handles[0].revoked, 1); assert.equal(h.handles[0].released, 1); assert.equal(h.handles[1].revoked, 0);
});

test("keys from anyone but the compositor are ignored", async () => {
  const h = await setup({ text: "- [ ] a\n" });
  await h.def.handlers.key(h.s, { key: "enter", state: "down" }, { from: "flaky" });
  assert.equal(h.files.get("todo.txt"), "- [ ] a\n");
});
