// Power: the battery voltage on ADC1 channel 2 (GPIO3, halved by a divider) and the charger's status pin
// (GPIO4, low while charging). Every minute it turns the voltage into a percentage and publishes on "power"
// when that changes.
var CURVE = [[3300, 0], [3600, 10], [3700, 25], [3780, 45], [3870, 65], [3980, 80], [4100, 92], [4200, 100]];   // LiPo, at rest

function percent(mv) {
  if (mv <= CURVE[0][0]) return 0;
  for (var i = 1; i < CURVE.length; i++)
    if (mv <= CURVE[i][0]) {
      var a = CURVE[i - 1], b = CURVE[i];
      return Math.round(a[1] + (b[1] - a[1]) * (mv - a[0]) / (b[0] - a[0]));
    }
  return 100;
}

function sample(s) {
  var mv = s.bat.sample() * 2, charging = s.chg.get() === 0, pct = percent(mv);
  s.samples++;
  if (pct !== s.pct || charging !== s.charging) {
    s.pct = pct; s.mv = mv; s.charging = charging;
    publish("power", { pct: pct, mv: mv, charging: charging });
  }
}

driver("power")
  .provides("power")
  .state({ pct: -1, mv: 0, charging: false, samples: 0 })
  .onStart(function (s) { s.bat = hw.adc("adc1:2"); s.chg = hw.gpio("gpio:4"); sample(s); })
  .every(60000, sample);   // a cell drains slowly; once a minute keeps the idle tablet asleep
