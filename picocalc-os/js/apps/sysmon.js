// The system monitor: every world and what it costs (cpu% is its share of the time since the last sample,
// cpu ms its total since boot; the graph is the whole lane), the handles the kernel has given out, and the
// buses. It reads the kernel's tables through the sys.read claim, twice a second while in front.
const TABS = ["Worlds", "Handles", "Buses"];
const STATE_COLOR = { idle: "ink", busy: "accent", waiting: "blue", restarting: "warn", stopped: "accent" };
const HISTORY = 48;

function sample(s) {
  const st = sys.stats();
  if (s.last) {
    const dt = st.t_ms - s.last.t_ms;
    s.lane.push(dt > 0 ? (st.lane_busy_ms - s.last.lane_busy_ms) / dt : 0);
    const bi = st.buses.map((b, i) => (dt > 0 ? (b.busy_ms - s.last.buses[i].busy_ms) / dt : 0));
    s.i2c.push(bi[0]); s.spi.push(bi[1]);
    for (const a of [s.lane, s.i2c, s.spi]) while (a.length > HISTORY) a.shift();
  }
  if (s.focused) {
    s.worlds = sys.worlds(); s.handles = sys.handles();
    // each world's share of the time since the last sample: its cpu ms over the wall ms in between
    const dt = s.last ? st.t_ms - s.last.t_ms : 0;
    for (const w of s.worlds) {
      const was = s.cpu[w.name];
      w.pct = dt > 0 && was !== undefined && w.cpu_ms >= was ? (w.cpu_ms - was) / dt : null;
      s.cpu[w.name] = w.cpu_ms;
    }
  }
  s.last = st;
}

const pct = (v) => Math.round(100 * (v || 0)) + "%";
const kb = (v) => (v >= 100 ? Math.round(v) : v.toFixed(1));
// at most five characters, so a counter that runs for days still fits its column
function short(v) {
  if (v < 1000) return Number.isInteger(v) ? String(v) : v.toFixed(v < 99.95 ? 1 : 0);
  if (v < 9999.5) return String(Math.round(v));
  for (const [d, u] of [[1e3, "k"], [1e6, "M"], [1e9, "G"]]) {
    const x = v / d;
    if (x < 999.5) return (x < 99.95 ? x.toFixed(1) : String(Math.round(x))) + u;
  }
  return "many";
}
const share = (v) => (v == null ? "·" : v < 0.0995 ? (100 * v).toFixed(1) : Math.round(100 * v) + "");

function worldsTab(s) {
  const rows = s.worlds.map((w) => ({
    cells: [w.name, { s: w.state, color: STATE_COLOR[w.state] }, short(w.turns), share(w.pct), short(w.cpu_ms), kb(w.mem_kb), w.restarts ? String(w.restarts) : "·"],
  }));
  const w = s.worlds[s.sel] || {};
  return [
    ui.spark(s.lane, { h: 26, max: Math.max(0.1, ...s.lane), points: HISTORY, label: `lane busy · peak ${pct(Math.max(0, ...s.lane))}`, right: pct(s.lane[s.lane.length - 1]), color: "accent" }),
    ui.gap(2),
    ui.table([{ label: "world", w: 72 }, { label: "state", w: 62 }, { label: "turns", align: "right" }, { label: "cpu%", align: "right", w: 36 },
      { label: "cpu ms", align: "right" }, { label: "KB", align: "right", w: 32 }, { label: "rst", align: "right", w: 22 }], rows, { sel: s.sel, font: "s", lead: 3 }),
    ui.sep({ h: 5 }),
    ui.kv([
      ["cpu", w.pct == null ? `${(w.cpu_ms || 0).toFixed(1)} ms since boot` : `${share(w.pct)}% now, ${(w.cpu_ms || 0).toFixed(1)} ms since boot`],
      ["mailbox / peak", `${w.mbox} / ${w.mbox_peak}`],
      ["budget, limit", `${w.budget_ms} ms, ${w.limit_kb} KB`],
      ["claims", (w.claims || []).join(" ") || "none"],
      ["last error", w.last_error || "none", w.last_error ? "accent" : "muted"],
    ], { keyW: 96, lead: 2 }),
  ];
}

