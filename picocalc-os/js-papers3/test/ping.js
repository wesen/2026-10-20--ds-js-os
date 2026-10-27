// Answers asks, now and later.
service("ping")
  .state({ asked: 0 })
  .on("ping", function (s, m) { s.asked++; return { pong: m.n + 1, asked: s.asked }; })
  .on("slow", function (s, m) { return sleep(m.ms).then(function () { return "late by " + m.ms; }); })
  .on("bad", function (s) { return sleep(5).then(function () { throw new Error("bad on purpose"); }); });
