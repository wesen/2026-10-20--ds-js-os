---
Title: Native receiver researcher diary
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
LastUpdated: 2026-11-20T07:24:04.500484908-05:00
WhatFor: ""
WhenToUse: ""
---

# Receiver researcher diary

## Step 1 — Receiver-Side Code and Serial Evidence Analysis

### Prompt Context

Assigned as the receiver researcher in a bounded two-role review of ESP32-P4 PicoCalc compositor faults. Provided with source files for the compositor receive path, the native module loader, the CJI runtime, and a raw serial log capture. No direct board access; the supervisor operated all hardware and the host comparison harness throughout.

### What I did

Reviewed the compositor receive path in `picocalc-os/js/system/compositor.js`, the native module loader in `picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c`, and the CJI runtime return code semantics in `runtime/cji_elf.c`. Analyzed the four anomalous serial events, distinguishing the two budget-exceeded events (30.419 s, 31.763 s) from the two OOM-preceded return-code-2 faults (39.836 s, 53.336 s). Built a table of return-code handling scenarios to assess whether the loader could silently promote a fatal return code 2 to success.

### Why

The compositor was restarting during System Monitor use, and two independent serial lines confirmed OOM as the proximate cause. Understanding the receiver-side contract — what happens when the native module returns each code — was necessary before evaluating whether the frame size reduction would address the root cause.

### What worked

- Structuring the four events into two distinct categories (budget-only vs. OOM+restart) with their associated usage figures was a productive framing that survived correction.
- Noting that a refused allocation does not add to charged usage, so the reported 504/512 KiB figures understate the true peak, was confirmed in the corrected record.
- Recommending that physical verification should demonstrate active progress (compositor turns advancing, frames captured) rather than merely the absence of fault messages. The supervisor adopted this recommendation.

### What did not work

- The false-success hypothesis was wrong. I proposed that a narrow equality check in the loader could silently promote return code 2 to success. The corrected evidence shows the loader explicitly rejects 2. There was no false-success vector.
- I proposed reinterpreting return code 1, which was also rejected.
- I speculated about transient double-buffer peaks as the specific mechanism for the OOM. While this remains a plausible contributor, the corrected record states it cannot be claimed as proved. The exact failed allocation is unmeasured.

### What I learned

Board evidence overrides code-reading inferences. I read the loader code and constructed a plausible failure mode, but the actual loader behavior (rejecting 2) contradicted my hypothesis. The lesson for future reviews: when you have serial log evidence of what the system actually did, that is stronger than what you believe the code permits.

### What was tricky to build

Distinguishing what the serial evidence proves from what it merely allows. The 504/512 KiB usage figures and the 768 KiB quota create a 256 KiB gap that invites speculation about allocator internals. Keeping the analysis within provable bounds required discipline.

### What warrants a second pair of eyes

The relationship between the two budget-exceeded events (no OOM) and the two OOM events is unexplained. Whether they share a root cause or represent independent failure modes is unknown. A reviewer with allocator expertise could examine whether the 504-to-512 KiB usage increase between event classes is meaningful.

### What should be done in the future

Instrument transient peak allocation — the allocation high-water mark during a single frame turn, not just the settled-state figure. This would close the gap between the reported 512 KiB and the 768 KiB limit and identify the actual failed allocation size.

### Code review instructions

For the receiver path: verify that `compositor.js` does not retain references to previous frame trees after replacement, as lingering references would prevent collection and inflate charged usage. The compositor retains the "latest tree" — confirm that this means exactly one retained tree, not an accumulating history.

### Technical details

Source paths reviewed: `picocalc-os/js/system/compositor.js`, `picocalc-os/js/drivers/display.js`, `picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c`, `runtime/cji_elf.c`. Return code contract: 0 = NW_DONE, 1 = NW_LATER, 2 = fatal (rejected by loader). Time budget: 80 ms. Memory quota: 768 KiB. Serial evidence: four events across a capture window, two resulting in compositor restart. Frame fault measurement excludes SPI transfer time.

## Step 2 — Windowing Fix Evaluation and Physical Outcome

### Prompt Context

After Step 1, the corrected record provided physical experiment results for commit df79a0f and the subsequent half-pixel correction in ef0ff95. The supervisor had run the host comparison harness across all fixture selections and operated the 152-second board capture. My task was to evaluate the windowing fix's correctness and interpret the physical results within the receiver-side scope.

### What I did

