// The launcher: the home screen. It lists the apps and asks the compositor to bring one forward.
const APPS = [
  { app: "sysmon", key: "m", label: "System", about: "Every world, its memory, its turns and the buses, live.",
    ops: [["fill", 4, 18, 7, 12], ["fill", 13, 8, 7, 22], ["fill", 22, 13, 7, 17], ["fill", 31, 2, 7, 28]] },
  { app: "repl", key: "r", label: "REPL", about: "JavaScript, evaluated in a sandbox world with its own heap and budget.",
    ops: [["text", 2, 6, ">", "xl"], ["fill", 20, 26, 16, 3]] },
  { app: "snake", key: "s", label: "Snake", about: "A game on a 22 x 18 grid, ticking on the virtual clock.",
    ops: [["fill", 2, 20, 26, 6], ["fill", 22, 8, 6, 18], ["fill", 22, 8, 14, 6], ["fill", 4, 6, 6, 6, "accent"]] },
  { app: "faults", key: "f", label: "Faults", about: "Crash things on purpose and watch supervision contain them.",
    ops: [["line", 20, 1, 2, 29], ["line", 20, 1, 38, 29], ["line", 2, 29, 38, 29], ["fill", 19, 10, 3, 11], ["fill", 19, 24, 3, 3]] },
  { app: "keys", key: "k", label: "Keys", about: "Raw events from the keyboard driver, as it reads them over I2C.",
    ops: [["rect", 8, 2, 24, 24], ["rect", 10, 4, 20, 20], ["text", 16, 6, "A", "m"]] },
  { app: "about", key: "a", label: "About", about: "The device profile, the clock calibration and the kernel's counters.",
    ops: [["rect", 6, 0, 28, 30], ["fill", 19, 6, 3, 3], ["fill", 19, 12, 3, 12]] },
];
const COLS = 3;

app("launcher")
  .title("PicoCalc")
  .state({ sel: 0, worlds: 0, running: 0, crashes: 0 })
  .onStart((s) => count(s))
  .on("focus", (s) => count(s))
  .on("key", (s, k) => {
    const n = APPS.length;
    if (k.key === "right") s.sel = (s.sel + 1) % n;
    else if (k.key === "left") s.sel = (s.sel + n - 1) % n;
    else if (k.key === "down") s.sel = Math.min(n - 1, s.sel + COLS);
    else if (k.key === "up") s.sel = Math.max(0, s.sel - COLS);
    else if (k.key === "enter" || k.key === "space") send("compositor", "open", { app: APPS[s.sel].app });
    else {
      const i = APPS.findIndex((a) => a.key === (k.ch || "").toLowerCase());
      if (i >= 0) { s.sel = i; send("compositor", "open", { app: APPS[i].app }); }
    }
  })
  .every(2000, (s) => count(s))
  .screen((s) => {
    const a = APPS[s.sel];
    return ui.col({ gap: 6 },
      ui.text("Apps", { font: "l" }),
      ui.gap(2),
      ui.grid(APPS.map((x) => ({ label: x.label, ops: x.ops, key: x.key })), s.sel, { cols: COLS, cell: 66, gap: 8 }),
      ui.gap(4),
      ui.text(a.about, { wrap: true, font: "m", color: "ink" }),
      ui.gap(0),
      ui.text(`${s.running} of ${s.worlds} worlds running · ${s.crashes} crashes since boot`, { font: "s", color: "muted" }),
    );
  })
  .hints("←→↑↓ choose  ⏎ open  or press its letter");

function count(s) {
  const ws = sys.worlds();
  s.worlds = ws.length;
  s.running = ws.filter((w) => w.state !== "stopped" && w.state !== "restarting").length;
  s.crashes = sys.stats().crashes;
}
