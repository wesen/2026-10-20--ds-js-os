---
Title: Binary screen laboratory diary
Ticket: PICOCALC-RENDER-BINARY
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:35:08.288187055-05:00
WhatFor: ""
WhenToUse: ""
---

# Binary screen laboratory diary

## Step 1: Freeze the packet and measured workloads

I built a matched producer/receiver harness for QuickJS and aligned the payload with the current kernel envelope. The study tested one complete snapshot at a time. Its packet can be moved to a different backing buffer because references are packet offsets and string IDs. The sender is authenticated separately from wire fields.

The supervisor commissioned Opus High for the independent blind design. It proposed a general tree with eight-byte aligned slots, fixed arrays and sorted maps. The operator implemented three-byte slots, a packet-local UTF-8 directory, inline small integers and full precision for finite numbers because the generic comparison needs to preserve graph values. The advancing preorder cursor verifies offsets without a block-start index or repeated-subtree amplification. These are operator decisions documented before timing.

### Prompt Context

**User prompt (verbatim):** “can you start one more group that replaces JSON with a binary format that can more easily be indexed as well? If that experiment turns out well, we can pass it on to the other groups to skip the json part too”

**User follow-up (verbatim):** “same guidelines reading diary + project report apply”

**Assistant interpretation:** Run an independent implementation and experiment, produce the reader and empirical report, and determine whether the work qualifies for handoff.

**Inferred user intent:** Find whether direct access can reduce compositor work without trading away complete snapshots, correctness or replay.

### What I did

- Read RENDER-NEXT designs 01, 04 and 05 and inspected `frame_message` in `kernel.c` and `paint` in `compositor.js`.
- Implemented `02-binary-screen.js` and the shared accessor, producer, consumer, lookup and painter trial. Froze PSIX v1, 32,768 bytes, depth 24, 8,192 values, widths 1,024/64, 4,096 strings and 2,048 bytes per string.
- Froze corpus selection at a median eligible full JSON payload with first and last indices in the largest eligible array. Withheld the Editor trace during design and first preflight. Recorded the capsule manifest and archive hashes.
- Added native-parse arm P at the director's request before any device timing, to distinguish the experiment's bounded generic control G from the deployed-style parse path. Imported the public blind design output without session trace content.

### Why

The question involves allocation, transport, validation and application consumption. A small reader benchmark could misleadingly count only a hot lookup after expensive preparation. A paired full paint on the same tree, a sparse query and a repeated full paint expose distinct use patterns, while native same-build comparisons control for language and interpreter boundary.

### What worked

The three-app deterministic check and the Editor holdout matched across B/G/P on late/first lookup checks, repeat lookup, full tree weight, first paint and repaint command results. The final capsule SHA-256 was `ca2d76e538601914a40b88ad12e560456d2b2c8b50a26dbfbaf392333b5ffc01`. The frozen IDs were System `select-3`, Chess `castle-long/003 left`, Snake `auto-79` and Editor `replace-search/query unit 5`.

### What didn't work

The first Node capsule generator used `execFileSync('git', ['rev-parse', '--show-toplevel'])`. Sandbox Node threw `Error: spawnSync git EPERM` even though the tool captured a valid stdout string. I moved git/cc/raster process execution to the shell wrapper and gave the Node generator a fonts JSON input. I replaced the initial three-workload capsule with the final four-workload artifact after the deterministic checks.

### What I learned

The sorted UTF-8 key directory and fixed array slots make later lookups bounded. Eager structural validation visits the whole payload even for a consumer that reads one value. A binary packet by itself cannot eliminate that work and cannot be passed through the current string channel without encoding.

### What was tricky to build

The painter calls Array methods and uses `Array.isArray` on cells. A proxy over a real Array target preserves the relevant JS semantics while reading a selected slot. The reader copies into private memory before validation so post-admission mutation by the producer cannot change the consumer's view.

### What warrants a second pair of eyes

Check that painter compatibility covers both dynamic and indexed arrays and that arithmetic is performed with the same numeric semantics. The scanner must validate offsets before using any targeted body. Verify the strict string order under supplementary Unicode and the difference between a canonical encoder and permitted unused directory entries.

### What should be done in the future

Price byte-native ownership across retention, queue fan-out and deferred draws once an integration boundary is approved. Add widget-specific work bounds on top of the current transport limits before adoption.

### Code review instructions

Start with `encode`, `admit` and `path` in [the codec](../scripts/02-binary-screen.js). Follow the [reproduction guide](../README.md) to regenerate the capsule. Review its payload hashes against the [manifest](../various/capsule-manifest.json).

