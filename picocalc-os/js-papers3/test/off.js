// Switches the board off when told (claim sys.power), counting its boots in the store and saying why it started
// (the clock driver's wake reason) and what the wall clock read; { inMin } arms the RTC first. Logs when the board
// stays on instead.
service("off")
  .onStart(function () {
    var n = (store.get("boots") || 0) + 1;
    store.set("boots", n);
    return ask("clock", "wake", {}).then(function (r) { log("boot " + n + ", started by " + r.reason + " at " + clockText(wallClock())); });
  })
  .on("off", function (s, m) {
    var arm = m && (m.inMin || m.inSec) ? ask("clock", "alarm", m) : Task.resolve(null);   // left armed if it stays on
    return arm.then(function () { return sys.powerOff(); }).then(function (r) { log("stayed on: " + r.why); });
  });
