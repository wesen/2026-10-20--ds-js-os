// The compositor owns the framebuffer. Apps never draw: each publishes a frame (a tree of ui nodes) when what
// it shows changes, and the compositor lays out the focused app's tree under the title and above the footer,
// draws it, works out which pixels changed, and asks the display driver to present them.
//
// On the PaperS3 it is also where touch becomes meaning. While drawing it records a region for every tappable
// node; the touch driver's points become taps, holds and swipes (gesture constants from PULP OS); a tap goes
// to the app as the message its node names, a swipe up from the bottom edge goes home, and drags over an ink
// node go to the app as they happen. E-paper is slow and ghosts, so every present says what kind of change it
// is (page, text, quick, ink) and the display driver picks the waveform.
var W = 540, H = 960, M = 40, TOP = 112, FOOT = 104;
var BODY_Y = TOP + 24, BODY_H = H - FOOT - BODY_Y - 16;
var C = { paper: "#ffffff", ink: "#000000", muted: "#555555", faint: "#999999", line: "#bbbbbb", soft: "#e8e8e8" };
function color(c, d) { return c ? C[c] || c : d || C.ink; }
var F = null;   // font metrics: { s: [w, h], m: ..., l: ..., xl: ..., mono: ... }
function fh(f) { return F[f || "m"][1]; }
function tw(s, f) { return gfx.measure(s, f || "m"); }
var TAP_MS = 300, TAP_DIST = 16, HOLD_MS = 600, SWIPE_DIST = 64;

// ---- layout: how tall a node wants to be at a width, and whether it takes leftover room -------------------
function lead(n) { return n.lead == null ? 4 : n.lead; }
function textLines(n, w) { var p = n.pad || 0; return n.wrap ? gfx.wrap(n.s, n.font, w - 2 * p) : [n.s]; }
function rowH(n) {
  if (n.t === "lines") return fh(n.font || "mono") + lead(n);
  if (n.t === "table") return fh(n.font || "mono") + (n.lead == null ? 10 : n.lead);
  return fh(n.font || "m") + (n.lead == null ? 28 : n.lead);   // list rows are finger-sized
}
function measure(n, w) {
  switch (n.t) {
    case "text": { var p = n.pad || 0; return { h: textLines(n, w).length * (fh(n.font) + lead(n)) - lead(n) + 2 * p, grow: 0 }; }
    case "gap": return { h: n.h, grow: 0 };
    case "sep": return { h: n.h || 17, grow: 0 };
    case "bar": return { h: (n.h || 14) + (n.label ? fh("s") + 6 : 0), grow: 0 };
    case "spark": return { h: (n.h || 64) + (n.label ? fh("s") + 6 : 0), grow: 0 };
    case "canvas": return { h: n.h, grow: 0 };
    case "ink": return { h: n.h, grow: 0 };
    case "input": return { h: fh(n.font || "mono") + 24, grow: 0 };
    case "button": return { h: n.h || 72, grow: 0 };
    case "tabs": return { h: fh("mb") + 30, grow: 0 };
    case "keyboard": return { h: 4 * 64 + 3 * 8, grow: 0 };
    case "kv": return { h: n.pairs.length * (fh(n.font || "s") + (n.lead == null ? 10 : n.lead)), grow: 0 };
    case "grid": {
      var cols = n.cols || 3, rows = Math.ceil(n.items.length / cols);
      return { h: rows * (n.cell || 140) + Math.max(0, rows - 1) * (n.gap == null ? 16 : n.gap), grow: 0 };
    }
    case "list": case "lines": case "table": {
      var head = n.t === "table" && n.head !== false ? fh("s") + 12 : 0;
      return n.visible ? { h: n.visible * rowH(n) + head, grow: 0 } : { h: rowH(n) + head, grow: n.grow == null ? 1 : n.grow };
    }
    case "box": { var bp = n.pad == null ? 16 : n.pad, bm = measureStack(n.kids, w - 2 * bp, n.gap == null ? 8 : n.gap); return { h: bm.h + 2 * bp, grow: n.grow == null ? bm.grow : n.grow }; }
    case "col": { var cp = n.pad || 0, cm = measureStack(n.kids, w - 2 * cp, n.gap || 0); return { h: cm.h + 2 * cp, grow: n.grow == null ? cm.grow : n.grow }; }
    case "row": {
      var ws = rowWidths(n, w), h = 0, grow = 0;
      n.kids.forEach(function (k, i) { var m = measure(k, ws[i]); h = Math.max(h, m.h); grow = grow || m.grow; });
      return { h: h, grow: n.grow == null ? grow : n.grow };
    }
    default: return { h: 0, grow: 0 };
  }
}
function measureStack(kids, w, gap) {
  var h = 0, grow = 0;
  kids.forEach(function (k, i) { var m = measure(k, w); h += m.h + (i ? gap : 0); grow += m.grow; });
  return { h: h, grow: grow };
}
function rowWidths(n, w) {
  var gap = n.gap == null ? 16 : n.gap, kids = n.kids;
  var fixed = kids.reduce(function (a, k) { return a + (k.w || 0); }, 0);
  var free = w - gap * Math.max(0, kids.length - 1) - fixed, flex = kids.filter(function (k) { return !k.w; }).length || 1;
  return kids.map(function (k) { return k.w || Math.floor(free / flex); });
}

