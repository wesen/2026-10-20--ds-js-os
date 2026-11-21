---
Title: LLVM shadow investigation diary
Ticket: PICOCALC-SHADOW-LLVM
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T18:16:21.798876585-05:00
WhatFor: ""
WhenToUse: ""
---

# LLVM shadow investigation diary

## Step 1. Identify the actual control and replay LLVM’s passes

The previous shadow study reported a physical median of 135.74 cycles per natural floor query for GCC with explicit checks. The current study isolates the same predicate, places it in a separate trace archive and follows its operations through LLVM. One investigator owns the pass timeline and its measurement.

### Prompt context

**User prompts (verbatim)**

> can we examine how llvm derives those 136 bytes and what optimization they do we don't? that's the more interesting path

> and use the repl?

**Interpretation.** Explain the earlier cost with a matched compiler comparison. Identify a cheaper implementation of the same source semantics and make the evidence queryable. The word “bytes” referred to the earlier board time. Code bytes are measured separately.

### What I did

Read the actual GCC benchmark wrapper and reused its halfword layout, capacity accessor and predicate source directly. Compiled default C and signed-wrap C with LLVM 18.1.3 for RV32IMAF(C), ilp32f. Captured every printable middle and backend pass, with SHA-256 and byte-offset indexes, using scripts/01-capture.py. Started a separate project trace-repl server in tmux, then inspected the archive with q.ir and q.machine.

### Why

A GCC dump of the native-structure renderer answers a different question. Our comparison must preserve the input layout, projection bias, traversal, short-circuit arithmetic and valid floor queries of the actual C control. Keeping the new archive on its own port preserves the existing ray-row and SIMD sessions.

### What worked

The queried adjacent SROA prints showed 18 local memory objects becoming zero. Inlining exposed twelve capacity-load sites. Adjacent pass snapshots at 77 and 78 showed EarlyCSE retaining one. The property NoVRegs became true at the second virtual-register rewrite. All snapshots can be retrieved by stream digest and original ordinal.

### What didn't work

The original archive held a different function. A new capture was necessary. The new capture also renamed the function from checked_shadow to kernel during GlobalOpt; the before and after parts of the timeline require their actual respective names. Web fetching the version-tagged GitHub UI returned “Cache miss”; the already materialized LLVM 18 source files and official LLVM manuals supplied the algorithm reference.

### What I learned

A successful bounds check and a read of the length field are different operations. Reuse of the length can justify an optimization even where no index can be proved safe.

### What was tricky to build

The standard C and wrapping treatments compile differently in two ordered comparisons. Preserving the second treatment separates a signedness assumption from the optimizations that hold across the real input domain.

### What warrants a second pair of eyes

The capture includes both function and module pass records and changes names once. Check the before/after references and use argument identity for the pointer rather than relying on the spelling of an SSA local.

### What should be done in the future

Use matched board and dynamic-instruction data to rank which LLVM mechanisms are worth replicating in our small compiler.

### Code review instructions

Start with scripts/01-capture.py, scripts/05-cells.js and various/ir-session.json. The latter includes source for the actual queries and their responses.

### Technical details

Each compilation has 172 middle-end and 112 backend snapshots. The same target calling convention is used by the hardware experiments. The checked-source wrapper uses __builtin_abs and a symbol alias solely to make the previously internal predicate available to the driver.
