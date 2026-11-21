---
Title: Physics study operator diary
Ticket: PICOCALC-SIMD-LAB
Status: complete
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
---

# Physics study operator diary

## Step 1: Separate layout effects from the scheduling experiment

I commissioned the physics kernels in a dedicated Opus High workspace and specified the interfaces needed by the host, board and evidence readers. The two controls with the same contact order matter because immediate writes may change the state read by later contacts. The device harness prepares all copies of the initial state outside the timed loop and checks each copy afterward.

### Prompt Context

**User prompt (verbatim excerpt):** “Use fixed-point particle integration as the first physics kernel. Compile the same update with particles stored as records and with positions and velocities stored in separate arrays. Run scalar and PIE on both layouts. Include conversion time when a real application would pay it.”

**User prompt (verbatim excerpt):** “Try independent particles first, then contact constraints where two contacts may write the same body. Supply conflict-free contact batches and compare scalar and PIE over the same batch order. Compare that scalar result separately with the original solver order.”

**Assistant interpretation:** Build physical and executable differential experiments with fixed input and explicit numerical rules.

**Inferred user intent:** Establish whether the P4 can profit from packetization across workloads and how to tell arithmetic improvements from memory or solver-order effects.

### What I did

- Created a scoped Opus sandbox and a single-tool MCP connection to a dedicated session on the corrected evidence REPL. Retained the commission text and bridge under `scripts/physics/`.
- Chose one-component saturated Q8.8 particle integration and widened two-body velocity relaxation. Defined the 2×2 native layout/ISA controls and two independently compiled Typed controls.
- Wrote the board study with 8 cyclic treatment blocks, 12 fresh buffers per timed batch, and single-tick conversion/grouping arms.
- Wrote the host assembler, independent arithmetic oracle, graph legality checks, instruction replay and address-count collector. Reserved the physical port for the ray-study board operator.

### Why

A packet-friendly in-memory layout and the act of carrying values in registers can each affect execution speed. Testing both independently allows the report to assign the effect to the chosen comparison.

### What worked

A strict host C front end compiled the timer harness against a test declaration of the ESP cycle counter. The installed Espressif toolchain provides a vendor assembler and the local Python environment includes Unicorn's RISC-V backend.

### What didn't work

The first Opus invocation returned `API Error: Opus 5.5's safeguards flagged this message ... [reasoning_extraction]`. It produced no kernel files. I issued a narrower software implementation commission confined to observable code and contracts, with an independent empirical test plan.

### What I learned

The repository's existing RV32 interpreter supports a deliberately small subset of scalar machine instructions. The physics hand schedule may use signed halfword loads. The host physics runner uses Unicorn scalar semantics with an allowlist for the vendor extension.

### What was tricky to build

The checked Typed ABI expects the address of a four-byte capacity field; the native ABI expects the address of the first halfword. The board holder places the header at offset 12 in a 16-byte-aligned allocation so that the payload starts at byte 16. The union itself is 16-byte-aligned so all twelve holders obey the requirement.

### What warrants a second pair of eyes

Check the Q-register set against the P4 context-save contract and stack alignment around packet scratch. Verify opposite-signed extreme velocity pairs and the expected source-order divergence separately.

### What should be done in the future

Run all physical trials under an identified firmware and qualify every scalar and PIE output before comparing timing.

### Code review instructions

Start with `04-fixed-point-particle-layout-and-contact-order.md`, `scripts/physics/03-qualify.py`, and `scripts/physics/board/physics_bench.c`. The runner excludes buffer resets, correctness assertions and UART emission from cycle timing.

### Technical details

The native particle APIs accept valid halfword arrays and length. Upper and lower saturation use signed 16-bit endpoints. Reference floor division in the contact oracle is explicit because C integer division rounds toward zero while an arithmetic right shift rounds toward negative infinity.

## Step 2: Assemble the Opus kernels and test the fallback contract

