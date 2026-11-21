---
Title: 'Evidence researcher diary: what justifies the next Typed JS optimization on the ESP32-P4'
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: reference
Intent: long-term
Owners:
    - Opus High evidence researcher
RelatedFiles:
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/scripts/commission/evidence-corrections.md
      Note: Peer review and correction task
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/scripts/commission/evidence-scientist.md
      Note: Original Opus High commission
    - Path: repo://ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/various/opus-evidence-authorship.json
      Note: Resolved model credentials-free receipt for both rounds
ExternalSources: []
Summary: Chronological evidence investigation and editorial verification by the Opus High researcher.
LastUpdated: 2026-11-21T14:58:40-05:00
WhatFor: Evaluate a Typed native compiler optimization using scoped observations and controlled treatment comparisons.
WhenToUse: When interpreting the existing raytrace research, teaching a newcomer, or designing a follow-up experiment.
---

# Evidence researcher diary: what justifies the next Typed JS optimization on the ESP32-P4

Role receipt: independent evidence researcher, requested as the Opus High lane (alias Opus, effort high). The host wrapper records the resolved model ID. My work was limited to the files in my isolated packet. I read them with the Read tool and wrote `article.md` and this diary with Write. A later correction pass (Step 6) used Read and Edit. I ran no compiler, emulator, Go test or script, and I did not touch the board. Every number below is one of three kinds: read from a packet file, reconstructed by me with arithmetic, or received from the host operator through the coordinator's diary.

## Step 1: Orient on the commission and the writing contract

I began with the commission and the source map, so that every later claim would have a stable original path. The source map names the repository, the frozen revision `bbb9d9eaf465ca35f8125d85ba06f7137012f648` and the repo-relative path of every packet file. I then read the three style references before reading any evidence, so that my reading notes would already fit the format.

### Prompt Context

**User prompt (verbatim):** The commission's research question is "what evidence justifies a practical optimization to Typed JS on the ESP32-P4?" The full brief is `ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/scripts/commission/evidence-scientist.md`, and the verbatim project request is in `ttmp/2026/11/21/PICOCALC-TRACE-REPL--a-persistent-compiler-evidence-repl-in-go-and-javascript/reference/01-supervisor-investigation-diary.md`.
**Assistant interpretation:** Produce a textbook-style article and a research diary that weigh the static, guest-count and physical evidence, without changing code.
**Inferred user intent:** The sponsor wants an independently derived, citable basis for choosing the next compiler milestone, which a new compiler student can also learn from.
**Commit (code):** N/A. No code changes.

### What I did
- Read `brief.md`, `source-map.md`, `diary-format.md`, `textbook.md` and `vault-style.md`.

### Why
- The source map defines which paths may be cited. Reading the style guides first set the required constraints: a single H1, no frontmatter, no analogies, no semicolons in prose, and source links at paragraph ends.

### What worked
- The source map gave one original path for each packet file, including the exact stream `checked-middle.log.gz` used for byte citations.

### What didn't work
- The source map labels one entry "036-byte citations". I could not match "036" to any length or offset in the packet, so I cite only the path that entry names.
- No directory-listing tool was available. I opened files by the names the source map gives.

### What I learned
- The vault style asks for frontmatter, but the brief asks for body-only Markdown. I followed the brief, because the sponsor adds metadata.

### What was tricky to build
- N/A for this step.

### What warrants a second pair of eyes
- Whether the "036-byte" label refers to a fact that should appear in the article.

### What should be done in the future
- N/A.

### Code review instructions
- Compare the citation URLs in `article.md` with `source-map.md`. Each should be the frozen revision plus a mapped path.

### Technical details
- Link base: `https://github.com/wesen/2026-10-20--ds-js-os/blob/bbb9d9eaf465ca35f8125d85ba06f7137012f648/`.

## Step 2: Read the witnesses and reconstruct addresses and default-scene pairs

Next I read `w-full-fixture.json` and the coordinator's archive diary (`host-verification.md`). The fixture holds the byte addresses for ordinals 73 and 74 and the eighteen opening physical rows. The diary holds the coordinator's Go test results and the conventions for reading the device rows. I checked the fixture arithmetic by hand, before trusting any summary.

### Prompt Context
**User prompt:** See Step 1.
**Assistant interpretation:** Use the fixture as an independent witness and the coordinator's diary as host-operator evidence. Keep the two apart.
**Inferred user intent:** Every published number should trace back to raw bytes or rows.
**Commit (code):** N/A.

