---
Title: JavaScript cursor and index lifetime investigation diary
Ticket: PICOCALC-LEXICAL-INDEX
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-LEXICAL-INDEX--index-typed-source-once-for-the-cold-picocalc-compiler/scripts/02-index-overlay.mjs
      Note: Scoped indexed cursor
    - Path: repo://ttmp/2026/11/20/PICOCALC-LEXICAL-INDEX--index-typed-source-once-for-the-cold-picocalc-compiler/scripts/05-check-index.js
      Note: Native cursor and diagnostic oracle
    - Path: repo://ttmp/2026/11/20/PICOCALC-LEXICAL-INDEX--index-typed-source-once-for-the-cold-picocalc-compiler/scripts/10-reuse-token-overlay.mjs
      Note: Optional current-token borrowing
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:31:15.793634521-05:00
WhatFor: ""
WhenToUse: ""
---

# JavaScript cursor and index lifetime investigation diary

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

## Step 1: Separate source identity from cursor position

The production compiler reads the original source while finding and analyzing async functions. It emits a second source string with generated steps and dispatch code. An index produced for the first string would carry the wrong UTF-16 offsets in the second string. I staged a lexer overlay in the ticket and gave the common frontend a scope that owns indices for one compilation.

### Prompt context

The implementation assignment calls for the JavaScript cursor and its lifetimes in a detached trial based on 2e4fee1. The parent owns the C producer and native binding. The required interface has a four-word token row, a three-word symbol row, no EOF row, and a null result that delegates to the reference lexer.

### What I did

- Opened the design and traced the constructor, signature body skip, the emitter's seek to each function, and the async token retainer.
- Staged a deterministic overlay that patches an archived typed-wasm.js after checking its source anchors. The project compiler files remain untouched.
- Made the compiler open a source-index map at the common compileFunctions entry point. The original index leaves that map as soon as a successful rewrite hands off to generated source.
- Kept each Lexer token as a distinct object. The async parser retains these objects and adds an end offset to each one.

### Why

Each index belongs to exactly one source. A function seek updates lexer offset without issuing the next token linearly, so it needs a binary lower-bound search before a cursor can advance again. Most body parsing progresses in order and can use a simple row increment.

### What worked

Both source strings indexed in the real native QuickJS lane. A first pinned-CPU raw RV32 check preserved the 89,168-byte program and its 70 state fields while reducing approximately 59 ms to 49 ms.

### What did not work

My first shell timing loop used Bash uppercase expansion while running in zsh and printed `bad substitution`. The reproduction runner uses an explicit Bash shebang and names its two modes directly.

### What I learned

The async range checker creates a different kind of lexer over its retained tokens. The new binary cursor belongs to the original-source Lexer and can leave the range checker untouched.

### What was tricky to build

Calling next after an arbitrary offset may start inside a token, comment or string. Even the end of a bounded lexer matters when a bound cuts through a token or comment delimiter. The fast cursor uses a row only from source start, a token start, a previous token end, or an already confirmed sequential offset.

### What warrants a second pair of eyes

Review the brace jump predicate. It requires a currently indexed opening brace at the same start and end offsets. Check that fallback and error restore the prior scope on a nested call.

### What should be done in the future

Compare the overlay on whole linked artifacts and replay the historical E/G fixtures with actual C-produced records.

### Code review instructions

Run scripts/01-stage-index.sh on a fresh directory or apply scripts/02-index-overlay.mjs to a detached compiler checkout. Read indexed next and skipBody together with the reference Lexer methods.

### Technical details

A cached symbol owns an immutable spelling and kind. Each row retains its own absolute token start. A stored brace offset is closing row plus one, so an indexed jump advances directly to the word after the matching delimiter.

## Step 2: Recover the exact tail behavior and check the real C lane

The direct differential found an EOF behavior that the lexical grammar's prose does not advertise. The original sticky regular expression can first skip a terminal line comment and then backtrack when it cannot find a token after it. It can expose the slash characters as normal operators. The native scanner also found this case while checking its record producer.

### Prompt context

See Step 1. Use the actual C data and preserve original scanner diagnostics even at non-indexable offsets.

### What I did

- Routed lookups beyond the last indexed row or through a bounded tail back through the original Lexer method.
- Added an oracle running both lanes in vendored QuickJS. It retains token objects, exercises seeks and brace jumps, and compares exceptions and complete compile outcomes.
- Checked fresh index creation for a repeat compile, an edited scalar literal and a compile after an error in the same realm.
- Compared real linked Files, Agenda and Editor files in Wasm and RV32 on the SDK reactor inputs, including buffered native compilation.

### Why

EOF is itself an observable token. Its offset points to where the original scanner stopped, and asking for another token can trigger a diagnostic. A row sequence without an EOF row cannot summarize all consequences of an arbitrary tail.

### What worked

