---
Title: Dependency reuse investigation diary
Ticket: PICOCALC-NATIVE-WAVE
DocType: reference
Status: active
Topics: [picocalc, compiler]
---

# Dependency reuse investigation diary

## Step 1. Commission an independent design

The director delegated this experiment in the six-study native compiler wave. The authored request belongs in [the director diary](01-director-investigation-diary.md). Measure stock, the earlier global-descriptor cache, and an exact-body cache with observed semantic dependencies. Test the current released Editor and Chess across body, signature and record-layout edits. Preserve symbolic call information and replay graph edges after a hit. Compare complete ELF bytes and clean diagnostics. Freeze policy before the director supplies an independent holdout.

I started a separate Anthropic Claude CLI with `-p --model opus --effort high --tools '' --setting-sources '' --output-format json`. Each lead received its own scoped code and question. Neither was given hardware credentials, serial logs or the independent holdout. The working tree for implementation is confined to this ticket. The release compiler remains the ordinary reference through the real application entry point.

The first source inspection identified the emitted-program functions and the ELF slot linker in `picocalc-os/compiler/typed-rv32.js`. The current frontend may lower async Editor tasks before streaming ordinary and generated bodies through different lexers. The release application inputs are the exact CMake products used in the preceding release study. I will preserve a hash for each and rerun fresh control measurements.

### Prompt context

**User prompt (verbatim).** “do it, as before.
  Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
  Chose opus high for researchers
  Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
  analogies, see skill).
   Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.”

**Assistant interpretation.** Translate a broad compiler wave into a measurable edit question.

**Inferred user intent.** Let a separate Opus High researcher determine how to evaluate dependency precision and uncertainty.

**Code checkpoint.** `c07464e`.

### What I did

Commissioned the design with the previous cache source, edit generator and release backend excerpt. Preserved the authored design and model identity.

### Why

The earlier global descriptor made every structural edit a cold miss. A comparison with clean alone would conflate a new speedup with that earlier result.

### What worked

The returned design named symbolic relocations, read-set invalidation and a clean prepatch-word oracle before the implementation.

### What didn’t work

No commission failure. The original design proposed more physical repetitions than the shared board window eventually allowed.

### What I learned

An unchanged function may depend on an absent name or a physical field offset as well as on declarations it names directly.

### What was tricky to build

The design had to account for both ordinary and async-generated lexers while still promising one externally visible output.

### What warrants a second pair of eyes

Check whether any path uses declarations without passing its observation through the body emitter.

### What should be done in the future

Keep new language constructs opt-in, with a new cache identity or instrumented observations before reuse.

### Code review instructions

Read design-doc/04-precise-fragment-dependencies.md and the exact commissioned input in scripts/04-deps/01-design-prompt.txt.

### Technical details

The original release baseline includes 119 Editor functions and 82 Chess functions. Code and measurements are ticket-private.

## Step 2. Freeze read-set validation and qualify the training set

The commissioned lead proposed observing the compiler's semantic lookups and replacing index-based cached relocations. I implemented the recording at the shared emitter interface used by both original and async-generated bodies. A missing call, record, enum or distinct name is a dependency when its absence chooses a typing path. An enum used for an exhaustive match records the complete member table. A field records its exact type and byte position. Distinct integer literals use an internal JavaScript Symbol, which cannot be the name of a declaration. The checker preserves nominal membership for every ordinary identifier spelling.

I replaced global ordinals with symbol names for callee relocations and graph edges. A reference also records whether a name denotes an import or an internal function, since only the latter contributes an edge. A per-realm identity refuses reuse with a foreign compiler instance. The release backend has no independent literal pool; a different backend requires a fresh root. Malformed input leaves the existing root intact.

