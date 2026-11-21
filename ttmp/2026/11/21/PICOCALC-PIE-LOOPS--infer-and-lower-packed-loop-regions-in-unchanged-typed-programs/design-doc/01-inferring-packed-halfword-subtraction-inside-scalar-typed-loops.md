---
Title: Inferring packed halfword subtraction inside scalar Typed loops
Ticket: PICOCALC-PIE-LOOPS
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
LastUpdated: 2026-11-21T07:14:05.287245579-05:00
WhatFor: ""
WhenToUse: ""
---

# Inferring packed halfword subtraction inside scalar Typed loops

## The experiment

A ray tracer casts one ray for each pixel. At a fixed screen row and sphere, the vertical distance and sphere radius are constant. The inner loop subtracts each pixel's squared horizontal distance from that constant. A negative difference is a miss. A nonnegative difference indexes a square-root table and can update the nearest depth and object ID. The application expresses this computation once in Typed JS, a restricted language with 32-bit integers and checked buffers. The experiment asks whether its compiler can discover eight independent subtractions inside this loop and issue real ESP32-P4 packed instructions. The table lookup and conditional stores can still execute in source order, one result at a time.

The input is the ordinary function in `picocalc-os/worlds/raytrace/raytrace.typed`, especially lines 99–122. Keep the source, the set of visited pixels and the exact nearest-depth comparison fixed across all three arms. A previous hand-written row provided working assembly for the P4 but recognized the numeric tape of a particular whole function. Here eligibility must follow from local operations and their uses. Changing a name or moving the computation to a different function should preserve eligibility. Conversely, a one-token change that introduces a dependence may require a different decision.

## From source code to a running image

```text
                      Typed source
                           |
                   declarations and types
                           |
                per-function frontend emitter
                      /              \
           encoded Wasm body      numeric RV32 input tape
                   |                     |
             host WebAssembly      identify innermost loops
                 runtime           recover data and effects
                                         |
                                  optional region plan
                                 /        |          \
                             ordinary   matched      PIE
                              scalar    scalar      groups of 8
                                 \        |          /
                                 RV32 assembly and fixups
                                           |
                        final image, entry offsets and listing
                                      /            \
                              host emulator      physical P4
```

The numeric tape is a compact sequence of opcodes and immediate operands. A local variable has a numbered slot. For example, a load from a Typed buffer can include a local holding the element index, a checked-address operation and an unsigned halfword load. The tape cursor counts cells. A final native PC counts bytes in the assembled image. A Wasm byte offset points into a different artifact. Keep both the tape interval and the native PC range in an inspection record so an engineer can trace a compiler decision to executed machine code.

The native backend already holds the current function and releases its tape after lowering in streaming mode. Analyze that one function, build a small plan for each supported loop, emit the region and discard the plan. Ordinary builds should retain their existing compilation path. The host tool can explicitly load the additional analyzer and enable either experimental arm. Record cold compilation cost for the extra analysis as well as the size and execution cost of the generated program.

## What must be true of the loop

Start from a counted inner loop with a signed comparison against a stable bound, a forward increment of one, a uniform subtraction term, and a checked 16-bit load indexed by a stable base plus the induction variable. The body assigns the difference to a local and enters an ordinary conditional region when the difference is nonnegative. Draw the boundary immediately before the scalar consumer. Keep the rest of the function under the existing backend.

- **Induction** means that a known update computes the next iteration's index. The compiler must establish that no other assignment changes the index inside the copied region. Preserve the index visible after the loop.
- **Uniformity** means the bound, input base and minuend keep the same values for every accelerated iteration. A local need not be a source-level constant to satisfy this property. A call or reassignment that invalidates a fact requires a new proof or a rejection.
- **Memory dependence** concerns the order of reads and writes. Loading the next eight inputs early changes behavior if lane zero can overwrite the value lane one has yet to read. Account for every store, buffer identity and index expression. Prove disjointness statically, test it before grouping, or keep the original scalar loop. Preserve the ordering of all stores in the scalar consumer.
- **Exception order** matters even when the final valid images match. If a short input would trap at element seven after earlier lanes wrote output, a packed read must never replace that execution with an earlier trap. Check admission before the first speculative access, and enter the original loop if the input range cannot be proved safe. Likewise preserve scalar order for a failing checked output.
- **Live values** are values an observer can later read. The original difference may be an arbitrary negative i32. A halfword miss marker is adequate only when the code observes the sign and uses the difference solely in the nonnegative arm. If the caller can later read the original negative value, decline this lowering.

## The unsigned input and signed instruction

A buffer starts with its 32-bit capacity in elements, followed by 16-bit unsigned cells. The scalar expression subtracts values between 0 and 65,535. The PIE subtraction operates on eight signed 16-bit lanes with saturation. Reinterpreting the cell 65,535 as signed gives −1: subtracting it from zero would appear to produce +1, a false hit.

There is a narrower, exact statement we can use. Guard the row term R to the inclusive range 0…32,766. After a packed subtraction, read the resulting lane as an unsigned halfword U. The consumer may accept a hit exactly when U ≤ R:

