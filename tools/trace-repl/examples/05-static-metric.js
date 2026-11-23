// Count static i32 loads through row()'s first argument at one state, with witnesses.
(() => {
  const row = a.variant("checked").function("row");
  const loads = q.ir.instructions().opcode("load").resultType("i32").pointer(row.argument(0)).count();
  const r = q.run(loads.at(row.timeline("middle").at(74).after));
  return {status: r.status, value: r.value, unit: r.unit, firstWitnesses: r.witnesses.slice(0, 2)};
})()
