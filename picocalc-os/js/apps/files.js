// Files: the filesystem, browsed. This world holds the claim fs:/ and is the only app that does; other apps get
// one file at a time. To open a file it narrows its root handle to that file, offers the narrowed handle to the
// editor with an "open" ask, and, once the editor has taken it, revokes the handle it gave the editor before, so a
// file handle never outlives the user's choice.
const FI_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9 _.-]{0,62}[A-Za-z0-9_-])?$/;   // FAT drops a trailing space or dot

const fiJoin = (s, name) => (s.path ? s.path + "/" + name : name);
const fiSize = (n) => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB"
  : n < 1073741824 ? (n / 1048576).toFixed(1) + " MB" : (n / 1073741824).toFixed(1) + " GB";

async function fiLoad(s, keepName) {
  try {
    const list = await s.root.list(s.path);
    s.items = list.filter((e) => !e.more).sort((a, b) => (b.dir - a.dir) || (a.name < b.name ? -1 : 1));
    s.more = list.some((e) => e.more);
    const i = keepName ? s.items.findIndex((e) => e.name === keepName) : -1;
    s.sel = i >= 0 ? i : Math.min(s.sel, Math.max(0, s.items.length - 1));
  } catch (e) { s.items = []; s.note = e.message; }
  try { const i = await s.root.info(); s.free = i.free; } catch (_) { s.free = -1; }
}

async function fiOpen(s, path) {
  const h = s.root.at(path, "rw");
  let r;
  try { r = await ask("editor", "open", { file: h, name: path }, { timeout: 3000 }); }
  catch (e) { r = { ok: false, why: e.message }; }
  if (r && r.ok) {
    if (s.given) { s.given.revoke(); s.given.release(); }
    s.given = h;
    send("compositor", "open", { app: "editor" });
  } else {
    h.revoke(); h.release();
    s.note = "Editor: " + (r && r.why || "no answer");
  }
}

async function fiPromptDone(s) {
  const p = s.prompt, name = p.value.trim();
  s.prompt = null;
  if (!FI_NAME.test(name)) { s.note = "Names: letters, digits, space . _ - (64 at most), not ending in a space or dot."; return; }
  try {
    if (p.kind === "file") { await fiOpen(s, fiJoin(s, name)); await fiLoad(s, name); return; }
    if (p.kind === "dir") await s.root.mkdir(fiJoin(s, name));
    if (p.kind === "rename") await s.root.rename(fiJoin(s, p.old), fiJoin(s, name));
    await fiLoad(s, name);
  } catch (e) { s.note = e.message; }
}

async function fiKey(s, k) {
  if (!k || k.state === "up") return;
  const once = k.state !== "hold";
  if (s.prompt) {
    if (k.key === "esc" && once) { s.prompt = null; return; }
    if (k.key === "enter" && once) return fiPromptDone(s);
    if (k.key === "backspace") { s.prompt.value = Array.from(s.prompt.value).slice(0, -1).join(""); return; }
    if (typeof k.ch === "string" && /^[\x20-\x7e]$/.test(k.ch) && s.prompt.value.length < 64) s.prompt.value += k.ch;
    return;
  }
  const it = s.items[s.sel];
  if (s.confirm && !(k.key === "f5" && once)) { s.confirm = null; s.note = ""; }
  s.note = s.confirm ? s.note : "";
  switch (k.key) {
    case "up": s.sel = Math.max(0, s.sel - 1); return;
    case "down": s.sel = Math.min(Math.max(0, s.items.length - 1), s.sel + 1); return;
    case "pgup": s.sel = Math.max(0, s.sel - 10); return;
    case "pgdn": s.sel = Math.min(Math.max(0, s.items.length - 1), s.sel + 10); return;
    case "enter": case "right":
      if (!once || !it) return;
      if (it.dir) { s.path = fiJoin(s, it.name); s.sel = 0; return fiLoad(s); }
      if (k.key === "enter") return fiOpen(s, fiJoin(s, it.name));
      return;
    case "backspace": case "left":
      if (!once || !s.path) return;
      { const up = s.path.split("/"), name = up.pop(); s.path = up.join("/"); return fiLoad(s, name); }
    case "f2": if (once) s.prompt = { kind: "file", label: "New file: ", value: "" }; return;
    case "f3": if (once) s.prompt = { kind: "dir", label: "New folder: ", value: "" }; return;
    case "f4": if (once && it) s.prompt = { kind: "rename", label: "Rename to: ", value: it.name, old: it.name }; return;
    case "f5":
      if (!once || !it) return;
      if (!s.confirm || s.confirm !== it.name) { s.confirm = it.name; s.note = "F5 again deletes " + it.name + (it.dir ? " (it must be empty)" : ""); return; }
      s.confirm = null;
      try { await s.root.remove(fiJoin(s, it.name)); s.note = "Deleted " + it.name; await fiLoad(s); } catch (e) { s.note = e.message; }
      return;
  }
}

app("files")
  .title("Files")
  .state({ path: "", items: [], sel: 0, free: -1, more: false, note: "", prompt: null, confirm: null, given: null })
  .onStart(async (s) => {
    try { s.root = hw.fs("fs:/"); } catch (e) { s.note = e.message; return; }
    await fiLoad(s);
  })
  .on("focus", (s) => (s.root ? fiLoad(s, s.items[s.sel] && s.items[s.sel].name) : undefined))
  .on("key", (s, k, msg) => { if (msg.from === "compositor") return fiKey(s, k); })
  .screen((s) => ui.col({ gap: 4 },
    ui.row({ gap: 6 },
      ui.text("/" + s.path, { font: "s", color: "ink", grow: 1 }),
      ui.text(s.free >= 0 ? fiSize(s.free) + " free" : "", { font: "s", color: "muted", align: "right" })),
    s.items.length
      ? ui.list(s.items.map((e) => ({ label: e.dir ? e.name + "/" : e.name, right: e.dir ? "" : fiSize(e.size), color: e.dir ? "blue" : "" })),
          s.sel, { font: "s", lead: 6, grow: 1 })
      : ui.text(s.path ? "Empty folder. Backspace goes up." : "No files yet. F2 makes one.", { font: "s", color: "muted", grow: 1 }),
    s.prompt ? ui.input(s.prompt.value, { prompt: s.prompt.label, font: "s" }) : ui.gap(0),
    ui.text(s.note || (s.more ? "Only the first 256 entries are shown." : ""), { font: "s", color: "accent", wrap: true }),
  ))
  .hints((s) => s.prompt ? "Enter ok  Esc cancel" : "⏎ open F2 new F3 dir F4 rename F5 del");
