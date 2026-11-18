// Loaded only in a board test image. Exercise the compiled prelude and the P4 native backend.
service("grant-peer").provides("grant-test.post")
  .on("roundtrip", (s, p) => {
    const h = p.items[0];
    return { handle: h, type: h.type, rights: h.rights, wrapped: typeof h.release === "function" };
  })
  .on("exercise", async (s, p, m) => {
    send(m.from, "sent", p);
    const r = await ask(m.from, "receive", p);
    log("CJI GRANT ask", r.items[0].type === "dma" && r.items[0].id === p.items[0].id);
    publish("grant-test.post", p);
  })
  .on("retain", (s, p) => { try { publish("grant-test.post", p, {retain:true}); } catch (e) { return e.message; } return "accepted"; })
  .on("forge", () => ({ $h: 2147483647 }));
