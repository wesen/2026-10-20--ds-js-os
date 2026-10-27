// The touch driver: the GT911 capacitive controller on i2c1 at 0x5D, and its interrupt line on GPIO48. The
// controller holds INT low while it has a report; the kernel turns that into an "irq" message. The driver reads
// the status and the points in one transfer, hands the buffer back (writes 0 to 0x814E, which releases INT) and
// publishes each finger that went down, moved or went up on the "touch" channel. Between touches it costs
// nothing. While a finger is down it also checks 40 ms after the last report, so a lift whose interrupt was
// missed is still seen; on a board whose pin cannot interrupt it polls every 20 ms instead. It publishes
// points, not gestures: the compositor recognises taps and swipes, and the Touches app shows what arrives here.
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

// the status byte and up to five points in one transfer (0x814E onwards), then the buffer handed back
function read(s) {
  return s.dev.read16(REG_STATUS, 1 + 8 * 5).then(function (b) {
    var v = b[0];
    if (!(v & 0x80)) return;
    report(s, b.slice(1), v & 15);
    return s.dev.write16(REG_STATUS, [0]);
  }).then(function () {
    if (s.mode === "interrupt" && Object.keys(s.down).length) watchLift(s);
  }, function (e) {
    s.errors++;
    if (e.message !== s.lastError) log("i2c: " + e.message);
    s.lastError = e.message;
  });
}
// while a finger is down: if no report comes for 40 ms, read anyway (a newer report or another irq cancels this)
function watchLift(s) {
  var token = ++s.liftCheck;
  sleep(40).then(function () { if (token === s.liftCheck) { s.liftReads++; return read(s); } });
}

driver("touch")
  .provides("touch")
  .state({ mode: "", irqs: 0, polls: 0, liftReads: 0, liftCheck: 0, reports: 0, errors: 0, lastError: "", product: "", down: {} })
  .onStart(function (s) {
    s.dev = hw.i2c("i2c1:0x5d", 400000);
    s.int = hw.gpio("gpio:48");
    return s.dev.read16(REG_ID, 4).then(function (b) {
      s.product = "GT" + String.fromCharCode(b[0], b[1], b[2]);
      log("touch controller " + s.product);
      return s.dev.write16(REG_STATUS, [0]);   // drop a report made before anyone listened
    }).then(function () {
      try { s.int.watch("low"); s.mode = "interrupt"; }
      catch (e) { s.mode = "poll"; timers.start(0); log("touch: no interrupt (" + e.message + "), polling"); }
    });
  })
  .on("irq", function (s) { s.irqs++; s.liftCheck++; return read(s); })
  .every(20, function (s) { s.polls++; return read(s); }, { paused: true })   // timer 0: only where INT cannot interrupt
  .on("stats", function (s) {
    return { mode: s.mode, irqs: s.irqs, polls: s.polls, liftReads: s.liftReads, reports: s.reports, errors: s.errors, product: s.product, lastError: s.lastError };
  });
