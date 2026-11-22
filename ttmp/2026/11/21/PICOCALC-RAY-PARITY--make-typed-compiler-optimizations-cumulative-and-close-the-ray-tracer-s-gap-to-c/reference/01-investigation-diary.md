---
Title: Investigation diary
Ticket: PICOCALC-RAY-PARITY
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: picocalc-os/compiler/typed-rv32.js
      Note: planLocations now walks raw tape cells (OPERAND_CELLS)
    - Path: ttmp/2026/11/21/PICOCALC-RAY-PARITY--make-typed-compiler-optimizations-cumulative-and-close-the-ray-tracer-s-gap-to-c/scripts/01-open-compiler-session.py
      Note: Loads the compiler and all Typed inputs into a trace-REPL session
ExternalSources: []
Summary: "Chronological record of making the Typed compiler's qualified optimizations cumulative and starting the work toward a ray tracer competitive with C."
LastUpdated: 2026-11-21T19:45:00-05:00
WhatFor: "Resume and review the PICOCALC-RAY-PARITY implementation"
WhenToUse: "Read the latest step before continuing; earlier steps hold the evidence for each decision"
---

# Investigation diary

## Step 1: Open the ticket and test what the trace REPL can do for compiler work

This ticket follows the retrospective published to go-go-parc at `e01a6a1`, "The Typed ray tracer odyssey". That review found that three days of labs had produced real compiler improvements, but each one lived behind an opt-in option, in a patch file or in a compiler fork pinned to one function. The work here makes those improvements cumulative and starts the compiler changes the review ranked highest. The user also asked me to use the trace REPL wherever possible and to report what would make it more useful. This step established what the REPL can do before I relied on it.

The REPL turned out to be more useful as a persistent JavaScript sandbox than as an evidence query service. Its query language covers three fixed archive formats. Its goja VM, however, can hold the Typed compiler itself. After chunking past a 64 KiB cell limit, I compiled the ray tracer inside a session and timed each compile option there. That located the planner's cold-compile cost within minutes.

### Prompt Context

**User prompt (verbatim):**

> Ok, now address all these things properly, in a new docmgr ticket, and clean things up and get us going for the actual proper compiler improvement. Create  a detailed analysis / design /
>   implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api
>   references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
>   commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

Follow-up messages during the same turn (verbatim): "once you're done with the report"; "use the REPL whenever possible / give me your verdict on what would make it more useful as you go in a report"; "are you using the REPL to analyze LLVM outputs? or are planning to? what are you using it for?". Earlier in the turn: "basically I want a super fast typed JS raytracer that is competitive with the C version" and "there is no production, this is all full experimental".

**Assistant interpretation:** Create a ticket that turns the retrospective's recommendations into work, starting with making qualified optimizations the default and with the next real compiler improvement. Write an intern guide to the whole system and upload it. Use the trace REPL for analysis and keep a running verdict on it.

**Inferred user intent:** Stop producing isolated studies. Get a compiler whose improvements accumulate, measured against C, with documentation good enough for a newcomer to continue.

### What I did

- Created the ticket with `docmgr ticket create-ticket --ticket PICOCALC-RAY-PARITY`.
- Found five trace-REPL services already running (ports 3791–3795) by probing `POST /sessions` and reading `ps`. The SHADOW-LLVM capture is mounted on 3795; ROW-IR plus PIE-LOOPS on 3791/3792; the two SIMD-lab services on 3793/3794.
- Queried the SHADOW-LLVM capture on 3795: `run.functions()` returned `["checked_read","checked_shadow","kernel"]`; alloca, call and phi changes across the middle timeline of `kernel`.
- Loaded `typed-wasm.js`, `typed-rv32.js` and `typed-pie-loops.js` into a session. `typed-wasm.js` is 70,183 bytes and the direct eval returned `{"ok":false,"error":"source exceeds 64 KiB"}`, so I wrote a loader that appends the file to a global string in 30,000-character cells and evaluates it with `(0, eval)(...)`.
- Compiled `worlds/raytrace/raytrace.typed` in the session and timed each compile option with a median of 15 compiles.

### Why

- The retrospective's plan has many host-only steps: byte-identity checks across apps, compile-cost checks, instruction profiles. Doing them in one persistent session avoids rebuilding the context for each question, which is what the REPL was built for.

