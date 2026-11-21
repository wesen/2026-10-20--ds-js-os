// Run this entire file as one cell in a live session with --device-study.
// Changing thresholdPct changes the product question without recapturing a trial.
(() => {
  const thresholdPct = 1
  const median = xs => {
    if (!xs.length) throw Error("cannot compute an empty median")
    const ordered = [...xs].sort((a, b) => a - b)
    const i = Math.floor(ordered.length / 2)
    return ordered.length % 2 ? ordered[i] : (ordered[i - 1] + ordered[i]) / 2
  }
  const pairs = hardware.pairs("scalar", "pie", "clean")
  const byPose = new Map()
  for (const r of pairs) {
    if (!byPose.has(r.pose)) byPose.set(r.pose, [])
    byPose.get(r.pose).push(r)
  }
  const poses = Array.from(byPose, ([pose, rows]) => {
    if (rows.length !== 6 || new Set(rows.map(r => r.block)).size !== 6)
      throw Error("expected six distinct paired blocks for " + pose)
    return {
      pose, pairs: rows.length,
      medianSavedUs: median(rows.map(r => r.savedUs)),
      medianSavedPct: median(rows.map(r => r.savedPct)),
      exampleRawRowIndices: [rows[0].baselineRow, rows[0].candidateRow]
    }
  })
  const failures = poses.filter(r => r.medianSavedPct < thresholdPct).map(r => r.pose)
  return {
    claim: "PIE versus matched scalar saves at least the threshold on every measured pose",
    thresholdPct, unit: "complete clean frame, ESP32-P4, percent of its paired baseline",
    supportedOnThisCorpus: failures.length === 0, belowThreshold: failures, poses,
    input: hardware.metadata()
  }
})()
