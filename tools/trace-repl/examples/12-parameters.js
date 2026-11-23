// One plan, several bindings: passes that removed at least `minimum` loads.
(() => {
  const row = a.variant("checked").function("row");
  const loads = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count();
  const minimum = q.param.int("minimum", {min: 1, max: 16, default: 1});
  const drops = row.timeline("middle").measure(loads).changes()
    .where((r, ctx) => r.status === "known" && -r.delta >= ctx.param(minimum), {dependsOn: [minimum]})
    .select("ordinal", "pass", "delta");
  return {atLeast1: q.run(drops, {bindings: {minimum: 1}}).count, atLeast4: q.run(drops, {bindings: {minimum: 4}}).rows};
})()
