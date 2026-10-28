// The system monitor: every world (state, turns, share of the lane, arena used of its limit), the handles,
// the buses, and the display driver's refresh planner. Swipe left and right to page through long tables.
var TABS = ["Worlds", "Handles", "Buses", "Display"];
var ROWS = 14;

function compact(n) { return n < 10000 ? String(n) : n < 1e6 ? Math.round(n / 1000) + "k" : (n / 1e6).toFixed(1) + "M"; }

function sample(s) {
  var st = sys.stats(), ws = sys.worlds(["name", "state", "turns", "cpu_ms", "mem_kb", "limit_kb", "last_error"]), dt = st.t_ms - (s.last ? s.last.t : 0), prev = {};
  (s.last ? s.last.ws : []).forEach(function (w) { prev[w.name] = w.cpu_ms; });
  s.cpu = {};
  ws.forEach(function (w) { s.cpu[w.name] = dt > 0 ? Math.round(100 * (w.cpu_ms - (prev[w.name] || 0)) / dt) : 0; });
  s.lane = dt > 0 && s.last ? Math.round(100 * (st.lane_busy_ms - s.last.lane) / dt) : 0;
  s.history.push(s.lane);
  if (s.history.length > 40) s.history.shift();
  s.last = { t: st.t_ms, lane: st.lane_busy_ms, ws: ws };
  s.worlds = ws; s.stats = st;
  if (s.tab === 1) s.handles = sys.handles();
}

function worldsTab(s) {
  var rows = s.worlds.map(function (w) {
    var bad = w.state === "stopped" || w.state === "restarting";
    return { cells: [w.name, w.state, compact(w.turns), s.cpu[w.name] + "%", Math.round(w.mem_kb) + "/" + w.limit_kb], color: bad ? "muted" : "" };
  });
  return ui.col({ gap: 12 },
    ui.spark(s.history, { h: 56, max: 100, points: 40, label: "lane busy, last 40 s", right: s.lane + "%" }),
    ui.table([{ label: "world" }, { label: "state", w: 110 }, { label: "turns", w: 70, align: "right" }, { label: "cpu", w: 56, align: "right" }, { label: "KB", w: 96, align: "right" }],
             rows, { first: s.first, visible: ROWS, tap: "pick", lead: 6 }),
    s.pick != null && s.worlds[s.pick] && s.worlds[s.pick].last_error ? ui.text(s.worlds[s.pick].name + ": " + s.worlds[s.pick].last_error, { wrap: true, font: "s" }) : null
  );
}

function handlesTab(s) {
  var rows = (s.handles || sys.handles()).map(function (h) { return [String(h.id), h.type, h.claim, h.rights, h.holders.join(" ")]; });
  return ui.table([{ label: "id", w: 44 }, { label: "type", w: 60 }, { label: "claim", w: 120 }, { label: "rw", w: 44 }, { label: "held by" }],
                  rows, { first: s.first, visible: ROWS + 2, lead: 6 });
}

function busesTab(s) {
  var t = s.stats.t_ms;
  return ui.col({ gap: 20 }, s.stats.buses.map(function (b) {
    return ui.col({ gap: 6 },
      ui.bar(b.busy_ms / Math.max(1, t), { label: b.name + " · " + compact(b.transfers) + " transfers · " + compact(b.bytes) + " bytes" + (b.errors ? " · " + b.errors + " errors" : ""),
                                           right: (100 * b.busy_ms / Math.max(1, t)).toFixed(1) + "% busy" }));
  }), ui.text("The touch controller and the clock share i2c1; the kernel runs their transactions one at a time, in order.", { wrap: true, font: "s", color: "muted" }));
}

function displayTab(s) {
  var d = s.display;
  if (!d) return ui.text("asking the display driver…", { color: "muted" });
  return ui.col({ gap: 16 },
    ui.kv([["presents", String(d.presents)], ["clean full refreshes", String(d.cleans)], ["last clean because", d.why || "-"],
           ["partials since clean", d.partials + " of " + d.policy.maxPartials],
           ["partial area", (d.partialArea / (540 * 960)).toFixed(1) + " of " + d.policy.maxAreaScreens + " screens"],
           ["since clean", Math.round(d.sinceCleanMs / 1000) + " s of " + Math.round(d.policy.maxAgeMs / 1000)],
           ["quality / text", d.counts.quality + " / " + d.counts.text], ["fast / fastest", d.counts.fast + " / " + d.counts.fastest],
           ["panel busy", (d.busyMs / 1000).toFixed(1) + " s"]], { font: "m", keyW: 250 }),
    ui.button("Clean refresh now", { msg: "clean" })
  );
}

app("system")
  .title("System")
  .state({ tab: 0, first: 0, pick: null, worlds: [], stats: null, cpu: {}, lane: 0, history: [], last: null, display: null })
  .onStart(sample)
  .on("focus", function (s) { timers.start(0); sample(s); })
  .on("blur", function () { timers.stop(0); })
  .on("tab", function (s, m) { s.tab = m.arg; s.first = 0; sample(s); if (s.tab === 3) return refreshDisplay(s); })
  .on("pick", function (s, m) { s.pick = s.pick === m.arg ? null : m.arg; })
  .on("swipe", function (s, m) {
    var n = s.tab === 0 ? s.worlds.length : s.tab === 1 ? (s.handles || []).length : 0;
    if (m.dir === "left" || m.dir === "up") s.first = Math.min(Math.max(0, n - ROWS), s.first + ROWS);
    if (m.dir === "right" || m.dir === "down") s.first = Math.max(0, s.first - ROWS);
  })
  .on("clean", function () { send("compositor", "clean"); })
  .on("back", function (s) { s.tab = 0; s.first = 0; })
  .every(1000, function (s) { sample(s); if (s.tab === 3) return refreshDisplay(s); }, { paused: true })   // timer 0: only while on screen
  .screen(function (s) {
    var body = !s.stats ? ui.text("…") : s.tab === 0 ? worldsTab(s) : s.tab === 1 ? handlesTab(s) : s.tab === 2 ? busesTab(s) : displayTab(s);
    return ui.col({ gap: 20, page: s.tab }, ui.tabs(TABS, s.tab), body);
  })
  .hints(function (s) { return s.tab === 0 ? "Tap a world to see its last error." : s.tab === 3 ? "The planner decides each refresh's waveform." : ""; });

function refreshDisplay(s) {
  return ask("display", "stats", {}, { timeout: 2000 }).then(function (d) { s.display = d; }, function () { s.display = null; });
}
