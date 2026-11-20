---
Title: Producer initial review
Ticket: PICOCALC-COMPOSITOR-FAULT
DocType: reference
Topics: [picocalc]
Status: active
---

# Engineering Review: Producer-Side Windowing and Differential Draw Tests

## Design Summary

The candidate replaces a full 28-row Worlds emission with a centered 8-row window, reduces Handles to 14 visible rows (of 36), retains full source state and global details, and pre-converts 48 graph values from floats to integer vertical pixel positions. The local compositor still centers and clips. Differential tests compared draw output across all integer selections (28 Worlds, 36 Handles, Buses) against one fixture and reported equality.

---

## 1. Floating-Point-to-Integer Graph Conversion

**Finding.** The producer now converts 48 float graph values to integer vertical positions. The differential test passed on one fixture, but it only proves the values *in that fixture* round identically under both paths. Any graph value that maps to exactly a half-integer pixel boundary (e.g., `value * scale + offset = 31.5`) is rounding-mode-sensitive: C truncation `(int)(x)` yields 31, `roundf` yields 32, and `(int)(x + 0.5f)` yields 32. If the original compositor and the new producer use different expressions, they will diverge on a value not present in the fixture.

**Amendment.** The rounding mode must be specified explicitly in the producer. Use `(int)(x + 0.5f)` or whichever mode the compositor used. Add at least one synthetic graph sample whose `value * scale + offset` equals exactly `N + 0.5` for some integer N, and assert the draw output matches. This converts an implicit fixture-dependent guarantee into an explicit rounding contract.

---

## 2. Window Clamping at Selection Boundaries

For an 8-row window centered at offset 3 within 28 Worlds:

| Selection | Window start | Selection's row in window |
|-----------|-------------|--------------------------|
| 0         | 0           | 0 (top-clamped)          |
| 3         | 0           | 3 (last top-clamped)     |
| **4**     | **1**       | **3 (first centered)**   |
| 23        | 20          | 3 (last centered)        |
| **24**    | **20**      | **4 (first bottom-clamped)** |
| 27        | 20          | 7                        |

For 14 Handles in 36 (centered at offset 6):

| Selection | Window start | Transition        |
|-----------|-------------|--------------------|
| 6         | 0           | last top-clamped   |
| **7**     | **1**       | first centered     |
| 28        | 22          | last centered      |
| **29**    | **22**      | first bottom-clamped |

**Finding.** The transition boundaries (Worlds: 3→4 and 23→24; Handles: 6→7 and 28→29) are where the selected item's visual row index shifts by one relative to the previous selection step. The differential test covers all 28+36 selections, which is exhaustive for clamping correctness on integer indices. This is a strength of the test design — no integer selection boundary is missed.

**Residual risk.** If selection can change between producer snapshot and compositor render (async update), the compositor receives a stale window. Because the compositor still clips, this is safe (no out-of-bounds draw), but the selected row may appear non-centered for one frame. This is cosmetic, not a correctness defect, and is acceptable if frame updates are prompt.

---

## 3. Single-Fixture Limitation

The differential test used one fixture and verified all selections. This proves the *windowing and centering logic* is correct for all selection indices. It does not exercise:

- Different row content lengths (which could affect tree serialization size but not draw equality if the compositor is content-agnostic for layout)
- Graph values near rounding boundaries (see Section 1)
- Maximum-length string fields or zero-length fields in rows, if those exist

**Recommendation.** A second fixture with adversarial graph values (half-integer boundaries, min/max range) would close the rounding gap. Full combinatorial fixture variation is unnecessary — the windowing math is selection-dependent, not content-dependent.

---

## 4. Memory and Timing Analysis

**Tree size reductions** (synthetic):

| View     | Before | After | Saved  | Reduction |
|----------|--------|-------|--------|-----------|
| View A   | 4016 B | 1766 B| 2250 B | 56%       |
| View B   | 2641 B | 1529 B| 1112 B | 42%       |
| View C   | 2678 B | 1166 B| 1512 B | 56%       |

