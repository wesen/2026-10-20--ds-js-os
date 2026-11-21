---
Title: What a checked buffer read costs after operand forwarding
Ticket: PICOCALC-OPERAND-HOMES
Status: complete
Topics:
    - compiler
    - performance
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T18:48:08.381582179-05:00
WhatFor: ""
WhenToUse: ""
---

# How a streaming compiler can keep checked operands in registers

A floor pixel in the PicoCalc ray tracer can take several paths. If a sphere lies between the floor and the light, the pixel darkens. The function that answers this visibility question consumes the same scene geometry for thousands of pixels. In the opening frame it runs 19,477 times. One small instruction inside this function can therefore execute more often than all the instructions in a cold part of the renderer combined.

The earlier LLVM investigation gave us a precise question. Two compilers could calculate the same shadow and perform checked reads, yet one fetched the buffer capacity once per invocation and Typed fetched it once per element. Could the on-device compiler recover that reuse, keep the original ray algorithm, and still explain every generated bounds check? We built three independently selectable policies and measured their individual contributions.

## From a scene element to a machine instruction

The application writes ordinary Typed functions with integer arguments, loops and bounded buffers. The frontend resolves names and types and emits a function-sized sequence of operations. The Wasm target can encode that sequence for execution by a Wasm engine. The native target walks the sequence and emits 32-bit RISC-V instructions. The PicoCalc runs this compiler on its own processor, so time spent deciding where to keep a value is part of the user's edit-to-run latency.

Consider an illustrative read of element 19. The buffer begins with a four-byte capacity followed by unsigned two-byte cells. The cell's byte displacement is therefore 42. The compiler may know that displacement before execution. It still needs to know whether the actual buffer contains twenty cells. It loads the capacity, compares the index as unsigned, traps if the index lies outside the allocation, and issues a halfword load which extends the result to 32 bits. Unsigned comparison also rejects a negative signed index because its machine representation denotes a large unsigned integer.

A conventional frontend can express the index by evaluating it, storing it in a new local, and issuing a checked-address instruction that refers to that local. This is a good representation of evaluation order. A computed index may itself call a function or access memory. A checked store must validate its target before evaluating a right-hand side with effects. The initial native lowering faithfully implemented each individual operation, including the intermediate store and reload.

## A small interface shared by two emitters

A *home* specifies where generated code can retrieve a local's current value. We introduced two operations, `readLocal(destination, local)` and `writeLocal(source, local)`. The default home is a word in the function's stack frame. With that policy the new interface reproduced the entire pinned ray image byte for byte. That checkpoint matters because two emitters participate. A packed loop can enter scalar fallback code and both sides need to agree on where a local lives.

Local storage and expression evaluation have different lifetimes. Suppose the left operand of an addition reads a local and the right operand changes that local. The addition must use the earlier value on its left. Giving the local a fixed register still requires copying its value into an expression register when the expression outlives the binding's current value. This distinction lets the allocator change homes without redefining the language.

## Three transformations and their evidence

**Forward a single-use index.** A scan counts reads of each local, including implicit reads by native-specific operations. If a local assignment immediately precedes the checked address that consumes its result, and this is its sole read, the emitter takes the index directly from the expression. This removes the intermediate stack round trip. For an eligible constant it can also encode the displacement in the memory instruction. The check still executes. An index reused later retains its ordinary storage.

**Reuse an invariant header load.** The planner identifies a checked receiver on the straight-line entry path. A write to that binding, a memory store or an unclassified call disqualifies the cache. The first eligible access initializes a reserved register with the buffer capacity. Later accesses use that register. Initializing it at the first mandatory access preserves behavior on paths that could exit before touching a buffer. Rejecting all stores is conservative because a store to unrelated storage may be harmless. It makes the rule inexpensive to audit with the compiler's present memory model.

