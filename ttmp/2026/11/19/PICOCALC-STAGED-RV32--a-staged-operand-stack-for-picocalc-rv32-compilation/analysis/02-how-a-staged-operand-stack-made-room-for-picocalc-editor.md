---
Title: How a staged operand stack made room for PicoCalc Editor
Ticket: PICOCALC-STAGED-RV32
Status: active
Topics:
    - picocalc
    - compiler
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:46:27.36040994-05:00
WhatFor: ""
WhenToUse: ""
---
# How a staged operand stack made room for PicoCalc Editor

PicoCalc Editor compiles before the user opens a document. It turns the app's typed source into a native image on the ESP32-P4, links the image into a small executable runtime called a reactor, and loads the complete reactor as a world. A world is an application with its own memory allocation and operating-system interfaces. This study asks how much space a compiler can remove between those steps and what it takes for fewer instructions to free actual world memory.

The experiment starts from the production compiler at `40bcf850a5809ef6d839127869faa952596ed157` and the earlier code generator that fused comparisons with branches. Files reached exactly the older model's target of 593 words. A forecast committed before the Agenda test was four words low. Editor then emitted 66,164 bytes of code, with enough room for its headers and trampolines in the proposed 80 KiB slot. The static results, behavioral tests and application replay are separate pieces of evidence.

## Follow a value from source to machine code

The typed frontend checks a function while it parses it. It gives the RV32 backend a series of Wasm-style operations such as `local.get`, `i32.const` and `i32.add`. An operand stack describes the input and result of each operation. Reading a local pushes a value, as does a constant. Addition consumes the last two values and pushes the sum. The native compiler needs to choose what register or stack-frame byte address holds each expression value during execution. The production backend already keeps the first five operand depths in `t0` through `t4`. Its generated code eagerly loads locals and constants into those homes.

Consider `return x + 1;`. The baseline loads `x` from the frame into `t0`, loads `1` into `t1`, adds the two registers and moves the answer to `a0`. The staged lowerer writes down `local x` and `constant 1` in the compile-time stack. It waits until the add sees the left operand and the right operand together. Then it emits a load and an `addi`, which includes the integer `1` in the instruction itself. At the return it puts the answer in `a0`, the register the RISC-V calling convention specifies for the return value.

```text
operation       compiler's state          emitted body
local.get x     [local x]                  —
i32.const 1     [local x, constant 1]      —
i32.add         [computed in t0]          lw t0, x(sp); addi t0, t0, 1
return          []                        mv a0, t0
```

A constant zero can often use the processor's `zero` register. A deferred local can sometimes be loaded directly into an argument or return register. A function that makes no calls can omit saving and reloading `ra`, the register holding its return address. The staged research variant bundles these small decisions with branch relaxation. They act on one function at a time so the parser can still release each operation body before moving to the next.

```mermaid
flowchart LR
    S[Typed source] --> W[One function of numeric operations]
    W --> M[Emit words while tracking value locations]
    M --> F[Settle values at calls and joins]
    F --> B[Relax branches and remap offsets]
    B --> E[Link image within executable reactor slot]
    E --> L[Load world and run workflows]
```

## Preserve a value when the program can take two paths

Deferring a read makes it possible for another operation to change its source. In `local.get 0; i32.const 99; local.set 0; end`, the pending operand must still produce the old value of local 0. Immediately before the write, the compiler resolves every remaining pending read of that local. A depth above four uses a frame slot. In the focused raw operation fixture five operands sit under the saved local. For an input of 41, the expression returns 56 after adding five constants, even though the local then receives 99.

Calls impose a similar boundary. The calling convention allows the callee to overwrite the temporary and argument registers. The staged compiler saves already computed values that survive the call and reloads them on demand. Pending constants and reads of a caller-local frame slot can wait. A call result can stay in `a0` while it has a single owner. Another call or the signed division overflow check can overwrite `a0`, so those operations save or relocate the live result first. The tests cover nested calls with eight arguments, a host import that deliberately overwrites caller-saved registers, and a signed division nested inside a larger expression that still needs an earlier call result.

A structured join brings two control-flow paths to one instruction. In `flag && compute()`, the left value selects either a call or the constant false. One continuation consumes that result, so each path places it in the home for the join's operand depth. The inherited prefix matters too. If the call spills an earlier pending value, the outgoing path restores the prefix before either path reaches the continuation. Without this step, the instructions after the join would use a location that only one arm had initialized. Current source syntax emits conditional loop exits to statement blocks and materializes expression results through `else` and `end`. If a later frontend emits conditional branches carrying results, its taken edge may need to run a move before reaching the label. That case requires extending the lowering and its tests.

