// About: the device this build pretends to be, and the kernel's counters.
app("about")
  .title("About")
  .state({ focused: false, st: null, worlds: [] })
  .on("focus", (s) => { s.focused = true; s.st = sys.stats(); s.worlds = sys.worlds(); })
  .on("blur", (s) => { s.focused = false; })
  .every(1000, (s) => { if (s.focused) { s.st = sys.stats(); s.worlds = sys.worlds(); } })
  .screen((s) => {
    if (!s.focused || !s.st) return ui.text("");
    const st = s.st, mem = s.worlds.reduce((a, w) => a + w.mem_kb, 0);
    return ui.col({ gap: 6 },
      ui.text("PicoCalc OS", { font: "l" }),
      ui.text("A JavaScript system on an ESP32-P4: every driver, the compositor and every app is a world with its own QuickJS heap.", { wrap: true, font: "s", color: "muted" }),
      ui.sep(),
      ui.kv([
        ["board", st.board],
        ["panel", "ST7365P 320 x 320, SPI2 at 40 MHz"],
        ["keyboard", "STM32 at I2C 0x1F, 10 kHz"],
        ["engine", "QuickJS, one VM per world"],
        ["clock", `virtual; one step = ${Math.round(st.step_ns)} ns`],
        ["calibrated on", "100k-iteration loop = 133 ms"],
      ], { keyW: 92, lead: 2 }),
      ui.sep(),
      ui.kv([
        ["uptime", `${(st.t_ms / 1000).toFixed(1)} s, lane busy ${(100 * st.lane_busy_ms / Math.max(1, st.t_ms)).toFixed(1)}%`],
        ["worlds", `${s.worlds.length}, ${Math.round(mem)} KB of JS heap in all`],
        ["turns", `${st.turns} (${st.segments} segments)`],
        ["messages", `${st.published} posts, ${st.delivered} deliveries`],
        ["handles", String(st.handles)],
        ["crashes", String(st.crashes)],
      ], { keyW: 92, lead: 2 }),
    );
  });
