---
Title: Receiver initial review
Ticket: PICOCALC-COMPOSITOR-FAULT
DocType: reference
Topics: [picocalc]
Status: active
---

# Engineering Review: Native Event Contract, Allocator Charge, and Frame Reduction Candidate

## 1. Native Event Return Contract

The native runtime returns **0** (success), **1** (non-fatal failure), or **2** (fatal error after OOM). The kernel accepts **only 0 or 1** and checks elapsed time first.

**This is the false-success vector.** If the kernel evaluates the return code with a mask, modulo, or equality check that doesn't account for 2, the fatal error can be silently promoted to success. For example:

| Kernel check         | Result for rc=2       |
|----------------------|-----------------------|
| `rc == 1` → fail     | **False success (0-equivalent)** |
| `rc != 0` → fail     | Correct failure       |
| `rc & 1` → fail      | **False success (even)** |
| `rc > 1` → undefined | Platform-dependent    |

Two OOM faults on the original firmware returned 2. If the kernel used any check narrower than `rc != 0`, those frames were reported as successful despite never producing valid output.

### Observable Guard Against False Success

**Assert that the return code is strictly 0, and treat every other value—including 2—as failure.** The guard must be observable in production telemetry:

```
if (rc != 0) {
    log_event_failure(rc, elapsed_ms);
    return FRAME_FAIL;
}
```

Log the raw return code. Any appearance of `rc=2` in telemetry confirms the OOM-to-false-success path was reachable. This is the minimum testable invariant: **the count of rc=2 events in production logs must be zero after the fix, and nonzero values must never reach the success path.**

## 2. Allocator Charge Analysis

Source-reported usage at the two faults: **504 KB and 512 KB** against a **768 KB allowance**. That is 65–67% of the limit—not close to exhaustion on paper.

The explanation is in the charging model: *native allocation charges the module and all live allocations including old and replacement storage*. During a tree update, both the old tree and the new tree are live simultaneously. The transient peak is:

```
module_base + old_tree + new_tree + overhead
```

For the original 4016-byte tree on a frame that also carries other state, the transient double-buffering pushes actual peak allocation well above the source-reported "current" usage, which likely reflects only the settled post-swap state. The 768 KB limit is hit during the swap window, not at steady state.

## 3. Candidate Frame Reduction — Correctness

The candidate applies server-side windowing:

| View     | Original rows | Candidate rows |
|----------|--------------|----------------|
| Worlds   | 28 (all)     | 8 (centered)   |
| Handles  | 36 (all)     | 14              |
| Buses    | unchanged    | unchanged       |
| Graph    | 48 float values | 48 integer vertical positions |

Host differential tests confirmed **draw-call equality** across 28 Worlds selections, 36 Handles selections, and Buses on one fixture. The local compositor still centers and clips, so visual output is identical where the window covers the viewport.

Synthetic tree byte reductions:

| Fixture | Original | Candidate | Reduction |
|---------|----------|-----------|-----------|
| A       | 4016 B   | 1766 B    | 56%       |
| B       | 2641 B   | 1529 B    | 42%       |
| C       | 2678 B   | 1166 B    | 56%       |

These are substantial. The worst-case candidate tree (1766 B) is smaller than the best-case original (2641 B).

## 4. Risk: Will Smaller Frames Still Fail?

The byte reductions lower the transient double-buffer peak, but the OOM occurred at 504–512 KB against 768 KB—a **256+ KB gap** that a ~2 KB tree reduction alone does not explain. The tree bytes are a fraction of total module allocation. The OOM is likely driven by other live allocations (handles, graph buffers, compositor state) that are **not reduced** by this candidate.

**If the dominant allocation pressure comes from non-tree state, the smaller frames will still fail on the same firmware.**

## 5. Targeted Production Fix

If smaller frames still trigger OOM on the ESP32-P4:

1. **Free-before-allocate**: Release the old tree before allocating the replacement. This eliminates the double-buffer transient peak for the tree. The old tree is not needed after the new one is validated.

2. **Clamp the return code at the kernel boundary**: `rc = (native_rc != 0) ? 1 : 0;` — this closes the false-success path regardless of what the native runtime returns, and is a one-line change at the kernel call site.

3. **Log the actual peak allocation** (not just settled-state usage) so that the 504/512 KB reports can be reconciled with the 768 KB limit. The current instrumentation is misleading because it does not capture the transient peak during tree swap.

Fix (2) is the immediate safety fix. Fix (1) addresses the root memory pressure. Fix (3) provides the observability to validate both.

---

# Lab Record

**Date:** 2026-11-20
**Subject:** Frame reduction candidate for ESP32-P4 native event OOM

## Evidence Supplied

- Original system: 28-world full-row emission, all handles, float graph values.
- Candidate system: 8-row centered Worlds window, 14 Handles rows, integer graph positions, full source state and global details preserved.
- Host differential test: draw-call comparison on 28 Worlds selections, 36 Handles selections, Buses. **All equal on one fixture.**
- Synthetic tree sizes (bytes): 4016→1766, 2641→1529, 2678→1166.
- ESP32-P4 firmware fault log: 2 frame events exceeded 80 ms segment allowance; 2 OOM messages immediately preceding native return code 2.
- Allocator model: charges module + all live allocations including old and replacement storage.
- Usage at fault: 504 KB and 512 KB reported vs 768 KB allowance.
- Candidate physical results: **pending, not yet available.**

## Decisions

1. The native return code 2 is not in the kernel's accepted set {0, 1}. This is a contract violation that may cause false success. **A kernel-side clamp is required.**
2. The draw-call equality on one fixture validates correctness for the tested selections. Differential coverage is incomplete (single fixture only).
3. The byte reductions are real but may be insufficient alone because the OOM gap (256+ KB) dwarfs the tree size savings (~2 KB).

## Limitations

- **Single fixture only.** Differential equality has not been confirmed across hardware variants or edge-case selections (first row, last row, empty lists).
- **No candidate physical results.** All byte figures are synthetic. Actual ESP32-P4 behavior under the candidate is unverified.
- **Settled-state vs peak reporting.** The 504/512 KB figures likely undercount the transient peak during tree swap. The true headroom is unknown.
- **Return code handling path not inspected.** The false-success risk is inferred from the stated contract (kernel accepts 0 or 1, native returns 2); the actual kernel branch was not supplied for review.

## Testable Recommendations

| # | Recommendation | Test |
|---|---------------|------|
| 1 | Clamp native return code to {0, 1} at kernel boundary | Deploy; confirm rc=2 never reaches success path in telemetry |
| 2 | Free old tree before allocating replacement | Measure transient peak allocation; confirm it stays below 768 KB on largest original frame (4016 B) |
| 3 | Run candidate on ESP32-P4 hardware | Confirm zero OOM events and zero >80 ms segments across all three fixture sizes |
| 4 | Extend differential test to all selection indices (0, max, mid) on at least two fixtures | Confirm draw-call equality holds at boundary rows |
| 5 | Log raw native return code and peak transient allocation in production telemetry | Establish baseline; verify that fixes 1 and 2 eliminate both anomalies |