### What I did
- Checked the byte lengths: 240,363 − 231,496 = 8,867 and 248,127 − 240,363 = 7,764. Confirmed that ordinal 73 ends where ordinal 74 begins.
- Took `timesUs[2][0]` for the clean phase, following the coordinator's statement that the installed Typed program is always arm index 2.
- Computed the default clean-phase medians: stock 57,692, matched scalar 56,339.5 and PIE 56,069 µs.
- Computed the paired differences per block: stock−PIE 1579, 1653, 1653, 1611, 1621, 1588 (median 1,616), and scalar−PIE 217, 221, 307, 260, 299, 224 (median 242).
- Computed the paired percentages: medians of 2.8014% and 0.42952%, which agree with the coordinator's 2.8014239567% and 0.4295228146%.
- Rebuilt the row-index formula `36·block + 12·pos + ((0 − block) mod 12)` and the rotation formula. Both match all 18 fixture rows.

### Why
- The commission asks me to compare the marginal median difference with the median of paired differences, and the default scene shows both cases.

### What worked
- Every reconstruction matched the coordinator's reported values. The marginal medians gave 1,623 µs and 270.5 µs, against the paired 1,616 µs and 242 µs.

### What didn't work
- No failures observed.

### What I learned
- Because 12 is a multiple of 3, the inner rotation equals `(load position + scene offset) mod 3`. Rotation is therefore confounded with load position within each scene, and for the default scene the two are equal.
- Paired medians are not additive: 1,356.5 + 242 ≠ 1,616.

### What was tricky to build
- The C arms at indexes 0 and 1 vary across rows independently of the Typed treatment. I kept them out of the treatment comparisons and used only the coordinator's mapping for index 2.

### What warrants a second pair of eyes
- My packet holds raw rows only for the default scene. The other eleven scenes rely on the physical report's summary and the coordinator's 144-group replay.

### What should be done in the future
- Recompute the per-scene paired medians from the full `rows.json` and confirm that the 2.66% to 2.89% range holds.

### Code review instructions
- Run the Python check in section 7 of the article, then `python3 "$p/scripts/09-paired-results.py" "$p/various/device"`.

### Technical details
- Phases: 0 clean, 1 audit, 2 primary, 3 shade. Programs: 0 stock, 8 matched scalar, 5 PIE.

## Step 3: Recover the measurement definitions from the scripts and playbooks

I read both persona playbooks and then the original capture and analysis scripts. The playbooks gave me the rules to apply: reproduce the symptom at its source, separate the layers, distinguish missing observations from negative ones, and attach a reproducible witness. The scripts told me exactly what each counter measures, and section 3 of the article depends on that.

### Prompt Context
**User prompt:** See Step 1.
**Assistant interpretation:** Turn each count into a precise definition before comparing counts.
**Inferred user intent:** Avoid comparing quantities that differ in definition.
**Commit (code):** N/A.

### What I did
- Read `01-row.c` and counted its eleven `element()` call sites by hand.
- Read `02-passes.py` (the GCC, LLVM and ablation commands), `03-fixtures.mjs` (gold rows from Wasm), `05-execute.py` (the QEMU PC counter and the mnemonic-based stack predicate), and `07-typed-counts.mjs` (the interpreter step counter, the encoding-based stack predicate and `packed.stores`).
- Read `09-archive-llvm.py` (the stream and index capture) and `10-read-pass.py` (dump selection by index).
- Read `06-board.py` (permutations, rotation and CRC checks) and `09-paired-results.py` (pairing).

### Why
- The two stack predicates differ. The C counter matches `lw/lh/lhu/sw/sh` with `(sp)` in the disassembly text. The Typed counter matches `rs1 == 2` with opcode 3 or 35 in a 32-bit word. Neither can identify a spill.

### What worked
- The scripts supported each definition used in the article, including the fact that the `-debug-pass-manager` output shares stderr with the IR dumps.

### What didn't work
- No failures observed.

### What I learned
- `10-read-pass.py --entry N` writes from `entries[N]` up to `entries[N+1]`, which reproduces the half-open ranges in the fixture.

### What was tricky to build
- Static load sites and dynamic loads differ in weight per site. I kept them in separate sections of the article.

### What warrants a second pair of eyes
- Whether the Typed RV32 backend emits compressed or vendor encodings that use `sp` as a base. The encoding predicate would miss them.

### What should be done in the future
- Add per-PC histograms to `07-typed-counts.mjs`.

### Code review instructions
- Read `05-execute.py` lines 38–42 and `07-typed-counts.mjs` lines 20–26 side by side.

### Technical details
- Counting covers only the linked `row` PC range, and the C harness `_start` is excluded.

## Step 4: Reconstruct the C, Typed, size and compile arithmetic

