---
Title: Incremental Editor experiment diary
Ticket: PICOCALC-EDITOR-FRAGMENTS
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
LastUpdated: 2026-11-19T22:00:38.722908585-05:00
WhatFor: ""
WhenToUse: ""
---

# Incremental Editor experiment diary

## Step 1: Define the edit-to-return endpoint before changing the reuse compiler

The existing experiment reached a running Files helper. The earlier Editor experiment compared complete ELFs on the host. Neither previously measured a bounded editing session calling newly generated Editor code on this P4.

### Prompt Context

**User prompt (verbatim)** “heap usage is not vitally critical, it's good to keep an eye out but we can definitely trade things off in either direction.”

**Assistant interpretation.** Keep a real upper bound on retained fragments to study misses. Report physical allocator use and latency as separate outcomes. **Inferred user intent.** Show which real edit classes benefit on a handheld and why.

### What I did

Read the prior fragment compiler, Editor examination, ELF loader and the actual typed preview code. Registered a three-class edit sequence with a second field-layout witness and a physically observable native endpoint.

### Why

A zero or constant return value alone would miss a stale field offset. The preview caller writes through both a buffer and the typed state, which gives an observable effect of an edited helper.

### What worked

The existing public compiler has deterministic byte output, and the previous exam supplies an independently validated body/signature/layout sequence. The earlier loader already relocates an ELF using ESP-IDF’s executable-memory configuration.

### What didn't work

The old device runner invokes Files stub zero with a Files-specific signature. Editor exports just world metadata and event delivery; the desired preview helper is an internal function.

### What I learned

Use the ordinary linked ELF with a clean function offset for the benchmark. This lets the experiment run the actual preview helper while leaving the module ABI and input source intact.

### What was tricky to build

A limit on machine words cannot be interpreted as the entire memory cost of retained JavaScript objects. Distinguish payload capacity, entry count and actual observed heap.

### What warrants a second pair of eyes

Review backing memory dimensions, field offsets, executable segment mapping, console-independent clock placement and source fingerprints.

### What should be done in the future

Run the complete host matrix, then compile and execute the clean and bounded lanes on the board.

### Code review instructions

Read the study design beside the earlier FUNCTION-REBUILD and LAB-REVIEW scripts linked there.

### Technical details

The original Editor stride is 100 UTF-16 code units per slot. The previous three-call-site signature edit used stride 99. The two runtime entry stubs and import table precede native function zero.

## Step 2: Make eviction bind and verify the full Editor after an invalid edit

The host prototype now links the original source and four edited revisions. I kept the pinned production frontend and backend, and changed the incremental session's publication step. A session keeps retained fragments and drops the previous full ELF and module-wide exact-hit copy. This experiment measures consecutive edits.

### Prompt Context

**User prompt (verbatim)** “what's the editor compile time currently? the best?” and “and files?”

**Assistant interpretation.** Separate cold full compilation from warm incremental edits. **Inferred user intent.** Establish a realistic baseline before extrapolating Files to Editor.

### What I did

- Generated the candidate from the pinned FUNCTION-REBUILD scripts and changed only retention and session publication. Ran the normal streamed clean compiler independently in a separate JavaScript realm.
- Rebuilt and hash-checked complete ELFs after the stride, repaired signature, field reorder, alternate field reorder and undo. Verified that rejection of the unrepaired signature preserved both the revision and the cache.
- Generated a C header using offsets discovered in the clean linked ELF and its field table. Started an isolated ESP-IDF firmware build that will call the real preview function after each edit.

### Why

The 120 functions emit 87,544 instruction bytes in this production control. A retention limit must be below that total to test a miss. Application ELF length includes a much larger reserved slot.

### What worked

The 40 KiB bounded cache retained 72 functions and 40,892 instruction bytes after the body edit. It reused 71 and compiled 49. The 256 KiB policy retained all 120 and rebuilt only the changed helper. The zero-byte case rebuilt all 120. Each produced an identical complete ELF for the same revision. An invalid signature produced the same diagnostic in both compilers.

