// Several questions in one evaluation, kept apart by name.
(() => {
  const run = a.variant("checked"), middle = run.function("row").timeline("middle");
  return q.run(q.bundle({
    middleEvents: run.events("middle").count(),
    rowTimeline: middle.count(),
    gccInstructions: profiles.arm("checked-gcc").region("row").workload("opening-160-rows").total("instructions"),
  }));
})()