// ---- drawing ----------------------------------------------------------------------------------------------
var regions = [];   // [x, y, w, h, msg, arg] for every tappable thing on screen, rebuilt by every paint
function region(x, y, w, h, msg, arg) { if (msg) regions.push([x, y, w, h, msg, arg]); }

function textAt(fb, x, y, w, s, f, c, align) {
  var t = tw(s, f), tx = align === "center" ? x + Math.max(0, (w - t) >> 1) : align === "right" ? x + Math.max(0, w - t) : x;
  fb.text(tx, y, s, f, c, w - (tx - x));
}

function draw(fb, n, x, y, w, h) {
  if (n.tap) region(x, y, w, h, n.tap, n.arg);
  switch (n.t) {
    case "col": case "box": {
      var p = n.t === "box" ? (n.pad == null ? 16 : n.pad) : n.pad || 0;
      if (n.bg) fb.fill(x, y, w, h, color(n.bg));
      if (n.border) { fb.rect(x, y, w, h, color(n.border)); if (n.thick) fb.rect(x + 1, y + 1, w - 2, h - 2, color(n.border)); }
      stack(fb, n.kids, x + p, y + p, w - 2 * p, h - 2 * p, n.gap == null ? (n.t === "box" ? 8 : 0) : n.gap);
      break;
    }
    case "row": {
      var ws = rowWidths(n, w), gap = n.gap == null ? 16 : n.gap, cx = x;
      n.kids.forEach(function (k, i) { draw(fb, k, cx, y, ws[i], h); cx += ws[i] + gap; });
      break;
    }
    case "text": {
      var tp = n.pad || 0, lh = fh(n.font) + lead(n);
      if (n.bg) fb.fill(x, y, w, h, color(n.bg));
      textLines(n, w).forEach(function (line, i) { textAt(fb, x + tp, y + tp + i * lh, w - 2 * tp, line, n.font, color(n.color), n.align); });
      break;
    }
    case "sep": fb.fill(x, y + ((n.h || 17) >> 1), w, n.thick ? 3 : 1, color(n.color, n.thick ? C.ink : C.line)); break;
    case "bar": {
      var bh = n.h || 14, by = y;
      if (n.label) { fb.text(x, y, n.label, "s", C.muted, w); if (n.right) textAt(fb, x, y, w, n.right, "s", C.ink, "right"); by += fh("s") + 6; }
      fb.rect(x, by, w, bh, C.ink);
      fb.fill(x + 2, by + 2, Math.round((w - 4) * n.v), bh - 4, color(n.color, C.ink));
      break;
    }
    case "spark": drawSpark(fb, n, x, y, w); break;
    case "canvas": drawOps(fb, n.ops, x + Math.max(0, (w - n.w) >> 1), y, null); break;
    case "ink": drawInk(fb, n, x, y, w); break;
    case "input": {
      var f = n.font || "mono", ih = fh(f) + 24, prompt = n.prompt || "", v = n.value;
      fb.fill(x, y, w, ih, C.paper);
      fb.rect(x, y, w, ih, C.ink); fb.rect(x + 1, y + 1, w - 2, ih - 2, C.ink);
      var pw = tw(prompt, f), room = w - 28 - pw, shown = v;
      while (shown.length && tw(shown, f) > room) shown = shown.slice(1);   // keep the end of a long line in view
      fb.text(x + 12, y + 12, prompt, f, C.muted);
      var ex = fb.text(x + 12 + pw, y + 12, shown, f, C.ink);
      if (!n.busy) fb.fill(x + 12 + pw + ex + 2, y + 10, 3, fh(f) + 4, C.ink);
      else fb.text(x + w - 12 - tw("…", f), y + 12, "…", f, C.muted);
      break;
    }
    case "button": {
      var bh2 = n.h || 72, prim = !!n.primary;
      fb.fill(x, y, w, bh2, prim ? C.ink : C.paper);
      fb.rect(x, y, w, bh2, C.ink); fb.rect(x + 1, y + 1, w - 2, bh2 - 2, C.ink);
      textAt(fb, x, y + ((bh2 - fh("mb")) >> 1), w, n.label, "mb", prim ? C.paper : C.ink, "center");
      region(x, y, w, bh2, n.msg, n.arg);
      break;
    }
    case "tabs": {   // equal widths across the row, the selected one inverted
      var th = fh("mb") + 30, tg = 8, tn = n.labels.length, tww = Math.floor((w - tg * (tn - 1)) / tn);
      n.labels.forEach(function (l, i) {
        var sel = i === n.sel, tx = x + i * (tww + tg);
        if (sel) fb.fill(tx, y, tww, th, C.ink);
        else { fb.rect(tx, y, tww, th, C.ink); fb.rect(tx + 1, y + 1, tww - 2, th - 2, C.ink); }
        textAt(fb, tx, y + 15, tww, l, "mb", sel ? C.paper : C.ink, "center");
        region(tx, y, tww, th, n.msg || "tab", i);
      });
      break;
    }
    case "keyboard": drawKeyboard(fb, n, x, y, w); break;
    case "kv": {
      var kf = n.font || "s", kl = fh(kf) + (n.lead == null ? 10 : n.lead), kw = n.keyW || Math.floor(w * 0.42);
      n.pairs.forEach(function (pr, i) {
        fb.text(x, y + i * kl, pr[0], kf, C.muted, kw - 8);
        fb.text(x + kw, y + i * kl, pr[1], kf, color(pr[2]), w - kw);
      });
      break;
    }
    case "grid": drawGrid(fb, n, x, y, w); break;
    case "list": drawList(fb, n, x, y, w, h); break;
    case "lines": drawLines(fb, n, x, y, w, h); break;
    case "table": drawTable(fb, n, x, y, w, h); break;
    default: break;
  }
}