### Technical details

The control includes the complete ordinary sender/title/frame JSON shape. The painter shim fixes the clock, pulls font sizes from the shared C raster and promotes the production draw fallback exception to a test failure. In device trials, paint outputs a shared command checksum. The independent host raster measures actual pixels.

## Step 2: Verify the full trace and price the host path

I compared every frame in the four traces by value and exact draw commands. The production raster ran twice per app, once for each arm, and compared every RGB565 pixel. I tested immutability, retained-state replacement and a failed flush followed by recovery, and instrumented both QuickJS peak allocator use and retained generations on the x86 host.

### Prompt Context

**User prompt:** See Step 1.

**Assistant interpretation:** Qualify correctness and total host resource effects before interpreting P4 results.

**Inferred user intent:** Preserve utility for all of the named apps, including Editor as an independent, untuned workload.

### What I did

- Executed the commands in the reproduction guide against the frozen traces.
- Ran 23 deterministic conformance cases and 30,000 mutations with seed `0x9114`. Compared equivalent canonical round trips on admitted mutations and rejected structurally bad ones.
- Retained all RGB565 frame hashes and per-trace wire totals, including the textual fallback envelope. Measured one, two and three simultaneously held generations with and without live source-wire copies.
- Compared two independent native controls with the other measurement engineers. The native reader engineer held producer constant and isolated admission, lookup, walk and release against cJSON. The native sender engineer added a byte-identical PSIX encoder from an already resident cJSON source, using cJSON_PrintUnformatted for its matched control.
- Commissioned Opus High to author the host chapter from the aggregate receipts.

### Why

Effects on the actual renderer depend on which operations happen after admission. The correct comparator must perform the same semantic operations. Native C isolates the wire format from the JS encoding and Proxy overhead, while the host raster demonstrates equivalence across full traces independent of performance measurements.

### What worked

All 427 trees and command streams matched. The two raster passes compared 87,449,600 committed RGB565 bytes and recovered after a simulated dropped transfer per app. Among seeded mutations 26,696 were rejected and 3,304 remained structurally valid and round-tripped. Binary saved raw bytes across each aggregate trace, ranging from 1.86% for Snake to 21.24% for Chess. Base64 plus the text envelope cost more than ordinary JSON across all four. Host binary admission beat the matched structural G check, while JS encoding and paint were slower.

### What didn't work

The plain JavaScript property facade made the full hot read path costly. Two-generation consumer live memory improved by 36,048 bytes for Chess and 15,872 bytes for Editor vs P when the separate source wire was dropped. It increased for System and Snake. The result does not support a universal JS heap savings estimate.

### What I learned

A packet permits an indexed read after eager validation. The representation advantage matters more where consumers stop early or avoid materializing native object nodes. Relative costs can change again when adapter methods read many fields during layout.

### What was tricky to build

The native cJSON check uses a shared subset without embedded NULs and caps occurrences of strings, while JS counts unique strings. The probes exercise the same four fixed input values but cannot extend each contract to the other's entire data model.

### What warrants a second pair of eyes

Check that published C memory numbers explicitly exclude allocator headers, source objects already resident and stack. QuickJS begins above a loaded capsule, and its allocator reports usable bytes with charging overhead, which is a different measurement boundary than native requested payload.

### What should be done in the future

Compare the true lifetime ledger on a binary-safe transport and a native paint integration for any selected pilot.

### Code review instructions

Review [the verifier](../scripts/07-verify.mjs), [host evidence](../various/host-evidence.json) and the native reader/producer appendices. One seeded study run is not exhaustive fuzz evidence. The host report records frame hashes so reviewers can run the full replay independently.

### Technical details

Across traces, ordinary JSON → raw PSIX payload totals were 179,330 → 163,672 (System), 183,891 → 144,822 (Chess), 200,508 → 196,787 (Snake) and 95,708 → 76,321 (Editor). The encoder's source and serialized host QuickJS bytecode were 15,426 and 52,541 bytes. No app-specific schema or resident dictionary is required. A production flash delta was not measured.

## Step 3: Close the physical trials and hand off the native route

The lab director built two temporary test images, collected both physical matrices and verified the playable image after each run. I checked all receipts against the frozen command, lookup and traversal witnesses. The QuickJS and C families isolate different costs. I used the measured native route to scope the Chess pilot and kept the current generic JSON path as the deployment reference.

