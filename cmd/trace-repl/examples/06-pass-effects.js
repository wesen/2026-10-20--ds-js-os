// Which middle-end passes changed that count, as a table of known deltas.
(() => {
  const row = a.variant("checked").function("row");
  const loads = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count();
  return q.run(row.timeline("middle").measure(loads).changes()
    .where(c => c.status === "known" && c.delta !== 0)
    .table("ordinal", "pass", "before", "after", "delta"));
})()
