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
