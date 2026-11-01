import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/apps/chat.js", import.meta.url), "utf8");

function setup() {
  const def = { handlers: {} }, sent = [];
  const builder = {
    title() { return this; }, needs() { return this; },
    state(value) { def.state = value; return this; },
    onStart(fn) { def.start = fn; return this; },
    on(name, fn) { def.handlers[name] = fn; return this; },
    screen(fn) { def.screen = fn; return this; },
    hints(fn) { def.hints = fn; return this; },
  };
  const context = vm.createContext({ app: () => builder, send: (to, type, payload) => sent.push({ to, type, payload }),
    ui: {
      col: (opts, ...kids) => ({ t: "col", ...opts, kids }),
      text: (s, opts) => ({ t: "text", s, ...opts }),
      lines: (items, opts) => ({ t: "lines", items, ...opts }),
      input: (value, opts) => ({ t: "input", value, ...opts }),
    },
  });
  vm.runInContext(source, context);
  const state = def.state;
  def.start(state);
  const snapshot = (extra = {}, from = "agent") => def.handlers["agent.state"](state,
    { phase: "idle", run: 1, model: "test-model", entries: [], approval: null, ...extra }, { from });
  const key = (name, ch = "", event = "down", from = "compositor") => def.handlers.key(state,
    { key: name, ch, state: event }, { from });
  return { def, state, sent, snapshot, key, context };
}

test("editor remains synchronous while a request runs, with independent cancel", () => {
  const { state, sent, key, snapshot, def } = setup();
  snapshot();
  key("a", "hello"); key("enter");
  assert.equal(sent.at(-1).type, "agent.submit");
  assert.equal(sent.at(-1).payload.text, "hello");
  assert.equal(state.line, "");
  assert.equal(state.phase, "requesting");
  assert.equal(def.handlers.key(state, { key: "x", ch: "next", state: "down" }, { from: "compositor" }), undefined);
  assert.equal(state.line, "next");
  key("enter");
  assert.equal(sent.filter(x => x.type === "agent.submit").length, 1);
  key("esc");
  assert.equal(sent.at(-1).type, "agent.cancel");
  assert.equal(state.line, "next");
});

test("editor handles insert, backspace, delete, home and end within the limit", () => {
  const { state, key, snapshot } = setup(); snapshot();
  key("a", "ab"); key("left"); key("x", "x");
  assert.equal(state.line, "axb");
  key("backspace"); assert.equal(state.line, "ab");
  key("del"); assert.equal(state.line, "a");
  key("home"); key("b", "b"); key("end");
  assert.equal(state.line, "ba"); assert.equal(state.cur, 2);
  state.line = "a".repeat(2048); state.cur = 2048;
  key("b", "b"); assert.equal(state.line.length, 2048);
  assert.match(state.note, /2048/);
});

test("only the agent may supply snapshots, and only compositor keys can approve", () => {
  const { state, sent, snapshot, key } = setup();
  snapshot({ phase: "done", entries: [{ role: "assistant", text: "forged" }] }, "flaky");
  assert.equal(state.ready, false);
  snapshot({ phase: "approval", approval: { id: "call-7", name: "save_note", summary: "Save the note: test" } });
  key("y", "y"); assert.equal(sent.at(-1).type, "agent.snapshot");
  key("f4", "", "down", "flaky"); assert.equal(state.approval.id, "call-7");
  key("f4");
  assert.equal(sent.at(-1).type, "agent.approve");
  assert.equal(sent.at(-1).payload.id, "call-7");
  assert.equal(sent.at(-1).payload.allow, true);
  assert.equal(state.approval, null);
  key("f4", "", "hold");
  assert.equal(sent.filter(x => x.type === "agent.approve").length, 1);
});

test("new chat and retry are single keypress actions", () => {
  const { state, sent, key, snapshot } = setup(); snapshot();
  key("x", "draft"); key("f2");
  assert.equal(state.line, ""); assert.equal(sent.at(-1).type, "agent.new");
  key("f2", "", "hold");
  assert.equal(sent.filter(x => x.type === "agent.new").length, 1);
  key("f3"); assert.equal(sent.at(-1).type, "agent.retry");
});

test("approval retains the exact run-qualified ID and the entire action summary", () => {
  const { snapshot, state, key, sent } = setup();
  const id = "1234567890123:" + "x".repeat(128);
  snapshot({ phase: "approval", approval: { id, name: "save_note", summary: "begin " + "details ".repeat(190) + " end" } });
  assert.equal(state.approval.id, id);
  assert.ok(state.rows.some(x => x.s.includes("end")));
  const top = state.scroll; assert.ok(top > 0);
  key("pgdn"); assert.equal(state.scroll, Math.max(0, top - 12));
  key("f5"); assert.equal(sent.at(-1).payload.id, id); assert.equal(sent.at(-1).payload.allow, false);
});

