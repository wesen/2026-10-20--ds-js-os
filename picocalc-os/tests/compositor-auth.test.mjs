// Approval integrity depends on authenticating the last hop through the shared compositor. These
// tests use its actual callbacks, without initializing framebuffers or simulating the renderer.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../apps/js/picocalc/system/compositor.js", import.meta.url), "utf8");
function setup() {
  const def = { handlers: {} }, sent = [];
  const builder = {
    needs() { return this; }, state(s) { def.state = s; return this; }, onStart() { return this; },
    on(name, fn) { def.handlers[name] = fn; return this; }, every() { return this; },
  };
  const context = { service: () => builder, self: "compositor",
    send: (to, type, payload) => sent.push({ to, type, payload }), now: () => 0 };
  vm.runInNewContext(source, context);
  def.state.focus = "chat";
  return { def, state: def.state, sent, advance: context.advanceChessOrbit };
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

test("a native painter becomes visible only after the compositor confirms admission", () => {
  const { def, state, sent } = setup();
  state.focus = "chess";
  for (const from of ["chess", "launcher", null]) {
    def.handlers["painter.ready"](state, null, { from });
  }
  assert.equal(state.apps.chess, undefined);
  assert.equal(sent.length, 0);
  def.handlers["painter.ready"](state, null, { from: "compositor" });
  assert.equal(state.apps.chess.mobile, true);
  assert.equal(sent.at(-1).type, "draw");
});

test("Chess quarter-turns remap the cursor and leave game actions with the game", () => {
  const {def, state, sent} = setup();
  state.focus = "chess";
  const press = (key, from = "keyboard", edge = "down") =>
    def.handlers.keys(state, {key, state: edge, ch: ""}, {from});
  def.handlers["painter.ready"](state, {orbit:true}, {from:"chess"});
  press("f4");
  assert.equal(state.chessYaw, 0);
  def.handlers["painter.ready"](state, {orbit:true}, {from:"compositor"});
  for (const arrow of ["right", "up", "left", "down"]) {
    press("right");
    assert.equal(sent.at(-1).payload.key, arrow);
    press("enter");
    assert.equal(sent.at(-1).payload.key, "enter");
    const turns = sent.filter(m => m.to === "chess").length;
    press("f4");
    assert.equal(sent.filter(m => m.to === "chess").length, turns);
    def.handlers["painter.ready"](state, {orbit:true}, {from:"compositor"});
  }
  assert.equal(state.chessYaw, 0);
  press("f3", "keyboard", "up"); press("f3", "keyboard", "repeat"); press("f3", "chat");
  assert.equal(state.chessYaw, 0);
  press("f3"); assert.equal(state.chessYaw, 3);
  press("f4"); assert.equal(state.chessYaw, 0);
  def.handlers["painter.ready"](state, null, {from:"compositor"});
  press("f4"); assert.equal(sent.at(-1).payload.key, "f4");
});

test("each Chess quarter-turn visits eight poses and reverses from its current angle", () => {
  const {def, state, advance} = setup();
  state.focus = "chess";
  def.handlers["painter.ready"](state, {orbit:true}, {from:"compositor"});
  const press = key => def.handlers.keys(state, {key, state:"down"}, {from:"keyboard"});
  const next = () => { advance(state); return state.chessPhase; };
  press("f4");
  assert.deepEqual(Array.from({length:8}, next), [1,2,3,4,5,6,7,8]);
  assert.equal(next(), 8);
  press("f3"); assert.equal(next(), 7); assert.equal(next(), 6);
  press("f4"); assert.equal(next(), 7); assert.equal(next(), 8);
  press("f3"); press("f3");
  assert.deepEqual(Array.from({length:16},next), [7,6,5,4,3,2,1,0,31,30,29,28,27,26,25,24]);
  state.focus = "launcher"; press("f4"); assert.equal(next(),24);
});

test("a malformed Snake position preserves the last admitted screen", () => {
  const { def, state, sent } = setup();
  state.focus = "snake";
  const tree = { t: "snake", v: 1, body: [34, 33, 32, 31], food: 63, score: 0, best: 0, alive: true, auto: false };
  const publish = (next, from = "snake") => def.handlers.frames(state,
    { app: "snake", title: "Snake", frame: { tree: next, hints: "steer" } }, { from });
  publish(tree);
  const accepted = state.apps.snake;
  assert.ok(accepted);
  state.queued = false;
  sent.length = 0;
  publish({ ...tree, food: 31 });                       // bit 31 of the first occupancy word
  publish({ ...tree, body: [32, 31, 32, 33] });        // repeated across the word boundary
  publish({ ...tree, body: [23, 22, 21, 20] });        // wraps between two board rows
  publish({ ...tree, v: 2 });
  publish(tree, "flaky");
  assert.equal(state.apps.snake, accepted);
  assert.equal(sent.length, 0);
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
  vm.runInNewContext(readFileSync(new URL("../../apps/js/picocalc/drivers/" + file, import.meta.url), "utf8"),
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

test("Ray Tracer accepts its own bounded integral scene", () => {
  const { def, state } = setup();
  const scene = { t: "raytrace", sx: 32, sy: 127, lx: 0, ly: 159, scene: 0, weight: 128 };
  const publish = (tree, from = "raytrace") => def.handlers.frames(state,
    { app: "raytrace", title: "Ray Tracer", frame: { tree, hints: "" } }, { from });
  publish(scene, "snake");
  assert.equal(state.apps.raytrace, undefined);
  publish(scene);
  const accepted = state.apps.raytrace;
  assert.equal(accepted.tree, scene);
  for (const diff of [{ scene: 4 }, { sx: 31 }, { sy: 128 }, { lx: -1 }, { ly: 160 }, { sx: 32.5 }, { lx: "0" }, { t: "text" }]) {
    publish({ ...scene, ...diff });
    assert.equal(state.apps.raytrace, accepted);
  }
});
