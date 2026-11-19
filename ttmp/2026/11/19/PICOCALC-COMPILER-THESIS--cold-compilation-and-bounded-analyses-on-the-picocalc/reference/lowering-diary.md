---
Title: "Depth-indexed RV32 lowering investigation diary"
Ticket: PICOCALC-COMPILER-THESIS
Status: active
Topics: [picocalc, compiler]
DocType: reference
Intent: long-term
Owners: []
Summary: "Design, differential testing, and paired measurements for the RV32 compiler."
WhatFor: "Trace how the register-lowering claim was established and where its limits lie."
WhenToUse: "When qualifying or extending the RV32 backend."
---

# Depth-indexed RV32 lowering investigation diary

## Step 1: Identify the operand-placement experiment

I traced the baseline address calculation from `typedRv32.compile` through `FunctionCode.lower`. The baseline frame fits the locals, a word per active WebAssembly operand position, and the saved return address. Both executables share the typed frontend, so native code generation can change while WebAssembly remains the behavioral oracle.

Scope A proposes location descriptors for constants, deferred local reads, registers, call returns, slots, and comparisons. I selected the depth-to-register mapping with eager evaluation so the initial measurement would isolate operand placement. The supervisor asked specifically for live prefixes across imports, eight argument positions, joins with a nonempty prefix, and signed division and remainder edges.

### Prompt Context

