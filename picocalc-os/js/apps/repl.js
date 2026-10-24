// The REPL: a line editor whose lines are evaluated in the sandbox world. A long loop, a runaway
// allocation or a thrown error there comes back as a message here; the REPL itself never runs the code.
app("repl")
  .title("REPL")
  .state({ line: "", cur: 0, hist: [], hi: -1, busy: false, out: [{ s: "JavaScript in the sandbox world: 512 KB heap, 200 ms per turn, no claims.", color: "muted" }] })
  .on("key", async (s, k) => {
    if (s.busy) return;
    const chars = Array.from(s.line);
    if (k.key === "enter") {
      const code = s.line.trim();
      if (!code) return;
      s.out.push({ s: "▸ " + code, color: "accent" });
      s.hist.push(code); s.hi = -1;
      s.line = ""; s.cur = 0; s.busy = true;
      try {
        const r = await ask("sandbox", "eval", { code }, { timeout: 5000 });
        for (const p of r.printed) s.out.push({ s: p, color: "muted" });
        s.out.push({ s: r.out + (r.ms >= 5 ? `   (${r.ms.toFixed(0)} ms)` : ""), color: r.ok ? "ink" : "accent" });
      } catch (e) {
        s.out.push({ s: e.message, color: "accent" });
      }
      s.busy = false;
      if (s.out.length > 200) s.out.splice(0, s.out.length - 200);
    } else if (k.key === "backspace") { if (s.cur > 0) { chars.splice(s.cur - 1, 1); s.cur--; s.line = chars.join(""); } }
    else if (k.key === "del") { chars.splice(s.cur, 1); s.line = chars.join(""); }
    else if (k.key === "left") s.cur = Math.max(0, s.cur - 1);
    else if (k.key === "right") s.cur = Math.min(chars.length, s.cur + 1);
    else if (k.key === "home") s.cur = 0;
    else if (k.key === "end") s.cur = chars.length;
    else if (k.key === "up" || k.key === "down") {
      if (!s.hist.length) return;
      s.hi = k.key === "up" ? (s.hi < 0 ? s.hist.length - 1 : Math.max(0, s.hi - 1)) : s.hi < 0 ? -1 : s.hi + 1;
      if (s.hi >= s.hist.length) s.hi = -1;
      s.line = s.hi < 0 ? "" : s.hist[s.hi]; s.cur = Array.from(s.line).length;
    } else if (k.key === "esc") { s.line = ""; s.cur = 0; }
    else if (k.ch) { chars.splice(s.cur, 0, k.ch); s.cur++; s.line = chars.join(""); }
  })
  .screen((s) => ui.col({ gap: 6 },
    ui.lines(s.out, { bottom: true, font: "s", lead: 2, grow: 1 }),
    ui.input(s.line, { cursor: s.cur, prompt: "▸ ", busy: s.busy, font: "m" }),
  ))
  .hints((s) => (s.busy ? "evaluating in the sandbox…" : "⏎ run  ↑↓ history  esc clear"));
