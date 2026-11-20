---
Title: "A compiler proof of the values that survive a wait investigation diary"
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

# Independent continuations research diary

## Step 1. Design

Model `claude-opus-4-6` with high effort. Request SHA-256 `33301ceb7a2dc1f52347c49e728f8ed009e4baf164ef393be830aa55a57f82e2`. [Dated study receipt](../various/opus/continuations-design.json)

1. **Prompt context.** The prompt requests a compiler design for a "typed handheld language" in an empty working directory named `picocalc-eg-wave`. I interpret "handheld" as a PicoCalc-class device with severe memory constraints. The word "resumable" in conjunction with "handheld" strongly implies the compiler itself must be interruptible—not merely that the compiled programs are resumable.

2. **Interpretation of "ambient event-time buffers."** No standard term. I infer ring buffers that are written during event dispatch (ISR or event-loop tick) and consumed at explicit yield points. "Ambient" means they are part of the lexical environment, not passed as arguments. This creates an unusual dataflow: writes are externally timed, reads are program-timed.

3. **Inferred intent of "nonrecursive calls between asynchronous functions."** The DAG constraint eliminates the need for a general stack. This is critical on a handheld: suspend frames can be statically allocated if the call graph is a DAG. I added a static cycle check in type checking for this reason.

4. **Cancellation and failed starts.** These are two distinct control-flow edges at every async call site. Cancellation means the callee was running and is now killed; failed start means the scheduler could not start it at all (resource exhaustion, priority inversion). Both produce control-flow edges that the CFG must represent explicitly because liveness differs on each.

5. **Liveness subtlety.** The critical insight is that cancel edges must kill callee frame variables. Without this, the suspend frame of the caller will include callee-owned temporaries, wasting memory and producing incorrect code. I wrote the fixpoint pseudocode to make the kill set explicit per edge kind. This is the section most likely to contain bugs in an implementation—the kill sets must be computed from the callee's lowered frame, creating a phase-ordering dependency. I resolve this by requiring that callee frame layout is computed before caller liveness.

6. **Lexical shadowing.** Shadowing a buffer with a different element type is intentionally legal. The diagnostic fixture F2 tests the case where a programmer reads a buffer name after the inner scope closes, expecting the shadowed version. The compiler must track both bindings and warn when the resolution changes across scope boundaries.

7. **Resumability mechanism.** Each phase writes a checkpoint: the parse phase writes (token position, partial AST), name resolution writes the scope stack, etc. On resume the compiler reads the latest checkpoint and restarts that phase. The fixture F6 tests that this produces identical results. I chose hashing the CFG as the simplest correctness check.

8. **What I did not do.** I did not design a register allocator, garbage collector, or linker. These are downstream of the specified scope. I also did not specify the bytecode encoding; the lowering section describes semantics only.

9. **What would not work.** A naive forward liveness analysis would miss the cancel-edge kill sets entirely. A single-pass name resolution without scope-depth tracking cannot produce the F2 diagnostic. A non-checkpointed compiler would need to restart from scratch after every interrupt, which on a 10 MHz device parsing a 4 KiB source file could mean visible latency.

10. **Independent review notes.** A reviewer should verify: (a) the liveness transfer function handles all three edge kinds; (b) the phase-ordering between callee frame layout and caller liveness is acyclic; (c) the checkpoint format is deterministic (no pointer values, no hash-map iteration order); (d) each diagnostic fixture is minimal—no fixture tests two properties simultaneously.

11. **Next steps for implementation team.** Implement fixtures F1–F6 first as failing tests. Build phases 1–3, then the CFG, then liveness with explicit edge kinds. Lowering comes last. The checkpoint serialiser should be built incrementally per phase, not as a monolithic layer. Target: all six fixtures pass with exact diagnostic match before any optimisation work begins.

12. **Technical detail: suspend-frame sizing.** After liveness narrows the live set at each yield point, the frame is the union of all per-yield live sets (since a single frame struct serves all yield points in one function). Fixture F5 checks that this union does not exceed 256 bytes, the maximum DMA-aligned allocation on the target device.

## Step 2. Report

Model `claude-opus-4-6` with high effort. Request SHA-256 `914215d0d358958cdc98506cd56d70bacaf2780f7943a8c10afd7b187014b784`. [Dated study receipt](../various/opus/continuations-report.json)

**1. Prompt context.** The working directory is `/tmp/picocalc-eg-wave/empty`, not a git repository. The prompt supplies an initial speculative design I authored, then a block of verified implementation measurements that contradict several speculative assumptions. The task is to write a standalone report grounded in the verified facts, not the speculation.

**2. Interpretation of the correction block.** The verified measurements explicitly state: no ring buffers bound to lexical scopes, no exception unwinding, no stack copying, no GC for frames, no dynamic coroutine objects. My initial design assumed ring buffers and suspend frames as heap objects. These are wrong. The actual implementation is a source-to-source state-machine transform where all state lives in a flat, persistent WorldState record. I rewrote the entire technical model accordingly.

