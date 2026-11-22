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

## Step 4: Callee-saved homes and direct home reads (Phase 1)

Phase 1 of the guide lets a framed function keep hot locals in registers across calls. Before this step only frameless-capable leaves got register homes, and only in spare argument registers. The first version, which used callee-saved registers alone, made the frame slower. The second change, letting a consumer read a home register directly instead of copying it to the operand stack, is what made the registers pay. Together the two options cut the opening frame from 12,717,463 to 11,098,863 instructions (−12.7%) and the Chess engine oracle from 275.3 M to 248.6 M (−9.7%). Both still reproduce their references exactly. The options are committed as opt-in. Making them the default waits for the board trial in Step 5.

**Commit (code):** 3213028 — "feat(rv32): opt-in callee-saved homes and direct home reads". Step 3's code was eaf0872, and the planner fix in Step 2 was 25cd108.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Start the compiler work itself: the stack-traffic factor of the C gap, measured on the host and then on the P4.
**Inferred user intent:** Real progress on the ray tracer's native speed, with each gain kept in the default.

### What I did

- `planLocations`: new option `saved`. `weigh(local, scale)` estimates executions per call. It is ×4 inside a loop and, for saved homes only, halved under each enclosing `if` (at most three levels). A homed write counts half, since it turns a store into a move, while a homed read disappears.
- `planSavedHomes(fn, scores, homes, leaf, capacityCached)`: a leaf first homes parameters in their incoming a-registers and takes the free a-registers (cost 0). Then any function takes s1, s2–s11 (cost 2: one save, one restore) for locals whose score exceeds `SAVED_MARGIN × cost` (`SAVED_MARGIN = 2`).
- `FunctionCode.lower`: saves the used s-registers after `sw ra` at `frame-8-4k` and restores them before `lw ra`. The frame grows by one word per saved register.
- New option `direct`. `local.get` of a homed local pushes a pending *direct* entry (`this.direct[depth] = home`) instead of `mv t_d, home`. `pop` returns the home register. `materialize(home?)` copies pending entries into their ordinary stack registers or spill slots. It runs before every control opcode `0x02`–`0x0f`, so both arms of a join agree on locations, and before a write to the same home. Calls do not spill pending entries: a function that calls has homes only in callee-saved registers.
- Swept the margin over 1–4 (`free[0].cost * m`) on the ray frame and chose 2.
- Wrote `scripts/05-chess-engine-oracle.mjs`, a copy of the TYPED-CHESS engine oracle. It adds `TYPED_RV32_OPTIONS` and `RV32_STEPS`, so the Chess engine is a holdout measured in instructions.
- Measured goja compile cost for stock, the old default and the candidate in a REPL session (`various/09-compile-cost-candidate-goja.json`).
- Added a test (`tests/typed-rv32.test.mjs`, last). A framed caller keeps four hot locals across calls. The test asserts that an s-register is saved, that the result equals stock under the interpreter's callee-saved, sp and ra checks, and that the ray frame keeps its digest with fewer instructions.

### Why

- The default profile spent 2.54 M of 12.7 M frame instructions on stack loads and stores. `typedRayComputeRow` and `typedRayLitRow` call functions inside their loops, so the leaf-only homes could not apply.

### What worked

| arm (opening frame, host interpreter) | instructions | stack loads | stack stores | image |
|---|---:|---:|---:|---:|
| stock | 15,532,634 | | | 9564 B |
| default at eaf0872 | 12,717,463 | 1,619,948 | 915,474 | 8632 B |
| + direct only | 11,955,175 | 1,619,948 | 915,474 | 8280 B |
| + saved only (first cost model) | 13,175,107 | 701,963 | 675,778 | 9096 B |
| + saved + direct (first cost model) | 11,246,469 | 676,363 | 650,178 | 8040 B |
| + saved + direct, margin 2 (committed) | **11,098,863** | 690,229 | 643,287 | 8048 B |

- Per function (committed candidate against the old default): InShadow 4,232,582 → 3,787,258, ComputeRow 3,140,941 → 2,539,646, LitRow 1,386,080 → 1,029,280, Pack 1,740,800 → 1,561,600. Pixel is unchanged at 1,564,356.
- Margin sweep (saved + direct): m=1 11,173,912; **m=2 11,098,863**; m=3 11,393,229; m=4 11,446,608.
- Chess engine (`various/11-chess-engine-candidate.json`, all 6981 words match): stock 289,388,025; old default 275,326,071; direct only 275,214,328; saved + direct 248,624,574 (−9.7%), image 21,372 → 19,656 B.
- Byte identity: `02-planner-equivalence.py` against eaf0872 gives 38 inputs, 98 identical outputs, 168 identical errors and 0 mismatches. stock and the current default are unchanged.
- Tests: `node --test picocalc-os/tests/*.test.mjs` gives 140 pass, 0 fail.
- Compile cost in goja (median ms; ray n=9, chess n=5, editor n=3): ray 50.1 / 54.6 / 55.8, chess 742.3 / 796.8 / 806.5, editor 838.2 / 879.1 / 830.2 for stock, old default and candidate. The candidate adds about 1% to the old default on ray and Chess. The Editor difference is within noise at n=3.

### What didn't work

- Saved homes alone, with the first cost model (`score > cost + 1`, writes counted fully, no `if` discount): 13,175,107 instructions, **3.6% worse** than the default, although stack loads fell from 1.62 M to 0.70 M. InShadow rose 4,232,582 → 4,622,122 and Pixel 1,564,356 → 1,717,956. InShadow is called 19,477 times per frame, and its remaining 255 k loads and 253 k stores are mostly the new save/restore pairs. Without direct reads, every homed read still cost a `mv` into the operand register, so a home only saved the difference between `lw` and `mv`, which is nothing on an in-order core counted in instructions.

### What I learned

- A register home pays only if reads stop being copies. The stack-machine lowering turned "load from slot" into "move from register", which has the same instruction count. Removing the copy (direct reads) was worth 0.76 M instructions by itself on the old homes. It is the change that made callee-saved homes profitable.
- The static per-call estimate overestimates rarely taken branches. Halving under each `if` and asking for twice the save cost fixed InShadow's regression. Pixel went back to exactly its old count because it no longer claims any s-register.

### What was tricky to build

- Pending direct reads must not survive a change of control flow. A `br_if` out of a block reads its condition from a stack register in the target's view. Materializing at every control opcode is conservative: it costs a `mv` when a branch condition is a homed local. It is correct because block results and join points then always find operands in `STACK_REGISTERS`.
- A write to a home while an earlier read of it is still pending would change the value that the pending read sees. `writeLocal` materializes pending entries of that home first. Typed has no assignment expressions, so this cannot occur in the current corpus, but nothing in the backend prevents it.
- `resultRegister()` returns `STACK_REGISTERS[depth]` or T5, never a home. No consumer therefore writes its result into a register it popped as a direct read. I checked every `this.pop(` site (lines 159–402).
- PIE-lowered functions do not receive `locations`. `typed-pie-loops.js` uses a0 and a2–a7, which would collide with leaf a-register homes, but only `lowerLeaf` and `FunctionCode` paths receive plans.

### What warrants a second pair of eyes

- `SAVED_MARGIN = 2` was chosen on the ray frame, the workload it is evaluated on. The Chess engine is the holdout. It improved by 9.7% without tuning, but a different margin may suit it better. I did not sweep on Chess, so that it stays a holdout.
- The materialization before every control opcode is a known cost. A later change can keep direct entries across `br_if` when the target block has no results.

### What should be done in the future

- Board trial (Step 5) against the 46.05 ms OPERAND-HOMES frame. Then flip the default and update the `2e33bb64` pin.
- Branch on homed locals directly (`beq home, zero`) instead of materializing them first.

### Code review instructions

- `picocalc-os/compiler/typed-rv32.js`: `weigh` and the `ifs` counter in `planLocations`; `SAVED_MARGIN`, `planSavedHomes`; `FunctionCode`: `direct`, `materialize`, `pushHome`, `pop`, `push`, `writeLocal`, the call spill loop, `step` (the control-opcode materialize and `case 0x20`), and `lower` (s-register save and restore).
- Run: `node picocalc-os/tools/typed-ray-profile.mjs --options '{"inlineGuardedReturns":true,"operandLocations":{"forward":true,"capacity":true,"homes":true,"saved":true,"direct":true}}'`, and `TYPED_RV32_OPTIONS='{…}' node $T/scripts/05-chess-engine-oracle.mjs $GCC $PWD/cji/build/rv32/rv32emu`.

