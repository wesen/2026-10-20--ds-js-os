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
