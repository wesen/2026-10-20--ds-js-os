// The sandbox: a world that evaluates whatever the REPL sends it. It has its own arena (128 KB), a 400 ms
// budget per turn and no claims, so code typed at the REPL can loop, allocate or throw without touching
// anything else: at worst this world crashes and is restarted. The engine is MicroQuickJS: ES5 only.
var out = [];
globalThis.print = function () {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) parts.push(typeof arguments[i] === "string" ? arguments[i] : show(arguments[i]));
  out.push(parts.join(" "));
};

service("sandbox")
  .state({ evals: 0 })
  .on("eval", function (s, m) {
    s.evals++;
    out = [];
    var t0 = now(), v;
    try { v = (0, eval)(m.code); }
    catch (e) { return { ok: false, out: errText(e), printed: out, ms: now() - t0 }; }
    if (v && typeof v.then === "function") {
      return v.then(function (r) { return { ok: true, out: show(r), printed: out, ms: now() - t0 }; },
                    function (e) { return { ok: false, out: errText(e), printed: out, ms: now() - t0 }; });
    }
    return { ok: true, out: show(v), printed: out, ms: now() - t0 };
  });
