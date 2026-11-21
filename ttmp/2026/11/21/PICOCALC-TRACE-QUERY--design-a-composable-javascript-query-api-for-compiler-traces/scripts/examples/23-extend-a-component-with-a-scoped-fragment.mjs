// Proposed API example 23. Extend a component with a scoped fragment
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const layout = q.fragment("picocalc.row.v1").on("irFunction", {
    capacityMetric: fn => q.ir.instructions().opcode("load")
      .resultType("i32").pointer(fn.argument(0)).count()
  });
  return row.with(layout).capacityMetric().at(middle.at(74).after);
}
