---
Title: Investigation diary
Ticket: PICOCALC-LANGUAGE-E
Status: active
Topics:
    - picocalc
    - native
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/scripts/01-check-functions-differential.mjs
      Note: Language semantics and error fixtures
    - Path: repo://ttmp/2026/11/19/PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/scripts/02-compare-worlds.mjs
      Note: Exact cross-revision byte comparisons
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T23:29:07.178752203-05:00
WhatFor: ""
WhenToUse: ""
---

# Investigation diary

## Step 1: Establish the language and compiler boundaries

The roadmap groups syntax extensions and type-system changes with a separate signature pass. I checked the live compiler before design because it already streams numeric function bodies on RV32. A forward call therefore changes both the parser's declaration timing and the native compiler's target lifetime.

### Prompt Context

**User prompt (verbatim excerpts).** “do E1-E7 and G1-G4.” and “Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill”.

The supervisor assigned this lane the production implementation of E1–E7, milestone commits, an intern design, and a vault report. The [supervisor's qualification ticket](../../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/index.md) describes the shared qualification and publication work.

### What I did

- Read the professor's Scope E and located the active typed compiler and all three world sources at baseline `289281c`.
- Identified the existing replay and QuickJS phase timing drivers.
- Opened the design and coordinated Editor and async integration ownership.

### Why

Keeping target labels independent of lowered body descriptors makes forward declarations possible without sacrificing streaming. Using the normal compiler entry points for comparison catches changes that a parser-only fixture cannot see.

### What worked

The workspace contains the ESP32-P4 cross-compiler and the CJI RV32 interpreter needed by the existing replay driver.

### What didn't work

The first ticket title reflected shorthand from the assignment and was corrected after reading the actual E1–E7 plan.

### What I learned

The repository already has a direct RV32 lowering based on the numeric form of the Wasm emitter. The professor's model file is staged separately and needs its own opcode accounting.

### What was tricky to build

A reusable forward-call graph must keep source ordinals separate from reactor and Wasm function indexes, since Wasm and RV32 have different import bases.

### What warrants a second pair of eyes

The design's byte-identity evidence should include exact file hashes and distinguish unchanged source from the explicit demonstrations.

### What should be done in the future

The bounds proofs and import effect propagation in E8/E9 remain outside this implementation.

### Code review instructions

Open the roadmap and review `compileFunctions`, `FunctionCode.call`, and `typedRv32.compile` in the baseline.

### Technical details

`compileFunctions` emits its callback per function. An optional header callback will publish ordered declarations before the first body is parsed.

## Step 2: Preserve streaming while making calls independent of source order

Control flow compiles to the same structured instruction family used by short-circuit boolean conditions. The compiler parses the for-loop update before the body and emits its operations after the body. The loop's exit encloses both, so a break skips the update.

The frontend can check a call immediately because the signature pass has already collected the callee's parameter types and function index. The native linker records a reference to the target object before that object has an instruction address. Assembly keeps the source-order layout, which reproduces existing relative call displacements.

### Prompt Context

See Step 1. E1–E5 commit `c5e2839`, “Add PicoCalc typed control flow and forward calls.”

### What I did

- Added structured else, counted loops and break, with compile-time scope and branch-depth accounting.
- Added strict inequality and RV32 lowering through XOR and a nonzero test.
- Separated signature reading from body emission. Added an explicit-stack traversal and a callee-first order.
- Allocated RV32 call target objects before streaming the first body. The consumer still clears each intermediate operation array when it finishes.

### Why

Predeclared signatures supply both argument types and Wasm function indexes. RV32 target addresses can wait until assembly because the existing linker already resolves backward and import calls there. The frontend completes source and cycle checks before reporting a backend frame error.

### What worked

The existing local-inference qualification still matched output on both targets. The before and after receipts compare the three stock Wasm modules and raw RV32 program images byte for byte. The four-function forward chain returned 16 for input 5 on both targets. The graph stayed in source ordinals when the function indexes began at 11.

### What didn't work

Plain `git add -- picocalc-os/compiler/typed-wasm.js picocalc-os/compiler/typed-rv32.js` failed with `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. The path-limited escalated commit succeeded.

The first QuickJS measurement of the signature pass before the immediate-encoding change produced 31.93 ms. The written threshold is 31.4 ms. Step 4 records the comparison with frozen revisions.

### What I learned

Graph order and emission order are separate. Callable index 11 can call 12 even while the assembler lacks an address for 12. Source ordinals 0 and 1 give graph clients an index independent of the target's import count.

### What was tricky to build

The signature pass handles quoted strings and comments in its brace scanner. The full lexer remains responsible for syntax errors within each body, which the body parser reads from the opening brace saved in the signature.

### What warrants a second pair of eyes

Check graph membership for imported functions and diagnostic precedence among malformed source, call cycles and backend frame limits.

### What should be done in the future

Use the callee-first order to compute stack bounds or reactor effects in downstream compiler work.

### Code review instructions

Open `scanSignatures`, `checkAcyclic`, `FunctionEmitter.call`, and `typedRv32.compile`. Run the differential fixtures and stock byte comparison.

### Technical details

For a loop which starts at statement control depth L, a break emits `br (controls - L - 1)`. Expression-level blocks close before statement-level branches. Unsigned immediates below 128 and signed immediates in the range -64 through 63 append directly as one byte. Wider operands use the existing LEB128 functions.

## Step 3: Add nominal scalar types and test the Editor representations

An enum membership map serves both coverage checking and numeric value emission. A match stores its input once, checks every declared label once, and traps when a raw argument carries a value outside the domain. A distinct integer carries source-level type information and uses the same machine word as a plain integer.

### Prompt Context

See Step 1. E6/E7 compiler commit `4eb08cb`. Editor demonstration commits `ed86ba9` for distinct positions and `1357545` for enum Find phases.

### What I did

- Added enum declarations, member access, local and field types, exhaustive match, and one-word layouts accepted by both world linkers.
- Added contextual integer literals, nominal type inference, explicit conversions, and domain-sensitive equality, ordering, addition and subtraction.
- Coalesced contiguous labels in a match arm into an unsigned interval test. Sparse groups use short-circuit branches.
- Executed invalid matches against raw inputs and checked stored enum and distinct integer values through their record offsets.
- Compared the migrations with frozen compilers and reactors.

### Why

Coverage catches a missing phase while editing a source file. The generated trap handles an invalid word at the raw ABI boundary. Retaining four-byte layouts preserves how the C reactor reads state, and checking exact byte identity verifies erasure for distinct integers.

### What worked

The `4eb08cb` compiler reproduced the stock artifacts. Editor's E7 migration reproduced the 88,255-byte Wasm module and all 21,886 RV32 instructions. The E6 migration produced 88,302 Wasm bytes and 21,922 RV32 instructions, an increase of 36 instructions. State remained at 71 fields.

### What didn't work

The differential command inside the sandbox failed with `spawnSync /home/manuel/.nvm/versions/node/v24.18.0/bin/node EPERM`. The test uses a child-process timeout to limit a nonterminating Wasm loop. Escalated execution reached a fixture conflict. An async parser change had reserved `start`, so that cycle fixture returned `1:10: expected identifier`. Renaming the unrelated function to `entryPoint` restored the intended cycle test.

The shared SDK signature rows gained awaitable metadata while this checkpoint was being committed. Three historical measurement scripts and the roadmap model matched only three-column rows. They now accept the optional fourth field.

### What I learned

Membership in a contiguous interval `[low, high]` over signed 32-bit values has an unsigned test, `u32(x - low) <= high - low`. Values below the low endpoint wrap to a large unsigned integer. The same expression covers negative endpoints.

### What was tricky to build

Bare inferred literals still produce i32 locals. An annotated integer literal instead takes its destination's distinct type. A private type marker keeps that distinction until checking resolves it. Emission of the literal is already complete at that point.

### What warrants a second pair of eyes

Check that grouping enum comparisons preserves the trap for unnamed raw values and that shifts, multiplication, division, and remainder reject distinct operands.

### What should be done in the future

Measure a lexer change independently of the language work if compiler time requires further improvement. The earlier cursor lexer study measured a memory tradeoff.

### Code review instructions

Review `parseEnum`, `FunctionEmitter.matchGroup`, `FunctionEmitter.expr`, and `typed-world.js` state validation with the enum and distinct-type receipts open.

### Technical details

The compiler exposes enum and distinct type metadata alongside record layouts. The stock and enum-migrated artifacts are in `various/bytes` as compressed original bytes. The migration check compares exact bytes for Files and Agenda.

## Step 4: Measure compiler overhead under QuickJS

The historical frontend figure is 28.53 ms. This repetition uses the existing phase timer, revision-pinned compilers, and a single frozen Editor source. Each revision receives one warmup and 15 in-process measurements. The timer compiles the output without executing it.

### Prompt Context

See Step 1. The host acceptance calls for a 31.4 ms median. The physical compile gate is measured independently.

### What I did

- Timed `289281c`, `c5e2839` and `4eb08cb` under the in-process C/QuickJS harness, once pinned to logical CPU 6 and once unpinned with a repeated baseline.
- Ran a conditional inequality fixture through the staged register model and recorded its emitted instruction count.
- Retained raw observations under `various`.

### Why

Timing the old revision in the same session checks whether the historical baseline is reproducible. Instruction count describes the generated program while compiler timing measures the cost of producing it.

### What worked

The pinned medians were 55.89 ms for stock, 49.18 ms for E1–E5 and 53.59 ms for E1–E7. The unpinned run produced 46.16, 50.04, 44.50 and 45.86 ms, ending with a repeated baseline. The E5 overhead was 8.4–9.1% against the two baselines in that run. In the E4 fixture, both forms cost 11 instructions in model A and five in model B. Actual output used 18 instructions for direct inequality and 19 for negated equality.

### What didn't work

The 31.4 ms absolute host gate was not reproduced. Every baseline measurement with the same source exceeded it too. The first unpinned repeat stopped on `mkdir: cannot create directory '.../289281c': File exists` because the runner assumed distinct revisions. `mkdir -p` fixed the repeat.

### What I learned

The token-only phase moved between roughly 13 and 21 ms. The same-harness results support a limited relative comparison, and the physical board requires its own measurements.

### What was tricky to build

The historical timer extracts the tokenizer and signature rows from compiler source. Freezing the source, reactor and script revisions keeps those inputs comparable.

### What warrants a second pair of eyes

Check the range of baseline drift before claiming either an absolute speedup or completion of the absolute timing gate.

### What should be done in the future

Record the physical comparison when its serial evidence is available.

### Code review instructions

Run `scripts/03-time-quickjs.sh 289281c c5e2839 4eb08cb 289281c` under the same workstation conditions. Reproduce the E4 counts with `scripts/04-check-inequality-model.sh`.

### Technical details

The Editor source SHA-256 was `f37f60f3b0c646cd35f13c41bc893a136732ebe769e328cfb906b0fe7531a6ed`. Each revision used the same locally built world reactor.

## Step 5: Append an expanded loop update without a JavaScript argument limit

A for-loop's update can include a buffer literal write, which emits a separate store per UTF-16 unit. Thirty legal writes to a buffer fit well within the source limit and generate hundreds of thousands of bytes. The first implementation passed the whole operation array as arguments to a single `push` call, which exhausted Node's argument stack.

### Prompt Context

See Step 1. This correction qualifies E2 for large updates that the existing buffer-literal feature permits.

### What I did

- Reproduced the failure by loading the compiler from `62d829f` and compiling 30 writes of 1,022 code units each in one update expression.
- Appended generated operation cells individually and added the input to the differential test script.

### Why

A supported program's emitted instruction count can greatly exceed its source length. Calling `push` once per cell bounds the JavaScript argument stack regardless of expansion.

### What worked

The 31,488-byte fixture validates as a 275,538-byte Wasm module and compiles to a 371,348-byte raw RV32 image. The fixture condition is false, so qualification does not need to allocate the large output buffer in guest memory.

### What didn't work

The prior compiler's `compileTyped(source)` raised `RangeError: Maximum call stack size exceeded` on the same input in Node v24.18.0.

### What I learned

The language source bound alone cannot bound a call's argument stack when every source token can expand into multiple emitted operations.

### What was tricky to build

The regression needs several maximum-size literals to expose the spread limit, while each individual write and the total source must stay within the supported language limits.

### What warrants a second pair of eyes

Check that the append still occurs only after emitting the body and before the back-edge.

### What should be done in the future

N/A.

### Code review instructions

Read the append in `FunctionEmitter.loop` and run `scripts/01-check-functions-differential.mjs`. The result includes the expanded-update sizes.

### Technical details

Only the append method changed. Every emitted opcode and immediate stays in the same sequence.

## Step 6: Keep the research tools usable with the continuation compiler

Once Editor's source used async syntax, the standalone model and phase timing tools had to load the same compiler files as production. The tooling now uses the SDK descriptors exported by the loaded world wrapper, including awaitability. The phase runner retains a small table reader for the frozen E baseline, which predates that export.

### Prompt Context

See Step 1. The supervisor requested that the older instruction and timing scripts keep using the authoritative SDK declarations.

### What I did

- Loaded the continuation compiler in the instruction mix and staged register models.
- Added optional continuation loading in the phase timer so both frozen E and current Editor work.
- Verified that the instruction mix and historical model's actual image counter agree on all three applications.

### Why

Presence of an awaitable descriptor changes how a compiler may call the reactor. A script that copies only names, argument types and result types cannot compile async source using those imports.

### What worked

Both Node tools counted 22,292 then-current Editor instructions, 804 Files instructions, and 4,058 Agenda instructions. The QuickJS driver compiled the G3 working source to an 88,969-byte Wasm module. The frozen-driver recheck still produced the 88,255-byte stock Editor module for both E5 and its baseline.

### What didn't work

The first continuation-aware filter still removed the awaitable field while adding import indexes for the frontend-only phase. Spreading the descriptor before setting its index retained the field for that phase.

### What I learned

The measurement path is itself a caller of the frontend. The set of imports and the set of compiler scripts must agree with the application source it measures.

### What was tricky to build

The same C timer also boots old compiler snapshots. Those directories lack the async compiler by design.

### What warrants a second pair of eyes

Confirm that every production descriptor, including the three awaitable SDK operations, reaches both exact-count and model tooling.

### What should be done in the future

Run the historical timings against explicit revisions whenever comparing across separate changes.

### Code review instructions

Open the imports near the start of each model and the optional fourth compiler file in `04-compile-phase-timing.c`.

### Technical details

The E4 fixture still reports 19 versus 18 emitted instructions and equal register estimates of 11 and five after the tooling change.

## Step 7: Measure reuse of ordinary signatures after continuation rewriting

The complete G4 compiler reads function signatures once to check the original call graph and again to emit the rewritten program. The emitted ordinary signatures preserve their types and parameter names. The difficult part of reusing them is carrying a valid body position through the rewrite and keeping ABI indexes contiguous after async bodies are removed.

### Prompt Context

See Step 1. The supervisor asked for an isolated QuickJS comparison of `7b321a9` and `1357545` and for a separate measurement of compiler script evaluation. I coordinated shared ownership with the continuation implementer before staging the experiment.

### What I did

- Staged pre-G, G4, and a G4 signature-reuse prototype in temporary directories from frozen Git objects.
- Recorded each ordinary function's translated body offset during rewriting. The emitter registered those descriptors, checked generated signatures from the appended suffix, and performed the regular body and cycle checks.
- Compared exact Wasm, raw RV32, and linked ELF bytes for Editor and for interleaved ordinary and async source. Compared layouts, symbols, relocations, edges, order, and diagnostics.
- Timed linked native compilation with a shared P4 reactor. Separately timed `JS_Eval` in fresh QuickJS contexts using the firmware's file order.
- Retained the prototype, test harness, and raw receipts in the language ticket.

### Why

The original signature scan is required for the source-level graph. Skipping ordinary headers and body delimiters in the second scan addresses only duplicated work. The rest of continuation analysis remains, which means its contribution to the complete compiler call must be measured.

### What worked

The prototype reproduced the exact Editor artifacts as well as the interleaved fixture and four error cases. Linked CPU-time measurements bracketed G4 at 107.22–108.47 ms and the prototype at 100.65–103.54 ms. The same reactor and host timed pre-G at 75.36–77.18 ms. Within the linked profile, emission signature work fell from 5.887 to 0.675 ms. Separately, native compiler script evaluation rose from 4.515 ms to 7.579 ms between pre-G and G4. `typed-async.js` accounted for about 3.074 ms of native wall time in that measurement.

### What didn't work

The signature experiment missed the +10% linked compiler target even against the slower pre-G baseline. The wall-clock run also drifted strongly during a bracket, with its two pre-G native totals reaching 97.64 and 218.03 ms. The process CPU repeat used the same frozen sources and reactor and returned closer bracketing baselines. No production compiler changes came from this experiment.

### What I learned

Duplicated emission signatures are a real, local cost. The rewrite remains about 29–30 ms in the same linked profiles, with roughly 11 ms reading the original program, 5 ms scanning operations and 11 ms analyzing continuations. Evaluating the additional compiler script is smaller than that work on the host and requires a separate ESP32-P4 measurement for a board allocation.

### What was tricky to build

The translated opening brace is `writer.offset + originalBodyAt - nextOriginalCopyPosition`. A normal function can follow a removed async definition or have a task operation replaced inside its body. The writer's cursor must account for both. Retaining source ordinals without rebasing callable indexes would make forward calls point to the wrong function when an earlier async definition disappears.

### What warrants a second pair of eyes

Check that offset translation is computed before writing the first replacement in each ordinary function and that dead async declarations do not leave unused slots in the ordinary function table. Interpret individual phase rows as nested durations.

### What should be done in the future

Any separate board phase experiment would time each bundle read and `JS_Eval` around the existing `eval_file` entry, then record the compiler call independently. The current cold boot receipt measures the complete port entry.

### Code review instructions

Open the signature-reuse report, review the two prototype transforms in `scripts/05-signature-reuse-experiment.py`, and rerun `scripts/09-run-signature-experiment.sh` with the bundled control reactor ELF.

### Technical details

Pins were `289281ccf97ebe83196ab3c2c38845b99a24a7be`, `13575450d0cd405db2861a8e6e5fecbcbd9904d6`, and `7b321a9163bf31c87461484edc79b6627147a315`. The three commit times and reactor hashes are in `various/signature-reuse/environment.txt`.
