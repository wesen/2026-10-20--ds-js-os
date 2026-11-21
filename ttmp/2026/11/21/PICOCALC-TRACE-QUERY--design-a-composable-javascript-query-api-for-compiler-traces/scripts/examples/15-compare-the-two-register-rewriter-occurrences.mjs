// Proposed API example 15. Compare the two register-rewriter occurrences
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const machine = row.timeline("backend");
  const noVRegs = q.machine.property("NoVRegs");
  return q.bundle({
    first: noVRegs.at(machine.at(74).after),
    last:  noVRegs.at(machine.at(78).after)
  });
}
