// Settings, Logs and the launcher's scrolling, each app in a VM with fakes for the kernel (no binary needed).
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const plain = (x) => JSON.parse(JSON.stringify(x));
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const UI = {
  col: (o, ...kids) => ({ t: "col", ...o, kids }), row: (o, ...kids) => ({ t: "row", ...o, kids }),
  text: (s, o) => ({ t: "text", s, ...o }), list: (items, sel, o) => ({ t: "list", items, sel, ...o }),
  lines: (items, o) => ({ t: "lines", items, ...o }), input: (value, o) => ({ t: "input", value, ...o }),
  kv: (pairs, o) => ({ t: "kv", pairs, ...o }), sep: () => ({ t: "sep" }), gap: (h) => ({ t: "gap", h }),
  grid: (items, sel, o) => ({ t: "grid", items, sel, ...o }),
};

// An app's definition, run in a VM with the globals given; key() sends a key the way the compositor does.
function load(file, globals) {
  const def = { handlers: {}, every: [] };
  const builder = {
    title() { return this; }, key() { return this; }, about() { return this; }, icon() { return this; },
    state(v) { def.state = v; return this; }, onStart(fn) { def.start = fn; return this; },
    on(name, fn) { def.handlers[name] = fn; return this; }, every(ms, fn) { def.every.push(fn); return this; },
    screen(fn) { def.screen = fn; return this; }, hints(fn) { def.hints = fn; return this; },
  };
  const context = vm.createContext({ app: () => builder, ui: UI, ...globals });
  vm.runInContext(readFileSync(new URL("../js/apps/" + file, import.meta.url), "utf8"), context);
  const s = JSON.parse(JSON.stringify(def.state));
  const key = (name, ch = "", state = "down") => def.handlers.key(s, { key: name, ch, state }, { from: "compositor" });
  const type = (t) => { for (const c of t) key(c === " " ? "space" : c, c); };
  const fn = (name) => vm.runInContext(name, context);
  return { s, def, key, type, fn, screen: () => JSON.stringify(def.screen(s)), context };
}

// ---- Settings --------------------------------------------------------------------------------------------------
const NETS = [{ ssid: "picocalc-lab", rssi: -48, secure: true }, { ssid: "cafe-guest", rssi: -71, secure: false }];
function settings() {
  const calls = { join: [], scan: 0, zone: [] };
  const station = { mode: "simulated", wifi: "off", state: "Wi-Fi not set up", ssid: "", ip: "", rssi: 0, clock: true,
                    provider: "api.example.org", api: "chat", model: "m1", key: true };
  let pending = 0, zone = "UTC0";
  const t = { t: 0 };
  const app = load("settings.js", {
    now: () => t.t, sleep: () => Promise.resolve(),
    clock: { set: () => true, zone: () => zone, setZone: (tz) => { calls.zone.push(tz); zone = tz; return { zone: tz, saved: true }; } },
    net: {
      info: () => ({ ...station }),
      scan: () => { calls.scan++; pending = 2; return true; },
      scanResult: () => (pending-- > 0 ? null : NETS),
      join: (ssid, password) => { calls.join.push([ssid, password]); station.ssid = ssid; station.wifi = "connecting"; return true; },
    },
  });
  app.def.handlers.focus(app.s);
  return { ...app, calls, station, clock: t, tick: () => app.def.every[0](app.s) };
}

test("settings: the menu shows the station, the zone and the provider", () => {
  const h = settings();
  const items = plain(h.def.screen(h.s).kids[0].items).map((i) => [i.label, i.right]);
  assert.deepEqual(items, [["Wi-Fi", "off"], ["Time zone", "UTC"], ["Provider", "api.example.org · key ✓"]]);
});

test("settings: Wi-Fi scans on the way in, and a scan in progress is not started twice", async () => {
  const h = settings();
  h.key("enter");
  assert.equal(h.s.page, "wifi");
  assert.equal(h.calls.scan, 1);
  h.key("f2");
  assert.equal(h.calls.scan, 1);
  await settle();
  assert.deepEqual(plain(h.s.nets), NETS);
  assert.equal(h.s.scanning, false);
  const list = JSON.parse(h.screen()).kids[2];
  assert.deepEqual(list.items.map((i) => [i.label, i.right]), [["picocalc-lab", "████  locked"], ["cafe-guest", "██░░  open"]]);
});

