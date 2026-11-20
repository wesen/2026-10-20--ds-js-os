---
Title: Director diary for automatic PIE lowering and its graphics workload
Ticket: PICOCALC-TYPED-PIE
DocType: reference
Status: active
Topics: [compiler, picocalc]
---

# Director diary for automatic PIE lowering

## Step 1: Define a testable compiler claim and commission its independent review

The user proposed a 3D Chess board and asked whether inference at lowering time could produce the packed arithmetic in an ordinary scalar program. I commissioned an implementation and a separate experimental review. Both studies start on the host because the 2D mobile-painter qualification owns our single ESP32-P4.

### Prompt Context

**User prompt (verbatim):**

> can't we do this more "elegantly" by doing type inference and doing this at lowering time?

> Ok, send out another researcher to do this. And I guess once the other research comes back, we could start experimenting with sending a 3d rendering painter over to the compositor?

> don't use opus this time around, because we ran out of credits. Use sol medium.

> use sol + astra independent supervisor or whatever.   
>   Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
>   Chose opus high for researchers
>   Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
>   analogies, see skill).
>    Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.

I followed the explicit credit limit and the Sol + Astra allocation. I interpreted the UI idea as a separate downstream experiment that can start once there is a qualified message/compile/draw path.

### What I did

I inspected typed-wasm.js and typed-rv32.js, checked Espressif’s instruction semantics and LLVM's treatment of loop dependence, and compared a public vector intrinsic with inferring packed operations from an ordinary loop. I assigned the implementation to GPT-6.2 Sol Medium and experimental review to an independent GPT-6.2 Astra researcher. Requested an unchanged source, executable differential tests, assembler verification and guarded fallback. The prior 2D Opus assignments were complete; these new researchers use no external model services.

### Why

A saturating hardware addition can implement ordinary i32 addition when the result provably fits the lane. The type of a buffer cell alone cannot supply the proof. Conversely, a recurrence can have perfectly narrow values while requiring the previous scalar iteration. The proposed interim representation retains both arithmetic and memory effects for one loop within the existing streaming compiler.

### What worked

We agreed on a first mesh projection with residue-bounded input coordinates and three outputs. The independent reviewer verified unsigned buffer loads, i32 arithmetic and 16-bit truncation on stores. Both researchers found the alignment issue arising from the four-byte capacity header. The independent reviewer traced the configured ESP-IDF context-switch code and found q3 absent from its save/restore lists.

### What didn't work

The first attempt to start a new researcher reached the four-slot team limit. I finished the prior compiler and transport researchers' scoped handoffs, verified their commits, and assigned the freed slots. This preserved the board operator's exclusive access.

### What I learned

Even a scalar reference run that traps can have observable writes from earlier iterations. A correct vector guard can select the original loop when a short buffer might trap. Rejecting an entire span before a previously visible prefix write would silently change Typed semantics.

### What was tricky to build

Separate language interpretation, legality of lane-wise arithmetic, independence of addresses, and profitability. The target is custom ESP32-P4 PIE v2.1; plain RV32 emulation can check scalar code and a reference implementation but cannot establish target cycles or context-switch behavior.

### What warrants a second pair of eyes

The independent reviewer should compare the *entire* arena before/after successful and trapping calls, demonstrate entry into the vector block and check the packed machine instructions against Espressif's assembler. Guard alignment must be checked on payload pointers. Board ownership must be handed over explicitly.

### What should be done in the future

Measure cold compilation overhead, code size and transformed vertices at multiple sizes. Separate a candidate's arithmetic throughput from scene rasterization and panel transfer. Try a physical 3D painter once the flat painter qualification gate has been evaluated.

### Code review instructions

Start with scripts/01-vertices.typed and the independent report. Inspect each inferred bound, loop index and address span. Verify the unchanged source with Wasm, scalar RV32 and the candidate machine code.

### Technical details

A 128-bit PIE vector holds eight 16-bit cells. The initial projection computes sx = 384 + x - z, sy = 640 + x + z - 2*y, and depth = x + z + y, for x, y and z in [0,255]. All outputs fit in unsigned 16-bit cells and every intermediate in this expression fits in a signed lane. A remainder by 256 is a low-byte mask only for these zero-extended inputs.

