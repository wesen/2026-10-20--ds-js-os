// The editor: plain text and Markdown, soft-wrapped to the screen. It holds no file claim: Files hands it one file
// (a narrowed handle) with an "open" ask, and it can read and write that file and nothing else. The text is kept
// as logical lines; the cursor is a line and a column in characters; only the rows on screen are wrapped and
// drawn, with a per-line cache of how many rows each line takes, so a 64 KB file costs what a short one does.
const ED_COLS = 49, ED_ROWS = 18, ED_LINE_MAX = 4000, ED_FILE_MAX = 65536, ED_POS_MAX = 20;

const edChars = (s) => Array.from(s);

// Where a logical line breaks on screen: segments [start, end) in characters, at the last space that fits, or
// hard at the width when a word is longer than a row. An empty line is one empty segment.
function edWrap(line, cols) {
  const cs = edChars(line), segs = [];
  let start = 0;
  while (cs.length - start > cols) {
    let end = start + cols;
    for (let i = end; i > start; i--) if (cs[i - 1] === " ") { end = i; break; }
    segs.push([start, end]);
    start = end;
  }
  segs.push([start, cs.length]);
  return segs;
}
function edCount(s, i) { return edWrap(s.lines[i], ED_COLS).length; }
function edRecount(s) { s.wraps = s.lines.map((l) => edWrap(l, ED_COLS).length); }

// The cursor's display row (counted from the top of the text) and column. A column at a break belongs to the next row.
function edDisplay(s, line, col) {
  let r = 0;
  for (let i = 0; i < line; i++) r += s.wraps[i];
  const segs = edWrap(s.lines[line], ED_COLS);
  for (let k = 0; k < segs.length; k++) if (col < segs[k][1] || k === segs.length - 1) return [r + k, col - segs[k][0]];
  return [r, 0];
}
// The logical position at a display row and column (clamped to the row's text).
function edFromDisplay(s, row, dcol) {
  let r = 0;
  for (let i = 0; i < s.lines.length; i++) {
    if (row < r + s.wraps[i]) {
      const segs = edWrap(s.lines[i], ED_COLS), [a, b] = segs[row - r];
      const last = row - r === segs.length - 1;
      return [i, Math.min(a + dcol, last ? b : Math.max(a, b - 1))];
    }
    r += s.wraps[i];
  }
  const last = s.lines.length - 1;
  return [last, edChars(s.lines[last]).length];
}
const edTotal = (s) => s.wraps.reduce((a, n) => a + n, 0);

function edLoad(s, name, text) {
  s.name = name; s.lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  s.row = 0; s.col = 0; s.top = 0; s.goal = -1; s.dirty = false; s.escArmed = false;
  s.find = null; s.mode = "edit"; s.ptop = 0; s.note = "";
  edRecount(s);
}
const edText = (s) => s.lines.join("\n");
const edIsMarkdown = (s) => /\.(md|markdown)$/i.test(s.name || "");

function edScroll(s) {
  const [r] = edDisplay(s, s.row, s.col);
  if (r < s.top) s.top = r;
  if (r >= s.top + ED_ROWS) s.top = r - ED_ROWS + 1;
  s.top = Math.max(0, Math.min(s.top, Math.max(0, edTotal(s) - 1)));
}
function edMoveRows(s, n) {
  const [r, c] = edDisplay(s, s.row, s.col);
  if (s.goal < 0) s.goal = c;
  const target = Math.max(0, Math.min(edTotal(s) - 1, r + n));
  [s.row, s.col] = edFromDisplay(s, target, s.goal);
}
function edEdited(s, from, removed, added) {   // lines [from, from+removed) became `added` lines
  const counts = [];
  for (let i = 0; i < added; i++) counts.push(edCount(s, from + i));
  s.wraps.splice(from, removed, ...counts);
  s.dirty = true; s.escArmed = false; s.goal = -1;
}

