---
Title: Continuation compiler investigation diary
Ticket: PICOCALC-CONTINUATION-G
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/19/PICOCALC-CONTINUATION-G--compile-typed-await-into-static-picocalc-continuations/scripts/14-check-async-layout.mjs
      Note: Deterministic host trace and byte controls
    - Path: repo://ttmp/2026/11/19/PICOCALC-CONTINUATION-G--compile-typed-await-into-static-picocalc-continuations/scripts/15-benchmark-quickjs.c
      Note: QuickJS allocation and timing instrument
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T23:29:34.829420161-05:00
WhatFor: ""
WhenToUse: ""
---

# Continuation compiler investigation diary

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

## Step 1: Trace the request and completion contract

I started from baseline 289281c. The roadmap and Article 8 establish two boundaries for the compiler. A handler must give up control after a successful request, and every persisted continuation value must fit the reactor's WorldState record.

### Prompt context

The parent agent assigned G1 and G2, including production compiler integration, a focused ticket and intern design, host checks, a detailed diary, and a separate published report. The assignment described the production scope and set aside serial access for the parent agent.

### What I did

- Read Scope G, Article 8, the existing compiler entry points, and the earlier single-await experiment.
- Recorded lexical binding, liveness, static frame identity, and token dispatch in the design guide.
- Coordinated generated locals and reuse of expression type checking with the frontend implementer. The parent agent will supply SDK request metadata and load the new compiler module.

### Why

The experimental single-await implementation has enough information for one split but lacks nested call frames, structural loop cuts and a production link path. The shared expression emitter already enforces types and mutation rules. Reusing it avoids giving async functions a different expression language.

### What worked

The baseline RV32 and Wasm world entry points converge on the same typed frontend. Their thin linker wrappers can carry layout information while continuing to supply byte arrays to the loader.

### What did not work

No failures observed while inspecting the baseline and creating the ticket.

### What I learned

RV32 already limits function calls to eight argument registers. Passing every original parameter and another completion parameter to the generated step would lower the accepted source arity. The frame already has a word for the token. After a completion matches, and within that same handler turn, that word can carry the completion value to the step before the step clears it.

### What was tricky to build

A scalar name can refer to separate declarations in disjoint blocks. Tracking liveness by spelling alone would give the wrong result when the generated step hoists locals. Binding identity has to be established before liveness.

### What warrants a second pair of eyes

Review that generated reference slots can never be read before an original initializer and that cancellation leaves no active child frame capable of matching an old token.

### What should be done in the future

Implement the parser, backend-independent generation and host traces described in the design.

### Code review instructions

Start with Scope G and the typed-wasm compiler's FunctionEmitter. Compare those against the static layout and start/resume flow in the ticket's design guide.

### Technical details

Completion kind 4 carries event.token and event.ok. Source imports marked awaitable return an i32 token and produce a bool at the await site. WorldState has four bytes per scalar field and fits at most 80 fields.

## Step 2: Execute generated continuations on both targets

The first implementation lowered async straight-line code, conditional branches, counted loops, and nested waits. The common frontend checked ordinary expressions and compiled the generated source to both targets. The host harness drove the open task through a request and three timer completions and checked the entire record across an unknown or cancelled token.

### Prompt context

See Step 1 for the assigned scope. The parent requested a Git checkpoint of this implementation before reducing its compiler-time token storage.

### What I did

- Added the analysis pass and source generator in compiler/typed-async.js and exercised their production Wasm and RV32 entry points.
- Created 14-check-async-layout.mjs with a deterministic SDK fixture. Ran it in Wasm, streamed RV32 and buffered RV32 modes.
- Compiled the staged Editor source with the application implementer. The generated open-only variant had 72 WorldState fields and the combined variant had 71.

### Why

The same assertions should cover both backends, including a second matching attempt on a consumed token and resuming with a different ambient output buffer address. The open example also needs a comparison to the expected normalization result for the entire 10,000-unit input.

