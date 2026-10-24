// The prelude: evaluated in every world's VM before the world's own file. It turns the two host
// functions the nucleus gives a world (__k for things that finish now, __ka for things that finish
// later) into the API worlds are written against, and holds the world's definition and state.
"use strict";
(function (g) {
  const k = g.__k, ka = g.__ka;
  delete g.__k;
  delete g.__ka;

  // ---- determinism: seeded randomness, virtual time ------------------------------------------------
  let seed = (k("seed") >>> 0) || 1;
  Math.random = function () {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  const BOOT = Date.UTC(2026, 9, 22, 9, 41, 0);   // the wall clock reads this at boot
  const RealDate = Date;
  class VDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(BOOT + k("now")); }
    static now() { return BOOT + k("now"); }
  }
  g.Date = VDate;
  g.now = () => k("now");                  // virtual milliseconds since boot
  g.self = k("self");
  g.log = (...a) => k("log", a.map((x) => (typeof x === "string" ? x : show(x))).join(" "));
  g.print = g.log;

  // ---- handles -------------------------------------------------------------------------------------
  // A handle stands for hardware the kernel let this world have. It travels in messages like any other
  // value: the receiver is given it on delivery. Every use is checked by the kernel.
  const known = new Map();
  class Handle {
    constructor(info) { Object.assign(this, info); known.set(info.id, this); }
    toJSON() { return { $h: this.id }; }
    narrow(rights) { return wrap(k("h.attenuate", this.id, rights)); }
    revoke() { return k("h.revoke", this.id); }
    release() { known.delete(this.id); return k("h.release", this.id); }
    // i2c
    // write bytes, then read nread bytes; with gapMs, the bus is held between the two (one transaction)
    transfer(bytes, nread, gapMs) { return ka("i2c", this.id, bytes || [], nread || 0, gapMs || 0); }
    read(reg, n = 2, gapMs = 0) { return ka("i2c", this.id, [reg], n, gapMs); }
    write(reg, value) { return ka("i2c", this.id, [reg | 0x80, value], 0); }
    // spi
    cmd(c, data) { return ka("spi.cmd", this.id, c, data || []); }
    pixels(fb, x, y, w, h) { return ka("spi.pixels", this.id, fb.id, x, y, w, h); }
    // framebuffer
    fill(x, y, w, h, c) { k("gfx.fill", this.id, x, y, w, h, c); }
    rect(x, y, w, h, c) { k("gfx.rect", this.id, x, y, w, h, c); }
    line(x0, y0, x1, y1, c) { k("gfx.line", this.id, x0, y0, x1, y1, c); }
    text(x, y, s, font, c, maxw) { return k("gfx.text", this.id, x, y, String(s), font || "m", c, maxw || 0); }
    commit() { return k("gfx.commit", this.id); }
    invalidate() { k("gfx.invalidate", this.id); }
  }
  const wrap = (info) => (info ? known.get(info.id) || new Handle(info) : null);
  const revive = (key, v) => (v && typeof v === "object" && typeof v.$h === "number" && Object.keys(v).length === 1
    ? known.get(v.$h) || wrap(k("h.info", v.$h)) || new Handle({ id: v.$h, type: "gone", rights: "" }) : v);
  function enc(v) {
    if (v === undefined) return [undefined, []];
    const hs = [];
    const json = JSON.stringify(v, (key, x) => {
      if (x && typeof x === "object" && typeof x.$h === "number" && Object.keys(x).length === 1) hs.push(x.$h);
      return x;
    });
    return [json, hs];
  }
  const decode = (json) => (json == null ? undefined : JSON.parse(json, revive));

  g.hw = {
    i2c: (claim, hz) => wrap(k("hw.i2c", claim, hz)),
    spi: (claim, hz) => wrap(k("hw.spi", claim, hz)),
  };
  g.dma = { alloc: (w, h) => wrap(k("dma.alloc", w, h)) };
  g.gfx = { fonts: () => k("gfx.fonts") };
  g.sys = {
    worlds: () => k("sys.worlds"),
    handles: () => k("sys.handles"),
    stats: () => k("sys.stats"),
    fault: (name) => k("sys.fault", name),
    restart: (name) => k("sys.restart", name),
  };

  // ---- messages ------------------------------------------------------------------------------------
  g.send = (to, type, payload) => { const [j, hs] = enc(payload); k("send", to, type, j, hs); };
  g.publish = (ch, payload) => { const [j, hs] = enc(payload); k("publish", ch, j, hs); };
  g.ask = (to, type, payload, opts) => {
    const [j, hs] = enc(payload);
    return ka("ask", to, type, j, hs, (opts && opts.timeout) || 2000).then((v) => (v && typeof v === "object" ? reviveTree(v) : v));
  };
  const reviveTree = (v) => decode(JSON.stringify(v));
  g.sleep = (ms) => ka("sleep", ms);

  // ---- the world's definition --------------------------------------------------------------------------
  const def = { kind: "world", name: null, title: null, initial: {}, on: {}, every: [], start: null, screen: null, hints: null, needs: [], provides: [] };
  const B = {
    title(t) { def.title = t; return B; },
    state(s) { def.initial = s; return B; },
    needs(...c) { def.needs.push(...c); return B; },
    provides(...c) { def.provides.push(...c); return B; },
    on(type, fn) { def.on[type] = fn; return B; },
    every(ms, fn) { def.every.push({ ms, fn }); return B; },
    onStart(fn) { def.start = fn; return B; },
    screen(fn) { def.screen = fn; return B; },
    hints(h) { def.hints = h; return B; },
  };
  for (const kind of ["driver", "service", "app"]) g[kind] = (name) => { def.kind = kind; def.name = name; return B; };

  let S = {};
  g.__init = () => {
    S = JSON.parse(JSON.stringify(def.initial || {}));
    if (def.name && def.name !== g.self) log(`declares itself "${def.name}" but the manifest calls it "${g.self}"`);
    return { kind: def.kind, title: def.title || g.self, needs: def.needs, provides: def.provides, every: def.every.map((e) => e.ms), start: !!def.start, screen: !!def.screen };
  };

  const errText = (e) => {
    if (!(e instanceof Error)) return String(e);
    const at = String(e.stack || "").split("\n").find((l) => l.includes("(") && !l.includes("prelude.js"));
    const where = at ? " (" + at.slice(at.indexOf("(") + 1, at.lastIndexOf(")")) + ")" : "";
    return (e.name && e.name !== "Error" ? e.name + ": " : "") + e.message + where;
  };
  g.errText = errText;

  g.__dispatch = (kind, type, json, from, isAsk) => {
    const fn = kind === 0 ? def.on[type] : kind === 1 ? def.every[type] && def.every[type].fn : def.start;
    if (!fn) {
      if (isAsk) k("turn.reject", `${g.self} has no handler for "${type}"`);
      return undefined;
    }
    const r = fn(S, decode(json), { from, type, ask: isAsk });
    if (r && typeof r.then === "function") {
      k("turn.async");
      r.then((v) => { const [j, hs] = enc(v); k("turn.done", j, hs); }, (e) => k("turn.fail", errText(e)));
      return undefined;
    }
    if (!isAsk) return undefined;
    const [j, hs] = enc(r);
    if (hs.length) { k("turn.done", j, hs); return undefined; }
    return j;
  };

  g.__render = () => {
    if (!def.screen) return null;
    const tree = def.screen(S);
    const hints = typeof def.hints === "function" ? def.hints(S) : def.hints;
    return JSON.stringify({ tree, hints: hints || "" });
  };

  // ---- the ui vocabulary: plain objects the compositor lays out and draws ---------------------------------
  const isOpts = (x) => x && typeof x === "object" && !Array.isArray(x) && !x.t;
  const node = (t) => (...kids) => {
    const o = isOpts(kids[0]) ? kids.shift() : {};
    return Object.assign({ t }, o, { kids: kids.flat(9).filter((x) => x != null && x !== false) });
  };
  g.ui = {
    col: node("col"),
    row: node("row"),
    box: node("box"),
    text: (s, o) => Object.assign({ t: "text", s: String(s) }, o),
    title: (s, o) => Object.assign({ t: "text", s: String(s), font: "l" }, o),
    gap: (h) => ({ t: "gap", h: h == null ? 8 : h }),
    sep: (o) => Object.assign({ t: "sep" }, o),
    bar: (frac, o) => Object.assign({ t: "bar", v: Math.max(0, Math.min(1, +frac || 0)) }, o),
    list: (items, sel, o) => Object.assign({ t: "list", items, sel: sel == null ? -1 : sel }, o),
    table: (cols, rows, o) => Object.assign({ t: "table", cols, rows }, o),
    lines: (items, o) => Object.assign({ t: "lines", items }, o),
    spark: (values, o) => Object.assign({ t: "spark", values }, o),
    canvas: (w, h, ops, o) => Object.assign({ t: "canvas", w, h, ops }, o),
    input: (value, o) => Object.assign({ t: "input", value: String(value) }, o),
    grid: (items, sel, o) => Object.assign({ t: "grid", items, sel: sel == null ? -1 : sel }, o),
    kv: (pairs, o) => Object.assign({ t: "kv", pairs }, o),
  };

  // ---- showing values, for logs and the REPL --------------------------------------------------------------
  function show(v, depth = 0, seen = new Set()) {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    if (typeof v === "string") return depth ? JSON.stringify(v) : v;
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
    if (typeof v === "function") return `[function ${v.name || "anonymous"}]`;
    if (typeof v === "symbol") return v.toString();
    if (v instanceof Error) return errText(v);
    if (seen.has(v)) return "[circular]";
    if (depth > 2) return Array.isArray(v) ? "[…]" : "{…}";
    seen.add(v);
    let out;
    if (Array.isArray(v)) out = "[" + v.slice(0, 20).map((x) => show(x, depth + 1, seen)).join(", ") + (v.length > 20 ? ", …" : "") + "]";
    else if (v instanceof Handle) out = `[handle ${v.id} ${v.type} ${v.rights}]`;
    else {
      const ks = Object.keys(v);
      out = "{" + ks.slice(0, 12).map((key) => `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)}: ${show(v[key], depth + 1, seen)}`).join(", ") + (ks.length > 12 ? ", …" : "") + "}";
    }
    seen.delete(v);
    return out;
  }
  g.show = (v) => show(v, 1);
})(globalThis);
