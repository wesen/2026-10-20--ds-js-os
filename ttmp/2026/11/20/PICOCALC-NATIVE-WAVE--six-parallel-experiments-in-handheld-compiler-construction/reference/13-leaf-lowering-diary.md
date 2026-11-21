---
Title: Leaf lowering and selective inlining investigation diary
Ticket: PICOCALC-NATIVE-WAVE
DocType: reference
Status: active
---

# Leaf lowering and selective inlining investigation diary

## Step 1. Pin a bounded compiler change before measuring

I started Claude Opus High on the design with tools disabled, in parallel with the separate lifetime study. I read the stock RV32 lowerer and wrote the intern guide before staging. I used a single class for candidate leaf emission so the experiment could reuse the original integer instructions, structured control transfers and stack rules.

### Prompt context

The director delegated the third study. It asks whether small helpers benefit from frameless lowering and bounded selective inlining. Chess is the fixed-work measurement, another maintained workload and a sealed telemetry module provide independent control cases, and the released firmware must be restored after the physical run.

### What I did

I inspected `FunctionCode` in `picocalc-os/compiler/typed-rv32.js`. The stock emitter saves ra, stores parameters in locals and uses five operand registers before spills. I selected functions with read-only scalar parameters, no frontend locals, no memory, no nested calls and no loops. A candidate uses argument registers for its parameters and aborts if it encounters a spill. I patched only a staged backend through `scripts/03-leaf/stage.mjs`.

In the second arm I buffered bodies for forward recipe lookup. At a selected call site, the ordinary call mechanism still evaluates and places arguments, spills caller values and restores them. The experiment removes the call/return pair and relocates the copied body's local branches. The original callee remains callable. I used 128 input cells and five live operand values as the leaf caps, plus 20 copied words per inline body, 96 added words and a 32-site global bound.

### Why

A leaf has no nested call that could overwrite its return address or clobber its incoming arguments. The frame still matters if it contains a mutable local or spill, so the first study excludes those cases. This controls ABI risk and makes the two changes measurable without a new whole-function allocator.

### What worked

The small `plusSeven` helper fell from 40 native bytes to 20. In a two-function sample, stock was 100 bytes, leaf 80, inline 92. The caller's arithmetic retained its live operand across the replaced call. The maintained Chess compiler emitted 26,580 bytes for stock, 26,276 for 15 selected leaves and 26,660 for the arm with eight inline sites. Buffering alone left the leaf image byte-identical.

### What didn't work

The signed-divide guard in the original emitter uses a0 as its temporary comparison register. A frame-free callee cannot reuse a0 that way because a later expression may still read the first parameter. I gave the leaf-only guard t5, which has no operand home in the bounded recipe. Ordinary lowering still takes the original path.

### What I learned

Frame removal and inlining act at different boundaries. The former reduces callee setup and local traffic. The latter can also eliminate a call and a return, but duplicates the callee's computation and can still preserve the caller's ABI spill work. Keeping the original leaf entry allows ordinary and external calls to coexist with selective substitution.

### What was tricky to build

Leaf branches are ordinary relative placeholders until final image emission. Copying one must move its source and target positions together. The leaf's single exit is anchored at the first caller instruction after the copied words. It has no imported targets or references to the caller's frame.

### What warrants a second pair of eyes

Review the use of t5 during signed division, and verify any live caller operand survives both copied geometry and ordinary control. Do not infer that an admitted leaf lacks traps.

### What should be done in the future

Test a bounded earlier-body cache separately if inline work needs to coexist with streaming compilation. This trial buffers bodies for predictable forward discovery.

### Code review instructions

Read the [guide](../design-doc/03-leaf-functions-and-selective-inlining.md), then `stage.mjs`. The original backend remains the control. Compare the result with the [independent design](../various/03-leaf/opus-design.txt), which also proposes larger register-backed and device-memory studies beyond this prototype.

### Technical details

