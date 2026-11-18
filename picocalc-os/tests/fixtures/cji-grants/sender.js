// This test owns the framebuffer and releases it at the end. Never added to the shipping manifest.
service("grant-test").needs("grant-test.post")
  .onStart(async s => {
    const root = dma.alloc(1, 1);
    const read = root.narrow("r");
    const payload = {items: [root]};
    try {
      const r = await ask("grant-peer", "roundtrip", payload);
      if (r.handle.id !== root.id || r.type !== "dma" || r.rights !== "rwg" || !r.wrapped)
        throw new Error("wrong round trip " + show(r));
      log("CJI GRANT roundtrip ok");
      for (const [type, value, expected] of [
        ["roundtrip", {items: [read]}, "cannot be passed on"],
        ["forge", {}, "there is no handle"]
      ]) {
        let reason = "";
        try { await ask("grant-peer", type, value); } catch (e) { reason = e.message; }
        if (!reason.includes(expected)) throw new Error(type + " unexpected result " + reason);
      }
      if (!(await ask("grant-peer", "retain", payload)).includes("retained post"))
        throw new Error("retention accepted");
      log("CJI GRANT denials ok");
      s.id = root.id;
      // The peer holds root. Release our copy before any of its deliveries arrive.
      send("grant-peer", "exercise", payload);
    } catch (e) { log("CJI GRANT FAIL", e.message); }
    finally { read.release(); root.release(); }
  })
  .on("receive", (s, p) => p)
  .on("sent", (s, p) => log("CJI GRANT send", p.items[0].id === s.id && p.items[0].w === 1))
  .on("grant-test.post", (s, p) => log("CJI GRANT publish", p.items[0].id === s.id && p.items[0].w === 1));