The researcher delivered the six native kernels and three Typed functions in its public answer. I transferred these exact blocks into the ticket and corrected two target restrictions discovered by the real compiler. The same actor then used the explicitly enabled local evidence tool and obtained six opening-scene pairs from its own private session.

### Prompt Context

**User prompt:** See Step 1 for the physics experiment request.

**Assistant interpretation:** A manually selected plan needs an unchanged generic implementation for inputs outside its admission proof. A board comparison needs controls with the same entry contract.

**Inferred user intent:** Explain whether SIMD and data layout improve the complete checked operation on the handheld.

**Commit (code):** `c9c7fbf` — Specify physics factorial controls and implement the paired board harness.

### What I did

- Compiled the real Typed source, emitted its raw unchanged words and entry labels for inclusion in the board image, assembled the native scalar and packed arms with Espressif's toolchain, and added four guarded dispatchers.
- Extended the Unicorn harness to report a full per-address execution histogram and capture post-trap memory. It checks 280 valid outcomes against an independent scalar oracle and 192 guarded results against the stock checked implementation.
- Separated a scalar original order, scalar grouped order and packed grouped order in the contact workload. Their intended comparison is apparent even on the conflict-heavy star fixture which admits no packet.
- Passed all four build inputs to the independent board operator. Exported three identified images, thirteen manually selected arms and seventy complete address histograms to the lab's workbench schema.

### Why

Raw register operations do not automatically inherit the Typed bounds contract. On a buffer that becomes invalid halfway through an update, prior stores must remain visible. A single capacity guard can fast-path complete valid buffers with exactly the original source reserved for all other cases.

### What worked

On 128 aligned planar particle pairs, the checked scalar arm executes 1,403 guest words and the checked PIE arm 126. Interleaved checked arms execute 1,272 and 938. In the same-order contact mesh the scalar arm executes 2,060 instructions and the packed one 3,107. These counts are host execution counts; physical cycle evidence is collected independently.

### What didn't work

- The Typed parser rejected `<<` at `5:39: expected identifier`. Replaced halfword sign extension with explicit subtraction for codes above 32,767; wrote floor division as widened difference, adjustment for negatives, then truncating division. Each replacement is checked against the oracle at signed extremes.
- The vendor assembler rejected `esp.vst.128.ip q2,a6,0`. The general address register used for staging was outside the valid encoding subset. Moved the staging address into `a4` before the store.
- The vendor disassembler printed `a4` for PIE operands even when numeric register output was requested. A first harness run decoded it as `x4` and faulted. The corrected execution hook distinguishes both register forms. `objdump -D` was needed to decode `.4byte`-emitted Typed instructions and recognize its EBREAK trap.
- The first scoped invocation provided no MCP server because Claude's `--safe-mode` disables explicit MCP configuration. A separate invocation with no built-in tools and one explicit local MCP server returned the six requested physical baseline observations. The kernel-writing invocation refused its file write in don't-ask mode but returned the complete kernel files in two public code blocks.

### What I learned

In the high-contention star schedule every batch has one contact and hits the scalar tail. A count of contacts alone cannot predict the number of packed operations executed. The checked wrapper's fifteen extra instructions on a complete planar run can be measured independently of the packed loop body.

### What was tricky to build

A valid scalar run might terminate with an EBREAK in the middle of the buffer. The host hook captures the semantic trap independently of its absolute PC. Normal returns must also restore the original stack and report the same integer as the stock Typed function.

### What warrants a second pair of eyes

The extrapolation from emulator instructions to device cycles remains open. The physics plan records are experimental assignments. They must never be described as predictions by the selector.

### What should be done in the future

Use the verified physical comparison to determine whether the same-order packed contact arm compensates for address gathering and writeback on the P4.

### Code review instructions

Run `node 02-build-typed.mjs`, `python3 03-qualify.py` and `python3 04-export-evidence.py` with the arguments in their headers. Compare its output SHA with the P4 operator's staged files.

### Technical details

The host-native complete image is 1,652 bytes, stock Typed 1,476 bytes, and the combined checked experiment 3,400 bytes. Only exact PC/image joins can relate the 70 traces to static instruction ranges.