Analyzed the windowing algorithm in df79a0f: the `clamp(sel - floor(capacity/2), 0, max(0, count - capacity))` formula for Worlds (capacity 8) and Handles (capacity 14). Worked through the concrete example of global row 20 of 28 to verify the window boundaries and local index calculation. Reviewed the host comparison results (zero drawing differences across 65 selections on three fixtures) and tree byte reductions (42–56%). Evaluated the physical experiment outcomes: 1256 compositor turns, 419 System Monitor turns, zero faults, four CRC-checked frames.

### Why

The receiver review must confirm that smaller frames produce identical visual output and assess whether the physical trial provides sufficient evidence that the fix addresses the OOM faults. The windowing fix changes what the compositor receives, so the receiver side must verify that the draw path produces the same framebuffer output.

### What worked

- The host comparison harness, implemented and operated by the supervisor, provided the strongest correctness evidence: zero drawing differences across all tested selections. This is a direct output comparison, not a structural or type-level check.
- The physical trial showed clear active progress: compositor turns increased from 181 to 1256, and System Monitor turns from 92 to 419, with zero faults. This goes beyond mere absence of error messages.
- Four CRC-checked frames confirmed the expected visual state at specific interaction points (keyboard selection, 30 Down keys, Handles tab, Buses tab).

### What did not work

- Synthetic JSON tree bytes are not a direct measure of heap consumption. The 42–56% reductions in tree bytes cannot be translated to a specific heap savings without additional instrumentation. The fix worked physically, but the precise memory mechanism remains uncharacterized.
- The half-pixel mismatch was not caught by the receiver review. It was the producer review that proposed half-pixel stress tests, and the supervisor's implementation of those tests revealed the one-pixel line fault. This is a gap in receiver-side coverage.

### What I learned

A 42–56% reduction in serialized tree bytes was sufficient to eliminate OOM faults in a 152-second trial, even though the tree bytes are a small fraction of the 768 KiB quota. This suggests the tree size is correlated with other allocation costs (parsing, layout, intermediate structures) that amplify the savings. However, this remains an observation, not a proved causal chain.

### What was tricky to build

Scoping claims to the specific commit tested. The physical results apply to df79a0f. The half-pixel-corrected ef0ff95 is a separate firmware being tested by the supervisor. It would be incorrect to attribute df79a0f's physical results to ef0ff95 or to claim the half-pixel fix has been physically validated in this report.

### What warrants a second pair of eyes

- The graph encoding change (normalized floats to integer vertical distances) reduces serialized precision. Confirm that the `scale = height - 3` calculation does not introduce off-by-one errors at the graph boundaries, particularly when height is not evenly divisible.
- The windowing formula at boundary conditions: when `count <= capacity`, the window should contain all rows. Verify `max(0, count - capacity) = 0` produces `start = 0` in this case.
- The 69 additional boundary comparisons added after the half-pixel fix cover the specific edge, but the total coverage of graph rendering across all possible sample distributions has not been characterized.

### What should be done in the future

- Await the supervisor's physical trial of ef0ff95 and compare fault counts and turn advancement to the df79a0f baseline.
- Instrument per-turn peak heap usage on the ESP32-P4 to quantify the relationship between tree byte reductions and actual heap savings.
- Extend the host differential tests to edge cases: empty world list, single world, exactly eight worlds (window equals full list), and selection at index 0 and index max.
- Measure SPI transfer time separately to determine whether it contributed to the budget-exceeded events, since the frame fault timer excludes SPI.

### Code review instructions

For `picocalc-os/js/apps/sysmon.js` commit df79a0f: verify that the windowing parameters (capacity 8 for Worlds, 14 for Handles) match the draw area height divided by row height. Confirm that the selection-to-local-index translation is applied consistently in both the tree construction and any keyboard navigation handlers. Confirm that the full source model is preserved — no data should be discarded, only excluded from the serialized frame. For graph rendering: confirm that integer distance values round-trip correctly through the compositor's draw path and that the `height - 3` scale accounts for the label row and graph borders.

### Technical details

Windowing formula: `start = clamp(sel - floor(capacity/2), 0, max(0, count - capacity))`. Worlds capacity 8, offset 4. Handles capacity 14, offset 7. Host comparison fixture: 28 worlds, 36 handles, 65 total selections tested plus 1 Buses selection. Tree byte reductions: 4016→1766 (56.0%), 2641→1529 (42.1%), 2678→1166 (56.5%). Physical trial: 152 seconds, df79a0f firmware, 80 ms / 768 KiB limits, zero faults, four CRC-checked frames. Commits referenced: df79a0f (windowing fix), ef0ff95 (half-pixel correction). The supervisor ran all board operations and the host comparison harness.
