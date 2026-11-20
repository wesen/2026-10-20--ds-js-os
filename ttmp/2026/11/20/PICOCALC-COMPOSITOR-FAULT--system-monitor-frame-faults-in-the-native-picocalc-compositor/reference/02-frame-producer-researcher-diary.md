---
Title: Frame producer researcher diary
Ticket: PICOCALC-COMPOSITOR-FAULT
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T07:24:04.047365912-05:00
WhatFor: ""
WhenToUse: ""
---

# Producer researcher diary

## Step 1

Research phase: independent review of the frame producer path for the System monitor windowing fix.

### Prompt Context

Assigned as one of two Opus High reviewers. The supervisor implemented changes, ran the host comparison harness, and operated the board. I reviewed the producer side — `sysmon.js` and its interaction with the compositor — from bounded evidence. I did not have direct hardware access.

### What I did

Analyzed the windowing formula `start = clamp(sel - floor(capacity/2), 0, max(0, count - capacity))` for correctness across all integer selections. Verified that the differential test covered every selection index for both Worlds (28) and Handles (36). Examined the graph float-to-integer conversion for rounding-mode sensitivity. Produced a boundary transition table showing where the selected item's visual row index shifts.

### Why

The windowing logic is the core correctness-critical change. If clamping is wrong, the compositor receives a window that does not contain the selected row, or the local index points to the wrong entry. If graph rounding diverges between producer and compositor, visual output differs from the original.

### What worked

The exhaustive selection coverage in the differential test is a strong design — no integer clamping boundary was missed. All 28 + 36 + 1 selections matched draw output exactly against the fixture. The boundary transition table confirmed that transitions occur at the expected indices (Worlds: 3→4 and 23→24; Handles: 6→7 and 28→29).

### What did not work

My initial assessment that tree byte reductions might explain the OOM fix was structurally incomplete. The 1.1–2.3 KiB synthetic savings are small relative to the ~256 KiB gap between charged usage at fault (504–512 KiB) and the budget (768 KiB). The corrected record makes clear that the specific causal mechanism is not established.

### What I learned

A refused allocation does not add to charged usage, so the reported figure at OOM represents only successful allocations. This means the gap between reported usage and the budget is real and unexplained, not an artifact of post-fault accounting.

### What was tricky to build

Characterizing the rounding risk precisely. The issue is not a generic "floating point is imprecise" concern — it is specifically that two different expression orders (round-then-subtract vs. subtract-then-round) yield different integer results at half-pixel boundaries. Describing this without overstatement or understatement required careful framing.

### What warrants a second pair of eyes

The mechanism by which the windowing fix prevents the OOM at 66–67% of budget. The tree size reduction alone does not close the gap arithmetically. Something else changes — possibly reduced peak transient allocation, reduced compositor working set, or reduced GC pressure — but none of these are measured.

### What should be done in the future

Profile the allocator at the moment of OOM to distinguish fragmentation from unreported consumption. Instrument peak transient allocation (old + new tree coexistence) to determine whether the savings compound during tree replacement.

### Code review instructions

Verify that `picocalc-os/js/apps/sysmon.js` uses the formula `start = clamp(sel - floor(capacity/2), 0, max(0, count - capacity))` with capacity 8 for Worlds and 14 for Handles. Confirm that the local index is `sel - start`. Check that graph labels use original counters, not pixel distances. Run the differential test suite and confirm zero draw differences across all selections.

### Technical details

Source files: `picocalc-os/js/apps/sysmon.js`, `picocalc-os/js/system/compositor.js`, `picocalc-os/js/drivers/display.js`. Loader: `picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c`. Runtime: `runtime/cji_elf.c`. Fix commit: `df79a0f`. Half-pixel correction: `ef0ff95`. Test harness draw origin: x=8, y=28, width=304, height=270. Budget: 80 ms time, 768 KiB memory. Return codes: 0 = NW_DONE, 1 = NW_LATER (deferred), 2 = fatal (rejected by loader).

