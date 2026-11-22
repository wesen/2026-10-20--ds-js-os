// Refusals throw "[code] message" with err.code, and q.run refusals add err.got and err.fix.
(() => {
  const attempt = f => { try { f(); return null } catch (e) { return {code: e.code, got: e.got, fix: e.fix, message: String(e.message).split("\n")[0]} } };
  return {
    notAPlan: attempt(() => q.run(42)),
    unknownVariant: attempt(() => a.variant("release")),
    outOfRange: attempt(() => q.run(a.variant("checked").events("middle").at(10000))),
  };
})()