### Technical details

- s-register numbers: s1 = x9, s2–s11 = x18–x27. s0 (x8) is never used.
- Frame size: `(4*(locals + spillDepth + saved + 1) + 15) & -16`. Saved register k is at `frame - 8 - 4k`, below `ra` at `frame - 4`.

## Step 5: Time Phase 1 on the P4 and make it the default

This step measured the Phase 1 options on the board against the image that PICOCALC-OPERAND-HOMES timed. All four gates passed: host profile and digest, the 24 replays, the node tests and the board. The default policy now includes `saved` and `direct`. On the P4:

- **Full frame without PIE:** 45.14 → 39.49 ms (−12.5%). Scalar C takes 7.73 ms, so the gap fell from 5.84× to 5.11×.
- **Shadow predicate:** 277.5 → 247.2 cycles per call (−10.9%), against 136.0 cycles for checked C.
- **Chess evaluation:** −11.1%.
- **Cold ray compile on the device:** 8.2% slower.

The device was restored to the playable firmware and passed its health check.

**Commit (code):** recorded in Step 6.

### Prompt Context

**User prompt (verbatim):** see Step 1. In the meantime the user asked for a REPL subagent and a reorganization design. Those are recorded in PICOCALC-TRACE-WORKBENCH and PICOCALC-REPO-LAYOUT.
**Assistant interpretation:** Make Phase 1 the new control, once the board confirms it.
**Inferred user intent:** Progress that accumulates.

### What I did

- `scripts/06-stage-board.py BUILD` stages the SHADOW-CODEGEN board harness with four modes (`various/07-board-modes.json`): 0 = earlier default + `pie-empty` (must reproduce `2e33bb64…`), 1 = candidate + `pie-empty`, 2 = earlier default, 3 = candidate. Each mode spells out every field. Built with ESP-IDF 5.4.2 (`various/08-board-build.log`). Images: ray 9540, 9032, 8632 and 8048 B; Chess 1868 B (modes 0 and 2) and 1764 B (modes 1 and 3).
- Ran `PICOCALC-SIMD-LAB/scripts/ray/02-run-board.py --restore /tmp/picocalc-scalar-breakdown-verified/build --restore-sha e7b771aa… --app …/simd-lab.bin --deadline 400`. It verifies the playable image on flash, writes and verifies the diagnostic app, collects `SIMDLAB BEGIN…END`, restores and verifies the playable app, and checks health. The restore build was found by hashing every `picocalc-os-p4.bin` under `/tmp` against the digest in OPERAND-HOMES' receipt.
- `scripts/07-import-board.py CAPTURE BUILD` checks row counts (pred 672, frame 1080, chess 72, cold 3×36), image sizes against the manifest, uniqueness and the restored digest. It writes `various/13-board/{rows.json,images.json,receipt.json,bench.log.gz}`.
- `scripts/08-score-board.{py,js}` scores the rows in a trace-REPL session (port 3795): a median of per-block percentage savings and wins out of 6, as in OPERAND-HOMES' `05-query.js`. Output: `various/14-board-scores.json`. I scored Chess in the same session.
- With the default changed in the working tree, ran the 24 replays (`various/12-replays-candidate-default.log`).
- Changed the default (`POLICIES.default.operandLocations` gains `saved: true, direct: true`), repinned `tests/typed-pie-loops.test.mjs` to `3ea6af69…` while keeping `2e33bb64…` as an explicit-options pin, and updated two tests in `tests/typed-rv32.test.mjs`.
- Fixed one test failure (below) in `planLocations`.
- Updated the intern guide: Section 4.2, the profile table in Section 5, pins in 6.1, the C comparison in 7, a new paragraph in 8, and a status block for Phase 1.

### Why

- Host instruction counts do not predict cycles on the P4's in-order pipeline exactly. Moves, loads and branches have different costs. The default may change only after a paired board run.

### What worked

Board results, paired over 6 blocks (median of per-block savings; wins of 6):

| metric | control | candidate | saved | wins |
|---|---:|---:|---:|---:|
| frame, `pie-empty` (mode 0 → 1), µs | 46,011.5 | 42,559 | 7.50% | 6 |
| frame, scalar (mode 2 → 3), µs | 45,144 | 39,487.5 | 12.53% | 6 |
| primary pass, scalar, µs | 13,135.5 | 10,106 | 23.05% | 6 |
| shadow predicate, cycles per call | 277.49 | 247.24 | 10.87% | 6 |
| Chess evaluate, cycles per call | 6,232.4 | 5,553.0 | 11.07% | 6 |
| ray cold compile (QuickJS on P4), µs | 307,022 | 332,106 | −8.19% | 0 |
| Chess cold compile, µs | 75,827.5 | 79,050 | −4.26% | 0 |
| ray compile peak, bytes | 878,840 | 878,840 | 0 | — |

- All 12 scenes improved in mode 0 → 1, by 6.77% to 7.90%, each with 6/6 wins.
- References in the same firmware: scalar C frame 7,728.5 µs, checked C predicate 136.0 cycles. Mode 0's median of 46.01 ms reproduces OPERAND-HOMES' 46.05 ms.
- Replays under the candidate default: 24/24 PASS. Node tests after the fix: 140 pass, 0 fail. Default profile: 11,098,863 instructions, digest `430f0d50…`.
- Diagnostic app SHA-256 `03bbf5426e6d8134832b31118f1b913ca5aa0557a639b0fd042e509feb744145`. Restored `e7b771aa…` and passed the health check: eight worlds, painter compiles 1, no rejects.

### What didn't work

- 12 of 48 cold-compile rows failed with `SHERROR compile SyntaxError: invalid property name`. `cold.c` formats the options into `char cell[180]` with `snprintf`. Mode 1's options JSON with `"pieLoops": "pie-empty"` and five location fields is longer than that, so QuickJS evaluated a truncated literal. The cold compile of mode 3 (identical except for `pieLoops`) is reported instead. The importer asserts exactly this failure.
- After the default changed, `the framed backend still diagnoses an unsupported numeric operation` failed with `Error: unknown Typed inspection opcode 255` thrown from `planLocations` (`typed-rv32.js:571`) instead of the emitter's `unsupported RV32 operator 255`. Before Phase 1 the planner returned early for tapes without `0xf1`. With `saved` it walks every tape, and it threw on the test's corrupted opcode. It now returns `null` for an opcode it does not know, so the emitter reports the error.

### What I learned

- With the new default, `pie-empty` is a 3.07 ms *loss* per frame (42.56 against 39.49 ms). `typed-pie-loops.js` emits a packed function without any operand-location plan, so `typedRayComputeRow` loses its homes when it is packed. The primary pass shows it: 23% saved without PIE, against 6.8% with it.
- The board's cold-compile cost (+8.2%) is four times the goja estimate (+2.2%). The extra planning is cheap in goja but not in QuickJS on the P4. At 5.66 ms saved per frame, the 25 ms of extra compile pays for itself after five frames.

### What was tricky to build

- The board harness exists only as copies inside tickets. Staging it means string-replacing two sections of SHADOW-CODEGEN's `01-images.mjs`, as OPERAND-HOMES did. PICOCALC-REPO-LAYOUT Section 5.1 designs the replacement.

### What warrants a second pair of eyes

- Mode 1's cold-compile cost is not measured directly. It is assumed to be close to mode 3's plus the PIE recognizer's earlier cost of about 70 ms.
- The playable firmware on the device still predates the new default. A new playable build must be qualified separately (task xxxn), following the TYPED-CHESS recipe.

### What should be done in the future

- Give PIE-lowered functions the scalar plan, or stop recommending `pie-empty`.
- Separate prologue/epilogue saves from body stack accesses in `rv32-interp`'s classifier.
- Fix `cold.c`'s fixed buffer in the promoted harness (REPO-LAYOUT Phase A).

### Code review instructions

- `picocalc-os/compiler/typed-rv32.js`: `POLICIES.default`, and the unknown-opcode return in `planLocations`.
- `picocalc-os/tests/typed-pie-loops.test.mjs`: the two ray pins. `tests/typed-rv32.test.mjs`: `qualified` and the leaf-homes comparison in the last test.
- Re-score: `python3 $T/scripts/08-score-board.py 3795`.

### Technical details

