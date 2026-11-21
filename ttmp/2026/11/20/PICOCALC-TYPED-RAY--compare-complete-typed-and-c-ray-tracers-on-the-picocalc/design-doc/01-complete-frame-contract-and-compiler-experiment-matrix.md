---
Title: Complete frame contract and compiler experiment matrix
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

# Complete frame contract and compiler experiment matrix

The first gate is a full 160×160 frame computed from one Typed entry invocation using today's checked buffers, RV32 backend and caller-provided scratch. A native wrapper allocates storage, loads code, invokes the entry and presents the resulting buffer. Keep primary tests, depth selection, hit material IDs, occlusion, diffuse lighting, material evaluation and RGB565 packing in Typed. Compare 25,600 depth values, material IDs and pixels to independent C output. Exercise ordinary and changed poses, fixed and matching programmable materials, explicit stride, canaries and scratch reuse. Separate preparation from timing. No board accesses until the Candela physical owner releases it.

After the scalar milestone compare an explicit packed intrinsic, inferred row-loop lowering and scalar fallback under signed i16, unsigned u16 and i32 indexing. Isolate compiler effects with matched scalar C and Typed, then measure PIE within each implementation. Inspect emitted instructions and use observed phase times to choose additional passes. Record equal graphs and positions, compilation, primary work, lighting/shadows, material evaluation, frame latency and memory. Negative results are deliverables. Each researcher maintains a separate detailed diary, design, evidence scripts and newcomer article, and the director publishes a synthesis and the individual articles together.

## A call from a key event to the display

The ordinary Ray Tracer sends its sphere and light coordinates to the compositor. The fourth scene selects the Typed renderer. The compositor owns a writable graphics buffer and the destination stride. The ESP32-P4 service compiles the trusted source with the existing closed-module linker, relocates the result and obtains function entry addresses. The clean entry returns after it has populated the 160 × 160 image. The graphics layer expands it to the 240 × 240 viewport. The lab times the frame up to image completion. The keyboard/display replay separately tests the expanded pixels and reports which implementation actually ran.

```text
Ray Tracer app ── scene + sphere + lamp ──▶ compositor
                                             │
                                p4_typed_ray_frame()
                                             │
                                typedRayFrame(output, scratch, pose)
                                             │
                                  for each row: find nearest surfaces
                                                shade sphere or floor
                                                pack RGB565
                                             │
                                host copies to graphics surface
                                             │
                                viewport enlargement and display
```

## Ground truth and ownership

A Typed buffer begins with a four-byte capacity followed by unsigned two-byte cells. Reuse work storage across frames. Input positions bound every distance and square. Store signed quantities with an explicit representation if they cross this interface. Keeping a discriminant in an i32 local makes a negative miss naturally distinguishable from a near surface. A material graph uses independent handles for expressions, materials and spheres. A sphere index for a nearest-depth test and a material handle for shader evaluation are different quantities.

| Entry | Input | Output used to qualify it |
|---|---|---|
| `typedRayFrame` | Output, scratch, sphere and lamp positions | The complete packed image; padding and canaries survive. |
| `typedRayRender` | Three output planes, scratch and pose | Every depth, winning ID, and pixel, checked against C. |
| `typedRayTrace` | Depth and ID destinations, scratch and sphere position | Primary visibility only, with zero on misses and earlier object on ties. |
| `typedRayShade` | Known depths and IDs, lamp and sphere position | Colors reconstructed without tracing the primary rays again. |
| `typedRayMaterialFrame` | Validated graph, scratch, material ID row, color row, shader scratch, output and lamp | Six complete images against an independent material evaluator and a mixed native reference. |

The programmable entry requires disjoint buffers and prevalidated graph contents. The board harness constructs a scene, updates its parameter, validates the graph and warms both renderers outside the clock. The reference's ordinary frame entry still performs its normal validation. The reported mixed timing therefore includes that validation. The CPU cache starts warm after an actual draw in both arms. Cold compilation uses a separate clock.

## Paired experiments

1. Run equivalent scalar C and scalar Typed first. This establishes the cost of the ordinary translation, including buffer checks and register traffic. Record clean and audited frames independently.
2. Keep source constant and specialize division guards only when a local literal proves them redundant. Inputs with negative dividends, zero divisors or minus one check that the fallback keeps its defined behavior.
3. Use a matched hand-scheduled scalar row, an explicit packed row and a compiler-recognized packed row. Check a modified loop that must fall back, preserve behavior on malformed inputs and exercise narrowing. This distinguishes vector execution from the benefit of keeping scalar values in registers. One eight-lane instruction can save fewer wall-clock cycles than eight scalar operations if the real bottleneck is elsewhere.
4. Change source independently. Restrict sphere intersections to their projected row span. Use a separate projected rectangle and a fixed shadow mask to avoid per-pixel scans of every sphere. The functions in the source variant preserve equal-depth ordering and the floor shadow rule. Cross these source changes with the divisor compiler when collecting physical clocks.
5. Repeat the chosen controls for a material graph. Compile the same Typed scanline evaluator into both arms or use its already qualified native entry. Record the geometry implementation and the common graph. A fixed-color C frame is a different workload.

## Reproducing the studies

The source entry points are in `picocalc-os/worlds/raytrace/raytrace.typed`. The programmable frame is in `material-frame.typed` alongside it. The source-format contract and evaluation routines live under `picocalc-os/worlds/candela`. Review `typed_ray_p4.c` and `typed_ray_material_bench.c` in `picocalc-os/port/esp32p4/main` for the device measurement boundaries. The [scalar design](02-scalar-typed-ray-renderer-and-bitwise-differential.md) gives exact buffer capacities and return conventions.

Start with the renderer researcher's `scripts/renderer/03-qualify.sh SCRATCH` from this ticket. It compiles portable C and runs the current Typed implementation. Use `scripts/director/make-spans.py OUTPUT` and then `scripts/director/make-shadow.py INPUT OUTPUT` from the repository root to create the source arms. Pass a variant as the second argument to `scripts/renderer/02-wasm.mjs` and an independent receipt path as the third. The instruction profiler accepts both a source path and an optional backend path. It checks the resulting color hash before reporting per-function costs.

```text
for each semantic fixture:
    calculate expected depths, winning IDs and colors using the reference
    render using each candidate
    compare active rows and unchanged padding
    verify all representations of a miss and a depth tie
for each device timing block:
    install one identified backend and source
    rotate the order of C, packed C and Typed
    time each equivalent output boundary
    compute CRC and compare arrays outside the timed interval
```

The separate [director diary](../reference/01-director-investigation-diary.md) records experiments that changed the direction of the lab. Each measured percentage should identify its denominator, the compiler/source variant and whether the number describes static bytes, dynamically executed instructions or wall-clock time.
