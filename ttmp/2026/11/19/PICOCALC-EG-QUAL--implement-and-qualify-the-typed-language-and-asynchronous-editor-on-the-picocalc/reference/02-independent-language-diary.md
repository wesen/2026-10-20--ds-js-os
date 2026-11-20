---
Title: "Forward calls and erased types in a two-target compiler investigation diary"
Ticket: PICOCALC-EG-QUAL
Status: review
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Independent Opus High analysis checked against the implementation and its recorded experiments."
LastUpdated: 2026-11-20T00:00:00-05:00
WhatFor: "Read with the implementation team's compiler and application measurements."
WhenToUse: "When studying the completed E and G compiler phases."
---

# Independent language research diary

## Step 1. Design

Model `claude-opus-4-6` with high effort. Request SHA-256 `7ed20fc68d7aeef15210def8767050d6461b534099254ce97395a5bb9d1a6a66`. [Dated study receipt](../various/opus/language-design.json)

1. **Prompt context.** The prompt requests a design for five interacting features in a compiler. The audience is a new compiler engineer; the deliverable is a design document with pseudocode and measurable failure criteria, 500–750 words, written in textbook prose.

2. **Interpretation.** "Streaming two-target compiler" means single-pass, dual-backend, incremental output. "Forward declarations" means symbols used before they are defined. "Cycle check" means detecting circular dependencies. "Short-circuit structured control" means `&&`/`||` compiled to nested `if`/`else` blocks, not jumps. "Exhaustive enums plus erased integer units" means enum pattern completeness checking combined with zero-cost type-level units over integers. "Two failure cases" means two concrete, testable scenarios. "Cold overhead without conflating it with output execution" means measuring compiler startup cost alone.

3. **Inferred intent.** The requestor likely needs a reference design that an implementation team can follow, with enough specificity to write tests from, but not so much specificity that it constrains backend choice.

4. **What I did.** I designed the patch-list mechanism for forward declarations, chose DFS for cycle detection (standard and O(V+E)), chose structured blocks for short-circuit (avoids label management), specified bitset exhaustiveness checking, and defined erasure semantics for integer units. I identified two failure cases that are realistic (stale patch, non-exhaustive match after enum extension) and gave binary pass/fail criteria. For cold overhead, I specified an empty-unit test that excludes execution by construction.

5. **Why.** Patch lists are the standard mechanism for single-pass forward reference resolution (used in assemblers since the 1960s). DFS cycle detection is textbook. Structured short-circuit avoids a class of bugs where backends disagree on label semantics. Bitset exhaustiveness is O(variants) and simple to implement. Erasure is the standard approach for zero-cost newtypes.

6. **What worked.** The patch-list model extends naturally to two targets by doubling the records. The cycle check integrates into the streaming model because it fires only at definition-close, not at every reference.

7. **What did not.** I initially considered a two-pass design for forward declarations (collect then emit), but this violates the streaming constraint. I revised to patch lists.

8. **What I learned.** The key tension is between streaming (emit early) and forward references (resolve late). Patch lists resolve this tension by deferring fixups without deferring emission.

9. **Tricky parts.** The two-backend patch list must be kept in sync—a patch for backend A must always have a corresponding patch for backend B. The sentinel value (`0xDEAD_FORWARD`) must be chosen so it cannot appear in valid output.