## Step 2: Measure a third compiler and keep the scope of the speedup explicit

The two candidate fast paths share range, address and independence checks. Measuring both lets us estimate which execution savings come from moving checks and address arithmetic outside the loop, and which require packed hardware operations. I conducted a separate cross-workload host compilation survey to measure how often the selector applies to existing project code.

### Prompt Context

See Step 1. The scientific goal was to infer an optimization from ordinary source that materially speeds up native code. The project goal ultimately includes the compile time and visible result on the handheld. Commit bd544af contains the experimental compiler, 29ca4f1 the first independent qualification, f277cc8 the physical report, and dd52e64 the final independent recheck.

### What I did

I commissioned the physical three-arm run, kept the 2D firmware as the recoverable image, and asked the reviewer to independently compute output checksums from the fixture generator. I ran scripts/director/01-cold.mjs over the projection fixture and four project workloads. Each of nine paired rounds per workload created fresh Node VM contexts, evaluated the compiler sources, and recorded setup, compilation and output bytes. I generated a two-panel chart from the operator's raw physical medians and linked both raw receipts in the synthesis.

### Why

An apparent 28-fold speedup against the stock backend cannot be attributed entirely to SIMD. The better scalar code alone already removes most original cycles. Measuring unrelated programs also tests whether the candidate silently changes outputs or imposes general costs on applications it cannot improve.

### What worked

At 256 vertices the physical medians were 45,675, 13,161, and 1,644 cycles. The independent reviewer regenerated all three machine images and independently matched all 72 memory checksums. The reported 1,024-vertex PIE cost was 5,484 cycles. Nine host realm pairs on each ordinary test workload produced an identical native output image in both modes. The projection fixture alone changed. The operator verified the original app and partition after the benchmark before handing the device to the 3D team.

### What didn't work

The first selector accepted a legal reassignment of the induction variable. A separate frame-limit test exposed scratch allocation that could reject a scalar-compilable function. Both failed programs became durable review fixtures. The stationary 3D painter selected no loops even though it computes coordinates. Its point-by-point layout does not fit the six disjoint buffer contract. This led to a separate optional combined-ABI trial.

### What I learned

At seven vertices the candidate and control have the same scalar work plus a few guard cycles. At eight, the PIE result drops sharply. Short tails make this curve depend on count modulo eight. At a fixed camera and unchanged board geometry, caching projected points competes with either scalar or SIMD calculation.

### What was tricky to build

The hardware samples are warm averages across repeated calls. Their extrema summarize sample averages rather than individual-call jitter. The host compile survey uses fresh JS realms inside one Node process, and cannot represent cold QuickJS deployment on the P4. Distinguishing these clocks prevents presenting a runtime projector speed as a compiler throughput improvement.

### What warrants a second pair of eyes

The width proofs, prefix and tail control transfers, mutation refusals, register save lists, raw arena equality, and recovery image identity are all inspectable from the three articles and their receipts. A separate PIE-enabled compiler build on the P4 is required for a cold cost estimate of its compilation service.

### What should be done in the future

The follow-on CHESS-3D combined experiment attempts a bounded six-column workspace for the 81 real grid vertices. It must use the projected values to generate visible geometry, enter the fast path, agree on all output words and record P4 results before anyone cites an application-frame speedup.

### Code review instructions

Read scripts/02-pie-lowering.js and scripts/review/cases.mjs, then compare various/physical.json with scripts/review/receipt.json and various/director-host-compile.json. Replay scripts/director/02-figure.py to regenerate the chart.

### Technical details

The standalone kernel moved from 628 to 1,384 bytes. The matched scalar-only fast path consumed 1,416 bytes. One vector loop occupies 29 machine words, and the guarded scalar loop 40. The 360 MHz board ran from flash-mapped code with test buffers in internal RAM. The director and two independent reports plus the new chart were published and verified at go-go-parc main 04ac835fa9b6f2382f29975f3769c4934c0c51de. Cloud delivery returned OK: uploaded PicoCalc Typed PIE Compiler Research.pdf -> /ai/2026/11/20/PICOCALC-TYPED-PIE.