I staged exact shipped inputs with `python3 04-stage.py /tmp/native-wave-deps /tmp/mobile-painter-chess3d/build/esp-idf/main`, then ran `node 05-host.mjs /tmp/native-wave-deps ../../various/04-deps/host.json`. Seven rotated host comparisons per valid edit agreed in complete image and async metadata. In Editor the signature edit rebuilt four functions and the layout edit ten; in Chess the corresponding counts were ten and six. The old global cache rebuilt all 119 or 82. Nine independent development changes exercised field deletion/insertion/order, call signature, definition order, an invalid parameter name and a cycle. The director was sent policy and candidate hashes before release of their sealed fixture.

The design proposes 30 timing samples and bootstrap confidence gates. The physical window is shared between studies. Its bounded trial will explicitly identify the sample count and omit preregistered confidence claims if it does not reach that target. No selective pointer persistence or file format is implemented.

### Prompt context

**User prompt (verbatim).** See Step 1 for the verbatim user request.

**Assistant interpretation.** Implement narrowly observed declaration dependencies.

**Inferred user intent.** Recover unaffected functions across signature/layout edits and prove agreement with the real clean compiler.

**Code checkpoint.** `c07464e`.

### What I did

Intercepted semantic map lookups and replaced cached global ordinals by symbol names. Stored own bindings, recovered graph edges and exact-body identity.

### Why

A signature edit changes every descriptor string even when most individual compiled words and assumptions remain unchanged.

### What worked

Seven rotated host blocks produced the clean images and diagnostics. Primary signature/layout misses were 4/10 Editor and 10/6 Chess.

### What didn’t work

The first design overlooked import-to-internal promotion as a change of graph membership. I included namespace in call facts before locking.

### What I learned

For the current backend, comparing an observed field type and offset is enough to distinguish a changed instruction from an unchanged record handle.

### What was tricky to build

Both a local jump label and a global callee have machine offsets. Their symbolic representations must retain that distinction before final placement.

### What warrants a second pair of eyes

Review the duplicated frontend entry anchors and emitted-function order. Verify that a rejected function cannot publish a root with missing words.

### What should be done in the future

Test extensions with alternate backends independently; the shipped scalar backend remains the identity covered here.

### Code review instructions

Run scripts/04-deps/04-stage.py, then 05-host.mjs. Inspect clean, global and precise rows in various/04-deps/host.json.

### Technical details

The candidate keeps previous and new roots separately. A successful host call returns the new immutable-generation reference; an error result contains no root.

## Step 3. Open the independent holdout and audit clean fragment shape

The director supplied the sealed ten-function telemetry source after the implementation freeze in c07464e. The first attempt, `node 06-holdout.mjs /tmp/native-wave-deps /tmp/native-wave-heldout ../../various/04-deps/held-out.json`, passed unchanged. Four independent valid edits rebuilt one function each. A changed signature without repaired callers produced the exact stock diagnostic after seven earlier hits. Replaying the untouched baseline after rejection hit all ten functions. The source lengthening a literal increased the local instruction sequence. The release frontend's `bufferLiteral` loop emits an immediate narrowed to UTF-16 and a store per code unit; no data pool or inter-function literal references exist in this backend. This resolves a mistaken inference from image growth alone in the lead's received critique.

The independent clean comparison now captures every prepatch word plus symbolic local, function and import relocation before stock layout. For all six primary app/edit cells, the precise candidate retained exactly the compiler-determined unchanged set. This was a retrospective oracle, computed after implementation lock. The complete public-program metadata and static relocation table also matched clean builds through a reverse edit, both release apps, all accepted heldout edits and the invalid states. The `15-full-program` script reconstructs the entire output each time. Six separately disabled subsystems in private in-memory copies each caused the clean oracle to detect a difference. Additional controls verified unchanged imports after symbol permutation, import→function promotion, awaitability, distinct type→enum, shadows, newly nonexhaustive match, and an extra async suspension. A first handwritten development source used `case T.A` instead of Typed's `A:` and produced “unknown case case in T”. A second over-specified the return type of typedSdkYield and the clean compiler reported “expected i32, got bool”. Both fixture spellings were corrected and no candidate logic was changed.