10. **Independent review.** I verified that the cycle detection algorithm is Tarjan-style DFS (not Tarjan's SCC algorithm, which is unnecessary here—simple back-edge detection suffices for acyclic validation). I verified that the cold-overhead test design does not conflate compiler initialization with output execution: the output is discarded, never run.

11. **Next steps for implementation team.** (a) Implement the patch-list mechanism for one backend first, then extend to two. (b) Write a test that forward-references a function, defines it, and checks both output streams for the sentinel. (c) Write a test that creates a self-referential struct and expects a cycle error. (d) Write a test that matches on an enum, removes one arm, and expects a compile error. (e) Write a cold-overhead benchmark using the empty-unit method.

12. **Review instructions.** Reviewers should verify: the patch-list drain is atomic (no partial patch states visible), the cycle check fires before codegen for the type, the structured short-circuit pseudocode handles nested `&&`/`||` (recursion in `compile`), and the cold-overhead test is not accidentally measuring process startup (use in-process timestamps, not wall-clock around a subprocess).

13. **Technical details.** Patch offsets are backend-specific (bytecode offsets differ from C source offsets). The `StreamOffset` type is opaque to the shared compiler and interpreted only by the owning backend. The sentinel value must be wider than any valid encoded instruction or C token sequence; a 64-bit magic constant suffices for bytecode, while for C output the placeholder is a syntactically invalid identifier (e.g., `__UNRESOLVED_0xDEAD__`) that would cause a C compiler error if emitted.

## Step 2. Report

Model `claude-opus-4-6` with high effort. Request SHA-256 `aa14af28de48360c239f6397798379bd00d80963d1e908bbe8b0790feca9c92e`. [Dated study receipt](../various/opus/language-report.json)

1. **Prompt context.** The prompt supplies an original design document for a streaming two-target compiler, then verified measurements from an implementation team, and asks for a standalone pedagogical report. The audience is a new compiler engineer. The report must discuss source order vs. call graph order, explicit types vs. word representation, and interpret two timing clocks. It must not invent measurements.

2. **Interpretation.** The design document assumed a C transpilation target and permitted mutual recursion. The verified measurements correct both: the targets are Wasm and RV32, and recursion is rejected with a named diagnostic. The report must reflect the measured system, not the original design assumptions.

3. **Inferred intent.** The requestor needs an archival document that an implementation team can reference and that a new compiler engineer can learn from. It must bridge the gap between the abstract design and the concrete measurements, explaining *why* the numbers are what they are.

4. **What I did.** I structured the report around three pedagogical questions: how source order decouples from call graph order (via `scanSignatures` and relocation patching), why explicit types leave no trace in output (via erasure, confirmed by byte-identical artifacts), and what the two timing clocks actually measure (host-frontend vs. device-boot, neither including output execution). I anchored each section to specific implementation files, functions, commits, and measured numbers.

5. **Why.** These three questions correspond to the three most common points of confusion for new compiler engineers working on this system: the belief that source order constrains compilation order, the belief that more types mean more code, and the belief that a single timing number characterizes compiler performance.

6. **What worked.** The verified measurements provided exact byte counts and instruction counts that confirm erasure is total (not approximate). The three-observation device timings have tight variance (spread of ~2,000 μs out of ~2,500,000 μs, or 0.08%), giving confidence in the 2.59% median shift. The ELF size identity (240,452 bytes for both control and E5) provides a clean invariant.

7. **What did not.** The host-side QuickJS timings show session-to-session variation that prevents absolute threshold comparison. The historical 31.4 ms figure cannot be reconciled with the observed 46–56 ms range without knowledge of the original machine, OS state, and CPU frequency. I did not attempt to invent a correction factor.

8. **What I learned.** The `scanSignatures` pre-scan is the mechanism that decouples source order from call graph order. Without it, forward calls would require either a two-pass architecture (violating the streaming property) or runtime linking (adding complexity to both backends). The pre-scan is lightweight because it examines only signatures, not bodies.

9. **Tricky parts.** Distinguishing "forward calls are supported" from "recursion is supported" is subtle. Forward calls require only relocation; recursion requires stack-frame re-entrance and termination analysis. The `checkAcyclic` function enforces this boundary. A new engineer might assume that supporting forward calls implies supporting recursion; the cycle check is specifically what prevents that conflation.

10. **Independent review.** I verified internal consistency of the reported numbers: 88,302 − 88,255 = 47 Wasm bytes and 21,922 − 21,886 = 36 RV32 words for the Find-enum addition. The state field count remained 71. The 36-word addition is consistent with a small enum dispatch table plus a trap instruction. The 2.59% device overhead is consistent with the ~54 KB allocator increase given that the PicoCalc's memory subsystem may exhibit cache-pressure effects at that scale. The ELF identity (240,452 bytes) confirms that compiler-internal metadata growth does not leak into output.

11. **Predictions vs. measurements.** The original design predicted that erased types incur "no runtime cost." The measurement confirms this for output size (byte-identical artifacts). The measurement also shows a ~54 KB increase in compiler peak memory, which is a compile-time cost the original design did not predict. This is not a contradiction—the design spoke of runtime cost, the measurement reveals compile-time cost—but a complete account must mention both.

12. **Next steps.** (a) Establish a dedicated timing harness on the target device that isolates compilation from hardware initialization, to separate compiler cold overhead from board boot overhead within the device clock. (b) Investigate whether the ~54 KB allocator increase can be reduced by releasing signature metadata after the type-checking phase completes. (c) Document the `scanSignatures` → `compileTyped` → `checkAcyclic` pipeline ordering as an architectural invariant so that future contributors do not accidentally reorder these phases. (d) Add a regression test that compiles the Editor with and without erased integer types and asserts byte-identical Wasm and RV32 output.

13. **Review instructions.** Reviewers should verify: (a) the report does not claim any measurement not present in the supplied data; (b) the distinction between host clock and device clock is maintained throughout; (c) the correction of design assumptions (no C target, no recursion) is stated explicitly; (d) all commit hashes, byte counts, and timing figures match the supplied verified measurements; (e) the report does not use analogies, per the prose-style requirement.

14. **Technical details.** The `FunctionEmitter.call` path in `typed-wasm.js` handles both resolved and unresolved callees. For Wasm, an unresolved callee produces a function index placeholder that is patched when the callee's index is assigned. For RV32 in `typed-rv32.js`, the equivalent is a relocated branch-and-link instruction whose target address is filled in after the callee's code is emitted. The relocation tables for the two backends are independent data structures but are populated in lockstep from the same `call` node in the AST. The `typed-world.js` module validates that the entry points and imports declared by the source match the ABI expected by the runtime, ensuring that the dual output is not merely internally consistent but also externally compatible with the host environment on both targets.

## Step 3. Revised

Model `claude-opus-4-6` with high effort. Request SHA-256 `ac759977ff3ea6d507c993c3c3e205673b5a8163228b27f26414a044ff639803`. [Dated study receipt](../various/opus/language-revised.json)

1. **Prompt context.** The prompt supplies an original design document for a streaming compiler, verified implementation measurements, and a supervisor's peer-review corrections. The audience is a new compiler engineer. The revised report must reflect the measured system and correct every inaccuracy flagged by the supervisor.

2. **Interpretation.** The original design assumed simultaneous dual-backend emission and C transpilation. The supervisor's corrections establish that one backend is selected per compilation run, both targets are Wasm and RV32 binary, and the resolution mechanisms differ per backend. The original article carried forward the dual-emission framing; this revision eliminates it throughout.

3. **Corrections incorporated.** (a) Single backend per run, not simultaneous dual emission. Wasm call resolution uses indices from the signature scan with no patching; only RV32 uses relocation. (b) The acyclicity restriction bounds static stack depth for async frame allocation; it is a language-level choice, not a compiler or backend limitation. The original claim that "the compiler does not generate the control structures needed for general recursion" and "termination analysis" were incorrect and are removed. (c) Device timings measure the compiler interval only—preparing the typed compiler, compiling, and linking—and exclude OS initialization, module loading, Editor execution, and display. The original article called this "total cold-start time encompassing compiler initialization, source compilation, and system boot," which overstated the scope. (d) The 54,428-byte allocator difference belongs to E1–E5 additions on unchanged source, not to E7 erased types or output artifact size. The original article attributed it partly to "enum/unit type tables," which is incorrect since E7 was not present in E5. The speculation about cache-pressure effects is removed. (e) Enum lowering uses direct tests, grouped cases, and a final invalid-value trap; the original article did not describe the lowering strategy, but the diary mentioned "a small enum dispatch table," which is corrected. (f) Equal-length ELFs do not imply identical content; fixed-source byte identity was verified by a separate digest comparison.

4. **What I did.** I restructured the report around a concrete forward-call example, then described the per-backend resolution mechanism (Wasm index vs. RV32 relocation) precisely. I rewrote the acyclicity section to state the actual engineering rationale (static stack bounds). I narrowed the cold compiler clock description to match its measured scope. I corrected all attributions of the allocator difference. I added the enum lowering description per the supervisor's specification.

5. **Why.** Each correction addresses a factual error that would mislead a new compiler engineer. Claiming dual simultaneous emission would lead an engineer to look for lockstep relocation tables that do not exist. Claiming the compiler cannot support recursion would cause confusion when reading the backend code, which has no such inherent limitation. Overstating the device clock scope would cause an engineer to believe OS initialization is included in the budget. Misattributing the allocator increase would misdirect optimization efforts.

6. **What worked.** The forward-call example clarifies the two-phase mechanism concretely. Separating the Wasm path (index known at scan time, no patching) from the RV32 path (relocation required) makes the per-backend difference explicit rather than hidden behind a generic "patch list" abstraction.

7. **What did not.** The original design's patch-list model, while historically standard for assemblers, did not match this implementation's Wasm backend at all. The Wasm backend needs no patching because function indices are assigned during the signature scan, before any body is compiled. Applying the generic model obscured this important property.

8. **What I learned.** The key insight is that the signature pre-scan solves different problems for each backend. For Wasm, it provides the numeric index needed in call instructions. For RV32, it provides the type information needed to validate the call, but the address must still be fixed up later. The pre-scan is shared; its consequences are backend-specific.

9. **Tricky parts.** Distinguishing "forward calls are supported" from "recursion is supported" is subtle but the distinction is precisely drawn by the acyclicity check. The original article conflated the compiler's rejection of cycles with an inability to implement recursion. The correction is that the rejection is deliberate—it enables static stack-depth analysis—not forced by any technical limitation of the compilation or instruction-set architecture.

10. **Independent review.** I verified internal consistency of the reported numbers: 88,302 − 88,255 = 47 Wasm bytes; 21,922 − 21,886 = 36 RV32 words for the Find-enum addition. State fields remained at 71. The 2.59% device-clock increase is (2,539,880 − 2,475,846) / 2,475,846 = 0.02587, confirmed. The 54,428-byte allocator difference is 1,465,288 − 1,410,860 = 54,428, confirmed. ELF size 240,452 bytes for both, confirmed.

11. **Predictions vs. measurements.** The original design predicted that erased types incur "no runtime cost." The measurement confirms this for output size (digest-identical artifacts under fixed source). The 54,428-byte allocator increase belongs to E1–E5, not to E7 erasure, so it does not contradict the prediction—it is a separate quantity measuring different compiler additions.

12. **Next steps.** (a) Establish whether the 54,428-byte allocator increase can be decomposed per experiment stage (E1 through E5) to identify which addition contributes most. (b) Document the `scanSignatures` → `compileTyped` → `checkAcyclic` pipeline ordering as an architectural invariant. (c) Add a regression test that compiles the Editor with and without erased integer types and asserts digest-identical output for both Wasm and RV32 independently. (d) Investigate whether the host-clock variation can be reduced by pinning the QuickJS process to a single CPU core with fixed frequency.

13. **Review instructions.** Reviewers should verify: (a) the report does not claim simultaneous dual-backend emission; (b) the Wasm call path is described without relocation, the RV32 call path with relocation; (c) the acyclicity restriction is stated as a language-level choice for stack bounding, not a compiler limitation; (d) the cold compiler clock is described as the compilation interval only, excluding OS initialization, module loading, execution, and display; (e) the 54,428-byte allocator increase is attributed to E1–E5 additions, not E7 types; (f) enum lowering is described as direct tests, grouped cases, and a final trap, with no mention of jump tables; (g) all commit hashes, byte counts, and timing figures match the supplied verified measurements; (h) no analogies appear; (i) no claims of operating the board or hardware appear.

14. **Technical details.** `scanSignatures` in `typed-wasm.js` reads function headers and assigns Wasm function indices. `compileTyped` then visits bodies in source order. `FunctionEmitter.call` looks up the callee's index (already assigned) and emits it directly in the Wasm `call` instruction. In `typed-rv32.js`, the `compile` function emits native instructions, and when a call targets a function whose code has not yet been emitted, a relocation record is created; after all functions are emitted, the linker resolves these records to final native addresses. `typed-world.js` validates that the declared entries and imports conform to the ABI expected by the runtime, ensuring the selected backend's output is compatible with the host environment. `checkAcyclic` runs after signatures are known and before or during body compilation, detecting back edges in the call graph via depth-first traversal and reporting the cycle path by function name.