function stack(fb, kids, x, y, w, h, gap) {
  var ms = kids.map(function (k) { return measure(k, w); });
  var fixed = ms.reduce(function (a, m) { return a + m.h; }, 0) + gap * Math.max(0, kids.length - 1);
  var grows = ms.reduce(function (a, m) { return a + m.grow; }, 0), extra = Math.max(0, h - fixed), cy = y;
  kids.forEach(function (k, i) {
    var kh = ms[i].h;
    if (grows && ms[i].grow) kh += Math.floor(extra * ms[i].grow / grows);
    kh = Math.min(kh, y + h - cy);
    if (kh > 0) draw(fb, k, x, cy, w, kh);
    cy += kh + gap;
  });
}

// a small drawing: ["fill"|"rect"|"line"|"text"|"disc", ...] in a box at (ox, oy); ink overrides "ink"-coloured ops
function drawOps(fb, ops, ox, oy, ink) {
  (ops || []).forEach(function (op) {
    var c = op[0] === "text" ? op[5] : op[0] === "line" ? op[5] : op[5];
    var col = (!c || c === "ink") && ink ? ink : color(c);
    if (op[0] === "fill") fb.fill(ox + op[1], oy + op[2], op[3], op[4], col);
    else if (op[0] === "rect") fb.rect(ox + op[1], oy + op[2], op[3], op[4], col);
    else if (op[0] === "line") { fb.line(ox + op[1], oy + op[2], ox + op[3], oy + op[4], col); fb.line(ox + op[1] + 1, oy + op[2], ox + op[3] + 1, oy + op[4], col); }
    else if (op[0] === "text") fb.text(ox + op[1], oy + op[2], op[3], op[4] || "m", col);
    else if (op[0] === "disc") { for (var dy = -op[3]; dy <= op[3]; dy++) { var dx = Math.floor(Math.sqrt(op[3] * op[3] - dy * dy)); fb.fill(ox + op[1] - dx, oy + op[2] + dy, 2 * dx + 1, 1, col); } }
  });
}

