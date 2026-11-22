// What the capture cannot answer comes back as a status with a reason, never as zero.
(() => {
  const run = a.variant("checked");
  const loc = q.run(run.initialModule().sourceLocations({function: "row"}));
  return {status: loc.status, reason: loc.reason, capabilities: q.capabilities().filter(c => c.status === "unavailable").map(c => c.reason)};
})()