I gave the director pre-code guide SHA prefix `faea4aad` and prototype SHA `36bfebeb93e917cf5805c7e9b3b308bf9965290cc4e72a849d43ce3ec9560aa1` before accessing the held-out source. I later added a loader override for the director's independent composition experiment. With no override, all raw held-out arm fingerprints reproduced exactly and eligibility code stayed unchanged.

## Step 2. Verify the frozen policy on Chess, the painter and a sealed module

I captured all 17 original Chess cases into the existing release-lab ABI and matched each result in the same deterministic instruction model. I also tested maintained rotating 3D Chess painting and the independently specified telemetry workload after the policy freeze.

### Prompt context

See Step 1. The held-out fixture came from the director while the protocol hashes were fixed. Its input manifest and independent host oracle remained byte-for-byte source inputs to the harness.

### What I did

I ran the same 17 chess cases using the release lab's freestanding model harness linked to each raw image. The comparison checks packed move, signed score, completed depth, nodes, slices and all 135 root cells. The held-out test loaded each exact binary with its entry offsets into the independently provided oracle. A four-phase painter test compared all available memory and outputs for the observed opening. Thirteen warm Node compiles in rotated order sampled each arm, including the buffered leaf control.

### Why

An optimizer can give correct arithmetic while corrupting a register or setting a trap incorrectly. The adversarial fixture checks signed zero/overflow traps, negative remainder, early exits, eight-argument expression lowering, a live caller operand and fallbacks for spills and local writes. The painter and telemetry isolate behavior outside the search domain.

### What worked

All three Chess models matched the earlier canonical digest `f204dc1ad6f54df3b72cc7ac61871b73ac75db6c412d870d52cd44bd77bfd860`. The post-e2–e4, 1,600-node case used 62,911,885 modeled instructions in stock, 57,953,030 in leaf and 57,704,294 in inline. Neither rewrite changed a Chess decision or budget.

The held-out telemetry module passed 1,603 calls per arm, including 101 expected traps. Stock was 2,876 bytes, leaf 2,812 and inline 2,952. The four painter poses agreed in complete memory across all arms and revealed no qualifying inline sites. There were 39 adverse-fixture arm-to-control comparisons.

### What didn't work

The first harness called `execFileSync(process.execPath, ...)` for the independent verifier and got `spawnSync ... node EPERM` under the workspace sandbox. I imported the unchanged oracle in the same Node process with its original arguments and a fresh module URL for each arm. The only patched statement supplied each sealed native image in place of the stock compiler call.

### What I learned

Modeled Chess instruction reductions were substantially larger than the change in image size. The post-e2–e4 app-budget row saved about 7.88% for leaf and 8.28% for inline versus stock. In that workload, most of the benefit came from removing leaf frame code. The painter demonstrated the need for a separate workload. Its policy selected no inline sites, and leaf saved under 1% of modeled instructions in the four positions.

### What was tricky to build

The production stream lowers one function before later bodies arrive. The inline arm intentionally buffers for lookup. The host test distinguishes that cost by comparing with separately buffered leaf emission. The 13 warmed samples cover the Node environment and neither estimate cold P4 compilation nor incremental cache invalidation.

### What warrants a second pair of eyes

The instruction model checks emitted behavior and native callee-saved registers. Its counters include the small harness where the release-lab script says they do. Do not compare modeled step totals against the P4 clock as if measured retired instructions came from the chip.

### What should be done in the future

Profile more helpers before raising the inline cap. The measured policy may be less attractive for a function dominated by pointer reads or expensive callee computation.

### Code review instructions

Review `images.mjs` for exact hashes and entry maps, `check.mjs` for the independently sealed oracle, and `prepare-board.py` for the shared release-lab case ABI. Configuration bytes, results and counters are in [host summary](../various/03-leaf/host-summary.json).

### Technical details