test("settings: a password is typed as dots, checked, handed to net.join once and cleared", async () => {
  const h = settings();
  h.key("enter"); await settle();
  h.key("enter");                                  // picocalc-lab is locked
  assert.equal(h.s.page, "password");
  h.type("correct horse");
  h.key("x", "x", "hold");                         // a held key does not type twice
  assert.equal(h.s.pw, "correct horse");
  assert.ok(!h.screen().includes("correct"), "the screen never carries the password");
  assert.ok(h.screen().includes("•".repeat(13)));
  h.key("backspace"); h.key("backspace"); h.key("backspace"); h.key("backspace"); h.key("backspace"); h.key("backspace");
  h.key("enter");
  assert.match(h.s.note, /8 to 63 characters/);
  assert.equal(h.calls.join.length, 0);
  h.type(" battery");
  h.key("enter");
  assert.deepEqual(h.calls.join, [["picocalc-lab", "correct battery"]]);
  assert.equal(h.s.pw, "");
  assert.equal(h.s.page, "wifi");
  assert.match(h.s.note, /Joining picocalc-lab/);
  Object.assign(h.station, { wifi: "up", ip: "192.168.4.23", rssi: -48, state: "Wi-Fi connected" });
  h.tick();
  assert.equal(h.s.note, "Connected to picocalc-lab.");
  assert.equal(h.s.joining, null);
});

test("settings: leaving the password field clears it; an open network joins at once; a failure is reported", async () => {
  const h = settings();
  h.key("enter"); await settle();
  h.key("enter"); h.type("secret12");
  h.def.handlers.blur(h.s);
  assert.deepEqual([h.s.pw, h.s.page], ["", "wifi"]);
  h.def.handlers.focus(h.s);
  h.key("enter"); h.type("secret12"); h.key("esc");
  assert.deepEqual([h.s.pw, h.s.page], ["", "wifi"]);
  h.key("down"); h.key("enter");
  assert.deepEqual(h.calls.join, [["cafe-guest", ""]]);
  h.clock.t = 25000; h.tick();
  assert.equal(h.s.note, "Still trying cafe-guest…");   // the P4 retries for up to a minute
  Object.assign(h.station, { wifi: "failed", state: "Wi-Fi gave up: network not found (reason 201)" });
  h.clock.t = 60000; h.tick();
  assert.equal(h.s.note, "Could not join cafe-guest: Wi-Fi gave up: network not found (reason 201)");
});

test("settings: the zone list marks the zone in effect and sets another", () => {
  const h = settings(), off = h.fn("stOffset");
  assert.deepEqual(["UTC0", "GMT0BST,M3.5.0/1,M10.5.0", "EST5EDT,M3.2.0,M11.1.0", "IST-5:30", "<+03>-3", "<-03>3", "weird"].map(off),
    ["UTC", "UTC+0 DST", "UTC-5 DST", "UTC+5:30", "UTC+3", "UTC-3", "weird"]);
  h.key("down"); h.key("enter");
  assert.equal(h.s.page, "zone");
  assert.equal(h.s.sel, 0);                       // UTC, the zone in effect
  for (let i = 0; i < 19; i++) h.key("down");
  h.key("enter");
  assert.deepEqual(h.calls.zone, ["EST5EDT,M3.2.0,M11.1.0"]);
  assert.equal(h.s.note, "Time zone: New York, Toronto.");
  const item = JSON.parse(h.screen()).kids[0].items[19];
  assert.equal(item.right, "✓ UTC-5 DST");
  h.key("esc");
  assert.deepEqual([h.s.page, h.s.sel], ["menu", 1]);
});

// ---- Logs ------------------------------------------------------------------------------------------------------
// A fake ring like the kernel's: lines numbered from 1, the last 256 kept, 64 per read.
function logs() {
  const ring = { next: 1, lines: [] };
  const add = (s, wall = -1) => { ring.lines.push({ n: ring.next, t: ring.next * 10, wall, s }); ring.next++; if (ring.lines.length > 256) ring.lines.shift(); };
  const app = load("logs.js", {
    Date,
    sys: { log: (after) => {
      const first = ring.lines.length ? ring.lines[0].n : ring.next;
      return { first, next: ring.next, lines: ring.lines.filter((l) => l.n > after).slice(0, 64) };
    } },
  });
  app.def.handlers.focus(app.s);
  return { ...app, add, tick: () => app.def.every[0](app.s), shown: () => JSON.parse(app.screen()).kids[0].items.map((i) => i.s) };
}

