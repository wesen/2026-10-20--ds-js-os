// The compositor owns the framebuffer. Apps never draw: each one publishes a frame (a tree of ui nodes)
// when what it shows changes, and the compositor lays out the focused app's tree, draws it with the
// status and hint bars, works out which pixels changed, and asks the display driver to send those.
// It also routes keys to the focused app, switches apps, and shows crashes as they happen.
const W = 320, H = 320, TOP = 22, BOTTOM = 18, BODY = H - TOP - BOTTOM;
const C = {
  paper: "#f6f4ef", ink: "#1d1c1a", muted: "#787369", faint: "#a9a397", line: "#dcd7cc", soft: "#ebe7de",
  accent: "#d42a2f", accentInk: "#ffffff", ok: "#2e7d4f", warn: "#b86e00", blue: "#2a5db0",
  bar: "#1d1c1a", barInk: "#f1eee7", barMuted: "#9b968c", sel: "#1d1c1a", selInk: "#f6f4ef",
};
const color = (c, d) => (c ? C[c] || c : d || C.ink);
// on a dark background, the same names in lighter shades
const DARK = { ink: "#f1eee7", muted: "#9b968c", faint: "#77736b", accent: "#ff7a72", ok: "#7ed39a", warn: "#f0b44c", blue: "#8ab4ff" };
const colorOn = (dark, c, d) => (dark ? DARK[c] || color(c, d) : color(c, d));
let F = null;   // font cell sizes: { s: [6, 12], m: [8, 16], ... }
const fw = (f) => F[f || "m"][0], fh = (f) => F[f || "m"][1];

