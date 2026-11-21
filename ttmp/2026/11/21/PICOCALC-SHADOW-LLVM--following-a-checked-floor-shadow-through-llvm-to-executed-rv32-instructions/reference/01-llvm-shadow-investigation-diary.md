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

## Step 2. Compare linked functions across six treatments and join the results in the REPL

I tested the checked arm with LLVM on the device, then ran the same linked instruction bytes on the host and checked each predicate return. The compiler alternatives use the same coordinates and scalar algorithm. This step provides separate evidence for capacity reuse, physical register assignment, and address induction.

### Prompt context

See Step 1. The user specifically requested the REPL. I retained the entire pass archive, exact JS cells, raw timing batches, census and per-PC evidence for reproduction.

### What I did

Built a standalone IDF 5.4.2 diagnostic without touching production sources. Added compiled LLVM objects, selected the existing optimized Typed entry by its pinned image hash and preserved the previous checked C predicate. Ran six rotated arms, twelve natural streams and four single-sphere path cohorts. Used scripts/04-trace.py to extract each relocated body from the timed ELF, execute it in QEMU, validate all 19,477 booleans and count every executed PC. Queried the combined results in the dedicated trace REPL. Committed the first checkpoint at 38d3b75.

### Why

LLVM pass metrics count static program sites. Only execution reveals their frequency. Only a physical timed run establishes cycles on the P4. Collecting all three makes it possible to test a prediction and report when a host metric gives the opposite preference from the board.

### What worked

GCC and LLVM evaluated the natural opening queries in 136.66 and 144.31 cycles. Typed required 382.25. The Go-hosted JS session traced local promotion and capacity-load reuse and counted 1,624,336 excess direct stack accesses plus 245,451 excess capacity loads. The two disjoint classes account for 60.35% of the guest instruction gap. Disabling optimized register allocation increased LLVM time by 91.64%; disabling loop strength reduction increased natural opening time by 3.92% and improved the one-sphere X-only path. Verified application health after the runner restored the playable firmware.

### What didn't work

The first instruction census stopped on the assertion that Typed must reproduce the prior 5,428,633 instructions. The captured QEMU PCs summed to 5,428,633, while the disassembly parser counted 5,163,705. A whitespace pattern consumed the next line after each operand-less ebreak, hiding twelve instruction addresses. I restricted the pattern to horizontal whitespace, added an assertion that every executed PC was decoded, enabled disassembly of zero encodings for cold traps and reran all six binaries. A trial decode of the raw UART log as strict UTF-8 also encountered boot noise; the importer preserves a raw digest and parses only identified measurement rows.

### What I learned

The larger pass is not necessarily the right next implementation. A bounded capacity reuse rule has a precise prediction and small scope. The optimized-versus-fast LLVM comparison shows much greater potential for cross-block value placement. Counting stack operations alone would incorrectly rank the two LSR treatments.

### What was tricky to build

The exported native symbol has the checked kernel’s size for GCC and LLVM. Typed exposes an entry within one larger native image. I verified both the full image digest and the sliced 1,060-byte body. Validating the branch and payload totals also required distinguishing an explicit conditional jump to a C trap from Typed's inverted conditional branch over a trap.

### What warrants a second pair of eyes

A position-relative function body must execute correctly after moving to the host harness. The per-call result oracle and the previous independently recorded Typed instruction total both passed. Cross-check the local source for the 0xf1 emitter; this routine retrieves the original index and receiver from stack homes before loading capacity.

### What should be done in the future

Prototype capacity reuse and register forwarding separately. Check their combination, trap observable behavior, per-PC counts and full-frame effects before proposing a default.

### Code review instructions

Read the report, then run scripts/06-repl.py against the dedicated server. Each response contains actual code or original pass references. Compare the paired cycles and the per-PC frequencies rather than comparing a host instruction tally with a physical timer.

### Technical details

The six kernels verified the same 19,477 opening calls in QEMU. The board independently verified natural inputs for all twelve fixtures plus four single-sphere strata and recorded 576 batches. The board image digest is recorded in various/device/receipt.json, the compiled kernel digests and exact linked addresses in various/native/pcs.json. The full REPL session ID is recorded in various/repl.json.

## Step 3. Verify the student article and portable REPL capture

I read the article as a standalone explanation, checked its code snippets in the final session, and verified every packaged input against the original evidence. The published archive contains 19 entries and is 117,148 bytes.

### Prompt context

See Step 1, including the request to use the REPL. The continuing lab workflow calls for a pedagogical vault article and durable access to the queries.

### What I did

Ran the exact JavaScript blocks from the staged article in session-b9e87186-b8e8-44b1-b4a9-cb7b6657fe3f on port 3795. Verified the portable ZIP byte-for-byte against the ticket. Published the article and the portable archive in go-go-parc.

### Why

The portable version should still support reconstruction after the temporary compiler and QEMU files disappear. The in-memory session remains accessible for immediate follow-up questions.

### What worked

The second example returned [264928,19477] for Typed and LLVM capacity reads. The event query cited the expected EarlyCSE stream digest and byte offset. Git confirmed vault main at af1caedef0fddda5db346101a4fa0087451326d6.

### What didn't work

The first push returned “main -> main (fetch first)”. I fetched the other author's unrelated Inkling report, rebased the single unpublished article commit on top of it, pushed without a force option and verified the remote head.

### What I learned

The portable replay can use the project's original trace service with a distinct pass archive. Its saved results are also readable independently as JSON.

### What was tricky to build

The reader’s session needs both the pass archive and the native and board tables. The distribution includes their original relative paths so the same loader works.

### What warrants a second pair of eyes

Check the physical comparison denominator and the caveat concerning the fast allocation pipeline, and verify that each timing claim concerns the isolated predicate.

### What should be done in the future

The ticket conclusion lays out two separate implementation experiments. No production compiler change was part of this investigation.

### Code review instructions

Start at the ticket analysis, the published vault note and scripts/05-cells.js. Capture/REPL checkpoint 38d3b75 and physical evidence checkpoint 5406b7b are the main repo references.

### Technical details

The diagnostic was removed and the original playable firmware verified. The vault article and its portable REPL bundle share commit af1caed.
