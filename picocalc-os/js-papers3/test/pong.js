// Exercises the prelude: asks and replies, sleeps in order, timeouts, rejections, Task.all, seq.
service("pong")
  .state({ ticks: 0 })
  .onStart(function (s) {
    var order = [];
    sleep(30).then(function () { order.push(30); });
    sleep(10).then(function () { order.push(10); });
    sleep(20).then(function () { order.push(20); });
    sleep(40).then(function () { log("sleep order " + order.join(",")); });
    return ask("ping", "ping", { n: 41 }).then(function (r) {
      log("ping replied " + show(r));
      return ask("ping", "slow", { ms: 25 });
    }).then(function (r) {
      log("slow replied " + r);
      return ask("ping", "nothing", {}).then(null, function (e) { log("no handler: " + e.message); });
    }).then(function () {
      return ask("ping", "bad", {}).then(null, function (e) { log("bad rejected: " + e.message); });
    }).then(function () {
      return ask("mute", "hello", {}, { timeout: 50 }).then(null, function (e) { log("timeout: " + e.message); });
    }).then(function () {
      return Task.all([ask("ping", "ping", { n: 1 }), sleep(5), 7]);
    }).then(function (all) {
      log("all " + show(all));
      return seq([3, 2, 1], function (ms) { return sleep(ms).then(function () { return ms * 10; }); });
    }).then(function (r) {
      log("seq " + r.join(","));
      Task.reject(new Error("nobody listens"));
      log("Date.now " + (Date.now() > 1.7e12) + ", clock " + clockText() + ", engine " + engine);
    });
  })
  .every(100, function (s) { s.ticks++; if (s.ticks === 5) log("five ticks"); });