### What worked

- The compiler runs unmodified in goja. `typedRv32.compile(raySource, [], 65536)` produced the 9,564-byte stock image, the same size SCALAR-BREAKDOWN recorded for the stock ray image.
- Compile time per option, median of 15 in goja (ms): stock 19.55, guarded 19.05, forward 24.08, capacity 24.08, homes 25.05, `operandLocations: {}` 24.32, all qualified 27.06. `operandLocations: {}` enables no policy and still costs +24%. The planner's analysis is the cost, not any policy. This matches the P4 log of OPERAND-HOMES, where every single policy cost 104–106 ms.

### What didn't work

- `q.run(run.functions())` failed with `[notAPlan] q.run expects a plan or an object of named plans; got an array of 3 values`. This is the same interface error the persona studies recorded. Calling `run.functions()` directly works.
- The SHADOW-LLVM kernel shows zero alloca changes on `kernel`, because SROA ran while the function was still named `checked_shadow`. GlobalOpt renamed it at middle ordinal 17. A timeline is per name, so the promotion is invisible unless one knows the earlier name.
- The help text on port 3795 says "queries over the PicoCalc LLVM row archive" although that service mounts the shadow capture.

### What I learned

- goja exposes the same allocation-heavy compiler costs as QuickJS on the P4. V8 hides them: SHADOW-CODEGEN measured +0.25 ms on Node for a change that cost milliseconds on the board.

### What was tricky to build

- The cell limit applies to data as well as code. The assembled Editor source is larger than 64 KiB and returned `HTTP Error 413: Request Entity Too Large`. `scripts/repl_client.py` binds long strings in chunks.

### What warrants a second pair of eyes

- Compile timings in goja are a proxy. The P4 numbers must be measured on the board before any claim about cold compile.

### What should be done in the future

- The REPL observations are collected in the analysis document of this ticket.

### Code review instructions

- `scripts/repl_client.py` and `scripts/01-open-compiler-session.py`.

### Technical details

- Session setup: `python3 scripts/01-open-compiler-session.py 3795 --baseline HEAD` prints a session ID. Bindings: `raySource`, `worlds.{chess,editor,agenda,files}`, `sources[path]`, `typedRv32`, `typedRv32Base`, `typedWorld`.

## Step 2: Remove the planner's tape-decoding cost with byte-identical output

`planLocations` in `typed-rv32.js` called `typedWasm.decodeNumericOperations(fn.code)`, which builds a record object, an operand array and a copy of a source span for every operation. It also allocated `[0x36,0x3b,0xf2]` once per operation. I replaced the decode with a direct walk over the raw tape cells, using a 256-entry table of operand cell counts. The forwarding pattern, a `local.set` followed by a checked address that consumes the same local, is now detected during the walk. It is resolved after the walk, once the read counts are final.

The result is byte-identical on every input that compiles: 98 compiles across 14 inputs and 7 option sets, with zero mismatches. In goja, the planner overhead on the ray tracer fell from +9.1 ms to +1.3 ms per compile.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Fix the 37% cold-compile cost before making the operand-location policies the default for every app.
**Inferred user intent:** Defaults must not make cold builds of Editor and Files noticeably slower.
**Commit (code):** recorded in Step 3.

### What I did

- Added `OPERAND_CELLS` (an `Int8Array(256)`) and rewrote `planLocations` (`picocalc-os/compiler/typed-rv32.js`). Unknown opcodes and truncated operations raise the same errors as the decoder.
- Wrote `scripts/02-planner-equivalence.{js,py}`: for every input, compile with `typedRv32Base` (HEAD) and `typedRv32` (working tree) under seven option sets (stock; forward; capacity; homes; all three; all three plus guarded returns; the same buffered) and compare image bytes or error messages.
- Inputs: the ray tracer, the assembled Chess, Editor, Agenda and Files worlds compiled with `typedWorld.imports`, and all 33 `.typed` files standalone.
- Wrote `scripts/03-compile-cost.py`: interleaved base/candidate × stock/qualified compiles, one compile per cell, medians.
- Ran the five affected node test files: `node --test tests/typed-rv32.test.mjs tests/typed-pie-loops.test.mjs tests/typed-inspect.test.mjs tests/typed-wasm-inspect.test.mjs tests/sysapps.test.mjs`.

### Why

