---
Title: Director investigation diary
Ticket: PICOCALC-RELEASE-LAB
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
LastUpdated: 2026-11-20T17:55:31.797227524-05:00
WhatFor: ""
WhenToUse: ""
---

# Director investigation diary

## Step 1: Publish the qualified ordinary application and assign three measured studies

The last device qualification produced a specific binary and partition readback. I verified the saved files, fast-forwarded the configured upstream and published these exact assets before commissioning the research. A separate operator is qualifying the named release profile from a clean tree.

### Prompt Context

**User prompt (verbatim):** “Ok, opus is back, so ship the firmware, then launch both, and also use the chess engine itself as a computational benchmark (potentially searching deeper if that gives better insight?)
.
  Everybody (you included): Keep a detailed diary as you work, with the format according to the diary skill
  Chose opus high for researchers
  Each researchers  when done, and you once you have all the results: write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no
  analogies, see skill).
   Commit and push the bsidian vault when done (go-go-parc vault).   Make it pedagogical to explain your research in detail and with all the context necessary for newcomers.”

**Additional request (verbatim):** “update progress in RENDER-NEXT< and of the unchecked tasks, make a list and group them by topic and approach.”

**Assistant interpretation:** Ship the working image, measure literal lowering and incremental recompilation, and compare execution on real search positions. **Inferred user intent:** Maintain a reproducible release and separate scientific results for cold compilation, edits, and generated-code speed.

### What I did

Created this ticket. Ran git push origin a079a3e:refs/heads/main. Published tag picocalc-p4-smooth-chess-20261120 and application, partition, and SHA256SUMS with gh release create. Assigned separate Opus-led departments, a single-board schedule, and an evidence review of the rendering roadmap.

### Why

The observed image includes test hooks. The ordinary release was already read back and booted with eight native worlds. Publishing that tested binary makes its identity independent of a fresh IDF build's metadata.

### What worked

Remote main advanced 5996d3e..a079a3e. The ordinary application hashes to 134f3a249589a860a1a85311e361498a9e6ba4f14bef34ca2397ea26ca86ebc1 and its partition table to 72721dc3ce2597504dc568023e778100401a308455fea40d174d282386571d30.

### What didn't work

The initial sandboxed gh release list returned “error connecting to api.github.com”. The authorized network publication succeeded.

### What I learned

Source revision, ordinary application checksum, and observer receipts answer different release questions. A key injected into the keyboard world does not prove a working keypad peripheral.

### What was tricky to build

One board must serve three independent measurements. Preserving a fixed release image and serialization across the experiments avoids a silent change to the comparison baseline.

### What warrants a second pair of eyes

The checksum attached to GitHub should match the saved release and the receipts. Each compiler comparison must account for the actual target program and all persistent data.

### What should be done in the future

Run and independently inspect the experimental outcomes and publish each researcher's article plus the supervisor synthesis. Reconcile roadmap tasks with the actual breadth of qualification.

### Code review instructions

Start with the release link in the ticket and scripts/director/release-notes.txt, then inspect the previous PICOCALC-CHESS-3D smooth-device receipt.

### Technical details

The tag identifies the shipped source revision. The firmware assets are for already-provisioned ESP32-P4 boards with this partition layout and bootloader. Application address 0x10000; partition table address 0x8000.

## Step 2: Verify the download, count renderer gates and isolate literal expansion

I checked the published files from a fresh download and independently compiled programs whose literal length and repetition count I controlled. The renderer supervisor reconciled the parent roadmap against the narrower child experiments. I used the original task IDs so the reader can distinguish completion of an experiment from deployment across all widgets.

### Prompt Context

**User prompt (verbatim):** “approve sending to anthropic, it's a toy compiler”

**Assistant interpretation:** Authorize the researchers to use project-specific compiler material for the requested Opus studies. **Inferred user intent:** Let Opus reason about the actual implementation and measurements. **Commits:** 24fc00e (release receipt and literal controls), 79574db (render roadmap).

### What I did

Downloaded the application, partition table and checksum manifest from the tagged GitHub release into a fresh temporary directory. Verified both checksums and compared the downloads to the release artifacts. Ran the release frontend and backend on six literal lengths and three function counts with a sentinel just after the destination. Relayed the approval to all three research operators. Reviewed the six open IDs in the reconciled rendering ticket.

### Why

Literal expansion can consume code space before any renderer executes. Generating tiny controlled functions permits attribution that would be difficult in an entire Chess renderer. A recorded device observation and a synthetic host result answer separate questions.

### What worked

