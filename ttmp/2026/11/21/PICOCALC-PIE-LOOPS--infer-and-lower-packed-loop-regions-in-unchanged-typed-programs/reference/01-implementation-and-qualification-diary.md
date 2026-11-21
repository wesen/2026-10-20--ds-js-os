---
Title: Implementation and qualification diary
Ticket: PICOCALC-PIE-LOOPS
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T07:14:05.80882175-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation and qualification diary

## Step 1. Establish the source and select the region

The goal is to infer a packed arithmetic region in the ordinary ray-tracing loop while preserving its existing scalar consumer. I read the frontend tape, matched-row experiment, instruction semantics and inspector before designing the pass.

### Prompt Context

User request (verbatim):

> Ok, create a new docmgr ticket, Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
>
> Then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

The previous request fixed the algorithm and encouraged host comparison of assembly and intermediate information. I interpreted this as a compiler experiment with explicit treatment selection.

### What I did

Created the ticket, three tasks and the intern guide before implementation. Read the real numeric tape and the historical assembly. Assigned independent host and device qualification and separated region analysis from emission.

### Why

Earlier recognition pinned the whole function's operations. A subregion analysis can admit a changed function and reject an unsafe dependence. A matched scalar schedule provides a meaningful control for the packed instruction.

### What worked

The stock inspector exposed the inner loop and each checked buffer operation; the ray source already uses the unit induction and conditional consumer required by this proof.

### What didn't work

The sandbox does not show a /dev/serial/by-id directory. The device researcher will check the actual host before claiming hardware availability.

### What I learned

A successful packed subtraction can be decided from its unsigned lane value if the row term stays below signed saturation and only nonnegative results are observed. The source cell itself can span the full u16 range.

### What was tricky to build

Read-ahead changes the order of memory operations. Every scalar output must preserve the eight input values fetched early or force a fallback. The original scalar trap path is part of the semantic contract.

### What warrants a second pair of eyes

Induction updates, alias guards, sign recovery, private scratch alignment, trap order and values visible after the loop.

### What should be done in the future

Upload the guide, implement the optional pass and qualify both code schedules on unchanged source plus a held-out loop.

### Code review instructions

Begin with the ticket guide and inspect the source-level row and older vendor kernel before reviewing any generated words.

### Technical details

Software baseline 36964c4. The scalar oracle uses numeric i32 subtraction after a zero-extended u16 read. The native packed instruction is signed saturating subtraction.

## Step 2. Implement a checked subregion and freeze it for transfer

I wrote the region analyzer, emitter and inspector changes myself. The recorded scalar row now has one admitted loop at tape cell 172. The decisions for its two other loops identify the missing subtraction pattern. The candidate retains the checked original loop and the existing scalar code for a hit.

### Prompt Context

See Step 1. The user added (verbatim): “you know you should do the work yourself.” I stopped the preliminary helper reviews, including an independent fixture selection. They contributed feasibility and analysis observations without authoring the implementation. I took over the code, tests and device work.

### What I did

Added a per-function tape decoder entry, a separate optional pass, two lowering modes, loop facts in the JSONL inspector and instruction names in listings. Assembled the exact four encoding constants with ESP binutils. Uploaded the committed intern guide before writing the pass.

### Why

The group may only read ahead if a store cannot alter the input header or any prefetched cell. A conservative runtime test covers both different buffers and overlapping views. Keeping the stock loop also preserves tail behavior and error order.

### What worked

The vendor disassembler decoded broadcast, vector load, signed subtract and vector store at four independent PCs. The unchanged production scene yields a 1,688-byte experimental row versus 944 stock bytes. This is a static checkpoint before execution qualification.

### What didn't work

The guide's upload command initially returned a session while synchronizing its cloud tree. Polling returned success; no retry or overwrite was needed.

### What I learned

The hit body consumes arbitrary scalar operations. Replaying its original instructions lets a second program use a different scalar continuation without synthesizing a whole function template.

### What was tricky to build

The new lowering can emit a second copy of the continuation and later return to the original tape cursor. Its inspection ranges therefore carry both final code-segment labels and original input offsets. The induction slot must still be updated after every processed lane.

### What warrants a second pair of eyes

Mutable local bindings, shifted overlaps between buffers, trap behavior on a late lane and a miss value escaping the guarded arm.

### What should be done in the future

Run independent artifact decoding and whole-memory differential execution, then qualify matched targets on the P4.

### Code review instructions

Inspect typed-pie-loops.js, followed by the small optional dispatch in typed-rv32.js and the normal typed-inspect command with --pie-loops pie.

### Technical details

Guide checkpoint fd7cea6. Cloud receipt: OK: uploaded PicoCalc Inferred PIE Loops - Intern Guide.pdf -> /ai/2026/11/21/PICOCALC-PIE-LOOPS. Initial accepted plan maps the unchanged hit continuation to tape interval [207,292).

