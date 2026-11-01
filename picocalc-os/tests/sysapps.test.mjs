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
    title() { return this; }, state(v) { def.state = v; return this; }, onStart(fn) { def.start = fn; return this; },
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
  const app = load("settings.js", {
    now: () => 0, sleep: () => Promise.resolve(),
    clock: { set: () => true, zone: () => zone, setZone: (tz) => { calls.zone.push(tz); zone = tz; return { zone: tz, saved: true }; } },
    net: {
      info: () => ({ ...station }),
      scan: () => { calls.scan++; pending = 2; return true; },
      scanResult: () => (pending-- > 0 ? null : NETS),
      join: (ssid, password) => { calls.join.push([ssid, password]); station.ssid = ssid; station.wifi = "connecting"; return true; },
    },
  });
  app.def.handlers.focus(app.s);
  return { ...app, calls, station, tick: () => app.def.every[0](app.s) };
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
  Object.assign(h.station, { wifi: "failed", state: "Wi-Fi gave up: network not found (reason 201)" });
  h.tick();
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
  const shown = h.shown();
  assert.equal(shown.filter((x) => x.startsWith("…")).length, 1);
  assert.ok(shown.includes("… 44 lines are gone"), shown.find((x) => x.startsWith("…")));
  assert.equal(h.s.after, 452);
  assert.ok(h.s.lines.length <= 400);
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
test("launcher: thirteen apps scroll by rows, and a letter still opens any of them", () => {
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
  assert.equal(grid().items[grid().sel].label, "About");
  assert.match(more(), /▲/);
  h.key("up"); h.key("up"); h.key("up");
  assert.deepEqual([h.s.sel, h.s.top], [0, 0]);
  h.key("a", "a");
  assert.deepEqual(sent.at(-1), { to: "compositor", type: "open", payload: { app: "about" } });
  assert.equal(h.s.top, 1);
  h.key("l", "l");
  assert.deepEqual(sent.at(-1).payload, { app: "logs" });
});