All 18 Wasm programs produced the expected UTF-16 values and preserved their sentinels. Four functions each copying 1,022 ASCII units occupied 49,600 native bytes. Both fetched assets matched the saved files byte for byte. The renderer checklist now records eight completed gates and six open gates.

### What didn't work

The initial commit check caught trailing whitespace from the quoted user prompt. Removing line-end whitespace preserved the text and allowed the commit. The first project-specific Claude request was held for external disclosure review. The user subsequently granted the approval quoted above.

### What I learned

The earlier device capture contained keypad NACKs. A new read-only observation of the ordinary firmware recorded 42 additional I2C0 transfers, 169 additional bytes and zero errors. This qualifies peripheral polling during that interval. Testing key-to-app behavior still requires a physical press.

### What was tricky to build

The renderer roadmap pairs multiple scope labels on some lines. Counting the boxes yields fourteen tasks. Counting scope labels individually would give a misleading percentage.

### What warrants a second pair of eyes

The literal control executes emitted Wasm. Its native byte length is a static observation. Native destination bounds and actual native execution are separate candidate acceptance tests.

### What should be done in the future

Compare the candidate against these controls and verify whole-image storage, cold build cost and behavior on the physical target. Compare actual edit latency and search execution under their own input controls.

### Code review instructions

Run the ticket's scripts/director/01-literal-growth.mjs with Node from the repository root, supplying a temporary output filename. Compare it to various/literal-growth.json. Inspect the grouped roadmap in PICOCALC-RENDER-NEXT/index.md and the clean polling interval in various/release-read-only-preflight.json.

### Technical details

The standalone controls pass the destination at address zero, set its 32-bit capacity, fill its 16-bit elements including a trailing sentinel, call each exported writer, then verify returned unit count, destination contents and sentinel. Only the ASCII character x is varied in length. Character encoding or a long displacement can change native instruction selection outside this range.

## Step 3: Attribute shipped machine code and challenge function-fragment reuse

I reconstructed the source of the game that generated the release qualification receipt and compiled it in both streaming and buffered modes. I also constructed a three-function program in which the address of an unchanged callee moves and an invalid edit introduces a cycle through a cached edge. These tests exercise the contracts between the independent studies.

### Prompt Context

**User prompt:** See Step 1. **Assistant interpretation:** Explain which improvements can affect compilation, application size and executing search. **Inferred user intent:** Quantify useful device outcomes and ensure that an apparent speedup preserves program behavior. **Commit (code):** 3092d67, shipped game census and compiler chart.

### What I did

Matched the game source checksum to the previously qualified ordinary firmware. Attributed the bytes between function entries to their source units, then compiled the standalone search and full game with the literal prototype. Exercised call relocation, cycle diagnostics, cache rollback and declaration reordering with the incremental prototype. Kept scripts and machine-readable receipts in the ticket.

### Why

Seeing a smaller app does not establish that a search instruction changed. A reused machine instruction that calls a function can still require patching. Both assertions are testable independently of noisy device timings.

### What worked

The game image contained 256,400 bytes, of which 197,544 belonged to the generated painter-source writer. The 26,580-byte engine matched the board runner binary. The incremental compiler relocated an unchanged target from byte 84 to byte 144 and diagnosed a cycle crossing a reused function. All five program states matched the clean compiler.

### What didn't work

The sandboxed native-code census failed with “spawnSync python3 EPERM” when calling the project's embedder. Repeating the same command with approved execution completed. A shell wildcard in the cross-study command expanded to two copies of engine.bin. The second temporary pilot copy briefly received JSON. I restored the exact bytes from the verified live-gate copy and compared SHA-256 against the pilot manifest. I notified the Chess researcher and changed the CLI to require exactly three arguments and a JSON output suffix. The live-gate input and board binary were untouched.

### What I learned

The release game and its separately compiled compositor painter have different source and image identities. The search engine is an independently addressable third program. The size of one should never be divided by runtime observations from another to infer a compiler speedup.

### What was tricky to build

A comparison of byte spans needs the exact source built by CMake. The mobile build renames the legacy view entry, embeds a generated source writer and appends a mobile view with explicit newline separators. The census checks the reconstructed source digest before using any results.

### What warrants a second pair of eyes

The literal study continues to develop its copy loop. Re-run the cross-study comparison against its final arm and identify it by artifact and options. A successful host differential for fragments supplies correctness evidence. Physical edit latency and persistence require their own observations.

### What should be done in the future

Reconcile final receipts across all three studies and publish only after all four articles pass link and asset checks.

### Code review instructions

Read scripts/director/03-shipped-code-census.mjs through 05-cross-study-images.mjs. Pass an explicit engine binary path and a separate JSON result name to the cross-study script.

### Technical details

