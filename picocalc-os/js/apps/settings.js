// Settings: the Wi-Fi station (its state, a scan, joining a network with a password typed here), the time zone, and
// what the agent's provider is. The password is drawn as dots and cleared once it has been handed over; net.join
// gives it to the port, and no operation gives it back. The API key and the endpoint are set over USB only.
const ST_ZONES = [
  ["UTC", "UTC0"],
  ["London, Dublin, Lisbon", "GMT0BST,M3.5.0/1,M10.5.0"],
  ["Berlin, Paris, Madrid, Rome", "CET-1CEST,M3.5.0,M10.5.0/3"],
  ["Athens, Helsinki, Kyiv", "EET-2EEST,M3.5.0/3,M10.5.0/4"],
  ["Istanbul, Moscow", "<+03>-3"],
  ["Dubai", "<+04>-4"],
  ["India", "IST-5:30"],
  ["Bangkok, Jakarta", "<+07>-7"],
  ["China, Singapore, Perth", "CST-8"],
  ["Tokyo, Seoul", "JST-9"],
  ["Brisbane", "AEST-10"],
  ["Sydney, Melbourne", "AEST-10AEDT,M10.1.0,M4.1.0/3"],
  ["Auckland", "NZST-12NZDT,M9.5.0,M4.1.0/3"],
  ["Honolulu", "HST10"],
  ["Anchorage", "AKST9AKDT,M3.2.0,M11.1.0"],
  ["Los Angeles, Vancouver", "PST8PDT,M3.2.0,M11.1.0"],
  ["Denver", "MST7MDT,M3.2.0,M11.1.0"],
  ["Phoenix", "MST7"],
  ["Chicago", "CST6CDT,M3.2.0,M11.1.0"],
  ["New York, Toronto", "EST5EDT,M3.2.0,M11.1.0"],
  ["Halifax", "AST4ADT,M3.2.0,M11.1.0"],
  ["Sao Paulo, Buenos Aires", "<-03>3"],
];
const ST_MENU = ["wifi", "zone", "provider"];
// a join is followed until the station is up or gives up; the P4 tries six times, each up to about ten seconds
const ST_SCAN_MS = 12000, ST_SLOW_MS = 20000, ST_JOIN_MS = 90000;
const ST_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ST_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "EST5EDT,M3.2.0,M11.1.0" as "UTC-5 DST": POSIX counts hours west of Greenwich, so its sign is the other way round
function stOffset(tz) {
  const m = /^(?:<[^>]+>|[A-Za-z]+)([+-]?)(\d+)(?::(\d+))?(.*)$/.exec(tz);
  if (!m) return tz;
  const dst = m[4] ? " DST" : "";
  if (+m[2] === 0 && !m[3]) return (dst ? "UTC+0" : "UTC") + dst;
  return "UTC" + (m[1] === "-" ? "+" : "-") + +m[2] + (m[3] ? ":" + m[3] : "") + dst;
}
const stZoneName = (tz) => { const z = ST_ZONES.find((x) => x[1] === tz); return z ? z[0] : "custom: " + tz; };
const stPad = (n) => String(n).padStart(2, "0");
function stTime() {
  if (!clock.set()) return "clock not set yet";
  const d = new Date();
  return `${ST_DAYS[d.getDay()]} ${d.getDate()} ${ST_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${stPad(d.getHours())}:${stPad(d.getMinutes())}`;
}
// signal in four steps, drawn with the font's block characters
const stBars = (rssi) => { const n = !rssi ? 0 : rssi >= -55 ? 4 : rssi >= -67 ? 3 : rssi >= -78 ? 2 : 1; return "█".repeat(n) + "░".repeat(4 - n); };
// what a WPA passphrase may be, as the kernel checks it: 8 to 63 printable ASCII characters, or 64 hex digits
const stPasswordOk = (p) => (p.length >= 8 && p.length <= 63 && /^[\x20-\x7e]+$/.test(p)) || /^[0-9a-fA-F]{64}$/.test(p);

