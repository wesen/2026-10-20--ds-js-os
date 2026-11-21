---
Title: Measuring a whole Typed ray frame on the physical handheld
Ticket: PICOCALC-TYPED-RAY
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
LastUpdated: 2026-11-20T23:51:26.674130042-05:00
WhatFor: ""
WhenToUse: ""
---

# Measuring a whole Typed ray frame on the physical handheld

A complete image contains 25,600 primary rays. A primary ray chooses the nearest object at a known position. Shading uses that geometry to apply the light, test floor shadows and produce one RGB565 word. The P4 test makes two separate measurements. In an audit run, both C and Typed return the color plane, depth plane and nearest-object ID plane; an untouched word disqualifies the run. In a clean frame run, neither implementation writes those two diagnostic planes. The clean frame excludes graph construction, code relocation, outer UI enlargement, SPI and LCD timing.

## Fixed inputs and byte checks

The ordinary closed module uses the same movable sphere, lamp and fixed two background spheres as the original C scene. The native wrapper allocates each 25,600-word output and a 2,048-word workspace in PSRAM. A Typed buffer begins with its 32-bit capacity. Coordinate changes affect scalar arguments only. Zero in scratch cell 0 requests packed rows; a positive stride selects a padded caller layout. Compare the entire visible rectangle and every pad byte. Poison the two implementations with different bytes before each audit. Record the first unequal word and plane if any arm fails. Compare all three audit planes to scalar C; for clean frames compare the final image against the previously qualified audit. Include the previous ordinary classic viewport as a historical reference.

## Clock and attribution

Block within poses, rotate arm order and use the same output address for clean timed observations. Separate clean whole-frame, primary-only and, if exported by both implementations, shade-from-primary measurements. Each timed entry call validates its own arguments. Never subtract a separately measured audit time and call the result a phase measurement. The ordinary scalar C and C with P4 PIE differ in primary evaluation whereas the stock Typed program executes bounded scalar RV32. These represent two distinct questions. Additional cells replace only the compiler or only the Typed traversal source. An arm must produce the same answers at every stage before comparing its time.

A resident image has four closed direct-call entry points and no imports. We will use a fresh portable compiler runtime for each compiler and source condition. The frozen scalar baseline and a generated backend for positive literal division receive byte-identical source where available. Report native text and linked ELF separately because the fixed executable slot reserves unused bytes. Keep test-only loading work out of the ordinary regression path. Sequential staged builds limit peak memory while the old executable remains available until a valid replacement is installed. For the normal launcher the default is the stock baseline unless the final controller deliberately promotes an independently qualified candidate.

## Physical acceptance

Read back the exact ordinary preceding Candela release plus unchanged partition table before experiment. The device runner owns one shared serial lock, sends an I2C hold before flash and writes the application partition only. Failure restores and verifies that prior release. The final passing release must re-open the interactive Typed screen, reproduce captured full crops across several poses, and retain the eight normal native worlds, healthy mobile painter and advancing keypad poll count. Keep raw UART/screenshots under a private temporary directory and publish compact receipts and representative unaltered screenshots.