**Assign fixed registers to selected locals.** The planner scores each static read once outside loops and four times inside loops. It allocates available argument registers beyond those reserved for incoming arguments and the capacity. A fixed home on every incoming edge makes loop backedges and branch joins straightforward. The planner excludes persistent homes across an ordinary machine call because that call may overwrite caller-saved registers. A recognized helper lowered inline emits no such call. The implementation also keeps the packed emitter's register reservations separate. This is a deliberately small form of register allocation. It needs neither a whole-program graph nor a register assignment pass over all native instructions.

~~~text
function tape
    -> count uses, identify calls, stores and entry-path accesses
    -> select forwarded definitions, a cached receiver and fixed local homes
    -> emit each operation using those choices
    -> release the per-function planning data
~~~

LLVM supplies a useful reference for three ideas here. A single-use intermediate can disappear during instruction selection, a reusable load requires proof about memory and control flow, and keeping live values in registers requires accounting for clobbers. Our measurements identify the machine effects recovered by Typed. They do not attribute LLVM's complete 136-byte reference output to these three changes. Typed still has a framed scalar function, its own structured branch lowering, and explicit language checks. The earlier PICOCALC-SHADOW-LLVM study is the point of comparison for that disassembly.

## What an instruction trace can establish

We ran identical application source through each policy and executed the emitted image in an instrumented RV32 interpreter. The opening image digest agreed across all five treatments. Inside the shadow function the combined treatment lowered the dynamic instruction count from 5,428,633 to 4,232,582. Direct stack loads fell from 1,288,258 to 393,098 and direct stack stores from 647,710 to 233,145. A stack access in these counts is a direct load or store addressed through the stack pointer. It does not include scene payload traffic.

The most informative check is an exact equality. The capacity policy reduced header loads from 264,928 to 19,477. The difference of 245,451 is precisely one saved instruction for each access after the first per invocation in this workload. All 264,928 bounds tests remained. The complete native image shrank from 10,268 to 9,540 bytes. These counts describe the opening scene and this compiler configuration. Instruction counts alone cannot determine cycles because loads, branches and instruction fetches have different costs on the physical processor.

## Experimental design

The control already uses the earlier guarded-return and packed empty-packet optimizations. We compared forwarding alone, capacity alone, both together and both with fixed local homes. The last two arms isolate the incremental effect of fixed homes. The host suite compared all eight switch combinations against Wasm across 2,304 cases, including traps and memory contents. A function that writes a cell and later traps must leave the prior write visible. Comparing only return values would miss that error.

On the ESP32-P4 the runner first verified the prior firmware, installed a diagnostic image and timed the compiled applications. Each physical block included multiple policies with rotated order. The benchmark checked predicate results, depth and material planes, and frame pixels outside the timed region. Isolated predicate trials count processor cycles per call. Complete frame trials measure elapsed microseconds until the image is in memory. Display transfer is outside that interval. Cold compilation measures yet another activity, the work the P4 performs to generate the guest image.

## Reading and reproducing the measurements

Start in `picocalc-os/worlds/raytrace/raytrace.typed` with the floor visibility predicate. Follow a checked buffer operation to `NumericFunctionEmitter.codeUnitAddress` in `picocalc-os/compiler/typed-wasm.js`. Then open `planLocations`, `FunctionCode.step` and the local access helpers in `picocalc-os/compiler/typed-rv32.js`. At each step ask which values the current operation consumes and which subsequent instructions must observe the same value.

The native API accepts a fourth options argument. The following example selects the final treatment. The imported functions and source limit come from the calling application.

~~~js
const image = typedRv32.compile(source, imports, maxSourceLength, {
    inlineGuardedReturns: true,
    pieLoops: "pie-empty",
    operandLocations: { forward: true, capacity: true, homes: true }
})
~~~

Ticket scripts 01 and 02 build the board treatment images and host instruction profiles. Script 03 drives the differential oracle. Script 04 imports the captured board visit, checks image identity and verifies that each expected fixture and block appears exactly once. Script 06 loads the retained rows into a fresh trace REPL session and installs the functions in script 05. To reproduce the statistics from the committed rows, run `python3 scripts/06-repl.py` from the ticket with the trace service listening on port 3795. The session supports questions such as these.

