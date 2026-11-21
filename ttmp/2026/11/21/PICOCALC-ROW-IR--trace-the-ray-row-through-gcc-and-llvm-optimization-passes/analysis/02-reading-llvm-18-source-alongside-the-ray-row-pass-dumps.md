---
Title: Reading LLVM 18 source alongside the ray-row pass dumps
Ticket: PICOCALC-ROW-IR
Status: complete
Topics:
    - picocalc
    - compiler
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/scripts/09-archive-llvm.py
      Note: Unfiltered middle and backend capture
    - Path: repo://ttmp/2026/11/21/PICOCALC-ROW-IR--trace-the-ray-row-through-gcc-and-llvm-optimization-passes/scripts/10-read-pass.py
      Note: List or extract pass instances
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T08:09:00.978929976-05:00
WhatFor: ""
WhenToUse: ""
---
# Reading LLVM 18 source alongside the ray-row pass dumps

The checked ray row asks to read a 16-bit buffer element, compute a 32-bit difference, and conditionally update a depth. LLVM has to decide which values need storage, which expressions can be reused and which registers will carry the next iteration's addresses. This reading follows the implementation of those decisions in upstream LLVM 18.1.3, commit `c13b7485b87909fcf739f62cfa382b55407433c0`. The captures come from Ubuntu's LLVM 18.1.3 binaries. A matching upstream release gives us a precise code reference, although distribution builds can contain patches.

## What was captured

The original capture applied LLVM's function-name printer filter. The second capture removes that filter and records the entire chosen pipeline for each input. The middle-end stream combines the new pass manager's debug log and its after-pass printer at the pass's natural scope. The backend stream records the RV32 code generator's after-pass printer, from its remaining LLVM IR work through machine passes. An analysis can run without producing transformed IR. A pass can also produce the same state as its predecessor. Count each printed instance as one snapshot.

| Input | Middle-end snapshots | Backend snapshots |
|---|---:|---:|
| Complete firmware renderer translation unit | 2,061 | 1,450 |
| Checked row control | 195 | 116 |
| Unchecked row control | 195 | 116 |

All 4,133 headers and byte offsets are indexed. These files cover our three inputs, optimization level and targets. Other LLVM optimization levels, architectures, link-time pipelines and optional passes would constitute other experiments. The ticket preserves the initial and optimized modules and machine snapshots as well as the full compressed pass logs. The record of which passes belong to the default middle-end pipeline begins in the release's pipeline builder. [LLVM pipeline construction](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Passes/PassBuilderPipelines.cpp#L1493)

To find one snapshot, run `python3 scripts/10-read-pass.py checked middle SROAPass` from the ticket. It prints ordinal numbers and headers. Repeat with `--entry N` to emit one indexed snapshot. For a backend example use `python3 scripts/10-read-pass.py checked backend 'Virtual Register Rewriter' --entry 78`. The middle-end output can include pass-manager messages between snapshots.

## How a local becomes an SSA value

A point in a control-flow graph **dominates** another point if every path from entry to the second passes through the first. Suppose the ray loop writes `x = 0` on entry and computes a new `x` on each backedge. At the loop header either definition can reach the next read. A phi instruction records which incoming edge supplies the value. LLVM can then replace a memory load of `x` with an ordinary use of that SSA value.

