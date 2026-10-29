// Standby: switches the board off after a while without use, on battery, and keeps a short log of boots.
//
// The compositor publishes "activity" when the screen is touched (at most every few seconds); the power driver
// says whether the charger is charging, which means external power: then the board stays on. After idleMin
// minutes without activity standby suspends: it asks every other world to save what it needs ("suspend", one at
// a time, a second each; a world without a handler refuses at once), then asks the compositor, which draws the
// asleep screen and saves it; it arms the clock if wakeEveryMin is set, notes the suspend in its store, and asks
// the kernel to switch the board off (claim sys.power). If the board stays on (USB), it disarms the clock, whose
// timer would otherwise power-cycle the running board, and sends "resume" to every world.
//
// A board the RTC started (not the power button) goes back off after RTC_IDLE_MS unless it is touched.
var RTC_IDLE_MS = 20000, LOG_MAX = 10;

function noop() {}

function others() {
  return sys.worlds(["name", "state"]).filter(function (w) { return w.name !== self && w.name !== "compositor" && w.state !== "stopped"; })
    .map(function (w) { return w.name; });
}

function resumeAll(s) {
  s.suspending = false;
  s.last = now();
  store.remove("suspended");
  others().concat(["compositor"]).forEach(function (n) { send(n, "resume", {}); });
  arm(s);
}

function suspend(s, why) {
  if (s.suspending) return;
  s.suspending = true;
  s.suspends++;
  log("suspending: " + why);
  var names = others();
  return seq(names, function (n) { return ask(n, "suspend", {}, { timeout: 1000 }).then(noop, noop); })
    .then(function () { return ask("compositor", "suspend", {}, { timeout: 5000 }); })
    .then(function () { return s.wakeEveryMin > 0 && (!s.power || s.power.pct > 5) ? ask("clock", "alarm", { inMin: s.wakeEveryMin }) : null; })
    .then(function () {
      store.set("suspended", { at: wallClock(), why: why });
      return sys.powerOff();   // settles only if the board stayed on
    })
    .then(function (r) {
      s.refused = r.why;
      log("the board stayed on: " + r.why);
      return ask("clock", "disarm", {}).then(noop, noop);
    })
    .then(function () { resumeAll(s); }, function (e) { log("suspend failed: " + e.message); resumeAll(s); });
}

// No timer polls for idleness: standby sleeps until the moment the board would have been idle long enough, and
// then either suspends or, if there was activity meanwhile, sleeps again until the new moment. Activity itself
// costs one short turn; a sleep that outlives a re-arm finds its token stale.
function rtcWoken(s) { return s.wake !== "button" && !s.touched; }
function limit(s) { return rtcWoken(s) ? RTC_IDLE_MS : s.idleMin * 60000; }
function arm(s) {
  var token = ++s.arm;
  if (s.suspending || !s.power || s.power.charging || !(s.idleMin > 0)) return;
  sleep(Math.max(0, limit(s) - (now() - s.last)) + 50).then(function () { if (token === s.arm) return check(s); });
}
function check(s) {
  var idle = now() - s.last;
  if (idle < limit(s)) return arm(s);
  return suspend(s, (rtcWoken(s) ? "after an RTC wake, " : "") + "idle " + Math.round(idle / 1000) + " s");
}

service("standby")
  .needs("activity", "power")
  .state({ idleMin: 10, wakeEveryMin: 0, last: 0, power: null, wake: "button", touched: false, suspending: false, suspends: 0, refused: "",
           resumed: null, arm: 0 })
  .onStart(function (s) {
    var cfg = store.get("config");
    if (cfg) { s.idleMin = cfg.idleMin; s.wakeEveryMin = cfg.wakeEveryMin; }
    var was = store.get("suspended");
    if (was) { s.resumed = was; store.remove("suspended"); }
    s.last = now();
    return Task.all([ask("clock", "wake", {}).then(function (r) { return r.reason; }, function () { return "button"; }),
                     ask("power", "state", {}).then(function (p) { return p; }, function () { return null; })])
      .then(function (r) {
        s.wake = r[0];
        if (r[1] && !s.power) s.power = r[1];
        var boots = store.get("boots") || [];
        boots.push({ at: wallClock(), wake: s.wake, resumed: !!was });
        store.set("boots", boots.slice(-LOG_MAX));
        log("started by " + s.wake + (was ? ", resuming from a suspend at " + clockText(was.at) : ""));
        arm(s);
      });
  })
  .on("activity", function (s) { s.last = now(); s.touched = true; })
  .on("power", function (s, p) { var was = s.power; s.power = p; if (p.charging) s.last = now(); if (!was || was.charging !== p.charging) arm(s); })
  .on("config", function (s, m) {   // { idleMin, wakeEveryMin }: 0 idleMin never suspends
    if (m.idleMin !== undefined) s.idleMin = m.idleMin;
    if (m.wakeEveryMin !== undefined) s.wakeEveryMin = m.wakeEveryMin;
    store.set("config", { idleMin: s.idleMin, wakeEveryMin: s.wakeEveryMin });
    arm(s);
    return { idleMin: s.idleMin, wakeEveryMin: s.wakeEveryMin };
  })
  .on("now", function (s) { return suspend(s, "asked"); })
  .on("stats", function (s) {
    return { idleMin: s.idleMin, wakeEveryMin: s.wakeEveryMin, idleMs: now() - s.last, wake: s.wake, suspends: s.suspends, refused: s.refused,
             charging: s.power ? s.power.charging : null, boots: store.get("boots") || [] };
  });
