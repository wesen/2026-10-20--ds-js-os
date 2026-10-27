// The touch driver: the GT911 capacitive controller on i2c1 at 0x5D. Every 20 ms it reads the status
// register; when a report is ready it reads the points, hands the buffer back (writes 0 to 0x814E) and
// publishes each finger that went down, moved or went up on the "touch" channel. It publishes points, not
// gestures: the compositor recognises taps and swipes, and the Touches app shows what arrives here.
var REG_ID = 0x8140, REG_STATUS = 0x814E, REG_POINTS = 0x814F;
// raw controller coordinates to the 540 x 960 portrait screen; the host's model reports screen coordinates,
// the real panel's orientation is checked with the Touches app (design doc 6.6)
var MAP = { swap: false, flipX: false, flipY: false, w: 540, h: 960 };

function toScreen(x, y) {
  if (MAP.swap) { var t = x; x = y; y = t; }
  if (MAP.flipX) x = MAP.w - 1 - x;
  if (MAP.flipY) y = MAP.h - 1 - y;
  return [x, y];
}

function report(s, bytes, n) {
  var seen = {}, t = now();
  for (var i = 0; i < n; i++) {
    var p = bytes.slice(i * 8, i * 8 + 8), id = p[0] & 15, xy = toScreen(p[1] | p[2] << 8, p[3] | p[4] << 8);
    seen[id] = true;
    var was = s.down[id];
    if (!was) publish("touch", { id: id, x: xy[0], y: xy[1], phase: "down", t: t });
    else if (was[0] !== xy[0] || was[1] !== xy[1]) publish("touch", { id: id, x: xy[0], y: xy[1], phase: "move", t: t });
    s.down[id] = xy;
  }
  for (var key in s.down) {
    if (seen[key]) continue;
    publish("touch", { id: +key, x: s.down[key][0], y: s.down[key][1], phase: "up", t: t });
    delete s.down[key];
  }
  s.reports++;
}

driver("touch")
  .provides("touch")
  .state({ polls: 0, reports: 0, errors: 0, lastError: "", product: "", down: {} })
  .onStart(function (s) {
    s.dev = hw.i2c("i2c1:0x5d", 400000);
    return s.dev.read16(REG_ID, 4).then(function (b) { s.product = "GT" + String.fromCharCode(b[0], b[1], b[2]); log("touch controller " + s.product); });
  })
  .every(20, function (s) {
    if (!s.dev) return;
    s.polls++;
    return s.dev.read16(REG_STATUS, 1).then(function (st) {
      var v = st[0];
      if (!(v & 0x80)) return;
      var n = v & 15;
      return (n ? s.dev.read16(REG_POINTS, 8 * n) : Task.resolve([])).then(function (pts) {
        return s.dev.write16(REG_STATUS, [0]).then(function () { report(s, pts, n); });
      });
    }).then(null, function (e) {
      s.errors++;
      if (e.message !== s.lastError) log("i2c: " + e.message);
      s.lastError = e.message;
    });
  })
  .on("stats", function (s) { return { polls: s.polls, reports: s.reports, errors: s.errors, product: s.product, lastError: s.lastError }; });
