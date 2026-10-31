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