### Prompt Context

**User prompt:** See Step 1.

**Assistant interpretation:** Decide from the physical trial whether the groups should substitute the new format. Pass on the working implementation and evidence at the justified boundary.

**Inferred user intent:** Skip JSON only in a path where the measured advantage survives sender, admission and downstream work.

### What I did

- Verified the supervisor's 84 QuickJS, 56 native receive and 56 native producer/receive receipts. Each native block repeats eight times per cell and every family uses seven interleaved blocks.
- Checked first/last access, repeated path, walk and the shared render command hashes where timed. Verified native producer bytes against the two host encoders through the independent producer report.
- Compared the two ownership and clock boundaries, imported the two Opus High sections and corrected terms against the actual code and receipts.
- Wrote the native Chess pilot boundaries and wire contract, related the code/evidence with docmgr and passed the drafts to the director for vault and reMarkable publication.
- Added the missing metadata and numeric prefixes identified by `docmgr doctor` on the blind proposal and producer appendices. Existing historical references in the actual prompts and subgroup diary record their paths when written.

### Why

A receiver savings alone does not price a proposed replacement on a real producer. The matched native sender/receiver trial adds the encode cost and still shows a large improvement. The slow complete QuickJS route rules out a direct rollout of this JavaScript adapter. One integrated pilot can price the remaining stages with equivalent pixels and without altering the other groups' production entry points.

### What worked

Zero errors were reported across 196 device receipts. QuickJS PSIX encode+admit+paint medians were 168.723, 134.457, 48.328 and 133.166 ms for System, Chess, Snake and Editor. Against bounded G the native matched route fell from 5.175 to 1.484 ms, 16.915 to 2.027 ms, 2.619 to 0.525 ms and 14.021 to 1.703 ms, respectively. The median within-block reductions were 71.34%, 88.01%, 79.96% and 87.86%. The 427-frame RGB565 host replay, capsule hash, compile and device summaries reproduced from the packaged inputs.

### What didn't work

The first physical summarizer compared C's unsigned JSON printing of 32-bit hashes with signed JS integers. It stopped at `AssertionError: ('chess', 'B', 'walkHash', 2447309566, -1847657730)`. These values encode the same bit pattern. The summarizer normalizes native witness values modulo 2³² while preserving the signed JS comparators. The matched C test still needs its own exact per-arm wire witness because the wire bytes differ by design.

### What I learned

The native gain arises mostly in admission and releasing parsed objects. Native binary encoding alone took longer on the board in all four specimens. Repeated read differences were much smaller. The tested native route began with a complete source tree already available. Materializing that tree in an actual producer would add work the integration must count.

### What was tricky to build

The JS arm uses a direct path for the timed indexed lookup and the Proxy for production paint and full property traversal. Their costs cannot be attributed to the same mechanism. Publication checksums and full traversal witnesses in the native producer run are outside the matched route clock. The exact order and scope of both clocks are explicit in the source and keep their results interpretable.

### What warrants a second pair of eyes

The physical work compares repeated fixed cases on temporary images, so report stage medians rather than claiming p95, tail stability or full device pixel timing. Check that the native integration charges any newly introduced source object, both owners when a copy is present and the production raster and delivery. The operator's reread repaired one erroneous two-level lookup description and a mistaken claim about Proxy use in the timed direct-read segment.

### What should be done in the future

Run the native Chess pilot against the actual existing Chess producer. Verify equivalent pixels, observable effects, authenticated sender generation, ownership across failed validation/replay, paint and delivery with the tested native reader. Use those paired results to decide on any expansion.

### Code review instructions

Read the [reproduction guide](../README.md), run [the device summarizer](../scripts/10-device-summary.py) on both archived receipts and inspect the control boundaries in the [final report](../analysis/01-what-an-index-on-the-wire-buys-a-picocalc-renderer.md) and [native Chess handoff](../design-doc/02-native-chess-integration-handoff.md).

### Technical details

First test image SHA-256 `576582843e2221f146e32c0babb8d1a163afbd43be388abf10ded8210f2a5b7c`. Second image SHA-256 `f8af1bbfd4478e569824512b18017d908217672f87c1ce37b342375cb7162e0d`. Both receipts record the same verified playable image SHA-256 `f12e2f5d6e668ef7d61fa456b69b56bf9f1e976e929672e7df81ac33a2f03f83`. Subgroup checkpoints are `7ffd3a6` and `22031ce` for native reader and `6dbecbb` and `400d6db` for native sender.