**3. Inferred intent.** The audience is an implementation team and an intern. The request for "concrete pseudocode and an event example" indicates the report must be practically useful, not abstract. I included a full transform pseudocode and a four-turn event trace.

**4. What I did.** I read the verified measurements line by line and cross-referenced them against my initial design to identify every discrepancy. I then wrote a new report that uses only verified facts. Where measurements are given (e.g., 93.141→34.739 ms), I cite them directly without attributing causation beyond what is stated.

**5. Why I structured the report this way.** The turn model must be explained before the transform, because the transform's output is a function shaped by the turn model. Liveness must follow the transform because it explains which fields the transform generates. The event trace concretizes the abstract transform for the intern. Measurements come after the design because they validate it.

**6. What worked.** Grounding every claim in a specific commit hash, file path, or measured number. The verified block is remarkably precise: "57 declared fields +13 generated =70" leaves no ambiguity. I preserved this precision.

**7. What did not work in the initial design.** (a) Ring buffers bound to lexical scopes — the actual buffers are fresh per-turn flat views. (b) Suspend frames as heap-allocated structs — the actual frames are fields in a flat WorldState. (c) Resumable compiler with checkpoints — the actual compiler runs to completion within a 6-second deadline on QuickJS; resumability is in the *compiled program*, not the compiler itself. (d) Cancel edges killing callee frame variables — the actual implementation has no callee frame; `start` on an active root returns `false`. (e) CFG hash matching after resume — no such mechanism exists; the compiler is not interruptible.

**8. What I learned.** The term "caller continuation" precisely describes the WorldState `_rp`/`_tk` fields. These are not OS stack frames. The distinction matters because a new compiler engineer might assume "resumable" implies coroutine stacks or setjmp/longjmp. The actual mechanism is simpler: a switch statement re-entered from the top each turn.

**9. Tricky parts.** (a) The 80-word ABI cap is a hard constraint that forces careful liveness: every unnecessary field wastes one of 80 slots. (b) The spare code unit (95) trick for pending title length is ABI field packing, not general-purpose allocation. I described it as stated without over-generalizing. (c) The "byte-for-byte" artifact match claim is strong — it means the async migration is semantically identical to the synchronous original, verified at the binary level.

**10. Distinguishing predictions from measurements.** All timing numbers (28.915 ms, 97.939 ms, etc.) and allocation numbers (2,653,592 bytes) are measurements made on host QuickJS, explicitly not ESP32-P4. I do not predict P4 performance. The report states this boundary three times. The liveness analysis description is structural (derived from code semantics); the fixture tables are measurements (derived from test execution).

**11. Independent review.** A reviewer should verify: (a) the pseudocode transform correctly reflects the state-machine pattern in `typed-async.js`; (b) the event trace is consistent with the token semantics (tokens 1,2,3,4 observed in the 10,000-unit test); (c) no measurement is cited with an unsupported causal claim; (d) the report does not conflate caller continuations (WorldState fields) with OS thread stacks.

**12. Next steps for the implementation team.** The report is complete as a standalone document. If the ABI cap increases from 80 words, the liveness analysis and frame allocation remain correct but could be relaxed. If a new async function is added, `14-check-async-layout.mjs` should be extended with its expected live-set fixture before implementation begins. The 4 MiB heap constraint is the binding production limit; `15-benchmark-quickjs.c` should be run on any change that adds AST nodes or intermediate representations.

**13. Review instructions.** Compare every factual claim in the report body against the verified measurement block supplied in the prompt. Flag any claim not traceable to that block or to structural properties of the described transform. The pseudocode is my own synthesis; verify it against `typed-async.js` before using it as implementation guidance.

**14. Technical detail: why 70 not 71.** The original synchronous Editor used 71 WorldState fields. The async migration produces 57 declared + 13 generated = 70. The difference of 1 is an ABI field comparison. The pending title length now occupies spare code unit 95 of an existing buffer rather than a dedicated field. This is not a claim that the entire lifecycle saves one word of memory; it is a statement about the field layout at the ABI boundary.

## Step 3. Revised

Model `claude-opus-4-6` with high effort. Request SHA-256 `58836cc7cbb4cfe6236512323a9b6a8cf74deea5026e17c22fc818429af0389d`. [Dated study receipt](../various/opus/continuations-revised.json)

**1. Prompt context.** Working directory `/tmp/picocalc-eg-wave/empty`, no git repository. The task supplies my earlier draft, verified implementation measurements, and a technical review listing specific errors. I must incorporate every correction and return only the final article and diary.

