// The REPL: a line editor on the on-screen keyboard; lines are evaluated in the sandbox world. A long loop, a
// runaway allocation or a thrown error there comes back as a message; the REPL itself never runs the code.
function done(s, lines) { s.busy = false; lines.forEach(function (l) { s.out.push(l); }); if (s.out.length > 200) s.out.splice(0, s.out.length - 200); }

function run(s) {
  var code = s.line.replace(/^\s+|\s+$/g, "");
  if (!code) return;
  s.out.push({ s: "› " + code });
  s.hist.push(code); s.hi = -1;
  s.line = ""; s.busy = true;
  return ask("sandbox", "eval", { code: code }, { timeout: 5000 }).then(function (r) {
    var lines = r.printed.map(function (p) { return { s: p, color: "muted" }; });
    lines.push({ s: r.out + (r.ms >= 5 ? "   (" + r.ms.toFixed(0) + " ms)" : ""), color: r.ok ? "ink" : "muted", indent: r.ok ? 0 : 16 });
    done(s, lines);
  }, function (e) { done(s, [{ s: e.message, color: "muted", indent: 16 }]); });
}

app("repl")
  .title("REPL")
  .state({ line: "", hist: [], hi: -1, busy: false, layout: "lower", shift: false,
           out: [{ s: "JavaScript (ES5) in the sandbox world: 128 KB arena, 400 ms per turn, no claims.", color: "muted" }] })
  .on("key", function (s, m) {
    if (s.busy) return;
    var k = m.arg;
    if (k.ch) {
      s.line += k.ch;
      if (s.shift) { s.shift = false; s.layout = "lower"; }
    } else if (k.key === "backspace") s.line = s.line.slice(0, -1);
    else if (k.key === "shift") { s.shift = !s.shift; s.layout = s.shift ? "upper" : "lower"; }
    else if (k.key === "sym") s.layout = s.layout === "sym" ? "sym2" : "sym";
    else if (k.key === "abc") { s.layout = "lower"; s.shift = false; }
    else if (k.key === "enter") return run(s);
  })
  .on("type", function (s, m) { s.line += m.text; })                // the console's "type" command
  .on("swipe", function (s, m) {                                      // swipe up and down through the history
    if (!s.hist.length || (m.dir !== "up" && m.dir !== "down")) return;
    s.hi = m.dir === "up" ? (s.hi < 0 ? s.hist.length - 1 : Math.max(0, s.hi - 1)) : s.hi < 0 ? -1 : s.hi + 1;
    if (s.hi >= s.hist.length) s.hi = -1;
    s.line = s.hi < 0 ? "" : s.hist[s.hi];
  })
  .on("back", function (s) { s.line = ""; })
  .screen(function (s) {
    return ui.col({ gap: 16 },
      ui.lines(s.out, { bottom: true, font: "mono", lead: 4, grow: 1 }),
      ui.input(s.line, { prompt: "› ", busy: s.busy }),
      ui.keyboard({ layout: s.layout, shift: s.shift, msg: "key" })
    );
  })
  .hints(function (s) { return s.busy ? "evaluating in the sandbox…" : "⏎ runs · Back clears · swipe for history"; });