## Step 3. Reproduce the native images on independent execution engines

I froze the compiler at 74456f2 and wrote the transfer program, fixtures and physical trial scripts myself. The transfer program sums sample headroom; a second version writes its results into a buffer. I have no independently revealed preimage for the preliminary researcher's sealed selection. This is a post-freeze transfer check, not a blind independent replication.

### Prompt Context

See Steps 1 and 2. Preserve the ordinary ray source, use the host inspector, then check physical elapsed time.

### What I did

Rebuilt the three ordinary-source images, disassembled each packed word independently, compared whole guest memory and return/trap outcomes with Wasm, and checked every frame, depth, ID and padding cell against independent C outputs in twelve poses. Added normal app-suite regression tests and a side-by-side source/tape/assembly report. Timed compilation in rotated fresh Node contexts. Separately built a physical test app with two temporary benchmark selectors.

### Why

Exact emitted words and matched inputs allow a meaningful comparison. Moving an input read ahead of a scalar write can introduce an error even when every normally prepared scene renders correctly. Transfer cases vary input capacity, offsets, output overlap, limits and the signed saturation boundary.

### What worked

The twelve-pose complete-frame and audit comparisons passed for all three native images and Wasm. The default isolated primary row calls retired 3,608,697 stock instructions, 3,199,910 matched scalar and 3,131,435 PIE. The transfer workload executed real vector groups. A shifted write overlapping future input went through the scalar fallback and produced the correct memory. All 78 app regression tests passed.

### What didn't work

- The initial mutation tried assigning to an immutable parameter. The frontend reported “6:37: expected mutable local first”. I changed the rejection fixture to mutate a declared local.
- The standalone Wasm module has a one-page maximum. The first full-frame test failed with “RangeError: WebAssembly.Memory.grow(): Maximum memory size exceeded”. For the multi-plane oracle only, I changed the test module's memory-section maximum and enlarged its memory. Function bytes are unchanged. The emulator reserves a separate stack above these allocations.
- An independent helper had sealed a holdout without delivering its preimage before the user requested personal ownership. I kept the transfer study explicit about its provenance.

### What I learned

The same source produces different packet counts for the audit and clean calls because their scratch buffer bases have different alignment. Trace both before assigning a performance difference to the shader.

### What was tricky to build

I independently linked each exact guest ELF before the board run. The benchmark runner verifies the checksum from each device compilation, rotates all six arm orders, and verifies the prior release before any flash write.

### What warrants a second pair of eyes

Inspect short-buffer fallbacks, overlapping writes and the first differing test case if porting the pass to another frontend representation. The aligned scratch slot is additional stack use outside the normal saved locals.

### What should be done in the future

Finish the hardware timing and publish the measured break-even evidence, including unfavorable cases.

### Code review instructions

Replay scripts/03-qualify.mjs in rows and frames modes. Look at various/host/comparison.md and vendor-row.txt. Use scripts/08-compile-cost.mjs for host compiler overhead; interpret those results separately from P4 cold compilation.

### Technical details

The frozen ray SHA-256 is b0a7c02bbb8646a2b17c669c7c42fcb5d76ae4d666fe90f988ea2bb97f143e0f. The qualification program fits the original ABI. Padded 160-row multi-plane images require additional test memory capacity.

## Step 4. Measure the three guest programs on physical silicon

I ran the trial firmware through all six permutations on the same P4. Six blocks of twelve scenes for each of three compiled images produced 216 observations and eighteen cold compiler measurements. The stock guest, matched scalar guest and PIE guest each had its own checked ELF identity.

### Prompt Context

See Steps 1 and 2. The user wanted the same algorithm, host pass information and a personally executed implementation.

### What I did

I verified the board's prior firmware, flashed the candidate, matched the output CRC for each physical run, restored the playable firmware and checked the restored worlds and buses. I wrote scripts/09-paired-results.py to compute differences within each block, then compared the isolated primary and shade measurements with the full-frame measurement.

### Why

Grouping eight inputs changes scalar addressing, induction and checks before it changes the arithmetic instruction. A stock-to-PIE comparison conflates these effects. The matched scalar code shares those decisions. Timing the unaffected shade entry also checks for a general timing shift.

### What worked

On the default frame the paired stock-to-PIE saving was 1,616 microseconds. Replacing just the matched scalar producer saved 242 microseconds. All twelve poses favored the packed arm on median clean time. The verified restore reported eight expected worlds, an installed painter and zero I2C or SPI errors.

### What didn't work

The first compiler spent 658 ms compiling the scene against 454 ms for stock. The whole-function operation decoder was invoked even for functions without a candidate. I treated this cost as an experimental outcome and opened a follow-up comparison. Earlier, git's whitespace check caught trailing blanks in the vendor listing. I normalized the displayed listing before committing the host evidence.

### What I learned

A gain of 9.05% in primary time amounts to 2.80% in the complete frame. The two independently timed phase entry points have different setup and cannot be summed into the frame clock.