## Step 3: Pair the physical cycle measurements and verify them through the REPL

The board operator returned a complete trial of 818 cells. I extracted only the physics UART records and checked that the observed block, size and treatment keys exactly equal the preregistered matrix. Each record carries the batch cycle delta and an aggregate Boolean produced by comparing every one of twelve freshly initialized buffers after the timer stopped.

### Prompt Context

**User prompt:** See Step 1 for the request; the lead experimenter requested common board access for all three lanes.

**Assistant interpretation:** Establish what actually ran, calculate effects within matched blocks and separate repeated copies of identical state from independent input cases.

**Inferred user intent:** Identify which compiled programs are plausible on the ESP32-P4, preserving negative results.

**Commit (code):** `f5e983c` — Qualify checked particle plans and conflict-free contact execution by exact RV32 image.

### What I did

- Read back the independent board operator's image receipt: SHA-256 `f9ad948df76c6dae831778d5eb123383d9f37a7b46cdb394f4019e58a8d6ea4c`, 1,064,016 bytes, /dev/ttyACM0.
- Extracted the 821 lines between the physics section markers, including the begin, batches and done markers. Verified all 818 result records and each record's composite correctness check.
- Ran `05-physical-results.py` and retained all raw paired inputs, the 67 arm-size medians and 54 matched comparisons. Formed per-block relative effects before taking the median.
- Loaded the raw trial rows into a private REPL session with `07-physics-workbook.py`. The article author received a separate session linked to the same immutable evidence study.

### Why

The original ray experiments report microseconds per frame; the physics trials time a batch of small kernels by the P4 cycle counter. The unit for this experiment is cycles per call, averaged over twelve fresh invocations within one trial row. Pairing is across arm treatments within the same rotated block.

### What worked

The guarded 128-particle planar implementation wins 12/12 blocks; median paired saving is 89.30%, compared with 33.83% for guarded interleaved. On an interleaved caller the explicit convert-update-convert implementation loses 12/12 against native interleaved scalar. The full group-scheduled contact PIE implementation loses 14/14 against scalar in the identical group order. The 128-pair contact mesh splits into 57, 41 and 30 contacts with 107 of 128 body values differing between sequential original and sequential scheduled relaxation.

### What didn't work

The contact packed arm was a losing optimization by both executed instruction counts and physical cycles. The median scheduled scalar call takes about 2,262 cycles and the packed one about 3,255. Reordering independent operations within a color is valid, but that validity does not remove its gather, scratch and scatter costs.

### What I learned

At seven positions, the planar packed wrapper also pays a small overhead with zero full packets. At 127 positions the second plane starts at a non-vector-aligned address, so the prepared packed implementation takes its scratch path; a single count threshold cannot predict layout profitability. The all-aligned 128-position trial answers a different question from the one-tick roundtrip.

### What was tricky to build

The grouping benchmark includes deterministic pair generation, greedy coloring and stable scattering. Since it times all three, it cannot isolate the price of a real game's incremental graph coloring. Its velocity checksum verifies unchanged state for the grouping-only control while the grouped solver comparisons validate the resulting schedule.

### What warrants a second pair of eyes

Confirm even-sample medians, pair orientation, cycle units, shader/physics image identity, match of grouped scalar and PIE traversal sequence, and the 12 identical input copies per timed batch.

### What should be done in the future

Benchmark repeated ticks from persistent planar state with freshly integrated dynamic inputs before claiming an observed amortization threshold. Collect additional contact graph families on hardware before recommending a general fixed-point kernel policy.

### Code review instructions

The audited public workbook is `scripts/physics/07-physics-workbook.py`. Read its `pairedPhysics` definition and compare `various/physics/workbook.json` with `various/physics/physical.log`. The checked physical arm implementations and verification loops are in `board/physics_bench.c`.

### Technical details

