// The agenda: the tasks in notes/todo.txt, grouped by day, with reminders. The file is the database; the editor
// and the agent can change it too, so every change re-reads the file, finds the task's line by its text, and
// writes the file back with only that line changed. Reminders are checked every 15 s in the background and shown
// by the compositor as a banner over whatever app is in front; nothing fires while the wall clock is unknown.
const AG_FILE = "todo.txt", AG_REMIND_WINDOW = 2 * 3600e3, AG_RELOAD_MS = 300e3, AG_FIRED_MAX = 200;
const AG_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const AG_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AG_LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---- lines --------------------------------------------------------------------------------------------------
// "- [ ] dentist @2026-11-03 14:30 !15m": a task; "- text" is an open task too; anything else is kept as is.
const AG_LINE = /^(\s*)- (?:\[([ xX])\] )?(.*)$/;
const AG_DUE = /(^|\s)@(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?(?=\s|$)/;
const AG_LEAD = /(^|\s)!(\d{1,4})([mhd])(?=\s|$)/;
const AG_UNIT = { m: 1, h: 60, d: 1440 };
const pad2 = (n) => String(n).padStart(2, "0");

function agValidDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function agParse(line) {
  const m = AG_LINE.exec(line);
  if (!m) return null;
  const text = m[3], due = AG_DUE.exec(text), lead = AG_LEAD.exec(text);
  let date = null, time = null;
  if (due && agValidDate(+due[2], +due[3], +due[4])) {
    date = due[2] + "-" + due[3] + "-" + due[4];
    if (due[5] !== undefined && +due[5] < 24 && +due[6] < 60) time = due[5] + ":" + due[6];
  }
  const title = text.replace(AG_DUE, " ").replace(AG_LEAD, " ").replace(/\s+/g, " ").trim();
  return { line, done: m[2] === "x" || m[2] === "X", title: title || "(untitled)", date, time,
           lead: lead ? Number(lead[2]) * AG_UNIT[lead[3]] : null, leadText: lead ? "!" + lead[2] + lead[3] : "" };
}
// The same line with its box ticked or cleared; a plain "- text" item gains a box.
function agToggled(line) {
  const m = AG_LINE.exec(line);
  if (!m) return line;
  const done = m[2] === "x" || m[2] === "X";
  return m[1] + "- [" + (done ? " " : "x") + "] " + m[3];
}

// ---- dates ----------------------------------------------------------------------------------------------------
// A day is {y, m, d}; arithmetic goes through UTC midnight so the time zone cannot shift it.
const agDayMs = (t) => Date.UTC(t.y, t.m - 1, t.d);
const agFromMs = (ms) => { const x = new Date(ms); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }; };
const agAdd = (t, n) => agFromMs(agDayMs(t) + n * 86400e3);
const agIso = (t) => t.y + "-" + pad2(t.m) + "-" + pad2(t.d);
const agWeekday = (t) => new Date(agDayMs(t)).getUTCDay();
const agDayOf = (iso) => ({ y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) });
function agToday() {
  if (!clock.set()) return null;
  const x = new Date(clock.wall());   // local, in the device's zone
  return { y: x.getFullYear(), m: x.getMonth() + 1, d: x.getDate() };
}
// The epoch ms of a task's reminder: its local date and time less its lead.
function agRemindAt(t) {
  if (!t.date || !t.time) return null;
  const day = agDayOf(t.date), [hh, mm] = t.time.split(":").map(Number);
  return new Date(day.y, day.m - 1, day.d, hh, mm).getTime() - (t.lead || 0) * 60e3;
}

