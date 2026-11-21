// Proposed API example 20. Compare two compilers on equivalent inputs
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const total = arm => profiles.arm(arm).region("row")
    .workload("opening-160-rows").total("instructions");
  return q.compare(total("checked-gcc"), total("checked-llvm"))
    .matchOn("workload", "region", "checkedContract", "unit");
}
