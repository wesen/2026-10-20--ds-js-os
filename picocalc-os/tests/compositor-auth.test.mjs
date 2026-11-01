// Approval integrity depends on authenticating the last hop through the shared compositor. These
// tests use its actual callbacks, without initializing framebuffers or simulating the renderer.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/system/compositor.js", import.meta.url), "utf8");
function setup() {
  const def = { handlers: {} }, sent = [];
  const builder = {
    needs() { return this; }, state(s) { def.state = s; return this; }, onStart() { return this; },
    on(name, fn) { def.handlers[name] = fn; return this; }, every() { return this; },
  };
  vm.runInNewContext(source, { service: () => builder, self: "compositor",
    send: (to, type, payload) => sent.push({ to, type, payload }), now: () => 0 });
  def.state.focus = "chat";
  return { def, state: def.state, sent };
}

test("only physical keyboard events can reach the focused approval UI", () => {
  const { def, state, sent } = setup();
  for (const from of ["flaky", "sandbox", "chat", null]) {
    def.handlers.keys(state, { key: "f4", state: "down" }, { from });
    def.handlers.keys(state, { key: "f1", state: "down" }, { from });
  }
  assert.equal(sent.length, 0); assert.equal(state.focus, "chat");
  def.handlers.keys(state, { key: "f4", state: "down" }, { from: "keyboard" });
  assert.equal(sent.at(-1).to, "chat"); assert.equal(sent.at(-1).type, "key");
  const before = sent.length;
  def.handlers.keys(state, { key: "f4", state: "up" }, { from: "keyboard" });
  assert.equal(sent.length, before);
});

test("a publisher cannot cover another app's approval with a forged frame", () => {
  const { def, state, sent } = setup();
  const frame = { app: "chat", title: "Agent", frame: { tree: { t: "text", s: "a different action" }, hints: "F4 allow" } };
  def.handlers.frames(state, frame, { from: "flaky" });
  assert.equal(state.apps.chat, undefined); assert.equal(sent.length, 0);
  def.handlers.frames(state, frame, { from: "chat" });
  assert.equal(state.apps.chat.title, "Agent");
  assert.equal(sent.at(-1).type, "draw");
});

test("only kernel status may remove an app or overlay a crash banner", () => {
  const { def, state } = setup();
  state.apps.chat = { title: "Agent" };
  const status = { world: "chat", state: "crashed", why: "test", in_ms: 100 };
  for (const from of ["flaky", "kernel", "chat"]) def.handlers["worlds.status"](state, status, { from });
  assert.equal(state.banner, null); assert.equal(state.apps.chat.title, "Agent");
  def.handlers["worlds.status"](state, status, { from: null });
  assert.equal(state.apps.chat, undefined); assert.match(state.banner.text, /chat crashed/);
});

test("only the power driver may alter the trusted battery display", () => {
  const { def, state, sent } = setup();
  def.handlers.power(state, { pct: 1 }, { from: "flaky" });
  assert.equal(state.battery, null); assert.equal(sent.length, 0);
  def.handlers.power(state, { pct: 82 }, { from: "power" });
  assert.equal(state.battery.pct, 82); assert.equal(sent.at(-1).type, "draw");
});

test("a notification names its sender, waits behind a crash banner, and is limited per world", () => {
  const { def, state } = setup();
  state.notes = [];
  def.handlers.notify(state, { text: "dentist at 14:30", sub: "in 15 minutes" }, { from: "agenda" });
  assert.equal(state.banner.text, "agenda: dentist at 14:30"); assert.equal(state.banner.sub, "in 15 minutes");
  def.handlers.notify(state, { text: "forged" }, { from: null });
  def.handlers.notify(state, { text: "" }, { from: "flaky" });
  assert.equal(state.notes.length, 0);
  def.handlers.notify(state, { text: "second" }, { from: "flaky" });
  def.handlers.notify(state, { text: "third" }, { from: "flaky" });   // one waiting per world
  assert.deepEqual(state.notes.map((n) => n.text), ["flaky: second"]);
  def.handlers["worlds.status"](state, { world: "chat", state: "crashed", why: "test", in_ms: 100 }, { from: null });
  assert.match(state.banner.text, /chat crashed/);
  assert.deepEqual(state.notes.map((n) => n.text), ["agenda: dentist at 14:30", "flaky: second"]);
  for (const w of ["a", "b", "c", "d"]) def.handlers.notify(state, { text: "x" }, { from: w });
  assert.equal(state.notes.length, 4);
});

test("apps loaded from storage cannot bring an app to the front, and only the compositor asks itself to draw", () => {
  const { def, state, sent } = setup();
  for (const from of ["u-hello", "u-launcher", null]) def.handlers.open(state, { app: "u-hello" }, { from });
  assert.equal(state.focus, "chat");
  def.handlers.open(state, { app: "settings" }, { from: "launcher" });
  assert.equal(state.focus, "settings");
  assert.deepEqual(sent.filter((m) => m.type === "blur" || m.type === "focus").map((m) => [m.to, m.type]), [["chat", "blur"], ["settings", "focus"]]);
  def.handlers.open(state, { app: "u-hello" }, { from: "loader" });
  assert.equal(state.focus, "u-hello");
  def.handlers.open(state, { app: 7 }, { from: "loader" });
  assert.equal(state.focus, "u-hello");
  state.queued = true;
  def.handlers.draw(state, null, { from: "u-hello" });
  assert.equal(state.queued, true, "a draw from another world is ignored");
});

// The drivers' requests, with the drivers' own callbacks and no hardware.
function driver(file) {
  const def = { handlers: {} };
  const builder = {
    provides() { return this; }, needs() { return this; }, state(s) { def.state = s; return this; }, onStart() { return this; },
    on(name, fn) { def.handlers[name] = fn; return this; }, every() { return this; },
  };
  vm.runInNewContext(readFileSync(new URL("../js/drivers/" + file, import.meta.url), "utf8"),
    { driver: () => builder, sleep: async () => {}, now: () => 0, hw: {}, publish: () => {} });
  return { def, state: JSON.parse(JSON.stringify(def.state)) };
}

test("only the compositor may switch the screen, set the backlight, attach a framebuffer or flush", async () => {
  const p = driver("power.js");
  p.state.screen = true; p.state.backlight = 64;
  assert.deepEqual(JSON.parse(JSON.stringify(await p.def.handlers.screen(p.state, {}, { from: "u-hello" }))), { screen: true });
  assert.equal(await p.def.handlers.backlight(p.state, { level: 0 }, { from: "u-hello" }), undefined);
  assert.equal(p.state.screen, true);
  const d = driver("display.js");
  const fb = { released: 0, release() { this.released++; } };
  d.def.handlers.attach(d.state, { fb }, { from: "compositor" });
  assert.equal(d.state.fb, fb);
  d.def.handlers.attach(d.state, {}, { from: "u-hello" });
  d.def.handlers.attach(d.state, { fb: { release() {} } }, { from: "settings" });
  assert.equal(d.state.fb, fb); assert.equal(fb.released, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(await d.def.handlers.flush(d.state, { rects: [[0, 0, 320, 320]] }, { from: "u-hello" }))), { px: 0, skipped: true });
});
