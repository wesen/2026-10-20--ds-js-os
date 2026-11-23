---
Title: Board harness fixes
Ticket: PICOCALC-BOARD-HARNESS
Status: active
Topics:
    - picocalc
    - firmware
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T12:44:22.034092631-05:00
WhatFor: ""
WhenToUse: ""
---

# Board harness fixes

## Executive Summary

<!-- Provide a high-level overview of the design proposal -->

## Problem Statement

<!-- Describe the problem this design addresses -->

## Proposed Solution

<!-- Describe the proposed solution in detail -->

## Design Decisions

<!-- Document key design decisions and rationale -->

## Alternatives Considered

<!-- List alternative approaches that were considered and why they were rejected -->

## Implementation Plan

<!-- Outline the steps to implement this design -->

## Open Questions

<!-- List any unresolved questions or concerns -->

## References

<!-- Link to related documents, RFCs, or external resources -->

# Board harness fixes

Small defects in `bench/board/`, each seen during PICOCALC-TYPED-FIRST:

1. **Painter wait with peripherals off.** With `--peripherals off-by-user`, `device.health` checks the Chess painter immediately (`painter(console)` once, `bench/board/device.py` around line 210). With peripherals off the painter is delivered later than in the `on` path, so a healthy board failed with `painter sources=0`, and a rerun passed. Wait for it with the same deadline loop as the `on` path.
2. **Console timeout while the gallery prints.** `device.Console.command` never times out while the gallery prints `CGAL` lines. A deadline is extended by any line, or lines are read without checking the deadline. AGENDA-TYPED-WORLD worked around it with raw serial reads. Make the deadline absolute, and add a test with a fake serial port that streams unrelated lines.
3. **A health check after a "power cycle" with USB connected.** The ESP32 stays powered over USB, so a health check judges world errors left from before the cycle. In TYPED-FIRST this was a compositor `ran past its turn budget of 80 ms` restart recorded after the keyboard wedge.
   - `playable.py install --health-only` should reset the board (DTR/RTS, as `esptool` does) before settling, or report the uptime and refuse to judge errors older than the settle start.
   - Pick one in the Refinements and justify it.
4. **The compositor overrun.** Find out whether the 80 ms turn-budget overrun is reproducible on a healthy board. Run the playable image for 30 minutes with the gallery and Chess in use, through console key injection, and read the compositor's turn statistics. If it reproduces, find the turn (the kernel trace) and report it. If it does not, record that it only followed the I2C error storm.
5. **Bus health in every health record.** Record i2c0's transfer and error *deltas* over a 5 s window. Cumulative counters misled us after the power cycle.

## Gates

- `make test` (the board library's Python tests run there; add tests for 1, 2 and 5).
- One real `playable.py install` with peripherals on, passing.
- One `--health-only` run that shows the new reset or uptime behaviour.