function edInsert(s, text) {
  const cs = edChars(s.lines[s.row]);
  if (cs.length + edChars(text).length > ED_LINE_MAX) { s.note = "A line holds at most " + ED_LINE_MAX + " characters."; return; }
  cs.splice(s.col, 0, text);
  s.lines[s.row] = cs.join(""); s.col += edChars(text).length;
  edEdited(s, s.row, 1, 1);
}
function edNewline(s) {
  const cs = edChars(s.lines[s.row]), before = cs.slice(0, s.col).join(""), after = cs.slice(s.col).join("");
  let lead = /^\s*/.exec(before)[0];
  if (edIsMarkdown(s)) {   // continue a list item; an empty item ends the list
    const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(before);
    if (m && !m[3] && !after) { s.lines[s.row] = ""; s.col = 0; edEdited(s, s.row, 1, 1); return; }
    if (m) lead = m[1] + (/\d/.test(m[2]) ? (parseInt(m[2], 10) + 1) + m[2].slice(-1) : m[2]) + " ";
  }
  s.lines.splice(s.row, 1, before, lead + after);
  edEdited(s, s.row, 1, 2);
  s.row++; s.col = edChars(lead).length;
}
function edBackspace(s) {
  if (s.col > 0) {
    const cs = edChars(s.lines[s.row]); cs.splice(s.col - 1, 1); s.lines[s.row] = cs.join(""); s.col--;
    edEdited(s, s.row, 1, 1);
  } else if (s.row > 0) {
    const prev = edChars(s.lines[s.row - 1]).length;
    s.lines.splice(s.row - 1, 2, s.lines[s.row - 1] + s.lines[s.row]);
    s.row--; s.col = prev;
    edEdited(s, s.row, 2, 1);
  }
}
function edDelete(s) {
  const cs = edChars(s.lines[s.row]);
  if (s.col < cs.length) { cs.splice(s.col, 1); s.lines[s.row] = cs.join(""); edEdited(s, s.row, 1, 1); }
  else if (s.row < s.lines.length - 1) { s.lines.splice(s.row, 2, s.lines[s.row] + s.lines[s.row + 1]); edEdited(s, s.row, 2, 1); }
}

// Find: case-insensitive, from the cursor (or just after it, for "next"), on through the text, then wrapping round.
const edUnits = (line, col) => edChars(line).slice(0, col).join("").length;
function edFindNext(s, next) {
  const q = s.find && s.find.query.toLowerCase();
  if (!q) return false;
  const go = (i, at) => { s.row = i; s.col = edChars(s.lines[i].slice(0, at)).length; s.goal = -1; s.note = ""; return true; };
  const here = s.lines[s.row].toLowerCase(), from = edUnits(s.lines[s.row], s.col + (next ? 1 : 0));
  let at = here.indexOf(q, from);
  if (at >= 0) return go(s.row, at);
  for (let k = 1; k < s.lines.length; k++) {
    const i = (s.row + k) % s.lines.length;
    at = s.lines[i].toLowerCase().indexOf(q);
    if (at >= 0) return go(i, at);
  }
  at = here.indexOf(q);
  if (at >= 0 && at < from) return go(s.row, at);
  s.note = "Not found: " + s.find.query;
  return false;
}

// Colours for Markdown: headings accent, fenced code blue, quotes muted. Fences are found by scanning from the top.
function edColors(s, from, to) {
  const out = [];
  let fence = false;
  for (let i = 0; i < to; i++) {
    const l = s.lines[i], isFence = /^\s*```/.test(l);
    if (i >= from) out.push(!edIsMarkdown(s) ? "ink" : fence || isFence ? "blue" : /^#{1,6}\s/.test(l) ? "accent" : /^\s*>/.test(l) ? "muted" : "ink");
    if (isFence) fence = !fence;
  }
  return out;
}

// The rows on screen, the cursor's place among them, and the find marks.
function edView(s) {
  let r = 0, i = 0;
  while (i < s.lines.length && r + s.wraps[i] <= s.top) r += s.wraps[i++];
  const rows = [], marks = [], first = i;
  const lastLine = Math.min(s.lines.length, i + ED_ROWS + 1);
  const colors = edColors(s, first, lastLine);
  const q = s.find && s.find.query ? s.find.query.toLowerCase() : "";
  for (; i < s.lines.length && rows.length < ED_ROWS; i++) {
    const cs = edChars(s.lines[i]), segs = edWrap(s.lines[i], ED_COLS);
    for (let k = 0; k < segs.length && rows.length < ED_ROWS; k++) {
      if (r + k < s.top) continue;
      const text = cs.slice(segs[k][0], segs[k][1]).join("");
      if (q) {
        const low = text.toLowerCase();
        for (let at = low.indexOf(q); at >= 0; at = low.indexOf(q, at + 1))
          marks.push([rows.length, edChars(text.slice(0, at)).length, edChars(q).length, "soft"]);
      }
      rows.push({ s: text, color: colors[i - first] });
    }
    r += segs.length;
  }
  const [cr, cc] = edDisplay(s, s.row, s.col);
  return { rows, marks, cursor: s.mode === "edit" ? [cr - s.top, cc] : null };
}

// A reading view: headings, paragraphs joined, bullets, code blocks; markers removed.
function edPreview(s) {
  const items = [];
  let para = "", fence = false;
  const flush = () => { if (para) items.push({ s: para }); para = ""; };
  for (const l of s.lines) {
    if (/^\s*```/.test(l)) { flush(); fence = !fence; continue; }
    if (fence) { items.push({ s: l || " ", color: "blue", indent: 2 }); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(l), li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(l), q = /^\s*>\s?(.*)$/.exec(l);
    const plain = (t) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    if (h) { flush(); items.push({ s: " " }); items.push({ s: plain(h[2]).toUpperCase(), color: h[1].length < 3 ? "accent" : "ink" }); }
    else if (li) { flush(); items.push({ s: (/\d/.test(li[1]) ? li[1] : "•") + " " + plain(li[2]), indent: 2 }); }
    else if (q) { flush(); items.push({ s: plain(q[1]), color: "muted", indent: 2 }); }
    else if (!l.trim()) { flush(); items.push({ s: " " }); }
    else para += (para ? " " : "") + plain(l.trim());
  }
  flush();
  return items;
}

