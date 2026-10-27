// About: the board, the engine, the clock and its calibration, and what the panel has done.
function gather(s) {
  var st = sys.stats();
  s.board = st.board; s.clock = st.clock; s.step = st.step_ns; s.t = st.t_ms; s.worlds = sys.worlds().length; s.crashes = st.crashes;
  s.turns = st.turns;
}
app("about")
  .title("About")
  .state({})
  .onStart(gather)
  .on("focus", gather)
  .on("back", function () {})
  .every(5000, gather)
  .screen(function (s) {
    var up = Math.floor(s.t / 1000);
    return ui.col({ gap: 14 },
      ui.text("picocalc-os", { font: "l" }),
      ui.text("A JavaScript operating system of supervised worlds, on " + s.board + ".", { wrap: true }),
      ui.kv([["engine", engine], ["clock", s.clock === "real" ? "real" : "virtual (host model)"],
             ["one step", s.step.toFixed(0) + " ns" + (s.clock === "real" ? "" : " (estimate)")],
             ["up", Math.floor(up / 60) + " min " + (up % 60) + " s"], ["worlds", String(s.worlds)], ["turns", String(s.turns)],
             ["crashes", String(s.crashes)], ["wall clock", clockText() + " UTC"]], { font: "m", keyW: 170 }),
      ui.sep(),
      ui.text("MicroQuickJS by Fabrice Bellard and Charlie Gordon (MIT). Charis SIL and Liberation Sans (OFL), DejaVu Sans Mono (Bitstream Vera).", { wrap: true, font: "s", color: "muted" })
    );
  });