test("logs: reads what is new, page by page, and marks lines the ring overwrote", () => {
  const h = logs();
  assert.deepEqual(h.shown(), ["Nothing logged yet."]);
  h.add("booting 21 worlds"); h.add("I (812) wifi: connected", new Date(2026, 9, 22, 9, 41, 5).getTime());
  h.tick();
  assert.deepEqual(h.shown(), ["0.0s booting 21 worlds", "09:41:05 I (812) wifi: connected"]);
  for (let i = 0; i < 150; i++) h.add("line " + i);
  h.tick();
  assert.equal(h.s.lines.length, 152);
  assert.equal(h.s.after, 152);
  h.def.handlers.blur(h.s);
  for (let i = 0; i < 300; i++) h.add("away " + i);
  h.tick();                                          // in the background it does not read
  assert.equal(h.s.after, 152);
  h.def.handlers.focus(h.s);
  assert.deepEqual(h.s.lines.filter((l) => l.lost).map((l) => l.lost), [44]);
  assert.equal(h.s.after, 452);
  assert.ok(h.s.lines.length <= 400);
  assert.equal(h.shown().length, 32, "the frame holds what can be on screen, not every line");
  assert.equal(h.shown().at(-1), "4.5s away 299");
  h.key("home");                                     // all the way back: the marker is in the frame again
  const shown = h.shown();
  assert.equal(shown.filter((x) => x.startsWith("…")).length, 1);
  assert.ok(shown.includes("… 44 lines are gone"), shown.find((x) => x.startsWith("…")));
});

test("logs: filters, colours, and a view that holds still while scrolled back", () => {
  const h = logs();
  h.add("booting"); h.add("snake crashed: boom"); h.add("E (900) wifi: auth failed"); h.add("I (950) files: mounted");
  h.tick();
  const tree = JSON.parse(h.screen()).kids[0];
  assert.deepEqual(tree.items.map((i) => i.color), ["ink", "accent", "accent", "muted"]);
  h.key("f2");
  assert.deepEqual(h.shown().map((x) => x.split(" ").slice(1).join(" ")), ["snake crashed: boom", "E (900) wifi: auth failed"]);
  h.key("f2");
  assert.deepEqual(h.shown().length, 2);             // kernel: booting, snake
  h.key("f2"); h.key("f2");                          // ESP-IDF, then all again
  assert.equal(h.s.filter, 0);
  h.key("up");
  assert.equal(h.s.scroll, 1);
  h.add("later"); h.tick();
  assert.equal(h.shown().length, 4, "held: the new line waits");
  assert.match(JSON.parse(h.screen()).kids[1].s, /held, End follows/);
  h.key("end");
  assert.equal(h.shown().length, 5);
});

// ---- the launcher ----------------------------------------------------------------------------------------------
test("launcher: more than twelve apps scroll by rows, and a letter still opens any of them", () => {
  const sent = [];
  const h = load("launcher.js", {
    send: (to, type, payload) => sent.push(plain({ to, type, payload })),
    sys: { worlds: () => [], stats: () => ({ crashes: 0 }) },
  });
  const grid = () => JSON.parse(h.screen()).kids[1];
  const more = () => JSON.parse(h.screen()).kids[0].kids[1].s;
  assert.equal(grid().items.length, 12);
  assert.match(more(), /▼/);
  h.key("down"); h.key("down"); h.key("down");
  assert.deepEqual([h.s.sel, h.s.top], [12, 1]);
  assert.equal(grid().items[grid().sel].label, "Keys");
  assert.match(more(), /▲/);
  h.key("up"); h.key("up"); h.key("up");
  assert.deepEqual([h.s.sel, h.s.top], [0, 0]);
  h.key("a", "a");
  assert.deepEqual(sent.at(-1), { to: "compositor", type: "open", payload: { app: "about" } });
  assert.equal(h.s.top, 1);
  h.key("l", "l");
  assert.deepEqual(sent.at(-1).payload, { app: "logs" });
});

// ---- the loader ------------------------------------------------------------------------------------------------
function loader({ files = {}, worlds = [] } = {}) {
  const fs = new Map(Object.entries(files)), spawned = [], stopped = [], sent = [], asks = [], handles = [];
  let t = 0;
  const child = (path, rights) => { const h = { path, rights, revoked: 0, released: 0, revoke() { h.revoked++; }, release() { h.released++; } }; handles.push(h); return h; };
  const dir = {
    list: async () => [...fs.keys()].map((name) => ({ name, dir: false, size: fs.get(name).length })),
    read: async (n) => { if (!fs.has(n)) throw new Error("no file apps/" + n); return fs.get(n); },
    write: async (n, text) => { fs.set(n, text); return { bytes: text.length }; },
    at: (path, rights) => child(path, rights),
  };
  const app = load("loader.js", {
    now: () => t, sleep: async () => {},
    hw: { fs: (claim) => { assert.equal(claim, "fs:/apps"); return dir; } },
    sys: {
      worlds: () => worlds,
      spawn: (name, source) => { spawned.push([name, source]); const w = worlds.find((x) => x.name === "u-" + name); if (w) w.state = "idle"; else worlds.push({ name: "u-" + name, user: true, state: "idle", last_error: "" }); return { world: "u-" + name }; },
      stop: (world) => { stopped.push(world); const w = worlds.find((x) => x.name === world); w.state = "stopped"; w.last_error = "stopped by loader"; return true; },
    },
    send: (to, type, payload) => sent.push(plain({ to, type, payload })),
    ask: async (to, type, payload) => { asks.push({ to, type, payload }); return { ok: true }; },
  });
  return { ...app, fs, spawned, stopped, sent, asks, handles, worlds, at: (ms) => { t = ms; } };
}