| Input cell | Scalar result | Packed interpretation |
|---|---|---|
| 0 through R | 0…R | Same numeric result, accepted |
| R+1 through 32,767 | Negative | Halfword has its sign bit set, rejected |
| 32,768 through 65,535 | Negative | Signed input is negative. Subtraction yields more than R or saturates to 32,767, also greater than R |

At R = 32,767 the last case can saturate to R and pass incorrectly. That boundary belongs in the test suite. At an unsupported R, run the original i32 operations. Scalar and PIE paths must agree for every legal buffer value, including data the scene generator would never produce.

## Two ways to generate the same groups

```text
recognize(loop):
    recover index, step, trip bound, source address and uniform value
    prove which operations read the difference and which can write future inputs
    record a reason for acceptance or for leaving the loop scalar

lower(plan):
    test value range, source span, trip count and memory overlap
    if admission fails: run the ordinary loop from its current index
    handle unaligned elements singly
    for each complete aligned group:
        matched scalar: load eight unsigned cells and subtract individually
        PIE: broadcast R, load eight halfwords, subtract, store a packet
        consume the lanes in original order with the ordinary scalar body
    finish the remaining zero through seven elements in scalar order
```

The RV32 ABI gives the compiler an aligned stack. Reserve aligned private scratch for one packet and a broadcast value, independent of user memory, locals and operand spills. Use only vector registers whose execution context is supported by the P4. A vector load or store with postincrement changes its address register. Avoid carrying that temporary address into an unrelated scalar computation. Use a common scheduling decision for the two experimental arms; every difference in their guards or scalar consumer would compromise the attribution.

```text
 source cells        [ s0 s1 s2 s3 s4 s5 s6 s7 ]
                          16-byte aligned load
 uniform R       ->  [ R  R  R  R  R  R  R  R  ]
                           packed subtraction
 scratch lanes   <-  [ u0 u1 u2 u3 u4 u5 u6 u7 ]
                         |
                 for each U <= R, run the scalar hit continuation
```

## Interfaces and implementation sequence

1. **Analyze.** Inspect the numeric operations from `typedWasm.compileFunctions` in `picocalc-os/compiler/typed-wasm.js`. Introduce an optional analyzer in `picocalc-os/compiler/typed-pie-loops.js`. Recognize loop structure and verify def-use, control flow and memory effects. Decisions should identify the tape interval, facts, admission requirements and the first failed condition. Begin with a deliberately small grammar whose rejected cases have clear reasons.
2. **Emit.** Integrate the plan with `typedRv32.compile(source, imports, maxSourceLength, options)` in `picocalc-os/compiler/typed-rv32.js`. Use `options.pieLoops = "scalar"` or `"pie"` for an explicit treatment. Leave it absent for stock. Run ordinary lowering for unrecognized functions. Patch branch destinations with the existing assembler. Keep an original scalar route for inputs excluded by an entry guard.
3. **Explain.** Extend `picocalc-os/tools/typed-inspect.mjs` to select the treatment and print per-loop decisions alongside its existing frontend and final emission records. Keep final bytes readable with vendor disassembly. A usable report identifies why the operation is legal, where the compiler inserted guards, how many bytes the new code occupies and which parts execute.
4. **Qualify.** Freeze the analyzer and lowering before opening an independently selected loop. Compare ordinary Wasm, ordinary RV32, matched scalar and PIE. Generate code once per input program. Compare return or trap, changed payload and untouched padding after each invocation. Measure cold host compile time separately from emulated instruction fetches. On the board time matched scalar/PIE calls with identical inputs and image identity checks if a qualified execution path is available.

The single command to begin inspecting the ordinary baseline is:

```sh
node picocalc-os/tools/typed-inspect.mjs picocalc-os/worlds/raytrace/raytrace.typed \
  --function typedRayComputeRow --target rv32
```

The existing inspector API accepts `{inspect: {function: "typedRayComputeRow", emit(event) { ... }}}`. Function filtering limits observation; it must never change compilation semantics. The Wasm backend stays a scalar oracle. On the host, the ESP toolchain's objdump decodes the resulting bytes, and the emulator in the earlier PIE ticket executes the vendor-decoded instructions. An x86 Node runtime alone cannot execute these instructions natively. Board timing includes memory placement and processor effects absent from fetch counts.

## How to judge a result

Compare stock to matched scalar to account for scheduling, checks and any new scratch traffic. Compare matched scalar to PIE for the incremental effect of packed subtraction. Finally compare PIE to stock for the product decision. A candidate can win the second comparison and lose the third. A compiler should eventually select it only where the complete cost pays. Begin with a minimum useful group of eight, report alignment peel and tails, and include a legal but short loop. Do not interpret a positive host instruction result as a measured speedup in milliseconds.

Read the existing reference kernel at `picocalc-os/nucleus/raytrace_demo_pie.S`, the older whole-row compiler experiment under `ttmp/2026/11/20/PICOCALC-TYPED-RAY*/scripts/compiler/`, and the host machine model under `ttmp/2026/11/20/PICOCALC-TYPED-PIE*/scripts/review/`. This ticket's scripts, annotated listings and measured report will document which assumptions survived implementation. Production promotion requires an independently correct result and a demonstrated benefit for the intended workload.