The final native oracle matched 9,470 bounded and seek observations, 3,072 randomized observations and 73 compiler inputs across both target modes. Eight explicit sample sources and 271 randomized sources returned native indices. The remaining cases exercised the reference path where the input fell outside the native representation.

The assembled Editor source had SHA-256 ea6354bd16ac788862b4f4d8a7362273dcb0d5d5c1b11f29248af388200632b0. All nine linked Wasm and native mode comparisons matched, and the emitted Wasm files validated in Node's WebAssembly.validate API. The Editor's output retained 70 fields, 88,969 Wasm bytes and 240,452 ELF bytes.

Seven fresh vendored QuickJS processes per lane alternated under CPU affinity 7 and a 4 MiB QuickJS allocator cap. The median CPU interval for linked G4 RV32 was 91.186 ms for the reference and 74.002 ms for the index, a reduction of 18.8 percent. Source, compiler module and reactor reads take place before this interval. The interval includes the lexical index, emission and linking.

### What did not work

The first oracle reported `Error: range ["// end",[0,6]]`, with indexed EOF at 0 and reference slash operators followed by the identifier end. I added the boundary fallback. The parent made the producer decline sources where a terminal comment can change the whole-file token sequence.

The growing array of expected traces then hit the 4 MiB test limit and surfaced `TypeError: cannot read property 'name' of null` while formatting the exception. Keeping 64 expected traces at a time let the same test run at the cap.

### What I learned

A lexical boundary can be correct in whole-file scanning while a bounded parse starting at the same position still needs the reference path. This held for comments cut between the two slash characters and for ranges starting inside escapes.

### What was tricky to build

The production and reference modes must both parse the same rewritten source even though only one mode can use the native row buffers. Whole-image identity caught integration differences past the cursor, including RV32 relocation and Wasm slot validation.

### What warrants a second pair of eyes

Check the arbitrary-offset cases where the prefix matches a token end but the end bound cuts off a delimiter. Check that the layout and source-mapped rejection metadata stay equivalent after any hot-token representation changes.

### What should be done in the future

Measure the physical boot interval and heap peak in the main qualification. The linked host interval identifies the speedup in vendored QuickJS for the same input and supports choosing a device candidate.

### Code review instructions

Run scripts/07-run-index-checks.sh with the vendored QuickJS native harness and real SDK reactor directories. The oracle, SHA-256 comparisons and CPU samples are in various/.

### Technical details

The linked Editor digests are 5dfeb5713680bc2c475ed5c530209a98cea40ce152faae5fb11c7de1fff04c65 for Wasm and 7c182547f28e7e6d9921f2a7df7472c6a44df184b7e5eb0543b40c523e6253bd for the ELF.

## Step 3: Exercise the historical language and application programs

The historical E and G fixtures use Node to execute the Wasm target and feed generated RV32 to the emulator. I gave their staged compiler a test-only bridge to the C producer. The bridge uses JSON to preserve the original UTF-16 source, including lone surrogate code units, and reconstructs the two returned buffers.

### Prompt context

See Step 1. Verify the same typed language and continuation tests using C-produced indices.

### What I did

- Ran the historical fixtures from archive 2e4fee1 with the staged overlay and test-only native provider.
- Used the SDK's GCC and the emulator directory that contains the historical C runtime link objects.
- Archived the three fixture outputs in various/.

### Why

Literal parsing and option order matter after the lexical cursor. The existing behavior fixtures corroborate the byte and metadata oracle against actual calls and event sequences.

### What worked

Language E passed 46 outcomes, three traps and 30 reject cases. G passed the 29-event continuation trace on Wasm and both RV32 lowering modes. Five real Editor interleaving fixtures passed on Wasm and RV32, including guarded Open, read failure, replacing a search and replacing a query.

### What did not work

The first run selected an emulator executable with no sibling SDK link objects. The G Editor link failed with `cannot find /tmp/p4-analysis-selection/libc.o` and similar errors for hostcalls.o and softfloat.o. The full rerun used /tmp/picocalc-index-preview/rv32emu and its sibling objects.

### What I learned

The historical E emulator only needs a small driver ELF. The Editor fixture also links a reactor and needs the emulator's runtime support objects.

### What was tricky to build

The native bridge runs in every historical process, including the E worker that runs Wasm. Passing a plain UTF-8 file across the process boundary can replace an unpaired surrogate. Encoding the source as JSON preserves that input.

### What warrants a second pair of eyes

Inspect whether a future C producer change ever returns null for valid production inputs. The direct QuickJS indexed lane is the timing source. The Node bridge exists for functional coverage.

### What should be done in the future

Measure any hot-token reuse variant against this frozen candidate in a separate optional arm.

### Code review instructions

See scripts/09-run-historical-index.sh for the complete historical test command. This runner uses the explicit PICOCALC_LEX_INDEX_QJS variable to propagate the provider to the Node worker.

### Technical details

The test counts refer to the historical fixture files exported at 2e4fee1. Their compiled programs consumed the native producer's row buffers in the overlay.