~~~js
compare("pred", "default", -1, "homes")    // cycles per shadow call
compare("frame", "default", 0, "homes")   // microseconds per complete frame
compare("compileUs", "0", 0, "homes")    // microseconds to compile the ray source
sceneEffects.map(s => [s.name, s.savedPct, s.wins])
~~~

Each comparison matches observations by block. The control and candidate columns are medians of their own observations. Percentage saved is the median of six within-block percentage changes, so rounding and pairing can produce a slightly different number from dividing the displayed medians. Negative savings indicate an increase in cost.

## Physical results and the remaining gap

| Native policy | Shadow cycles/call | Opening frame, ms | Paired frame time saved | Primary stage, ms | Ray compile, ms |
|---|---:|---:|---:|---:|---:|
| Previous Typed control | 382.21 | 53.034 | — | 15.790 | 298.272 |
| Forward | 323.75 | 48.572 | 8.41% | 14.607 | 404.327 |
| Cache capacity | 356.72 | 51.528 | 2.88% | 15.780 | 402.447 |
| Forward and cache | 301.08 | 47.428 | 10.57% | 14.630 | 404.404 |
| Forward, cache and use fixed homes | 276.98 | 46.052 | 13.17% | 13.993 | 409.746 |

Forwarding produced the largest standalone improvement. Capacity caching shaved 6.62% off the natural shadow predicate and had little effect on primary intersections. That contrast is what the eligibility rule predicts. A read-only predicate can hold a stable capacity while the primary stage writes its results. The full policy improved every measured frame in each of twelve poses. Their paired median savings ranged from 12.93% to 13.46%. The chess holdout's fixture 0, advanced path, improved by 2.72% across six paired blocks. A holdout with one algorithm gives limited evidence for other applications.

The checked C reference took 135.68 cycles per shadow call on this visit, so the optimized Typed predicate still required about 2.04 times its cycles. The complete optimized scalar C renderer produced the opening frame in 7.722 ms. Typed took 5.96 times as long. The two ratios have different denominators. The checked predicate reference uses the flat representation for a close code-generation comparison. The complete C renderer includes all stages and its native data representation. A gap in whole-frame time cannot be assigned entirely to shadows.

Cold ray compilation took 111.47 ms longer, a 37.36% increase. All five ray treatments reported the same allocator high-water mark of 851,168 bytes. That measure describes the maximum over the measured compiler lifetime. A temporary allocation below an earlier high-water mark can still cost time. On the opening scene the extra compilation time is recovered after approximately 16 rendered frames at the two median frame times. This calculation assumes one compilation, repeated rendering and no change in the rest of the application. For a developer recompiling on each edit, the extra tenth of a second remains directly visible.

## Where to spend the next experiment

The close agreement in compile time for forwarding alone and forwarding plus caching suggests that discovering the facts is a substantial shared cost. The current planner decodes a numeric tape into operations, constructs maps and counts reads, even for policies with modest needs. Time these steps individually. Then try collecting local reads, writes and the first mandatory receiver as the frontend emits the tape. Feed those facts to the existing location interface and require identical module bytes. That experiment can test a reduction in cold cost without changing the generated program.

There are two practical restrictions to keep in view. The current fast eligibility screen searches the raw tape for the checked-address opcode. An immediate can contain the same integer, so some unrelated functions can enter planning. Decisions about checked operations use decoded boundaries. Also, the heuristic gives every loop the same static weight. A cold loop can displace a value used frequently on a short path. The existing per-address profile can test that explanation by identifying which remaining stack slots account for the most dynamic reads and writes.

For this reason the three switches remain opt-in. A real ray application with repeated frames has a measured reason to enable them. A general firmware default needs cold measurements across interactive applications. The central result is that a shared local-access interface gave the compiler a place to express all three decisions while preserving observable Typed behavior, and a board trial separated their individual benefits from the recurring cost of running the planner.
