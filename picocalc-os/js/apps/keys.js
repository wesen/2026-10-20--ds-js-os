// Keys: what the keyboard driver reads from the STM32, event by event, and the driver's own counters.
app("keys")
  .title("Keys")
  .needs("keys")
  .state({ focused: false, events: [], last: null, stats: null })
  .on("focus", async (s) => { s.focused = true; s.stats = await ask("keyboard", "stats").catch(() => null); })
  .on("blur", (s) => { s.focused = false; })
  .on("keys", (s, e) => {
    if (!s.focused) return;
    s.last = e;
    s.events.push(Object.assign({ t: now() }, e));
    if (s.events.length > 40) s.events.shift();
  })
  .every(1000, async (s) => { if (s.focused) s.stats = await ask("keyboard", "stats").catch(() => null); })
  .screen((s) => {
    if (!s.focused) return ui.text("");
    const e = s.last;
    const hex = (c) => "0x" + c.toString(16).padStart(2, "0");
    return ui.col({ gap: 6 },
      ui.row({ gap: 10 },
        ui.box({ w: 110, pad: 6, border: "ink", bg: "#ffffff" },
          ui.text(e ? (e.ch && e.ch !== " " ? e.ch : e.key) : "–", { font: "xl", align: "center" }),
          ui.text(e ? `${hex(e.code)} ${e.state}` : "press a key", { font: "s", align: "center", color: "muted" })),
        ui.kv([
          ["polls", s.stats ? String(s.stats.polls) : "?"],
          ["events", s.stats ? String(s.stats.events) : "?"],
          ["i2c errors", s.stats ? String(s.stats.errors) : "?"],
          ["caps lock", e && e.caps ? "on" : "off"],
          ["poll period", "20 ms"],
        ], { keyW: 80, lead: 3 })),
      ui.table([{ label: "t ms", w: 62, align: "right" }, { label: "code", w: 46 }, { label: "key", w: 74 }, { label: "state" }],
        s.events.slice().reverse().map((x) => [Math.round(x.t), hex(x.code), x.key, { s: x.state, color: x.state === "down" ? "accent" : x.state === "hold" ? "blue" : "muted" }]),
        { font: "s", lead: 3 }),
    );
  })
  .hints("what the driver reads, newest first");