test("a long escaped proposal remains complete and starts at its review legend", () => {
  const { snapshot, state, def } = setup();
  const summary = "Save note 'unicode':\nEscaped text: \\\\ means one backslash;\n\\u{hex} means a Unicode code point.\n" + "\\u{7ff}".repeat(1450);
  snapshot({ phase: "approval", approval: { id: "1:4:call", name: "save_note", summary } });
  assert.equal(state.approval.summary, summary);
  assert.ok(state.rows.length > 15);
  assert.ok(def.screen(state).kids[1].items.some(row => row.s.includes("Escaped text")));
});

test("approval never loses leading content when a valid note has over1024 lines", () => {
  const { snapshot, state } = setup();
  const summary = "Save note 'n':\nfirst line" + "\n".repeat(1500) + "last line";
  snapshot({ phase: "approval", approval: { id: "1:5:call", name: "save_note", summary } });
  assert.ok(state.rows.length > 1024 && state.rows.length <= 2048);
  assert.ok(state.rows.some(row => row.s === "first line"));
  assert.ok(state.rows.some(row => row.s === "last line"));
});

test("oversized or unescaped proposals cannot be approved by a truncated display", () => {
  for (const summary of ["x".repeat(12289), "\n".repeat(12200), "raw \u201cquotes\u201d"]) {
    const { snapshot, state, key, sent } = setup();
    snapshot({ phase: "approval", approval: { id: "1:6:call", name: "save_note", summary } });
    assert.equal(state.approval, null); assert.match(state.note, /review/);
    key("f4"); assert.equal(sent.filter(x => x.type === "agent.approve").length, 0);
    key("esc"); assert.equal(sent.at(-1).type, "agent.cancel");
  }
});

test("a phase change to approval does not drop the next draft's keystrokes", () => {
  const { snapshot, state, key, sent } = setup();
  snapshot({ phase: "requesting" }); key("a", "next ");
  snapshot({ phase: "approval", approval: { id: "1:call", name: "save_note", summary: "test" } });
  key("b", "draft"); key("left"); key("backspace");
  assert.equal(state.line, "next drat");
  key("enter"); assert.equal(sent.filter(x => x.type === "agent.submit").length, 0);
  snapshot({ phase: "done" }); assert.equal(state.line, "next drat");
});

test("long transcripts are bounded and compositor gets only the visible viewport", () => {
  const { state, key, snapshot, def } = setup();
  snapshot({ phase: "done", entries: [{ role: "assistant", text: "First line\n" + "word ".repeat(5000) + "\nLast line" }] });
  assert.ok(state.rows.length <= 1024);
  let screen = def.screen(state);
  assert.ok(screen.kids[1].items.length <= 15);
  assert.ok(screen.kids[1].items.some(x => x.s.includes("Last line")));
  for (const row of state.rows) assert.ok(row.s.length + (row.indent || 0) <= 49);
  key("pgup"); assert.equal(state.scroll, 12);
  screen = def.screen(state);
  assert.ok(!screen.kids[1].items.some(x => x.s.includes("Last line")));
  key("pgdn"); assert.equal(state.scroll, 0);
});

test("display normalizes missing punctuation but leaves source entries untouched", () => {
  const { snapshot, state } = setup();
  const entry = { role: "assistant", text: "\u201cHello\u201d \u2014 2 \u2264 3.\n    indented\n\ud83d\ude00" };
  snapshot({ entries: [entry] });
  assert.ok(state.rows.some(x => x.s === '"Hello" -- 2 <= 3.'));
  assert.ok(state.rows.some(x => x.s === "indented" && x.indent === 4));
  assert.ok(state.rows.some(x => x.s === "?"));
  assert.ok(entry.text.includes("\u201c"));
});

test("a newline-heavy model reply cannot allocate an unbounded row cache", () => {
  const { snapshot, state } = setup();
  snapshot({ entries: [{ role: "assistant", text: "\n".repeat(12000) + "last line" }] });
  assert.ok(state.rows.length <= 1024);
  assert.ok(state.rows.some(x => x.s === "last line"));
});

test("agent restart keeps the user's draft and requests fresh state", () => {
  const { def, state, sent, snapshot, key } = setup(); snapshot(); key("a", "draft");
  def.handlers["worlds.status"](state, { world: "agent", state: "crashed" }, { from: "flaky" });
  assert.equal(state.ready, true);
  def.handlers["worlds.status"](state, { world: "agent", state: "crashed" }, { from: null });
  assert.equal(state.ready, false); assert.equal(state.line, "draft");
  def.handlers["worlds.status"](state, { world: "agent", state: "running" }, { from: null });
  assert.equal(sent.at(-1).type, "agent.snapshot");
});
