// A small, distraction-free terminal for the agent service. The app never waits for a network
// promise: it remains a separate world while agent owns the conversation and tool policy.
const CHAT_COLS = 49, CHAT_ROWS = 15, CHAT_PROMPT_LIMIT = 2048, CHAT_VIEW_LIMIT = 12288, CHAT_MAX_ROWS = 1024;
const CHAT_APPROVAL_MAX_ROWS = 2048;
const CHAT_PHASES = ["idle", "requesting", "tools", "approval", "done", "cancelled", "error"];
const CHAT_BUSY = ["requesting", "tools", "approval"];
const CHAT_LABELS = { user: "YOU", assistant: "ASSISTANT", tool: "TOOL", system: "SYSTEM" };
const CHAT_COLORS = { user: "accent", assistant: "ink", tool: "blue", system: "muted" };
const CHAT_PUNCT = { "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
  "\u2013": "-", "\u2014": "--", "\u00a0": " ", "\u00d7": "*", "\u00f7": "/",
  "\u2264": "<=", "\u2265": ">=", "\u2260": "!=", "\u2212": "-" };
const CHAT_GLYPHS = "▸▾◂•…←→↑↓▲▼✓✕°·█▒░─│┌┐└┘├┤┬┴┼⏎⌫";

// Only the view is normalized; the agent retains the original UTF-8 text. The panel's fonts contain
// ASCII plus a small fixed set of symbols. Unsupported glyphs are visible question marks.
function chatDisplayText(value) {
  let out = "";
  for (const c of String(value)) {
    if (c === "\r") continue;
    if (c === "\t") out += "    ";
    else if (c === "\n" || (c >= " " && c <= "~") || CHAT_GLYPHS.includes(c)) out += c;
    else out += CHAT_PUNCT[c] || "?";
  }
  return out;
}

// Wrap once per state update, not once per keystroke. At most 15 already-wrapped rows cross to the
// compositor, keeping both its heap and its per-segment work independent of conversation length.
function chatWrap(text, color, maxRows = CHAT_MAX_ROWS, requireComplete = false) {
  const chunks = [];
  let count = 0, truncated = false;
  const view = chatDisplayText(text);
  let end = view.length;
  // Walk paragraphs backwards so even a reply containing thousands of blank lines cannot allocate
  // thousands of row objects. Retain the newest part, just like the bounded conversation view.
  while (end >= 0 && count < maxRows) {
    const sep = end > 0 ? view.lastIndexOf("\n", end - 1) : -1;
    const para = view.slice(sep + 1, end), partRows = [];
    let rest = para;
    if (!rest.length) partRows.push({ s: "", color });
    while (rest.length) {
      let cut = Math.min(CHAT_COLS, rest.length);
      if (cut < rest.length) {
        const space = rest.lastIndexOf(" ", cut);
        if (space > 0 && /\S/.test(rest.slice(0, space))) cut = space;
      }
      const part = rest.slice(0, cut);
      const lead = part.length - part.trimStart().length;
      // ui.lines otherwise discards leading spaces during its own wrapping.
      partRows.push({ s: part.slice(lead), color, indent: Math.min(lead, CHAT_COLS - 1) });
      rest = rest.slice(cut);
      if (rest[0] === " ") rest = rest.slice(1);
    }
    const take = Math.min(partRows.length, maxRows - count);
    if (take < partRows.length) truncated = true;
    chunks.push(partRows.slice(-take)); count += take;
    if (sep < 0) { end = -1; break; }
    end = sep;
  }
  if (requireComplete && (truncated || end >= 0)) throw new Error("Approval has too many lines to review. Esc cancels.");
  const rows = [];
  for (let i = chunks.length - 1; i >= 0; i--) for (const row of chunks[i]) rows.push(row);
  return rows;
}

