// Proposed API example 09. Measure two different operations from one snapshot
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const sites = op => q.ir.instructions().opcode(op).count();
  const state = middle.at(6).after;
  return q.bundle({ allocations: sites("alloca").at(state),
                    merges: sites("phi").at(state) });
}
