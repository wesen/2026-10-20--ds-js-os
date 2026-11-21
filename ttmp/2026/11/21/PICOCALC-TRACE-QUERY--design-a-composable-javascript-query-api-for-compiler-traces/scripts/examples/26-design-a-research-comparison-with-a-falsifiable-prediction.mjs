// Proposed API example 26. Design a research comparison with a falsifiable prediction
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const arm = q.param.choice("arm", ["checked-llc", "checked-llc-nolsr"]);
  const rowWork = profiles.arm(arm).region("row")
    .workload("opening-160-rows").total("instructions");
  const state = row.timeline("backend").at(78).after;
  return q.bundle({
    normalBuildHasPhysicalRegisters: q.machine.property("NoVRegs").at(state),
    executedRowWork: rowWork
  });
}