### What was tricky to build

Per-arm medians and medians of paired differences answer different questions. I saved both and verified the six possible treatment orders. The peak JavaScript heap and the fixed-size guest segment are separate metrics.

### What warrants a second pair of eyes

The aim of the matched comparison is to isolate the cost of filling a packet. A different allocator or a fused vector consumer could change the result. One board and twelve scenes establish a result for this workload.

### What should be done in the future

Measure cold compilation with a fast rejection test on the same board and qualify identical output before reusing the first trial's runtime measurements.

### Code review instructions

Read scripts/06-board.py and scripts/09-paired-results.py together. The latter uses row.timesUs[2] for the Typed guest and pairs by block and pose. Trace one row back through the stored images and build receipts.

### Technical details

Implementation 74456f2, host qualification b0aa7d3. Initial trial firmware 5dbcfe59, playable restore e7b771aa. The raw measurements and restore receipt are in various/device.

## Step 5. Reduce cold compiler cost and publish the chapter

The first trial showed a sizable cold cost for running the proof across a module. I implemented a fast necessary-condition test and compared both compiler revisions on the P4. The final chapter follows the same example from scalar source and signed saturation through emitted instructions, exact-frame tests, physical timing and break-even analysis.

### Prompt Context

See Steps 1–2. Additional user request (verbatim):

> when finished,  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).
>  Commit and push the bsidian vault when done (go-go-parc vault).

### What I did

Added a raw-tape rejection filter to the optional pass. Functions explicitly selected by the diagnostic inspector still receive full decisions. I rebuilt both revised compiler schedules, reran the 78 app tests, the row and transfer cases, and the twelve-pose complete clean and audit frame differentials. I compared the complete native image and linked ELF for the original and filtered PIE arms. On the board I compiled the frozen and filtered compilers beside stock in all six possible orders. I then personally wrote the Obsidian chapter and generated its figure from the original six blocks for all twelve poses.

### Why

The pass only needs to allocate decoded operations if the original tape might contain the target load, difference and sign guard. A necessary condition allows false positives safely because the full proof still runs. Keeping the older compiler binary as the comparator separates a change to compile cost from a change to emitted code. The article's chart shows the full observed range, including the narrower matched-versus-PIE difference.

### What worked

The revised guest images, linked ELF identities and host frame records matched their frozen counterparts. The board reported the expected ELF CRC at each load. Medians from this run were 454.095 ms stock, 657.835 ms unfiltered PIE and 523.692 ms filtered PIE. The median saving within paired filtered-versus-unfiltered blocks was 134.625 ms. The final compiler needed 746,388 peak JS bytes. I verified all internal vault references and the chart path.

### What didn't work

The initial cold remeasurement lost its serial connection during the preflight health query. Both prior flash regions had matched and the runner had not written a trial image. I repeated the complete verified preflight and trial in a different output directory. One approval review timed out before starting the retry; the scoped board command succeeded on resubmission.

### What I learned

A compiler pass that saves 1.616 ms per frame can reasonably incur some cold cost for animation. For the opening pose, the additional 70.324 ms paired cold cost is recovered after about 44 completed frames. Very short runs and loops that never fill a group have a different trade-off.

### What was tricky to build

The earlier firmware selected matched scalar with program 8. The second selected the frozen unfiltered PIE compiler in that slot. I recorded the selector change in the build manifest and validated that ids 5 and 8 generated the same native and ELF bytes for this comparison.

### What warrants a second pair of eyes

The initial researcher commitment has no revealed fixture. The writer-selected post-freeze transfer remains a narrower test. The physical study covers one device. Further applications should report captured vector group counts, complete workload times, and compiler costs.

### What should be done in the future

Profile scalar shade and shadow work and test a generally useful change to local retention or checked addressing. Compare any future expanded packed consumer against a matched scalar program.

### Code review instructions

Review prefilter revision 725b6d5, first device-data commit 0b49301 and scripts/10-compare-cold.py. Compare the two device manifests, check the selected ELF digests and reproduce the percentages from the per-block data. The full frame replay after filtering used scripts/03-qualify.mjs in frames mode followed by cmp against the original frames.json.

### Technical details

go-go-parc main advanced from 2b35364 to 9eab52d, publishing the chapter “Inferring eight-lane subtraction in a scalar ray tracer” and its twelve-pose figure. The reMarkable delivery receipt was “OK: uploaded PicoCalc Inferred PIE Loops - Measured Results.pdf -> /ai/2026/11/21/PICOCALC-PIE-LOOPS”. The intern guide was delivered separately before implementation.

The follow-up restore also matched the playable application and partition readback. Its health receipt reports eight expected worlds and zero bus errors. Docmgr identified missing frontmatter in the generated side-by-side listing. I updated its generator and regenerated the artifact. The remaining doctor notice concerns the unnumbered filename of that generated artifact, whose path is already cited in the published article.