**2. Corrections applied — event model.** My earlier draft used string-valued event kinds `"start"` and `"complete"` and placed a file handle in `event.ok`. The review states: `kind` and `token` are i32, `ask` and `ok` are bool, completion kind is integer 4, `event.ok` never contains a handle or chunk. SDK results arrive through `typedSdkBuffer`, not the event. I rewrote the entire event model and all pseudocode accordingly.

**3. Corrections applied — cancel semantics.** My draft implied cancel was a completion event kind delivered by the runtime. The review states cancel is an explicit source-language operation. I removed all references to cancel as an event kind or runtime-delivered completion.

**4. Corrections applied — generated code form.** My draft used a `switch` statement. The review states generated steps use ordinary guarded if-tests, not a literal switch table. I rewrote the pseudocode with sequential if-tests.

**5. Corrections applied — native stack.** My draft stated the function "never suspends mid-execution" in a way suggesting no native stack exists. The review clarifies that the native call stack exists during each invocation and unwinds normally. The transform eliminates the need for the stack to persist across turns, not the stack itself. I added an explicit clarification.

**6. Corrections applied — fixture.** My draft invented `readChunk`, `readRequest`, and a handle-carrying `event.ok`. The review supplies the exact fixture: `openFile(handle: i32, state: WorldState): i32` using `typedSdkFileRead(handle)` and `typedSdkYield()`. The handle is consumed by the request with no later read in the test fixture (the real Editor retains it). I replaced all pseudocode and the event trace.

**7. Corrections applied — liveness implementation.** My draft described a global worklist over a flattened CFG. The review states the implementation works recursively over structured statements with repeated backedge stabilization. I corrected this characterization throughout.

**8. Corrections applied — invariant scope.** My draft broadly claimed that unknown/canceled tokens cause no state change anywhere. The review narrows this: the unchanged-state claim applies to the dispatcher and test fixtures, not every possible operation of the enclosing application handler. I scoped the claim precisely.

**9. Corrections applied — three measurements.** My draft ran the three comparisons together, risking conflation of different inputs. Comparison 1 uses staged full G4 input under an 8 MiB ceiling. Comparison 2 uses a pinned input (`ea6354bd`) under production conditions. Comparison 3 uses synchronous E6 source, a different input entirely. I separated them into labeled paragraphs with distinct input and control descriptions.

**10. Corrections applied — real Editor vs. test fixture.** The review specifies that the real Editor retains the handle after file read (unlike the test fixture), and points to `editor.typed`, `find.typed`, and `06-checkpoint-layouts.jsonl` for real layouts. I added a section distinguishing the fixture from production and citing these paths.

**11. Corrections applied — positive description only.** The review instructs me not to list hypothetical mechanisms never proposed by the implementers. My earlier draft had a "Limitations" section enumerating absent mechanisms (ring buffers, stack copying, GC, etc.). I removed this section and describe the system positively: what it does and what its actual constraints are.

**12. Predictions vs. measurements.** All timing and allocation numbers are measurements on host QuickJS, cited without causal attribution. The liveness description and frame allocation rules are structural properties of the code. The event trace in section 5 is a prediction from the state-machine structure, consistent with the verified observation that the 10,000-unit test issues request tokens exactly 1, 2, 3, 4.

**13. Tricky parts.** (a) Handle semantics: in the test fixture, `handle` is consumed by `typedSdkFileRead` and never read again, producing an empty initial live set. In the real Editor, it is retained for ownership. This distinction is the core liveness test exercised by the fixture. (b) Boolean `ok`: a reader expecting Promise-style async might assume `ok` carries a result value. It is strictly success/failure; results arrive through `typedSdkBuffer`. Getting this wrong would produce incorrect pseudocode. (c) The spare code unit (95) for pending title length is field packing at the ABI boundary—I described it exactly as stated without generalizing.

**14. What I did not do.** I did not predict ESP32-P4 performance from host QuickJS timings. I did not attribute measured improvements to any single compiler change. I did not invent APIs, event kinds, or data structures absent from the verified evidence.

**15. Independent review.** A reviewer should verify: (a) the guarded if-test pseudocode correctly models the resume pattern in `typed-async.js`; (b) the event trace yields tokens 1–4 matching the normalization test; (c) no measurement is cited with unsupported causal attribution; (d) the three measurement comparisons are not conflated; (e) the unchanged-state invariant is correctly scoped to dispatcher and fixtures; (f) `typedSdkBuffer` is correctly identified as the SDK result channel rather than `event.ok`; (g) the article contains no mechanisms absent from the verified evidence.

**16. Next steps.** If new async functions are added, extend `14-check-async-layout.mjs` with expected live-set fixtures before implementation begins. Run `15-benchmark-quickjs.c` on any change that alters AST node count or intermediate representations to verify the 4 MiB heap constraint. The 80-word ABI cap leaves 10 words of headroom at 70; any new async root sharing WorldState fields must be checked against this budget. The article is complete as a standalone archival document.
