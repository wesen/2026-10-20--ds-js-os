---
Title: Independent material agreement and handheld measurements
Ticket: PICOCALC-CANDELA
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
LastUpdated: 2026-11-20T23:42:02.149866931-05:00
WhatFor: ""
WhenToUse: ""
---

# How to tell which program built or changed a scene

A material handle is an index into a table. A material refers to a color expression, and a sphere refers to a material. These extra references let two spheres share one color and let one of them later receive a different derived material. A parameter is a separate mutable cell. Changing the weight of a mix should change the derived material without changing the shared color node, shape descriptors or program.

## Independent observations

The Python oracle reads the 303 unsigned 16-bit cells defined by the common contract. It first validates counts, backward node operands, operand types, color channels, parameter values, materials and sphere/floor handles. It computes a typed value at a hit using a direct expression interpreter. Geometry and lighting use integer math from the specification and a separate Python ray/sphere equation, with the first sphere winning an equal depth. Shading rounds to RGB565 after computing the channel intensities. Independent numerical and pixel checks must pass before a timing ratio is interpreted. [Wire format](01-shared-scene-graph-contract-and-acceptance-fixtures.md)

The shared-sphere case must retain a common blue node while the right material also has access to a mix weight. Compare the left and right surfaces at 0, 128 and 256, including their geometry. A pure parameter update must preserve every occupied and spare graph cell apart from the selected parameter. For the tile case, change the frequency on the same graph and evaluate coordinates at a checker edge and one representable coordinate on either side. A single pixel has only its observable final RGB565 value. Compare the unlit material colors as well to expose channel differences hidden by quantization or occlusion.

## Numerical tests

For the admitted binary-fixed inputs, multiplication by an integer pixel coordinate and a dyadic Q8 weight is exactly representable in single precision over the supported bounds. We expect exact tile classifications for those inputs. A separate quantization experiment begins with an authored decimal frequency that is rounded to Q8 and independently rounded to binary32. We count classification disagreements, split them by distance to the tile threshold, and retain sample witnesses. These two experiments answer different questions about a prospective floating-point path. An exact equality claim applies only inside the proven finite domain. [Independent research consultation](../various/review/opus-provenance.json)

## Physical timing and memory

On startup the production loader compiles the whitelist of bundled Typed source into a closed RV32 ELF using the existing fresh QuickJS runtime and relocates it with the P4 loader. No guest source is accepted from UART or storage. The stage selector requests hand-built, fluent and callback-authored source, while the ordinary UI selects a fixture and its Q8 weight. A failed staged compilation or graph validation preserves the active valid state.

For each accepted stage record wall time and peak tracked JS allocation from its cold compile. Time relocation, the actual guest graph builder call, checked graph publication, a parameter-only update and an entire native frame separately. The frame clock excludes serial and display scanout. Measure the steady parameter path in a repeated loop because the board clock reports microseconds. Expose the actual linked-module bytes separately from the compiled code slot, the live graph bytes, the native paint scratch and the output framebuffer. Report memory scope beside every peak and do not add independently timed peaks. The previous release remains a verified rollback image. Recheck ordinary worlds, painter and keyboard, and leave the tested image installed on success.

## Review conditions

A forward or cyclic node, invalid material handle, out-of-range parameter or full builder table should fail without affecting the last good graph. Authoring forms must agree on material meaning and sharing even if they allocate different internal IDs. For the same stage and fixture the independent graph, guest evaluation and normal visible viewport should agree at the default, middle and endpoint parameters. Compare scalar-per-hit and guest-per-row mode using the same geometry system and output memory, and record practical limits if a mode cannot render an interactive frame.
