// Logs: the kernel's log ring (sys.log, claim sys.log): crashes, what worlds print, and on the device ESP-IDF's own
// lines (Wi-Fi, files). It reads what is new while it is in front; meanwhile the ring keeps the last 256 lines, and
// a gap in the line numbers shows as "… N lines are gone".
const LG_KEEP = 400, LG_PAGE = 64, LG_STEP = 10;
const LG_ESP = /^[IWEDV] \(\d+\) /;
const LG_PROBLEM = /crash|fail|error|refus|denied|cannot|^E \(|^W \(/i;
const LG_FILTERS = [
  ["all", () => true],
  ["problems", (l) => l.lost || LG_PROBLEM.test(l.s)],
  ["kernel", (l) => l.lost || !LG_ESP.test(l.s)],
  ["ESP-IDF", (l) => l.lost || LG_ESP.test(l.s)],
];
const lgPad = (n) => String(n).padStart(2, "0");

// Everything after the last line read, a page at a time, with a marker where the ring has overwritten lines.
function lgRead(s) {
  for (let page = 0; page < 8; page++) {
    let r;
    try { r = sys.log(s.after); s.error = ""; } catch (e) { s.error = e.message; return; }
    if (page === 0 && r.first > s.after + 1) s.lines.push({ n: r.first - 0.5, lost: r.first - s.after - 1 });
    for (const l of r.lines) s.lines.push(l);
    if (r.lines.length) s.after = r.lines[r.lines.length - 1].n;
    if (r.lines.length < LG_PAGE) break;
  }
  if (s.lines.length > LG_KEEP) s.lines.splice(0, s.lines.length - LG_KEEP);
}

function lgStamp(l) {
  if (l.wall >= 0) { const d = new Date(l.wall); return lgPad(d.getHours()) + ":" + lgPad(d.getMinutes()) + ":" + lgPad(d.getSeconds()); }
  return (l.t / 1000).toFixed(1) + "s";
}

// What is shown: the filter's lines, up to the last one there was when scrolling back began (so the view holds still).
function lgShown(s) {
  const keep = LG_FILTERS[s.filter][1];
  return s.lines.filter((l) => keep(l) && (s.scroll === 0 || l.n <= s.frozenAt));
}

function lgKey(s, k) {
  if (!k || k.state === "up") return;
  const back = (by) => {
    if (s.scroll === 0) s.frozenAt = s.after;
    s.scroll = Math.max(0, Math.min(s.scroll + by, 3 * s.lines.length));
  };
  switch (k.key) {
    case "up": return back(1);
    case "down": return back(-1);
    case "pgup": return back(LG_STEP);
    case "pgdn": return back(-LG_STEP);
    case "home": return back(1e6);
    case "end": case "f3": s.scroll = 0; return;
    case "f2": if (k.state === "down") { s.filter = (s.filter + 1) % LG_FILTERS.length; s.scroll = 0; } return;
  }
}

// Only what can be on screen goes into the frame. The view ends s.scroll rows above the bottom and every line is at
// least one row, so the last s.scroll + LG_WINDOW lines hold it. Sending all of them (up to 400) made each frame tens
// of kilobytes that the compositor parsed and word-wrapped on every draw, past its budget (PICOCALC-SPEED).
const LG_WINDOW = 32;   // more than the rows the screen has for them
function lgScreen(s) {
  const shown = lgShown(s), recent = shown.slice(Math.max(0, shown.length - s.scroll - LG_WINDOW));
  const items = recent.map((l) => l.lost
    ? { s: `… ${l.lost} line${l.lost === 1 ? " is" : "s are"} gone`, color: "blue" }
    : { s: lgStamp(l) + " " + l.s, color: LG_PROBLEM.test(l.s) ? "accent" : LG_ESP.test(l.s) ? "muted" : "ink" });
  const where = s.scroll ? "held, End follows" : "following";
  return ui.col({ gap: 4 },
    ui.lines(items.length ? items : [{ s: s.error ? "" : "Nothing logged yet.", color: "muted" }], { font: "s", bottom: true, scroll: s.scroll, grow: 1 }),
    ui.text(s.error || `${LG_FILTERS[s.filter][0]} · ${s.lines.filter((l) => !l.lost).length} lines · ${where}`,
            { font: "s", color: s.error ? "accent" : "muted" }));
}

app("logs")
  .title("Logs")
  .state({ lines: [], after: 0, filter: 0, scroll: 0, frozenAt: 0, focused: false, error: "" })
  .on("focus", (s) => { s.focused = true; lgRead(s); })
  .on("blur", (s) => { s.focused = false; })
  .on("key", (s, k, msg) => { if (msg.from === "compositor") lgKey(s, k); })
  .every(500, (s) => { if (s.focused) lgRead(s); })
  .screen(lgScreen)
  .hints("↑↓ scroll  End follow  F2 filter");