function agDateWord(word, today) {
  const w = word.toLowerCase();
  if (w === "today" || w === "tod") return today;
  if (w === "tomorrow" || w === "tom" || w === "tmr") return agAdd(today, 1);
  const wd = AG_DAYS.findIndex((d, i) => w === d || w === AG_LONG_DAYS[i].toLowerCase());
  if (wd >= 0) return agAdd(today, ((wd - agWeekday(today) + 6) % 7) + 1);   // the next one, never today
  let m = /^\+(\d{1,3})([dw])$/.exec(w);
  if (m) return agAdd(today, Number(m[1]) * (m[2] === "w" ? 7 : 1));
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(w);
  if (m) return agValidDate(+m[1], +m[2], +m[3]) ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  m = /^(\d{1,2})-(\d{1,2})$/.exec(w);
  if (m) {
    const y = today.y + (+m[1] < today.m || (+m[1] === today.m && +m[2] < today.d) ? 1 : 0);
    return agValidDate(y, +m[1], +m[2]) ? { y, m: +m[1], d: +m[2] } : null;
  }
  return null;
}
function agTimeWord(word) {
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/i.exec(word);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] === undefined ? 0 : +m[2], ap = (m[3] || "").toLowerCase();
  if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (ap === "pm" ? 12 : 0); }
  if (h > 23 || min > 59) return null;
  return pad2(h) + ":" + pad2(min);
}
// "dentist @tue 2pm !15m" -> "dentist @2026-11-03 14:00 !15m". Throws with a message for the user.
function agExpand(input, today) {
  const words = input.trim().split(/\s+/).filter(Boolean), out = [];
  let seenDate = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w[0] === "@" && w.length > 1) {
      if (seenDate) throw new Error("one date per task");
      if (!today && !/^@\d{4}-\d{1,2}-\d{1,2}$/.test(w)) throw new Error("the clock is not set: write the date as @YYYY-MM-DD");
      const day = agDateWord(w.slice(1), today);
      if (!day) throw new Error("unknown date " + w + " (today, tomorrow, mon..sun, +3d, 11-15, 2026-11-15)");
      seenDate = true;
      const next = i + 1 < words.length ? words[i + 1] : "", time = agTimeWord(next);
      if (!time && /^\d{1,2}(:\d{2})?(am|pm)?$/i.test(next)) throw new Error("not a time: " + next);
      if (time) i++;
      out.push("@" + agIso(day) + (time ? " " + time : ""));
    } else if (w[0] === "!" && w.length > 1) {
      if (!/^!\d{1,4}[mhd]$/.test(w)) throw new Error("a reminder is like !15m, !2h or !1d");
      out.push(w);
    } else out.push(w);
  }
  const text = out.join(" ");
  if (!text.replace(AG_DUE, "").replace(AG_LEAD, "").trim()) throw new Error("a task needs some words");
  return text;
}

// ---- grouping -------------------------------------------------------------------------------------------------
const agShort = (t) => AG_DAYS[agWeekday(t)][0].toUpperCase() + AG_DAYS[agWeekday(t)].slice(1) + " " + t.d + " " + AG_MONTHS[t.m - 1];
function agSortDay(a, b) {
  if (!a.time !== !b.time) return a.time ? 1 : -1;   // tasks without a time first
  return a.time && a.time !== b.time ? (a.time < b.time ? -1 : 1) : a.index - b.index;
}
// [{header, items}] in display order. Without a clock (today null) the headers are plain dates.
function agGroups(tasks, today, showDone) {
  const open = tasks.filter((t) => !t.done), groups = [];
  const add = (header, items) => { if (items.length) groups.push({ header, items }); };
  const dated = open.filter((t) => t.date), iso = today ? agIso(today) : null, tom = today ? agIso(agAdd(today, 1)) : null;
  if (today) add("OVERDUE", dated.filter((t) => t.date < iso).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : agSortDay(a, b))));
  const days = [...new Set(dated.map((t) => t.date))].filter((d) => !iso || d >= iso).sort();
  for (const d of days) {
    const day = agDayOf(d);
    const header = d === iso ? "TODAY · " + AG_LONG_DAYS[agWeekday(day)].toUpperCase() + " " + day.d + " " + AG_MONTHS[day.m - 1].toUpperCase()
      : d === tom ? "TOMORROW · " + agShort(day).toUpperCase() : agShort(day).toUpperCase() + (today && day.y === today.y ? "" : " " + day.y);
    add(header, dated.filter((t) => t.date === d).sort(agSortDay));
  }
  add("NO DATE", open.filter((t) => !t.date));
  if (showDone) add("DONE", tasks.filter((t) => t.done));
  return groups;
}