test("loader: lists apps/*.js with their worlds' states, and starts, opens, stops and reloads them", async () => {
  const h = loader({ files: { "clock.js": "app('clock')", "hello.js": "app('hello')", "notes.txt": "x", "Bad.js": "x", "autostart.txt": "" },
                     worlds: [{ name: "u-clock", user: true, state: "restarting", last_error: "ReferenceError: x is not defined" }, { name: "launcher", user: false, state: "idle" }] });
  await h.def.start(h.s);
  await h.def.handlers.focus(h.s);
  const rows = () => JSON.parse(h.screen()).kids[0].items.map((i) => [i.label, i.right]);
  assert.deepEqual(rows(), [["clock.js", "crashed: ReferenceError: x is not defined"], ["hello.js", "not started"]]);
  assert.match(JSON.parse(h.screen()).kids[1].s, /u-clock: ReferenceError/);
  await h.key("down"); await h.key("enter");
  assert.deepEqual(h.spawned, [["hello", "app('hello')"]]);
  assert.deepEqual(h.sent.at(-1), { to: "compositor", type: "open", payload: { app: "u-hello" } });
  await h.key("enter");                                  // running: only opened
  assert.equal(h.spawned.length, 1);
  assert.deepEqual(h.sent.at(-1).payload, { app: "u-hello" });
  await h.key("f2");
  assert.deepEqual(h.stopped, ["u-hello"]);
  assert.deepEqual(rows()[1], ["hello.js", "stopped"]);
  h.fs.set("hello.js", "app('hello') // v2");
  await h.key("f5");
  assert.deepEqual(h.spawned.at(-1), ["hello", "app('hello') // v2"]);
  assert.equal(h.s.note, "Started u-hello.");
  h.at(5000); h.def.every[0](h.s);
  assert.equal(h.s.note, "", "a note gives way to the list after a few seconds");
});

test("loader: F4 writes a new app from the template under a free name, F3 hands the editor that file only", async () => {
  const h = loader({ files: { "hello.js": "app('hello')" } });
  await h.def.start(h.s);
  await h.key("f4");
  const text = h.fs.get("hello2.js");
  assert.ok(text.includes('app("hello2")') && !text.includes('app("hello")'));
  assert.equal(h.s.apps[h.s.sel].name, "hello2");
  await h.key("f3");
  assert.deepEqual([h.handles[0].path, h.handles[0].rights], ["hello2.js", "rw"]);
  assert.equal(h.asks[0].payload.name, "apps/hello2.js");
  assert.deepEqual(h.sent.at(-1), { to: "compositor", type: "open", payload: { app: "editor" } });
  await h.key("up"); await h.key("f3");
  assert.deepEqual([h.handles[0].revoked, h.handles[0].released], [1, 1], "the earlier file is taken back");
});

test("loader: a WebAssembly app is started through a read-only handle to its file, released after; F3 does not edit it", async () => {
  const h = loader({ files: { "echo.wasm": "\0asm", "hello.js": "app('hello')", "autostart.txt": "echo\n" } });
  await h.def.start(h.s);
  const rows = () => JSON.parse(h.screen()).kids[0].items.map((i) => i.label);
  assert.deepEqual(rows(), ["echo.wasm", "hello.js"]);
  assert.equal(h.spawned.length, 1, "autostart finds echo.wasm by its name");
  const [name, file] = h.spawned[0];
  assert.equal(name, "echo");
  assert.deepEqual([file.path, file.rights, file.released], ["echo.wasm", "r", 1]);
  assert.equal(h.sent.filter((m) => m.type === "open").length, 0, "a module has no screen to open");
  await h.key("f3");
  assert.equal(h.asks.length, 0);
  assert.match(h.s.note, /cannot be edited/);
});

test("loader: apps named in autostart.txt start at boot, without being opened", async () => {
  const h = loader({ files: { "a.js": "app('a')", "b.js": "app('b')", "autostart.txt": "# at boot\na\n\nmissing\nNot-valid\nb\n" } });
  await h.def.start(h.s);
  assert.deepEqual(h.spawned.map((x) => x[0]), ["a", "b"]);
  assert.equal(h.sent.filter((m) => m.type === "open").length, 0);
  assert.equal(h.s.note, "Started at boot: a, b");
});
