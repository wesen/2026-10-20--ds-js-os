---
Title: Investigation diary
Ticket: PICOCALC-CJI-RANGES
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Experiments, failures, corrections and receipts from moving numeric range proofs in CJI.
LastUpdated: 2026-11-18T11:12:27.735059355-05:00
WhatFor: Reproduce compiler experiments and distinguish physical from host-only evidence.
WhenToUse: Use to review the experiment or resume an interrupted board trial.
---

# Investigation diary

## Step 1 — Try separating receiver inference from the final numeric proof

Agenda reruns inference on a tree that grows as more library calls are resolved. I tested whether intermediate rounds can resolve receivers without repeating a complete range proof. The independent reference unit still matched Agenda. Wider testing found a difference in code generation, which makes this an experimental schedule.

### Prompt Context

**User prompt (verbatim):** “go for big boy improvements if possible, be bold, the world is your oyster and nothing about the compiler is sacred, you can change everything, new passes, IR, complete reorganizatino, etc... Just make sure to write everything up precisely and commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)”

**User prompt (verbatim):** “you can think really hard and do compiler research, and I also downloaded ~/Downloads/'Engineering a Compiler (Keith D. Cooper, Linda Torczon) (z-library.sk, 1lib.sk, z-lib.sk).pdf' for you”

**User prompt (verbatim):** “if you are about to implement a consequential optimization or approach, create a new docmgr ticket and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.


That's so I can understand and learn from your work in the future, even though i'm new to the field.”

**Assistant interpretation and inferred intent:** Give each consequential design an independently readable, retraceable record. I moved the isolated experimental patch and its test recipes into this ticket when the user requested a dedicated workspace. The established benchmark harness stays in PICOCALC-CJI-PERF.

### What I did

- Read the expansion loop, type writer and numeric demotion logic. Built a copied compiler from a patch in scripts/19-defer-range-proof.patch. Stage 0 compiled the modified bundle into native stage 1.
- Ran scripts/21-check-deferred.py across the manifest. Used the sibling ticket's script 13 to count actual range work in the candidate on Agenda.
- Compared original archive fixtures with scripts/23-check-original-fixtures.py. For the first differing fixture I ran each SLIR through the original slas runner and compared stdout to the archive's hashed.out.
- Consulted Cooper and Torczon's third edition, §§9.2, 9.3.6 and 9.4. Recorded the applicability and limits of sparse propagation in the guide; kept the supplied PDF outside the repository.
- Uploaded the guide to /ai/2026/11/18/PICOCALC-CJI-RANGES. Receipt: OK: uploaded CJI Intern Guide - Scheduling Numeric Range Proofs.pdf.

### Why

The measured whole-program proof was nested inside helper expansion and consumed most inclusive host instructions. Changing when that proof runs targets whole redundant analyses and avoids retaining megabytes of serialized memo entries.

### What worked

The source differential matched 22/22 exit statuses, outputs and diagnostics. Agenda full analyses fell from seven to two, fixed-point rounds from 95 to 20 and interval joins from 11,743,517 to 3,036,247. The generated Agenda world unit remained byte-identical. The changed compiler bootstrapped on the host.

### What didn't work

The hypothesis that the two schedules always emit identical instructions failed on collections/hashed.js. Reference and trial compiled successfully but produced 320,000 and 327,897 bytes of SLIR text. The diff contains a distinct Map$set specialization and a changed floating equality branch. Both outputs ran and matched all ten expected lines.

### What I learned

Helper specialization can depend on numeric annotations already present on the expanded tree. A successful catalog sweep is a useful deployment observation, while the archive fixture exercises language combinations absent from that catalog.

### What was tricky to build

The ordinary writer consumes owned input statements. The prototype must write a full annotated tree for the next expansion, leave the sidecar call sequence intact, and run a complete proof after expansion. Source-level and compiled experiments use different clocks and tools.

### What warrants a second pair of eyes

Find the first differing specialization input on hashed.js, and inspect whether numeric annotations copied between trees remain valid. Check signed zero and NaN outcomes, compiled bytes, and the record/use sidecar mode independently.

### What should be done in the future

Complete the wider fixture comparison, paired native measurements and the headless P4 candidate run. Establish a rule for the changed output before enabling the schedule by default.

