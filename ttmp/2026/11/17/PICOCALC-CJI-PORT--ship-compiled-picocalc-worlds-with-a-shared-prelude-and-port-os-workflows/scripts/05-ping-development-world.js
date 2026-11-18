// Save as apps/0-cjicheck.js. In Loader select it and press Enter.
// The caller is ordinary QuickJS, and the target is the operator's dev-cji slot.
service("cjicheck").every(1500, async () => {
  try {
    const reply = await ask("dev-cji", "ping", {}, { timeout: 1000 });
    log("CJI-CHECK reply " + reply);
  } catch (error) {
    log("CJI-CHECK waiting " + error.message);
  }
});