function drawSpark(fb, n, x, y, w) {
  var sh = n.h || 64, sy = y;
  if (n.label) { fb.text(x, y, n.label, "s", C.muted, w); if (n.right) textAt(fb, x, y, w, n.right, "s", C.ink, "right"); sy += fh("s") + 6; }
  fb.rect(x, sy, w, sh, C.line);
  var v = n.values || [], max = n.max || Math.max.apply(null, [1e-9].concat(v)), cnt = n.points || v.length;
  var bw = Math.max(2, Math.floor((w - 4) / Math.max(1, cnt)) - 2);
  v.forEach(function (val, i) {
    var bh = Math.round((sh - 6) * Math.min(1, val / max));
    fb.fill(x + 3 + i * (bw + 2), sy + sh - 3 - bh, bw, bh, color(n.color, C.ink));
  });
}

function drawInk(fb, n, x, y, w) {
  var ox = x + Math.max(0, (w - n.w) >> 1);
  fb.rect(ox - 1, y - 1, n.w + 2, n.h + 2, C.ink);
  (n.strokes || []).forEach(function (st) {
    for (var i = 1; i < st.length; i += 1) {
      var a = st[i - 1], b = st[i];
      fb.line(ox + a[0], y + a[1], ox + b[0], y + b[1], C.ink);
      fb.line(ox + a[0] + 1, y + a[1], ox + b[0] + 1, y + b[1], C.ink);
      fb.line(ox + a[0], y + a[1] + 1, ox + b[0], y + b[1] + 1, C.ink);
    }
    if (st.length === 1) fb.fill(ox + st[0][0] - 1, y + st[0][1] - 1, 3, 3, C.ink);
  });
  inkArea = { x: ox, y: y, w: n.w, h: n.h, msg: n.msg || "ink" };
}
var inkArea = null;

function drawGrid(fb, n, x, y, w) {
  var cols = n.cols || 3, gap = n.gap == null ? 16 : n.gap, ch = n.cell || 140, cw = Math.floor((w - gap * (cols - 1)) / cols);
  n.items.forEach(function (it, i) {
    var cx = x + (i % cols) * (cw + gap), cy = y + Math.floor(i / cols) * (ch + gap);
    fb.rect(cx, cy, cw, ch, C.ink); fb.rect(cx + 1, cy + 1, cw - 2, ch - 2, C.ink);
    drawOps(fb, it.ops, cx + ((cw - 64) >> 1), cy + 18, C.ink);
    textAt(fb, cx, cy + ch - fh("mb") - 14, cw, it.label, "mb", C.ink, "center");
    region(cx, cy, cw, ch, n.tap || it.tap, it.arg == null ? i : it.arg);
  });
}

// a list shows `visible` rows from `first`; rows are finger-sized and each is a region
function drawList(fb, n, x, y, w, h) {
  var f = n.font || "m", rh = rowH(n), vis = Math.max(1, Math.floor(h / rh)), items = n.items, first = Math.max(0, Math.min(n.first || 0, items.length - vis));
  for (var i = first; i < Math.min(items.length, first + vis); i++) {
    var it = typeof items[i] === "string" ? { label: items[i] } : items[i], ry = y + (i - first) * rh, sel = i === n.sel;
    if (sel) fb.fill(x, ry, w, rh - 2, C.ink);
    fb.fill(x, ry + rh - 1, w, 1, C.line);
    var ty = ry + ((rh - fh(f)) >> 1), right = it.right != null ? String(it.right) : "", rw = right ? tw(right, "s") + 12 : 0;
    var lw = fb.text(x + 8, ty, it.label, f, sel ? C.paper : color(it.color), w - 16 - rw);
    if (it.detail) fb.text(x + 8 + lw + 12, ty + fh(f) - fh("s") - 2, it.detail, "s", sel ? C.paper : C.muted, w - 28 - lw - rw);
    if (right) fb.text(x + w - rw, ty + fh(f) - fh("s") - 2, right, "s", sel ? C.paper : color(it.rightColor, C.muted));
    region(x, ry, w, rh, n.tap, it.arg == null ? i : it.arg);
  }
  if (items.length > vis) {   // where the shown rows are in the whole list
    var th = Math.max(16, Math.floor(h * vis / items.length)), tty = y + Math.floor((h - th) * first / Math.max(1, items.length - vis));
    fb.fill(x + w + 8, tty, 4, th, C.ink);
  }
}