### Code review instructions

Read design-doc/01-scheduling-numeric-range-proofs-in-the-cji-compiler.md, then examine scripts/19-defer-range-proof.patch. Reproduce catalog checks and work counts using the specific commands in the guide. Compare the control and candidate digests with various/catalog.jsonl.

### Technical details

The two accepted translations of hashed.js have SHA-256 values fa672dd2459953595b549a2bc70eb198c19e7e58e5ff746b6689b0175fadcc72 and 37255ee6a2c9f07d05266e885eb9471df10d66604b2d7356ea9b2efbb2686755. This checkpoint qualifies the source experiments. Performance claims need separate receipts.

## Step 2 — Restore negative-zero semantics and qualify the guarded compiler on Linux

The first archived mismatch provided a source-level lead: the removed floating equality branch occurs in a map insertion helper. Reading the helper generator exposed a choice between integer and general-number normalization. A reduced program made the semantic difference visible. I guarded the pass at that dependency, rebuilt it, and measured two applications.

### Prompt Context

See Step 1 for the pass-change request. **User prompt (verbatim):** “our main goal is being able to cmpie things in a reasonable amount of time on the device, btw.”

**User prompt (verbatim):** “i'm gonna have to disconnec tthe device, maybe you can do your work on the host for now.”

**Assistant interpretation and inferred intent:** Evaluate improvements to cold compile latency. Preserve completed host measurements and pause physical trials while the device is away. **Previous code checkpoint:** c445954 (prototype) and 4125701 (firmware comparison harness).

### What I did

- Added the reduced program in scripts/fixtures. Ran it with Node and with the original native SLIR runner after compiling it using the control, unguarded and guarded frontends.
- Added scripts/26-prove-numeric-keys.patch and rebuilt using scripts/20-build-deferred.sh with the guard argument. The guard observes provisional integer keys when selecting add/set methods and Map/Set construction.
- Checked 335 original archive fixtures and 22 manifest worlds. Ran strict sidecar record/replay for Files and compiled the original compiler source bundle using the candidate.
- Timed Agenda and Files in alternating native trials and recorded the raw samples. Archived the interrupted physical control trace and canceled the serial waiter. No candidate was flashed.
- Linked the corrected compiler for RV32 emulation using the original instrumented guest runtime. Each guest recipe first relinks the ordinary ELF and compares it with the pinned control.

### Why

The full archived hash-map test happened to print the same results despite a real signed-zero behavior change. Inspecting the reciprocal of the first iterated key directly distinguishes a negative zero from a normalized positive zero.

### What worked

The reduced fixture printed positive infinity in all four observations with the guard. Its emitted SLIR matched the ordinary compiler byte for byte. All 335 archive and 22 catalog results matched. The baseline and guarded self-host SLIR hashes were identical. Files accepted all three entries from the ordinary sidecar during strict replay.

The guarded native Agenda medians were 29.709 and 11.217 seconds. Files medians were 2.277 and 1.509 seconds. Both improvements cost additional live heap, respectively 1,236,800 and 338,984 bytes. Detailed per-run receipts are under various/.

### What didn't work

The unguarded compiler returned negative infinity twice in the constructor portion of the focused fixture. A draft shell invocation for this fixture failed with an unmatched quote and did not create the file. The rerun created it explicitly and checked real output. The physical control was interrupted after its 1,011.013-second frontend heartbeat. Its terminal JSONL was empty; the operator requested host-only work. An initial tmux permission review timed out. The narrower Linux timing launch succeeded.

### What I learned

Numeric proof placement can affect which helper source exists before final inference even when common application modules match. A language-semantic regression test must inspect the operation that exposes the representation choice.

### What was tricky to build

The existing type walk visits calls after structural solving. The guard must decide before an owned tree is consumed and must let an already-started full proof finish its demotion iterations. Sidecar sessions preserve their ordinary call order. The headless firmware image is built and identified, but an image alone supplies no device timing.

### What warrants a second pair of eyes

Audit future helper generators for numeric type distinctions that would require an additional proof guard. An 8 MiB host arena held the two measured workloads, but physical outer job scratch and other programs' maximum live sets remain separate questions.

### What should be done in the future