### What didn't work

An initial 96 KiB budget retained all functions. The host test expressly required both eviction and reuse and failed. I reduced the experimental budget to 40 KiB before any physical timing.

### What I learned

Source size, native code size and padded module size differ enough to reverse whether a nominal budget actually constrains the trial. A binding assertion was necessary.

### What was tricky to build

Rows and units move in the alternate field reorder. The guest caller must use the clean compiler's field indices for that particular revision and verify both the output ring and the state. A stale offset can otherwise survive a test that checks only the integer return.

### What warrants a second pair of eyes

The clean and candidate compiler clocks must start at the same handoff. Check that hash calculation and serial writes run after the native return. Device timing and absolute heap are still open.

### What should be done in the future

Run both boots, confirm restoration and quantify latency and memory at each capacity.

### Code review instructions

Read scripts 01–04 and compare the physical offsets with the per-revision table in `various/host-oracle.json`. Re-run with the same `editor.typed` and `typed-world-reactor.elf`.

### Technical details

Cap units are bytes of retained `Uint32Array` payload. All matching source and dependency records for omitted fragments become unavailable at the next build. The isolated firmware uses a 6 MiB emergency QuickJS ceiling; actual high-water and pre-edit live counts are recorded for each lane.

## Step 3: Run the exact native function bodies before taking the serial slot

The device firmware compiled successfully for the ESP32-P4. I independently executed the linked preview function from every required ELF in the project’s RV32 emulator, including the original and both layout variants.

### Prompt Context

**User prompt (verbatim)** “our main goal is being able to cmpie things in a reasonable amount of time on the device, btw.”

**Assistant interpretation.** Prove correctness and discover address or layout bugs on the host before interpreting a physical edit clock. **Inferred user intent.** Keep scarce board time for the measurements that specifically require the hardware.

**Commit (code).** `47f895b` adds the device validator and reporting tool.

### What I did

- Built the isolated ESP-IDF firmware, fixed the C logger for the target's 32-bit integer typedefs, and checked the digest and complete ELF size.
- Added a separate freestanding native driver that embeds each clean linked ELF unchanged, enters the internal Editor preview function at its clean offset, and checks return, written buffer units and post-call state.
- Queued the firmware behind the scanner and native backend physical trials. Added acknowledgement-based retry on restoration if a failed preboot study is still starting the ordinary worlds.

### Why

A preboot function pointer has no type information at run time. Independent execution exercises the native calling convention and the semantic witness before interpreting a bench result. The physical and emulated ELF loaders have different roles.

### What worked

All five native revisions returned zero, wrote header units 5 and 4, advanced the row from 2 to 3, and cleared the pending unit and column counts. The original stride wrote at index 200; all edited versions wrote at 198. The final variant exchanged the field word indices from 56/57 to 57/56.

### What didn't work

ESP-IDF identifies `uint32_t` as unsigned long on this target, while the initial logging format used unsigned int. The compiler rejected the mismatch. The initial emulator driver tried the Linux syscall convention and the CJI emulator reported an unknown host call. Disassembly of its supplied startup object identified CJI exit host-call number 1.

### What I learned

Calling a linked body's address and checking a return plus state effects tests more than an ordinary body-to-body byte comparison. Firmware relocation and board behavior still need their own evidence.

### What was tricky to build

The guest function is private to the compiled text. The emulator wrapper embeds the already linked ELF contents in executable storage, so its internal PC-relative calls preserve the original distance. The board uses the actual ESP-IDF ELF loader and executable mapping.

### What warrants a second pair of eyes

Check the chosen offsets against the executable segment and the resource limits against the large source; inspect whole-ELF hashes before interpreting timings.

### What should be done in the future

Collect the paired physical rotations, including file-handle and preview-state layout changes.

### Code review instructions