The complete row key is (kind, n, arm, block). No key was missing, extra or duplicated. Firmware SHA and the filtered UART hash are retained separately because a host evidence image encodes only the experimental function region, while the physical firmware digest covers the full flashed image.

## Step 4: Infer the particle plan from ordinary source and bind it to the flashed code

The lab director commissioned a bounded recognizer for the two calibrated particle implementations. The experiment operates on actual intermediate operations from the Typed frontend. It inferred both original layouts, selected equivalent renamed and relocated functions and dispatched eleven soundness or budget near-misses to their own compiled stock implementations. I then compared its generated machine code to the firmware from the physical study.

### Prompt Context

**User prompt (verbatim excerpt):** “Describe the work. Identify loop-invariant values, consecutive accesses, data-dependent lookups, conditional writes and values carried into the next iteration.”

**Assistant interpretation:** Extend the physics experiment from manually dispatched assembly to bounded proof-based selection using ordinary Typed programs, with exact comparison to the known firmware. The wider lab covers data-dependent lookup and packet decisions for rays.

**Inferred user intent:** Show a genuine compiler decision tied to hardware performance while preserving arithmetic, source ordering, and the language’s checked memory contract.

**Commit (code):** `7b4f064` — Recognize bounded saturating halfword updates from ordinary Typed operations.

### What I did

- Wrote a finite operation grammar and affine index normalizer in `09-recognize-particles.mjs`. It enforces the typed ABI, load/store widths, saturation constants, branch structure, source effects and halfword address independence.
- Wrote `10-verify-recognition.py` and ran compiled entries in the RV32 interpreter with vendor PIE semantics. Six ordinary source functions selected qualified templates. Eleven independently authored near-matches fell back. Two policy controls covered ordinary stock and specialized scalar entries.
- Qualified 2,280 paired return/trap and byte comparisons. The mutated upper clamp really wrote 32,766 and the accepted reference wrote 32,767 on the same overflowing sum. The guard admitted packed operations on all six accepted cases.
- Compared every linked original byte (3,400 bytes, SHA `79809bfa…f3ac`) and the three separate relocatable objects to the manual calibration. Verified 3,128 unchanged contiguous bytes and all four wrappers, including eight decoded physical relocation targets, in the original physical image `f9ad948d…ea4c`.

### Why

A whole-image comparison on the host can establish a faithful reproduction of the calibration. To connect the timing to the selected original program despite the board linker's section placement, the native code, stock fallback and all guard transfers must agree in the flashed binary too.

### What worked

The recognizer does not use application names, filenames, source line numbers or function index. The same selector accepts commuted additions, switched loads and a different affine expression for the same interleaved stride. A single 256-word predecode limit bounds work even on the long near-match.

### What didn't work

A literal search for all 3,400 linked host bytes in the verified board firmware returned `-1`. The board linker placed native, guard and stock sections separately. Searching for the 1,652-byte native section and 1,476-byte stock section located each precisely once. The guarded wrapper matches once relocation immediates are decoded and their actual destinations compared.

### What I learned

Alignment materially changes the value of planar layout. Native replay executes the scratch-path add at address 652 fifteen times for 127 particles, but the direct-path add at 468 sixteen times for 128. The observed difference of 973 versus 111 instructions directly supports the alignment-path explanation.

### What was tricky to build

A fallback must preserve observable partial writes at an initial failing access. The signed capacity check prevents overflow in a proof that both array ranges are valid. A declining function must retain its own original code, including modifications to its arithmetic. The explicit changed-clamp fixture exercises this property.

### What warrants a second pair of eyes

The accepted language class is narrow. Review the proof that domain admission excludes address overflow for a valid allocated object and count and that the only observable stores on the optimized path occur at the inferred positions. The host prototype binds exported entry points; existing internal calls in the emitted stock image still reach generic bodies.

### What should be done in the future

Pass the bounded function selector into the production stream, measure its cold compile cost and choose profitable plan sizes/alignment at runtime only if that cost is justified. Reuse the host artifacts to check any rewrite of wrapper lowering.

### Code review instructions

