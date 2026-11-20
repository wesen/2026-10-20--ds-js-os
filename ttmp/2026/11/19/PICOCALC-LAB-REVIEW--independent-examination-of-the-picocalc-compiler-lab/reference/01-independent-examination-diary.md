---
Title: Independent examination diary
Ticket: PICOCALC-LAB-REVIEW
Status: complete
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T20:54:33.830563152-05:00
WhatFor: ""
WhenToUse: ""
---

# Independent examination diary

## Step 1 · Freeze the examination

The supervisor commissioned a review-only, host-side examination of the physical evidence and the four implementations. I created the ticket and wrote the acceptance criteria before opening the candidate receipts. The user-supplied lab brief is preserved verbatim in [the source brief](../sources/01-lab-brief.md). The assignment from the supervising agent covers boot replicates, code identity, prediction, proof accounting, incremental correctness and independent publication.

The supervising diary archives the original user wording, reproduced here.

“Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
Chose opus high for researchers
Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).
 Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.”

**User follow-up (verbatim):** “eacher resercher should create a design doc ofc (I don't know if i said that in the prompt already)”

I read the thesis index to distinguish the old production baseline from the new comparison. I used docmgr ticket create-ticket and doc add to create the review documents. These steps succeeded. The principal risk at this point is that the timing, memory and output numbers could refer to different jobs. The design fixes the grouping columns and defines joint success before computing any changes. Review the six examination steps before rerunning the scripts in this ticket.

## Step 2 · Read the physical comparisons at their original grain

I wanted to see whether the frontend result survived a separate measurement of the same bytes. The specialist ran four variants in rotated positions in each boot. The supervisor staged the same base and cursor frontend and backend hashes in a different firmware and ran two variants. I checked the sequence of block memberships, uniqueness of each lane/app in a block, complete position balance, and each returned ELF hash and size against the corresponding host oracle. In the marked specialist runs I also required the time sum and peak maximum over phases to reproduce the outer readings. I used an independent grouped calculation in `scripts/04-board.py`.

- **Prompt and revision.** See Step 1. I froze the design in `b04a0f5`. The first `git add` attempt failed with `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. Staging and committing the same three ticket paths through the approved Git sandbox permission succeeded before the audit began.
- **Result.** Specialist Editor paired changes were −289.824 and −297.871 ms across boots. The supervisor recorded −292.445 and −315.438 ms. All four medians carried positive peak allocation changes. The independent negative-control boot produced a +2.164 ms Editor median between byte-identical scripts. The two traces' instrumentation increased Editor control time by 171.467 and 164.427 ms compared with increases of 144.543 and 139.231 ms for the cursor.
- **Diagnostic.** The raw compiler JSON reports an artifact hash from each actual run, but instruction counts are attached by the host oracle for matching artifacts. The specialist stage has a separate restoration record. The supervisor format includes it inside the physical receipt. Requiring the same JSON shape would exclude valid observations.
- **Review.** Open `various/frontend-board.json`, `independent.json`, and `smoke.json` and examine paired vectors alongside their medians. The raw board record, measured world, and simulator guest protocol have different timing boundaries. No board or reset command was issued by this examiner.
- **Independent semantics.** `scripts/01-lexer.mjs` exposes the staged Lexer class only inside disposable Node contexts. I compared all four token coordinates and final diagnostics on 65,536 UTF-16 single-code-unit insertions and 4,096 short combinatorial sources. All 69,632 traces matched, including 67,740 ending in SyntaxError. This supplements the specialist’s lexical tests and the supervisor’s public-API checks. This test uses the Node regex engine and cannot establish total equivalence on all QuickJS strings.

## Step 3 · Examine proofs and final machine words

A held-out application can be honest and still be easy. I read the admission and allocation code before hand-constructing a family of competing, equal-size functions. Thirty-six dynamic-divisor functions have precisely the opcode the selector seeks and zero removable guards. A final function contains 80 profitable literal divisions. Reordering these definitions preserves their calls, sizes and counts. This gives the policy the same budget and changes its opportunity to spend it.

- **Evidence.** `scripts/02-policy.mjs` compiles both orders in unmodified staged contexts. Always saved 720 words in either order. Select charged 31,752 cells in either order and obtained either 720 or zero words. Four independent signed arithmetic checks counted actual trap words and guard deletions. The `x / -1` case retained its overflow trap and lost its zero trap. The `x / 0` case retained both guards.
- **Interpretation.** Scanned cells include a debit of twice the full numeric body length, even when the proof stops or instructions contain multiple cells. The frontend's operation hook, the selector, five typed-array headers/initialization, records, lowerer code and linking lie outside that metric. Explicit backing bytes are 1,280 per admitted function. Distinguish simultaneous scratch from allocation traffic. The 32,768 module cap applies to Select. Always shares the 2,048-cell per-function cap. I sent the counterexample to the supervisor and bounded researcher immediately.
- **Native examination.** `scripts/03-native.py` reads the final standard/small linked ELFs as bytes. It finds the slot in the executable load segment and its last occupied 32-bit instruction before zero padding. The payload is 66,164 bytes with 15,616 bytes spare on the smaller image. Both exports and 1,898 direct transfers have in-range aligned targets in the instruction body or import table. The 120 indirect instructions need runtime or semantic evidence. I checked fused and staged provenance against the prospective Agenda prediction `a131f1a`. Signed total residual is +4 with 10 absolute words across 34 functions. These address checks cannot prove control-flow semantics.
- **Next checks.** Host hash receipts, observed P4 timing, guest measurements and loaded memory belong in adjacent columns. Re-evaluate the real small-slot allocation from the live boot receipt when it lands instead of inferring it from ELF length.

## Step 4 · Make real edits against a clean oracle

The incremental researcher sent a staged session implementing stock Files and shared-world compilers. I chose the complete 70,859-byte Editor with its 28 imports. I reconstructed its native module in a fresh stock VM after *each* edit. The experimental VM reused a single revision history across successful, erroneous and undone edits. I used my own edits, assertions and artifact-span reader rather than importing the lane’s case suite.

- **Decision.** Use a one-literal multiplication change in the preview-ring helper; extend its parameter list and repair three callers; swap two adjacent same-typed fields in WorldState; submit an invalid external WorldEvent ABI; insert a comment before the functions; undo to the original. These test changed source, unchanged signatures, relocation, conservative layout tracking, error recovery and shifted source positions.
- **Evidence.** `scripts/05-rebuild.mjs` saved `various/rebuild.json`. Changing the literal reused 119/120. The repaired signature reused 116/120, with 42 linked bodies changing. The state swap rebuilt 77, but 70 of these emitted byte-identical linked bodies. Both errors preserved the previously published revision. The comment then reused all 120. Undo reproduced the initial full ELF hash. The meaningful invalid signature diagnostic was `SyntaxError: 723:53: expected ,`. The invalid record ABI gave `SyntaxError: Typed world requires the shared WorldEvent record`. These were expected oracle results, not failed tests.
- **Review.** Check the stock and candidate fingerprints, bytes or exact error name/message, fragment counts, and per-function linked spans. A reused body can acquire a new call displacement in linking, so a count of changed machine functions cannot substitute for a cache hit count. I sent the results to the supervisor and incremental researcher, and made no claim about Editor edit latency.

## Step 5 · Check the masked forecast score

The two external respondents saw a common first-boot statistics packet about a previous combined compiler. The supervisor already knew the archived outcome. I read the frozen packet, provenance and grader, then independently recomputed median relative block changes from the second-boot raw rows, including a leave-one-application sensitivity.

- **Evidence.** `scripts/06-forecast.py` gives Opus 1.00259 and Sol 1.12592 percentage points mean absolute error. Both got all six signs. Omitting Editor gives 1.13269 and 1.05519, changing the ordering. The prespecified all-app grade stands. The leave-one-out result describes sensitivity only.
- **Scope.** A model answer hypothesizes that a heap peak outside emission/linking would exclude an emission allocation cause. An earlier allocation can survive phases. To establish that cause, identify the live objects/sites and their lifetimes at the peak. The numerical rank and the correctness of this mechanism are separately reviewable.

## Step 6 · Identify the live restoration control before grading its timing

The normal-world small-slot trial brackets the measurement with the board’s original firmware. I checked whether those original bytes contained the exact same compiler used by the generic matched comparisons. A direct binary search found the Editor input and standard reactor, but neither frozen compiler script in the saved factory partition. The scripts extracted to their closure boundaries matched the earlier commit `08fbae85985b3d463e1d18c4f24c4cd8fcd06072` byte-for-byte. The older RV32 decoder reads LEB operands, whereas the frozen control consumes numeric cells. This is a real treatment difference.

- **Evidence.** `scripts/07-firmware.py` records SHA-256 and offsets of known source byte strings in the saved partitions and trial images. The 8 MiB factory backup itself remains outside the ticket. Both old compiler sources are present and both pinned compiler sources absent from that image. Pinned front and back and the respective candidate arms are present in each generic trial firmware. Compiling the same app source into a standard-size ELF cannot by itself establish compiler identity.
- **Action.** I immediately informed the supervisor, who arranged a matching standard-reservation boot using the same staged lowerer and world configuration. The installed before/after rows separately establish restored health. They must not grade the pinned joint cold target. The machine-code inspection, workload replay and generic balanced comparisons remain applicable.
- **Publication review.** The major comprehension risks in the first draft were a missing definition of ABI and an ambiguous relation between changed linked bodies and rebuilt fragments. I added both explanations, quantified the source-order failure at fixed charge, and gave byte identity and runtime correctness distinct observables. While checking evidence links I found `various/native.json` was being used for two different derived outputs; I regenerated the ELF decoder result as `various/native-elf.json` and corrected its source links. The board receipt keeps the original generic name.

## Step 7 · Checkpoint the audit while the board queue continues

I repeated the independent lexer corpus on the vendored host QuickJS binary. The initial Node subprocess invocation failed with `spawnSync /tmp/p4-frontend.20261119/front-quickjs EPERM` in the sandbox. The same command with approved host-execution permission completed. The production and cursor traces in QuickJS have the same digest as Node across all 69,632 cases. The receipt preserves the runner hash and both trace hashes.

The supervisor requested a checkpoint to release this researcher slot. The small-slot boot already returned three 92,996-byte ELFs, 566.1 KiB world memory reports and a 64 KiB preview. The final standard-reservation comparison, incremental physical timing audit and vault publication remain open. See the ticket tasks and chapter for the completed comparisons. The matching standard-slot firmware already contains the same frontend and staged native compiler, verified by `07-firmware.py`.

## Step 8 · Referee the matched normal boots

The supervisor prepared a reactor with the original 224 KiB slot using the same compiler, wrapper and input as the three 80 KiB boots. I compared the hashes from the independent ELF decoder to each actual serial log and checked the corresponding native world's status in the JSON returned by the board. The separate Select check also had the expected ELF. I independently recomputed image differences for the small-slot and Select previews, against the known 640 × 640 bitmap. Every difference was confined to the clock. The stock-slot staged image needed 710.1 KiB of running world memory. The small slot needed 566.1 KiB. The difference in compiler allocation maxima was 155,604 bytes.

The boot series were sequential, so the median 18,741 µs timing change is a comparison of two firmware series on one device. Check `scripts/08-worlds.py` and `various/worlds.json` for identities and units. During this checkpoint I also audited the Files edit timer boundaries and reported to the supervisor and incremental author that the oracle ELF survives into the candidate heap measurement on clean-first blocks. The original protocol times build, ELF relocation and guest invocation separately, with validation and serial output between. The supervisor queued a dedicated uninterrupted edit-to-entry measurement. I added a two-panel figure to explain the bounded-order stress and fragment-versus-linked effects before final publication.

## Step 9 · Exclude the first edit-guest firmware attempt

The first on-board edit firmware, SHA-256 `72769ef41bf952e4fee37dd5e762404294cc30ec75b78c5e8dd1305d408053af`, compiled the Files seed to the expected 24,424-byte ELF but stopped before executing that seed. In the physical capture the ELF loader printed `Can't find common strcpy`, followed by `REBUILDERROR guest ELF load -88` and `REBUILDFAIL`. The physical receipt had zero accepted boots. I relayed the diagnostic to the supervisor and lane author and excluded the aborted series from timing and behavior claims.

The normal world creates its resolver lazily in `native_elf_p4.c` via `elf_set_symbol_resolver(resolve)`. Reading the production loader’s symbol table showed its entry for `strcpy`. This explains why invoking the loader before the first normal world starts can fail even when the ELF is byte-identical to a healthy host artifact. The remedy belongs in the harness. The scheduled replacement should be identified by its own digest and must supply complete independent guest results. No transfer or board action was taken by the examiner.

## Step 10 · Verify the corrected Files edits

Firmware `cef741f93d6f0322ad8b619ed4d56db62856533fc44464bf463d01b345e9a0b9` used the production symbol resolver before exercising the normal ELF loader. The two restored boot series each supplied 144 case observations. With `scripts/10-edit-board.py` I checked every expected block, variant and fixture identity, revalidated the actual JS inputs and reactor against the firmware, compared diagnostics or ELF identity from each row to the stock oracle, and compared the numbers of rows and guest results against the stored raw logs. All Files edited entry values matched. The separate host-only Editor source and world interface are distinct from the real Files and synthetic-layout measurements on P4.

The four unmarked Files body builds per boot saved medians of 65.592 and 65.929 ms against warm clean. Two clean-first cases on each boot measured roughly 20.4 KB higher peak than the candidate-first cases. The code retains the clean artifact through the candidate in that order. This cannot be subtracted as a precise estimate of retained cache cost. Oracle validation and serialized results lie outside the build stopwatch, and precede the separately measured native entry call. Startup, exact source hit and unchanged fragment relink received their own columns. Review `various/edit-board.json` rather than inferring interactions from individual median absolute times. The full streamed-control and candidate artifacts both generated the initial file hash, and the edited result returned three UTF-16 units for `_Ab`.

## Step 11 · Verify the uninterrupted endpoint and publish the chapter

The supplemental firmware `67773793a4645aaa0063c2dd7532d4222fdaee5b6a9738d67f255a38f17042ae` separates warm clean and incremental compilation into independently initialized realms. A single C timestamp precedes the call supplying the already prepared edited source. It ends immediately after the mapped native function returns, before module teardown, hashing or serial output. The normal resolver and executable-memory configuration are installed before measurement. The incremental branch checks its one rebuilt and six reused functions, and the harness validates the ELF and output after the clock. Realm creation, initial cache seeding, typing a source string, event dispatch and graphical refresh are outside this endpoint.

I checked `scripts/11-endpoint.py` against both restored physical boots. Each boot supplies six complete position-balanced pairs. Every row emitted the independently verified edited ELF and returned 3 with units 95, 65, 98. Warm-clean versus incremental medians were 107.396 vs 44.459 ms, then 106.815 vs 43.435 ms. Median paired savings were 63.346 and 63.538 ms. Across all 12 pairs the saving was 62.157–64.192 ms. The absolute QuickJS peak was larger by 87,826 and 87,818 paired median bytes. Because the timestamps and cases are identical in the two arms this evidence directly addresses edited-source-to-first-call latency. Its target was Files. The actual 120-function Editor correctness experiment remains host-only.

I finalized the independent analysis, generated and visually inspected its two-panel figure, checked relative references and the physical-source hashes, and prepared the self-contained vault edition with a source-reproduction table. Vault commit `d5b3ccc` contains only this article and figure. The vault push returned `cd90683..d5b3ccc  main -> main`. I sent the confirmed hash to the supervisor and incremental researcher. Final review starts with the independent article, then the receipt for each numerical claim. The preregistration, original masked forecasts, rejected seed guest and successful restored firmware remain distinguishable.
