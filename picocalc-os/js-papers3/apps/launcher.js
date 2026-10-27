// The launcher: the home screen. A tile for every app; a tap asks the compositor to bring it forward.
var APPS = [
  { app: "system", label: "System", about: "Every world: its state, turns, CPU and memory; the handles; the buses; the refresh planner.",
    ops: [["fill", 4, 40, 12, 24], ["fill", 20, 24, 12, 40], ["fill", 36, 32, 12, 32], ["fill", 52, 8, 12, 56]] },
  { app: "repl", label: "REPL", about: "JavaScript (ES5), evaluated in a sandbox world with its own arena and budget.",
    ops: [["text", 4, 10, "›", "xl"], ["fill", 34, 54, 26, 6]] },
  { app: "sketch", label: "Sketch", about: "Draw with a finger. Strokes go out in the fastest waveform; Clean redraws in full quality.",
    ops: [["line", 4, 56, 24, 20], ["line", 24, 20, 40, 44], ["line", 40, 44, 60, 6], ["disc", 60, 6, 4]] },
  { app: "faults", label: "Faults", about: "Crash worlds on purpose and watch supervision contain them.",
    ops: [["line", 32, 2, 2, 60], ["line", 32, 2, 62, 60], ["line", 2, 60, 62, 60], ["fill", 29, 20, 6, 24], ["fill", 29, 48, 6, 6]] },
  { app: "touches", label: "Touches", about: "Raw points from the GT911 driver and the gestures the compositor made of them.",
    ops: [["disc", 32, 32, 10], ["rect", 12, 12, 40, 40], ["rect", 2, 2, 60, 60]] },
  { app: "about", label: "About", about: "The board, the engine, the clock and its calibration, the panel's counters.",
    ops: [["rect", 12, 0, 40, 62], ["rect", 13, 1, 38, 60], ["fill", 29, 12, 6, 6], ["fill", 29, 24, 6, 26]] },
];

function count(s) {
  var ws = sys.worlds();
  s.worlds = ws.length;
  s.running = ws.filter(function (w) { return w.state !== "stopped" && w.state !== "restarting"; }).length;
  s.crashes = sys.stats().crashes;
}

app("launcher")
  .title("PaperS3")
  .state({ worlds: 0, running: 0, crashes: 0, about: 0 })
  .onStart(count)
  .on("focus", count)
  .on("open", function (s, m) { s.about = m.arg; send("compositor", "open", { app: APPS[m.arg].app }); })
  .on("hold", function (s, m) { if (m.msg === "open") s.about = m.arg; })
  .on("back", function () {})
  .every(5000, count)
  .screen(function (s) {
    return ui.col({ gap: 20 },
      ui.text("Apps", { font: "l" }),
      ui.grid(APPS.map(function (a, i) { return { label: a.label, ops: a.ops, arg: i }; }), { cols: 3, cell: 150, gap: 16, tap: "open" }),
      ui.sep(),
      ui.text(APPS[s.about].label + ". " + APPS[s.about].about, { wrap: true }),
      ui.gap(8),
      ui.text(s.running + " of " + s.worlds + " worlds running · " + s.crashes + " crashes since boot", { font: "s", color: "muted" })
    );
  })
  .hints("Tap an app to open it. Hold one to read about it.");