The engine image SHA-256 is d576c3fd4a8ba1846e01345a6b8597f9ee058895a4a1bc2f59bb6ea2473d5fa4. A fresh copy was used by the timed board runner. The three-function fixture stores symbolic address and dependency information on clean success. Its negative edit must leave the prior generation usable.

## Step 4: Reconcile search work with physical time

I checked the Chess researcher's physical outcomes and added a host experiment to measure which generated functions execute most often. I then tested whether a one-position calibration could account for elapsed time on the other positions. This gives the next compiler researcher a practical way to choose trials for the shared board.

### Prompt Context

**User prompt:** See Step 1. **Assistant interpretation:** Use the actual Chess engine as a consequential benchmark and examine deeper search where it supplies additional information. **Inferred user intent:** Find compiler work that improves the generated program and distinguish it from work that improves cold build time.

### What I did

Generated ELF function symbols from the compiler's actual entry table, verified the engine SHA-256 against the benchmark, built four individual search trials and ran the existing RV32 emulator with function accounting. Compared modeled instructions and node counts as separate predictors calibrated at opening depth four.

### Why

A 30,000-node opening and 30,000-node tactical position had different elapsed times. Counting the instructions inside each Typed function can distinguish additional game work from device timing variation.

### What worked

All four profiles matched their expected move, score, completed depth, nodes and slices. Timing-interval instruction counts agreed with the multi-case harness to within one instruction. Across thirteen other distinct workloads, median absolute percentage error was 1.0% using instructions and 40.6% using nodes.

### What didn't work

The original assembly exposed only the two callable entry points to the harness. Profiling using those names would misattribute nearly all generated work. Emitting a function-typed ELF symbol for every entry supplied the required boundaries. Generated code and fixtures kept their existing hashes.

### What I learned

The short coordinate helpers collectively consumed 14.7% to 22.5% of Typed instructions in these profiles. A study of leaf inlining or frame elimination can now state precisely what fraction it could plausibly improve.

### What was tricky to build

Kiwipete at requested depths four and five follows an identical budget-limited path. The time-prediction comparison excludes that duplicate so the same path cannot count as two independent successes.

### What warrants a second pair of eyes

The calibration is retrospective, covers one device, and uses the exact same engine build and internal RAM. Read the raw predictions before transferring the calibration to new code generation, clocks or memory placements.

### What should be done in the future

Use the physical and modeled baselines together for candidates that actually change search instructions. Recheck on hardware before drawing a compiler performance conclusion.

### Code review instructions

Run scripts/director/06-profile-search-functions.py with the Chess fixture directory, modeled.json, RV32 GCC and a JSON output path. Run scripts/director/07-predict-search-time.py directly against the committed summary.

### Technical details

The model counts instructions at each guest program counter. Each `chess*` symbol identifies a function entry and its range extends to the next entry. The model attributes exclusive instructions to the function containing the current program counter. Nested callees accumulate their own counts.

## Step 5: Explain the 88,172-byte candidate and deliver the three design guides

I reran the code-size census on the fresh release build and the final halfword and guarded word candidates. When the user asked about mesh data, I attributed the halfword image to functions and data and counted the generated geometry tables inside the delivered painter source. The researcher handling reMarkable delivered all three frozen designs.

### Prompt Context

**User prompt (verbatim):** “what's in those 88kB, is it all mesh data mostly?”

**Assistant interpretation:** Identify the bytes in the specific candidate Chess app that was just measured. **Inferred user intent:** Understand how much is game code, painter code or mesh data, and whether optimizing geometry or delivery is the larger opportunity.

### What I did

Extended scripts/director/05-cross-study-images.mjs to measure instruction spans up to the start of the literal pool. Counted the source after the generation marker in painter-3d.typed and inspected the input points in generate-chess-meshes.py. Inspected the physical compile receipt for all five trials per arm and world. Published the corrected ordinary release profile through ad48b80. Obtained the reMarkable delivery receipt in eed79fe.

### Why

The halfword image includes the full source of a second program. The bytes carrying that text are data to Chess and code to the receiving compiler. Counting separately compiled painter instructions again inside the 88,172 bytes would double-count its representation.

### What worked

The qualified game compiled to 54,320 instruction bytes and 33,852 literal bytes. The search group accounted for 26,580 instruction bytes, the source writer 2,392, and the rest of the game and views 25,348. Of the 32,632 bytes carrying painter text, 2,222 spell the generated extrusion tables including their identifying comment. The three-guide PDF reached the reMarkable cloud folder /ai/2026/11/20/PICOCALC-RELEASE-LAB.

### What didn't work

The first release-profile clean build raced two builds in the same CJI staging tree. The operator rebuilt using a separate source archive. The permission for the published tag and the later main-branch release recipe concern distinct source identities.