### What worked

Every engine handled 27 delivered events, normalized 10,000 units, and issued exactly four tokens for the open task. The fixture also verified nested caller routing, opposite completion order, immediate request failure, the scalar frame limit and awaited call type errors.

### What did not work

The first compiler smoke failed at `3:29: unknown type Phase`. The generated WorldState then contained an enum-typed spill field before the enum declaration. Generated frames now use i32 storage for enum and distinct values and restore the compile-time type through an internal conversion.

The first test invocation failed with `Error: spawnSync git EPERM` in the sandbox even though Git produced stdout. The harness receives the optional baseline via an extracted Git tree and has no Git subprocess. An initial byte control used the Editor world entry points for Files and then concatenated Agenda's fragments in the wrong order. Files and Agenda now use their own production wrappers and Agenda lists reminder.typed first.

### What I learned

The baseline Editor has locals named start and pending, and Agenda even has a record field named start. The task operators therefore recognize these spellings in their syntactic forms and continue accepting ordinary local and field uses.

### What was tricky to build

A nested task returns an enum synchronously or after an arbitrary number of reactor waits. The same word passes through both paths, and a parent receives it only after its child's state becomes idle. More than one incoming await site within a task needs a saved caller selector.

### What warrants a second pair of eyes

Check that the dispatcher walks upward after a child finishes and stops when a parent immediately starts another wait. Inspect transpiler memory use on the full Editor source.

### What should be done in the future

Replace the full-source token array with a span scan before the physical compile run.

### Code review instructions

Run `node ttmp/2026/11/19/PICOCALC-CONTINUATION-G--*/scripts/14-check-async-layout.mjs`. Pass an extracted baseline repository directory to run the linked byte comparisons as well.

### Technical details

The layout for the open example has five fields. The read wait saves no local values. The yield wait saves length, read and written. There is one separate readHelper frame in each started task, and the nested task's helper frame has a caller field because two await sites reach it.

## Step 3: Discover functions by span on the compiler heap budget

The first continuation compiler retained a JavaScript object for every token of the input. That cost was particularly large for Editor, which has many ordinary functions and a small number of async functions. I changed discovery to use the regular frontend's signature scanner and brace-aware body skipping. The pass then materializes tokens for each async body and synchronous bodies where the operation prefilter finds possible task syntax.

### Prompt context

The parent requested a cap-preserving compilation path, with the first approach available for attribution at commit 62d829f.

### What I did

- Made the common signature scanner expose original function spans on request.
- Collected ordinary function call edges with a scanner that skips method calls, strings and comments. The common iterative cycle check now handles both ordinary and async closure edges.
- Added a vendored QuickJS benchmark using the same style of allocator accounting as the P4 port. It creates a fresh runtime for each invocation and accepts a compiler heap cap in MiB.
- Re-ran the deterministic continuation fixtures and the full linked byte comparison to 289281c.

### Why

Most of the Editor's source needs signature and call information during async discovery. Only typed async statements need local identity and a syntax tree. References to original spans also preserve diagnostic locations and let ordinary text pass through unchanged between rewrites.

### What worked

The linked Files, Agenda and Editor bytes matched the baseline on Wasm and RV32. On a staged G4 Editor input the span version rewrote in one observed 64 ms run at 1,702,448 allocator bytes peak. The raw RV32 emission succeeded under the same 4 MiB heap cap at 2,790,120 allocator bytes peak.

### What did not work

At 4 MiB both `rewrite` and `rv32` on 62d829f exited with `InternalError: out of memory in regexp execution`. The synthetic ELF byte-control originally used a 65,536-byte slot, which is smaller than Editor's compiled program. The fixture now matches the real SDK slot capacity of 229,376 bytes.

### What I learned

The compiler's own lexical representation can determine whether a 70-field staged world compiles at all. Record size, compiler heap and target image size measure distinct allocations.

