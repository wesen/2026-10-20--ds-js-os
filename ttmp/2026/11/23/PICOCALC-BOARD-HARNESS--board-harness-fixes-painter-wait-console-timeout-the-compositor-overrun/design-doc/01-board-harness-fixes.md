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

## Refinements (2026-11-23)

Decisions taken while implementing, after reading `bench/board/device.py` at `6e9c08c` and the firmware's console
(`firmware/port/esp32p4/main/main_p4.c`, `firmware/nucleus/kernel_reports.c`).

1. **Painter wait.** One function, `wait_painter(console, calls)`, serves both modes with the same deadline loop
   (`PAINTER_S` = 30 s after the settle; the `on` path had 20 s). With the peripherals on it waits until the painter
   is installed, has been called and has no rejects. With the peripherals off it waits until the painter is installed
   without rejects, and does not ask for calls: with the display off nothing draws Chess, so `calls` may stay 0.
   Both then require `compiles == 1`.
2. **Console deadline.** The design's premise does not hold for the code as it is. A fake port that streams CGAL
   lines at 200 and 2,000 lines per second made `command("hold", timeout=1)` raise `TimeoutError` after 1.00 s
   (diary step 1). `Console.line` returned an already buffered line without checking the deadline, but it reads only
   when no complete line is buffered, and every read was preceded by a check. So the deadline was effectively
   absolute already. The changes harden two real gaps:
   - `line` checks the deadline before every line, buffered or not;
   - `command` accepts `#OK CMD` at the end of a line, so a line that another task's partial output began does not
     hide the answer (the text before it is returned as a line).
   `Console` also takes a port object (the tests' fake) and has `drain(seconds)`, which the constructor uses
   (`drain_s`, default 13 s as before).
3. **Health after a long uptime: reboot, not uptime-based judging.** `health` starts with `fresh_boot`: it reads the
   kernel clock (`stats` prints `t = X ms` first). If the board has been up for more than `FRESH_S` = 120 s, it
   reboots the firmware with the console's `reboot` command, drains the boot, and checks that the clock restarted.
   Every health record carries `"boot": {"uptimeMs", "rebooted", "uptimeBeforeMs"}`. The reasons:
   - The `worlds` report has no time for an error, and `restarts`, `last_error` and the bus counters run from boot.
     Judging by uptime could only refuse every error older than the settle, or diff two snapshots. Both leave the
     boot path unjudged: the boot compiles, the painter's single compile, and restarts during boot are what an install
     checks and what fails in practice.
   - After a reboot, `--health-only` judges exactly what an install judges: a fresh boot of the image on the board.
   - The firmware's `reboot` holds i2c0 between transactions before `esp_restart()`. An EN pulse through DTR/RTS (what
     esptool does) resets at an arbitrary point, possibly in the middle of a keyboard transfer, which is the suspected
     cause of the keyboard controller wedging after ESP32-only resets. The CH343 is not reset, so the port stays open.
   - The cost is one boot (about 20–30 s), only for a board that has been up for more than two minutes.

   The rule applies to every health check, not only to `--health-only`: `run_app`'s check of the board before a study
   also judged a board of unknown age. A board that does not answer `reboot` fails health. `playable.py install
   --stored OUT --health-only` now checks the recorded image without flashing and without writing `PLAYABLE.json`.
   The `install BUILD OUT --health-only` form still records.
5. **Bus window.** `Console.bus_window()` reads `stats` twice, `BUS_WINDOW_S` = 5 s apart. It returns `{"seconds",
   "deltas": {bus: {transfers, bytes, errors, busyMs}}, "totals": {...}}`, and every health record keeps it as
   `"buses"`. With the peripherals on, the keyboard qualifies on the window: i2c0 transfers > 0 and errors == 0. This
   replaces `input_ready`'s 0.4 s probe. With the peripherals off, the window is recorded but not judged.
   `PLAYABLE.json`'s health summary gains `i2c0Window`.
6. **Tests.** There were no tests of the board library. `tests/board/fakeboard.py` is a fake console on a virtual
   clock: wire time at 115200 baud, `worlds`, `stats`, `painter`, `hold`, `reboot`, a CGAL stream, stale errors,
   errors on every boot, and NACKing keyboards. `tests/board/test_device.py` has 16 tests. `make test-board` runs
   them and is part of `make test`. Each fix was also checked by mutation: undoing it in a copy of `device.py` makes
   at least one test fail.
7. **Hold before an install's reset** (found while running the install gate). `install` flashed through esptool,
   whose reset into download mode can land in the middle of a keyboard transfer. Unlike `run_app`, it did not ask the
   firmware to `hold` first. `device.quiesce` now holds i2c0 between transactions before `write_app`. This is best
   effort: an image without the console is still flashed. The record says `heldBeforeFlash`.