### What I learned

Most shape construction happens at runtime using arithmetic and a small set of reusable geometry routines. The compact outlines cover three pieces. The 2.5% figure refers to the text of the generated outline and face functions, while other geometry constants appear inside other routines.

### What was tricky to build

The final function span in a pooled image ends at codeBytes. Extending it to the complete image length would incorrectly charge the last function for every pooled literal. I compared the sum of spans to the explicit emitter metric.

### What warrants a second pair of eyes

The 88,172-byte result and the 89,084-byte guarded word result use different native copy loops. The ordinary firmware retains the original implementation. The measured linked Chess ELF is still 274,892 bytes for all arms.

### What should be done in the future

Finish the integrated lab report once the incremental device trial completes and publish all four articles together.

### Code review instructions

Inspect the game.deduplicated arm under game.arms in various/cross-study-images.json. Compare the per-source counts to the native-size table in the director article. Read the reMarkable delivery section of the Chess researcher's diary.

### Technical details

The source is ASCII and the emitter's read-only literal pool encodes each code unit in two bytes. The qualified source has 16,316 characters. Its generated table section has 1,111 characters. The separate compositor painter occupies 21,920 bytes using the deduplicated, halfword-copy candidate.

## Step 6: Compare the measured workflows and return the board to the playable release

All three departments completed their device windows. Each returned the original firmware before handing off the board. I compared reported endpoints against the harnesses and their receipts, including the cost of persisting an edited program's predecessor. The final install has a successful flash readback and an installed native painter.

### Prompt Context

**User prompt:** See Steps 1, 2 and 5. **Assistant interpretation:** Deliver one documented result for cold builds, real edits and executing chess search. **Inferred user intent:** Maintain a playable release while commissioning experiments that can justify future compiler changes.

### What I did

Inspected the literal trial's five samples per app/arm and the incremental trial's three pairs per edit. Recomputed medians from the incremental serial records. Reviewed the board restoration and receipt from each operator. Replayed all cross-study image checks against the final sources. Classified raw model responses and the release body as plain text to retain their exact bytes while leaving docmgr able to validate managed Markdown documents.

### Why

The literal benchmark starts a fresh QuickJS runtime. The incremental benchmark holds a compiler process and a predecessor generation in memory. The measurements have different starting states and cannot be averaged or multiplied. A successful durable write also charges latency that the RAM-only path avoids.

### What worked

Halfword pooling reduced the physical Chess fresh compile/link median from 5.255 s to 2.659 s. Retained fragments reduced the local Chess edit median from 3.236 s to 0.591 s. A signature edit rebuilt all 82 functions and increased time from 3.232 s to 3.368 s. Checkpoint-to-edited-module took 9.003 s for Chess. All comparisons passed their respective correctness checks. The last operator verified both ordinary flash regions and the native painter after restoration.

### What didn't work

The initial docmgr doctor scan treated four raw Markdown outputs under scripts and various as ticket documents and reported missing frontmatter. Renaming the unmodified bodies to .txt and correcting links removed that ambiguity. The clean release configuration reproduced the partition, checked sources and linked components. Its full firmware SHA differed from the shipped one.

### What I learned

Large per-function reuse and slow persistent writes can occur simultaneously. Which result helps a user depends on whether they edit in the same session and whether someone already paid for a checkpoint. The static image of the timed search engine remained identical across literal-copy algorithms.

### What was tricky to build

A change that combines native fragment reuse and a literal pool must preserve references to data just as it preserves references to functions. Absolute displacements from the prior build can become incorrect when earlier pool contents change. I documented this as a future integration test, separate from the individual results.

### What warrants a second pair of eyes

The benchmark flash mapped source-writer code and wrote to PSRAM. The installed game uses the ordinary native loader. Run an actual startup trial before treating the isolated writer timings as a player-visible gain. The incremental tests used wear-levelled SPI flash for persistence; the SD card has different timing.

### What should be done in the future

Promote long-literal pooling through application loading, a smaller reserved slot and first playable frame. Test retained fragments in a live editing workflow. Compare targeted leaf lowering for the computational search engine using the frozen positions.

### Code review instructions

Read analysis/01-compiling-programs-and-measuring-chess-search-on-a-handheld.md with its three companion studies. Compare hashes in various/cross-study-images.json and various/release.json. Read tasks.md in PICOCALC-RENDER-NEXT for the six gates still open.

### Technical details

The published application SHA-256 starts 134f3a24 and the partition starts 72721dc3. The clean-profile app starts 5a72ae37. The final flash readback identifies the published application. The board was left running that release.
