---
Title: Incremental build investigation diary
Ticket: PICOCALC-RELEASE-LAB
DocType: reference
Status: active
Topics: [picocalc]
---

# Incremental build investigation diary

## Step 1. Establish the release baseline and commission the research lead

The original user wording is recorded verbatim in [the director diary](01-director-investigation-diary.md). The user's later clarification was “approve sending to anthropic, it's a toy compiler”. The director delegated a real Opus High design, substantive critique and authored report, with one operator lane after the Chess search and literal studies. Only the explicitly approved compiler materials and aggregate measurements go to the researcher.

I started the actual Anthropic Claude CLI in /tmp with opus, high effort, no tools or settings sources. The first request contained a source-free experimental brief and the prior function-fragment study. The recorded model was claude-opus-5-5 and the tool list was empty. The design was preserved as the lead's own research protocol. Temporary CLI output contains process metadata; only the public result and minimal provenance are archived in this ticket.

## Step 2. Port the fragment experiment onto the released compiler

The earlier LAB2 experiment used a different Typed compiler and 120 Editor functions. Its conservative per-function record fingerprints, bounded 40 and 256 KiB native code budgets, actual P4 native execution, and matched clean outputs established feasibility in that revision. The current release scans forward signatures, lowers two async Editor functions into continuations, checks the complete call graph for cycles, streams numeric operands, and links large SDK reactors. The older emitter class cannot be applied unchanged. I chose to keep the current frontend, linker, app record validation and external compile entry unchanged, and inserted private cache hooks in both ordinary and async emission paths.

Each cache root holds its complete dependency environment. Records include field types and offsets. Functions include order, signatures and parameter names. Async-generated symbol configuration participates as well. An identical body plus matching environment can reuse words, symbolic relocations and dependency edges. The code copies and rebinds relocations before the stock linker assigns addresses. The whole environment guard deliberately sacrifices selective signature or layout reuse. Keeping current and proposed roots separate preserves the old one across a rejection. This is scoped to trusted compiler-produced fragments and the pinned compiler/runtime used by the trial.

I staged the two source files and SDK reactor images from the qualified released CMake build. They are the application inputs actually used for the handheld, including the source-delivery constant in Chess. The host fork and the untouched production compiler were loaded in separate Node VM contexts. The release has 119 emitted Editor functions and 82 Chess functions. A body edit changes real code length, the signature test repairs three Editor call sites or ten Chess call sites, and the layout test exchanges real shared state fields. The broken intermediate signature must produce the identical diagnostic and preserve the previous cache root.

## Step 3. Establish host, disk and independent correctness results

Commands from scripts/incremental:

```sh
python3 -B 03-stage.py /tmp/release-incremental /tmp/mobile-painter-chess3d/build/esp-idf/main
node 05-host.mjs /tmp/release-incremental /tmp/release-incremental-host
node 08-gold.mjs /tmp/release-incremental
```

Across five rotated blocks per edit, the four arms compare stock, a resident predecessor, an on-disk predecessor plus a newly committed checkpoint, and empty-cache fragment emission. All accepted ELF SHA-256 results and serialized async layout/source metadata matched. Both bad signatures returned the exact clean diagnostic. The host disk performs integrity and identity checks, syncs the complete temporary file, renames it, and syncs the containing directory. A truncated checkpoint and a foreign identity are refused. Local body edits reused 118 of 119 Editor functions and 81 of 82 Chess functions. Every signature or layout edit triggered a global miss. The director independently forced a formerly unchanged caller's destination from byte offset 84 to 144, created a cycle through a retained edge and tested rollback/reordering. [Independent controls](../various/fragment-correctness.json)

A second restricted Opus High commission received the actual candidate code, source hooks and aggregate host figures after the owner's express approval. I requested counterexamples and diagnosis. The article will separately identify which recommendations were actually tested and which remain future scope.

## Step 4. Construct the hardware experiment and verify recovery controls

The separate ESP-IDF image uses the same native token index as the production compiler, the shipped QuickJS sources, PSRAM for JS allocations, a 56 KiB JS stack guard, and the ordinary RV32 compiler entry. A private allocator measures JS high-water. The warm isolated experiment permits enough memory and time for two compiler implementations, immutable prior/current roots, and a separate evidence hash check. Fresh-realm builds time runtime initialization, compiler evaluation, inputs and the first linked image. CRC checks and independent byte comparisons sit outside that hardware timing. Production interactive quotas remain a separate qualification.

A real persistence sample attempts exclusive creation of /files/incbench.tmp on the existing FAT volume. Mounting disables formatting; an existing file is left untouched. The program writes the serialized initial generation and CRC, fsyncs and closes it, reopens it, verifies the bytes, and unlinks only its own file. The commit and restore timers are emitted independently. With collision or an unmountable partition the result explicitly records RAM-only serialization. The specific scratch-file operation and recovery were approved by the director. The test uses an internal FreeRTOS stack while performing flash I/O.

The first standalone C build failed because ESP-IDF's newlib exports malloc_usable_size without declaring it. The shipping build already solves this with p4_compat.h. I staged that same declaration and rebuilt rather than weakening the compiler warning. This study's board image shares the ordinary partition table. Its runner verifies the published application and partition before the trial and restores and verifies the same image in a finally block.