## Step 4: Measure an optional borrowed current token

The default cursor constructs a fresh token for each read. Most of the compiler inspects a token before advancing and keeps only its name or offset. This second arm lets those parsers share a mutable current token. The async range reader and public lexer preserve the default storage contract.

### Prompt context

The parent requested a separate optional arm based on the now-frozen default at de07831, with measured performance and the same verification.

### What I did

- Added scripts/10-reuse-token-overlay.mjs. It opts in the generated-source emitter and the async signature scan. The separate bounded token materializer retains the normal constructor, so its tokens remain safe to annotate and keep.
- Compared the optional overlay with the frozen default under the real C producer. Both used the same G4 source, reactors and affinity 7.
- Reran the native differential, all nine linked comparisons and historical language, continuation and Editor execution fixtures.

### Why

A token's symbol spelling is immutable, but its occurrence offset changes with every advance. Reuse is sound only for parsers that do not retain the moving object. An explicit constructor option keeps that lifetime visible at the affected call sites.

### What worked

The optional arm matched all oracle outputs and linked artifact bytes. Its historical E/G and Editor fixture receipts were byte-identical to the default arm. In 11 interleaved paired linked RV32 runs the default median was 51.962 ms and the optional median was 49.264 ms. The ratio of those medians gives a 5.2 percent reduction. The paired median saving was 2.777 ms, and 10 of the 11 pairs improved.

### What did not work

One pair took 4.075 ms longer in the optional arm. The measured optional gain is a distribution, not a guaranteed result for a single process. This batch ran at consistently different absolute times from the reference-versus-index batch. I kept all 22 samples and compared variants only within this batch.

### What I learned

Changing the JavaScript token representation can still change compile CPU time after moving lexical discovery to C. The gain here is smaller than the earlier gain from indexing.

### What was tricky to build

The phase that reads async signatures can borrow a token. The different phase that retains the body of an async function cannot. Both instantiate a Lexer, so the optional patch targets the whole-source constructor call and leaves the bounded token materializer alone.

### What warrants a second pair of eyes

Any added body consumer should declare whether it keeps tokens after calling next. Keep the borrow request limited to callers reviewed for that contract.

### What should be done in the future

Use the paired hardware measurements to decide whether to keep the experiment or qualify it further. Compare the optional lane with the indexed baseline using the same source, compiler setup and board conditions.

### Code review instructions

After a full 07-run-index-checks.sh run, pass its work directory and native harness to scripts/11-compare-token-reuse.sh. Repeat the historical fixtures by giving scripts/09-run-historical-index.sh the final argument reuse.

### Technical details

The paired optional timing inputs and artifact hashes are various/04-borrowed-token-linked-cpu.jsonl and various/05-borrowed-token-artifacts.sha256. The original and optimized runtimes both produced the same 240,452-byte ELF.

## Step 5: Publish the compiler-reader article

The report follows a single short typed fragment from its source offsets to occurrence rows and symbol ordinals. It then uses the same contracts to explain why the compiler drops its original index before emitting from generated async source. The report keeps the default and borrowed-token measurements as separate host comparisons.

### Prompt context

The parent requested a follow-up article in the Obsidian vault after measuring the optional arm.

### What I did

- Ran the native helper on the exact article example and checked that the opening brace at row 6 points to the closing row 13 with stored value 14.
- Confirmed the three x occurrences have one symbol ordinal and offsets [4, 5), [13, 14), and [17, 18).
- Reviewed the full draft for correct half-open offsets, source terminology, and timing scope.
- Committed and pushed the article to go-go-parc as 6135063. [Published article](https://github.com/go-go-golems/go-go-parc/blob/6135063/Projects/2026/11/20/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20How%20a%20Lexical%20Index%20Serves%20the%20PicoCalc%20Compiler.md)

### Why

A newcomer can derive the indexed cursor from its array layout and observe how the signature scan and type emitter read the same source with different purposes.

### What worked

The example matched the native provider's actual rows. The vault push advanced main to 6135063.

### What did not work

No failures observed in this publication step.

### What I learned

The article's first example could show valid token positions while forming a type-inconsistent conditional. I changed the condition to compare the integer with 1, then measured the resulting row offsets again.

### What was tricky to build

The host CPU times belong to two different measurement batches. A single combined ratio would give the later borrowed-token experiment credit for unrelated timing changes between batches.

### What warrants a second pair of eyes

Check device selection against a physical compiler and heap receipt. The staged host arms preserve full generated program bytes.

### What should be done in the future

Record the paired board result in the aggregate qualification and keep the selected source revision alongside its linked digest.

### Code review instructions

The default JS overlay is frozen at de07831. The optional token-reuse overlay and paired receipt are at 3a78414.

### Technical details

The publication is a new dated note under Projects/2026/11/20. The ticket includes the trace, linked artifact fingerprints and reproducers that the note references.