I read `execution.json`, `typed-counts.json`, `pass-metrics.json`, `images.json`, `build.json`, `loads.json` and the two analysis reports. Then I derived every difference and ratio in the article from the totals. I found one regularity that the reports do not state: the PIE saving decomposes into 165 identical units.

### Prompt Context
**User prompt:** See Step 1.
**Assistant interpretation:** Compare the checked C totals, the LSR pairs, program bytes and the three Typed outputs.
**Inferred user intent:** Find where the remaining cost lies.
**Commit (code):** N/A.

### What I did
- C: computed GCC vs LLVM checked (Δ 97,469), the check cost (GCC 367,904 or 47.9%, LLVM 601,487 or 95.2%), and LSR savings of 41,949 (3.29%) checked and 166,226 (20.82%) unchecked.
- Typed: computed stock→scalar 408,787 (11.33%), scalar→PIE 68,475 (2.14%), and the shares of 85.65% and 14.35%.
- Found that 3,135 = 165 × 19, 68,475 = 165 × 415, and the store delta is 165. Checked this against rows 61 (38, −830, +2) and 109 (19, −415, +1).
- Compile medians from `loads.json`: stock 454,132.5 µs, scalar 658,508.5 µs, PIE 658,027 µs. These agree with the report's 454.133 and 658.027 ms.
- Primary-phase opening medians: 17,790.5, 16,429 and 16,184.5 µs, which agree with the report's rounded values.
- The ratio of `cycles` to `timesUs` is about 360 per µs for block 0 stock clean.

### Why
- A cross-layer check is needed. The physical per-block shares (S−M)/(S−P) of 81.4% to 86.6% agree with the 85.65% instruction share.

### What worked
- All of the report's numbers that I could reconstruct matched.

### What didn't work
- No failures observed.

### What I learned
- The `elfBytes` value of 66,816 is the same for all three treatments, even though the image sizes differ. I did not explain this, and the article uses image bytes.

### What was tricky to build
- Keeping interpreter steps, QEMU guest instructions and P4 microseconds in separate units, and not converting any of them into another.

### What warrants a second pair of eyes
- The 19-group interpretation and the guess that one group is lost to alignment both rest on three sample rows and the totals.

### What should be done in the future
- Per-PC counts and an EarlyCSE-disabled ablation for the C model.

### Code review instructions
- Recompute the totals from `typed-counts.json` and `execution.json` using the tables in the article.

### Technical details
- Checked GCC uses 7 sp loads and 7 sp stores per call, which is consistent with prologue saves but does not prove it.

## Step 5: Synthesize and write

I wrote the article around the four layers and placed product status in a separate subsection. I chose one proposal, a checked scalar loop with register-resident index, row term, base and capacity. The proposal comes with explicit rejection criteria and no predicted magnitude, because no recorded data support a magnitude.

### Prompt Context
**User prompt:** See Step 1.
**Assistant interpretation:** Write a publishable article and this diary.
**Inferred user intent:** A durable vault article that the sponsor can validate and publish.
**Commit (code):** N/A.

### What I did
- Wrote `article.md` (seven sections, one mermaid diagram, tables in µs, instructions and bytes, pseudocode, and a reproduction guide) and `diary.md`.

### Why
- The playbooks' rules about layers and witnesses shaped the structure: each claim names its layer and its witness.

### What worked
- Every number in the article traces to a packet file or to arithmetic recorded above.

### What didn't work
- One of my response turns was interrupted by the host before it finished. I resumed from the reads that had already completed, made no further tool calls before writing, and did not depend on any output from the interrupted turn.

### What I learned
- The strongest supported target is the scalar code around the packed producer, not the packed producer itself.

### What was tricky to build
- Writing the limits on causal attribution for the 73→74 change without inventing the IR text. At this stage I had not consulted the separate dump files `llvm-dump-73.txt` and `llvm-dump-74.txt` in my packet, so I wrongly treated the IR bodies as unavailable. Step 6 corrects this.

### What warrants a second pair of eyes
- The citation of the 3.121 ms register-locals result, which I took from the C report without seeing its raw data.

### What should be done in the future
- Run the collection plan in section 6 of the article.

### Code review instructions
- Start with sections 2 and 5 of the article, then run the commands in section 7.

### Technical details
- Limits as recorded at this stage: no IR bodies consulted (the separate dump files had not yet been read), no per-PC data, no full device records beyond the opening blocks, and no timer or renderer source in the packet.

## Step 6: Correction pass against the raw dumps and supervisor validation

The editor's review found errors and unscoped claims in the article. I read both raw LLVM dumps and `params.txt`, and I took the supervisor's independently verified arithmetic as given. I then corrected `article.md` with Edit. I ran no code in this step.

