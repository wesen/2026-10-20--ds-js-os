---
Title: From a System sample to a panel update
Ticket: PICOCALC-COMPOSITOR-FAULT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://apps/js/picocalc/apps/sysmon.js
      Note: System view producer
    - Path: repo://apps/js/picocalc/system/compositor.js
      Note: Frame reception and painting
    - Path: repo://firmware/port/esp32p4/optional/native_elf/native_elf_p4.c
      Note: Native return and timing checks
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T07:12:07.896034891-05:00
WhatFor: ""
WhenToUse: ""
---

# From a System sample to a panel update

## Follow one screen update

Press F1 and then M. Home is the launcher. M opens the application whose kernel name is sysmon and whose title is System. A *world* is a running component with a mailbox, a memory allowance and a limit on the duration of a turn. A *turn* handles work for that component. Several worlds must each complete work before a changing CPU counter appears on the LCD. The fault log identifies which world and which event were active when the kernel detected a failure.

System samples counters every 500 ms. While focused it asks the kernel for the worlds and handles, records the elapsed time between samples, and computes the CPU share of each world from the difference in its CPU counters. Its Worlds tab constructs a table with seven columns and a row for each world. It also constructs a graph of recent activity and details for the selected row. For example, moving down one row can change both the selection in the table and the text listing the selected world's claims. These objects describe what to draw. At this point there are no panel pixels in the update.

~~~mermaid
sequenceDiagram
    participant S as System (sysmon)
    participant K as Kernel
    participant C as Native compositor
    participant D as Display driver
    S->>K: read world and handle snapshots
    S->>K: publish own screen on frames
    K->>C: deliver frames event with sender identity
    C->>C: retain latest tree and queue draw if focused
    C->>C: handle draw, paint framebuffer, commit changes
    C->>D: ask for flush of changed rectangles
    D-->>C: settle request
~~~

### The component boundaries

| Component | Implementation to read | Responsibility |
|---|---|---|
| Producer | picocalc-os/js/apps/sysmon.js, sample, worldsTab, handlesTab, busesTab | Polls counters and constructs a declarative tree. The focused state determines which expensive data is sampled. |
| Input and focus | picocalc-os/js/system/compositor.js, keys, focus and open handlers | Accepts keyboard events, sends blur and focus to the respective apps, and schedules a repaint. |
| Frame receiver | Same file, frames handler and dirty | Checks the app identity against the sender, caches the app title, tree and hints, and coalesces repaint requests. |
| Layout and painting | Same file, measure, rowWidths, drawTable, draw, paint | Computes geometry in the body, paints the status bar and hints, and clips the table to its visible window. |
| Pixel transport | picocalc-os/js/drivers/display.js and picocalc-os/nucleus/gfx.c | Display receives a read handle to the shared framebuffer. The compositor sends changed rectangles after commit. |
| Native event boundary | picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c, elf_event | Calls the loaded module, charges elapsed segment time, and validates the return code. |
| Fault supervision | picocalc-os/nucleus/kernel.c, kernel_fault and kernel_worlds_json | Records the reason, applies restart policy and makes counters available to the console. |

## Why source language and execution engine matter

The playable firmware builds compositor.js with CJI into natives/compositor.elf. The manifest identifies the compositor as native and System as a JavaScript world. The ESP32-P4 CMake project selects the CJI worlds, compiles their source and packs the ELF modules. A JavaScript handler unit test can validate the sender check and focus behavior. Testing the native module on the board additionally exercises its generated event entry, runtime allocation, message decoding and timing. The typed RV32 compiler that builds Chess is a separate compiler path.

### Frame receipt and painting

~~~text
on frames(sender, payload):
    if payload.app differs from sender: return
    apps[sender] = (title, tree, hints)
    if sender equals focus and no draw is queued:
        mark draw queued
        send draw to self

on draw from self:
    clear queued flag
    paint status, focused app, overlays and hints
    rects = framebuffer.commit()
    if rects is empty: return
    await display.flush(rects)
    invalidate framebuffer if transfer was skipped or failed
~~~

A frame from a background app may update the cache without scheduling a paint. Several updates before the draw can share a paint. The compositor must retain the latest tree after the native event returns because a subsequent event reads it. A producer can therefore affect the cost of receipt by increasing the serialized tree even when the visible rows on the panel remain constant. Drawing the table and flushing changed pixels belong to later events. A failure marked *frames* deserves investigation before assigning its cost to SPI or font rendering.

## What the original fault log establishes

Four kernel records from the playable build identify the same native module and message. At 30.419 and 31.763 seconds since boot the measured native segment crossed its 80 ms budget. At 39.836 and 53.336 seconds the native dispatcher observed return value 2. The kernel reported 504 or 512 KB of world memory against a 768 KB allowance. A world memory counter cannot establish whether a particular internal buffer had enough capacity.

The SDK assigns 0 to a completed event and 1 to an event with a later reply. In elf_event, the elapsed-time check runs before the return check. If both conditions fail in one call, the time diagnostic takes precedence. Two different strings therefore do not establish two independent bugs. The CJI-produced module has its own entry path. Tracing a generic C SDK wrapper alone cannot explain its return value.

## Debugging procedure and qualification