// ---- the file -------------------------------------------------------------------------------------------------
async function agRead(s) {
  if (!s.dir) throw new Error(s.dirError || "no notes folder");
  try { return await s.dir.read(AG_FILE); }
  catch (e) { if (/^no file/.test(e.message)) return ""; throw e; }
}
function agSetText(s, text) {
  s.tasks = [];
  text.split("\n").forEach((line, index) => { const t = agParse(line); if (t) { t.index = index; s.tasks.push(t); } });
  s.loadedAt = now();
  agRows(s);
}
async function agLoad(s) {
  try { agSetText(s, await agRead(s)); s.error = ""; } catch (e) { s.error = e.message; }
}
// Apply edit(lines, i) to the current file, where i is the line that still reads `line` (-1 to add a line).
async function agChange(s, line, edit) {
  let text;
  try { text = await agRead(s); } catch (e) { s.note = e.message; return false; }
  const lines = text === "" ? [] : text.split("\n");
  let i = -1;
  if (line !== null) {
    i = lines.indexOf(line);
    if (i < 0) { agSetText(s, text); s.note = AG_FILE + " changed meanwhile; reloaded."; return false; }
  } else if (lines.length && lines[lines.length - 1] === "") lines.pop();   // append before the final newline
  edit(lines, i);
  const out = lines.join("\n") + (lines.length && line === null ? "\n" : "");
  try { await s.dir.write(AG_FILE, out); } catch (e) { s.note = "Not saved: " + e.message; return false; }
  agSetText(s, out);
  return true;
}

// ---- reminders ------------------------------------------------------------------------------------------------
function agRemind(s) {
  if (!clock.set()) return;
  const t = clock.wall();
  let changed = false;
  for (const task of s.tasks) {
    if (task.done) continue;
    const at = agRemindAt(task);
    if (at === null || at > t || t - at > AG_REMIND_WINDOW) continue;
    const key = at + "|" + task.title;
    if (s.fired[key]) continue;
    s.fired[key] = t; changed = true;
    const late = t - at > 120e3;
    send("compositor", "notify", { text: task.title + " at " + task.time,
      sub: late ? "was due at " + task.time + (task.lead ? " less " + task.leadText.slice(1) : "") : task.lead ? "in " + task.leadText.slice(1) : "now" });
  }
  if (changed) {
    const keys = Object.keys(s.fired).filter((k) => t - s.fired[k] < 2 * 86400e3).sort((a, b) => s.fired[b] - s.fired[a]).slice(0, AG_FIRED_MAX);
    s.fired = Object.fromEntries(keys.map((k) => [k, s.fired[k]]));
    try { store.set("fired", s.fired); } catch (_) {}
  }
}

// ---- the app --------------------------------------------------------------------------------------------------
function agRows(s) {
  const today = agToday(), rows = [];
  for (const g of agGroups(s.tasks, today, s.showDone)) {
    rows.push({ header: g.header });
    for (const t of g.items) rows.push({ task: t });
  }
  s.rows = rows;
  if (s.sel >= rows.length || (rows[s.sel] && rows[s.sel].header)) s.sel = agNext(s, Math.min(s.sel, rows.length - 1), 1);
}
function agNext(s, from, dir) {
  for (let i = from; i >= 0 && i < s.rows.length; i += dir) if (!s.rows[i].header) return i;
  for (let i = from; i >= 0 && i < s.rows.length; i -= dir) if (!s.rows[i].header) return i;
  return -1;
}
const agSelected = (s) => (s.sel >= 0 && s.rows[s.sel] && s.rows[s.sel].task) || null;

async function agOpenEditor(s) {
  const h = s.dir.at(AG_FILE, "rw");
  let r;
  try { r = await ask("editor", "open", { file: h, name: "notes/" + AG_FILE }, { timeout: 3000 }); }
  catch (e) { r = { ok: false, why: e.message }; }
  if (r && r.ok) {
    if (s.given) { s.given.revoke(); s.given.release(); }
    s.given = h;
    send("compositor", "open", { app: "editor" });
  } else { h.revoke(); h.release(); s.note = "Editor: " + ((r && r.why) || "no answer"); }
}

async function agPromptDone(s) {
  const p = s.prompt;
  let text;
  try { text = agExpand(p.value, agToday()); } catch (e) { s.note = e.message; return; }
  s.prompt = null;
  if (p.kind === "new") { if (await agChange(s, null, (lines) => lines.push("- [ ] " + text))) s.note = "Added."; }
  else await agChange(s, p.line, (lines, i) => { const m = AG_LINE.exec(lines[i]); lines[i] = m[1] + "- [" + (m[2] === "x" || m[2] === "X" ? "x" : " ") + "] " + text; });
}