Use the qualified headless ordinary and guarded firmware with the same source, heap and final ELF check when the PicoCalc is available. Report absolute device minutes saved; the stored incomplete control is excluded.

### Code review instructions

Apply script 19 followed by script 26 via the guard build recipe. Compare various/defer-original-fixtures.json with various/guard-original-fixtures.json, then inspect the reduced numeric-collection-keys.js and the two native timing receipts. The late pass must still prove the fully expanded program.

### Technical details

The reduced fixture's control and guarded SLIR SHA-256 is 0f02736eb94596125e4cff0257022fa890b189d33f3b5a717585b933066e2bd8. The unguarded SLIR hash is 0fa6f817a33258f2df460768d2c6d3f4e60df9d5c984bfb7e28164caf21df3b4. The ordinary and guarded compiler-as-input checks matched at d4a68eaabc4971cf92263795e58d261b19ef9150313a0959a81c1ecbf50db452.

### Step 2 follow-up — Validate the linked device catalog on the host

Checkpoint 56102e3 contains the guarded prototype and paired host results. I then ran the compiled frontend against all manifest sources and linked the successful units against the actual device prelude with the RV32 module assembler. All 20 supported ELF hashes matched the independent device catalog, including Agent in the 10 MiB configuration. The first ledger reader failed with KeyError 'host_elf_sha256' because unsupported worlds do not have that field. Script 31 now treats their absence as expected, and preserves diagnostics and exit codes.

The compiled Calc diagnostic differed from Node's reference: the 10 MiB frontend ran out of space first. Script 32 compared the ordinary and guarded compiled frontends under the same cap. Both exhausted it. Both rejected Sandbox at 15:13. This confirms parity of the supported set without conflating the Node and compiled diagnostics. Script 34 sampled the guarded native executable after proving its machine-code text identical to the timed executable. Agenda produced 7,207 samples. The raw sample addresses and symbol rankings are committed alongside the catalog.

The linked-catalog rows retain comparison with the Node reference, including the Calc diagnostic difference. Script 35 reconciles unsupported rows with a memory-matched compiled control and fails on missing, duplicated or mismatched worlds. Its result lists 20 complete module matches, Calc exit 4 at 10,485,760 bytes, and Sandbox exit 2 with the parser location. The working ESP-IDF build directory was subsequently reset to the ordinary headless configuration using build-only commands; experiment snapshots have their own immutable identities.

### Step 2 follow-up — Separate RV32 guest work from x86 time

Script 30 compiled Files under the corrected RV32 guest and returned the expected 353,200-byte unit. I edited the launcher to let the separate Agenda worker await its existing control while Files was still running. After Files finished, the older shell read the changed remainder of the file and reported a syntax error near an unexpected semicolon before writing the final identity receipt. The revised source passes bash -n. I explicitly compared the Files control ELF and metrics against the pinned ordinary guest, compared ordinary and guarded IR against the original reference, confirmed the guarded guest image matched the already-verified Flaky guest, and regenerated the receipt. Script 37 checked the identities, frontend and GC counters and arena bounds. Keep a running shell script immutable on future runs.

Files frontend guest instructions fell by 18.60% (55,750,760,529 to 45,379,556,556). Flaky changed by 0.00155%. The resulting JSON evidence is in various/files-guest.json and various/flaky-guest.json. These results measure the target instruction stream on the host. Device elapsed time is still open.

### Step 2 follow-up — Measure the marginal interval shortcut

The guarded trace still counted 2,331,158 identical-ID joins out of 3,036,247. Script 41 measured the pre-existing shortcut with the guard-only compiler as its control. Agenda's frontend median changed by +0.63% and Files' by −5.93%. Both sample ranges overlapped and all generated units matched. These are within-pair changes from three measured samples per variant. The prioritized device candidate remains guard-only. The shortcut and guarded scheduling remove overlapping work. This combination received its own measured control.

Script 38 ran the original archive harness with the guarded native stage 1 in a temporary directory. The final line was “all 278 passed”. This is a separate execution and pass-level check from the CLI differential. Full output is retained in various/guard-original-suite.log. At this point the completed host checks include the original default suite, broader archive differential, twenty RV32 ELF identities and matched native Agenda/Files samples.
