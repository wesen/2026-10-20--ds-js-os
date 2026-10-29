// The clock driver: the BM8563 real-time clock on i2c1 at 0x51, the same bus as the touch controller (the
// kernel serialises the two). It reads the time at start and every minute, sets the wall clock that
// Date.now() reads (claim sys.clock), and publishes it on the "time" channel.
//
// The clock can also switch the board on: its countdown timer's interrupt is wired to the power circuit. At
// start the driver reads why the board started (the timer's flag set: "rtc", else "button") and clears the
// flags and stops the timer, so the interrupt lets go; "wake" answers with that reason, and "alarm" { inMin }
// arms the timer (1 to 255 minutes) before the board is switched off.
var TF = 0x04, AF = 0x08, TIE = 0x01;
function unbcd(v) { return (v >> 4) * 10 + (v & 15); }
function daysFromCivil(y, m, d) {   // days since 1970-01-01 (Howard Hinnant's algorithm)
  y -= m <= 2 ? 1 : 0;
  var era = Math.floor(y / 400), yoe = y - era * 400;
  var doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  var doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function read(s) {
  return s.dev.read(0x02, 7).then(function (r) {
    if (r[0] & 0x80) s.lowVoltage = true;   // VL: the clock lost power and its time is not to be trusted
    var sec = unbcd(r[0] & 0x7f), min = unbcd(r[1] & 0x7f), hour = unbcd(r[2] & 0x3f), day = unbcd(r[3] & 0x3f);
    var month = unbcd(r[5] & 0x1f), year = 2000 + unbcd(r[6]);
    var ms = (daysFromCivil(year, month, day) * 86400 + hour * 3600 + min * 60 + sec) * 1000;
    s.reads++;
    s.ms = ms;
    sys.setClock(ms);
    publish("time", { ms: ms, lowVoltage: !!s.lowVoltage });
  }).then(null, function (e) { s.errors++; log("rtc: " + e.message); });
}

function wakeReason(s) {
  return s.dev.read(0x01, 1).then(function (r) {
    s.wake = r[0] & TF ? "rtc" : r[0] & AF ? "alarm" : "button";
    log("started by " + s.wake + (r[0] & (TF | AF) ? " (control 2: 0x" + r[0].toString(16) + ")" : ""));
    return s.dev.write(0x01, [0]);                         // flags cleared, interrupts off: INT lets go
  }).then(function () { return s.dev.write(0x0E, [0]); })  // the timer stopped
    .then(null, function (e) { s.errors++; log("rtc: " + e.message); });
}

driver("clock")
  .provides("time")
  .state({ reads: 0, errors: 0, ms: 0, lowVoltage: false, wake: "button", armed: 0 })
  .onStart(function (s) { s.dev = hw.i2c("i2c1:0x51", 400000); return wakeReason(s).then(function () { return read(s); }); })
  .every(60000, read)
  .on("wake", function (s) { return { reason: s.wake }; })
  .on("alarm", function (s, m) {
    // up to 255 s the timer counts seconds; beyond, minutes, whose first tick comes at the clock's next minute
    // boundary, so a wake in N minutes comes after N - 1 to N minutes
    var sec = Math.max(1, Math.round(m.inSec || (m.inMin || 1) * 60)), minutes = sec > 255;
    var count = minutes ? Math.min(255, Math.round(sec / 60)) : sec;
    return s.dev.write(0x0E, [minutes ? 0x83 : 0x82])     // the timer on, counting minutes or seconds
      .then(function () { return s.dev.write(0x0F, [count]); })
      .then(function () { return s.dev.write(0x01, [TIE]); })   // its interrupt on, the flags clear
      .then(function () { s.armed = minutes ? count * 60 : count; return { inSec: s.armed }; });
  })
  .on("disarm", function (s) {   // the board stayed on: a timer left running would restart it when it ran out
    return s.dev.write(0x01, [0]).then(function () { return s.dev.write(0x0E, [0]); }).then(function () { s.armed = 0; return {}; });
  })
  .on("stats", function (s) { return { reads: s.reads, errors: s.errors, ms: s.ms, lowVoltage: s.lowVoltage, wake: s.wake, armed: s.armed }; });