async function agKey(s, k) {
  if (!k || k.state === "up") return;
  const once = k.state !== "hold";
  if (s.prompt) {
    if (k.key === "esc" && once) { s.prompt = null; s.note = ""; return; }
    if (k.key === "enter" && once) return agPromptDone(s);
    if (k.key === "backspace") { s.prompt.value = Array.from(s.prompt.value).slice(0, -1).join(""); return; }
    if (typeof k.ch === "string" && /^[\x20-\x7e]$/.test(k.ch) && s.prompt.value.length < 120) s.prompt.value += k.ch;
    return;
  }
  const t = agSelected(s);
  if (s.confirm && !(k.key === "f5" && once)) s.confirm = null;
  s.note = "";
  switch (k.key) {
    case "up": s.sel = agNext(s, s.sel - 1, -1); if (s.sel < 0) s.sel = agNext(s, 0, 1); return;
    case "down": { const n = agNext(s, s.sel + 1, 1); if (n > s.sel) s.sel = n; return; }
    case "enter": case "space": if (once && t) await agChange(s, t.line, (lines, i) => { lines[i] = agToggled(lines[i]); }); return;
    case "f2": if (once) s.prompt = { kind: "new", value: "" }; return;
    case "f3": if (once && t) s.prompt = { kind: "edit", line: t.line, value: AG_LINE.exec(t.line)[3] }; return;
    case "f4": if (once) { s.showDone = !s.showDone; agRows(s); } return;
    case "f5":
      if (!once || !t) return;
      if (s.confirm !== t.line) { s.confirm = t.line; s.note = "F5 again deletes: " + t.title; return; }
      s.confirm = null;
      if (await agChange(s, t.line, (lines, i) => lines.splice(i, 1))) s.note = "Deleted.";
      return;
    case "f6": if (once && s.dir) return agOpenEditor(s);
  }
}

function agStatus(s) {
  if (s.note) return s.note;
  if (s.error) return s.error;
  if (s.prompt) return "@today @tue @+3d @11-15  14:30 or 2pm  !15m before";
  const open = s.tasks.filter((t) => !t.done).length, done = s.tasks.length - open;
  return (clock.set() ? clock.zone().split(",")[0] : "clock not set: reminders wait") + " · " + open + " open · " + done + " done";
}

app("agenda")
  .title("Agenda")
  .state({ tasks: [], rows: [], sel: 0, showDone: false, prompt: null, confirm: null, note: "", error: "", fired: {},
           loadedAt: -1e9, given: null, day: "" })
  .onStart(async (s) => {
    try { s.dir = hw.fs("fs:/notes"); } catch (e) { s.dirError = e.message; }
    const fired = store.get("fired", {});
    if (fired && typeof fired === "object") s.fired = fired;
    await agLoad(s);
    agRemind(s);
  })
  .on("focus", (s) => agLoad(s))
  .on("key", (s, k, msg) => { if (msg.from === "compositor") return agKey(s, k); })
  // in the background too: pick up changes the editor or the agent made, then remind
  .every(15000, (s) => {
    const today = agToday(), day = today ? agIso(today) : "";
    if (day !== s.day) { s.day = day; agRows(s); }   // midnight, or the clock just got set: regroup
    if (now() - s.loadedAt > AG_RELOAD_MS) agLoad(s).then(() => agRemind(s)); else agRemind(s);
  })
  .screen((s) => {
    const items = s.rows.map((r) => {
      if (r.header) return { label: r.header, color: "accent" };
      const t = r.task, today = agToday(), overdue = today && t.date && t.date < agIso(today);
      return { icon: t.done ? "✓" : "·", iconColor: t.done ? "muted" : "ink", label: (t.time ? t.time + "  " : "") + t.title,
               color: t.done ? "muted" : "", right: overdue ? agShort(agDayOf(t.date)) : t.leadText, rightColor: overdue ? "accent" : "muted" };
    });
    return ui.col({ gap: 4 },
      items.length ? ui.list(items, s.sel, { font: "s", lead: 6, grow: 1 })
        : ui.text(s.error ? "" : "No tasks. F2 adds one, like: dentist @tue 14:30 !15m", { font: "s", color: "muted", wrap: true, grow: 1 }),
      s.prompt ? ui.input(s.prompt.value, { prompt: s.prompt.kind === "new" ? "New: " : "Edit: ", font: "s" }) : ui.gap(0),
      ui.text(agStatus(s), { font: "s", color: s.note || s.error ? "accent" : "muted" }));
  })
  .hints((s) => s.prompt ? "Enter ok  Esc cancel" : "⏎ tick F2 add F3 edit F4 all F5 del F6 ed");