- Board run directory (scratch, not kept): `/tmp/claude-1000/…/scratchpad/board-run-1`. Its `bench.log` is preserved as `various/13-board/bench.log.gz`.
- Frame rows: `SHROW frame <fixture> <phase> <block> <arm> <µs>`, where arm 0 is scalar C and arm 1+m is mode m. Predicate rows: `SHROW pred <fixture> <kind> <block> <arm> <calls> <cycles>`, where arms 0–2 are C variants and arm 3+m is mode m. Chess compares arms 0 and NMODE−1.

## Step 6: Instruction selection (Phase 1b)

After Phase 1 I classified every instruction the opening frame executes, using the interpreter's per-word counts. The waste was in instruction selection, not register allocation. Of 11.10 M instructions:

- 1.79 M were `li` loading a literal for the very next operation.
- 1.10 M were `mv`.
- 735 k were `jal` instructions. Every conditional branch was an inverted short branch over a jump.
- 222 k were divides, 217 k of them by constants (255, 8, 4, 16, 2, 3).

The new option group `select` addresses each of these. It cut the frame to 9.00 M instructions. On the P4, the frame fell from 39.48 to 31.51 ms (−20.2%, all 12 scenes and 6/6 blocks), the shadow predicate fell from 247.7 to 212.8 cycles, and Chess evaluation was 31.2% faster. Cold compile was unchanged. `select` is now the default.

**Commit (code):** b3bc86f, "feat(rv32): opt-in instruction selection (select option group)". The default change is recorded in Step 7.

### Prompt Context

**User prompt (verbatim):** "Continue with your work, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)". The user also asked for the REPL work to go to a subagent and, later, for that subagent to write a vault report. Both are handled in PICOCALC-TRACE-WORKBENCH.
**Assistant interpretation:** Continue toward C parity on the ray tracer, letting the measurements choose the next change.
**Inferred user intent:** A fast Typed ray tracer.

### What I did

- Wrote a scratch classifier: it compiles the frame, runs it, and sums executed words by class (`li`, `mv`, ALU, loads and stores through `sp`, branches, `jal`, mul, div). A second scratch script counts divides per function: Pack 153,600, Pixel 43,747 div and 19,477 rem, SphereScale 5,488 (variable divisor).
- Implemented `select` in `typed-rv32.js`:
  - `selectConstant` looks one operation ahead from a literal. It handles `IMMEDIATE_FORMS` (add, sub, mul by 1 or 2^k, shl, shr_s, lt_s, le_s, ge_s, ge_u, eq), reads a literal 0 as `x0` through `pushHome(ZERO)`, and hands division to `divideByConstant`.
  - `divideByConstant` uses a biased shift for 2^k, `mulh` with a Hacker's Delight magic number (`divisionMagic`, exact in doubles) for other positive constants, and a mask for remainder by 2^k.
  - `fuseBranch` and `PREDICATES` are ported from PICOCALC-RV32-BRANCH `02-predicate-fusion.patch`. I added `ne` and a `materialize()` before the branch, which direct reads require.
  - `branch()` emits an in-range backward branch directly.
  - `destination()` and `result()` compute a result in its home when the next operation is `local.set` of a homed local, except at a forwarding point.
  - `LeafCode` uses `pushHome(A0 + i)` under `leafParams`.
  - `constant()` drops the `addi rd,rd,0` after a `lui` whose low part is zero, only under `immediates`, which keeps stock byte-identical.
