// Touches: the raw points the GT911 driver publishes, and the gestures the compositor makes of them. The
// pad draws the last few strokes, so the panel's touch orientation can be checked by touching its corners.
app("touches")
  .title("Touches")
  .needs("touch", "gestures")
  .state({ events: [], strokes: [], gesture: "", n: 0 })
  .on("touch", function (s, t) {
    s.n++;
    s.events.push(t.phase + " #" + t.id + " at " + t.x + ", " + t.y);
    if (s.events.length > 8) s.events.shift();
    if (t.phase === "down") { s.strokes.push([]); if (s.strokes.length > 6) s.strokes.shift(); }
    var st = s.strokes[s.strokes.length - 1];
    if (st && st.length < 200) st.push([Math.round(t.x * 460 / 540), Math.round(t.y * 300 / 960)]);
  })
  .on("gestures", function (s, g) { s.gesture = g.kind + " at " + g.x + ", " + g.y + (g.kind === "tap" || g.kind === "hold" ? "" : " by " + g.dx + ", " + g.dy) + " in " + g.ms + " ms"; })
  .on("back", function (s) { s.events = []; s.strokes = []; s.gesture = ""; })
  .screen(function (s) {
    return ui.col({ gap: 16 },
      ui.text("The whole screen, scaled down:", { font: "s", color: "muted" }),
      ui.ink(460, 300, s.strokes, { msg: "none" }),
      ui.kv([["gesture", s.gesture || "-"], ["points", String(s.n)]], { font: "m", keyW: 150 }),
      ui.sep(),
      ui.lines(s.events.length ? s.events : ["touch anywhere"], { font: "mono", grow: 1 })
    );
  })
  .hints("Back clears. Touch the corners to check orientation.");