**User prompt:** Verbatim in [supervisor Step 1](01-supervisor-investigation-diary.md#step-1-commission-three-controlled-compiler-experiments).
**Assistant interpretation:** Implement a consequential compiler construction experiment in the normal RV32 lowering path.
**Inferred user intent:** Produce a measurable compiler result with a research record that transfers to related lowering work.

### What I did

- Read NATIVE-NEXT Scope A and the baseline RV32 emitter. Traced the frontend's `Math.min/max`, boolean operators, and `while` into Wasm instructions.
- Read the existing host replay index and instrumentation. Sent the proposed fixed-depth mapping and test plan to the supervisor.

### Why

The frontend's structured control fixes the relevant height at joins. A fixed mapping makes that height sufficient to recover native locations. It lets the load/store difference explain the result independently of delayed reads or general register allocation.

### What worked

The frontend already emits exactly the structured control needed by the simpler policy. The baseline frame slot expression supplies a deterministic spill address for every operand depth.

### What didn't work

The first combined inspection was truncated. I divided it into the frontend opcode emission, the existing instruction analyzer, the replay inventory, and tool paths.

### What I learned

Current source-level value joins use `if/else` with a result. Explicit `br` and `br_if` opcodes from the frontend target void loop and block labels.

### What was tricky to build

A signed divide guard can have three live machine values even when its two operands occupy spill slots. That case needs two distinct pop scratch registers and a third register for the comparison constant.

### What warrants a second pair of eyes

Check the relationship between frontend stack arity and native locations for a result-producing block with nonempty prefix.

### What should be done in the future

Use the fixed-register result as the control when evaluating deferred evaluation or larger register sets.

### Code review instructions

Read `typed-wasm.js` in `expr`, `statement`, and `minmax`. Then read `typed-rv32.js` in `begin`, `end`, and the switch for 0x05, 0x0c, and 0x0d.

### Technical details

The location is `T[d]` at depths 0–4 and `sp + 4 * (localCount + d)` above that. The compiler also uses that frame address to save a shallow value through a call.

## Step 2: Implement the mapping in the existing compiler

I replaced unconditional stack loads and stores with depth-based reads and writes. Producers target the result's home register. Calls stage arguments, spill and restore the surviving register operands, and insert the return. The maximum spilled depth determines which operand words the frame needs.

I removed a prototype that copied values across branches to result labels after confirming the frontend's existing control forms. The source paths with results already agree on a canonical home through `if/else`. I sent that stabilized implementation to the supervisor to build independent modules.

### Prompt Context

**User prompt:** See [supervisor Step 1](01-supervisor-investigation-diary.md#step-1-commission-three-controlled-compiler-experiments).
**Assistant interpretation:** Keep one implementation under the normal entry point and test the whole app path.
**Inferred user intent:** Show the impact of a compiler change in actual consumers.
**Commit (code):** f0846ba342e6b64d5350b1a6e49dfd37a2e33fc3 — Keep shallow typed RV32 operands in registers.

### What I did

- Added fixed operand registers, scratch materialization, and spill accounting to `picocalc-os/compiler/typed-rv32.js`.
- Used separate spill scratch registers for the value and address of a store and the two inputs to binary operations. Kept relocation handling and ABI-aligned frames.
- Ran `node --check picocalc-os/compiler/typed-rv32.js` and the existing instruction analyzer. Disassembled the two `bump` binaries with ESP objdump.

### Why

A call consumes all of its arguments. Only the prefix below those arguments needs preservation, and the register part of that prefix has a deterministically bounded size.

### What worked

The variant's first pass counted 804 Files, 4,058 Agenda and 21,886 Editor instructions. The two `bump` images contained 41 and 22 instructions. Its frame fell from 32 to 16 bytes. The existing variant replay suite passed 24/24.

### What didn't work

The initial result-label branch prototype added a generated edge copy for a sequence the typed frontend does not emit. I removed it before qualification and covered the actual conditional joins in the fixtures.

### What I learned

A smaller operand area can shrink the frame. The maximum Editor function frame stays 192 bytes even though the code image shrinks. These measurements summarize different resources.

### What was tricky to build

An argument can be staged into its destination `a` register without disturbing a stack register. A later operand pop may load another argument directly from a spill. The only division guard scratch outside `t5` and `t6` is `a0`. No operand is kept there at the instruction boundary.

### What warrants a second pair of eyes

Verify that a spill incurred only to preserve a call prefix contributes to frame size, and that the saved `ra` survives the call and the common return path.

### What should be done in the future

Measure whether any gain disappears in a fresh compiler runtime or in actual guest execution.

### Code review instructions

Run `git show f0846ba -- picocalc-os/compiler/typed-rv32.js`. Read `call` alongside frame calculation in `lower` and `binary` alongside the register declarations.

### Technical details

The maximum variant frame sizes were 64, 80 and 192 bytes for Files, Agenda and Editor. The register homes are all caller-saved.

## Step 3: Qualify value preservation with differential execution

A real import can happen to preserve an argument or temporary register even when the ABI permits clobbering it. I built a focused interpreter that deliberately overwrites all of them at import calls. Node's WebAssembly runtime executes the corresponding bodies using the same host handlers and records arguments and ordering.

The fixed vectors also cover spilled operands on both sides of a binary operation, a result-producing join with a live memory prefix, and call staging with eight distinguishable arguments. The interpreter checks frame alignment and complete normal-return ABI state.

### Prompt Context

**User prompt:** See [supervisor Step 1](01-supervisor-investigation-diary.md#step-1-commission-three-controlled-compiler-experiments).
**Assistant interpretation:** Exercise the boundary cases identified by the supervisor alongside real app replays.
**Inferred user intent:** Establish semantic equivalence before interpreting smaller or faster output.

### What I did

- Added `differential.mjs` and `rv32.mjs` under `scripts/lowering`. The harness assembles a minimal Wasm module from the frontend bodies and runs both unlinked RV32 images.
- Verified shallow and deep signed division and remainder, expected bounds traps, side-effecting short-circuit operations, record and UTF-16 mutation, early returns, loop edges, and an eager local snapshot containing a handwritten Wasm instruction sequence.
- Compared result, trap, application memory, and recorded imports for every fixture. Counted execution words separately for each lowerer.

### Why

A correctly encoded machine image can still return the wrong integer if an operand is lost. The clobbering import and exact argument log expose this failure directly. The linked replays then cover actual SDK and reactor execution.

### What worked

All 78 cases passed against WebAssembly, including 12 expected traps and 15 imported calls. The targeted vectors executed 4,594 historic and 3,138 candidate words in the interpreter. Both arms of the deep join worked, and the deep eight-argument call took 110 and 100 words.

### What didn't work

`node "$ticket/scripts/lowering/differential.mjs" /tmp/picocalc-lowering-baseline.js` initially returned `SyntaxError: 2:1: expected function`. The fixture used a TypeScript-style declaration and required `record Cell { value: i32; }` in the project dialect. On the next attempt it returned `SyntaxError: 25:28: expected ;` for `==`. I used the supported `===` operator. Both failures occurred before RV32 emission.

### What I learned

The deeply nested eight-argument case gains less than the shallow call because it retains more frame traffic and saves more live register operands. The smaller gain is detectable in the per-case counts even when both are behaviorally correct.

### What was tricky to build

The interpreter reports an explicit trap only for a decoded `ebreak`. Invalid addresses, instruction encodings, or return targets fail the check. Memory comparison after a trap also catches a write that should have been guarded.

### What warrants a second pair of eyes

Check sign extension in B and J immediates and check that the clobber handler records arguments before overwriting registers.

### What should be done in the future

Carry these fixtures forward if deferred operand descriptors or result register forwarding changes the home invariant.

### Code review instructions

Extract a baseline file from `dd69a81`, then run `node "$ticket/scripts/lowering/differential.mjs" "$baseline"`. The generated receipt includes the named cases and instruction counts.

### Technical details

One simulated import relocation counts as one guest word and excludes the host handler's work. The existing replay suite performs the actual trampoline call.

## Step 4: Compare application images and link products on paired inputs

I compiled the actual Files, Agenda and Editor bundles in separate Node VM contexts with the same frontend. The scanner checks every frame access relative to each function's local area and saved return address. The supervisor independently measured the production Editor entry with fresh Linux QuickJS processes and counted guest instructions in four whole-driver workloads.

### Prompt Context

**User prompt:** See [supervisor Step 1](01-supervisor-investigation-diary.md#step-1-commission-three-controlled-compiler-experiments).
**Assistant interpretation:** Record reproducible gains on real compiler inputs and distinguish host compilation from guest execution.
**Inferred user intent:** Learn about compiler construction within the small device's constraints.
**Commit (code):** f0846ba. Independent supervisor instrumentation and data are at 3734cd7.

### What I did

- Added the per-function scanner and historic baseline preload under `scripts/lowering`. Retained comparable paired replay and timing receipts under `various/lowering`.
- Re-ran the 24 existing workflows once per lowerer. Recorded source and image hashes and preserved individual samples.
- Checked the supervisor's candidate identity and included the independent cold and dynamic results in the report.

### Why

A static instruction count includes every branch equally. A whole guest invocation weights the paths a workload actually runs. A compile benchmark measures a different program, the JavaScript compiler itself.

### What worked

Files dropped from 1,529 to 804 words, Agenda from 7,710 to 4,058, and Editor from 43,965 to 21,886. Both lanes passed 24/24. Files ELF size remained 24,424 bytes and Editor's remained 240,452. The separate cold Linux QuickJS run favored the candidate in 20/20 pairs and the four actual guest Editor workflow output hashes matched.

### What didn't work

The scanner's early `execFileSync('git', ...)` returned `Error: spawnSync git EPERM` in the sandbox. I extracted the historical bytes with a shell `git show` and passed their path. The baseline replay's relative `--import ttmp/…/replay-baseline.mjs` failed with `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'ttmp' imported from /home/manuel/code/wesen/2026-10-20--ds-js-os/`. Using an absolute preload path recovered all 24 tests. A separate typo in the shell receipt command caused Bash to report an unexpected EOF while looking for a matching double quote. The corrected command captured the already reproducible differential totals.

### What I learned

The code image shrinks inside the fixed ELF slot. JavaScript lowerer source grows by 1,502 bytes, while the actual compile entry reports faster cold completion and lower peak host allocation on Linux. Target compile timing still awaits the hardware.

### What was tricky to build

A historic replay can silently use the current lowerer when the ordinary import overwrites `globalThis.typedRv32`. The preload evaluates the historic backend first and keeps it selected. Files reports the expected different native code bytes in the two lanes, independently confirming selection.

### What warrants a second pair of eyes

Check that compile overhead, ELF reservation and evaluated path work remain separate conclusions. Confirm the controlled replay reports 6,116 and 3,216 code bytes for Files.

### What should be done in the future

Repeat matched modules on physical hardware and record board allocation and runtime measurements using the code hashes in the current receipts.

### Code review instructions

Use the commands in [the project report](../various/reports/lowering.md). Compare [exact image scan and warm trials](../various/lowering/instruction-counts.json) with [independent cold compile evidence](../various/supervisor/cold-editor.json).

### Technical details

Node v24.18.0 used 10 warmups and 31 timed pairs per application. Cold QuickJS used 20 fresh-process pairs and a constant reactor. The emulator's whole-driver instruction count includes startup, reactor and application instructions.