The substantive Opus High critique ran in the original design session. Its snapshot included only one representative host row per cell. Its concerns led me to supply complete seven-block evidence, the independent fragment-shape oracle, the six sensitivity controls and direct compiler source showing immediate literal lowering. Some proposed gates, including a data-pool case, changing the base type of `distinct i32`, an embedding layout whose size shifts outer fields, and an independent jump-overflow study, are inapplicable to this frontend or unmeasured. The final editorial record distinguishes them.

### Prompt context

**User prompt (verbatim).** See Step 1 for the verbatim user request.

**Assistant interpretation.** Open the independent tests without adjusting code.

**Inferred user intent.** Compare each held-out edit with a fresh compile and identify which stored assumptions the tests can falsify.

**Code checkpoint.** `153bae9`.

### What I did

Ran all five director edits, an independent raw-fragment oracle, a complete public-program metadata oracle, six knockout controls and import/async/nominal tests.

### Why

The count of reused functions alone cannot establish byte agreement or show that the cache reuses every eligible clean fragment.

### What worked

All held-out valid states agreed with stock, with nine hits each. The invalid signature produced the same error after seven hits; baseline replay hit ten.

### What didn’t work

The first exhaustive-enum fixture emitted “unknown case case in T”. A handwritten async edit initially emitted “expected i32, got bool”. Correcting the fixture syntax restored the intended positive case.

### What I learned

The editor-generated async continuation changed on the layout edit. The independent oracle identified exactly the same ten rebuilt Editor functions as the candidate.

### What was tricky to build

The clean oracle must hash unresolved symbolic local/global call records together with words. Comparing laid-out function bytes would mix in placement changes.

### What warrants a second pair of eyes

The raw-fragment oracle was written retrospectively. Record that ordering and check the independent producer does not call the treatment.

### What should be done in the future

Further mutation controls could isolate async-prefix and every negative membership fact; six successful knockouts do not exhaust the model.

### Code review instructions

Run 06-holdout.mjs, 13-knockouts.mjs, 14-fragment-oracle.mjs, 15-full-program.mjs and 17-declaration-controls.mjs. Compare the saved JSON receipts.

### Technical details

The held-out clean source hash is 98321148a3451e5574001fbc15d0e95ea161e66def826f421d67addf857a9d7f. The base emitted image has 2,876 bytes.

## Step 4. Build and preflight the physical treatment

The benchmark uses three separate bundled code trees, ordinary JS roots retained in RAM, release QuickJS plus its native token index and a PSRAM allocator. It performs five interleaved measurements per arm, and checks each complete linked board image bytewise against a fresh stock board image and by CRC against host gold. The isolated image does not mount or modify flash storage. Fresh paired first builds measure clean and precise; warmed measurements also include the complete earlier global comparator. The default release entry supplies the artifact and does not execute the edited program.

The physical shell is reused from the last study. The first host-only preflight, pointing at the source-stage directory for the recovery image, correctly raised `AssertionError` on the known ordinary application hash before touching serial. With `/tmp/chess-camera-release/build` for the release image and partition, the preflight passed for candidate b3ad52ac6eae03f82a6e20e575d00818d37fcb1e7990e396b73d6d775cc3714f. I independently located all four exact input byte strings inside the canonical firmware; their offsets/digests live in `various/04-deps/release-inputs.json`. I also corrected the analogous recovery example in the earlier report in commit 3f1c42a and informed its publisher. Current shell remained off serial awaiting the designated operator's explicit handoff.

### Prompt context

**User prompt (verbatim).** See Step 1 for the verbatim user request.

**Assistant interpretation.** Prepare an actual P4 measurement and mandatory playable recovery.

**Inferred user intent.** Time real application edits at a common endpoint while keeping the device usable after the trial.

**Code checkpoint.** `153bae9`.

### What I did

Built the ESP-IDF image with separate compiler arms, checked four input byte strings against the published firmware, and ran a serial-free image preflight.

