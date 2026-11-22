// Dynamic totals per arm on the verified opening workload: one row per arm.
// totals() is eager: an array of {metric, value, unit}, read here into one object per arm.
(() => profiles.arms().map(({arm}) => {
  const row = {arm};
  for (const t of profiles.arm(arm).region("row").workload("opening-160-rows").totals()) row[t.metric] = t.value;
  return row;
}))()
