const obj = new Proxy({ ping: "fallback-pong" }, {});
service("cjifallback").on("ping", () => obj.ping);
