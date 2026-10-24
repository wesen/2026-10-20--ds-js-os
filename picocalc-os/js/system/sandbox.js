// The sandbox: a world that evaluates whatever the REPL sends it. It has its own heap (512 KB), a
// 200 ms budget per turn and no claims, so code typed at the REPL can loop, allocate or throw without
// touching anything else: at worst this world crashes and is restarted.
let out = [];
globalThis.print = (...a) => { out.push(a.map((x) => (typeof x === "string" ? x : show(x))).join(" ")); };

service("sandbox")
  .state({ evals: 0 })
  .on("eval", (s, { code }) => {
    s.evals++;
    out = [];
    const t0 = now();
    let v;
    try {
      v = (0, eval)(code);
    } catch (e) {
      return { ok: false, out: errText(e), printed: out, ms: now() - t0 };
    }
    if (v && typeof v.then === "function") {
      return v.then((r) => ({ ok: true, out: show(r), printed: out, ms: now() - t0 }), (e) => ({ ok: false, out: errText(e), printed: out, ms: now() - t0 }));
    }
    return { ok: true, out: show(v), printed: out, ms: now() - t0 };
  });