### What was tricky to build

The source cycle check still needs calls in ordinary functions. Those edges are gathered without storing ordinary token arrays. The scanner recognizes a dot before a method name and skips calls written inside strings and comments. Lowered code is checked again by the regular frontend.

### What warrants a second pair of eyes

Review source and lowered call graph agreement around contextual operations. Use cold board qualification to assess the added discovery time and include the actual linker in the device peak.

### What should be done in the future

Complete the paired host timing runs and compare compiler-time costs with the physical qualification results.

### Code review instructions

Start at readProgram and scanOperations in typed-async.js, then inspect scanSignatures and checkAcyclic in typed-wasm.js. Run 14-check-async-layout.mjs with a 289281c Git archive to check both targets and the baseline.

### Technical details

The staged G4 source SHA-256 was b22520158aa8f22151ae8c681fde8a2116231ff0e0d23930e3333e7fff547778. It contained an older 70-field Editor application variant. Both compiler versions consumed identical input for the allocator comparison.

## Step 4: Reuse lexed tokens and verify observable start behavior

I used the expression emitter as a type checker over pre-lexed ranges. The checker reads the existing lexical bindings and discards emitted instructions. I also caught an observable ordering bug when reviewing a generated start call. The wrapper could return false after already evaluating an argument that changes state.

### Prompt context

The parent asked for a cold-compile performance follow-up and a checkpoint whose generated Editor output remains stable. Step 1 records the G1 and G2 scope.

### What I did

- Avoided cutting a copy of the source prefix every time a bounded lexer is constructed.
- Reused token ranges inside the async body checker and current lexical binding metadata for expression checking.
- Generated a short-circuit guard so starting a busy task skips a compound argument with possible effects. Added a fixture whose argument increments a field.
- Added exhaustive enum match lowering inside async functions, nested control and overlapping save-set fixtures, a mixed sync/start cycle, both nonpositive request outcomes and standalone introspection.
- Recorded the paired host results in various/01-span-allocation-quickjs.jsonl and various/02-typed-token-reuse-quickjs.jsonl. Each contains seven trials with five lane records per trial.

### Why

Source-sized copies and a throwaway emitted instruction array are unnecessary for checking ordinary fragments already present as typed source tokens. Discarding invalid code earlier also keeps the generated input below the existing state ABI budget.

### What worked

The focused suite passed 29 events on Wasm, RV32 and buffered RV32. Tests accounted for argument side effects, enum states, transitive start cycles and the exact scalar/frame sizes. The native image for the 70-field combined Editor was 89,168 bytes before and after the last host optimization.

On the same staged input at a common 8 MiB comparison ceiling or lower, the full-source scanner and span scanner had median rewrite times 93.141 and 34.739 ms, and raw RV32 times 205.218 and 139.184 ms. The peak tracked raw RV32 allocation fell from 5,720,480 to 2,653,592 bytes. The old lane used 8 MiB because 4 MiB failed. The span lane used 4 MiB.

For the later input pinned by SHA-256 ea6354bd16ac788862b4f4d8a7362273dcb0d5d5c1b11f29248af388200632b0, alternating runs on one host core gave 28.915 and 23.597 ms median rewrite, 103.558 and 97.939 ms raw RV32 emission, and 80.877 ms raw RV32 for the synchronous E6 input. The measured peaks for the two raw RV32 G4 lanes were 2,649,408 and 2,790,136 bytes. New source and old source timing comparisons are separate experiments, so compare paired rows within each group.

### What did not work

The initial design's eager argument evaluation was found by source review. The new fixture observes exactly one argument evaluation after an accepted start followed by a rejected busy start. Initial unpinned host batches showed broad timing differences during other local work. I switched the paired runs to one CPU and kept both variants adjacent within each trial.

### What I learned

The measured savings from precise source spans are distinct from the remaining analysis overhead. Host raw RV32 timing omits real ELF linking and the physical PicoCalc's QuickJS execution characteristics.

