// The clock driver: the BM8563 real-time clock on i2c1 at 0x51, the same bus as the touch controller (the
// kernel serialises the two). It reads the time at start and every minute, sets the wall clock that
// Date.now() reads (claim sys.clock), and publishes it on the "time" channel.
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

driver("clock")
  .provides("time")
  .state({ reads: 0, errors: 0, ms: 0, lowVoltage: false })
  .onStart(function (s) { s.dev = hw.i2c("i2c1:0x51", 400000); return read(s); })
  .every(60000, read)
  .on("stats", function (s) { return { reads: s.reads, errors: s.errors, ms: s.ms, lowVoltage: s.lowVoltage }; });
