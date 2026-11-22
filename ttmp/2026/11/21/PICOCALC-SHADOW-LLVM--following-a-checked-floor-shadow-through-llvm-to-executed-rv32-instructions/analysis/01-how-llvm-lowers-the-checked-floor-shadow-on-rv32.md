---
Title: How LLVM lowers the checked floor shadow on RV32
Ticket: PICOCALC-SHADOW-LLVM
Status: complete
Topics:
    - compiler
    - performance
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-rv32.js
      Note: Current checked address and local lowering
    - Path: repo://ttmp/2026/11/21/PICOCALC-SHADOW-LLVM--following-a-checked-floor-shadow-through-llvm-to-executed-rv32-instructions/scripts/04-trace.py
      Note: Per-PC comparison of on-device kernel bytes
    - Path: repo://ttmp/2026/11/21/PICOCALC-SHADOW-LLVM--following-a-checked-floor-shadow-through-llvm-to-executed-rv32-instructions/scripts/05-cells.js
      Note: Queries executed against the verified pass archive
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T18:16:20.224077435-05:00
WhatFor: ""
WhenToUse: ""
---

# Following a checked buffer read from LLVM IR to the PicoCalc

The earlier PicoCalc experiment measured 135.74 **cycles per floor query** for a checked C function compiled by GCC. A query tests whether one of three spheres blocks the light reaching a floor pixel. The corresponding Typed JavaScript program took 382.22 cycles with the preceding guarded-return optimization. Can we identify which compiler decisions account for that remaining difference?

We rebuilt the exact checked-layout comparison, included Clang/LLVM for the first time in this predicate experiment, and measured all three together on the ESP32-P4. GCC took **136.66**, LLVM **144.31**, and Typed **382.25 cycles per query**. Their function bodies occupied **338**, **334**, and **1,060 bytes** respectively. This was scalar code. All three programs read the same scene fields and returned the same answers. The experiment exposes two substantial sources of extra work in Typed: repeatedly retrieving local operands from its stack frame and repeatedly fetching the buffer length. It also permits a separate measurement of the bounds checks themselves.

## Follow one buffer access

Consider the expression that reads the light direction from cell 17. A Typed buffer starts with a four-byte capacity followed by unsigned two-byte elements. Evaluating the expression involves the buffer pointer, the requested index, the capacity and the element value. The CPU ultimately needs to load the value at byte offset 38, because the header occupies four bytes and seventeen preceding cells occupy 34.

~~~text
index = 17
capacity = load32(buffer)
if unsigned(index) >= capacity: trap
lightX = zeroExtend(load16(buffer + 4 + 2*index)) - 32
~~~

A second read from the same buffer may need its own comparison. It can reuse the earlier capacity if the first load reaches it on every path and no intervening operation can change that capacity. For example, a buffer long enough to read position 17 may still be too short to read position 18. Reusing the capacity keeps both tests meaningful. Knowing that position 19 was already checked can separately prove that position 16 is valid.

These distinctions matter in our source. A shadow query reads four fixed cells containing the light parameters and the sphere count. For each sphere the code then tests the two axes of its projected bounding rectangle. An X rejection skips the Y test, and either rejection skips the exact intersection. The costly exact path remains necessary for a smaller set of pixels. Moving or combining arbitrary reads across these branches could introduce a trap on a path that previously skipped them. The measurement uses the original short-circuit traversal. [Checked C kernel used in the experiment](../various/native/kernel.c) · [Typed source](../../../../../../picocalc-os/worlds/raytrace/raytrace.typed)

## What the trace REPL shows

The host service opened the actual compiler dumps for this kernel. Each of two language modes has 172 middle-end and 112 backend snapshots. The middle end transforms a typed intermediate representation, or IR. The backend selects instructions for the target and assigns physical registers. The service verifies a digest of each dump stream before accepting queries. An event reference includes that digest, its original ordinal and byte offsets. This makes an answer traceable to a particular compiler invocation.

| Observed stage in LLVM 18.1.3 | What changed in this compile | Why it matters |
|---|---|---|
| Middle 5 → 6, SROA | 18 local stack-object declarations became zero; nine phi instructions appeared | Locals become values. A phi selects the incoming value for a control-flow edge, for example the loop index on initial entry or on a repeat. Physical register assignment comes later. |
| Middle 17, GlobalOpt | The internal source name checked_shadow became the exported kernel symbol | A query about earlier passes uses the original name. Later queries use kernel. This rename tracks the experimental wrapper’s alias. |
| Middle 73, inlining | All twelve calls to the small checked-read helper disappeared from the caller. Twelve i32 capacity-load sites became visible there. | The optimizer can now see common work across separate accessor invocations. Before inlining those reads were inside the accessor. |
| Middle 77 → 78, EarlyCSE | The twelve capacity-load sites fell to one. The total count of branch instructions stayed at 20. | The earlier capacity value supplies later comparisons. This pass accounts for the eliminated reloads. |
| Middle 79 → 80, jump threading | The function's total branch count fell from 20 to 17 | Later control-flow simplification is distinct from the earlier load elimination. A static branch total includes loop and lighting decisions as well as checks. |
| Backend 12, loop strength reduction | The final loop advances addresses for the box and geometry records by 8 and 10 bytes | Consecutive iterations reuse address computations. A backend run with strength reduction disabled tests this intervention. |
| Backend 69–74, register allocation and rewriting | The machine property NoVRegs became true at 74, on the second virtual-register rewriter in this pipeline | Promoted values have physical locations by this point. The machine code and its execution counts show which values actually visit the stack. |