- `tools/rv32-interp.js` gained `mulh` and `mulhu`. The first division profile faulted with `Rv32Fault: unsupported M instruction at 0x5dc`.
- Tests: a differential test (`instruction selection matches stock code…`) runs three functions on 65 edge-case and pseudo-random inputs. It covers comparisons around ±2048, 22 divisors and a frameless leaf, compares every result with stock, and asserts that no divide remains. `scripts/09-division-sweep.mjs` compiles `n / d` and `n % 2^k` for 300 divisors (all powers of two, the ray's constants, primes, 2^31−1 and random values) and compares 130,200 results with JavaScript truncating division: 0 mismatches (`various/15-division-sweep.json`).
- Holdout: the Chess engine oracle under each part (below).
- Board: `scripts/10-stage-board.py BUILD MODES PIN` generalizes 06. It takes a modes file and the control's pin, and widens `cold.c`'s `cell` buffer to 1024 bytes. Modes are in `various/17-board-modes-select.json`: 0 = Phase 1 default (pin `01c7bf07…`, Step 5's mode 3), 1 = `select` without divisions, 2 = divisions only, 3 = all. `scripts/11-import-board.py` and `12-score-board.{py,js}` import any number of modes and score every mode against mode 0 in a REPL session.
- Added `select` to `POLICIES.default`. Ran the 24 replays with it (`various/16-replays-select-default.log`), then updated the tests. `select: false` isolates the guarded-return test and the stock comparison. The explicit-option PIE pins now say `select:false`. A new pin covers the default image `6b854512…`.

### Why

- C's code for the same algorithm has none of these instructions. GCC folds literals into immediates, divides by constants with `mulh`, and branches on comparisons directly.

### What worked

Host frame (instructions; all reproduce `430f0d50…`): Phase 1 default 11,098,863. Adding `immediates` gives 10,315,885, `branches` 10,281,616, `results` 10,555,838, `leafParams` 11,098,855, `divisions` 10,958,839, and all five 8,997,126. The image shrinks from 8048 to 6792 B.

Chess engine oracle (instructions; 6981/6981 words each): 248,624,574, then 189,993,759 without divisions, 247,080,568 with divisions only, and 188,553,911 with all (−24.2%).

Board (`various/20-board-select-scores.json`; median of per-block savings against mode 0, wins out of 6):

| | mode 1: no divisions | mode 2: divisions only | mode 3: all |
|---|---:|---:|---:|
| frame (39,483 µs control) | 33,974.5 (13.96%, 6) | 36,231.5 (8.29%, 6) | **31,510.5 (20.19%, 6)** |
| primary pass (10,130.5 µs) | 21.27%, 6 | 0.19%, 5 | 20.95%, 6 |
| shade pass (34,796.5 µs) | 11.80%, 6 | 8.63%, 6 | 19.27%, 6 |
| shadow predicate (247.67 cycles) | 212.78 (14.11%) | 247.91 (−0.09%) | 212.85 (14.11%) |
| ray cold compile (344,072 µs) | +0.04% | −0.34% | −0.24% |
| Chess cold compile (84,040.5 µs) | −2.01% | −0.85% | −0.11% |
| ray compile peak | 933,524 B in every mode | | |

- All 12 scenes for mode 3 saved between 19.78% and 20.39%, each with 6/6 wins. Chess evaluation (mode 0 against 3): 5,556.4 → 3,820.0 cycles per call (−31.24%, 6/6).
- References in the same firmware: scalar C frame 7,723 µs, checked C predicate 135.3 cycles. Typed is now 4.08× C on the frame and 1.57× on the predicate.
- All 48 cold-compile rows were present; widening the buffer worked. The device was restored to `e7b771aa…` and passed the health check. Diagnostic app SHA-256: `3489cb4eb16a31c51fd8e75a5eed1d55cb18d5743a88697d701712912bb07fe3`.
- Tests: 141 pass, 0 fail. Replays: 24/24 PASS with `select` in the default.

### What didn't work

- The first board build failed at its own pin: `AssertionError … actual: '6b8545125fa8d2d0…'`. `resolveOptions` merges a mode's fields *over the default policy*, and the working-tree default already contained `select`, so mode 0 silently got it. Every mode now starts from `"policy": "stock"`. A board mode must not depend on what "default" means at the time of the build; Step 5's file was safe only because the default had not yet gained a new field.
- Two tests failed after the default change. Both assumed the default touched only the options they named. `normalize`'s code changed under `select`, and `{operandLocations: false, inlineGuardedReturns: false}` no longer equals stock. Both now pass `select: false` explicitly.
- Typed has no `<<` operator and no `?:`. My first differential source used both and failed with `SyntaxError: 13:54: expected identifier` and `10:19: invalid token`.

### What I learned

- Instruction counts understate the cost of a divide on the P4 by a large factor. Divisions removed 1.3% of executed instructions and 8.3% of frame time. That is about 3.25 ms for 217 k divides, roughly 5 cycles saved per divide net of the replacement sequence. Earlier labs never measured divide latency. Any future change that adds or removes divides must be judged on the board.
- Most of the "codegen factor" in the guide's gap decomposition was instruction selection, which the stack-machine lowering never attempted. Register allocation (Phase 1) and selection (Phase 1b) together took the frame from 46.0 to 31.5 ms.

### What was tricky to build

- Every new sequence uses only `t6` as scratch, and reads its operand before or in the same instruction that first writes the result. That allows the result to land in the operand's own home (`x = x / 8`). `pop(T5)` never returns `t6`, and I checked each sequence against that rule.
- A literal 0 read as `x0` is a pending direct read whose "home" is register 0. Every consumer of `this.direct` compares against `undefined`, not against falsy, so `x0` is handled. Calls do not spill it, and `materialize` copies it like any home.
- Fusion bypasses `step()`'s control-opcode `materialize()`, because it consumes the `if`/`br_if` itself. It must materialize after popping its operands and before branching.

### What warrants a second pair of eyes

- `divisionMagic` uses doubles. Every intermediate value stays below 2^34, and the sweep checks 300 divisors, but a reviewer should confirm the bound for divisors near 2^31.
- `le_s` with an immediate uses `c + 1`. The guard `c < 2047 && c >= -2049` keeps `c + 1` inside the 12-bit range, and `c` can never be `INT_MAX` there.

### What should be done in the future

- Inline small hot callees: the frame still makes 77,131 calls. Step 7 starts this.
- Fold `x / a / b` into `x / (a*b)` when the product does not overflow. GCC does this, and Pack has it three times.

### Code review instructions

- `picocalc-os/compiler/typed-rv32.js`: `PREDICATES`, `IMMEDIATE_FORMS`, `divisionMagic`, `constant`, `destination`, `result`, `selectConstant`, `divideByConstant`, `fusible`, `branchTarget`, `fuseBranch`, `begin`, `branch`, the two lines at the top of `step`'s switch, the `case 0x20`, `0x41`, `0x45` and load cases, `LeafCode.step`, and `lowerLeaf` and `emitter.select` wiring.
- `picocalc-os/tests/typed-rv32.test.mjs`: the last test, and the default pin.
- Run: `node $T/scripts/09-division-sweep.mjs`; `python3 $T/scripts/12-score-board.py 3795 $T/various/19-board-select /tmp/x.json`.

### Technical details

- Magic examples: d=255 → M = −2,139,062,143 (as signed), s = 7, `add` correction on. d=3 → M = 1,431,655,766, s = 0.
- Branch kinds (funct3): 0 beq, 1 bne, 4 blt, 5 bge, 6 bltu, 7 bgeu. `kind ^ 1` negates.

## Step 7: Inlining, capacity homes, nested loop weights and literal commutation

After Step 6 the frame still made 77,131 calls. Each one paid argument moves, a prologue and an epilogue, and callee-saved saves. The C renderer has none of these, because GCC inlines its static helpers into the pixel loop. This step adds a tape-level inliner and three supporting options. On the P4 the four together cut the frame from 31.53 to 24.18 ms (−23.3%, 6/6 blocks, all 12 scenes), the shadow predicate from 212.2 to 200.1 cycles and Chess evaluation by 23.1%. Typed is now at 3.13× the C frame. The cost is compile time: ray cold compile on the device rose from 343 to 605 ms (+76%), and the Chess evaluator compile by 51%. The extra 261 ms pays for itself after 36 frames. All four are now the default. The commit also carries two further opt-in options, `select.rotate` and `operandLocations.constants`. They are on the board in a separate run (Step 8).

**Commits (code):** 221ccf7 made `select` the default (Step 6). 951ac05 added the four options as opt-in. Making them the default, plus the opt-in rotation and constant homes, is recorded in Step 8.

### Prompt Context

**User prompt (verbatim):** see Step 6.
**Assistant interpretation:** Keep closing the measured gap to C.
**Inferred user intent:** As before.

### What I did

- `inlineCalls(fn, library, limits, arity, anywhere)`: at a call to a library function, emit `local.set` for each copied argument, then `block (result i32)`, then the callee's tape with renumbered locals and every `return` turned into `br <depth>`, closed by the callee's final `end`. One local range is shared per callee and caller.
  - An abstract operand stack records which output cells produced each value. A plain `local.get x` or `i32.const c` argument is removed and substituted into the body. A literal is never substituted into a checked-address operand.
  - Only calls inside a loop are inlined, unless `anywhere` is set. The library copy of each function is expanded with `anywhere`, so an inlined callee brings its own callees along.
  - `maxLoopDepth: 2` keeps a callee out when the call site's loop depth plus the callee's own loop depth would exceed 2.
- `inlineCandidate` records which parameters are written (always none: Typed parameters are immutable, `expected mutable local`) and which are checked-address operands. It rejects async functions, guarded-return helpers (those keep the cheaper `GuardedReturnCode` path), literal stores and self-calls.
- `operandLocations.capacities`: an unwritten buffer parameter's capacity is scored by its checked accesses under key `-1 - b`, competes for a home like a local, and is loaded once in the prologue. It replaces `a7` caching. Soundness: the host writes headers, and a checked store at index `i < capacity` writes at `4 + 2i`, so no store can reach any header. A capacity read at entry is at least as valid as one read later.
- `operandLocations.nested`: loop weight `4^min(depth, 3)` instead of 4 for any loop.
- `select.commute` (`commuteConstants`): turns `c OP e` into `e c OP` for add, mul, eq and ne. It moves only when the literal's two cells directly precede e's cells, and an uncertain extent (a value block) is NaN.
- A differential test (last in `tests/typed-rv32.test.mjs`) covers early returns, nested inlining (`fill` → `weight` → `clamp`), a loop with an early return (`first`), substituted buffers and literals, and stores. It compares results and the whole memory with stock across 7 sizes, checks that an out-of-range size traps at the same point with identical memory, and asserts that `fill` makes no call.
- Board: `various/21-board-modes-inline.json` has four stock-based modes. 0 is the Step 6 default (pin `6b854512…`), 1 adds capacity homes, nested weights and commutation without inlining, 2 adds inlining only, and 3 adds all four. Imported to `various/27-board-inline` and scored in the REPL (`various/28-board-inline-scores.json`).
- Compile cost in goja for all five programs (`various/24-compile-cost-inline-goja.json`).
- 24 replays with the four options in the default (`various/22-replays-inline-default.log`).

### Why

- The profile after Step 6 put 1.33 M of 9.0 M instructions in stack traffic, mostly callee-saved saves and restores repeated per call in `InShadow` and `Pixel`, plus 260 k capacity loads in functions that were not pure leaves.

### What worked

Host frame (all with the reference digest):

| arm | instructions | notes |
|---|---:|---|
| Step 6 default | 8,997,126 | |
| inline, first version (copied args, any call site, 400 cells) | 9,474,899 | worse |
| inline with substitution and loop-only placement, 1000 cells | 8,440,869 | everything collapsed into `typedRayFrame` |
| + `maxLoopDepth: 2` | 7,692,493 | `LitRow` becomes one leaf with 0 calls |
| + capacities | 7,215,368 | capacity loads 541,956 → 25,617 |
| + capacities + nested | 7,141,470 | |
| + commute (all four) | **6,752,211** | `li` 817 k → 479 k, `mul` 437 k → 278 k |
| capacities + nested without inlining | 8,754,247 | |
| commute alone | 8,607,867 | |

Chess engine oracle (instructions; 6981/6981 words each): Step 6 default 188,553,911; inline 148,986,096; capacities + nested 186,105,130; commute 187,682,909; all four 145,676,489 (−22.7%).

Board, against mode 0 (median of per-block savings; wins of 6):

| | mode 1: no inline | mode 2: inline only | mode 3: all |
|---|---:|---:|---:|
| frame (31,525.5 µs) | 29,517 (6.37%) | 26,556.5 (15.77%) | **24,179.5 (23.30%)** |
| primary pass (8,046 µs) | 6.94% | 0.58% | 9.82% |
| shade pass (28,069 µs) | 3.93% | 0.11% | 3.93% |
| shadow predicate (212.2 cycles) | 199.9 (5.78%) | 212.4 (−0.16%) | 200.1 (5.74%) |
| ray cold compile (343,297 µs) | 391,861.5 (−14.16%) | 546,325.5 (−59.15%) | 604,644 (−76.12%) |
| Chess cold compile (80,736.5 µs) | −10.99% | −36.85% | −50.76% |
| ray compile peak | 1,004,088 B in every mode | | |

- Mode 3 scenes: 21.85% to 24.78%, all 6/6. Chess evaluate (mode 0 against 3): 3,816.7 → 2,932.8 cycles per call (−23.11%). C references: frame 7,725 µs, checked predicate 135.6 cycles.
- Restored `e7b771aa…`, health check passed. Diagnostic app SHA-256 `e918be6da36bda213c4918aad4d6896543ee4c6dc3d3067842d9a113d4406aa1`.
- Replays: 24/24 PASS. Tests: 142 pass.

### What didn't work

- **The first inliner made the frame slower** (9,474,899 instructions). Two causes. First, every argument was copied into a fresh local, so the inlined `work` was a different local, the capacity plan lost the receiver, and capacity loads rose to equal bounds checks (541,956). Second, inlining at any call site moved `LitRow` and `ComputeRow` into `typedRayFrame`, which still makes calls and has stores. It got neither argument-register homes nor capacity caching, and far more hot locals than 11 saved registers. Argument substitution fixed the first problem and `maxLoopDepth` the second.
- **The capacity-loop scoring hack.** `weigh(-1)` followed by `scores.delete(-1)` reuses `weigh`'s weighting for capacity uses. It works, but it is the least clear code in this step.
- **My first test source wrote a parameter** (`k = k + 1`) and failed with `7:7: expected mutable local k`. Typed parameters are immutable, so substitution always applies to parameters.
- **Four tests broke when the default changed**, all assuming the default touched only their own options:
  - `deep`'s chain of additions no longer spills once commuted, so it is now subtractions.
  - `mix` became a leaf once `step` was inlined, so that test passes `inline: false`.
  - The PIE pins inherited `inline`. They now start from `policy: "stock"` with every field written out.
- **A board run outside the harness's tracking.** I started the Step 8 board run with `&` inside a foreground shell call rather than as a tracked background task. It survived as a detached process, which I confirmed with `ps`, but no completion notice will arrive. Board runs must be started with the background flag, so that a lost process cannot leave the diagnostic image on the device.

### What I learned

- **Inlining needs register planning that knows where the hot loop is.** Placement had the same effect as the size limit: inlining into a caller that cannot keep values in registers loses.
- **Inlining costs compile time.** On the device the ray compile rose 76%. In goja the Agenda compile rose 83% and its image 85% (11,284 → 20,852 B), Editor +24% compile and +30% image (59,260 → 76,800 B), Files +75%, Chess +22%. The frame gains are large, but the edit-to-run cost is real and has to be reduced (future work below).
- **Capacity homes alone are worth little.** The large saving came from combining them with inlining, which creates one function with many accesses to the same unwritten buffer.

### What was tricky to build

- **Abstract stack effects** must match the emitter for every opcode the planner accepts. Unknown extents propagate as NaN or `null`, so a mistake can only block a transformation, never misplace cells. Before a substitution, the inliner checks the cells it removes against the recorded `local.get` or `i32.const`.
- **Value-block semantics for `br`.** A Typed `return` occurs with only its value above the callee's base, so after inlining the value sits at the block's entry depth, which is exactly where `end()` expects a value block's result.

### What warrants a second pair of eyes

- **The capacity soundness argument** assumes the host never passes buffers whose cell ranges cover another buffer's header. If it did, a store could corrupt a header. Even then, the cached value is the capacity at entry, which matches the real allocation, while re-reading would use the corrupted value. So caching is not less safe, but the assumption deserves review.
- **Capacity homes load every qualifying buffer parameter's header at entry**, including on paths that never access it. Buffer parameters are always valid buffers in the current ABI.

### What should be done in the future

- **Reduce inline compile cost.** The skip of fully expanded copies for over-limit functions is already in. Next: avoid expanding twice, and decline callees not reached from any loop.
- **Phase 3: versioned loops** with one range check and strength-reduced addresses. Each checked access still costs about five instructions against GCC's two.

### Code review instructions

- `picocalc-os/compiler/typed-rv32.js`: `INLINE_DEFAULTS`, `loopDepth`, `inlineCalls`, `inlineCandidate`, `commuteConstants`, the capacity parts of `planLocations` (`weigh`, `capacityUses`), `checkedAddress`, the prologue loop in `FunctionCode.lower`, and the inlining block at the top of `compile`'s `lower`.
- `picocalc-os/tests/typed-rv32.test.mjs`: the last test, and the two default pins.

## Step 8: Loop rotation and constant homes

The Step 7 default left two visible costs in every loop iteration:

- **A jump back:** a taken skip over the exit jump, then a taken `jal` back to the test.
- **Re-loaded literals:** 479 k `li` remained. 328 k of them fed fused branches (`x < 160` re-loads 160 on every iteration, because RISC-V has no compare-with-immediate branch) and constant checked indices.

`select.rotate` turns each loop into a bottom-tested loop. `operandLocations.constants` gives hot literals register homes, planned with the same decision function the emitter uses. On the P4 they cut the frame from 24.19 to 22.43 ms (−7.3%, all 12 scenes), the predicate from 200.1 to 194.1 cycles and Chess evaluation by 8.5%. Ray cold compile rose 10.6%. Both are now the default. Typed is at 2.90× the C frame.

**Commits (code):** 00cf3b5 made Step 7's options the default and added these two as opt-in. Making them the default is recorded in Step 9.

### Prompt Context

**User prompt (verbatim):** see Step 6.
**Assistant interpretation:** Continue toward C parity.
**Inferred user intent:** As before.

### What I did

- `rotateLoops(code)`: rewrites `block; loop; C; eqz; br_if 1; B; br 0; end; end` into `block; C; eqz; br_if 0; loop; B; C; br_if 0; end; end`, applying itself recursively to loops inside B.
  - It requires the block's `end` to follow the loop's directly and the loop to end with `br 0`.
  - It requires every branch in C to target a block inside C (`internal`), and C to contain no `return` or `unreachable`.
  - The frontend emits exactly this shape for `for` and `while` (`typed-wasm.js` loop emitter, around line 752).
- `constantForm(tape, at, select)` returns `zero`, `divide`, `immediate` or `register`, the decision `selectConstant` used to make inline. It is now shared, so the planner scores `"c" + value` with `weigh()` exactly where the emitter would load the literal.
  - Homes are loaded in the prologue.
  - `case 0x41` pushes the home as a direct read.
  - The forwarded constant-index path uses the home as the index register.
- `planLocations` receives `select` through its options (`{...operandLocations, select}`).
- Inliner pre-checks: no call to a library function, or (for the function's own code) no loop, now returns before the walk. Node compile timing showed no measurable change (select 0.61–0.70 ms against full default 1.05–1.19 ms per ray compile). The extra compile cost is the larger lowered function, not the inliner's walk; a CPU profile put `inlineCalls` at 13% self time.
- Board: `various/25-board-modes-rotate.json`, stock-based. Mode 0 is the Step 7 default (pin `4e7eb52a…`), which also proved that the `constantForm` refactor left output unchanged. Mode 1 is rotation, mode 2 constants, mode 3 both. Imported to `various/29-board-rotate` and scored in the REPL (`various/30-board-rotate-scores.json`).

### Why

- In C, GCC rotates loops and keeps loop bounds in registers.

### What worked

Host frame (reference digest): Step 7 default 6,752,211; rotation 6,558,278; plus constants **6,454,048** (`li` 479 k → 367 k). Chess engine oracle (6981/6981 words): 145,676,489, then 142,204,226 with rotation and 141,569,168 with both.

Board, against mode 0 (median of per-block savings; wins of 6):

| | mode 1: rotate | mode 2: constants | mode 3: both |
|---|---:|---:|---:|
| frame (24,187.5 µs) | 22,737 (6.00%) | 23,914 (1.14%) | **22,434 (7.26%)** |
| primary pass (7,280.5 µs) | 10.76% | 5.10% | 15.79% |
| shade pass (26,933 µs) | 2.30% | −0.36% (0 wins) | 2.00% |
| shadow predicate (200.1 cycles) | 193.4 (3.41%) | 200.2 | 194.1 (3.07%) |
| ray cold compile (622,878.5 µs) | −7.54% | −3.27% | −10.59% |
| Chess cold compile (124,802.5 µs) | −6.81% | −2.90% | −10.15% |

- Mode 3 scenes: 6.48% to 8.26%, all 6/6. Chess evaluate: 2,927.1 → 2,682.5 cycles per call (−8.49%). C references: frame 7,731.5 µs, checked predicate 135.7 cycles. Restored `e7b771aa…`, eight worlds healthy. Diagnostic app SHA-256 `2abff32ab1a32b84450f8cf79d5bcb8c65024b15ea166d217a7c0458505a763b`.
- Tests: 142 pass with both in the default. Replays: `various/31-replays-rotate-default.log`, result in Step 9.

### What didn't work

- **Constant homes on their own are worth little** (1.1% of the frame). In the large inlined `LitRow` the literals compete for the same 15 or so registers as more than 73 locals, and most lose.
- **Mode 0's cold compile was 623 ms here against 605 ms in Step 7** for an identical image. The compiler bundle differs (more code), so cold-compile figures are comparable only within one run.

### What I learned

- **Each home holds one local for the whole function, and that is now the binding limit.** `LitRow` holds the bodies of `Pixel`, `SphereScale`, `Pack` and `InShadow`, whose locals are never live at the same time, yet each claims its own register or slot. The disassembly of the hot loop shows `InShadow`'s `lx`, `ly` and `scaledY` going through stack slots (`sw t1,188(sp)`, `lw t1,220(sp)`) on every floor pixel.
- **The remaining per-pixel waste is mostly loop-invariant.** About 31 instructions per floor pixel reload `work[16..19]` and recompute `scaledY`. Hoisting the loads needs proof that `pixels` and `work` don't overlap, or a versioned loop.

### What warrants a second pair of eyes

- `rotateLoops` duplicates C. If C contained a call with side effects, the number and order of its evaluations would still match the original (once before each iteration and once at exit), but the code grows.

### What should be done in the future

- **Share homes between locals whose live intervals don't overlap** (Step 9).
- **Group checked accesses off one base local** (`shadow + k`): one pointer, `lhu` displacements, and one check per unconditional group.
- **Version loops** for alias-free hoisting of invariant loads.

### Code review instructions

- `picocalc-os/compiler/typed-rv32.js`: `rotateLoops`, `constantForm`, `selectConstant`, `case 0x41`, the forwarded constant path at the top of `step`, the prologue loop in `lower`, and the `constants` scoring in `planLocations`.

## Step 9: Make loop rotation and constant homes the default

This is a milestone. The two Step 8 options became part of `POLICIES.default`, and the pinned default image is now the one timed in Step 8's mode 3. Every gate passed.

- Replays with both in the default: 24/24 PASS (`various/31-replays-rotate-default.log`).
- Tests: 142 pass. The pins are the default image `7c660e87…` (22.43 ms), Step 7's image `4e7eb52a…` with rotation and constants disabled, and Step 6's image `6b854512…` with inlining and the Step 7 options disabled.
- Host frame: 6,454,048 instructions, reference digest. Gap to C on the P4: 2.90× the frame, 1.43× the checked predicate.

**Commit (code):** recorded in the next step.

## Step 10: Shared homes and short forward branches

Step 8 named the binding limit: each home holds one local for the whole function. `LitRow` holds four inlined bodies whose locals are never live together, so most of them lost the competition for registers. This step adds two options.

- **`operandLocations.share`** gives locals with disjoint live intervals the same register.
- **`select.shortBranches`** turns every forward conditional branch from a skip plus a jump into one branch.

On the P4 the two together cut the frame from 22.44 to 20.20 ms (−10.0%, 6/6 blocks, all 12 scenes), the predicate from 193.4 to 181.7 cycles and Chess evaluation by 9.6%. Typed is now at 2.61× the C frame. Ray cold compile rose 15%, almost all of it from `share`. Both are now the default.

**Commits (code):** 3c99db8 added `share` as opt-in. The default change and `shortBranches` are in the commit that records this step.

### Prompt Context

**User prompt (verbatim):** see Step 6. During this step the user asked "have you been checking on your subagent btw? how are they doing?" and "how's our progress?". Both were answered in the conversation; neither changed the plan.
**Assistant interpretation:** Continue toward C parity.
**Inferred user intent:** As before, with visibility into progress.

### What I did

- `share`: while walking the tape, the planner records each local's first and last offset, whether its first occurrence is a read, and every loop's extent.
  - Intervals: a parameter is live from entry (offset −1). A local that occurs before a loop and inside it is widened to the whole loop, innermost loops first. This is sound because Typed re-initializes every declaration inside a loop body on each iteration, so only a local that also occurs before the loop carries a value across the back edge. A local whose first occurrence is a read (a generated continuation slot) gets no interval and is live everywhere.
  - Assignment: `planSavedHomes` keeps the registers it has opened with their intervals. A local takes the first opened register whose intervals it overlaps nowhere, at no cost. Otherwise it opens a free register as before. Once registers run out it keeps going (`continue`, not `break`), because a lower-scored local may still share. Capacity and constant homes have no interval and occupy their register for the whole function.
- `shortBranches`: `branch()` records a forward branch, emits a placeholder, and `patchBranches()` writes `b<cond> offset` once the function is complete. A target beyond +4094 bytes throws `SHORT_BRANCH_RANGE`, and `compile` lowers that function again with `longBranches` (the old skip plus `jal`). Frameless leaves are at most 128 tape cells, so they keep their own path.
- A new test (`short forward branches fall back to the long form…`) puts a 300-statement if-arm in `far`. It checks that `near` gets shorter, that `far` is word-for-word the long form, and that both match stock results.
- Board: `various/35-board-modes-share-short.json`, stock-based. Mode 0 is the Step 8 default (pin `7c660e87…`), mode 1 adds `share`, mode 2 adds both. Imported to `various/38-board-share-short`, scored in the REPL to `various/39-board-share-short-scores.json`.
- Compile cost in goja for all five programs: `scripts/13-compile-cost-arms.py`, a checked-in version of the heredoc that produced `various/24`. It takes a modes file and named arms. Output: `various/37-compile-cost-share-goja.json`.

### Why

- After Step 8, `InShadow`'s locals in `LitRow` went through stack slots on every floor pixel (`sw t1,188(sp)` … `lw t1,220(sp)`). 275 k stack loads remained.

### What worked

Host frame (reference digest each time): Step 8 default 6,454,048. With `share` 6,102,270 (stack loads 275 k → 105 k, `li` 367 k → 337 k). With both **5,884,011**, 8004 B image (8804 before).

Chess engine oracle (6981/6981 words each): 141,569,168, then 137,330,965 with `share` and **128,814,186** with both. `share` without inlining gives 178,293,829.

Board, against mode 0 (median of per-block savings; wins of 6):

| | mode 1: share | mode 2: share + short |
|---|---:|---:|
| frame (22,439 µs) | 21,563 (3.85%) | **20,195 (9.98%)** |
| primary pass (6,109.5 µs) | 0.29% (4 wins) | 5.03% |
| shade pass (26,381 µs) | 2.37% | 6.64% |
| shadow predicate (193.4 cycles) | 188.2 (2.80%) | 181.7 (5.89%) |
| ray cold compile (674,974.5 µs) | −14.64% | −15.21% |
| Chess cold compile (138,421.5 µs) | −9.77% | −8.66% |

- Mode 2 scenes: 8.97% to 10.84%, all 6/6. Chess evaluate: 2,691.1 → 2,434.7 cycles per call (−9.55%). C references: frame 7,726.5 µs, checked predicate 135.9 cycles.
- Restored `e7b771aa…`, eight worlds healthy. Diagnostic app SHA-256 `c51afb0b2b10b0c9deff7c76b3000811a2b2a260446095073abde2ae13fbc29c`.
- goja, median ms (image bytes):

| program | Step 8 | + share | + short |
|---|---:|---:|---:|
| ray | 74.2 (8,804) | 89.8 (8,340) | 86.2 (8,004) |
| Chess | 513.1 (40,680) | 526.0 (39,880) | 525.6 (37,912) |
| Editor | 1,209.8 (88,500) | 1,292.4 (86,580) | 1,250.4 (80,600) |
| Files | 25.3 (3,752) | 25.8 (3,700) | 25.8 (3,208) |
| Agenda | 211.6 (24,728) | 216.3 (23,868) | 214.8 (22,320) |

- Tests: 143 pass. Replays: 24/24 PASS with `share` alone in the default (`various/34-replays-share-default.log`) and with both (`various/40-replays-share-short-default.log`).

### What didn't work

- **I first put short branches under the existing `select.branches` flag.** That changed the default image without a board run, and the default-policy pin test failed (`✖ the default policy applies the qualified options…`). Short branches are now their own field.
- **I edited the compiler while the replays for `share` were running.** The short-branch edit landed mid-run, so that log (24/24 PASS) did not test a single compiler. I moved it out of the ticket and reran the replays after the edit settled (24/24 again). The rule: do not touch `compiler/` while a replay or an image build is reading it.
- **I built a two-mode board image first** (`board-build-5`: Step 8 and `share`). By the time it finished, short branches existed, so I rebuilt with three modes and never flashed the first.
- **`share` costs compile time** (+21% for ray in goja, +15% on the device) because `disjoint()` scans every interval in a register for every candidate, and `opened.find` scans every register. For ray this is fine. For a function with hundreds of locals it is quadratic.

### What I learned

- **Branch shape mattered more than expected.** `shortBranches` alone removed 218 k frame instructions, and in the inlined code every `if` and every `&&` produces a forward branch.
- **Checked accesses are now the largest single cost.** A classifier over the hot frame (`scratchpad/access.mjs`) counts 541,956 checks per frame. The sequence around them (`addi` index, `bltu`, `slli`, `add`, `lhu`) is 2.32 M of 5.88 M instructions, 39.5% of the frame.

### What warrants a second pair of eyes

- **The interval argument relies on Typed's block scoping.** Inlining keeps it: callee locals are declared inside the inlined block, and argument copies are written immediately before it. A future frontend feature that lets a value declared in a loop body escape the loop would break it.
- **The fallback lowers the whole function a second time.** That is correct but doubles the cost of the rare function with a far branch.

### What should be done in the future

- **Phase 3 pointer homes and versioned loops** (designed in the guide's Phase 3 section).
- **Make `share` linear:** sort intervals per register, or run a linear scan over all locals.

### Code review instructions

- `picocalc-os/compiler/typed-rv32.js`: `occur` and the `intervals` block in `planLocations`; `planSavedHomes` (`opened`, `disjoint`); `branch`, `patchBranches`, `SHORT_BRANCH_RANGE` and the retry in `compile`'s `lower`.
- `picocalc-os/tests/typed-rv32.test.mjs`: the short-branch test; the four default pins and the `without` helper.

## Step 11: Pointer homes, and how far Typed is from C in instructions

Checked accesses had become 39.5% of the frame (Step 10). This step implements the first half of Phase 3, pointer homes: a home register holds the address of a buffer cell, so an access after its bounds check is one `lhu` with a displacement. On the P4 the frame fell from 20.17 to 19.31 ms (−4.3%, 6/6 blocks, all 12 scenes) and the predicate from 181.1 to 171.9 cycles. Typed is now at 2.50× the C frame, and pointer homes are the default.

The step also measures the C frame in instructions for the first time. GCC's frame is 3,194,201 instructions and Typed's is 5,578,770, a ratio of 1.75. The time ratio is 2.50, so a large part of the gap is cost per instruction, not instruction count. One candidate is memory placement: in the board harness, Typed's `work` buffer lives in PSRAM, while the C frame keeps its tables on the stack in internal RAM. A paired board run that moves only that buffer is running (Step 12).

**Commits:** 154f2ad added `pointers` as opt-in. 2953d57 merged the PICOCALC-TRACE-WORKBENCH branch (W1–W7). The default change is in the commit that records this step. Replays with pointers in the default: 24/24 PASS (`various/49-replays-pointers-default.log`); tests: 144 pass.

### Prompt Context

**User prompt (verbatim):** see Step 6.
**Assistant interpretation:** Continue toward C parity; Phase 3 is next.
**Inferred user intent:** As before.

### What I did

- **Planner.** At a forwarded checked access, the operations before the index `local.set` give the index expression.
  - The forms are `local.get L`, `local.get L; i32.const k; add`, `i32.const k; local.get L; add` and `local.get L; local.get M; add`.
  - Accesses to an unwritten parameter r are grouped by key `p<r>:<L>` or `p<r>:<L>+<M>`.
  - Each group gets an anchor K0, the weighted median k. Accesses within ±1000 cells of K0 are covered.
  - Gain is 2 instructions per covered access, minus the updates. An update is one `addi` for `L = L + c`, found from the three operations before the `local.set`, and otherwise 4 or 5 instructions, plus a prologue initialization when every source is a parameter. Writes and accesses are weighted like home scores.
  - For `r[L + M]`, a write outside the accesses' innermost loop is divided by a further 4 per level. Without that, the once-per-sphere writes of `horizontal` and `x = 0` in `ComputeRow` outweigh the 160 inner iterations they serve.
  - The gain competes for homes in `planSavedHomes` with the hull of the sources' intervals.
- **Emitter.** `checkedAddress(…, pointer)`: after `bltu`, a following `i32.load16_u offset 4` becomes `lhu out, disp(p)`; anything else gets `addi out, p, disp − 4`, the same address `r + 2·index` as before. `pointersAfterWrite` runs after `case 0x21` and after `result()` when `destination()` stored into a homed local (it records `pendingWrite`). Parameter sources are initialized in the prologue from the argument registers.
- **Soundness.** `p` is updated at every write of a source, so at every access it equals `r + 4 + 2(L + K0)` modulo 2^32. The bounds check still tests the same index, and `p + 2(k − K0) = r + 2(L + k)` modulo 2^32. Accesses, stores and traps are unchanged. Sources read before any write in tape order (generated slots) are excluded.
- **Test:** `pointer homes keep checked accesses, stores and traps identical` covers increments, recomputed indices, parameter sources, two-local sums and stores. It compares results, the buffer bytes and the trap flag with the plain plan at sizes on both sides of the trapping bound.
- **C instruction count:** `scripts/14-c-frame-instructions.mjs` builds `nucleus/raytrace_demo.c` with `scripts/14-c-frame-runner.c` for `rv32emu`, with and without the render, and subtracts the two counts. It checks that the C pixels equal the Typed opening frame. The runner's `memset` and `memcpy` are word-wise, as newlib's are on the board.
- **Board:** `various/41-board-modes-pointers.json` (mode 0 is the Step 10 default `e7e33cd0…`, mode 1 adds pointers), imported to `various/47-board-pointers`, scored to `various/48-board-pointers-scores.json`.
- **Merged the workbench subagent's branch** (`2953d57`). `go vet ./...` and `go test ./...` pass on main.

### Why

- GCC addresses `work[1545 + x]` as one `lhu` off a pointer it advances with the loop. Typed spent `slli` and `add` per access to rebuild the address.

### What worked

Host frame (reference digest): 5,884,011 → 5,651,384 with `r[L + k]` only, **5,578,770** with the two-local form (`slli` after a check 445 k → 181 k at the first stage). Chess engine oracle: 128,814,186 → 128,741,180, 6981/6981 words.

| | P4, mode 0 → mode 1 (6 blocks) |
|---|---:|
| frame | 20,167.5 → **19,307 µs (4.27%)**, 6/6, scenes 3.61–4.55% |
| primary pass | 5,816.5 → 5,255.5 µs (9.55%) |
| shade pass | 24,659.5 → 24,245.5 µs (1.68%) |
| shadow predicate | 181.1 → 171.9 cycles (5.06%) |
| Chess evaluate (identical image: a control) | 0.15%, 3/6 wins |
| ray cold compile | 786,918.5 → 888,327.5 µs (−12.88%) |
| Chess cold compile | −5.85% |

- C references: frame 7,725.5 µs, checked predicate 135.8 cycles. Restored `e7b771aa…`, eight worlds healthy. Diagnostic app SHA-256 `801e255a95b4ed18c53f101285531c40d66d992f6364121b1b4674839234fa97`.
- Instructions per opening frame (`various/44-c-frame-instructions.jsonl`, pixels equal in every row):

| | instructions | × GCC -O2 |
|---|---:|---:|
| GCC -O2 (the board's `CONFIG_COMPILER_OPTIMIZATION_PERF`) | 3,194,201 | 1.00 |
| GCC -O3 | 2,450,039 | 0.77 |
| Typed stock | 15,532,634 | 4.86 |
| Typed Step 10 default | 5,884,011 | 1.84 |
| Typed + pointers | 5,578,770 | 1.75 |

- On the P4 at 360 MHz, the C frame is about 2.78 M cycles for 3.19 M instructions (0.87 cycles per instruction), and Typed about 6.95 M cycles for 5.58 M (1.25). Equal cycles per instruction would put Typed at 1.75× C, not 2.50×.

### What didn't work

- **My first planner edit detached an `else` branch.** I inserted the pointer code between `if (options.saved) planSavedHomes(…)` and its `else if (options.homes && leaf)`. The `else` then attached to an `if` inside a new `for` loop and reassigned homes after the saved plan: `typedRayFrame returned 0`. A home trace showed identical inputs and different results, and that pointed to code after `planSavedHomes`.
- **A per-function bisect filter did nothing,** because every function failed for the reason above. I removed the hook.
- **Amortizing writes for `r[L + k]` as well** converted `ComputeRow`'s conditional `1545 + x` accesses. Their saving did not cover a per-iteration `addi`: −12 k instead of −73 k. The amortization applies to the two-local form only.
- **Compile cost:** +12.9% on the device. The planner allocated a history object per operation (`hist.push({opcode, a})`) and scanned every write per group. Both are replaced, by scalar `prev2A`–`prev4A` and a `writesOf` map, with a byte-identical image (`4fa61ed1…` before and after). The device cost of the new version is measured in the next board run.
- **I edited `compiler/` while the placement image was building.** The build's `generated/compiler.js` and images are stamped 21:37:19, 45 s before the edit, and the copy has no `prev3Opcode`. That build used the committed compiler.
- **goja compile costs in `various/43` are unreliable:** the board build ran at the same time (Editor took 3.1 s against 1.25 s in `various/37`).

### What I learned

- **Instruction count is no longer the whole gap.** Typed retires 1.75× GCC's instructions but takes 2.50× the time. Placement of `work` is the first hypothesis. Others are load-use stalls after `lhu`, taken branches, and the layout of the native image in the instruction cache.
- **Unchecked accesses are the remaining instruction gap.** 541,956 checks per frame still cost `addi` + `bltu` (975 k instructions together). GCC's 3.19 M leaves Typed about 2.4 M above it.

### What warrants a second pair of eyes

- **`pendingWrite` couples `destination()` to `result()`.** Every caller pairs them today. A new caller of `destination()` that skipped `result()` would leave a pointer stale, and the differential tests would only catch it if the local fed a pointer.
- **The hull interval for two-source pointers is conservative,** but a source local first written after the pointer's other source is read assumes Typed's definite assignment.

### What should be done in the future

- **Step 12:** finish the placement experiment. If placement explains the CPI difference, the fair comparison and the production world's buffer allocation both change.
- **Phase 3 part 2:** versioned loops for `x`-indexed accesses with constant bounds (`ComputeRow`, `LitRow`). Add an affine form for `i = 21 + 4k` (`InShadow`).
- **Use the merged workbench for scoring** (`compiler.at`, `stats.paired`, jobs). My services on 3791–3795 still run older builds.

### Code review instructions

- `picocalc-os/compiler/typed-rv32.js`: `pointerFrom`, `pointersAfterWrite`, `checkedAddress`, `destination`/`result`, `case 0x21`, the pointer-home prologue loop, and in `planLocations` the `options.pointers` block of the walk, the group section before `planSavedHomes`, and the `pointers`/`pointerWrites`/`increments` maps after it.
- `picocalc-os/tests/typed-rv32.test.mjs`: the pointer-home test; the five default pins.
- `scripts/14-c-frame-instructions.mjs`, `scripts/14-c-frame-runner.c`.

## Step 12: Work-buffer placement is not the gap, and the C reference is -O3

Step 11 found Typed at 1.75× C in instructions but 2.50× in time, and named the PSRAM placement of the harness's `work` buffer as the first hypothesis. A paired board run moved only that buffer to internal RAM, and the frame changed by 0.2%. The hypothesis is wrong.

While checking the board's C build flags, I found that Step 11 used the wrong C reference. SHADOW-CODEGEN's `02-build.sh` copies `nucleus/raytrace_demo.c` into the app as `production.inc`, `bench.c` includes it, and `main/CMakeLists.txt` adds `-O3` after ESP-IDF's `-O2`. The board's C frame is GCC `-O3`: 2,450,039 instructions, not 3,194,201. With that reference Typed is 2.28× C in instructions and 2.50× in time. About 90% of the gap is instruction count, and cycles per instruction differ by about 10% (Typed about 1.25, C about 1.13). Step 11's table and its conclusion that a large part of the gap is cost per instruction are wrong. I left that entry unchanged; this step corrects it.

This step also starts using the merged workbench (PICOCALC-TRACE-WORKBENCH) for board scoring.

### Prompt Context

**User prompt (verbatim):** see Step 6. During this step the user asked "the REPL updates have been done, right? can you benefit from them?". Yes: the workbench is merged (2953d57), and this step moves scoring onto it.
**Assistant interpretation:** Test the Step 11 hypothesis before building on it; adopt the workbench where it replaces my own code.
**Inferred user intent:** C parity, and a REPL that earns its keep.

### What I did

- `10-stage-board.py … --internal-work-last`: patches the staged `bench.c` so that the last mode's Typed frame arm gets `wint`, a `work` surface from `heap_caps_aligned_alloc(64, …, MALLOC_CAP_INTERNAL|MALLOC_CAP_8BIT)`. Predicates, Chess and the C arm keep the PSRAM buffer. `various/45-board-modes-placement.json` gives both modes the same options (the Step 10 default, pin `e7e33cd0…`), so mode 1 differs from mode 0 only in where `work` lives.
- Read the board's compile flags from `compile_commands.json` and `main/CMakeLists.txt`. `bench.c` (and with it `raytrace_demo.c`) builds with `-march=rv32imafc_zicsr_zifencei_xesppie -mabi=ilp32f -O2 -O3`. `scripts/14-c-frame-instructions.mjs` now defaults to `-O3`; its `-O3` row for the current default is appended to `various/44-c-frame-instructions.jsonl`.
- Started a workbench service from main: `trace-repl` built at a6cd14c, serving port 3796 with the PICOCALC-ROW-IR archive. `GET /info` reports `build.revision` a6cd14c, a 15 s cell limit and a 600 s job limit.
- `scripts/15-score-board-workbench.js`: `12-score-board` as one cell. It reads `rows.json` and `receipt.json` with `repo.read` and does every comparison with `stats.paired`. On the Step 11 rows (`various/47-board-pointers`) it reproduces `various/48-board-pointers-scores.json` field for field. It scored this step's run (`various/50-board-placement` → `various/51-board-placement-scores.json`).

### Why

- If placement had explained the cycles-per-instruction difference, the fix would have been in the world's allocation, not in the compiler.

### What worked

| | P4, PSRAM `work` → internal `work` (identical images) |
|---|---:|
| frame | 20,173.5 → 20,134 µs (0.20%), scenes 0.05–0.29% |
| primary pass | 0.70% |
| shade pass | 0.10% (4 wins) |
| predicate, Chess, cold compile (unchanged `work`: controls) | −0.01%, 0.11%, −0.01% |

- The 6/6 frame wins show a real but negligible effect: the 4 KB `work` buffer stays in the data cache. The C frame was 7,719 µs. Restored `e7b771aa…`, eight worlds healthy. Diagnostic app SHA-256 `87f93557c4ca31e6d8b373862be5570b0bc536cf564310a197f450c85e2999f2`.
- Corrected comparison:

| | instructions | P4 time | cycles per instruction |
|---|---:|---:|---:|
| C, GCC -O3 (the board's build) | 2,450,039 | 7.73 ms | ≈ 1.13 |
| Typed default (Step 11) | 5,578,770 (2.28×) | 19.31 ms (2.50×) | ≈ 1.25 |

### What didn't work

- **Step 11's C reference.** I took ESP-IDF's `CONFIG_COMPILER_OPTIMIZATION_PERF` (`-O2`) as the C frame's level without reading the component's own `target_compile_options`. The lesson is to read the board build's `compile_commands.json`, not the sdkconfig.

### What I learned

- **The remaining gap is instructions.** Closing it means executing about 3.1 M fewer instructions per frame. Removing bounds checks and their index arithmetic in versioned loops is worth up to about 1 M.
- **Hand-written scoring code is no longer needed.** `stats.paired` and `repo.read` reproduce `12-score-board` exactly, without shipping the rows through `eval`.

### What should be done in the future

- **Phase 3 part 2, versioned loops.** `LitRow` holds 384,589 of the 541,956 checks per frame and `ComputeRow` 155,812. In `LitRow` most checks are in the inlined `InShadow` sphere loop: `shadow = 21 + 4·sphere`, then `shadow + 0..3`, an affine index. The constant indices `work[16..19]` are reloaded on every floor pixel. The versioning guard must handle affine locals and constant indices, not just `x + k`.

### Code review instructions

- `scripts/10-stage-board.py` (`--internal-work-last` patch), `scripts/14-c-frame-instructions.mjs` (default `-O3` and the comment on why), `scripts/15-score-board-workbench.js`.
