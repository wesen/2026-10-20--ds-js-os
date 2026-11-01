// Loader: apps stored as files in apps/ on the device, run as worlds named u-<name> with no claims. A JavaScript app
// is read with the Loader's own handle and its text passed to sys.spawn; for a WebAssembly app (name.wasm) the
// Loader passes a read-only handle to the file and the kernel reads the bytes. An app from storage can show a screen
// (JavaScript), get keys while it is in front, keep a small store and talk to other worlds, and nothing more.
const LD_FILE = /^([a-z0-9-]{1,12})\.(js|wasm)$/;
const LD_AUTOSTART = "autostart.txt";
const LD_TEMPLATE = `// An app from storage. It runs as the world u-hello, with no claims: it can show a screen, keep a small store,
// and get keys while it is in front. It cannot read files, use the network, or hear keys meant for other apps.
app("hello")
  .state({ starts: 0, keys: 0, time: "" })
  .onStart((s) => { s.starts = store.get("starts", 0) + 1; store.set("starts", s.starts); })
  .on("key", (s, k) => { if (k.state === "down") s.keys++; })
  .every(1000, (s) => { s.time = new Date().toTimeString().slice(0, 8); })
  .screen((s) => ui.col({ gap: 8 },
    ui.text("Hello from storage", { font: "l" }),
    ui.text("Started " + s.starts + (s.starts === 1 ? " time; " : " times; ") + s.keys + " keys pressed here.", { font: "s" }),
    ui.text(s.time, { font: "xl", align: "center" }),
    ui.text("Change apps/hello.js in the Loader with F3, then reload it with F5.", { font: "s", color: "muted", wrap: true })))
  .hints("an app from storage");
`;

// The apps in apps/, with the state of their worlds.
async function ldRefresh(s) {
  if (!s.dir) return;
  try {
    const files = await s.dir.list();
    s.apps = files.filter((f) => !f.dir && LD_FILE.test(f.name)).map((f) => ({ name: LD_FILE.exec(f.name)[1], ext: LD_FILE.exec(f.name)[2], size: f.size }))
      .sort((a, b) => (a.name + "." + a.ext < b.name + "." + b.ext ? -1 : 1));
    s.error = "";
  } catch (e) { s.apps = []; s.error = e.message; }
  if (s.sel >= s.apps.length) s.sel = Math.max(0, s.apps.length - 1);
  ldWorlds(s);
}
function ldWorlds(s) {
  try { s.worlds = Object.fromEntries(sys.worlds().filter((w) => w.user).map((w) => [w.name, { state: w.state, error: w.last_error }])); }
  catch (e) { s.worlds = {}; }
}
const ldWorld = (s, name) => s.worlds["u-" + name] || null;
const ldRunning = (w) => !!w && w.state !== "stopped" && w.state !== "restarting";

async function ldStart(s, app, open) {
  const name = app.name;
  if (app.ext === "wasm") {
    const h = s.dir.at(name + ".wasm", "r");
    try { await sys.spawn(name, h); }
    catch (e) { s.note = e.message; return false; }
    finally { h.release(); }
  } else {
    let source;
    try { source = await s.dir.read(name + ".js"); }
    catch (e) { s.note = e.message; return false; }
    try { sys.spawn(name, source); }
    catch (e) { s.note = e.message; return false; }
  }
  s.note = "Started u-" + name + ".";
  if (open) send("compositor", "open", { app: "u-" + name });
  await sleep(300);
  ldWorlds(s);
  return true;
}

async function ldEdit(s, name) {
  const h = s.dir.at(name + ".js", "rw");
  let r;
  try { r = await ask("editor", "open", { file: h, name: "apps/" + name + ".js" }, { timeout: 3000 }); }
  catch (e) { r = { ok: false, why: e.message }; }
  if (r && r.ok) {
    if (s.given) { s.given.revoke(); s.given.release(); }
    s.given = h;
    send("compositor", "open", { app: "editor" });
  } else { h.revoke(); h.release(); s.note = "Editor: " + ((r && r.why) || "no answer"); }
}

// A new app from the template, under the first free name: hello, hello2, ...
async function ldNew(s) {
  const taken = new Set(s.apps.map((a) => a.name));
  let name = "hello";
  for (let i = 2; taken.has(name) && i < 100; i++) name = "hello" + i;
  try { await s.dir.write(name + ".js", LD_TEMPLATE.replace(/hello/g, name).replace("Hello from storage", "Hello from " + name + ".js")); }
  catch (e) { s.note = e.message; return; }
  await ldRefresh(s);
  s.sel = Math.max(0, s.apps.findIndex((a) => a.name === name));
  s.note = "Wrote apps/" + name + ".js. Enter starts it.";
}

