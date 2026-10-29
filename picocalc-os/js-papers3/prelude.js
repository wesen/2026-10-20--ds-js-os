// The prelude for the PaperS3 (MicroQuickJS, ES5): evaluated in every world before the world's own file.
// It gives worlds the same API as js/prelude.js does on the PicoCalc. The engine has no Promise, so the
// prelude carries a small one of its own, the Task: the kernel's asynchronous calls (__ka) return a promise
// id, the prelude maps it to a Task, and the kernel settles it through __settle(id, ok, json). Callbacks run
// before the segment ends, as a promise's would in QuickJS's job queue.
(function (g) {
  var k = g.__k, ka = g.__ka;

  // ---- small things ES5 does not have -----------------------------------------------------------------
  function assign(t) {
    for (var i = 1; i < arguments.length; i++) {
      var s = arguments[i];
      if (s) for (var key in s) if (Object.prototype.hasOwnProperty.call(s, key)) t[key] = s[key];
    }
    return t;
  }
  function repeat(s, n) { var r = ""; while (n-- > 0) r += s; return r; }
  function pad2(v) { v = String(v); return v.length < 2 ? "0" + v : v; }
  function startsWith(s, p) { return String(s).slice(0, p.length) === p; }
  function find(a, fn) { for (var i = 0; i < a.length; i++) if (fn(a[i], i)) return a[i]; return undefined; }
  function findIndex(a, fn) { for (var i = 0; i < a.length; i++) if (fn(a[i], i)) return i; return -1; }
  function flat(a, out) {
    out = out || [];
    for (var i = 0; i < a.length; i++) if (Array.isArray(a[i])) flat(a[i], out); else out.push(a[i]);
    return out;
  }
  function chars(s) {   // the characters of s (UTF-16 surrogate pairs kept together)
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { out.push(s.charAt(i) + s.charAt(i + 1)); i++; } else out.push(s.charAt(i));
    }
    return out;
  }
  g.assign = assign; g.repeat = repeat; g.pad2 = pad2; g.startsWith = startsWith; g.find = find; g.findIndex = findIndex;
  g.flat = flat; g.chars = chars;

  // ---- determinism: seeded randomness; time --------------------------------------------------------
  var seed = (k("seed") >>> 0) || 1;
  Math.random = function () {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  g.now = function () { return k("now"); };            // milliseconds since boot (virtual on the host)
  g.wallClock = function () { return Date.now(); };    // milliseconds since 1970 (the RTC's, once read)
  g.clockText = function (ms) {                       // "09:41" in UTC
    var m = Math.floor((ms === undefined ? Date.now() : ms) / 60000);
    return pad2(Math.floor(m / 60) % 24) + ":" + pad2(m % 60);
  };
  g.self = k("self");
  g.engine = k("engine");
  g.log = function () {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) parts.push(typeof arguments[i] === "string" ? arguments[i] : show(arguments[i]));
    k("log", parts.join(" "));
  };
  g.print = g.log;

  // ---- Task: a thenable ----------------------------------------------------------------------------------
  // state 0 pending, 1 fulfilled, 2 rejected. Settled tasks with callbacks wait in `ready` until drain().
  var ready = [];
  function Task() { this.state = 0; this.value = undefined; this.cbs = []; this.handled = false; }
  Task.prototype.then = function (ok, bad) {
    var t = new Task();
    this.cbs.push([ok, bad, t]);
    this.handled = true;
    if (this.state) ready.push(this);
    return t;
  };
  Task.prototype["catch"] = function (bad) { return this.then(null, bad); };
  function settle(t, state, v) {
    if (t.state) return;
    if (state === 1 && v && typeof v.then === "function") {
      v.then(function (x) { settle(t, 1, x); }, function (e) { settle(t, 2, e); });
      return;
    }
    t.state = state; t.value = v;
    ready.push(t);
  }
  function runCallbacks(t) {
    var cbs = t.cbs;
    t.cbs = [];
    for (var i = 0; i < cbs.length; i++) {
      var fn = t.state === 1 ? cbs[i][0] : cbs[i][1], next = cbs[i][2];
      if (typeof fn !== "function") { settle(next, t.state, t.value); continue; }
      try { settle(next, 1, fn(t.value)); } catch (e) { settle(next, 2, e); }
    }
  }
  var unhandled = [];
  function drain() {
    while (ready.length) {
      var t = ready.shift();
      if (t.state === 2 && !t.handled && !t.cbs.length) { unhandled.push(t); continue; }
      runCallbacks(t);
    }
    for (var i = 0; i < unhandled.length; i++)
      if (!unhandled[i].handled) log("a task failed and nothing handled it: " + errText(unhandled[i].value));
    unhandled = [];
  }
  Task.resolve = function (v) { var t = new Task(); settle(t, 1, v); return t; };
  Task.reject = function (e) { var t = new Task(); settle(t, 2, e); return t; };
  Task.all = function (list) {
    var t = new Task(), n = list.length, out = [];
    if (!n) { settle(t, 1, out); return t; }
    for (var i = 0; i < n; i++) out.push(undefined);
    list.forEach(function (x, i) {
      Task.resolve(x).then(function (v) { out[i] = v; if (--n === 0) settle(t, 1, out); }, function (e) { settle(t, 2, e); });
    });
    return t;
  };
  // run fn(item) for each item, one after another, waiting for each Task: seq([1, 2], fn) -> Task of results
  g.seq = function (items, fn) {
    var out = [], i = 0;
    function step() {
      if (i >= items.length) return Task.resolve(out);
      var it = items[i++];
      return Task.resolve(fn(it)).then(function (v) { out.push(v); return step(); });
    }
    return step();
  };
  g.Task = Task;

  var pending = {};   // kernel promise id -> Task
  function kernelTask(id) { var t = new Task(); pending[id] = t; return t; }
  g.__settle = function (id, ok, json) {
    var t = pending[id];
    delete pending[id];
    if (t) {
      if (ok) settle(t, 1, decode(json));
      else { var e = new Error(json == null ? "failed" : JSON.parse(json)); settle(t, 2, e); }
    }
    drain();
  };

  // ---- handles: hardware this world holds, passed in messages as {"$h": id} -------------------------------
  var known = {};
  function Handle(info) { assign(this, info); known[info.id] = this; }
  Handle.prototype.toJSON = function () { return { $h: this.id }; };
  Handle.prototype.narrow = function (rights) { return wrap(k("h.attenuate", this.id, rights)); };
  Handle.prototype.revoke = function () { return k("h.revoke", this.id); };
  Handle.prototype.release = function () { delete known[this.id]; return k("h.release", this.id); };
  // i2c: write bytes, then read nread bytes; with gapMs the bus is held between the two (one transaction)
  Handle.prototype.transfer = function (bytes, nread, gapMs) { return kernelTask(ka("i2c", this.id, bytes || [], nread || 0, gapMs || 0)); };
  Handle.prototype.read = function (reg, n, gapMs) { return kernelTask(ka("i2c", this.id, [reg], n || 1, gapMs || 0)); };
  Handle.prototype.read16 = function (reg, n) { return kernelTask(ka("i2c", this.id, [reg >> 8, reg & 0xff], n || 1, 0)); };
  Handle.prototype.write16 = function (reg, bytes) { return kernelTask(ka("i2c", this.id, [reg >> 8, reg & 0xff].concat(bytes || []), 0, 0)); };
  Handle.prototype.write = function (reg, bytes) { return kernelTask(ka("i2c", this.id, [reg].concat(bytes || []), 0, 0)); };
  // epd
  Handle.prototype.update = function (fb, x, y, w, h, mode) { return kernelTask(ka("epd.update", this.id, fb.id, x, y, w, h, mode || "quality")); };
  Handle.prototype.info = function () { return k("epd.info", this.id); };
  // adc, gpio
  Handle.prototype.sample = function () { return k("adc.read", this.id); };
  Handle.prototype.get = function () { return k("gpio.get", this.id); };
  // interrupts from the pin arrive as "irq" messages { pin, t }; "low" | "high" | "falling" | "rising"
  Handle.prototype.watch = function (mode) { k("gpio.watch", this.id, mode || "low"); };
  Handle.prototype.unwatch = function () { k("gpio.unwatch", this.id); };
  // framebuffer
  Handle.prototype.fill = function (x, y, w, h, c) { k("gfx.fill", this.id, x, y, w, h, c); };
  Handle.prototype.rect = function (x, y, w, h, c) { k("gfx.rect", this.id, x, y, w, h, c); };
  Handle.prototype.line = function (x0, y0, x1, y1, c) { k("gfx.line", this.id, x0, y0, x1, y1, c); };
  Handle.prototype.text = function (x, y, s, font, c, maxw) { return k("gfx.text", this.id, x, y, String(s), font || "m", c, maxw || 0); };
  Handle.prototype.commit = function () { return k("gfx.commit", this.id); };
  Handle.prototype.invalidate = function () { k("gfx.invalidate", this.id); };
  Handle.prototype.hash = function () { return k("gfx.hash", this.id); };
  function wrap(info) { return info ? known[info.id] || new Handle(info) : null; }

  // JSON in this engine takes no replacer or reviver, so handles are found and restored by walking the value.
  function isMark(v) { return v && typeof v === "object" && typeof v.$h === "number" && Object.keys(v).length === 1; }
  function collect(v, hs, depth) {
    if (!v || typeof v !== "object" || depth > 16) return;
    if (v instanceof Handle) { hs.push(v.id); return; }
    if (isMark(v)) { hs.push(v.$h); return; }
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) collect(v[i], hs, depth + 1); return; }
    for (var key in v) collect(v[key], hs, depth + 1);
  }
  function revive(v, depth) {
    if (!v || typeof v !== "object" || depth > 16) return v;
    if (isMark(v)) return known[v.$h] || wrap(k("h.info", v.$h)) || new Handle({ id: v.$h, type: "gone", rights: "" });
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) v[i] = revive(v[i], depth + 1); return v; }
    for (var key in v) v[key] = revive(v[key], depth + 1);
    return v;
  }
  function enc(v) {
    if (v === undefined) return [undefined, []];
    var hs = [];
    collect(v, hs, 0);
    return [JSON.stringify(v), hs];
  }
  function decode(json) { return json == null ? undefined : revive(JSON.parse(json), 0); }

  g.hw = {
    i2c: function (claim, hz) { return wrap(k("hw.i2c", claim, hz)); },
    epd: function (claim) { return wrap(k("hw.epd", claim)); },
    adc: function (claim) { return wrap(k("hw.adc", claim)); },
    gpio: function (claim) { return wrap(k("hw.gpio", claim)); },
  };
  g.dma = { alloc: function (w, h) { return wrap(k("dma.alloc", w, h)); } };
  g.gfx = {
    fonts: function () { return k("gfx.fonts"); },
    measure: function (s, font) { return k("gfx.measure", String(s), font || "m"); },
    wrap: function (s, font, w) { return k("gfx.wrap", String(s), font || "m", w); },
  };
  g.sys = {
    worlds: function (fields) { return k("sys.worlds", fields ? fields.join(",") : ""); },   // fields: the keys wanted, or all
    handles: function () { return k("sys.handles"); },
    stats: function () { return k("sys.stats"); },
    fault: function (name) { return k("sys.fault", name); },
    restart: function (name) { return k("sys.restart", name); },
    setClock: function (epochMs) { return k("clock.set", epochMs); },
    front: function (name) { return k("sys.front", name); },
  };
  // the world's own timers, by the order they were declared: timers.stop(0) / timers.start(0)
  g.timers = { start: function (i) { k("timer.set", i, true); }, stop: function (i) { k("timer.set", i, false); } };

  // ---- the persistent store: the world's own record, a JSON object that outlives restarts and power-off ------
  // It is read on first use; set and remove write the whole record when the segment ends (a segment that throws
  // writes nothing). Values are copied in and out, as through JSON.
  var rec = null;
  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function record() {
    if (rec) return rec;
    var t = k("store.load");
    try { rec = t ? JSON.parse(t) : {}; } catch (e) { log("store: the record is not JSON; starting empty"); rec = {}; }
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) rec = {};
    return rec;
  }
  function put(key, value) {
    var r = record(), had = r.hasOwnProperty(key), old = r[key];
    if (value === undefined) delete r[key]; else r[key] = copy(value);
    try { k("store.save", JSON.stringify(r)); }
    catch (e) { if (had) r[key] = old; else delete r[key]; throw e; }   // over the quota: the record stays as it was
  }
  g.store = {
    get: function (key) { var r = record(); return r.hasOwnProperty(key) ? copy(r[key]) : undefined; },
    set: function (key, value) { put(String(key), value); },
    remove: function (key) { put(String(key), undefined); },
    all: function () { return copy(record()); },
  };

  // ---- messages ------------------------------------------------------------------------------------
  g.send = function (to, type, payload) { var e = enc(payload); k("send", to, type, e[0], e[1]); };
  g.publish = function (ch, payload) { var e = enc(payload); k("publish", ch, e[0], e[1]); };
  g.ask = function (to, type, payload, opts) {
    var e = enc(payload);
    return kernelTask(ka("ask", to, type, e[0], e[1], (opts && opts.timeout) || 2000));
  };
  g.sleep = function (ms) { return kernelTask(ka("sleep", ms)); };

  // ---- the world's definition --------------------------------------------------------------------------
  var def = { kind: "world", name: null, title: null, initial: {}, on: {}, every: [], start: null, screen: null, hints: null, needs: [], provides: [] };
  var B = {
    title: function (t) { def.title = t; return B; },
    state: function (s) { def.initial = s; return B; },
    needs: function () { for (var i = 0; i < arguments.length; i++) def.needs.push(arguments[i]); return B; },
    provides: function () { for (var i = 0; i < arguments.length; i++) def.provides.push(arguments[i]); return B; },
    on: function (type, fn) { def.on[type] = fn; return B; },
    every: function (ms, fn, opts) { def.every.push({ ms: ms, fn: fn, paused: !!(opts && opts.paused) }); return B; },
    onStart: function (fn) { def.start = fn; return B; },
    screen: function (fn) { def.screen = fn; return B; },
    hints: function (h) { def.hints = h; return B; },
  };
  ["driver", "service", "app"].forEach(function (kind) { g[kind] = function (name) { def.kind = kind; def.name = name; return B; }; });

  var S = {};
  g.__init = function () {
    S = JSON.parse(JSON.stringify(def.initial || {}));
    if (def.name && def.name !== g.self) log("declares itself \"" + def.name + "\" but the manifest calls it \"" + g.self + "\"");
    return { kind: def.kind, title: def.title || g.self, needs: def.needs, provides: def.provides,
             every: def.every.map(function (e) { return e.ms; }), paused: def.every.map(function (e) { return e.paused; }),
             start: !!def.start, screen: !!def.screen };
  };

  function errText(e) {
    if (!(e instanceof Error)) return typeof e === "string" ? e : show(e);
    var where = k("err.where", e);
    return (e.name && e.name !== "Error" ? e.name + ": " : "") + e.message + (where ? " (" + where + ")" : "");
  }
  g.errText = errText;

  g.__dispatch = function (kind, type, json, from, isAsk) {
    var fn = kind === 0 ? def.on[type] : kind === 1 ? def.every[type] && def.every[type].fn : def.start;
    if (!fn) {
      if (isAsk) k("turn.reject", self + " has no handler for \"" + type + "\"");
      return undefined;
    }
    var r = fn(S, decode(json), { from: from, type: type, ask: isAsk });
    if (r && typeof r.then === "function") {
      k("turn.async");
      r.then(function (v) { var e = enc(v); k("turn.done", e[0], e[1]); }, function (e) { k("turn.fail", errText(e)); });
      drain();
      return undefined;
    }
    drain();
    if (!isAsk) return undefined;
    var e = enc(r);
    if (e[1].length) { k("turn.done", e[0], e[1]); return undefined; }
    return e[0];
  };

  g.__render = function () {
    if (!def.screen) return null;
    var tree = def.screen(S);
    var hints = typeof def.hints === "function" ? def.hints(S) : def.hints;
    return JSON.stringify({ tree: tree, hints: hints || "" });
  };

  // ---- the ui vocabulary: plain objects the compositor lays out and draws ---------------------------------
  function isOpts(x) { return x && typeof x === "object" && !Array.isArray(x) && !x.t; }
  function node(t) {
    return function () {
      var kids = Array.prototype.slice.call(arguments), o = isOpts(kids[0]) ? kids.shift() : {};
      return assign({ t: t }, o, { kids: flat(kids).filter(function (x) { return x != null && x !== false; }) });
    };
  }
  function leaf(t, key) { return function (v, o) { var n = { t: t }; n[key] = v; return assign(n, o); }; }
  g.ui = {
    col: node("col"),
    row: node("row"),
    box: node("box"),
    text: function (s, o) { return assign({ t: "text", s: String(s) }, o); },
    title: function (s, o) { return assign({ t: "text", s: String(s), font: "l" }, o); },
    gap: function (h) { return { t: "gap", h: h == null ? 16 : h }; },
    sep: function (o) { return assign({ t: "sep" }, o); },
    bar: function (frac, o) { return assign({ t: "bar", v: Math.max(0, Math.min(1, +frac || 0)) }, o); },
    list: function (items, o) { return assign({ t: "list", items: items }, o); },
    table: function (cols, rows, o) { return assign({ t: "table", cols: cols, rows: rows }, o); },
    lines: leaf("lines", "items"),
    spark: leaf("spark", "values"),
    kv: leaf("kv", "pairs"),
    grid: leaf("grid", "items"),
    canvas: function (w, h, ops, o) { return assign({ t: "canvas", w: w, h: h, ops: ops }, o); },
    input: function (value, o) { return assign({ t: "input", value: String(value) }, o); },
    button: function (label, o) { return assign({ t: "button", label: String(label) }, o); },
    tabs: function (labels, sel, o) { return assign({ t: "tabs", labels: labels, sel: sel }, o); },
    keyboard: function (o) { return assign({ t: "keyboard" }, o); },
    ink: function (w, h, strokes, o) { return assign({ t: "ink", w: w, h: h, strokes: strokes }, o); },
  };

  // ---- showing values, for logs and the REPL --------------------------------------------------------------
  function show(v, depth, seen) {
    depth = depth || 0; seen = seen || [];
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    if (typeof v === "string") return depth ? JSON.stringify(v) : v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (typeof v === "function") return "[function " + (v.name || "anonymous") + "]";
    if (v instanceof Error) return errText(v);
    if (seen.indexOf(v) >= 0) return "[circular]";
    if (depth > 2) return Array.isArray(v) ? "[…]" : "{…}";
    seen.push(v);
    var out;
    if (Array.isArray(v)) out = "[" + v.slice(0, 20).map(function (x) { return show(x, depth + 1, seen); }).join(", ") + (v.length > 20 ? ", …" : "") + "]";
    else if (v instanceof Handle) out = "[handle " + v.id + " " + v.type + " " + v.rights + "]";
    else if (v instanceof Task) out = "[task " + ["pending", "done", "failed"][v.state] + "]";
    else {
      var ks = Object.keys(v);
      out = "{" + ks.slice(0, 12).map(function (key) {
        return (/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)) + ": " + show(v[key], depth + 1, seen);
      }).join(", ") + (ks.length > 12 ? ", …" : "") + "}";
    }
    seen.pop();
    return out;
  }
  g.show = function (v) { return show(v, 1); };
})(globalThis);