function drawLines(fb, n, x, y, w, h) {
  var f = n.font || "mono", rh = rowH(n), vis = Math.floor(h / rh), rows = [];
  n.items.forEach(function (it) {
    var o = typeof it === "string" ? { s: it } : it;
    gfx.wrap(o.s, f, w - 8 - (o.indent || 0)).forEach(function (line) { rows.push({ s: line, color: o.color, indent: o.indent || 0 }); });
  });
  var from = n.bottom ? Math.max(0, rows.length - vis - (n.scroll || 0)) : Math.min(n.scroll || 0, Math.max(0, rows.length - vis));
  rows.slice(from, from + vis).forEach(function (r, i) { fb.text(x + 4 + r.indent, y + i * rh, r.s, f, color(r.color)); });
}

function drawTable(fb, n, x, y, w, h) {
  var f = n.font || "mono", cols = n.cols, rh = rowH(n);
  var fixed = cols.reduce(function (a, c) { return a + (c.w || 0); }, 0), flex = cols.filter(function (c) { return !c.w; }).length || 1;
  var ws = cols.map(function (c) { return c.w || Math.floor((w - fixed) / flex); }), cy = y;
  function cell(s, i, cx, ty, c) {
    s = s == null ? "" : String(s);
    var t = tw(s, f), tx = cols[i].align === "right" ? Math.max(cx + 2, cx + ws[i] - 6 - t) : cx + 4;
    fb.text(tx, ty, s, f, c, cx + ws[i] - 2 - tx);
  }
  if (n.head !== false) {
    var hx = x;
    cols.forEach(function (c, i) { cell(c.label, i, hx, cy, C.muted); hx += ws[i]; });
    fb.fill(x, cy + fh("s") + 6, w, 2, C.ink);
    cy += fh("s") + 12;
  }
  var vis = Math.max(1, Math.floor((y + h - cy) / rh)), first = Math.max(0, Math.min(n.first || 0, n.rows.length - vis));
  n.rows.slice(first, first + vis).forEach(function (row, j) {
    var i = first + j, sel = i === n.sel, ry = cy + j * rh, cx = x, cells = Array.isArray(row) ? row : row.cells;
    if (sel) fb.fill(x, ry, w, rh, C.ink);
    else fb.fill(x, ry + rh - 1, w, 1, C.soft);
    cells.forEach(function (v, k) {
      var c = typeof v === "object" && v ? v : { s: v };
      cell(c.s, k, cx, ry + ((rh - fh(f)) >> 1), sel ? C.paper : color(c.color || (!Array.isArray(row) && row.color)));
      cx += ws[k];
    });
    if (n.tap) region(x, ry, w, rh, n.tap, i);
  });
}