Run `scripts/08-replay-native.mjs WORK GCC EMULATOR` and compare its five native observations with `various/emulated-preview.json`.

### Technical details

Clean ELF size was 240,452 bytes on this reactor. The preview helper file offset is 33,416 for the first body edit and 33,420 after changing its callee signature. The P4 receives these offsets from an independently generated clean header.

## Step 4: Obtain the two device measurements and an independent stale-layout control

Each of the four edits ran three times in each of three modes, on two separate boots. All 72 source-to-native-return intervals produced their independent clean ELF hashes. The tight fragment limit improved local edits and lost on both layout changes.

### Prompt Context

**User prompt (verbatim)** “heap usage is not vitally critical, it's good to keep an eye out but we can definitely trade things off in either direction.”

**Assistant interpretation.** Compare a space-for-latency trade on both a local edit and a wider invalidation. **Inferred user intent.** Explain why a larger active editing session could be worth keeping on a handheld.

### What I did

- Used `scripts/06-physical.py` to run all 72 source changes with the ESP-IDF loader, counting allocator and the real native Editor preview function.
- Asked the independent examiner to reproduce the host artifacts, attempt a deliberately stale state-layout call and check physical array contents, return, full SHA-256, rotation and retention counts.
- Compared within-block changes against the warm full compiler and retained separate per-boot medians. Added a publication table renderer which derives the numbers directly from the validated receipt.

### Why

A single frozen program can show both the best and the worst consequence of reuse. The size of a change in characters is a poor guide to the number of code-generation dependencies that it invalidates. Wider storage permits more reuse, and memory measured at the worst point can exceed memory kept between edits.

### What worked

Full retention returned from the real body edit in 487.3/489.9 ms across two boots, a paired 78.78/78.57% reduction. It returned from the signature edit in 576.1/576.0 ms, a 75.11/74.91% reduction. At 40 KiB the body edit saved 31.97/31.85%, but the file-handle layout change cost an additional 2.49/2.39%. The other preview layout change cost an additional 2.28/1.72% at that cap. All 72 full hashes matched.

### What didn't work

The smaller cache could retain 72 functions, yet only 30 reusable fragments were left on either field reordering. It rebuilt 90 bodies. Its earlier memory saving failed to compensate for the additional work in these two measurements.

### What I learned

Changing field order can increase the required compiler work even when the specific endpoint's behavior is invariant. The separate preview-field reorder changes the actual field offsets accessed by the witness. The examiner confirmed that deliberately applying the new field layout to the previous native body traps, while the correct fourth ELF returned and wrote the expected state.

### What was tricky to build

A custom allocator's observed peak is not a fragment-size metric. On the second boot the roomier session used about 1,547 KiB at the body edit peak, but over 1,806 KiB for the record reorder. Retained native code never exceeded 87,572 bytes for that session. Report both dimensions.

### What warrants a second pair of eyes

Sample sizes are three paired rotations per edit per boot on a single physical board. Treat the observed directions as evidence about these edits. The broad record dependencies leave a separate design question about tracking precisely the fields read by each function.

### What should be done in the future

Carry the same fixture and the mutation controls into a future comparison of whole-record fingerprints and field-specific dependencies.

### Code review instructions

Review physical rows before the reduced figures. The metadata and results must agree with `various/host-oracle.json`. Inspect the examiner’s PICOCALC-LAB2-METHODS ticket for the independent stale-field fixture and 8,192-character retained-spelling perturbation.

### Technical details

Negative paired changes denote shorter latency. The former file-handle field reorder rebuilt 77 of 120 functions at the large cap; three callers plus the signature-changing function gave four for the signature edit. All input preparation and the previous revision’s seed build precede the clock.

The original factory partition was restored and Files, Agenda and Editor returned native with empty error fields. The two-boot physical receipt, figure and rendered table were checked. The complete report and its figure were pushed to the vault in `a2fe6cd9e914be7216b640fd9b83f42359ae96cc`; a subsequent remote lookup returned the same main commit.