function handlesTab(s) {
  const rows = s.handles.map((h) => ({
    cells: [String(h.id), h.type, h.claim, h.rights, h.holders.join(" ") || "·", h.kb ? h.kb + " KB" : h.hz ? (h.hz >= 1e6 ? h.hz / 1e6 + " MHz" : h.hz / 1e3 + " kHz") : ""],
    color: h.revoked ? "muted" : undefined,
  }));
  return [
    ui.text("Hardware the kernel has handed out. A handle is checked on every use; a narrowed one carries fewer rights.", { wrap: true, font: "s", color: "muted" }),
    ui.gap(4),
    ui.table([{ label: "id", w: 22, align: "right" }, { label: "type", w: 32 }, { label: "claim", w: 66 }, { label: "rt", w: 28 }, { label: "held by" }, { label: "", w: 52, align: "right" }],
      rows, { sel: Math.min(s.sel, rows.length - 1), font: "s", lead: 5 }),
  ];
}

function busesTab(s) {
  const b = s.last ? s.last.buses : [];
  const line = (bus, hist, note) => [
    ui.spark(hist, { h: 30, max: 1, points: HISTORY, label: `${bus.name} · ${note}`, right: pct(hist[hist.length - 1]), color: bus.name === "spi2" ? "blue" : "ink" }),
    ui.kv([["transfers", String(bus.transfers)], ["bytes", String(bus.bytes)], ["busy", bus.busy_ms.toFixed(1) + " ms"], ["errors", String(bus.errors), bus.errors ? "accent" : "muted"]], { keyW: 96, lead: 1 }),
    ui.gap(6),
  ];
  return b.length ? [...line(b[0], s.i2c, "STM32 at 0x1F, 10 kHz"), ...line(b[1], s.spi, "ST7365P panel, 40 MHz")] : [ui.text("…")];
}

app("sysmon")
  .title("System")
  .state({ tab: 0, sel: 0, focused: false, worlds: [], handles: [], lane: [], i2c: [], spi: [], last: null, cpu: {} })
  .onStart(sample)
  .on("focus", (s) => { s.focused = true; sample(s); })
  .on("blur", (s) => { s.focused = false; })
  .every(500, sample)
  .on("key", (s, k) => {
    const n = s.tab === 0 ? s.worlds.length : s.handles.length;
    if (k.key === "tab" || k.key === "right") { s.tab = (s.tab + 1) % TABS.length; s.sel = 0; }
    else if (k.key === "left") { s.tab = (s.tab + TABS.length - 1) % TABS.length; s.sel = 0; }
    else if (k.key === "down") s.sel = Math.min(n - 1, s.sel + 1);
    else if (k.key === "up") s.sel = Math.max(0, s.sel - 1);
  })
  .screen((s) => {
    if (!s.focused) return ui.text("");
    const st = s.last || { t_ms: 0, turns: 0, crashes: 0 };
    return ui.col({ gap: 4 },
      ui.row({ gap: 4 }, ...TABS.map((t, i) => ui.text(t, { font: "mb", color: i === s.tab ? "accentInk" : "muted", bg: i === s.tab ? "ink" : undefined, pad: 3, align: "center", w: 74 })),
        ui.text(`${(st.t_ms / 1000).toFixed(1)} s`, { font: "s", color: "muted", align: "right", pad: 5 })),
      ...(s.tab === 0 ? worldsTab(s) : s.tab === 1 ? handlesTab(s) : busesTab(s)),
    );
  })
  .hints((s) => (s.tab === 0 ? "↑↓ world  ←→ tab" : "←→ tab"));