1. Start with the same peripheral-enabled firmware and record its revision, build flags and application manifest. Acquire the shared serial lock, capture with p4cap.py --no-reset and query worlds before pressing keys. Power cycling clears the kernel's 256-line log ring.
2. Send ordinary F1 and M key events. Allow several 500 ms samples, switch tabs, scroll to a world near the end, and return Home. Capture console output while doing this. Use the JSON after each #OCT1 fault prefix to identify the world, event, board time, reason and memory.
3. Compare the compositor restart count before and after the sequence. A running compositor at the end can already have restarted. Verify that a live System table appears, that the selection moves and that returning to Chess or Home still works.
4. In the receiver, identify how the generated entry translates a decoding, allocation or dispatch failure. In the producer, quantify how tree size changes with row count, labels and history. Compare a change at one boundary at a time and preserve all three System tabs.
5. Run the source-level regressions and repeat the failing interaction on the ESP32-P4 with the same budget. Include a sustained focused interval. A passing host test proves the tested behavior on that host. A clean physical run bounds the observation to its duration, workload and firmware revision.

The historical capture script is in the PICOCALC-SYS ticket under scripts/query-system-fault.py. The physical-state queries and their structured events allow an operator to diagnose a restarted service without a firmware core dump. Keep fault reasons intact during the investigation so an apparent recovery cannot hide an unhandled frame.

### Interpreting the CJI return value

The actual ELF bridge is runtime/cji_elf.c in the imported CJI source tree. Its cji_elf_event saves an escape point, enters the current world's runtime state and invokes the generated entry. On a fatal allocation failure the runtime escapes to this point. The bridge logs the reason, marks the world crashed, and returns 2. The kernel's generic ELF loader subsequently reports the out-of-contract value. In both captured instances, a line immediately above the structured kernel fault says “compositor: crashed: out of memory”. Preserve both lines when diagnosing this case. The allocation wrapper checks the world allowance and then asks the port allocator; the short reason does not distinguish which check failed.

## Screen geometry and the candidate fix

On this panel the drawable body is 304 pixels wide and 270 pixels high after the outer insets. Each table draws its header, computes how many complete rows fit underneath it, then centers that interval on the selected row. The producer has all application state and can send a larger enclosing interval with a local selection. With 28 worlds, selected row 20 and a window of eight, the producer sends rows 16 through 23 and sets the local selection to 4. If the renderer can fit six rows, it draws local rows 1 through 6, corresponding to original rows 17 through 22. At the first and last rows both algorithms clamp to the same edge. The details panel continues to index the full world array with 20. The Handles tab uses fourteen rows to cover its taller viewport.

A line graph requires an x position fixed by sample number and a y position bounded by the plot height. For a 26-pixel plot the renderer scales its normalized sample by 23. The candidate transmits the integer distance from the graph baseline and sets the plot scale to 23. The monitor still computes peak and current percentages from the original samples. The Buses tab applies the same conversion independently to the I²C and SPI traces. Geometry belongs to the current PicoCalc layout; any panel or font change should rerun the drawing comparison.

The host comparison feeds identical System state to the committed producer at dcf3fca and to the candidate, then calls the actual compositor draw function on both trees. Its fake framebuffer records each operation and argument, including coordinates, colors and text. Comparing these streams checks row alignment, highlighting and graph geometry on the tested data. Its byte count measures the serialized UI tree. The actual wire envelope also carries the app name, title and hints.

~~~sh
git show dcf3fca:picocalc-os/js/apps/sysmon.js | node "$ticket/scripts/02-compare-system-frames.mjs"
node --test picocalc-os/tests/compositor-auth.test.mjs picocalc-os/tests/sysapps.test.mjs
~~~

### Display ownership and recovery

The nucleus retains the latest published frame per app. When a compositor instance restarts, it can receive these frames again. This behavior explains how a transient blank screen can disappear while its restart counter keeps rising. In the separate draw event, framebuffer commit compares the front and back pixel buffers. The display driver issues CASET and RASET to select the destination rectangle, RAMWR to begin a pixel write and a SPI transfer for the RGB565 pixel data. A rectangle can be skipped while a new driver is waiting for a framebuffer attachment. Invalidating the framebuffer on a skipped flush ensures the next successful draw can restore the panel.

For debugging, first check that the world doing the work stayed alive, then confirm the expected screen content from the device. Increasing turns alone can indicate a busy process receiving the wrong messages. A CRC-checked screenshot verifies framebuffer contents. A human looking at the physical display can also confirm the last transfer reached the panel.

### Half-pixel regression

A second fixture generates samples intended to land halfway between two pixels. On the first candidate the upper endpoint of one line segment changed from y=81 to y=80. On the panel, y increases downwards. The renderer computes round(base − offset), and its floating-point subtraction can eliminate a tiny error in the fraction near a tie. Rounding the offset by itself has a different result in that case. The correction falls back to the original sample array and scale when a computed offset is inexact at a half and differs from that half by at most 320 times Number.EPSILON. This leaves the renderer's absolute-coordinate calculation intact. The 69 extended comparisons passed after the correction.

## Final device result

Source ef0ff95 ran the complete 152-second test with three complete world snapshots, five CRC-verified screenshots and zero recorded faults or restarts. The compositor advanced 1,075 turns, System 327 and the display 279. Visual inspection confirmed Worlds, the selected final row, Handles, Buses and the return to Chess. The old control and the qualification runs have different durations. The qualification establishes correct behavior for this interaction under its original budgets. [Device receipt](../various/final-device-trial.json) · [Installed image](../various/final-installed.json)
