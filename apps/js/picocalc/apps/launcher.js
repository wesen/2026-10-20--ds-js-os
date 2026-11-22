// The launcher: the home screen. It lists the apps and asks the compositor to bring one forward.
// The list is the running system's: every world of kind "app" in manifest order, then the apps started from storage,
// each drawn with the title, icon, description and letter it declared (.title, .icon, .about, .key; nw_title, ...).
const COLS = 4, ROWS = 3;   // three rows of four fit the screen; more apps scroll by rows

// What an icon may draw: known operations inside its 40 x 30 box, in the palette's colours, at most 32 of them. The
// kernel checked only that it is a JSON array; an app from storage could send anything else.
const ICON_OPS = ["fill", "rect", "line", "text"], ICON_FONTS = ["s", "m", "mb", "l", "xl"];
const ICON_COLOURS = ["ink", "muted", "faint", "line", "soft", "accent", "ok", "warn", "blue"], HEX = /^#[0-9a-f]{6}$/i;
const BOX = [40, 30, 40, 30];   // the largest x, y and third and fourth number (a width and height, or a second point)
function lnOps(icon) {
  if (!Array.isArray(icon)) return null;
  const ops = [];
  for (const op of icon) {
    if (ops.length === 32) break;
    if (!Array.isArray(op) || !ICON_OPS.includes(op[0])) continue;
    const kind = op[0], n = kind === "text" ? 2 : 4, nums = op.slice(1, 1 + n);
    if (nums.length < n || !nums.every(Number.isFinite)) continue;
    const v = nums.map((x, i) => Math.max(0, Math.min(BOX[i], Math.round(x))));
    if (kind === "fill" || kind === "rect") { v[2] = Math.min(v[2], 40 - v[0]); v[3] = Math.min(v[3], 30 - v[1]); }
    let rest = op.slice(1 + n);
    if (kind === "text") {
      const [s, font] = rest;
      if (typeof s !== "string" || !s || [...s].length > 3) continue;
      v.push(s, ICON_FONTS.includes(font) ? font : "m");
      rest = rest.slice(2);
    }
    const c = rest[0];
    if (ICON_COLOURS.includes(c) || (typeof c === "string" && HEX.test(c))) v.push(c);
    ops.push([kind, ...v]);
  }
  return ops.length ? ops : null;
}

const shown = (w) => w.kind === "app" && w.name !== self && !(w.user && w.state === "stopped");
const names = (ws) => ws.filter(shown).map((w) => w.name).join();

// The apps, from the worlds; a system app keeps the first claim on a letter, an app from storage never has one.
function lnRefresh(s) {
  const ws = sys.worlds("name,kind,title,state,user,icon,about,key");
  const taken = new Set(), was = s.apps[s.sel] && s.apps[s.sel].app;
  s.apps = ws.filter(shown).map((w) => {
    const key = !w.user && w.key && !taken.has(w.key) ? w.key : "", ops = lnOps(w.icon);
    taken.add(key);
    const a = { app: w.name, label: w.title, key, about: (w.user ? "From storage: " + (w.about || "") : w.about || "").trim() };
    if (ops) a.ops = ops;
    else a.icon = w.name.replace(/^u-/, "").charAt(0).toUpperCase() || "?";   // a letter in place of a broken icon
    if (w.user) a.mark = true;
    return a;
  });
  const i = s.apps.findIndex((a) => a.app === was);
  s.sel = i >= 0 ? i : Math.max(0, Math.min(s.sel, s.apps.length - 1));
  s.names = names(ws);
  reveal(s);
  count(s, ws);
}

// Every two seconds, only the counts and whether apps came or went. An app declares its icon only when it starts,
// and coming to the front reads everything again, so the icons are not read (and checked) on every poll.
function lnPoll(s) {
  const ws = sys.worlds("name,kind,state,user");
  if (names(ws) !== s.names) lnRefresh(s);
  else count(s, ws);
}

function count(s, ws) {
  s.worlds = ws.length;
  s.running = ws.filter((w) => w.state !== "stopped" && w.state !== "restarting").length;
  s.crashes = sys.stats().crashes;
}

// Keep the selected app's row among the visible ones.
function reveal(s) {
  const row = Math.floor(s.sel / COLS);
  if (row < s.top) s.top = row;
  else if (row >= s.top + ROWS) s.top = row - ROWS + 1;
  s.top = Math.max(0, Math.min(s.top, Math.ceil(s.apps.length / COLS) - ROWS));
}

app("launcher")
  .title("PicoCalc")
  .state({ apps: [], names: "", sel: 0, top: 0, worlds: 0, running: 0, crashes: 0 })
  .onStart((s) => lnRefresh(s))
  .on("focus", (s) => lnRefresh(s))
  .on("key", (s, k) => {
    const n = s.apps.length;
    if (!n) return;
    if (k.key === "right") s.sel = (s.sel + 1) % n;
    else if (k.key === "left") s.sel = (s.sel + n - 1) % n;
    else if (k.key === "down") s.sel = Math.min(n - 1, s.sel + COLS);
    else if (k.key === "up") s.sel = Math.max(0, s.sel - COLS);
    else if (k.key === "enter" || k.key === "space") send("compositor", "open", { app: s.apps[s.sel].app });
    else {
      const ch = (k.ch || "").toLowerCase(), i = ch ? s.apps.findIndex((a) => a.key === ch) : -1;
      if (i >= 0) { s.sel = i; send("compositor", "open", { app: s.apps[i].app }); }
    }
    reveal(s);
  })
  .every(2000, (s) => lnPoll(s))
  .screen((s) => {
    const a = s.apps[s.sel], first = s.top * COLS, shown = s.apps.slice(first, first + ROWS * COLS);
    const more = (s.top > 0 ? "▲" : " ") + (first + shown.length < s.apps.length ? "▼" : " ");
    return ui.col({ gap: 6 },
      ui.row({},
        ui.text("Apps", { font: "l" }),
        ui.text(more.trim() ? `${more}  ${s.apps.length} apps` : "", { font: "s", color: "muted", align: "right" })),
      ui.grid(shown.map(({ app, about, ...tile }) => tile), s.sel - first, { cols: COLS, cell: 58, gap: 5 }),
      ui.text(a ? a.about : "No apps are running.", { wrap: true, font: "s", color: "ink" }),
      ui.gap(0),
      ui.text(`${s.running} of ${s.worlds} worlds running · ${s.crashes} crashes since boot`, { font: "s", color: "muted" }),
    );
  })
  .hints("←→↑↓ choose  ⏎ open  or press its letter");