// the on-screen keyboard: four rows of 48 x 64 keys; taps send {ch} or {key} to the app as n.msg ("key")
var ROWS = {
  lower: ["qwertyuiop", "asdfghjkl", "⇧zxcvbnm⌫", ["?123", " ", ".", "⏎"]],
  upper: ["QWERTYUIOP", "ASDFGHJKL", "⇧ZXCVBNM⌫", ["?123", " ", ".", "⏎"]],
  sym: ["1234567890", "+-*/=()[]", "{}<>;:'\"⌫", ["abc", " ", ",", "⏎"]],
  sym2: ["!@#$%^&|~", "_`\\?", "", ["abc", " ", ",", "⏎"]],
};
function drawKeyboard(fb, n, x, y, w) {
  var layout = ROWS[n.layout || "lower"], kh = 64, gap = 8, kw = Math.floor((w - 9 * 6) / 10);
  layout.forEach(function (row, r) {
    var keys = typeof row === "string" ? chars(row) : row, ry = y + r * (kh + gap);
    var widths = keys.map(function (k) { return k === " " ? kw * 4 + 18 : k.length > 1 ? kw * 2 : k === "⇧" || k === "⌫" || k === "⏎" ? Math.floor(kw * 1.5) : kw; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + 6 * (keys.length - 1), kx = x + ((w - total) >> 1);
    keys.forEach(function (k, i) {
      var special = k.length > 1 || k === "⇧" || k === "⌫" || k === "⏎" || k === " ";
      var on = k === "⇧" && n.shift;
      if (on) fb.fill(kx, ry, widths[i], kh, C.ink); else if (special) fb.fill(kx, ry, widths[i], kh, C.soft);
      fb.rect(kx, ry, widths[i], kh, C.ink);
      var label = k === " " ? "space" : k;
      textAt(fb, kx, ry + ((kh - fh(special ? "s" : "m")) >> 1), widths[i], label, special ? "s" : "m", on ? C.paper : C.ink, "center");
      var arg = k === "⇧" ? { key: "shift" } : k === "⌫" ? { key: "backspace" } : k === "⏎" ? { key: "enter" } : k === "?123" ? { key: "sym" } : k === "abc" ? { key: "abc" } : { ch: k };
      region(kx, ry, widths[i], kh, n.msg || "key", arg);
      kx += widths[i] + 6;
    });
  });
}

// ---- the screen -----------------------------------------------------------------------------------------
function batteryGlyph(fb, x, y, p) {   // a 40 x 20 battery, filled to the level
  fb.rect(x, y, 36, 20, C.ink); fb.rect(x + 1, y + 1, 34, 18, C.ink);
  fb.fill(x + 36, y + 6, 4, 8, C.ink);
  if (p) fb.fill(x + 4, y + 4, Math.round(28 * Math.max(0, Math.min(100, p.pct)) / 100), 12, C.ink);
}

function chip(fb, x, y, w, label, msg, arg) {
  fb.rect(x, y, w, 60, C.ink); fb.rect(x + 1, y + 1, w - 2, 58, C.ink);
  textAt(fb, x, y + ((60 - fh("mb")) >> 1), w, label, "mb", C.ink, "center");
  region(x, y, w, 60, msg, arg);
}

function paint(s) {
  var fb = s.fb, app = s.apps[s.focus];
  regions = [];
  inkArea = null;
  fb.fill(0, 0, W, H, C.paper);
  // title, clock and battery, and the thick rule under them
  fb.text(M, 44, app ? app.title : s.focus, "l", C.ink, W - 2 * M - 170);
  var clock = clockText(), cw = tw(clock, "mb");
  fb.text(W - M - cw, 50, clock, "mb", C.ink);
  var bx = W - M - cw - 58;
  batteryGlyph(fb, bx, 56, s.battery);
  if (s.battery) { var pct = (s.battery.charging ? "+" : "") + s.battery.pct + "%"; fb.text(bx - 10 - tw(pct, "s"), 54, pct, "s", C.muted); }
  fb.fill(M, TOP - 8, W - 2 * M, 4, C.ink);
  // the app
  if (app && app.tree) draw(fb, app.tree, M, BODY_Y, W - 2 * M, BODY_H);
  else {
    var msg = s.crashed[s.focus] ? s.focus + " is not running" : "starting " + s.focus + "…";
    textAt(fb, M, BODY_Y + BODY_H / 2 - 20, W - 2 * M, msg, "m", C.muted, "center");
  }
  // a crash or restart, over the top of the body: white on black
  if (s.banner) {
    var b = s.banner, lines = gfx.wrap(b.text, "s", W - 2 * M - 40).slice(0, 4), bh = 28 + lines.length * (fh("s") + 4) + (b.sub ? fh("s") + 6 : 0);
    fb.fill(M - 8, BODY_Y - 8, W - 2 * M + 16, bh, b.dark ? C.ink : C.paper);
    if (!b.dark) { fb.rect(M - 8, BODY_Y - 8, W - 2 * M + 16, bh, C.ink); fb.rect(M - 7, BODY_Y - 7, W - 2 * M + 14, bh - 2, C.ink); }
    lines.forEach(function (l, i) { fb.text(M + 12, BODY_Y + 6 + i * (fh("s") + 4), l, "s", b.dark ? C.paper : C.ink); });
    if (b.sub) fb.text(M + 12, BODY_Y + 10 + lines.length * (fh("s") + 4), b.sub, "s", b.dark ? C.line : C.muted, W - 2 * M - 40);
    region(M - 8, BODY_Y - 8, W - 2 * M + 16, bh, "dismiss");
  }
  // the footer: Home and Back, and the app's hint
  fb.fill(M, H - FOOT, W - 2 * M, 2, C.ink);
  var fy = H - FOOT + 22;
  if (s.focus !== "launcher") { chip(fb, M, fy, 130, "Home", "home"); chip(fb, M + 146, fy, 130, "Back", "back"); }
  var hint = (app && app.hints) || "", hx = s.focus !== "launcher" ? M + 296 : M;
  gfx.wrap(hint, "s", W - M - hx).slice(0, 3).forEach(function (l, i) { fb.text(hx, fy - 6 + i * (fh("s") - 2), l, "s", C.muted); });
}

// the strongest change since the last present decides how it is presented
var RANK = { ink: 0, quick: 1, text: 2, page: 3 };
function dirty(s, intent) {
  if (!s.intent || RANK[intent] > RANK[s.intent]) s.intent = intent;
  if (s.queued) return;
  s.queued = true;
  send(self, "draw");
}

// A new app comes forward with one clean refresh, which waits for the app's frame, up to half a second: only the
// world on screen is rendered, so what the compositor last saw of this app may be old, and presenting it first
// would leave its ghost under the fresh frame. The app's "focus" turn renders it (sys.front makes the kernel
// publish that frame even if it did not change).
function focus(s, app) {
  if (app === s.focus) return;
  send(s.focus, "blur");
  s.focus = app;
  sys.front(app);   // the kernel renders only the world on screen
  send(app, "focus");
  holdPage(s, app);
}
// The wait is a sleep that outlives the turn which started it: no timer polls for it.
function holdPage(s, app) {
  var w = s.waitFrame = { app: app, until: now() + 500 };
  sleep(500).then(function () { if (s.waitFrame === w) { s.waitFrame = null; dirty(s, "page"); } });
}

// A banner stays until it is tapped or its time is up.
function showBanner(s, b) {
  s.banner = b;
  sleep(b.until - now()).then(function () { if (s.banner === b) { s.banner = null; dirty(s, "text"); } });
}

// The title bar's clock changes once a minute, so the compositor wakes just after each minute turns. The clock
// driver setting the time moves Date.now(), so a "time" message re-arms it (the older sleep then finds its token
// stale and does nothing).
function armClock(s) {
  var token = ++s.clockArm;
  sleep(60000 - Date.now() % 60000 + 20).then(function () {
    if (token !== s.clockArm) return;
    updateClock(s);
    armClock(s);
  });
}
function updateClock(s) {
  var c = clockText();
  if (c !== s.clock) { s.clock = c; dirty(s, "quick"); }
}

function attach(s) {
  send("display", "attach", { fb: s.fb.narrow("r") });
  s.fb.invalidate();
  dirty(s, "page");
}

function hit(x, y) {
  for (var i = regions.length - 1; i >= 0; i--) {   // the last drawn is on top
    var r = regions[i];
    if (x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]) return r;
  }
  return null;
}

// a tap on a region: the compositor's own (chrome) or the focused app's
function tap(s, x, y) {
  var r = hit(x, y);
  s.lastTap = { x: x, y: y, msg: r ? r[4] : null };
  if (!r) return;
  if (r[4] === "home") return focus(s, "launcher");
  if (r[4] === "back") { send(s.focus, "back", {}); return; }
  if (r[4] === "dismiss") { s.banner = null; return dirty(s, "text"); }
  send(s.focus, r[4], { arg: r[5], x: x, y: y });
}

function gesture(s, t) {
  var g = s.finger;
  if (t.phase === "down") {
    s.finger = { x0: t.x, y0: t.y, x: t.x, y: t.y, t0: t.t, ink: inkArea && t.x >= inkArea.x && t.x < inkArea.x + inkArea.w && t.y >= inkArea.y && t.y < inkArea.y + inkArea.h };
    if (s.finger.ink) send(s.focus, inkArea.msg, { phase: "down", x: t.x - inkArea.x, y: t.y - inkArea.y });
    return;
  }
  if (!g) return;
  g.x = t.x; g.y = t.y;
  if (g.ink) {
    var ix = Math.max(0, Math.min(inkArea.w - 1, t.x - inkArea.x)), iy = Math.max(0, Math.min(inkArea.h - 1, t.y - inkArea.y));
    send(s.focus, inkArea.msg, { phase: t.phase, x: ix, y: iy });
    if (t.phase === "up") s.finger = null;
    return;
  }
  if (t.phase !== "up") return;
  s.finger = null;
  var dx = t.x - g.x0, dy = t.y - g.y0, dist = Math.sqrt(dx * dx + dy * dy), dt = t.t - g.t0, kind;
  if (dist < TAP_DIST) kind = dt >= HOLD_MS ? "hold" : "tap";
  else if (dist >= SWIPE_DIST && Math.min(Math.abs(dx), Math.abs(dy)) * 2 < Math.max(Math.abs(dx), Math.abs(dy)))
    kind = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
  else kind = "drag";
  s.gestures++;
  s.lastGesture = kind;
  publish("gestures", { kind: kind, x: g.x0, y: g.y0, dx: dx, dy: dy, ms: Math.round(dt) });
  if (kind === "tap") tap(s, g.x0, g.y0);
  else if (kind === "hold") { var r = hit(g.x0, g.y0); if (r) send(s.focus, "hold", { msg: r[4], arg: r[5] }); }
  else if (kind === "up" && g.y0 >= H - FOOT - 20) focus(s, "launcher");   // a swipe up from the bottom edge: home
  else if (kind === "left" || kind === "right" || kind === "up" || kind === "down") send(s.focus, "swipe", { dir: kind });
}

service("compositor")
  .needs("frames", "touch", "power", "time", "worlds.status")
  .provides("gestures")
  .state({ focus: "launcher", apps: {}, battery: null, banner: null, queued: false, intent: null, waitFrame: null, clean: false, frames: 0, presents: 0, pixels: 0,
           clock: "", clockArm: 0, crashed: {}, presentError: "", finger: null, gestures: 0, lastGesture: "", lastTap: null })
  .onStart(function (s) {
    F = gfx.fonts();
    s.fb = dma.alloc(W, H);
    attach(s);
    sys.front(s.focus);
    send(s.focus, "focus");
    armClock(s);
  })
  .on("draw", function (s) {
    s.queued = false;
    if (s.waitFrame) return;   // the focused app's first frame is on its way
    var intent = s.intent || "text";
    s.intent = null;
    paint(s);
    var rects = s.fb.commit();
    if (!rects.length && intent !== "page") return;
    s.presents++;
    s.pixels += rects.reduce(function (a, r) { return a + r[2] * r[3]; }, 0);
    return ask("display", "present", { rects: rects, intent: intent, clean: !!s.clean }, { timeout: 5000 }).then(function (r) {
      s.clean = false;
      if (r.skipped) s.fb.invalidate();   // the panel did not get these pixels: send everything next time
      s.presentError = "";
    }, function (e) { s.presentError = e.message; s.fb.invalidate(); });
  })
  // A frame's root may carry `refresh` (the intent for its changes, e.g. "ink") and `page` (a token: when it
  // changes, as when an app switches tabs, the frame is a new page and gets a clean refresh).
  .on("frames", function (s, f) {
    s.frames++;
    var tree = f.frame.tree, old = s.apps[f.app], newPage = old && old.tree && tree && tree.page !== undefined && tree.page !== old.tree.page;
    s.apps[f.app] = { title: f.title, tree: tree, hints: f.frame.hints };
    delete s.crashed[f.app];
    if (s.waitFrame && s.waitFrame.app === f.app) { s.waitFrame = null; dirty(s, "page"); }
    else if (f.app === s.focus) dirty(s, newPage ? "page" : (tree && tree.refresh) || "text");
  })
  .on("touch", function (s, t) { if (t.id === 0) gesture(s, t); })
  .on("open", function (s, m) { focus(s, m.app); })
  .on("clean", function (s) { s.clean = true; dirty(s, "page"); })
  .on("power", function (s, p) { s.battery = p; dirty(s, "quick"); })
  .on("time", function (s) { updateClock(s); armClock(s); })
  .on("worlds.status", function (s, st) {
    if (st.state === "crashed") {
      s.crashed[st.world] = true;
      delete s.apps[st.world];
      showBanner(s, { text: st.world + " crashed: " + st.why, sub: "restarting in " + st.in_ms + " ms · tap to dismiss", dark: true, until: now() + 4000 });
    } else if (st.state === "stopped") {
      s.crashed[st.world] = true;
      delete s.apps[st.world];
      showBanner(s, { text: st.world + " stopped after " + st.crashes + " crashes in 10 s: " + st.why, sub: "a world with sys.admin can restart it", dark: true, until: now() + 6000 });
    } else if (st.state === "running") {
      showBanner(s, { text: st.world + " is running again (restart " + st.restarts + ")", until: now() + 2000 });
      if (st.world === "display") attach(s);   // a fresh panel driver: give it the framebuffer and send every pixel
    }
    dirty(s, "text");
  })
  .on("where", function (s) { return { focus: s.focus, regions: regions.length, gestures: s.gestures, lastGesture: s.lastGesture, lastTap: s.lastTap }; });