function chatRows(entries, error, approval) {
  if (approval) {
    // Review the complete proposal independently of the transcript cache. The service's 1536-char
    // note limit fits here even when every character is a newline. Never cut an approvable action.
    return [{ s: "APPROVAL REQUIRED", color: "accent" }, { s: "Tool: " + approval.name, color: "blue" }]
      .concat(chatWrap(approval.summary, "ink", CHAT_APPROVAL_MAX_ROWS - 3, true),
        [{ s: "F4 allow this action   F5 deny", color: "accent" }]);
  }
  let rows = [];
  // The service has its own limits. Bound untrusted snapshots here too, including record count.
  const kept = [];
  let left = CHAT_VIEW_LIMIT;
  for (let i = entries.length - 1; i >= Math.max(0, entries.length - 64) && left > 0; i--) {
    const e = entries[i];
    if (!e || typeof e.text !== "string") continue;
    const role = Object.prototype.hasOwnProperty.call(CHAT_LABELS, e.role) ? e.role : "system";
    const text = e.text.length > left ? "[Earlier text omitted]\n" + e.text.slice(-left) : e.text;
    kept.unshift({ role, text });
    left -= text.length;
  }
  for (const e of kept) {
    rows.push({ s: CHAT_LABELS[e.role], color: CHAT_COLORS[e.role] });
    rows = rows.concat(chatWrap(e.text, e.role === "tool" ? "muted" : "ink")).slice(-CHAT_MAX_ROWS);
    rows.push({ s: "", color: "muted" });
  }
  if (error) rows = rows.concat(chatWrap("ERROR: " + error.slice(0, 1024), "accent"));
  if (!rows.length) rows = chatWrap(
    "Ask a question or give the agent a task.\n\n" +
    "Enter sends your prompt.\n" +
    "Up/Down or PgUp/PgDn read the conversation.\n" +
    "F2 starts a new chat. F3 retries a turn.\n" +
    "Esc stops a running turn or clears a draft.\n\n" +
    "Actions that need approval show their details before you choose F4 or F5.", "muted");
  return rows.slice(-CHAT_MAX_ROWS);
}

function chatState(s, state) {
  if (!state || !CHAT_PHASES.includes(state.phase) || !Array.isArray(state.entries)) return;
  const previousApproval = !!s.approval;
  const oldMax = Math.max(0, s.rows.length - CHAT_ROWS);
  const oldFirst = oldMax - s.scroll;
  s.phase = state.phase;
  s.run = state.run;
  s.model = typeof state.model === "string" ? chatDisplayText(state.model.slice(0, 64)) : "";
  s.error = typeof state.error === "string" ? state.error.slice(0, 1024) : "";
  const a = state.approval;
  let reviewError = "";
  s.approval = null;
  if (a && state.phase === "approval") {
    if (typeof a.id !== "string" || a.id.length > 160 || typeof a.name !== "string" || a.name.length > 64 || typeof a.summary !== "string")
      reviewError = "Invalid approval. Esc cancels this action.";
    else if (a.summary.length > CHAT_VIEW_LIMIT)
      reviewError = "Approval text is too long to review. Esc cancels.";
    else if (/[^\x20-\x7e\n]/.test(a.summary))
      reviewError = "Approval text must be escaped for review. Esc cancels.";
    else s.approval = { id: a.id, name: a.name, summary: a.summary };
  }
  try { s.rows = chatRows(state.entries, reviewError || s.error, s.approval); }
  catch (e) {
    s.approval = null; reviewError = String(e.message || e);
    s.rows = chatRows(state.entries, reviewError, null);
  }
  const max = Math.max(0, s.rows.length - CHAT_ROWS);
  s.scroll = s.approval ? max : previousApproval || reviewError ? 0 : s.scroll ? Math.max(0, Math.min(max, max - oldFirst)) : 0;
  s.note = reviewError;
  s.ready = true;
}

function chatStatus(s) {
  if (s.note) return s.note.slice(0, CHAT_COLS);
  if (!s.ready) return "Starting agent...";
  const labels = { idle: "Ready", requesting: "Waiting for model...", tools: "Running tools...",
    approval: "Review the requested action", done: "Ready", cancelled: "Stopped", error: "Request failed" };
  const label = s.approval ? "Approval: " + chatDisplayText(s.approval.name) : labels[s.phase];
  if (s.scroll) return (label + " | reading history | " + s.scroll + " lines up").slice(0, CHAT_COLS);
  return (label + (s.model ? " | " + s.model : "")).slice(0, CHAT_COLS);
}

