// Sketch: draw with a finger. The compositor forwards drags over the ink area as they happen; each stroke is
// presented in the fastest waveform ("ink"), which is quick but ghosts, and Clean redraws in full quality.
var MAXPTS = 1500;
app("sketch")
  .title("Sketch")
  .state({ strokes: [], points: 0 })
  .on("ink", function (s, p) {
    if (p.phase === "down") { s.strokes.push([]); }
    var st = s.strokes[s.strokes.length - 1];
    if (!st || s.points >= MAXPTS) return;
    var last = st[st.length - 1];
    if (!last || Math.abs(last[0] - p.x) + Math.abs(last[1] - p.y) >= 3) { st.push([p.x, p.y]); s.points++; }
  })
  .on("clear", function (s) { s.strokes = []; s.points = 0; })
  .on("clean", function () { send("compositor", "clean"); })
  .on("back", function (s) { s.strokes.pop(); s.points = s.strokes.reduce(function (a, st) { return a + st.length; }, 0); })
  .screen(function (s) {
    return ui.col({ gap: 16, refresh: "ink" },
      ui.ink(460, 600, s.strokes, { msg: "ink" }),
      ui.row({ gap: 16 }, ui.button("Clear", { msg: "clear" }), ui.button("Clean", { msg: "clean", primary: true })),
      ui.text(s.strokes.length + " strokes, " + s.points + " of " + MAXPTS + " points", { font: "s", color: "muted" })
    );
  })
  .hints("Back undoes the last stroke.");
