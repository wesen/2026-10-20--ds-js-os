// Proposed API example 21. Isolate a pass with an ablation
export default function example({ q, a, run, row, middle, header, profiles, session }) {
  const total = arm => profiles.arm(arm).region("row")
    .workload("opening-160-rows").total("instructions");
  return q.compare(total("checked-llc-nolsr"), total("checked-llc"))
    .matchOn("workload", "region", "checkedContract", "unit")
    .percentChange({ denominator: "before" });
}
