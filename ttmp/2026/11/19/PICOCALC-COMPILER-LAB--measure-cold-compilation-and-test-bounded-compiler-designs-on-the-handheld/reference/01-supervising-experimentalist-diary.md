---
Title: Supervising experimentalist diary
Ticket: PICOCALC-COMPILER-LAB
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:23:27.425585616-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervising experimentalist diary

## Step 1: Read the brief, freeze the control and assign independent designs

I read the attached research brief before inspecting the repository. The current project head contains the previous combined trial. It supplies both the production compiler inputs and a tested physical qualification harness. I reserved the first device window for frontend measurement because the half-second target depends directly on the previously unattributed interval.

### Prompt Context

**User prompt (verbatim):** “Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
Chose opus high for researchers
Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).
 Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.”

**User follow-up (verbatim):** “eacher resercher should create a design doc ofc (I don't know if i said that in the prompt already)”

**Attached scope:** [Verbatim lab brief](../sources/research-brief.md). **Assistant interpretation:** Three initially parallel experiments, followed by the incremental study, documented independently and jointly. **Inferred user intent:** Learn both the engineering results and how a lab can discriminate between architectural hypotheses on one physical device.

### What I did

- Read the diary, textbook-authoring and vault instructions. Verified the executable interface for `claude --model opus --effort high`, its local authentication status, and the available device nodes.
- Assigned local operators for three independent Opus-led studies. Requested researcher-owned designs before implementation and reserved publication for after actual measurements.
- Opened this ticket with four explicit completion tasks. Froze source revision `40bcf850a5809ef6d839127869faa952596ed157` and specified experiment boundaries in the design guide.

### Why

Running several experiments against one active serial interface would corrupt time attribution. A single device operator and isolated source trees allow parallel host research without competing for the board.

### What worked

The project worktree has the same compiler revision as the checkout used for the combined trial. The installed CLI exposes both the Opus alias and effort setting. The physical serial adapter is present at `/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00` and identifies `/dev/ttyACM0` outside the sandbox.

### What didn't work

Sandboxed `ls -l /dev/ttyACM0 /dev/ttyUSB0` returned “No such file or directory”, while `/sys/class/tty` listed both and `lsusb` reported “unable to initialize libusb: -99”. An approved read-only outer-device inventory resolved the discrepancy. The built-in collaboration picker does not offer Opus; the authenticated local provider CLI is the research path being checked by the operators.

### What I learned

The older build used ESP-IDF 5.4.2 with the Python 3.13 environment. Its stored control reactors are available for checking artifact identity before any firmware changes.

### What was tricky to build

Host and device receipts require different evidence. A returned executable may have unchanged padded size while its machine code shrinks, and a faster compiler can still produce slower guest code. The design records each observable separately.

### What warrants a second pair of eyes

The source probe must distinguish time between 120 function callbacks from exclusive lexer time. The held-out program must not influence policy selection. An on-device replay should include a complete, independently derived expected ELF or an appropriate behavioral oracle.

### What should be done in the future

Obtain fresh current factory backup and phase observations, perform each comparison, publish separate reports, and independently replicate the strongest physical result.

### Code review instructions

Start with [the experimental design](../design-doc/01-experimental-design-for-cold-builds-and-bounded-compilation-on-the-esp32-p4.md) and this ticket's tasks. The production entry points and paired controls are linked there.

### Technical details

Pinned SHA-256 for `typed-wasm.js` is `cc7e638c562655725115e5bd15680c277c90390cb831f6de0dad765dbdda68f2`; for `typed-rv32.js` it is `64d5c1550442c161887d29982605cddac7e13237eb3259a5ccd1f3ca03834f38`. Hardware receipts will retain compile time in microseconds and peak heap in bytes.

## Step 2: Take a fresh backup and build the negative control

I captured the current factory partition before flashing any experiment, then built a disposable firmware image with two copies of the production compiler. Measuring the same implementation under two labels makes timing differences from the harness observable. The measured guest functions execute instructions emitted by those same compiler variants.

### Prompt Context

**User prompt:** See Step 1 and the attached brief. **Assistant interpretation:** Independently measure compiler and guest costs while the researchers work on host implementations. **Inferred user intent:** Keep different studies comparable on the actual handheld. **Commit (design):** 121121b — Freeze the handheld compiler experiments and physical evaluation design.

### What I did

- Ran the thesis ticket's `p4-backup.sh` on the confirmed physical port. The fresh 8 MiB factory image SHA-256 is `6b0e3ba4a2d4546b5eeae3a608c82b3b0df06034afc5afedcc1e3e264d0b883f`. The partition table SHA-256 is `1e67efde107bf6b3b9ee582350256b0bead1f1f88605cc6b13a5216beefe07f8`. Store the firmware locally outside version control.
- Staged isolated per-lane compilers, real Files/Agenda/Editor C entry points, a matched-block board driver and a complete executable hash oracle. Generated a two-app guest timing fixture and an independent frontend differential suite covering 321 source inputs on each target.
- Checked the hosted compiler probe used by the native research operator. It reported Opus 5.5. The approval review subsequently rejected forwarding private compiler inputs to the provider. I requested user authorization for a narrowly defined payload. Public algorithm questions with tools disabled are proceeding independently.

### Why

Guest work can change while the compiler becomes slower, and it can stay identical while cold build time changes. A second experiment inside the same firmware times 128 calls per sample to a pure Files name comparison and to Agenda's weekday calculation on eight independently checked dates. Guest output and compile output have separate oracles.

### What worked

Fresh hardware backup succeeded. Host control probes produced 804 Files words and 4,058 Agenda words for both labels. All 321 independent source comparisons passed against the control on both compiler targets, including 134 syntax failures per target whose error type and message match exactly.

### What didn't work

The first local tmux start returned `error connecting to /tmp/compiler-wave.Sh834IUJ/tmux.sock (Operation not permitted)`. The approved outer tmux build used a private socket and the previously verified IDF toolchain. Automatic approval rejected the native design request with private source; the rejection and approved alternatives are recorded in the relevant study.

### What I learned

Agenda's weekday function calls other functions in its generated program. Copying its isolated function body would measure invalid code. The guest fixture therefore retains the complete position-independent app instruction image and labels the chosen function's byte offset.

### What was tricky to build

Physical comparisons require three distinct byte identities: the compiler script present in the firmware, the guest text executed by the timing fixture, and the complete application ELF returned through each normal C wrapper. The oracle checks each independently. Experimental images include multiple JS blobs, so a compiler source hash by itself does not prove the wrapper selected that source.

### What warrants a second pair of eyes

The fixture's eight-date calendar workload and long equal-prefix filename exercise pure app functions. They do not estimate an application turn or user interaction. Position balancing and a byte-identical control quantify some harness variation; instruction address and cache state can still alter guest cycles.

### What should be done in the future

Run the physical negative control first. Use the same timing fixtures on qualified native and bounded-analysis candidates, then remeasure the best cold-build result through the supervisor's own runner.

### Code review instructions

Read `scripts/01-stage.py`, `scripts/02-trials.c` and `scripts/03-oracle.mjs` together. The complete cases and validation are in `scripts/04-board.py` and `scripts/06-frontend-differential.mjs`.

### Technical details

A balanced boot with N lanes measures 2 × N² × 3 cold compiles and 16 warmed batches per named guest and lane. The fresh process receives production streaming settings and teardown on every cold call. Durations use CPU cycles for guest batches and microseconds for the complete compiler.

The initial firmware link failed with `section .flash.text VMA [40000040,401b8f57] overlaps section .flash_rodata_dummy VMA [40000020,401c001f]`. The guest assembly had raised the entire output section's alignment to 64 bytes. The chip linker script expects mapped text to start at offset 0x20. Emitting ordinary four-byte instruction alignment restored the IDF layout. A complete rebuild succeeded, and the host oracle verified the two embedded guest images and all three application ELFs against the preceding trial's frozen control.

The user approved sending the specified compiler, typed app sources, study designs, candidate code and aggregate measurements to the authenticated Anthropic endpoint. I relayed the payload restriction to all three research operators. The user subsequently approved GPT‑6.2 Sol High as an additional researcher model. The first three studies keep their Opus High partners; the planned incremental study can use Sol High.

## Step 3: Compare two independent forecasts on a masked physical result

With the larger program paused, the user endorsed asking the models the same question independently. I ran a separate retrospective comparison using an existing firmware experiment. The prior publication made this a blind exercise for the two respondents only. The physical board's previously running negative-control trial also finished restoring its original firmware.

### Prompt Context

**User prompt (verbatim):** “actually, your idea to ask the same question independently was good.” **Assistant interpretation:** Carry out an independent comparison about a real compiler design decision. **Inferred user intent:** See which kind of research judgment each model contributes. **Commits:** 4847d21 froze the common packet and grading rule; 8073de4 froze both predictions before grading.

### What I did

- Gave fresh GPT‑6.2 Sol High and Claude Opus 5.5 High the same six-forecast problem. Alias labels hid application names. Both had only baseline and two individual changes on boot 1 and neither used tools. The external call carried the approved aggregate research data alone.
- Compared their predictions with paired blocks from the combined arm of boot 2. Included an additive forecast and an unchanged-control forecast under the same loss function.

### Why

A score measures a distinct part of research judgment. Asking for both a numerical forecast and an observation that would falsify a proposed mechanism permits separate review of ideas and accuracy.

### What worked

Both predicted all six directions, as did the arithmetic rule. Opus averaged 1.003 percentage points of absolute error, Sol 1.126 and the additive rule 1.172. The two proposed follow-up measurements are recorded beside their numbers.

### What didn't work

The CLI emitted an array of events, so the first query assuming an object produced `Cannot index array with string "is_error"`. Selecting the terminal result verified successful completion and resolved model identity. Opus fenced the JSON in Markdown. Only those fences were removed.

### What I learned

The difference between the model scores is small relative to the errors, and the data points are correlated across one board. The best discrimination came from explaining why the heap of the largest workload can fail to follow an additive estimate.

### What was tricky to build

The input supplies boot-1 group medians while the target is the median of four within-block percent changes on boot 2. These definitions are intentionally explicit. The scoring code evaluates signed changes before taking absolute errors, and preserves the exact scores for review.

### What warrants a second pair of eyes

The supervisor had seen the retrospective study. A future prospective task with several unseen mechanisms would support a stronger comparison. A phase label identifies when a peak occurred. Allocation ancestry is needed to attribute that peak.

### What should be done in the future

Use prospective blind design questions during later studies when the user resumes the lab. The earlier negative-control receipt reports one completed boot and verified restoration. No new flash was needed for this forecast.

### Code review instructions

Read `various/paired-review/protocol.md` and both response files. Run `python3 -B scripts/07-score-research-forecasts.py` from this ticket. Compare the printed JSON with `various/paired-review/scores.json`.

### Technical details

The common prompt SHA-256 is `9df493f28046d84a73b7421cd1d107af8745c58a94b635d2052a9f7b1a2abe83`. We graded two estimates per app on three apps, with no score for subjective explanation quality.

## Step 4: Resume the measured studies and serialize the board jobs

When the lab goal resumed, none of its prior researcher sessions or host processes was running. The original control trial had completed its restore. I resumed all three operators from their checkpoints and scheduled the physical trials behind one serial owner.

### Prompt Context

**User prompt (verbatim):** “ok it's fine then. I gather they are running in the background?” **Assistant interpretation:** Give the actual status. The user separately reactivated the existing goal. **Inferred user intent:** Continue the research and maintain end-to-end ownership. See Step 1 for original scope.

### What I did

- Verified the original backup checksum, rebuilt the frozen JS lane oracles independently, and used a balanced two-boot frontend protocol with normal app wrappers and exact host ELF checks.
- Reserved the next three jobs for scanner replication, native instruction selection, and held-out arithmetic policies. Started separate builds in disposable directories, with a serial runner that requires restoration before another flash.
- Recorded the negative-control measurements in `various/identical-control.json`. Compared current staged data with examiner predictions committed before the holdout was evaluated.

### Why

The scanner has an instrumented image and an uninstrumented physical effect. Independent compilation in a separate firmware tree retests the latter. For native and bounded code, executable bytes change, so the common harness adds two guest-cycle checks and requires exact per-candidate host/device ELF identity.

### What worked

The byte-identical arms differed by 2.17% for Files cold time, 0.85% for Agenda and 0.09% for Editor on the negative-control boot. Guest medians differed by 0.002% and 0.021% for the Files and Agenda checks. The first frontend boot accepted all 48 physical compiles. Editor saved 289,823.5 microseconds but used 9,036 additional peak bytes.

### What didn't work

The previous session state could not be inferred from the goal flag. The agents had explicitly stopped at pause; the host had no matching research process. A stored design or binary alone cannot establish live work. No fresh device failure was observed at this checkpoint.

### What I learned

The two objectives for cold builds must be tested together. A reproducibly faster scanner can retain more peak compiler memory even when it emits identical code. Static instruction counts can be accurate to within a few instructions without establishing compiler time or the loaded world's measured footprint.

### What was tricky to build

The same serial port is used for firmware programming and interactive status. Each run validates the current partition map, saves measurements first, restores the original factory bytes, verifies all three native worlds, and hands the port back only then. Experiments under development on the host may proceed throughout.

### What warrants a second pair of eyes

Check measured differences against the negative control. Keep initial scanner results separate from the independent hardware replay, and use the actual smaller-slot reactor when evaluating how much memory the running app reclaims.

### What should be done in the future

Collect all independent measurements, start the fourth study when an initial one finishes, secure independent scientific review and publish the four articles and synthesis.

### Code review instructions

Follow `scripts/08-run-frontend-board.py` for the instrumented research image, `scripts/09-run-ready-trials.sh` for serial ownership, and `scripts/04-board.py` for shared app and guest comparisons. Each final receipt must be traceable to a fresh host build and observed device hash.

### Technical details

Both the generic negative-control firmware and the frontend-specific firmware use the same saved factory partition. Its SHA-256 begins `6b0e3ba4`. The frontend's separately staged firmware SHA-256 starts `07d98dee`.

## Step 5: Replicate the scanner and separate compiler cost from native runtime cost

The frontend researcher completed the first study. I started the incremental researcher and the independent methods examiner while the ESP32 ran the replication and native comparisons. The clean native timings overturned an easy inference from the smaller machine code.

### Prompt Context

**User prompt (verbatim):** “actually, your idea to ask the same question independently was good.” The research brief also asks the supervisor to “independently replay the strongest result.” **Assistant interpretation:** Preserve the blind research question and use an independent staging path for the strongest cold-build claim. **Inferred user intent:** Learn whether an optimization survives a change in measurement setup and have independent researchers look for falsifying examples.

### What I did

- Compiled the cursor scanner again from a separate staging tree with the generic supervisor harness. Used the production Files, Agenda, and Editor wrappers, ran four matched blocks per boot on two boots, verified 48 ELF identities and restored the original firmware. Kept all per-block measurements and ran diagnostic comparisons on unrelated generated fixtures.
- Built a native-control comparison with three arms and six matched blocks per boot. Separated clean compiler time, allocator high-water mark, emitted RV32 words, padded file bytes and cycles for two native guest functions. Captured 108 fresh app builds across two boots.
- Arranged physical qualification of the staged compiler with an actual smaller reactor. Prepared a separate normal Editor boot for the bounded Select compiler so the digest is taken from exactly the buffer returned to the native loader. The paired compiler trial alone returns to a control world after timing.
- Started a fourth researcher on function-level edit-to-run and an independent methods reviewer. The reviewer generated 69,632 fresh lexical traces and constructed a budget adversary with a fixed number of charged visits and different source order.

### Why

A regular expression can be replaced without changing any generated instructions. A new instruction selector can shrink every program while making the compiler itself spend longer deciding what to emit. A timing harness can even verify the correct compiled bytes and then boot a different app. Each claim needs a measurement at its own boundary.

### What worked

The independently staged scanner saved 292.445 and 315.438 ms per Editor compile (11.92% and 12.77%) and added 9,066 and 9,070 peak bytes. The independently staged native operand implementation cut physical Files comparator and Agenda weekday cycles by about 25–26%, and cut the Editor instruction payload by 24.42%. Yet Editor compilation took an extra 444.973 and 444.120 ms, approximately 18%, and consumed about 28.94 kB more peak compiler heap.

### What didn't work

The native backend cannot satisfy the cold-compile target on this evidence. The common guest harness measured two pure leaf/workload functions; it does not measure total Editor UI latency. Recording a signed arithmetic operation in a function identifies opportunities, but the examiner's adversarial program shows that function order can bring the measured yield from 720 saved words to zero when eligible functions compete for budget.

### What I learned

The scanner receives four independent boot measurements across the originating and replication harnesses. Summing matched block deltas or averaging their percentages without identifying the boot would falsely give these repeated measurements the status of independent devices. The reference for native and bounded arithmetic is the frozen streaming control, so stacking the observed timing changes requires a separate build and trial.

### What was tricky to build

A smaller reservation only releases world memory when the ELF is linked against a resized reactor. A selected-policy guest screen only qualifies that particular compiler when the returned image is verified before loading and the application then exercises real behavior. The two qualification images share a serial resource, so they run after the timing queue, with a known control between trials.

### What warrants a second pair of eyes

Check the staged guest-cycle units, the signed direction of medians of paired differences, and the separate whole-workflow emulation counts. For the budget result, compare equal charged cells, the changed function order and the unbounded reference. Require the normal-world qualification receipts before asserting physical UI equivalence.

### What should be done in the future

Finish normal-boot qualification, collect independent results for the incremental lane, and publish a synthesis with separate cold, resident-world, guest execution and edit-to-run decisions.

### Code review instructions

Read `scripts/04-board.py` and `scripts/05-summarize.py` with `various/scanner-independent-physical.json` and `various/native-physical.json`. Run the summarizer on each receipt and compare its output with the checked-in JSON. The normal-world qualification lives in `scripts/10-small-slot-board.py` and `scripts/12-stage-select-editor.py`.

### Technical details

The control revision is `40bcf850a5809ef6d839127869faa952596ed157`. The generic firmware checks the embedded JS, generated image SHA-256, app size, test order, correctness of the guest results, and three native world names before accepting a trial. Raw flash images and serial streams stayed in disposable storage. Published artifacts contain the compact evidence required to recompute the reported quantities.

## Step 6: Qualify the real Editor and identify a different installed compiler

The smaller-slot image produced a real running Editor with a measurable memory reduction. Separately, the examiner identified the compiler actually installed when we took the factory backup. Its identity changed which comparison could attribute the difference to the reservation alone.

### Prompt Context

The lab brief asks, “Can Scope A make the generated program small enough to reduce Editor’s reserved native-code slot?” The user also asked for diagrams, screenshots, careful diaries and design guides on reMarkable. **Assistant interpretation:** Build and run the resized reactor, verify a real Editor use case and document which baseline owns each number. **Inferred user intent:** Distinguish practical results from estimates in a way someone can repeat later.

### What I did

- Flashed the 80 KiB staged reactor, verified its returned ELF after each of three normal Editor boots, and measured 566.1 KiB live at all three. Opened a 65,536-byte Unicode Markdown file, captured two screen CRCs, compared every non-clock pixel to the previously qualified reference, removed the test document and restored the factory firmware. Saved one screenshot since both captures were identical.
- Completed the two bounded arithmetic boots. Archived all 108 compile rows and 192 guest batches and generated the joint comparison table and figure. Queued a normal Select Editor with matching verified compiler sources for its live workflow.
- The examiner matched the factory image's JavaScript bytes against the earlier revision `08fbae85`. The frozen research control is `40bcf85`. I built a second normal staged image with the larger 224 KiB reservation, matching the 80 KiB image in compiler, normal wrapper and SDK configuration. I also re-linked both independently and matched their prior ELF hashes.
- Delivered the frontend, native, bounded, incremental, reviewer and supervisor design guides together on reMarkable. The client returned `OK: uploaded PicoCalc Compiler Lab - Six Research Design Guides.pdf -> /ai/2026/11/19/PICOCALC-COMPILER-LAB`.
- Removed the queued first incremental image before it wrote any bytes. Its author identified an incompatible executable heap allocation with this board's memory-protection configuration. Moved the ready matched reservation ahead of the incremental run while the author repaired guest placement.

### Why

The ELF hash and machine-code count establish what the compiler produced. The world status and screen establish what the OS actually loaded and displayed. The factory backup is essential for restoration and its compiler revision must be considered before treating it as a comparison arm.

### What worked

The capacity reduction was real and the live 64 KiB workflow passed. The clean bounded comparison found a 398–403 ms lower Editor compile time for Select compared with Always, but Select still cost 50–54 ms more than the frozen control. A fixed-budget stress test showed that changing only source order could erase all 720 words of available benefit. Six guides reached the user's reMarkable cloud folder.

### What didn't work

The first attempt to regenerate the matched ELF oracle used the outer staging directory, which has compiler sources but no `sources/editor/app.typed`. The native study's `run/` child contained the frozen source. With that corrected input the complete 224 KiB-slot ELF matched `c93d2296…`. The initial incremental firmware was never used for a measurement.

### What I learned

An old installation can be in perfect working order and still be an unsuitable contemporary control. Its three native app health checks qualify the restoration. The pooled table uses the control in the same firmware as each research candidate. The 224/80 comparison needs the same lowerer in both normal firmware images.

### What was tricky to build

Same-world verification depends on hashing the buffer returned by the ordinary wrapper and preserving it for the loader. The staged small and standard images intentionally use identical receipt code, including its historical label. The observed ELF identities, sizes and predeclared image hashes distinguish the arms. Each serial job starts only when the preceding job's restored health receipt is complete.

### What warrants a second pair of eyes

Verify the 224 KiB and 80 KiB reactor inputs, full ELF digests and actual loaded bytes. In the incremental arm, distinguish time to compile/link, time to prepare executable memory and time to call the function. Comparing raw resident-firmware boot times across compiler revisions would produce a misleading claim.

### What should be done in the future

Finish the matched capacity and incremental trials, validate the physical results with the independent examiner and publish each final research article and the synthesis.

### Code review instructions

Follow `scripts/10-small-slot-board.py`, `scripts/12-stage-select-editor.py`, and `scripts/15-stage-matched-reservation.py`. Check the host and board identities in the native study's slot oracle. Regenerate `various/cross-study.json`, `various/cross-study-table.md` and the figure with `scripts/11-cross-study.py`. Inspect the independent reviewer’s firmware-source comparison.

### Technical details

The identity of the normal 80 KiB-slot ELF starts `81718435`. Its firmware starts `0a0da581`. The matched 224 KiB-slot firmware starts `3038ea64`. Select’s normal firmware starts `348e1c87` and its expected Editor ELF starts `06a85ff6`. The original factory partition starts `6b0e3ba4`. The restored physical board and private backup remain distinct from the frozen experimental control.