The standalone three-arm images have no imports. Register checks use the ticket's independent RV32 instruction model and preserve whole output arenas, not just unboxed return values. The director separately measured held-out telemetry on the PicoCalc in 11 rotated blocks. [Independent physical measurements](../various/director/paired-results.json)

## Step 3. Measure the three native images on the PicoCalc

After the first lane completed and explicitly released the serial lock, I flashed the private three-arm app. It links the stock, leaf and inline images into separate text sections of the same ESP-IDF image. Each test begins from the same root scratch and state, and each repetition changes arm order. The fixed work is the complete release oracle for five selected configurations.

### Prompt context

See Step 1. The physical window was limited to isolated compute timing and release restoration. The standalone measurement covers the maintained Chess search over fixed positions and budgets, ending before any UI or display activity.

### What I did

I built the app using `prepare-board.py` and the SDK configuration from the earlier release lab. I verified that its partition matched the installed one. The capture wrapper reused the shared release restore runner. I collected three measurements per arm for each of the opening at depth three, Black's position after e2–e4 at depth four, Kiwipete at depth three, the pawn ending at depth five, and the shipped 1,600-node reply configuration. It ended with 45 rows in one 360 MHz boot.

### Why

Rotating target order avoids giving one arm the same first-run cache state every time. Exact result and root checks on each observation gate comparisons of elapsed time. Separate images in one firmware give all arms the same board, timer and standalone execution environment.

### What worked

All 45 observations matched the expected move, score, completed depth, cumulative nodes, slices and 135 starting cells. The shipped-budget case's median search times were 239.159 ms for stock, 221.526 ms for leaf and 220.738 ms for inline. Median paired elapsed reduction versus stock ranged from 6.857% to 7.793% for leaf and 7.137% to 7.702% for inline. In the pawn ending, the inline median of 131.172 ms was slightly above the leaf median of 130.988 ms. [Physical receipt](../various/03-leaf/physical.json)

### What didn't work

No case failed the physical oracle. The within-boot results cannot estimate between-boot variance. Each image occupies its own flash placement, so an instruction-count improvement does not uniquely predict a time improvement.

### What I learned

Most of the Chess improvement in this policy comes from the leaf rewrite. Eight inline sites add a small gain in most sampled positions and can cost code bytes without improving every position. The result is consistent with the model's instruction reductions in broad magnitude. It measures the native kernel with its timer loop rather than key-to-response latency.

### What was tricky to build

I preserved the original fixed-work generated C header and verified the control binary against its release-lab digest. The experiment stages only the native code aliases for each arm and uses the exact same ABI to call them. The clock excludes buffer clearing and serial records.

### What warrants a second pair of eyes

Check the median paired reductions against the raw three repetitions, not by subtracting overall arm medians. Check restoration independently of search correctness. The experimental app and the release have different runtime scope.

### What should be done in the future

Include boot-to-boot and instruction-placement controls if an optimizer is considered for the released compiler. Expand the evaluation to another nontrivial native application before changing defaults.

### Code review instructions

Read `scripts/03-leaf/device.py` and the earlier release lab's restore runner. Compare `physical.json` with the modeled receipts and recompute the table through `aggregate.py`.

### Technical details

The release app digest remains pinned to `134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1` and partition `72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30`.

App and partition readback matched both published digests. The release booted all eight monitored native worlds and installed its ordinary painter with one compile and zero rejects. The runner exited zero and I explicitly handed the lock to the dependency study. [Restore verification](../various/03-leaf/release-restore-verified.log)

## Step 4. Review the Opus-authored report

I supplied aggregate host and sealed telemetry evidence to Claude Opus High and used a separate aggregate prompt for the completed physical Chess results. I checked the authored text against the actual register guard, recipe offsets, output sizes, model counts and physical timing rows. I removed a tentative future-results note and connected the reported timings to the verified restoration receipt. No raw UART was included in either writing prompt. [Writing provenance](../various/03-leaf/opus-provenance.json)