function stInfo(s) {
  try { s.info = net.info(); s.error = ""; }
  catch (e) { s.info = null; s.error = e.message; }
  const j = s.joining;
  if (!j || !s.info || s.info.ssid !== j.ssid) return;
  if (s.info.wifi === "up") { s.note = "Connected to " + j.ssid + "."; s.joining = null; }
  else if (s.info.wifi === "failed") { s.note = "Could not join " + j.ssid + ": " + s.info.state; s.joining = null; }
  else if (now() - j.at > ST_JOIN_MS) { s.note = "No answer from " + j.ssid + "."; s.joining = null; }
  else if (now() - j.at > ST_SLOW_MS && !j.slow) { j.slow = true; s.note = "Still trying " + j.ssid + "…"; }
}

// The scan runs on the port's network worker; this chain polls for its result and never holds a turn open.
function stScan(s) {
  if (s.scanning) return;
  try { net.scan(); } catch (e) { s.note = e.message; return; }
  s.scanning = true; s.note = "Scanning…";
  const t0 = now();
  const poll = () => sleep(500).then(() => {
    let r = null;
    try { r = net.scanResult(); } catch (e) { r = { error: e.message }; }
    if (r === null && now() - t0 < ST_SCAN_MS) return poll();
    s.scanning = false;
    if (r === null) s.note = "The scan did not finish.";
    else if (!Array.isArray(r)) s.note = r.error || "The scan failed.";
    else { s.nets = r; s.sel = 0; s.note = r.length ? "" : "No networks found."; }
  });
  poll();
}

function stJoin(s, ssid, password) {
  try { net.join(ssid, password); }
  catch (e) { s.note = e.message; return false; }
  s.joining = { ssid, at: now() };
  s.note = "Joining " + ssid + "…";
  stInfo(s);
  return true;
}

function stLeavePassword(s) { s.pw = ""; s.pick = null; s.page = "wifi"; }

function stKey(s, k) {
  if (!k || k.state === "up") return;
  const once = k.state === "down";
  if (s.page === "password") {
    if (k.key === "esc" && once) { stLeavePassword(s); s.note = ""; return; }
    if (k.key === "backspace") { s.pw = s.pw.slice(0, -1); return; }
    if (k.key === "enter" && once) {
      if (!stPasswordOk(s.pw)) { s.note = "A password is 8 to 63 characters, or 64 hex digits."; return; }
      const ssid = s.pick, pw = s.pw;
      stLeavePassword(s);
      stJoin(s, ssid, pw);
      return;
    }
    // a key held down sends "hold" too; in a password field that would type the character twice
    if (once && typeof k.ch === "string" && /^[\x20-\x7e]$/.test(k.ch) && s.pw.length < 64) s.pw += k.ch;
    return;
  }
  if (!once && k.key !== "up" && k.key !== "down") return;
  if (k.key === "esc") { s.note = ""; if (s.page !== "menu") { s.sel = ST_MENU.indexOf(s.page); s.page = "menu"; } return; }
  const n = s.page === "menu" ? ST_MENU.length : s.page === "wifi" ? (s.nets || []).length : s.page === "zone" ? ST_ZONES.length : 0;
  if (k.key === "up") { s.sel = Math.max(0, s.sel - 1); return; }
  if (k.key === "down") { s.sel = Math.max(0, Math.min(n - 1, s.sel + 1)); return; }
  if (s.page === "menu" && (k.key === "enter" || k.key === "right")) {
    s.page = ST_MENU[s.sel]; s.note = "";
    s.sel = s.page === "zone" ? Math.max(0, ST_ZONES.findIndex((z) => z[1] === clock.zone())) : 0;
    if (s.page === "wifi" && !s.nets) stScan(s);
    return;
  }
  if (s.page === "wifi") {
    if (k.key === "f2") return stScan(s);
    const ap = (s.nets || [])[s.sel];
    if (k.key === "enter" && ap) {
      if (ap.secure) { s.page = "password"; s.pick = ap.ssid; s.pw = ""; s.note = ""; }
      else stJoin(s, ap.ssid, "");
    }
    return;
  }
  if (s.page === "zone" && k.key === "enter") {
    const z = ST_ZONES[s.sel];
    try { const r = clock.setZone(z[1]); s.note = "Time zone: " + z[0] + (r.saved ? "." : " (until restart)."); }
    catch (e) { s.note = e.message; }
  }
}

function stWifiSummary(i) {
  if (!i) return "unavailable";
  if (i.mode === "none") return "not on this device";
  return i.wifi === "up" ? "up · " + i.ssid : i.wifi === "connecting" ? "connecting · " + i.ssid : i.wifi === "failed" ? "failed · " + i.ssid : "off";
}

