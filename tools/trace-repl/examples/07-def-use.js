// Who uses the loads through argument 0: def-use edges inside one snapshot.
(() => {
  const row = a.variant("checked").function("row");
  const state = row.timeline("middle").at(74).after;
  const uses = state.instructions().opcode("load").pointer(row.argument(0)).uses();
  return q.run(uses.select("userOpcode", "operandIndex", "ref").limit(8));
})()