### Prompt Context
**User prompt (verbatim):** N/A. Editor's correction brief with seven points (dump byte lengths and IR bodies, pairing semantics, hypothesis logic, reproduction provenance, scope wording, physical conclusion, overall scoping).
**Assistant interpretation:** Correct the manuscripts against the dumps and the supplied supervisor figures, and preserve the other findings and paths.
**Inferred user intent:** An article whose every number has a stated scope and a correct witness.
**Commit (code):** N/A.

### What I did
- Read `llvm-dump-73.txt` and `llvm-dump-74.txt` in full. Counted `load i32, ptr %work` lines (11 and 6) and `call void @llvm.trap()` lines (11 and 11) directly.
- Listed the direct loads by block. At 73: `%0` for.cond.cleanup, `%2` for.body, `%3` element.exit37, `%4` for.body8, `%6` element.exit47, `%8` element.exit52, `%10` for.body29, `%12` if.then, `%14` element.exit67, `%16` if.then45, `%18` element.exit77. At 74: `%0` for.cond.cleanup, `%2` for.body, `%3` element.exit37, `%4` for.body8, `%8` for.body29, `%13` element.exit77.
- Read the dump tails. Ordinal 73 ends with `Running pass: EarlyCSEPass on row (142 instructions)` and the MemorySSAAnalysis, AAManager and BasicAA announcements. Ordinal 74 ends by scheduling `SpeculativeExecutionPass on row (126 instructions)`.
- Recorded the supervisor's definition lengths (8,635 and 7,627 bytes, difference 1,008) next to the range lengths (8,867 and 7,764, difference 1,103).
- Recorded the supervisor's twelve-scene range of 0.4095% to 0.4663% for PIE over matched scalar (clean phase, per-scene medians) and the reproduction commit `313021c59bb98fc42c0cecd9f2fc1f3781f1d35a` from `params.txt`.
- Edited the article: the abstract, the diagram, section 1 (29.975 ms context), section 2 (table, site list, tail evidence, trap folding, predicate), section 4 (packed stores, scope), section 5 (trial records, pairing, counterbalancing, twelve-scene result, falsifier), section 6 (explicit clause logic, limits), section 7 (two-stage provenance, script 13, oracle versus JS API), and the conclusion.

### Why
- The article said that no IR bodies had been supplied, gave 1,103 bytes as the function shrinkage, and left EarlyCSE attribution unchecked. All three were wrong or unverified, and the dumps answer them.
- The pairing paragraph claimed a shared load-order position, which the permutation design rules out.
- The hypothesis mixed a per-scene requirement with a pooled median.
- `go test ./pkg/tracehardware` was listed at a revision where that package does not exist.

### What worked
- The dumps account for the 142 → 126 instruction difference exactly: 5 capacity loads, 1 `icmp`, 9 repeated `%data.i*` GEPs and the duplicate address `%add.ptr.i76`.
- The pass-manager tail of ordinal 73 announces only EarlyCSEPass and three analyses before the ordinal-74 header. This confirms the attribution that I had left open.

### What didn't work
- My earlier statement that "EarlyCSE removed no check" was wrong. The trap call count stays at 11, but the check in `if.then45` is folded to `br i1 true`, so only 10 comparisons stay live.

### What I learned
- SSA value names are assigned per state: `%8` is a sphere-field load at 73 and the inner-loop load at 74. Sites must be compared by block label.
- The surviving reloads (`%3`, `%13`) each follow an `i16` store through a pointer derived from `%work`.
- The "036-byte" label noted in Step 1 was a staging typo in the source map. The editor corrected it after packet handoff, and it has no counterpart in the article.

### What was tricky to build
- Keeping provenance in two stages: my frozen-packet analysis at `bbb9d9e…`, and the supervisor's after-the-fact validation with script 13 at `313021c…`.

### What warrants a second pair of eyes
- The inference that the later 10-trap snapshots come from deleting the folded trap block. The packet has no dump of those snapshots.

### What should be done in the future
- Add invalid-index fixtures, so that trap behavior is measured and not only stated by contract.
- Qualify the trace REPL's JavaScript public API against the standalone oracle as separate work.

### Code review instructions
- Compare section 2 of the article with `llvm-dump-73.txt` lines 13–198 and `llvm-dump-74.txt` lines 13–183, and the tails at lines 216–219 and 200.
- Run script 13 at `313021c…` from the repository root as given in section 7.

### Technical details
- Physical falsifier: "PIE alone saves at least 1% clean-frame time in every pose" fails on all 12 scenes (maximum per-scene median 0.4663%).