function stScreen(s) {
  const i = s.info;
  const status = ui.text(s.error || s.note || stTime(), { font: "s", color: s.error || s.note ? "accent" : "muted" });
  if (s.page === "menu") {
    const items = [
      { label: "Wi-Fi", right: stWifiSummary(i) },
      { label: "Time zone", right: stZoneName(clock.zone()) },
      { label: "Provider", right: i ? (i.provider || "none") + (i.key ? " · key ✓" : " · no key") : "" },
    ];
    return ui.col({ gap: 6 }, ui.list(items, s.sel, { font: "m", grow: 1 }), status);
  }
  if (s.page === "wifi" || s.page === "password") {
    const up = i && i.wifi === "up";
    const top = ui.kv([
      ["state", i ? (up ? `up, ${i.ip}, ${i.rssi} dBm` : i.state) : "unavailable", up ? "ink" : i && i.wifi === "failed" ? "accent" : "muted"],
      ["network", i && i.ssid ? i.ssid : "none"],
      ["clock", i && i.clock ? "set" : "not set (it needs the network)"],
    ], { keyW: 70, lead: 3 });
    if (s.page === "password") {
      return ui.col({ gap: 6 }, top, ui.sep(),
        ui.text("Password for " + s.pick, { font: "m" }),
        ui.input("•".repeat(s.pw.length), { font: "m" }),
        ui.text("8 to 63 characters. It is saved on the device and never shown again.", { font: "s", color: "muted", wrap: true }),
        ui.col({ grow: 1 }), status);
    }
    const nets = (s.nets || []).map((n) => ({ label: n.ssid, right: stBars(n.rssi) + "  " + (n.secure ? "locked" : "open"),
                                               color: i && i.ssid === n.ssid && up ? "accent" : "" }));
    return ui.col({ gap: 6 }, top, ui.sep(),
      nets.length ? ui.list(nets, s.sel, { font: "s", lead: 6, grow: 1 })
        : ui.col({ grow: 1 }, ui.text(s.scanning ? "Looking for networks…" : "F2 looks for networks.", { font: "s", color: "muted" })),
      status);
  }
  if (s.page === "zone") {
    const cur = clock.zone();
    const items = ST_ZONES.map(([name, tz]) => ({ label: name, right: (tz === cur ? "✓ " : "") + stOffset(tz), rightColor: tz === cur ? "accent" : "muted" }));
    return ui.col({ gap: 6 }, ui.list(items, s.sel, { font: "s", lead: 5, grow: 1 }), status);
  }
  return ui.col({ gap: 6 },
    ui.kv([
      ["provider", i && i.provider ? i.provider : "none"],
      ["dialect", i ? i.api : ""],
      ["model", i && i.model ? i.model : "the agent's default"],
      ["API key", i && i.key ? "provisioned" : "missing", i && i.key ? "ink" : "accent"],
    ], { keyW: 70, lead: 4 }),
    ui.sep(),
    ui.text("The key and the endpoint are set over USB with tools/provision_agent.py, so no app can read the key or send it elsewhere.", { font: "s", wrap: true }),
    ui.text("Choose another model in Agent with /model.", { font: "s", wrap: true, color: "muted" }),
    ui.col({ grow: 1 }), status);
}

const stHints = (s) => s.page === "password" ? "⏎ join  esc cancel"
  : s.page === "wifi" ? "↑↓ choose  ⏎ join  F2 scan  esc back"
  : s.page === "zone" ? "↑↓ choose  ⏎ set  esc back"
  : s.page === "provider" ? "esc back" : "↑↓ choose  ⏎ open";

app("settings")
  .title("Settings")
  .state({ page: "menu", sel: 0, info: null, nets: null, scanning: false, joining: null, pick: null, pw: "", note: "", error: "", focused: false })
  .on("focus", (s) => { s.focused = true; stInfo(s); })
  .on("blur", (s) => { s.focused = false; if (s.page === "password") stLeavePassword(s); })
  .on("key", (s, k, msg) => { if (msg.from === "compositor") stKey(s, k); })
  .every(1000, (s) => { if (s.focused || s.joining) stInfo(s); })
  .screen(stScreen)
  .hints(stHints);
