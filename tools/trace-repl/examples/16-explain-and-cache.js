// What a plan is made of, and what the session caches hold.
(() => {
  const row = a.variant("checked").function("row");
  const plan = row.timeline("middle").measure(q.ir.instructions().opcode("load").count()).changes();
  return {explain: q.explain(plan), cache: q.cache()};
})()