Start with `scripts/physics/09-recognize-particles.mjs`, `10-verify-recognition.py` and `12-bind-flashed-physics.py`. Compare `various/physics/recognition.json` and `recognizer-flashed-binding.json` to the board and host image IDs before applying timing numbers.

### Technical details

A saturating addition preserves both operands as widened signed values, then clamps to the representable signed halfword range. A legal matched interleaved update writes only even halfword cells. A legal planar update writes only [0,n), while reading the velocities from [n,2n). Both require a source-equivalent guard or proof before deferring several writes until a packet is complete.

## Step 5: Validate researcher-authored manuscripts against physical records

Opus High authored the kernel, the textbook manuscript and a public activity diary in its dedicated workspace. I checked them against the complete numerical records, corrected the article’s account of the 127-particle alignment path and added the automatic-recognition study after its hardware identity proof.

### Prompt Context

**User prompt (verbatim excerpt):** “write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style”.

**Assistant interpretation:** Deliver the department’s verified, newcomer-oriented chapter with definitions, replayable queries and exact measured denominators for the director’s publication batch.

### What I did

- Verified the external researcher’s public outputs. The kernel commission, standalone 173.9-second chapter and 45.3-second factual diary have separate model receipts.
- Checked faulty and corrected REPL queries and archived the public tool response log. Compared the 127- and 128-particle native disassembly and per-PC execution counts.
- Prepared the department article, its reproducible source and updated design for the lab director. The director coordinates the single vault commit and push for all departments.

### What worked

All physical statistics cited in the chapter are paired over the recorded block schedule. The 280 valid host comparisons are separate from 192 original guard fault/return comparisons and 2,280 newly qualified recognition checks.

### What didn't work

A combined article-and-diary request returned a public classifier notice and no manuscript markers. The researcher suggested an article-only request or a public command/result diary. Those two scoped tasks produced separate checkable deliverables. The public query name using `mesh128:scheduled-pie` returned `unknownTrace`; the recorded name uses `mesh128-scheduled-pie`.

### Why

The additional retained evidence permits future readers to separate authored preliminary kernel assumptions from the checked source in the actual board build. The director can reference the associated evidence identifiers without relying on ephemeral agent sessions.

### What I learned

A generated explanation that only receives the n=128 PC table can treat the n=127 alignment question as open even when the broader dataset has the decisive trace. The full workload inventory belongs beside a counter interpretation.

### What was tricky to build

An individual clock count per operation cannot be inferred by dividing the board’s repeated-call cycle count by the standalone guest instruction count. The article retains the independent statistical units and worked examples.

### What warrants a second pair of eyes

Inspect nonpositive count fallback, the single dynamic solver schedule, the independent fitness of the physics workload and the empirical scope of the conditional conversion break-even arithmetic.

### What should be done in the future

Run a persistent multistep simulation on physical guest output if the team needs an observed rather than projected conversion threshold.

### Code review instructions

Read the chapter and then the stored authorship, workload and capture receipts in `various/physics/`. Reproduce the paired comparisons with the workbook.

### Technical details

The external source and article bodies were provided as public CLI responses. Only deliverables, bounded authorship receipts and explicit query/result records are retained.

## Step 6: Pin the firmware reproduction and normalize the research diary name

The physical operator requested a compiler pin after the research branch integrated a production change. The standalone loader now reads the exact measured compiler from git revision `9a1ff99d2e11c9f3618fc42e979b643c1023521d` for both the ordinary emitter and the recognizer. Its assembly reproduces `297d07e6ab2e65b6261a72139b1b04219286660aaa9d4b7488d7f2931acf6d01`. The researcher's diary uses the docmgr-compatible path [04-opus-physics-researcher-diary.md](04-opus-physics-researcher-diary.md).

**Validation.** The local sandbox initially returned `spawnSync git EPERM` while the Node compiler loader invoked `git show`. The approved local command reran the same compiler and qualification against that commit. The current stock firmware source can now evolve without silently changing the physics evidence.