## Make a long branch short after its target is known

The earlier fusion removes the separate Boolean computation where the very next operation branches. It can emit a compare-and-branch against the two existing operands. A RISC-V conditional branch still has limited reach. The baseline implements it as an inverted conditional that jumps over a separate `jal`. The jump can reach a target roughly 1 MiB away. When the compiler can prove the target fits the signed conditional displacement, it keeps one word with the original condition and removes the extra `jal`.

Removing a word changes the distances of other branches. The candidate starts from the long forms, maps each original word boundary to its current offset, and repeats while it can remove more words, up to eight passes. The distance between two surviving boundaries cannot grow when intermediate words disappear. A remaining long branch keeps its original safe form. After the final pass, the code generator remaps surviving jump sites, local label positions and import relocation sites, and the program assembler uses the compacted function lengths to place callees.

The test executes both sides of branches at the reach boundary. It records a direct conditional displacement of +4,084 bytes. A slightly longer arm retains a branch over a +4,096-byte `jal`. A wide loop retains a +4,820-byte exit jump and a −4,824-byte backedge. Generated results match Wasm on all four witnesses. Loader checks later exercise the relocated import sites in full Editor programs.

## Build a forecast an application can disprove

An instruction estimate counts the words a compiler would emit for each abstract operation. The older Stage 3 model assumes particular storage and branch choices before it sees the actual machine code. We used it independently of the candidate by walking the frontend's encoded Wasm stream. This gave a forecast per function. The actual code sizes came from each function's entry offset and the next entry in the image. The experiments never inferred emitted code size from a compiler's internal counters.

| Application | Production words | Fusion words | Staged words | Stage 3 model | Staged minus model |
| --- | ---: | ---: | ---: | ---: | ---: |
| Files | 804 | 738 | 593 | 593 | 0 |
| Agenda | 4,058 | 3,784 | 2,793 | 2,789 | +4 |
| Editor | 21,886 | 20,507 | 16,541 | 16,544 | −3 |

The Files calibration turns the 145-word difference from fusion into four ordered changes. Short branches remove 75 words, lazy operands and immediate forms remove 56, leaf frames remove 10, and deferred returns remove four. `filesSpace` and `filesAlnum` get most of their savings from branch and leaf rules. The string-scanning functions can use immediate instructions for stepping and UTF-16 indexing. `filesName` owns 23 of the 56 words from the operand stage. Only `filesName` and `filesAction` gain from deferred returns. Their internal calls also require saving `ra`. The linked calibration records every function's count under every ablation. The old model matches all seven individual results.

The prespecified forecast scales the old Agenda total by the ratio of measured to modeled Files words. In this experiment `593 / 593` is one, so the calibrated and original center are both 2,789 words. We fixed the ±5% band at 2,649–2,929 words, rounded outward. Commit `a131f1a` contains the candidate identity, calibration, forecast and untouched per-function predictions. The first staged Agenda compilation came afterward. It emitted 2,793 words, 0.1434% above the forecast. Of its 34 functions, 25 matched exactly and nine differed by one or two words. The absolute residuals sum to ten words. Editor's −3 aggregate likewise conceals 54 nonzero residuals totaling 97 words in absolute value. Exact whole-app agreement alone would give a misleading picture of the predictor's function-level error.

The ±5% span is a decision threshold for a near held-out workload. The apps come from one project and frontend and the model itself predates this study, with the old forecasts already documented. The candidate left Agenda opaque through calibration. The evidence supports this nearby transfer to another app and proceeding to the slot experiment. A claim about unfamiliar application families would require additional held-out programs and a repeated calibration protocol.

## Watch a generated program execute

The focused check uses Node's WebAssembly engine as an oracle and an RV32 interpreter for each emitted program. It compares return values, trap outcomes and mutated memory for 2,713 invocations, including 182 traps. The cases include signed extrema, remainder and division by zero, signed division overflow, unsigned UTF-16 loads, in-range and out-of-range indexes, deep spills, taken and skipped arms, and eight-argument calls. The three backends also agree on the selected syntax, type and argument diagnostics in both streaming and buffered modes. Summed synthetic guest steps are 68,424 for production, 65,417 for fusion and 49,922 for staging. The sum illustrates these cases and gives the artificially wide functions weight proportional to the number of instructions executed.

