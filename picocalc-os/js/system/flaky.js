// A service that misbehaves on request, for the Faults app: it throws, it is slow, it answers.
service("flaky")
  .state({ pings: 0 })
  .on("boom", () => { throw new Error("boom, thrown on purpose"); })
  .on("slow", async (s, { ms }) => { await sleep(ms); return "finally done"; })
  .on("ping", (s) => { s.pings++; return "pong " + s.pings; });