function chatKey(s, k) {
  if (!k || k.state === "up") return;
  const once = k.state !== "hold";
  if (k.key === "pgup" || k.key === "up") {
    s.scroll = Math.min(Math.max(0, s.rows.length - CHAT_ROWS), s.scroll + (k.key === "up" ? 1 : 12));
    return;
  }
  if (k.key === "pgdn" || k.key === "down") {
    s.scroll = Math.max(0, s.scroll - (k.key === "down" ? 1 : 12)); return;
  }
  if (k.key === "f2" && once) {
    send("agent", "agent.new", {});
    s.line = ""; s.cur = 0; s.scroll = 0; s.note = "Starting a new chat..."; return;
  }
  if (k.key === "esc" && once) {
    if (CHAT_BUSY.includes(s.phase)) { send("agent", "agent.cancel", {}); s.scroll = 0; s.note = "Stopping..."; }
    else { s.line = ""; s.cur = 0; s.note = ""; }
    return;
  }
  if (s.approval) {
    if (once && (k.key === "f4" || k.key === "f5")) {
      send("agent", "agent.approve", { id: s.approval.id, allow: k.key === "f4" });
      s.approval = null; s.phase = "tools"; s.scroll = 0; s.note = "Sending your decision...";
      return;
    }
  }
  if (k.key === "f3" && once) {
    if (CHAT_BUSY.includes(s.phase)) { s.note = s.approval ? "F4 allows this action; F5 denies it." : "Wait for this turn, or Esc to stop it."; return; }
    send("agent", "agent.retry", {}); s.phase = "requesting"; s.scroll = 0; s.note = "Retrying..."; return;
  }
  if (k.key === "enter" && once) {
    if (!s.ready) { s.note = "The agent is still starting."; return; }
    if (CHAT_BUSY.includes(s.phase)) { s.note = s.approval ? "F4 allows this action; F5 denies it." : "Wait for this turn, or Esc to stop it."; return; }
    const text = s.line.trim();
    if (!text) return;
    send("agent", "agent.submit", { text });
    s.line = ""; s.cur = 0; s.scroll = 0; s.phase = "requesting"; s.note = ""; return;
  }
  const chars = Array.from(s.line);
  if (k.key === "left") s.cur = Math.max(0, s.cur - 1);
  else if (k.key === "right") s.cur = Math.min(chars.length, s.cur + 1);
  else if (k.key === "home") s.cur = 0;
  else if (k.key === "end") s.cur = chars.length;
  else if (k.key === "backspace") {
    if (s.cur > 0) { chars.splice(s.cur - 1, 1); s.cur--; s.line = chars.join(""); }
  } else if (k.key === "del") { chars.splice(s.cur, 1); s.line = chars.join(""); }
  else if (typeof k.ch === "string" && k.ch.length && /^[\x20-\x7e]+$/.test(k.ch)) {
    if (s.line.length + k.ch.length > CHAT_PROMPT_LIMIT) { s.note = "Prompt limit: 2048 characters. Send or shorten it."; return; }
    chars.splice(s.cur, 0, k.ch); s.cur += k.ch.length; s.line = chars.join("");
  } else return;
  s.note = "";
}

app("chat")
  .title("Agent")
  .needs("worlds.status")
  .state({ line: "", cur: 0, scroll: 0, phase: "idle", model: "", run: 0, error: "", approval: null,
    rows: [], ready: false, note: "" })
  .onStart((s) => { s.rows = chatRows([], "", null); send("agent", "agent.snapshot", {}); })
  .on("focus", (s, p, msg) => { if (msg.from === "compositor") send("agent", "agent.snapshot", {}); })
  .on("agent.state", (s, state, msg) => { if (msg.from === "agent") chatState(s, state); })
  .on("key", (s, key, msg) => { if (msg.from === "compositor") chatKey(s, key); })
  .on("worlds.status", (s, st, msg) => {
    if (msg.from !== null || !st || st.world !== "agent") return;
    if (st.state === "running") { s.ready = false; send("agent", "agent.snapshot", {}); }
    else if (st.state === "crashed" || st.state === "stopped") {
      s.phase = "error"; s.approval = null; s.ready = false;
      s.note = st.state === "stopped" ? "Agent stopped; console: restart agent" : "Agent restarting; this draft is kept.";
    }
  })
  .screen((s) => {
    const end = Math.max(0, s.rows.length - s.scroll);
    return ui.col({ gap: 4 },
      ui.text(chatStatus(s), { font: "s", color: s.phase === "error" || s.approval ? "accent" : "muted" }),
      ui.lines(s.rows.slice(Math.max(0, end - CHAT_ROWS), end), { font: "s", lead: 2, grow: 1 }),
      ui.input(s.line, { cursor: s.cur, prompt: "> ", font: "m" }),
    );
  })
  .hints((s) => s.approval ? "F4 allow  F5 deny  Esc stop"
    : CHAT_BUSY.includes(s.phase) ? "Esc stop  PgUp/Dn read"
    : "Enter send F2 new F3 retry PgUp/Dn read");