### Why

The production app and the source-stage directory contain different firmware binaries even though the source-stage inputs are embedded in the production image.

### What worked

Preflight verified candidate b3ad52ac… and the canonical application/partition. The 90 planned JS response rows also pass in a host-side payload replay.

### What didn’t work

The first recovery-directory argument failed the explicit hash guard with AssertionError before serial access. Using /tmp/chess-camera-release/build passed.

### What I learned

Full-application identity, reactor identity and Typed source identity are distinct, and a correct report must name the corresponding paths separately.

### What was tricky to build

The previous runner parses specific marker counts. I reused its device lock and restoration path while changing validation to the exact 90-row factorial design.

### What warrants a second pair of eyes

Check all 90 app/edit/arm/block tuples and the board-produced CRCs, plus the released painter and eight healthy native worlds after restore.

### What should be done in the future

Do not infer a single-session heap peak from the research harness that intentionally keeps the stock, global and precise backends resident.

### Code review instructions

Read 09-board.js, 10-board-stage.py and 12-device.py. Use --preflight to verify both firmware hashes without opening the serial device.

### Technical details

The physical JS context uses the release native lexical index, aligned PSRAM allocator, 56 KiB JS stack allowance and an 80 KiB task stack.

## Step 5. Resolve the lead’s timing and literal critiques before the board window

I measured an additional 30 rotated host blocks per treatment and split RV32 compile and ELF-link clocks without changing the frozen candidate. A seeded 10,000-resample paired bootstrap of the within-run median precise-minus-global time placed all four signature and layout difference intervals below zero. The median paired ratio on Chess local edits was 1.143, beyond the lead’s 1.10 allowance. The winning structural cells do not erase that adverse local result. This interval describes this single host run; the separate physical experiment has five blocks, and its confidence gate is deliberately unfilled.

The host executed the exact C-embedded device JavaScript payloads after staging. All 90 planned results passed their clean byte/CRC oracle on the host. Another control moved a literal in a non-final function ahead of retained helpers, verifying that final relative calls are rebound. Nested records were tested as one-word handles: appending a field to an inner record preserved an outer field’s offset. These observations distinguish the shipped word-layout rules from hypothetical inlined records or pooled constants. The optional data-pool compiler in the earlier release study is a different backend with no shared cache identity.

### Prompt context

**User prompt (verbatim).** See Step 1 for the verbatim user request.

**Assistant interpretation.** Separate compiler and linker timing on the host and test more layout cases.

**Inferred user intent.** Find out whether precise validation imposes a local-edit tax even when structural edits improve.

**Code checkpoint.** `79f32cc`.

### What I did

Ran 30 rotated host blocks for every primary arm/edit, retained raw compile/link elapsed times and computed a seeded paired bootstrap.

### Why

The first seven host blocks tested byte identity. Clock splits and additional repetitions answer a different performance question and make the sampling method visible.

### What worked

All four signature/layout bootstrap intervals for precise-minus-global within this run were below zero. The Chess body median paired ratio was 1.143.

### What didn’t work

The proposed ten-percent body-overhead allowance failed for Chess on this host. Earlier single-row aggregates sent for critique could not establish this.

### What I learned

The linker took a small fraction of host end-to-end time. Most structural savings occurred before the final reactor copy and import relocation.

### What was tricky to build

The host wrappers keep the actual pristine and precise compiler functions separate and time the link independently from clean-oracle hashing.

### What warrants a second pair of eyes

Inspect whether host JIT warm-up or the fixed round-robin order could distort a comparison with on-board QuickJS.

### What should be done in the future

Use separate boots and an attributable resident-compiler budget before any deployment claim.

### Code review instructions

Run 19-host-phases.mjs followed by 20-host-summary.py and inspect per-cell block observations and paired ratios.

### Technical details

The bootstrap resamples 30 paired differences 10,000 times with a fixed seed; it does not represent variation between computers or boots.

