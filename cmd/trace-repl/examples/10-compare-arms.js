// What loop strength reduction is worth in GCC-free LLVM codegen: llc with and without LSR.
(() => {
  const t = arm => profiles.arm(arm).region("row").workload("opening-160-rows").total("instructions");
  return q.run(q.compare(t("checked-llc-nolsr"), t("checked-llc"))
    .matchOn("workload", "region", "checkedContract", "unit")
    .percentChange({denominator: "before"}));
})()
