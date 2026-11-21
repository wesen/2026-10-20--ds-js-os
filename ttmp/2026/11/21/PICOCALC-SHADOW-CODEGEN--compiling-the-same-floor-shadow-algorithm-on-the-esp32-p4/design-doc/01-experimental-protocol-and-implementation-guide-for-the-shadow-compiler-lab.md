---
Title: Experimental protocol and implementation guide for the shadow compiler lab
Ticket: PICOCALC-SHADOW-CODEGEN
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T17:28:50.310013424-05:00
WhatFor: ""
WhenToUse: ""
---

# Experimental protocol and implementation guide for the shadow compiler lab

The PicoCalc renderer sends a ray towards the lamp at each visible floor pixel. If the ray meets a sphere, the floor appears in shadow. Our experiment fixes the sequence of pixels, sphere order, geometry and decisions. It measures how efficiently a small on-device compiler translates that algorithm into native RISC-V instructions.

## From a floor pixel to a boolean

For a candidate sphere the C and Typed implementations first test whether the pixel lies inside the projected X and Y intervals. An X rejection skips the Y test through short-circuit evaluation. If both tests pass, the program computes a dot product and a squared distance. An exact hit returns immediately; a miss advances to the next sphere. Rendering a floor pixel generally takes a different amount of work from rendering a sphere pixel. Selecting actual floor pixels keeps that distribution.

~~~text
for sphere in source order:
    if pixel outside projected X interval: continue
    if pixel outside projected Y interval: continue
    compute dot, squared distance and squared radius term
    if dot > 0 and distance * normSquared <= dot * dot: return true
return false
~~~

The native C program stores sphere fields in structures and separate per-sphere arrays. Typed uses a work buffer whose first word is a length and whose elements are unsigned 16-bit values. Projection values are biased by 4096 to fit the representation and some geometry values use an additional signed offset. A successful buffer read checks its index. Valid and invalid inputs therefore need separate experimental controls.

## One researcher and one sequence of decisions

1. Freeze the source and twelve pose/stride fixtures. Reconstruct the actual floor-pixel stream for each scene, with oracle output for each call, and identify the first decisive predicate for each sphere examined. Add controlled single-sphere calls that isolate an X rejection, a Y rejection, an exact miss and an early hit.
2. Compare unchanged Typed with production C and with GCC compiling a control reading the same Typed layout. Include explicit bounds checks and an unchecked valid-input arm to distinguish target code quality from language checking. Charge the same harness and indirect-call convention to each isolated kernel. Measure compiled entry points and P4 time separately from evidence collection.
3. Trace the existing Typed image and its code for the common path. Sample sizes are counts of actual calls or sphere visits. Measure direct SP-relative operations, ordinary helper calls, bounds branches and arithmetic. Choose a compiler candidate only after identifying paid work and a transformation that can remove it. Retain rejected alternatives with their rationale.
4. Compile the identical sources in baseline and candidate mode. Consider a shadow-only selection to isolate the effect from a program-wide general pass. Compile Chess evaluation as a previously pinned transfer program. Preserve short-circuit, return value, integer arithmetic, the first failing operation and visible memory for exceptional inputs. The WebAssembly backend provides independent execution of the same frontend; the Chess arithmetic oracle supplies independent semantics.
5. Rotate the physical runs. Report time for pure paths, natural calls and complete rendering separately. The primary-only entry never calls the floor-shadow function; it is a useful control for a shadow-only treatment. Report on-device cold compile time, code size and peak heap where measurable. Compare increments within the same image/run series. Keep rejected candidates as measured findings.
6. Independently replay the ratios using the public raw rows and persistent JS service. Publish the single researcher’s chapter and the director’s synthesis with runnable JS, measurement units and source revisions. The director owns external publication.

## Inputs, outputs and observation boundaries

| Entry | Input | Expected output | Unit |
|---|---|---|---|
| Shadow predicate | Prepared arrays, pixel X and Y | One boolean per call | Board cycles per call in a repeated batch |
| Complete frame | Sphere and lamp positions, stride and buffers | RGB565 surface including original padding | Microseconds until output is ready in memory |
| Primary-only pass | Sphere position and geometry | Nearest depths and material IDs | Microseconds per independent entry |
| Cold compile | Source, fresh runtime and options | Valid native image, byte count and digest | Microseconds per compiler invocation |
| Chess evaluation | Pinned board and mode | Score from independent material/positional oracle | Cycles per evaluation |

Hosting different arrays in different memories can change time even when the source operations are identical. The isolated kernel must identify its placement. Complete application timing retains each implementation's own scratch convention. Instrumented host traces predict work; they are separate from uninstrumented physical timing.

## Code map and contracts

- [Typed shadow source](../../../../../../picocalc-os/worlds/raytrace/raytrace.typed) contains typedRayInShadow, typedRayComputeRow, typedRayBuildLight and typedRayFrame. The compiler baseline and candidate read the same file bytes.
- [C renderer](../../../../../../picocalc-os/nucleus/raytrace_demo.c) contains the independent production predicate and light/sphere preparation.
- [RV32 compiler](../../../../../../picocalc-os/compiler/typed-rv32.js) consumes each function’s numeric operations and emits a callable image with named entry offsets. The optional PIE producer from the prior study supplies the common ray baseline.
- [Frozen transfer design](04-validation-and-blind-chess-transfer.md) covers signed returns, board buffer layout, advanced mode and short or malformed fixtures.
- The ticket stores physical protocol code under scripts/board, the selected compiler research under scripts/compile, the independent transfer code under scripts/validation and the signed or hashed measurement records under various.

## Decision rule

Advance a compiler rule when the generated code and comparison programs preserve source behavior, and a physical result demonstrates a useful benefit at an identified compile-time and memory cost. A favorable shadow microbenchmark cannot by itself establish a whole-frame improvement. A rule that improves shadow but slows Chess or cold compilation remains a candidate for a more selective policy; document those costs explicitly.