function edRemember(s) {
  if (!s.name) return;
  const pos = store.get("pos", {}) || {};
  pos[s.name] = [s.row, s.col, s.top, Date.now ? Date.now() : 0];
  const names = Object.keys(pos).sort((a, b) => pos[b][3] - pos[a][3]).slice(0, ED_POS_MAX);
  const keep = {};
  for (const n of names) keep[n] = pos[n];
  store.set("pos", keep);
}
function edRestore(s) {
  const p = (store.get("pos", {}) || {})[s.name];
  if (!p) return;
  s.row = Math.min(p[0], s.lines.length - 1); s.col = Math.min(p[1], edChars(s.lines[s.row]).length); s.top = p[2] || 0;
  edScroll(s);
}

// A save is a file promise that settles some segments later (on the device, after the flash write). Keys keep
// arriving meanwhile: edits made during it keep the buffer dirty, and Esc waits for the write and then leaves.
async function edSave(s) {
  if (!s.file) { s.note = "No file to save to."; return; }
  if (s.saving) { s.note = "Saving..."; return; }
  const text = edText(s);
  if (text.length > ED_FILE_MAX) { s.note = "Too large to save: a file holds at most 64 KB."; return; }
  s.saving = true; s.note = "Saving...";
  try {
    const r = await s.file.write(text);
    s.saved = text; s.dirty = edText(s) !== text;
    if (!s.dirty) s.escArmed = false;
    s.note = "Saved " + r.bytes + " bytes.";
    edRemember(s);
    if (s.leaveAfterSave && !s.dirty) send("compositor", "open", { app: "files" });
  } catch (e) { s.note = "Not saved: " + e.message; }
  s.saving = false; s.leaveAfterSave = false;
}

