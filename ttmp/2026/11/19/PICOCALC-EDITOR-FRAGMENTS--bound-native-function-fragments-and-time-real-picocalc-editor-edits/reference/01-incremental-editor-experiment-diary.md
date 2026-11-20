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
