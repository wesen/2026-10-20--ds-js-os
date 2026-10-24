// Faults: experiments that break things on purpose. Each one runs, and the log shows what came back
// and what the kernel reported on the worlds.status channel while it happened.
const T0 = () => now();
const EXPERIMENTS = [
  { label: "Loop forever in the sandbox", run: () => ask("sandbox", "eval", { code: "for (;;) {}" }) },
  { label: "Allocate until memory runs out", run: () => ask("sandbox", "eval", { code: "const a = []; for (;;) a.push('x'.repeat(8192) + a.length)" }) },
  { label: "Throw in a service's handler", run: () => { send("flaky", "boom"); return "sent flaky a message that makes it throw"; } },
  { label: "Crash a service five times", run: () => { for (let i = 0; i < 5; i++) send("flaky", "boom"); return "sent flaky five of them"; } },
  { label: "Restart the stopped service", run: async () => { sys.restart("flaky"); await sleep(250); return ask("flaky", "ping"); } },
  { label: "Ask a slow service, 1 s timeout", run: () => ask("flaky", "slow", { ms: 3000 }, { timeout: 1000 }) },
  { label: "Touch I2C without a claim", run: () => hw.i2c("i2c0:0x1f") },
  { label: "Kill the keyboard driver", run: () => { sys.fault("keyboard"); return "killed keyboard; keys work again once it restarts"; } },
  { label: "Kill the display driver", run: () => { sys.fault("display"); return "killed display; the panel is re-initialised"; } },
];

app("faults")
  .title("Faults")
  .needs("worlds.status")
  .state({ sel: 0, busy: false, log: [{ s: "Pick an experiment. Nothing here can take down another world.", color: "muted" }] })
  .on("key", async (s, k) => {
    if (k.key === "down") s.sel = Math.min(EXPERIMENTS.length - 1, s.sel + 1);
    else if (k.key === "up") s.sel = Math.max(0, s.sel - 1);
    else if (k.key === "enter" && !s.busy) {
      const x = EXPERIMENTS[s.sel];
      s.busy = true;
      s.log.push({ s: `▸ ${x.label}` });
      const t = T0();
      try {
        const r = await x.run();
        s.log.push({ s: `  ${typeof r === "string" ? r : show(r && r.out !== undefined ? r.out : r)} (${Math.round(now() - t)} ms)`, color: "ok" });
      } catch (e) {
        s.log.push({ s: `  ✕ ${e.message} (${Math.round(now() - t)} ms)`, color: "accent" });
      }
      s.busy = false;
    }
    if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
  })
  .on("worlds.status", (s, st) => {
    const what = st.state === "crashed" ? `${st.world} crashed (${st.why}); restart in ${st.in_ms} ms`
      : st.state === "stopped" ? `${st.world} stopped after ${st.crashes} crashes`
      : `${st.world} running again`;
    s.log.push({ s: `  · ${what}`, color: st.state === "running" ? "blue" : "warn", indent: 0 });
  })
  .screen((s) => ui.col({ gap: 6 },
    ui.list(EXPERIMENTS.map((x, i) => ({ label: x.label, icon: String(i + 1) })), s.sel, { font: "s", lead: 6, visible: EXPERIMENTS.length }),
    ui.lines(s.log, { bottom: true, font: "s", lead: 2, bg: "ink" }),
  ))
  .hints((s) => (s.busy ? "running…" : "↑↓ choose  ⏎ run"));