- The P4 measured +37% cold compile on the ray tracer for any operand-location policy. Making these policies the default without fixing it would slow every app's cold build.

### What worked

- Equivalence (`various/01-planner-equivalence.json`): 38 inputs, 14 compile, 98 identical images, 168 identical errors, 0 mismatches. Editor compiled after loading `typed-async.js`, and its images are identical in all seven arms (75,812 B stock, 74,188 B qualified).
- Tests: 36 pass, 0 fail.
- Compile cost in goja (`various/02-compile-cost-goja.json`, medians, ms):

| Input | Base stock | Base qualified | Candidate stock | Candidate qualified |
|---|---:|---:|---:|---:|
| Ray tracer (n=9) | 26.5 | 35.6 | 28.5 | 29.8 |
| Chess (n=5) | 306.2 | 334.3 | 316.8 | 310.7 |
| Editor (n=3) | 743.9 | 840.9 | 744.7 | 811.2 |

An earlier run in another session gave ray 19.0/24.3/19.3/21.0, Chess 214.8/252.2/218.7/223.7 and Editor 563.1/610.6/568.4/584.2. Host load changes the absolute values. The reduction in planner overhead is consistent across both runs.

### What didn't work

- Running the whole equivalence in one cell stopped with `cell stopped at its evaluation deadline (at most 15s, including the wait for this session)`. The driver now evaluates one input per cell.
- My first Editor assembly failed in both compilers with `569:1: expected function`. Editor uses `async function`, which needs `typed-async.js` loaded before compiling.

### What I learned

- Only 9 of the 33 `.typed` files compile standalone. The rest are parts of multi-file worlds (`worlds/chess/source.list`, `worlds/editor/source.list`) or need SDK imports. Equivalence tests must compile assembled worlds.

### What was tricky to build

- Forwarding needs each candidate's final read count. The old code ran a second loop over the decoded records. The walk records candidates (local id and the tape offset of the producing constant or set) and filters them after the walk. Insertion order into `scores` is unchanged, which matters because `homes` sorts by score and ties keep insertion order.

### What warrants a second pair of eyes

- Editor still shows +66 ms (n=3) for the qualified options with the new planner in the second run, against +16 ms in the first run. The remaining overhead may come from guarded-return summaries or from noise. The P4 trial decides.

### What should be done in the future

- Measure cold compile on the P4 for stock and qualified with the new planner.

### Code review instructions

- `git diff` on `picocalc-os/compiler/typed-rv32.js`, function `planLocations`.
- Reproduce: `S=$(python3 scripts/01-open-compiler-session.py 3795 --baseline <rev-before-change>)`, then `python3 scripts/02-planner-equivalence.py 3795 $S out.json`.

### Technical details

- Operand cells per opcode are taken from `inspectOperations` in `typed-wasm.js` (numeric mode reads one cell per operand format).

## Step 3: Make the qualified options the default and repair the historical replays

The default compile path now applies guarded-return inlining and all three operand-location policies. `{policy: "stock"}` reproduces the previous default byte for byte for control arms. Before changing the default I needed a semantic gate for the apps whose code generation would change. The 24 historical replays were that gate, but 13 of them, all Editor, had been failing since November 20 for a reason unrelated to the compiler. Repairing them took most of this step.

All 24 replays pass on the commit before the change and on the new default. The ray profiler reproduces the C-verified opening-frame digest under both policies. The default plus `pie-empty` emits exactly the image that PICOCALC-OPERAND-HOMES timed on the P4.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** "Clean things up" means improvements must accumulate: the next experiment's control must already contain them.
**Inferred user intent:** Stop measuring every new idea against the unimproved compiler.
**Commit (code):** recorded in Step 4.

### What I did

- Added `POLICIES` (`default`, `stock`) and `resolveOptions` to `typed-rv32.js`. `compile` resolves the policy first. Explicit fields override it, and explicit `undefined` is ignored. Exported as `typedRv32.policies`.
- Updated tests: two tests that examine stock behaviour now pass `policy: "stock"`. The pinned PIE test checks both the SIMD-LAB image (`9a4a2356…`, `pie-empty` over stock) and the OPERAND-HOMES image (`2e33bb64…`, `pie-empty` over the new default). A new test covers the policy API.
- Wrote `picocalc-os/tools/rv32-interp.js` (dependency-free interpreter with calling-convention checks), `tools/typed-ray-bench.js` (opening-frame memory and per-function profile) and `tools/typed-ray-profile.mjs` (CLI with SHA-256 digest check).
- Ran the 24 replays from `PICOCALC-COMPILER-THESIS/scripts/lowering/replay.sh`, found the Editor failures, and made repaired copies in this ticket: `scripts/04-replays.sh`, `04-check-editor-world.mjs`, `04-editor-world-driver.c` and `04-libgcc-helpers.c`.