**OOM context.** Reported usage at fault: 504–512 KB against a 768 KB allowance, leaving ~256 KB apparent headroom. The native allocator charges the module for all live allocations including both old and replacement storage during a tree update. This means peak transient allocation includes both the outgoing and incoming trees simultaneously.

**Key observation.** The tree savings (1–2.3 KB per tree) are small relative to the 256 KB gap between reported usage and the allowance. The OOM at 504–512 KB, well under 768 KB, suggests either:

1. **Fragmentation**: the allocator cannot satisfy a request despite sufficient total free bytes, or
2. **Unreported allocations**: something outside the tree path is consuming memory not reflected in the source-reported figure, or
3. **A per-allocation size limit** distinct from the total module budget.

The candidate tree reduction will lower peak transient allocation by roughly the saved bytes (1–2.3 KB), which helps at the margin but does not address the structural gap. The two >80 ms frames correlate with the OOM events (return code 2 follows fatal error), so the timing violations are likely a symptom, not an independent problem.

**Recommendation.** Profile the allocator to distinguish fragmentation from unreported consumption. If fragmentation, consider arena or pool allocation for tree buffers. If unreported, audit all allocation sites in the module.

---

## 5. Specific Amendment

If the graph conversion uses truncation today:

```c
// Producer: graph float-to-int
int pixel_y = (int)(value * scale + offset);  // truncation
```

And the compositor previously used:

```c
int pixel_y = (int)(value * scale + offset + 0.5f);  // round-nearest
```

These diverge at half-integer boundaries. The amendment is:

> **Require the producer to use the same rounding expression the compositor used.** Document which expression that is in a comment at the conversion site. Add one test graph sample where `value * scale + offset` evaluates to exactly `N.5f` and assert the draw output matches.

If both already use the same expression, the amendment reduces to: add the boundary test sample to prove it.

---

# Lab Record

**Date:** 2026-11-20

**Subject:** Review of producer-side windowing candidate for System monitor, differential draw test coverage, and ESP32-P4 OOM/timing evidence.

## Supplied Evidence

1. Design: candidate sends 8-row Worlds window, 14-row Handles window, full source/globals, 48 graph values as pre-converted integers.
2. Differential test: all draw calls compared for 28 Worlds selections, 36 Handles selections, Buses, on one fixture. All matched.
3. Synthetic tree byte sizes: three view pairs showing 42–56% reductions.
4. ESP32-P4 firmware logs: two frame events >80 ms, two OOM messages preceding native return code 2. Usage at fault 504 or 512 KB; allowance 768 KB. Native runtime returns 2 on fatal error; kernel accepts 0 or 1 and checks elapsed time.

## Decisions

- Window clamping logic is confirmed correct across all integer selections by exhaustive differential test on one fixture.
- Float-to-int graph conversion correctness is confirmed only for the fixture's specific values; half-integer boundary behavior is unverified.
- Tree size reduction is real (42–56%) but insufficient alone to explain or resolve the OOM at 504–512 KB vs 768 KB.

## Limitations

- Single fixture: windowing logic is fully tested, but graph rounding is not boundary-tested.
- Physical results on candidate firmware are pending; conclusions on OOM/timing improvement are projections only.
- Root cause of OOM at 66–67% of budget (504–512 of 768 KB) is not established. Fragmentation vs. unreported allocation is unresolved.
- Async selection-change-during-frame behavior is analyzed as cosmetic; no test confirms this.

## Testable Recommendations

1. **Add a half-integer graph boundary sample** to the differential test fixture. Specifically, construct a graph value where `value * scale + offset = N + 0.5` for integer N and verify draw equality. Pass/fail is binary and immediate.
2. **Profile ESP32-P4 allocator** to report peak fragmentation (largest free block vs total free) at the moment of OOM. If largest free block is small relative to total free, fragmentation is confirmed.
3. **Run the candidate firmware** and record: (a) whether the two >80 ms frame events still occur, (b) peak reported allocation, (c) whether return code 2 recurs. Compare directly against the original firmware's four fault events.
4. **If fragmentation is confirmed**, test an arena allocator for tree buffers to eliminate old+new coexistence fragmentation.