function edKey(s, k) {
  if (!k || k.state === "up") return;
  const once = k.state !== "hold";
  if (!s.file) { if (k.key === "esc" && once) send("compositor", "open", { app: "files" }); return; }
  if (s.mode === "find") {
    if (k.key === "esc" && once) { s.mode = "edit"; s.find = null; s.note = ""; return; }
    if (k.key === "enter" && once) { s.mode = "edit"; edFindNext(s, false); edScroll(s); return; }
    if (k.key === "backspace") { s.find.query = edChars(s.find.query).slice(0, -1).join(""); return; }
    if (typeof k.ch === "string" && /^[\x20-\x7e]$/.test(k.ch) && s.find.query.length < 60) s.find.query += k.ch;
    return;
  }
  if (s.mode === "preview") {
    if ((k.key === "f6" || k.key === "esc") && once) { s.mode = "edit"; return; }
    if (k.key === "down" || k.key === "pgdn") s.ptop += k.key === "down" ? 1 : ED_ROWS - 2;
    if (k.key === "up" || k.key === "pgup") s.ptop = Math.max(0, s.ptop - (k.key === "up" ? 1 : ED_ROWS - 2));
    return;
  }
  s.note = "";
  switch (k.key) {
    case "f2": if (once) return edSave(s); return;
    case "f3": if (once) { s.mode = "find"; s.find = { query: s.find ? s.find.query : "" }; } return;
    case "f4": if (once) { if (!s.find || !s.find.query) s.note = "F3 to find first."; else { edFindNext(s, true); edScroll(s); } } return;
    case "f5": if (once) { if (s.row === 0 && s.col === 0) { s.row = s.lines.length - 1; s.col = edChars(s.lines[s.row]).length; } else { s.row = 0; s.col = 0; } s.goal = -1; edScroll(s); } return;
    case "f6": if (once) { s.mode = "preview"; s.ptop = 0; } return;
    case "esc":
      if (!once) return;
      if (s.saving) { s.leaveAfterSave = true; s.note = "Saving; back to Files once it is written."; return; }
      if (s.dirty && !s.escArmed) { s.escArmed = true; s.note = "Unsaved changes. F2 saves; Esc again discards them."; return; }
      if (s.dirty) { edLoad(s, s.name, s.saved); s.note = "Changes discarded."; }
      edRemember(s);
      send("compositor", "open", { app: "files" });
      return;
    case "left": if (s.col > 0) s.col--; else if (s.row > 0) { s.row--; s.col = edChars(s.lines[s.row]).length; } s.goal = -1; break;
    case "right": if (s.col < edChars(s.lines[s.row]).length) s.col++; else if (s.row < s.lines.length - 1) { s.row++; s.col = 0; } s.goal = -1; break;
    case "up": edMoveRows(s, -1); break;
    case "down": edMoveRows(s, 1); break;
    case "pgup": edMoveRows(s, -(ED_ROWS - 2)); break;
    case "pgdn": edMoveRows(s, ED_ROWS - 2); break;
    case "home": { const [r] = edDisplay(s, s.row, s.col); [s.row, s.col] = edFromDisplay(s, r, 0); s.goal = -1; break; }
    case "end": { const [r] = edDisplay(s, s.row, s.col); [s.row, s.col] = edFromDisplay(s, r, ED_COLS); s.goal = -1; break; }
    case "enter": edNewline(s); break;
    case "backspace": edBackspace(s); break;
    case "del": edDelete(s); break;
    case "tab": edInsert(s, "  "); break;
    default:
      if (typeof k.ch === "string" && k.ch.length === 1 && k.ch >= " " && k.ch !== "\x7f") edInsert(s, k.ch);
      else return;
  }
  edScroll(s);
}

function edStatus(s) {
  if (!s.file) return "No file";
  if (s.mode === "find") return "Find: " + s.find.query + "_";
  if (s.note) return s.note;
  const [r, c] = [s.row + 1, s.col + 1];
  return (s.dirty ? "* " : "") + s.name + "  " + r + ":" + c;
}

app("editor")
  .title("Editor")
  .state({ name: "", lines: [""], wraps: [1], row: 0, col: 0, top: 0, goal: -1, dirty: false, escArmed: false, saving: false, leaveAfterSave: false,
           find: null, mode: "edit", ptop: 0, note: "", file: null, saved: "" })
  .on("open", async (s, m) => {
    // a refused file is released at once; an accepted one replaces (and releases) the one held before
    if (s.dirty) { m.file.release(); return { ok: false, why: "the editor has unsaved changes to " + s.name }; }
    let text = "";
    try { text = await m.file.read(); } catch (e) { if (!/^no file/.test(e.message)) { m.file.release(); return { ok: false, why: e.message }; } }
    edRemember(s);
    if (s.file && s.file !== m.file) s.file.release();
    s.file = m.file; s.saved = text;
    edLoad(s, String(m.name || m.file.path || "untitled"), text);
    edRestore(s);
    return { ok: true };
  })
  .on("key", (s, k, msg) => { if (msg.from === "compositor") return edKey(s, k); })
  .screen((s) => {
    if (!s.file) return ui.col({ gap: 8 }, ui.text("No file open.", { font: "m" }),
      ui.text("Open one from Files (d on the home screen). The editor can only touch files you open there.", { wrap: true, font: "s", color: "muted" }));
    const status = ui.text(edStatus(s), { font: "s", color: s.note || s.mode === "find" ? "accent" : "muted" });
    if (s.mode === "preview") return ui.col({ gap: 4 }, status, ui.lines(edPreview(s), { font: "s", lead: 2, grow: 1, scroll: s.ptop }));
    const v = edView(s);
    return ui.col({ gap: 4 }, status, ui.textarea(v.rows, { cursor: v.cursor, marks: v.marks, font: "s", lead: 2, grow: 1 }));
  })
  .hints((s) => !s.file ? "Esc Files" : s.mode === "find" ? "type to find  Enter go  Esc cancel"
    : s.mode === "preview" ? "Up/Dn scroll  F6 edit" : "F2 save F3 find F4 next F6 view Esc back");