SROA first examines the uses of a local allocation and can partition that storage into independent slices. Its promotion phase passes eligible allocations to `PromoteMemToReg`. The promotion implementation handles simple cases first. For the general case it collects defining and live-in blocks, computes an iterated dominance frontier restricted by liveness, places phis and renames loads and stores as it visits the control-flow graph. Liveness keeps a join from acquiring a redundant phi for a value nobody will read. This is a direct code connection to the dominance-frontier method in the SSA literature. In our checked row, the first SROA pass took the row from sixteen local allocations and zero phis to zero allocations and three phis. That observation identifies the result of the pass; it does not identify which internal fast path handled every local. [SROA promotion](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/Scalar/SROA.cpp#L5292) · [LLVM's phi placement and renaming](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/Utils/PromoteMemoryToRegister.cpp#L812) · [Cytron and colleagues on SSA construction](https://cs.brown.edu/research/pubs/techreports/reports/CS-91-21.html)

## How two checks can share a length

The controlled C program expresses an element access as a call to a small helper. Inlining exposes the capacity read and trap branch at each call site. LLVM's inliner visits calls in its call-graph processing unit, asks its advisor about the call, and attempts to inline an accepted candidate. Immediately after the observed inline pass our row has eleven direct header loads and eleven trap sites. Sharing a capacity requires another proof: the previous load must dominate this use and the relevant memory must still contain the same value. [LLVM's inlining decision](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/IPO/Inliner.cpp#L355)

EarlyCSE walks the dominator tree with scoped tables of available expressions and loads. For a candidate load it looks up a prior value under the pointer operand and tests compatibility. The memory test first compares generation numbers. When those differ, a pass instance configured with MemorySSA can query intervening memory definitions. If the proof succeeds, EarlyCSE replaces uses of the later load and deletes it. Reading the header followed by a second read on a dominated path can therefore reuse the first result. A write that might change the header breaks that simple argument. The checked row drops from eleven to six static header-load sites at the measured early-CSE boundary. This count does not establish which MemorySSA queries ran. [Scoped processing and load reuse](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/Scalar/EarlyCSE.cpp#L1578) · [Memory-generation test](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/Scalar/EarlyCSE.cpp#L1131)

## How an index becomes two incremental pointers

The expression `input + 2*x` takes the values `input`, `input+2`, `input+4`, and so on. Scalar Evolution represents such a sequence as an *add recurrence* associated with a particular loop. The initial value and step are part of the representation. This allows LLVM to recognize relationships among the input address, depth address and pixel counter even when the source wrote separate expressions. [Scalar Evolution recurrence construction](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Analysis/ScalarEvolution.cpp#L3646)

LLVM's loop strength reducer performs a search. It generates alternative formulas for uses, considers whether formulas can share registers, and narrows that candidate set with heuristics. The recursive solver builds a partial solution, rates the next formula in the context of registers already selected, and continues a branch when its cost can improve the best solution. The implementation then rewrites the program using the chosen formulas. Introducing one running pointer can reduce per-iteration arithmetic and extend a live range. Introducing a second pointer costs another register. This is why choosing a formula for each use independently can give an unnecessarily expensive loop. [Formula generation, pruning and rewrite](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/Scalar/LoopStrengthReduce.cpp#L5936) · [Recursive cost comparison](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/Scalar/LoopStrengthReduce.cpp#L5136)

The measured checked loop carries a counter incrementing by one and two address values incrementing by two. Turning off loop strength reduction in an otherwise matched LLVM code-generation pipeline increased execution from 1,233,611 to 1,275,560 instructions across the 160 inputs. For the unchecked pair the effect was larger, 632,124 versus 798,350. The code explains the family of choices; these pass-off runs quantify the net benefit of the choice within this pipeline.

## When a scalar loop stays scalar

A vectorizer needs two decisions. **Legality** asks whether operations from adjacent iterations may execute together. A store that changes a future iteration's input can defeat that proof. **Profitability** asks whether a legal vector plan improves the target cost after setup, masking and remaining scalar work. LLVM's vectorizer checks loop structure and memory legality, builds candidate vectorization plans and selects a vectorization factor. A factor of one corresponds to scalar execution. Our ordinary RV32 target produced scalar instructions. Its diagnostics did not identify a specific failed check, so the source code identifies questions the algorithm asks rather than a failure reason for this particular loop. The Espressif GCC dump independently records concrete rejection reasons for its own firmware compile. [Legality checks](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/Vectorize/LoopVectorizationLegality.cpp#L1434) · [Plan and factor selection](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Transforms/Vectorize/LoopVectorize.cpp#L7418)

## How a value gets a physical register

A **live interval** describes the positions at which a value must remain available. Overlapping live values can compete for the same physical register. LLVM's greedy allocator first tries an assignment and can consider eviction, splitting a live interval into smaller pieces, recoloring other assignments, or spilling. These choices are subject to stage and cost restrictions. Splitting can keep a pointer in a register inside a hot loop while treating the region outside it differently. The virtual-register rewriter subsequently uses the assignment map to replace virtual operands with physical registers. The output alone cannot tell us that a particular difficult fallback such as eviction actually occurred. [Greedy allocation decision path](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/CodeGen/RegAllocGreedy.cpp#L2410) · [Operand rewriting](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/CodeGen/VirtRegMap.cpp#L535) · [The allocator author's account of live-range splitting](https://blog.llvm.org/2011/09/greedy-register-allocation-in-llvm-30.html)

The RISC-V target configures split allocation with an RVV-specific step before ordinary optimized allocation. RVV is the standard RISC-V vector extension; Espressif PIE is a different instruction set. Even our scalar row has two rewriter headers in the trace. At checked backend entry 74, names such as `%33` still occur at function entry. At entry 78 the header declares `NoVRegs` and the live-in operands are physical registers. The first `-stop-after=virtregrewriter` snapshot in this study captured the earlier occurrence. Use `-stop-after=virtregrewriter,1` for the second. I verified its empty virtual-register table and retained both artifacts. The earlier dynamic counts came from the final executables. [RISC-V split allocation configuration](https://github.com/llvm/llvm-project/blob/llvmorg-18.1.3/llvm/lib/Target/RISCV/RISCVTargetMachine.cpp#L428)

For the PicoCalc, the most immediate experiment is to keep an induction value and one or two proven addresses in registers across the loop body. The captures supply three independent tests of such a policy: whether the representation discovers the recurrence, whether the backend actually carries the selected values in registers across the backedge, and whether doing so reduces executed instructions at fixed traversal. A hardware measurement would then determine whether the saving justifies extra on-device compile cost.