// ---- text helpers ---------------------------------------------------------------------------------------
const len = (s) => Array.from(s).length;
function wrapText(s, cols) {
  cols = Math.max(1, cols);
  const out = [];
  for (const para of String(s).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      let w = word;
      while (len(w) > cols) {   // a word longer than the line: break it
        if (line) { out.push(line); line = ""; }
        out.push(Array.from(w).slice(0, cols).join(""));
        w = Array.from(w).slice(cols).join("");
      }
      if (!line) line = w;
      else if (len(line) + 1 + len(w) <= cols) line += " " + w;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

// ---- layout: how tall a node wants to be at a width, and whether it takes leftover room -------------------
function measure(n, w) {
  switch (n.t) {
    case "text": {
      const p = n.pad || 0, lines = n.wrap ? wrapText(n.s, Math.floor((w - 2 * p) / fw(n.font))).length : 1;
      return { h: lines * (fh(n.font) + (n.lead || 0)) + 2 * p, grow: 0 };
    }
    case "gap": return { h: n.h, grow: 0 };
    case "sep": return { h: n.h || 9, grow: 0 };
    case "bar": return { h: (n.h || 8) + (n.label ? fh("s") + 3 : 0), grow: 0 };
    case "spark": return { h: (n.h || 36) + (n.label ? fh("s") + 3 : 0), grow: 0 };
    case "canvas": return { h: n.h, grow: 0 };
    case "input": return { h: fh(n.font) + 10, grow: 0 };
    case "kv": return { h: n.pairs.length * (fh(n.font || "s") + (n.lead ?? 4)), grow: 0 };
    case "grid": {
      const cols = n.cols || 3, rows = Math.ceil(n.items.length / cols);
      return { h: rows * (n.cell || 64) + (rows - 1) * (n.gap ?? 8), grow: 0 };
    }
    case "list": case "lines": case "table": {
      const rh = rowH(n), head = n.t === "table" && n.head !== false ? fh("s") + 6 : 0;
      return n.visible ? { h: n.visible * rh + head, grow: 0 } : { h: rh + head, grow: n.grow ?? 1 };   // visible: rows shown
    }
    case "box": {
      const p = n.pad ?? 6, m = measureStack(n.kids, w - 2 * p, n.gap ?? 4);
      return { h: m.h + 2 * p, grow: n.grow ?? m.grow };
    }
    case "col": { const m = measureStack(n.kids, w - 2 * (n.pad || 0), n.gap ?? 0); return { h: m.h + 2 * (n.pad || 0), grow: n.grow ?? m.grow }; }
    case "row": {
      const ws = rowWidths(n, w);
      let h = 0, grow = 0;
      n.kids.forEach((k, i) => { const m = measure(k, ws[i]); h = Math.max(h, m.h); grow = grow || m.grow; });
      return { h, grow: n.grow ?? grow };
    }
    default: return { h: 0, grow: 0 };
  }
}
const rowH = (n) => n.t === "lines" ? fh(n.font || "s") + (n.lead ?? 1) : fh(n.font || "m") + (n.lead ?? 7);
function measureStack(kids, w, gap) {
  let h = 0, grow = 0;
  kids.forEach((k, i) => { const m = measure(k, w); h += m.h + (i ? gap : 0); grow += m.grow; });
  return { h, grow };
}
function rowWidths(n, w) {
  const gap = n.gap ?? 8, kids = n.kids;
  const free = w - gap * Math.max(0, kids.length - 1) - kids.reduce((a, k) => a + (k.w || 0), 0);
  const flex = kids.filter((k) => !k.w).length || 1;
  return kids.map((k) => k.w || Math.floor(free / flex));
}

// ---- drawing ----------------------------------------------------------------------------------------------
function draw(fb, n, x, y, w, h) {
  switch (n.t) {
    case "col": case "box": {
      let p = n.t === "box" ? n.pad ?? 6 : n.pad || 0;
      if (n.bg) fb.fill(x, y, w, h, color(n.bg));
      if (n.border) fb.rect(x, y, w, h, color(n.border));
      stack(fb, n.kids, x + p, y + p, w - 2 * p, h - 2 * p, n.gap ?? (n.t === "box" ? 4 : 0));
      break;
    }
    case "row": {
      const ws = rowWidths(n, w), gap = n.gap ?? 8;
      let cx = x;
      n.kids.forEach((k, i) => { draw(fb, k, cx, y, ws[i], h); cx += ws[i] + gap; });
      break;
    }
    case "text": {
      const p = n.pad || 0, f = n.font, cw = fw(f), lh = fh(f) + (n.lead || 0);
      if (n.bg) fb.fill(x, y, w, h, color(n.bg));
      const lines = n.wrap ? wrapText(n.s, Math.floor((w - 2 * p) / cw)) : [n.s];
      lines.forEach((line, i) => {
        const tw = len(line) * cw;
        const tx = n.align === "center" ? x + Math.max(p, (w - tw) >> 1) : n.align === "right" ? x + Math.max(p, w - p - tw) : x + p;
        fb.text(tx, y + p + i * lh, line, f, color(n.color), w - (tx - x) - p);
      });
      break;
    }
    case "sep": fb.fill(x, y + ((n.h || 9) >> 1), w, 1, color(n.color, C.line)); break;
    case "bar": {
      const bh = n.h || 8;
      let by = y;
      if (n.label) { fb.text(x, y, n.label, "s", C.muted, w); if (n.right) fb.text(x + w - len(n.right) * fw("s"), y, n.right, "s", C.muted); by += fh("s") + 3; }
      fb.fill(x, by, w, bh, C.soft);
      fb.fill(x, by, Math.round(w * n.v), bh, color(n.color, C.ink));
      break;
    }
    case "spark": {
      const sh = n.h || 36;
      let sy = y;
      if (n.label) { fb.text(x, y, n.label, "s", C.muted, w); if (n.right) fb.text(x + w - len(n.right) * fw("s"), y, n.right, "s", C.ink); sy += fh("s") + 3; }
      fb.fill(x, sy, w, sh, n.bg ? color(n.bg) : C.soft);
      const v = n.values || [], max = n.max || Math.max(1e-9, ...v), cnt = n.points || v.length;
      const step = w / Math.max(1, cnt - 1), base = sy + sh - 1;
      if (n.style === "bars") {
        const bw = Math.max(1, Math.floor(w / Math.max(1, cnt)) - 1);
        v.forEach((val, i) => { const bh = Math.round((sh - 2) * Math.min(1, val / max)); fb.fill(x + i * (bw + 1), base - bh + 1, bw, bh, color(n.color, C.ink)); });
      } else {
        let px = -1, py = -1;
        v.forEach((val, i) => {
          const cx = Math.round(x + i * step), cy = Math.round(base - (sh - 3) * Math.min(1, val / max));
          if (px >= 0) { fb.line(px, py, cx, cy, color(n.color, C.ink)); fb.line(px, py + 1, cx, cy + 1, color(n.color, C.ink)); }
          px = cx; py = cy;
        });
      }
      break;
    }
    case "canvas": {
      const ox = x + Math.max(0, (w - n.w) >> 1);
      if (n.bg) fb.fill(ox, y, n.w, n.h, color(n.bg));
      for (const op of n.ops) {
        const [kind, a, b, c, d, e, f] = op;
        if (kind === "fill") fb.fill(ox + a, y + b, c, d, color(e));
        else if (kind === "rect") fb.rect(ox + a, y + b, c, d, color(e));
        else if (kind === "line") fb.line(ox + a, y + b, ox + c, y + d, color(e));
        else if (kind === "text") fb.text(ox + a, y + b, c, d || "m", color(e), f || 0);
      }
      if (n.border) fb.rect(ox - 1, y - 1, n.w + 2, n.h + 2, color(n.border));
      break;
    }
    case "input": {
      const f = n.font || "m", cw = fw(f), ih = fh(f) + 10;
      fb.fill(x, y, w, ih, n.bg ? color(n.bg) : "#ffffff");
      fb.rect(x, y, w, ih, n.focus === false ? C.line : C.ink);
      const prompt = n.prompt || "";
      const room = Math.floor((w - 12) / cw) - len(prompt) - 1;
      let v = n.value, cur = n.cursor ?? len(v), start = Math.max(0, cur - room);
      const shown = Array.from(v).slice(start, start + room).join("");
      fb.text(x + 6, y + 5, prompt, f, C.accent);
      const tx = x + 6 + len(prompt) * cw;
      fb.text(tx, y + 5, shown, f, C.ink);
      if (n.focus !== false && !n.busy) fb.fill(tx + (cur - start) * cw, y + 4, 2, fh(f) + 2, C.accent);
      if (n.busy) fb.text(x + w - 6 - cw, y + 5, "…", f, C.muted);
      break;
    }
    case "kv": {
      const f = n.font || "s", lh = fh(f) + (n.lead ?? 4), kw = n.keyW || Math.floor(w * 0.45);
      n.pairs.forEach(([k, v, c], i) => {
        fb.text(x, y + i * lh, k, f, C.muted, kw - 4);
        fb.text(x + kw, y + i * lh, v, f, color(c), w - kw);
      });
      break;
    }
    case "grid": {
      const cols = n.cols || 3, gap = n.gap ?? 8, ch = n.cell || 64, cw = Math.floor((w - gap * (cols - 1)) / cols);
      n.items.forEach((it, i) => {
        const cx = x + (i % cols) * (cw + gap), cy = y + Math.floor(i / cols) * (ch + gap), sel = i === n.sel;
        fb.fill(cx, cy, cw, ch, sel ? color(it.color, C.accent) : "#ffffff");
        fb.rect(cx, cy, cw, ch, sel ? color(it.color, C.accent) : C.line);
        const ink = sel ? C.accentInk : color(it.color, C.ink);
        if (it.key) fb.text(cx + 5, cy + 3, it.key, "s", sel ? C.accentInk : C.faint);
        if (it.ops) {   // a small drawing, in a 40 x 30 box centred above the label
          const ox = cx + ((cw - 40) >> 1), oy = cy + 8;
          for (const [kind, a, b, c, d, e] of it.ops) {
            const col = e === "ink" || !e ? ink : sel ? C.accentInk : color(e);
            if (kind === "fill") fb.fill(ox + a, oy + b, c, d, col);
            else if (kind === "rect") fb.rect(ox + a, oy + b, c, d, col);
            else if (kind === "line") fb.line(ox + a, oy + b, ox + c, oy + d, col);
            else if (kind === "text") fb.text(ox + a, oy + b, c, d || "m", col);
          }
        } else {
          const ig = it.icon || "?", iw = len(ig) * fw("xl");
          fb.text(cx + ((cw - iw) >> 1), cy + 4, ig, "xl", ink);
        }
        const lw = len(it.label) * fw("s");
        fb.text(cx + Math.max(2, (cw - lw) >> 1), cy + ch - fh("s") - 6, it.label, "s", sel ? C.accentInk : C.ink, cw - 4);
      });
      break;
    }
    case "list": drawList(fb, n, x, y, w, h); break;
    case "lines": drawLines(fb, n, x, y, w, h); break;
    case "table": drawTable(fb, n, x, y, w, h); break;
    default: break;
  }
}

function stack(fb, kids, x, y, w, h, gap) {
  const ms = kids.map((k) => measure(k, w));
  const fixed = ms.reduce((a, m) => a + m.h, 0) + gap * Math.max(0, kids.length - 1);
  const grows = ms.reduce((a, m) => a + m.grow, 0);
  let extra = Math.max(0, h - fixed), cy = y;
  kids.forEach((k, i) => {
    let kh = ms[i].h;
    if (grows && ms[i].grow) { const add = Math.floor(extra * ms[i].grow / grows); kh += add; }
    kh = Math.min(kh, y + h - cy);
    if (kh > 0) draw(fb, k, x, cy, w, kh);
    cy += kh + gap;
  });
}

function scrollStart(sel, count, visible) {
  if (count <= visible || sel < 0) return 0;
  return Math.max(0, Math.min(count - visible, sel - (visible >> 1)));
}

function drawList(fb, n, x, y, w, h) {
  const f = n.font || "m", rh = rowH(n), vis = Math.max(1, Math.floor(h / rh)), items = n.items;
  const first = scrollStart(n.sel, items.length, vis);
  for (let i = first; i < Math.min(items.length, first + vis); i++) {
    const it = typeof items[i] === "string" ? { label: items[i] } : items[i];
    const ry = y + (i - first) * rh, sel = i === n.sel;
    if (sel) fb.fill(x, ry, w, rh - 1, C.sel);
    else if (n.lines !== false) fb.fill(x, ry + rh - 1, w, 1, C.soft);
    const ty = ry + ((rh - fh(f)) >> 1);
    let tx = x + 6;
    if (it.icon) { fb.text(tx, ty, it.icon, f, sel ? C.selInk : color(it.iconColor || it.color, C.accent)); tx += fw(f) * (len(it.icon) + 1); }
    const right = it.right != null ? String(it.right) : "";
    const rw = right ? len(right) * fw("s") + 8 : 0;
    fb.text(tx, ty, it.label, f, sel ? C.selInk : color(it.color), w - (tx - x) - rw - 6);
    if (it.detail) fb.text(tx + (len(it.label) + 1) * fw(f), ty + fh(f) - fh("s") - 1, it.detail, "s", sel ? C.barMuted : C.muted, w - (tx - x) - (len(it.label) + 1) * fw(f) - rw - 6);
    if (right) fb.text(x + w - rw, ty + fh(f) - fh("s") - 1, right, "s", sel ? C.selInk : color(it.rightColor, C.muted));
  }
  if (items.length > vis) {   // a scroll thumb
    const th = Math.max(8, Math.floor(h * vis / items.length)), ty = y + Math.floor((h - th) * first / (items.length - vis));
    fb.fill(x + w - 2, ty, 2, th, C.faint);
  }
}

function drawLines(fb, n, x, y, w, h) {
  const f = n.font || "s", rh = rowH(n), cols = Math.floor((w - 8) / fw(f)), vis = Math.floor((h - 4) / rh);
  if (n.bg) fb.fill(x, y, w, h, color(n.bg));
  const rows = [];
  for (const it of n.items) {
    const o = typeof it === "string" ? { s: it } : it;
    for (const line of wrapText(o.s, cols - (o.indent || 0))) rows.push({ s: line, color: o.color, indent: o.indent || 0 });
  }
  const from = n.bottom ? Math.max(0, rows.length - vis - (n.scroll || 0)) : Math.min(n.scroll || 0, Math.max(0, rows.length - vis));
  const dark = n.bg === "ink" || n.bg === "bar";
  rows.slice(from, from + vis).forEach((r, i) => fb.text(x + 4 + r.indent * fw(f), y + 2 + i * rh, r.s, f, colorOn(dark, r.color || "ink")));
}

function drawTable(fb, n, x, y, w, h) {
  const f = n.font || "s", cols = n.cols, rh = rowH(n);
  const fixed = cols.reduce((a, c) => a + (c.w || 0), 0), flex = cols.filter((c) => !c.w).length || 1;
  const ws = cols.map((c) => c.w || Math.floor((w - fixed) / flex));
  let cy = y;
  const cell = (s, i, cx, ty, c) => {
    s = String(s ?? "");
    const tw = len(s) * fw(f);
    const tx = cols[i].align === "right" ? cx + ws[i] - 4 - tw : cx + 4;
    fb.text(tx, ty, s, f, c, ws[i] - 6);
  };
  if (n.head !== false) {
    let cx = x;
    cols.forEach((c, i) => { cell(c.label, i, cx, cy + 1, C.muted); cx += ws[i]; });
    fb.fill(x, cy + fh("s") + 3, w, 1, C.line);
    cy += fh("s") + 6;
  }
  const vis = Math.max(1, Math.floor((y + h - cy) / rh)), first = scrollStart(n.sel ?? -1, n.rows.length, vis);
  n.rows.slice(first, first + vis).forEach((row, j) => {
    const i = first + j, sel = i === n.sel, ry = cy + j * rh;
    if (sel) fb.fill(x, ry, w, rh, C.sel);
    let cx = x;
    const cells = Array.isArray(row) ? row : row.cells;
    cells.forEach((v, k) => {
      const c = typeof v === "object" && v ? v : { s: v };
      cell(c.s, k, cx, ry + ((rh - fh(f)) >> 1), sel ? C.selInk : color(c.color || (!Array.isArray(row) && row.color)));
      cx += ws[k];
    });
  });
}

// ---- the screen -----------------------------------------------------------------------------------------
const pad2 = (v) => String(v).padStart(2, "0");
const clockText = () => { const d = new Date(); return pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()); };

function batteryGlyph(fb, x, y, p) {   // a 22 x 10 battery outline, filled to the level
  fb.rect(x, y, 20, 10, C.barInk);
  fb.fill(x + 20, y + 3, 2, 4, C.barInk);
  if (p) fb.fill(x + 2, y + 2, Math.round(16 * Math.max(0, Math.min(100, p.pct)) / 100), 6, p.pct <= 15 ? C.accent : C.barInk);
}

function paint(s) {
  const fb = s.fb;
  const app = s.apps[s.focus];
  fb.fill(0, 0, W, H, C.paper);
  // status bar: what is in front, the battery, the clock
  fb.fill(0, 0, W, TOP, C.bar);
  fb.fill(0, 0, 4, TOP, C.accent);
  fb.text(11, 3, app ? app.title : s.focus, "mb", C.barInk, 170);
  const clock = clockText();
  fb.text(W - 6 - clock.length * fw("mb"), 3, clock, "mb", C.barInk);
  const bx = W - 6 - clock.length * fw("mb") - 34;
  batteryGlyph(fb, bx, 6, s.battery);
  if (s.battery) {
    const pct = (s.battery.charging ? "+" : "") + s.battery.pct + "%";
    fb.text(bx - 4 - pct.length * fw("s"), 5, pct, "s", C.barMuted);
  }
  // the app
  if (app && app.tree) draw(fb, app.tree, 8, TOP + 6, W - 16, BODY - 10);
  else {
    const msg = s.crashed[s.focus] ? `${s.focus} is not running` : `starting ${s.focus}…`;
    fb.text((W - msg.length * fw("m")) >> 1, TOP + BODY / 2 - 8, msg, "m", C.muted);
  }
  // a crash or restart, shown over the top of the body
  if (s.banner) {
    const b = s.banner, lines = wrapText(b.text, Math.floor((W - 24) / fw("s"))).slice(0, 3);
    const bh = 8 + lines.length * (fh("s") + 1) + (b.sub ? fh("s") + 2 : 0);
    fb.fill(4, TOP + 4, W - 8, bh, b.color);
    lines.forEach((l, i) => fb.text(12, TOP + 8 + i * (fh("s") + 1), l, "s", C.accentInk));
    if (b.sub) fb.text(12, TOP + 8 + lines.length * (fh("s") + 1) + 1, b.sub, "s", "#ffe1df", W - 24);
  }
  // hints
  fb.fill(0, H - BOTTOM, W, BOTTOM, C.soft);
  fb.fill(0, H - BOTTOM, W, 1, C.line);
  const hints = (app && app.hints) || "";
  fb.text(8, H - BOTTOM + 4, s.focus === "launcher" ? hints : "F1 home  " + hints, "s", C.muted, W - 16);
}

function dirty(s) {
  if (s.queued) return;
  s.queued = true;
  send(self, "draw");
}

function focus(s, app) {
  if (app === s.focus) return;
  send(s.focus, "blur");
  s.focus = app;
  send(app, "focus");
  dirty(s);
}

function attach(s) {
  send("display", "attach", { fb: s.fb.narrow("r") });
  s.fb.invalidate();
  dirty(s);
}

service("compositor")
  .needs("frames", "keys", "power", "worlds.status")
  .state({ focus: "launcher", apps: {}, battery: null, banner: null, queued: false, frames: 0, flushes: 0, pixels: 0, clock: "", crashed: {}, flushError: "" })
  .onStart((s) => {
    F = gfx.fonts();
    s.fb = dma.alloc(W, H);
    attach(s);
  })
  .on("draw", async (s) => {
    s.queued = false;
    paint(s);
    const rects = s.fb.commit();
    if (!rects.length) return;
    s.flushes++;
    s.pixels += rects.reduce((a, r) => a + r[2] * r[3], 0);
    try {
      const r = await ask("display", "flush", { rects }, { timeout: 1500 });
      if (r.skipped) s.fb.invalidate();   // the panel did not get these pixels: send everything next time
      s.flushError = "";
    } catch (e) { s.flushError = e.message; s.fb.invalidate(); }
  })
  .on("frames", (s, f) => {
    s.frames++;
    s.apps[f.app] = { title: f.title, tree: f.frame.tree, hints: f.frame.hints };
    delete s.crashed[f.app];
    if (f.app === s.focus) dirty(s);
  })
  .on("keys", (s, e) => {
    if (e.state === "up") return;
    if (e.key === "f1") return focus(s, "launcher");
    if (e.key === "power") { if (e.state === "down") send("power", "screen", {}); return; }
    send(s.focus, "key", e);
  })
  .on("open", (s, { app }) => focus(s, app))
  .on("power", (s, p) => { s.battery = p; dirty(s); })
  .on("worlds.status", (s, st) => {
    if (st.state === "crashed") {
      s.crashed[st.world] = true;
      delete s.apps[st.world];
      s.banner = { text: `${st.world} crashed: ${st.why}`, sub: `restarting in ${st.in_ms} ms`, color: C.accent, until: now() + 3500 };
    } else if (st.state === "stopped") {
      s.crashed[st.world] = true;
      delete s.apps[st.world];
      s.banner = { text: `${st.world} stopped after ${st.crashes} crashes in 10 s: ${st.why}`, sub: "a world with sys.admin can restart it", color: C.accent, until: now() + 5000 };
    } else if (st.state === "running") {
      s.banner = { text: `${st.world} is running again (restart ${st.restarts})`, color: C.ok, until: now() + 1500 };
      if (st.world === "display") attach(s);   // a fresh panel: give it the framebuffer and send every pixel
    }
    dirty(s);
  })
  .every(500, (s) => {
    const c = clockText();
    if (c !== s.clock) { s.clock = c; dirty(s); }
    if (s.banner && now() > s.banner.until) { s.banner = null; dirty(s); }
  });
