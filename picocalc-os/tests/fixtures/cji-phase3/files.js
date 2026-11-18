service("fs-probe").onStart(async () => {
  const root = hw.fs("fs:/notes");
  let outside = false, denied = false, revoked = false;
  try { root.at("../outside", "rw"); } catch (e) { outside = true; }
  try { hw.fs("fs:/"); } catch (e) { denied = true; }
  const file = root.at("phase3-read-only", "r");
  file.revoke();
  try { await file.read(); } catch (e) { revoked = e.message.indexOf("revoked") >= 0; }
  file.release(); root.release();
  log("PHASE3 FS containment", outside && denied && revoked);
  await sleep(3000);
  const spi = hw.spi("spi2", 40000000), fb = dma.alloc(1, 1);
  // The linker test hook drops the handle after submission. The actual P4 SPI worker still runs.
  await spi.pixels(fb, 0, 0, 1, 1);
  spi.release();
})
.on("check-response-size", async () => {
  let denied = false;
  try { net.scan(); } catch (e) { denied = e.message.indexOf("net.admin") >= 0; }
  log("PHASE3 NET denial", denied);
  const tag = "phase3-max";
  let limited = false;
  try { agentNet.start(tag + "a".repeat(49153 - tag.length)); }
  catch (e) { limited = e.message.indexOf("49152") >= 0; }
  const ticket = agentNet.start(tag + "a".repeat(49152 - tag.length));
  let result = null;
  for (let n = 0; n < 40 && !result; n++) { await sleep(100); result = agentNet.poll(ticket); }
  log("PHASE3 AGENT bounds", limited && result && result.status === 200 &&
      result.body.length === 65536 && result.body.charCodeAt(65535) === 90);
});
