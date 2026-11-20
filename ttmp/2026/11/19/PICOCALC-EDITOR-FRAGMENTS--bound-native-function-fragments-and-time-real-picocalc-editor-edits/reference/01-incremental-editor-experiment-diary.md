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