### Why

- A default that changes Files, Agenda and Editor code needs an end-to-end check of those apps. The replays compare RV32 execution in `cji/build/rv32/rv32emu` with WebAssembly.

### What worked

- Replays: `various/03-replays-baseline-25cd108.log` 24/24 PASS on the planner commit; `various/04-replays-default-policy.log` 24/24 PASS on the new default.
- Tests: `node --test` over the five compiler and app test files gives 37 pass, 0 fail. `make -s test-apps`: every suite reports 0 failures.
- Profile (`various/05-ray-profile-default.json`): stock 15,532,634 instructions, default 12,717,463 (−18.1%). Both reproduce the output digest `430f0d50…`. Per function, the interpreter reproduces the earlier labs' counts exactly: `typedRayInShadow` 5,528,397, `typedRayComputeRow` 3,608,697, `typedRayPack` 1,740,800. The frame total is 10 instructions above TYPED-RAY's 15,532,624. I did not find the cause, and it does not affect any comparison made here.

### What didn't work

- The first baseline run (`replay.sh` unchanged) gave 11 PASS and 13 FAIL. Every Editor world check failed with `rv32emu: it links to chess_psix_encode, which picocalc-os does not give a module`.
- Adding `chess-psix.c` gave `rv32emu: it links to __floatsidf, which picocalc-os does not give a module`. Adding `-lgcc` failed in the shared link (`collect2: error: ld returned 1 exit status`).
- `riscv32-esp-elf-nm -u` on a probe reactor listed `__divdi3`, `__floatsidf`, `memcpy`, `memmove`, `snprintf`, `strcmp`, `strlen`. My first helper file used 64-bit variable shifts, which GCC compiled into a call to `__ashldi3`: `rv32emu: it links to __ashldi3`. Rewritten on 32-bit halves, the next missing symbol was `strcmp`. Adding it made the replay pass: `{"inputBytes":123,"matchingWasmFramebuffers":3,"rv32Open":true,...}`.

### What I learned

- The replays had been silently broken since the Chess PSIX commit to `sdk/typed/world.c` on November 20. No ray lab ran them. A default change during that period would have had no Editor gate.

### What was tricky to build

- Helpers that implement libgcc routines must not need libgcc. 64-bit shifts by a variable amount and 64-bit division compile to calls at `-Os` on RV32. The helpers in `04-libgcc-helpers.c` use explicit lo/hi words. They were checked on the host against native `(double)` conversion and 64-bit division on 4,000,000 inputs, including `INT32_MIN`, `INT64_MIN+1 / -1` and sign combinations, with 0 mismatches.

### What warrants a second pair of eyes

- `resolveOptions` copies only defined fields. `{operandLocations: undefined}` therefore keeps the default. That is intentional, so that callers which forward an optional field do not silently drop to stock, and a test covers it.
- The default now changes the native code of every Typed world on the next firmware build. The 24 replays and the ray digest are host evidence. A board trial (task "Device") is still owed.

### What should be done in the future

- Promote the repaired replay suite out of ticket directories into `picocalc-os/tests/`, so it runs with `make`.

### Code review instructions

- `picocalc-os/compiler/typed-rv32.js`: `POLICIES`, `resolveOptions`, `compile`.
- `picocalc-os/tests/typed-rv32.test.mjs`: last test. `tests/typed-pie-loops.test.mjs`: pinned digests.
- Run: `node --test picocalc-os/tests/typed-*.test.mjs`; `node picocalc-os/tools/typed-ray-profile.mjs`; `bash $T/scripts/04-replays.sh $GCC $PWD/cji/build/rv32/rv32emu`.

### Technical details

- GCC: `/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/riscv32-esp-elf/bin/riscv32-esp-elf-gcc`. Emulator: `cji/build/rv32/rv32emu` (built 2026-11-17).