## Step 6. Measure the physical edit sessions, restore the release and audit every row

The preceding operator explicitly handed off the shared serial port after restoring and checking the ordinary release. The process verified that state itself, installed the isolated compiler experiment and obtained four cold and ninety warmed measurements. It then restored the production image and partition, read them back and waited for the ordinary native worlds and painter. I released the lock to the director for the fourth window only after the process exited successfully.

### Prompt context

**User prompt.** See Step 1 for the verbatim request. **Assistant interpretation.** Put the genuine release workloads through all three compiler paths on the PicoCalc. **Inferred user intent.** Measure both structural gains and their costs in normal local-edit and cold cases. **Earlier code checkpoint.** The measured policy sources were frozen in c07464e. The build and target controls were committed at 153bae9.

### What I did

Ran the SD-independent ESP-IDF image via `12-device.py /tmp/native-wave-deps-board/build /tmp/chess-camera-release/build /tmp/native-wave-deps/gold.json /tmp/native-wave-deps-physical` after explicit serial handoff. The physical data were copied to `various/04-deps/physical.json` and the emitted benchmark-only records to `physical-rows.txt`. The report writer received aggregate data without the raw serial session or credentials.

### Why

Recording every declaration read saves work only if checking incoming answers and maintaining the cache costs less than compiling the functions it retains. The baseline coarse cache can be particularly cheap for a one-function body edit. The three-arm comparison measures both effects.

### What worked

The warm precise compiler won all five pairs against both alternatives on signature and layout edits in each app. Editor structural medians were 1.080 and 1.301 seconds against 2.465 and 2.474 for the previous cache. Chess structural medians were 0.970 and 0.891 seconds against 3.365 and 3.363. Every completed image matched the stock hardware ELF byte for byte and the stock host checksum.

### What didn’t work

The local-body timing prediction failed on the actual target. The precise-to-global median paired ratio was 1.1346 for Editor and 1.1075 for Chess, losing all five direct pairs in each case. The new cache remained faster than clean in every body-edit pair. Fresh precise compilation cost 3.234 seconds and a 3,369,376-byte peak for Editor versus 2.574 seconds and 2,554,092 bytes stock; Chess cost 3.961 seconds and 4,074,036 bytes versus 3.579 seconds and 3,186,424 bytes stock. The measured implementation does not meet the whole preregistered timing criterion.

### What I learned

The structural improvement is large enough to change elapsed time at the physical return endpoint. It comes with a reproducible local-body cost and thinner first-build headroom. Saving work in source-independent code demand does not make the research harness fit a production interactive memory envelope.

### What was tricky to build

The instrumented warm harness held all three compilers and retained verification state. Its peaks of 27,953,356 bytes and 7,094,500 bytes are whole-trial high-water observations, not measurements of one proposed production session. Cold and warm clocks therefore cannot be interpreted as measuring the same process.

### What warrants a second pair of eyes

Five rotated blocks share one boot and do not establish the proposed 30-block physical confidence interval. The 30-block host experiment supplies an independently reported within-run interval and exposes a different engine. The public native ELF-return endpoint excludes loader relocation and invocation of the edited native application.

### What should be done in the future

A follow-up should keep a cheap whole-environment-match fast path for local-body edits and record dependencies on the slow path, then evaluate the combination as a new candidate. Isolate one resident compiler, retain only the required generation, and test the exact 4 MiB and six-second shipping limits across boots.

### Code review instructions

Run `24-physical-audit.py` on the serial result excerpt, physical JSON and freshly generated clean gold. Run `16-summarize.py` to reproduce cell medians, wins and paired ratios. The audit found exactly 90 unique warm combinations, four fresh CRCs, two warm heap peaks, ordinary release readback and a healthy painter.

### Technical details

The scalar release application matched SHA-256 `134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1`, the partition `72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30`. After readback the expected eight native worlds were healthy and the painter reported one source, one compilation, one installation and zero rejects. The test did not open the filesystem or persist fragments.