An independent whole-driver emulator executes the runtime and loaded app as well as the test harness. It checks Files sorting and mkdir, Agenda durability and mutation, and Editor actions that save, render or navigate a document. Two runs in each lane match the control's stdout hash for each workload. Each instruction count below includes the entire driver and reactor. The number combines guest execution with shared overhead and its units are executed instructions, rather than seconds or emitted bytes.

| Workload | Production steps | Staged steps | Reduction |
| --- | ---: | ---: | ---: |
| Files startup, sort and mkdir | 88,823 | 88,634 | 0.21% |
| Agenda workflows | 2,193,310 | 1,995,570 | 9.02% |
| Editor edit and save | 2,543,239 | 2,157,263 | 15.18% |
| Editor large open | 7,621,786 | 6,603,076 | 13.37% |
| Editor dense Unicode Markdown preview | 22,853,317 | 19,442,068 | 14.93% |
| Editor late-document navigation | 42,316,056 | 33,974,523 | 19.71% |

The small Files effect shows that a static reduction and a guest-workload reduction answer different questions. A fixed amount of driver and runtime work can dominate a short workflow. Editor's hot typed loops execute many of the lowerer's removed instructions repeatedly. These counts give no wall-clock forecast for a particular CPU, where instruction memory, branch behavior and firmware activity also matter.

## Fit the complete program inside the reactor

The reactor's reserved executable section has 20 bytes of slot metadata, two 4-byte entry stubs, and 28 four-byte import trampolines. Those short instructions connect compiled calls to the runtime. The total prefix is 140 bytes. Code then starts at one known location in the slot. A proposed 81,920-byte slot therefore accepts up to 81,780 bytes of generated code.

Fusion alone emitted 82,028 bytes for Editor, already 248 bytes above that usable capacity. The staged 66,164-byte image uses 66,304 bytes including the prefix and leaves 15,616 free. The experiment changes the assembler reservation from 229,376 to 81,920 independently of the instruction count and rebuilds the reactor. A full-capacity reactor continues to occupy those 229,376 bytes even when the program linked inside it is smaller. The resulting ELF and world allocation should be observed separately. The P4 compiler's peak allocation and compile time are additional measurements because branch relaxation and deferred operands also require temporary compiler state.

The assembled link comparison reduced the complete module from **240,452 to 92,996 bytes**, exactly 144 KiB. Its executable `PT_LOAD` segment went from 239,292 to 91,836 bytes. The writable segment's memory size stayed at 487,880 bytes. Both older lowerers rejected the same small reactor with `RV32 program does not fit the reactor slot`. The staged lowerer placed byte-identical linked instruction payloads in both capacities. The native loader completed the same edit-and-save workflow with both of those modules. The two replays produced an identical 10,386-byte output and both executed 2,157,263 instructions.

## Review and reproduction

Start by reading the [intern implementation guide](../design-doc/01-where-an-rv32-operand-lives-between-instructions.md) and the [prespecified prediction](01-files-calibration-and-prospective-agenda-prediction.md). `scripts/01-stage.py` freezes the compiler and source from Git in a disposable directory. `scripts/04-account.mjs` counts an application and checks equality between buffered and streamed output. `scripts/05-behavior.mjs` compares generated instruction execution to Wasm. The cross-compiler and host workflow harness is the one checked in under the earlier predicate fusion study. `scripts/06-stage-small-slot.py` and `scripts/07-build-small-slot.sh` build the physical-slot variant in a disposable port. `scripts/08-slot-oracle.mjs` links into actual reactor ELFs and verifies the loaded instruction payload, executable section sizes and old lowerers' size errors. The [investigation diary](../reference/01-staged-rv32-investigation-diary.md) records the commands and first failures.

- [Frozen compiler identities](../various/compilers.json)
- [Files per-function ablations](../various/files-account.json)
- [Agenda forecast inputs](../various/agenda-model.json) and [observed counts](../various/agenda-account.json)
- [Editor per-function ablations](../various/editor-account.json)
- [Focused behavior receipt](../various/behavior.json) and [whole-guest workflow receipt](../various/guest-app-workflows.json)
- [Assembled slot oracle](../various/slot-oracle.json), [native-loader replay](../various/slot-replay.json), and [P4 slot recipe](../playbooks/01-qualify-the-80-kib-editor-slot.md)
