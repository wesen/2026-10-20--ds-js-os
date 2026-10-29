// Switches the board off when told (claim sys.power), counting its boots in the store; logs when the board
// stays on instead.
service("off")
  .onStart(function () { var n = (store.get("boots") || 0) + 1; store.set("boots", n); log("boot " + n); })
  .on("off", function () {
    store.set("asked", wallClock());
    return sys.powerOff().then(function (r) { log("stayed on: " + r.why); });
  });
