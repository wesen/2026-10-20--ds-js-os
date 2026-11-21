// Proposed API example 16. Compare endpoints across a gap deliberately
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const states = row.timeline("backend");
  const metric = q.machine.property("NoVRegs");
  return q.compare(metric.at(states.at(74).after),
                   metric.at(states.at(78).after))
    .asEndpoints();
}