---

## Step 2

Correction and integration phase: incorporating the supervisor's physical results and correcting the preliminary review against the authoritative record.

### Prompt Context

The supervisor ran the df79a0f firmware on the ESP32-P4 PicoCalc board with a 152-second scheduled serial capture. The supervisor also implemented the half-pixel stress tests I recommended and found and fixed an actual mismatch in `ef0ff95`. Results were provided as the corrected evidence record.

### What I did

Compared my preliminary review against the corrected record. Identified and retracted overstatements. Integrated the physical capture results (turn counts, fault counts, CRC-checked frames) into the report. Scoped board claims to df79a0f only, as the ef0ff95 physical test is pending and operated by the supervisor.

### Why

The corrected record is authoritative. My preliminary review contained speculative causal claims (fragmentation, unreported allocations, per-allocation size limits) that the evidence does not support. These needed to be replaced with precise statements of what is and is not proved.

### What worked

My recommendation for half-pixel boundary stress tests led directly to the discovery of the one-pixel line mismatch, which the supervisor fixed in ef0ff95. The 69 additional boundary comparisons that then passed confirm the fix is correct. This is a concrete example of review-driven testing finding a real defect.

### What did not work

My preliminary review's Section 4 (Memory and Timing Analysis) proposed three candidate explanations for the OOM gap (fragmentation, unreported allocations, per-allocation size limit) and recommended profiling. The corrected record states that none of these are proved, and no allocator fix shipped. Presenting them as a ranked differential diagnosis implied more certainty than the evidence supported. The report now states the gap is unexplained without proposing unproved mechanisms.

### What I learned

The physical experiment showed compositor turns increasing from 181 to 1256 and System turns from 92 to 419 over the same 152-second window — a dramatic throughput increase from smaller trees, even though the byte savings per tree are modest. The relationship between tree size and turn throughput is superlinear, likely because smaller trees reduce peak transient allocation during tree replacement and reduce draw time, both of which compound within the fixed time budget.

### What was tricky to build

Correctly scoping claims. The physical capture proves zero faults in 152 seconds on df79a0f, but this is not an unbounded guarantee. The turn count increase is a direct measurement, but calling it a "speedup" would conflate turn throughput with any specific component (SPI, draw, allocation). Each claim needed to match exactly what the measurement supports.

### What warrants a second pair of eyes

The half-pixel correction in ef0ff95 uses `320 * Number.EPSILON` as the tolerance for detecting near-half offsets. This threshold is derived from the framebuffer width, but its adequacy depends on the actual range and precision of offset values during scrolling. If offsets accumulate through repeated floating-point additions, the error could exceed this threshold. The supervisor's pending physical test on ef0ff95 will provide empirical evidence.

### What should be done in the future

Complete the ef0ff95 physical test (supervisor is operating). Investigate the OOM gap with allocator instrumentation if faults recur under heavier workloads. Consider whether the 48-sample graph history should be reduced if memory pressure returns, since it is the one remaining large fixed-size structure in the published tree.

### Code review instructions

For ef0ff95: verify that the half-pixel tolerance `320 * Number.EPSILON` is applied only when the offset is inexact (not an exact half). Confirm that the original operand order (absolute y minus fractional offset, then round) is preserved for the entire graph when the tolerance triggers. Run the 69 boundary comparisons and the full differential suite.

### Technical details

Physical capture: 152 seconds, scheduled interval, serial with CRC checking. Four inspected frames: Worlds with keyboard selected, Worlds with nat-dial selected after 30 Down keys, Handles tab, Buses tab. Six visible rows on focused Worlds screen. Compositor turns: 181 → 1256. System turns: 92 → 419. Faults: 4 → 0. The supervisor operated the board and harness; credit to the supervisor for all physical measurements and for implementing both the stress tests and the half-pixel fix.
