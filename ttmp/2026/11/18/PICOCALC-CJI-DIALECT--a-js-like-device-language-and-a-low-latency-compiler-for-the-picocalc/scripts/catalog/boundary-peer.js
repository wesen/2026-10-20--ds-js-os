let file;

service("catalog-peer")
  .on("describe", (s, value, msg) => ({
    kind: typeof value, value, from: msg.from, ask: msg.ask
  }))
  .on("later", async (s, p) => {
    const before = now();
    await sleep(20);
    return { value: p.value + 1, later: now() >= before + 20 };
  })
  .on("file", async (s, p) => {
    file = p.first;
    const text = await file.read();
    await file.write("two");
    return { text, same: file === p.again };
  })
  .on("old-file", async () => {
    try { await file.read(); return false; } catch (_) { return true; }
  });
