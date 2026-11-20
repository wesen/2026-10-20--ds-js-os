---
Title: Supervisor investigation diary
Ticket: PICOCALC-RV32-STUDIES
Status: active
Topics:
    - picocalc
    - native
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T19:30:57.411003462-05:00
WhatFor: ""
WhenToUse: ""
---

# Supervisor investigation diary


## Step 1: Establish a shared control and assign independent reviews

The two proposals modify different points in the native compiler. I froze the production inputs at `6426798` and assigned each a separate ticket. A third researcher received the role of examiner. All board runs use one supervisor-owned schedule so the two changes can be compared against the same control.

### Prompt Context

**User prompt (verbatim):**

> can you link the research index in the README.md  or so to point at where we currently are? Or AGENTS.md (I think is the right file). 
>
> Then run the independent research (all the way). Have the subagents Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
>
> Also each: keep detailed diaries (you too), according to the diary skill format. Also to write  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).      
>  Commit and push the bsidian vault when done (go-go-parc vault) Once done (each subagent, and when they come back you look at their resulting research and results and write your own report, reexplaining everything as a fundamental for a new intern newcommer, pedagogically, in a textbook authoring stle.

**Assistant interpretation:** Link the existing global index, complete the two open compiler experiments, and publish the researchers’ work and a separate teaching synthesis.

**Inferred user intent:** Make historical evidence discoverable and reproducible, including negative results.

### What I did

- Added the repository-level agent entry point and opened a coordinating docmgr ticket. Assigned code generation, output allocation and independent examination to different researchers.
- Located the P4 by USB serial ID and began backing up the 8 MiB factory application after a console bus hold. Scripts and results stay in the tickets. The private board backup stays in scratch.
- Wrote the trial schedule and experimental design before physical measurement. Staged six JavaScript compiler configurations from the frozen revision.

### Why

A fresh runtime measures cold compilation. Running four compilers in one firmware ties the reactor, build configuration, timer, and board to the same experiment. The Files leaf is a separate measurement of generated code executing on the CPU.

### What worked

Both independent generators produced the same control files. The candidate branch backend and the output-only variants can be built in scratch without modifying the production compiler.

### What didn't work

The first sandboxed staging run reported `spawnSync git EPERM` in the existing Node benchmark extractor. I retained the partial stage in scratch and ran the toolchain-backed build outside that restriction. The first detached backup launch created no output directory. A foreground serial session received `#OK hold` and began the verified read.

### What I learned

A shared baseline must include the world linker as well as the frontend and instruction selector. Measuring the complete ELF and the used code separately is essential with fixed reservations.

### What was tricky to build

The user-facing Editor startup path is also a convenient place to run clean and instrumented trials. The driver runs its full series once per boot and then returns a real branch-built app to the loader on ordinary requests.

### What warrants a second pair of eyes

Check the guest code extraction, signed comparators and ELF relocation identity. Review the boundaries between setup, lowering and teardown in the allocation account.

### What should be done in the future

Qualify outputs on hardware, collect the reviewer’s independent results, and publish the derived decisions.

### Code review instructions

Read the linked design first. Trace the six variant selections in `scripts/stage.py` into `scripts/editor-trials.c`. Compare each clean control file with the baseline at `6426798`.

### Technical details

The clean Editor runs use 4 MiB and 6,000,000 microseconds as hard limits. Four clean blocks cross four lane positions. Each phase-only lane runs twice, in opposite orders. Both guest Files bodies use the same C ABI and matched entry-address residues modulo 64.

## Step 2: Qualify the physical inputs before booting the experiment

After the researchers produced their candidates, I staged each original JavaScript source, generated a common IDF image, and extracted the two Files implementations from compiler-generated bytes. The first project checkpoint was `4e079c0`.

### Prompt Context

**User prompt:** see Step 1. **Assistant interpretation:** Evaluate the actual output of each independent compiler. **Inferred user intent:** A physical result should be traceable to specific source and executable bytes.

### What I did

- Built ESP-IDF in a scratch tree with six packaged compiler combinations and two filesCompare bodies. Verified each linked function symbol, its size, contents and entry alignment against the compiler-produced leaf.
- Confirmed the full 8 MiB backup digest `6b0e3ba4a2d4546b5eeae3a608c82b3b0df06034afc5afedcc1e3e264d0b883f`. Checked the partition table before writing.
- Built a Node oracle from the exact IDF-generated Editor reactor. Added paired observations for clean compiles, separate profiling runs and a post-trial restore procedure.

### Why

The host test reactor and firmware reactor are different builds. Comparing an unqualified host ELF digest to a board digest would misdiagnose a correct compiler. The native leaf comparison supplies an independent physical cycle measure of executing generated instructions.

### What worked

- All three emitter/storage modes generated the same 240,452-byte Editor ELF for the IDF reactor, digest `aaf6a214…`. The fusion variant generated `20e1d4d7…`.
- The pre-flash ELF checker found both function bodies at equal alignment residues with the expected SHA-256. The board image digest was `d276c070154de6fbbf380e96ca87f041e00f168a228c9aa83c21a976e569f866`.

### What didn't work

The original Files comparison generator expects two Git revisions. Research candidates are reproducible source overlays. I adapted its input reader in scratch, used the frozen Files source and ABI for each, and kept its code extraction, control-flow checks and linked-symbol checker.

### What I learned

One ELF digest per candidate is required for branch lowering. A single shared hash across all successful output variants is a stronger condition appropriate to their storage-only change.

### What was tricky to build

Combining leaf timing and compiler measurements in one firmware requires distinct windows. The benchmark stores its 80 pairs in memory and reports them after all timing. Each fresh Editor compiler returns its buffer before the harness computes its digest. Instrumentation has its own embedded runtime so the clean allocator sees no extra per-allocation work.

### What warrants a second pair of eyes

The leaf benchmark returns void, including on failure. The independent summarizer requires a complete run, all five expected inputs, 16 balanced pairs each, and the expected accumulator before reporting cycles. A later success marker in the outer harness would be insufficient.

### What should be done in the future

Compare hardware and host behavior, especially the point at which live memory reaches its maximum.

### Code review instructions

Read `scripts/board.py` alongside `scripts/oracle.mjs`. The integration ticket’s `files-compare-p4/check-elf.py` and `summarize.py` are unchanged and are used directly as checkers.

### Technical details

The source SHA-256 begins `f37f60f3`; the reactor SHA-256 begins `16660a8a`. The board harness runs 16 clean compiles plus four profiled compiles. It then returns the branch-built Editor to the normal world loader.

## Step 3: Recover a valid first-boot result and replicate the physical experiment

The series completed all 20 Editor compiles and emitted all 80 matched Files observations. The first online analysis stopped at the standalone validator’s CPU-affinity assertion. The recorded hardware core agreed with the OS code. I updated the check to require the actual kernel core, retained the original recording, and arranged a second boot for the preview and an independent repetition.

### Prompt Context

**User prompt:** see Step 1. **Assistant interpretation:** Finish the physical work and account for departures from the intended procedure. **Inferred user intent:** Readers should be able to distinguish a test-harness error from a compiler failure.

### What I did

- Replayed the original capture through a validator using core 1. Checked all complete ELF digests against the host oracle, both code hashes, fixture results and all positions. Stored every measured pair and phase in `various/p4-first-boot.json`.
- Reported primary numbers to both researchers and to the examiner. Kept both boot receipts separate and designated the first complete balanced series as primary before viewing the second.

### Why

The standalone IDF benchmark pins its main task to core 0. Editor runs inside the PicoCalc kernel, pinned to core 1 in `main_p4.c`. Both bodies execute in the same task on the same core. A processor-specific assertion is useful only when it checks the actual deployment arrangement.

### What worked

The 360 MHz physical Files probe reproduced the source function hashes, with 16 matched pairs for each of five argument sets. Editor produced the host reference hash in all 20 cases. Primary clean medians were 2.484, 2.451, 2.392, and 2.336 s for control, branch, compact, and direct respectively.

### What didn't work

`files-compare-p4/summarize.py` initially raised `AssertionError` at `assert int(meta["core"]) == 0 and int(meta["hz"]) > 0`. The original runner entered its restore procedure without performing its preview replay. The updated driver preserves that validator except for its expected core, independently reruns the ELF check, and supports offline analysis using `--analyze`. A second boot exercises the replay.

### What I learned

The host’s direct-output allocation improvement does not predict the physical compiler peak. On P4, direct moved the high-water mark from assembly to linking, where the returned ELF and retained chunks coexist.

### What was tricky to build

Providing the independent examiner with timely results required reading a completed UART capture offline while the original runner restored the firmware. Offline analysis never opens the device. A second trial waits for affirmative verification of the first restore.

### What warrants a second pair of eyes

Separate medians versus paired relative differences. The observed order effect and four physical comparisons limit precision for small latency effects. Preserve the shortcut case whose timing is essentially unchanged.

### What should be done in the future

Keep compiler and guest results in separate units in downstream reports. Re-examine retained output only if it reduces the maximum across the full compile-and-link entry.

### Code review instructions

Read `scripts/board.py` functions `analyze` and `observations`, the independent Files summarizer and the kernel affinity in `main_p4.c`. Use the JSON rows for calculations and the unchanged per-case hashes to trace the hardware samples.

### Technical details

Physical base/compact/direct peaks were 1,410,878 / 1,403,150 / 1,414,092 bytes. Each is a median of four measurements. The maximum measured in an instrumented baseline assembly phase is higher than the clean baseline peak; those two are distinct executions.
