// Faults: crash worlds on purpose and watch supervision contain them. Each button sends something that makes
// a world fail in one way; the list shows every world's state, and a stopped one can be restarted from here
// (this app holds sys.admin).
var ACTS = [
  { label: "Loop forever in the sandbox", run: function () { return ask("sandbox", "eval", { code: "for (;;) {}" }, { timeout: 3000 }); } },
  { label: "Exhaust the sandbox's arena", run: function () { return ask("sandbox", "eval", { code: "var a = []; for (;;) a.push('x' + a.length)" }, { timeout: 3000 }); } },
  { label: "Throw in flaky", run: function () { return ask("flaky", "boom", {}); } },
  { label: "Kill the display driver", run: function () { sys.fault("display"); return Task.resolve("killed"); } },
];

function refresh(s) { s.worlds = sys.worlds(["name", "state", "restarts", "last_error"]).map(function (w) { return { name: w.name, state: w.state, restarts: w.restarts, err: w.last_error }; }); }

app("faults")
  .title("Faults")
  .state({ worlds: [], last: "" })
  .onStart(refresh)
  .on("focus", function (s) { timers.start(0); refresh(s); })
  .on("blur", function () { timers.stop(0); })
  .on("act", function (s, m) {
    var a = ACTS[m.arg];
    s.last = a.label + "…";
    return a.run().then(function (r) { s.last = a.label + ": " + (r && r.out ? r.out : show(r)); },
                        function (e) { s.last = a.label + ": " + e.message; });
  })
  .on("world", function (s, m) {
    var w = s.worlds[m.arg];
    if (w && w.state === "stopped") { sys.restart(w.name); s.last = "restarting " + w.name; }
  })
  .on("back", function () {})
  .every(500, refresh, { paused: true })   // timer 0: only while on screen
  .screen(function (s) {
    return ui.col({ gap: 14 },
      ACTS.map(function (a, i) { return ui.button(a.label, { msg: "act", arg: i, h: 64 }); }),
      ui.text(s.last || "Each button breaks one world. The rest keep running.", { wrap: true, font: "s", color: s.last ? "ink" : "muted" }),
      ui.list(s.worlds.map(function (w) {
        return { label: w.name, detail: w.state === "stopped" ? "tap to restart" : w.err ? w.err : "", right: w.state + (w.restarts ? " · " + w.restarts + "×" : ""), color: w.state === "stopped" ? "muted" : "" };
      }), { font: "s", lead: 18, tap: "world", grow: 1 })
    );
  })
  .hints("A world that crashes five times in ten seconds stays stopped.");
