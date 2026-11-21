---
Title: Protocol for the paired physical scalar trial
Ticket: PICOCALC-SCALAR-BREAKDOWN
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T00:24:59.997217018-05:00
WhatFor: ""
WhenToUse: ""
---

# Protocol for the paired physical scalar trial

The preceding measured release is installed on the handheld. Freeze its application and table in a separate rollback directory, retaining its exact compiled source and previously verified screen references. The new firmware keeps the same stock compiler behind the launcher's fourth scene. Its five additional compiler bundles are selectable from the trusted console. The compiler uses identical source in a fresh QuickJS runtime for every arm.

| Firmware selector | Source and primary row |
|---:|---|
| 0 | Original stock compiler, no special treatment |
| 9 | Common preflight, normal per-access checks and stack local homes |
| 10 | Common preflight, eligible accesses hoisted, stack local homes |
| 11 | Common preflight, per-access checks retained, selected local homes in registers |
| 12 | Common preflight, eligible accesses hoisted and selected local homes in registers |
| 13 | Same as 12, also skip a sphere's horizontal loop when its row radius is negative |
| 8 | Previously qualified scalar assembly row, including its previous cursor scheduling |

The unit of replication is a program, pose and repetition. Seven rotations put every program in each position in the seven-arm sequence once. Rotate the order of the twelve poses along with the repetition; rotate C scalar, C+PIE and the active guest within each pose. Keep four clocks around the same invocations: clean RGB, audited RGB plus nearest depth and object ID, primary-only depth and ID, and shade from the prepared depth and ID. Fixed C and C+PIE share all three output addresses with the guest within a block. The clean call writes 51,200 RGB565 bytes, excluding frame enlargement and display scanout. Retain elapsed microseconds and core cycles. The expected sample matrix has 588 blocks, 49 cold installations and 7,056 timed invocations.

Compare native output buffers with deliberately different initial values, including all row padding and guards. For each output plane also compare the portable C corpus's frozen checksum from the previous accepted release. The fixtures include lamps at both bounds, overlapping spheres and strides of 160, 165 and 320. Check the ordinary display's Typed-entry counter, changed sphere, changed light and final post-readback default image. The device remains in stock Typed scene mode after success. The study's optimized arms remain independently reproducible through the console.

For each matched pose/repetition compute time saved by lifting checks while holding local placement fixed, and by changing local placement while holding checks fixed. The difference between the two conditional savings is the interaction in microseconds. Measure early row skip only against the arm with both changes and identical loop scheduling. The prior hand-scheduled arm is a separate endpoint. The ordinary stock arm controls for costs introduced by common preflight or body cloning. Compare compile times and emitted sizes separately. The release and full arithmetic controls remain part of the outcome even when a measured effect is negligible.

## Held-out shadow-region addendum

The compiler team preregistered an instruction-count forecast for a separately proven short buffer region in the floor-shadow function before implementing its transform. Its prediction for the ordinary pose is a reduction of 412,994 from 15,532,624 complete-frame guest instructions (2.659%). This is an instruction prediction, not a conversion to elapsed time. Test selector 14 and stock 0 on the same new firmware after the original seven-arm suite qualifies. Alternate AB/BA across eight rounds and use every pose, all three planes and four entries. The primary-only call is an internal negative control because it does no floor-shadow work. Require both actual guest images to match their independently linked ELF CRCs. Recheck all 14 older selectors at the opening pose and retain the previously qualified factor app as the rollback target. [Prospective shadow forecast](../various/compiler/shadow-forecast.json)