### What was tricky to build

A generated call must preserve normal expression typing and stack balance even when a busy frame skips the arguments. A typed if with i32 result merges the taken call's bool representation and the false value, so both Wasm and RV32 reuse their existing structured branch emitters.

### What warrants a second pair of eyes

Check the contract of the implicit world state lookup used by the guarded call, and check that generated-only syntax remains inaccessible to authored text. The full WorldState is the one persistent record passed to the world handler and aliases name the same storage.

### What should be done in the future

Record physical medians against the paired firmware sources in the aggregate qualification. Measure generated dispatch and host compiler discovery separately when changes target those costs.

### Code review instructions

Run the focused fixture and optional baseline lane. The lexical checking path is TypeChecker in typed-async.js and the runtime argument guard is FunctionEmitter.call in typed-wasm.js.

### Technical details

Each old-source JSONL trial is ordered as old rewrite, span rewrite, old RV32, span RV32, sync RV32. Each final-source JSONL trial is ordered as span rewrite, token reuse rewrite, span RV32, token reuse RV32, sync RV32. Source assembly follows worlds/editor/source.list and inserts a newline after each part.

## Step 5: Publish the intern report

I compared the final compiler checkpoint 2e4fee1 with the compiler used for the first production Open and Find build. It produced byte-identical linked Editor output at 70 fields. I published the article in the Obsidian vault and verified that its local and remote branches both name the new commit.

### Prompt context

See Step 1. The report explains the production transformation, its evidence, and its differences from the earlier single-await pilot.

### What I did

- Confirmed linked Wasm and RV32 Editor identity against 9fd1744 on the 7b321a9 app source, with the same SDK reactor in each pair.
- Revised the draft after checking that its normalization example included the real loop, the nested result transfer named the transient token-field use, and the evidence distinguished interpreter execution from complete ELF linking.
- Committed and pushed the report in go-go-parc as 000fa2a. [Published note](https://github.com/go-go-golems/go-go-parc/blob/000fa2a/Projects/2026/11/20/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20How%20PicoCalc%20Compiles%20Await%20into%20Static%20Continuations.md)

### Why

The original pilot's 74-field number and compile results describe a smaller lowering. The production report needs its own source, memory and behavioral evidence for a reader to reproduce the result accurately.

### What worked

The compared Wasm images were 88,969 bytes with SHA-256 5dfeb5713680bc2c475ed5c530209a98cea40ce152faae5fb11c7de1fff04c65. The compared ELF images were 240,452 bytes with SHA-256 7c182547f28e7e6d9921f2a7df7472c6a44df184b7e5eb0543b40c523e6253bd for that archived reactor. The scoped vault commit was pushed to main.

### What did not work

An initial comparison invoked raw typedRv32.compile on assembled Editor with its default 64 KiB source limit and returned `SyntaxError: input limit exceeded`. The linked world API uses the production 96 KiB source limit and successfully verified both complete artifacts.

### What I learned

Allocator observations and linked program identity can hold simultaneously. Changes to the compiler's intermediate JavaScript allocations leave the generated application's behavior and compiled bytes identical in this comparison.

### What was tricky to build

The comparison requires matching the archived source, compiler revision and reactor inputs. Byte identity pertains to the same reactor in both lanes. A firmware build may package a reactor with different bytes outside the typed program slot.

### What warrants a second pair of eyes

Verify that the device qualification quotes measurements from the exact compiler revision or explicitly labels earlier runs. Use the parent qualification ledger for physical timing and replay outcomes.

### What should be done in the future

Keep the host trace as a regression for future task language changes and record physical compile timing separately from host allocation.

### Code review instructions

Use 2e4fee1 for code and fixture inspection. Read the vault report with the ticket design and the two paired host measurement receipts.

### Technical details

The final report branch evened with origin/main at commit 000fa2a705bebefdf8b5875304759221074f04be.