For the capacity query we select loads by their pointer's identity as function argument zero. This survives renaming of the printed local variables. These are working commands for the retained session, whose setup already binds M to the kernel’s middle timeline and headers to that capacity-load metric.

~~~javascript
[77, 78].map(i => ({
  ordinal: i,
  capacityLoads: q.run(headers.at(M.at(i).after)).value
}));
// [{ordinal:77, capacityLoads:12}, {ordinal:78, capacityLoads:1}]

q.run(run.events("middle").where(e => e.ordinal === 78)
  .select("ordinal", "pass", "ref")).rows;
~~~

SROA identifies promotable local storage, then calls PromoteMemToReg with dominance information. A computation dominates a later one when all paths reaching the later computation have passed through the earlier one. EarlyCSE walks that structure, looks up an available load by its pointer, and checks whether it can reuse the value across intervening memory effects. In this read-only predicate a single buffer-header load qualifies. The implementation replaces uses of a redundant load and deletes it. These source-level mechanisms agree with the transition captured in the REPL. [SROA source](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/Scalar/SROA.cpp#L5292) · [EarlyCSE’s load handling](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/Scalar/EarlyCSE.cpp#L1580) · [Saved REPL queries and responses](../various/repl.json)

## Where the instructions went

We extracted the relocated predicate bytes from the very ELF tested on the board, placed each body at a known address in a standalone RV32 executable, and ran it under QEMU on the 19,477 opening floor pixels. The harness compared every returned boolean to its frozen expected value. Only instruction addresses inside the predicate count towards the table. The total for Typed independently reproduces the preceding full-frame interpreter’s count exactly. The board timed the same coordinate stream using a common indirect caller. Its timer includes that caller; the guest counts in the table do not.

| Over all 19,477 queries | GCC | LLVM | Current optimized Typed |
|---|---:|---:|---:|
| Executed predicate instructions | 2,153,398 | 2,330,571 | 5,428,633 |
| Direct stack loads and stores | 233,724 | 311,632 | 1,935,968 |
| Loads of the capacity word | 19,477 | 19,477 | 264,928 |
| Loads of actual halfword elements | 264,928 | 264,928 | 264,928 |
| Comparisons branching to or over a bounds trap | 245,451 | 224,142 | 264,928 |
| Physical cycles per opening query | 136.66 | 144.31 | 382.25 |

A stack access here means an executed load or store addressed directly through the stack pointer. LLVM saves eight callee-saved registers on entry and restores them on exit. Sixteen accesses times 19,477 queries accounts for **all 311,632**. The hot loop itself has no direct stack traffic. GCC spends twelve such accesses per query along the measured paths. Typed averages about 99.4. Its ordinary backend keeps a handful of expression operands in registers but gives named locals frame slots. Its checked-access lowering reloads the index and receiver from their slots, loads the header, compares, then computes the element address. Constant-index materialization can itself involve storing a constant to a local and immediately reading it back. The linked instructions show this even for the literal index 19. [Typed lowering, case 0xf1](../../../../../../picocalc-os/compiler/typed-rv32.js#L229) · [Actual Typed instructions](../various/native/typed-linked.asm) · [Actual LLVM instructions](../various/native/llvm-linked.asm)

The subtraction is informative. Typed executes 3,098,062 more instructions than LLVM inside the predicate. The excess direct stack operations account for 1,624,336 instructions and the excess header loads account for 245,451. Together these disjoint categories explain **60.35% of the dynamic instruction difference**. They do not determine a percentage of elapsed cycles. Even after the length is reused, LLVM still executes 224,142 bounds branches. It saves 40,786 such branches relative to Typed while performing exactly the same number of payload reads. The trace distinguishes all three quantities.

## Which LLVM decisions matter on this processor?

We compiled the same optimized IR through different backend configurations and called each from one firmware image. Six timing blocks rotated arm order. Twelve scenes used their natural floor streams. Four extra one-sphere cohorts separated X rejection, Y rejection, exact misses and hits. Each arm checked every return before timing. That produced 576 physical batches. The opening row in the table reports the median cycles per call; each percentage uses the median of six within-block changes against standard LLVM.

| Compiler configuration | Opening cycles/query | Change vs. LLVM | What was varied |
|---|---:|---:|---|
| GCC as used by the board harness | 136.66 | −5.52% | Separate optimizing compiler, checked C layout |
| LLVM optimized backend | 144.31 | baseline | Optimized IR, normal loop reduction and register allocation |
| LLVM without loop strength reduction | 150.13 | +3.92% | Disabled the backend’s LSR pass |
| LLVM fast register allocation pipeline | 276.70 | +91.64% | Selected fast allocation and disabled the optimized allocation pipeline |
| LLVM with wrapping signed arithmetic | 144.27 | −0.02% | Recompiled the source with -fwrapv |
| Typed with guarded returns enabled | 382.25 | +164.76% | Existing Typed compiler and unchanged app source |

The allocation comparison is the strongest evidence. Both LLVM allocation configurations share the same optimized IR, load the capacity once per call, and execute exactly the same 264,928 element reads. The fast configuration executes 2,454,609 direct stack operations versus 311,632 for the normal backend. Its cost rises by 132.39 cycles per opening query. The fast configuration changes the allocation pipeline, including associated machine passes; this experiment does not isolate one heuristic inside the greedy allocator. LLVM’s fast allocator works at basic-block scope. Its greedy allocator can split live ranges and select locations across blocks. A live range spans the points over which a value must remain available. [LLVM register allocation documentation](https://llvm.org/docs/CodeGenerator.html#built-in-register-allocators) · [Greedy allocation implementation](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/CodeGen/RegAllocGreedy.cpp#L2410)

Loop strength reduction shows a different tradeoff. Disabling it reduces stack operations to 194,770 but raises executed instructions from 2,330,571 to 2,413,344. Natural opening time rises 3.92%. On the isolated X-rejection path, disabling LSR actually improves time from 86.01 to 77.52 cycles. The natural workload examines several spheres on most calls, so address recurrence has more opportunity to repay setup. Across the twelve natural scene medians, disabling LSR costs 0.33–5.64%. A rule that simply minimizes the count of stack operations would select the wrong natural-loop configuration here. [Normal LLVM assembly](../various/native/llvm.s) · [LSR-disabled assembly](../various/native/nolsr.s) · [LLVM formula selection](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/Scalar/LoopStrengthReduce.cpp#L5218)

Signed arithmetic makes one instructive difference. The wrap build changes the two bounds-rectangle magnitude comparisons from unsigned bltu to signed blt. These compare the geometry, distinct from the buffer bounds traps. All dynamic instruction counts agreed on these scene inputs and measured times were nearly identical. That observation cannot establish equivalence on arbitrary integers. In particular, a Typed compiler must handle negation of the most negative integer according to its own wrapping rules. Likewise, the GCC and LLVM controls use a common trap for a bad index. The experiment compares valid pixels; it does not prove preservation of every possible first failing source operation in a Typed rewrite.

## What to build in Typed

I would start with two independently selectable experiments. The first is small and the expected effect on the actual instruction trace is precise. Reuse a read-only buffer’s length, beginning at its first already-required check, when the same receiver and a still-valid capacity value reach a later check. Keep the unsigned index tests and their source order. Kill or reconcile the value at assignments, unknown effects and joins that do not establish the same fact. On this exact workload the ideal target is 19,477 capacity reads and 264,928 payload reads, eliminating 245,451 header loads. Whether a dedicated register is worth its pressure is an empirical question.

The second has greater measured upside. Give the checked-address operation direct register operands for receiver and index, pass the result directly to the consumer, and retain selected values across basic blocks. Begin with the buffer pointer, the light parameters and loop induction values. Charge each saved register at function entry and exit, and count extra moves and spills. The implementation can remain function-local. The test should compare capacity reuse alone, register forwarding alone, both together and the frozen control. The same board harness and the independent per-PC oracle can distinguish an improvement in a hot loop from merely moving work into its prologue. A loop-address recurrence is a worthwhile subsequent experiment once the first two changes have been isolated. Neither a production compiler change nor a new full-frame speedup is claimed by this study.

## Repeat the analysis in the running REPL

The final saved session is on 127.0.0.1:3795. The commands below use the live VM seeded by the study driver. The JS file in the ticket contains every initialization and query. To rebuild the session, launch the server with scripts/03-serve.sh, then run scripts/06-repl.py. Regenerating the board capture is optional for replaying the committed evidence.

~~~javascript
paired("default", -1, "llvm", "fastreg"); // natural floor stream
paired("default", 0, "llvm", "nolsr");    // one sphere, rejected on X
[census.typed.totals.dataLW, census.llvm.totals.dataLW];
~~~

For a fresh capture, scripts/01-capture.py takes a scratch directory and emits the versioned pass archive. To regenerate the original scene masks and Typed image, run the preceding shadow ticket’s scripts/board/01-images.mjs with --candidate. With ESP-IDF 5.4.2 active, scripts/02-board.py stages a new project from those inputs and the compiled objects; run idf.py set-target esp32p4 and idf.py build inside it. The preceding ticket's board runner verifies the playable image before and after the diagnostic. scripts/04-trace.py takes the diagnostic ELF, the fixture directory and a fresh host-trace directory. scripts/07-board-results.py imports a completed board visit. The REPL needs only the compact archived inputs, so it never rereads the large temporary QEMU logs. [Exact JS cells](../scripts/05-cells.js) · [REPL driver](../scripts/06-repl.py) · [Incoming and restored firmware identities](../various/device/receipt.json)