async function ldAutostart(s) {
  let text;
  try { text = await s.dir.read(LD_AUTOSTART); } catch (e) { return; }   // no list: nothing to start
  const names = text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const started = [];
  for (const name of names) {   // a name: its .js file if there is one, else its .wasm file
    const app = s.apps.find((a) => a.name === name);
    if (app && await ldStart(s, app, false)) started.push(name);
  }
  s.note = started.length ? "Started at boot: " + started.join(", ") : "";
  s.noteAt = now();
}

async function ldKey(s, k) {
  if (!k || k.state === "up") return;
  const once = k.state === "down";
  const a = s.apps[s.sel];
  s.note = ""; s.noteAt = now();
  switch (k.key) {
    case "up": s.sel = Math.max(0, s.sel - 1); return;
    case "down": s.sel = Math.min(Math.max(0, s.apps.length - 1), s.sel + 1); return;
    case "enter": case "space": {
      if (!once || !a) return;
      const w = ldWorld(s, a.name);
      if (ldRunning(w)) return send("compositor", "open", { app: "u-" + a.name });
      return ldStart(s, a, a.ext === "js");
    }
    case "f2":
      if (!once || !a || !ldWorld(s, a.name)) return;
      try { sys.stop("u-" + a.name); s.note = "Stopped u-" + a.name + "."; } catch (e) { s.note = e.message; }
      await sleep(100); ldWorlds(s);
      return;
    case "f3":
      if (once && a && a.ext !== "js") { s.note = "A WebAssembly app is built elsewhere; it cannot be edited here."; return; }
      if (once && a) return ldEdit(s, a.name);
      return;
    case "f4": if (once) return ldNew(s); return;
    case "f5": if (once && a) return ldStart(s, a, false); return;
  }
}

function ldState(s, a) {
  const w = ldWorld(s, a.name);
  if (!w) return { text: "not started", color: "muted" };
  if (w.state === "stopped") return w.error && !w.error.startsWith("stopped by") ? { text: "stopped: " + w.error, color: "accent" } : { text: "stopped", color: "muted" };
  if (w.state === "restarting") return w.error ? { text: "crashed: " + w.error, color: "accent" } : { text: "starting", color: "muted" };
  return { text: "running", color: "ok" };
}

function ldScreen(s) {
  const items = s.apps.map((a) => { const st = ldState(s, a); return { label: a.name + "." + a.ext, detail: (a.size / 1024).toFixed(1) + " KB", right: st.text, rightColor: st.color }; });
  const running = s.apps.filter((a) => ldState(s, a).text === "running").length;
  const sel = s.apps[s.sel], w = sel && ldWorld(s, sel.name);
  const why = w && w.error && !w.error.startsWith("stopped by") ? "u-" + sel.name + ": " + w.error : "";
  return ui.col({ gap: 6 },
    items.length ? ui.list(items, s.sel, { font: "s", lead: 7, grow: 1 })
      : ui.col({ grow: 1 }, ui.text(s.error || "No apps in apps/ yet. F4 writes one from a template.", { font: "s", color: "muted", wrap: true })),
    ui.text(s.note || s.error || why || `apps/ · ${s.apps.length} apps · ${running} running · no claims`,
            { font: "s", wrap: true, color: s.note || s.error || why ? "accent" : "muted" }));
}

app("loader")
  .title("Loader")
  .state({ apps: [], worlds: {}, sel: 0, note: "", noteAt: 0, error: "", focused: false, given: null })
  .onStart(async (s) => {
    try { s.dir = hw.fs("fs:/apps"); } catch (e) { s.error = e.message; return; }
    await ldRefresh(s);
    await ldAutostart(s);
  })
  .on("focus", async (s) => { s.focused = true; await ldRefresh(s); })
  .on("blur", (s) => { s.focused = false; })
  .on("key", (s, k, msg) => { if (msg.from === "compositor") return ldKey(s, k); })
  .every(1000, (s) => {
    if (!s.focused) return;
    ldWorlds(s);
    if (s.note && now() - s.noteAt > 4000) s.note = "";   // what just happened; the list shows what is
  })
  .screen(ldScreen)
  .hints("⏎ open F2 stop F3 edit F4 new F5 reload");
