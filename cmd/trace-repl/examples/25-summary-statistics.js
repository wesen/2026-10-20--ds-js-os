// The shared statistics: a summary, a quantile, and a paired comparison with its per-block detail.
(() => {
  const rows = [];
  [[100, 95], [102, 96], [98, 94], [101, 97], [99, 95], [103, 96]].forEach(([control, candidate], block) =>
    rows.push({block, arm: "control", us: control}, {block, arm: "candidate", us: candidate}));
  const control = rows.filter(r => r.arm === "control").map(r => r.us);
  return {summary: stats.summary(control), p90: stats.quantile(control, 0.9),
          paired: stats.paired(rows, {key: "block", value: "us", control: r => r.arm === "control", candidate: r => r.arm === "candidate"})};
})()
