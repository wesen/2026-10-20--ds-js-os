import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../js/apps/editor.js", import.meta.url), "utf8");
const plain = (x) => JSON.parse(JSON.stringify(x));   // values made in the VM have the VM's prototypes

// A file handle backed by a string; writes are counted.
function fakeFile(text = null, path = "notes/a.md") {
  const f = { path, text, writes: 0, released: 0, release: () => { f.released++; },
    read: async () => { if (f.text === null) throw new Error("no file " + path); return f.text; },
    write: async (t) => { f.text = t; f.writes++; return { bytes: Buffer.byteLength(t) }; } };
  return f;
}

function setup() {
  const def = { handlers: {} }, sent = [], stored = {};
  const builder = {
    title() { return this; }, state(v) { def.state = v; return this; },
    on(name, fn) { def.handlers[name] = fn; return this; },
    screen(fn) { def.screen = fn; return this; }, hints(fn) { def.hints = fn; return this; },
  };
  const context = vm.createContext({ app: () => builder, Date,
    send: (to, type, payload) => sent.push({ to, type, payload }),
    store: { get: (k, d) => k in stored ? JSON.parse(stored[k]) : d, set: (k, v) => { stored[k] = JSON.stringify(v); } },
    ui: {
      col: (o, ...kids) => ({ t: "col", ...o, kids }), text: (s, o) => ({ t: "text", s, ...o }),
      lines: (items, o) => ({ t: "lines", items, ...o }), textarea: (rows, o) => ({ t: "textarea", rows, ...o }),
    },
  });
  vm.runInContext(source, context);
  const s = def.state;
  const key = (name, ch = "", event = "down") => def.handlers.key(s, { key: name, ch, state: event }, { from: "compositor" });
  const type = (text) => { for (const c of text) key(c === " " ? "space" : c, c); };
  const open = async (file, name) => plain(await def.handlers.open(s, { file, name: name || file.path }, { from: "files" }));
  const view = () => plain(vm.runInContext("edView", context)(s));
  return { def, s, sent, key, type, open, view, context, stored };
}

test("open, type, split and join lines, save", async () => {
  const h = setup(), f = fakeFile("hello\nworld", "a.txt");
  assert.deepEqual(await h.open(f), { ok: true });
  h.key("end"); h.type("!");
  assert.equal(h.s.lines[0], "hello!");
  h.key("enter"); h.type("new");
  assert.deepEqual(plain(h.s.lines), ["hello!", "new", "world"]);
  h.key("home"); h.key("backspace");
  assert.deepEqual(plain(h.s.lines), ["hello!new", "world"]); assert.equal(h.s.col, 6);
  h.key("end"); h.key("del");
  assert.deepEqual(plain(h.s.lines), ["hello!newworld"]);
  assert.equal(h.s.dirty, true);
  await h.key("f2");
  assert.equal(f.text, "hello!newworld"); assert.equal(h.s.dirty, false); assert.match(h.s.note, /Saved 14 bytes/);
});

test("a missing file opens empty and the first save creates it", async () => {
  const h = setup(), f = fakeFile(null, "new.txt");
  assert.deepEqual(await h.open(f), { ok: true });
  h.type("x"); await h.key("f2");
  assert.equal(f.text, "x");
});

test("soft wrap: rows break at spaces, the cursor follows across rows, up/down keep a goal column", async () => {
  const h = setup();
  const long = "word ".repeat(30).trim();   // 149 characters
  await h.open(fakeFile(long + "\nshort", "w.txt"));
  const v = h.view();
  assert.ok(v.rows.length >= 4);
  assert.ok(v.rows.every((r) => r.s.length <= 49));
  assert.equal(v.rows[0].s, "word ".repeat(9));   // 49 columns: the row breaks at the last space inside it
  h.key("end");  // end of the first display row
  const [r0] = h.view().cursor; assert.equal(r0, 0);
  h.key("down"); assert.equal(h.view().cursor[0], 1);
  h.key("down"); h.key("down"); h.key("down");
  assert.equal(h.s.row, 1); assert.equal(h.s.col, 5);   // clamped to "short"
});

test("a word longer than a row is broken hard", async () => {
  const h = setup();
  await h.open(fakeFile("x".repeat(120), "x.txt"));
  assert.deepEqual(h.view().rows.map((r) => r.s.length), [49, 49, 22]);
});

test("find, find next with wrap-around, marks on screen", async () => {
  const h = setup();
  await h.open(fakeFile("alpha beta\ngamma beta\ndelta", "f.txt"));
  h.key("f3"); h.type("BETA"); h.key("enter");
  assert.deepEqual([h.s.row, h.s.col], [0, 6]);
  h.key("f4"); assert.deepEqual([h.s.row, h.s.col], [1, 6]);
  h.key("f4"); assert.deepEqual([h.s.row, h.s.col], [0, 6]);
  assert.deepEqual(h.view().marks.map((m) => m.slice(0, 3)), [[0, 6, 4], [1, 6, 4]]);
  h.key("f3"); h.key("backspace"); h.key("backspace"); h.key("backspace"); h.key("backspace"); h.type("zzz"); h.key("enter");
  assert.match(h.s.note, /Not found: zzz/);
});

test("markdown: colours, list continuation, preview", async () => {
  const h = setup();
  await h.open(fakeFile("# Title\n- one\n```\ncode\n```\n> quote\ntext", "n.md"));
  assert.deepEqual(h.view().rows.map((r) => r.color), ["accent", "ink", "blue", "blue", "blue", "muted", "ink"]);
  h.key("down"); h.key("end"); h.key("enter");
  assert.equal(h.s.lines[2], "- "); assert.equal(h.s.col, 2);
  h.key("enter");   // an empty item ends the list
  assert.equal(h.s.lines[2], "");
  h.key("f6");
  const shot = h.def.screen(h.s);
  const items = plain(shot.kids[1].items).map((i) => i.s);
  assert.ok(items.includes("TITLE")); assert.ok(items.includes("• one")); assert.ok(items.includes("code"));
  h.key("f6"); assert.equal(h.s.mode, "edit");
});

test("esc with unsaved changes warns, then discards; open is refused while dirty", async () => {
  const h = setup(), f = fakeFile("keep", "k.txt");
  await h.open(f);
  h.type("X");
  assert.deepEqual(await h.open(fakeFile("other", "o.txt")), { ok: false, why: "the editor has unsaved changes to k.txt" });
  h.key("esc"); assert.match(h.s.note, /Unsaved changes/); assert.equal(h.sent.length, 0);
  h.key("esc");
  assert.equal(h.s.lines[0], "keep"); assert.equal(h.s.dirty, false);
  assert.deepEqual(plain(h.sent.at(-1)), { to: "compositor", type: "open", payload: { app: "files" } });
  assert.deepEqual(await h.open(fakeFile("other", "o.txt")), { ok: true });
});

test("the cursor position is remembered per file", async () => {
  const h = setup();
  await h.open(fakeFile("a\nb\nc", "p.txt")); h.key("down"); h.key("down");
  h.key("esc");
  await h.open(fakeFile("z", "q.txt"));
  await h.open(fakeFile("a\nb\nc", "p.txt"));
  assert.equal(h.s.row, 2);
});

test("keys from anyone but the compositor are ignored", async () => {
  const h = setup();
  await h.open(fakeFile("a", "a.txt"));
  h.def.handlers.key(h.s, { key: "x", ch: "x", state: "down" }, { from: "flaky" });
  assert.equal(h.s.lines[0], "a");
});
