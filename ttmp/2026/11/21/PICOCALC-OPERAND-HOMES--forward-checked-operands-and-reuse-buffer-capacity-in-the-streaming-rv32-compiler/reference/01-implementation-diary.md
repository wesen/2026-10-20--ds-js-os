---
Title: Implementation diary
Ticket: PICOCALC-OPERAND-HOMES
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
LastUpdated: 2026-11-21T18:42:55.849328164-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation diary

## Step 1. Design the native location contract and deliver it

I traced a constant buffer index from the frontend into the framed scalar emitter. A separate PIE emitter accessed the same locals directly. I documented how to give both paths one interface before assigning registers.

### Prompt context

> ok, create a new docmgr ticket for all this, Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
> then implement it, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill) and  write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).
>  Commit and push the bsidian vault when done (go-go-parc vault).    when done

I interpreted this as a research implementation with independently measurable opt-in controls and source-identical hardware trials.

### What I did

Created the ticket with docmgr. Wrote the intern design before editing the compiler. Uploaded it with remarquee upload bundle. Introduced readLocal and writeLocal, including PIE reads and writes and incoming parameter setup. Committed c62352d.

### Why

A register home is correct only if every consumer of the local agrees on its location. Both a versioned guide and a separate no-policy checkpoint make the semantic boundary reviewable.

### What worked

The reMarkable cloud confirmed delivery of “Typed RV32 operand locations - intern design guide.pdf” to /ai/2026/11/21/PICOCALC-OPERAND-HOMES. The new control matches the previous full optimized ray image digest.

### What didn't work

An initial parallel shell-read wrapper had a misplaced map invocation. I corrected it before making changes.

### What I learned

A compact checked-address opcode already exists. The new optimization can consume that opcode directly.

### What was tricky to build

A scalar fallback embedded inside a specialized packet function shares its register reservation convention. The initial implementation keeps packetized functions on their established layout.

### What warrants a second pair of eyes

Verify the checked store address is computed before the assignment's right-hand side.

### What should be done in the future

Qualify scalar forwarding and persistent register homes before specializing packet register reservations.

### Code review instructions

Start at FunctionCode.checkedAddress and NumericFunctionEmitter.codeUnitAddress.

### Technical details

The baseline includes pie-empty selection and inlineGuardedReturns enabled.

## Step 2. Implement single-consumer forwarding and persistent homes

I implemented three independently selectable policies. The pass decodes one function tape, counts actual uses including implicit index/receiver operands, identifies entry-dominated capacity reads, and ranks local homes using bounded register availability.

### Prompt context

See Step 1. The goal is to improve generated code without changing the application algorithm.

### What I did

Forwarded adjacent synthetic index assignments, folded eligible constant reads into a signed twelve-bit displacement, kept one capacity in a7, and assigned selected whole-function locals to otherwise unused argument registers. Implemented tests against WebAssembly, plus a permanent emitted-code regression and five full native frame traces.

### Why

Caller-saved registers give a simple first design when the generated function contains no ordinary call and no packet kernel. Pins are fixed across the function, so control-flow edges need no register moves.

### What worked

All 18 compiler tests passed on the host. All 2,304 native-vs-Wasm comparisons passed across eight policy combinations, including aliased buffers, traps, side effects, deep expressions, reassignment and repeated loop iterations. The opening-frame interpreter matched the original observable memory digest in all five arms.

### What didn't work

The first reassignment fixture attempted to assign an immutable parameter. The frontend reported “expected mutable local b”. I changed it to a mutable local initialized from b. Restricted execution also prevented the inspection CLI tests from spawning a process. The same suite passed on the host.

### What I learned

Header reuse removes exactly 245,451 loads on the natural opening workload. Forwarding removes stack traffic even on functions ineligible for capacity caching.

### What was tricky to build

The stack is already live when a computed index arrives. Consume it once without overwriting earlier expression registers. A cached capacity must be established on a mandatory path; optional branch-only reads remain ordinary.

### What warrants a second pair of eyes

Check signed index handling, the displacement limit, real calls versus inlined helpers, and conservative memory-effect rejection. Look at full-frame and cold results separately from isolated instruction counts.

### What should be done in the future

Measure each policy on a physical board and retain the deployment tradeoffs.

### Code review instructions

Read the test scripts alongside the local use count, workspace register selection and readLocal/writeLocal implementation.

### Technical details

Each profile executes the entire frame in the RV32 interpreter. The ABI and output are independently checked by the device trial. The compiler options are operandLocations.forward, operandLocations.capacity and operandLocations.homes.

## Step 3. Replay the physical compiler, measure runtime and publish the result

### Prompt context

The requested outcome included implementation evidence, a report for new students and a committed vault publication. The measurement question was whether lowering the same Typed program changed physical execution.

### What I did

Staged the five-mode diagnostic with scripts/01-board.py. Used the previously verified playable ESP32-P4 image for the restore. Captured rotating six-block trials and cold compiles, retaining the compressed serial log, image manifest, restoration receipt, normalized rows and REPL query. Wrote the pedagogical report after inspecting the paired results.

### Why

Forwarding and capacity reuse can eliminate different instructions. Separate treatments distinguish them. Physical results and independent Wasm comparisons address timing and semantics separately.

### What worked

Script 04 imported 768 predicate rows, 1,296 frame-stage rows, 72 chess rows and 180 compiler metrics. Script 06 evaluated the query in a new persistent sandbox. The P4 restored the original playable firmware digest and eight worlds were present after boot. The all-options treatment won all six opening-frame pairs.

### What didn't work

A preliminary text-mode read of the raw UART capture raised UnicodeDecodeError on boot bytes. The importer preserves the original bytes and decodes with replacement for the line protocol. The checksum uses the original bytes.

### What I learned

Opening-frame time fell by 13.17% and predicate cycles by 27.55%. Cold compilation increased by 37.36%. The 851,168-byte allocator peak did not move. That gives applications with many frames and applications that compile frequently different reasons to opt in.

### What was tricky to build

Arm numbers have different offsets for predicates, complete frames and cold builds because the C controls participate in different trials. The query checks for exactly six distinct blocks before computing a paired percentage.

### What warrants a second pair of eyes

The 136-byte LLVM reference from the preceding study and this visit's checked C cycle reference describe different measurements. The complete scalar C frame is a third comparison. Keep these denominators explicit.

### What should be done in the future

Profile tape decoding and fact collection on the device. Test the same policy through a frontend-supplied summary with identical image hashes and cold compile timing.

### Code review instructions

Review the physical image manifest against the host profiles, then compare scripts/04-import.py and 05-query.js with the serial protocol. Recreate the result from the committed rows with python3 scripts/06-repl.py.

### Technical details

The cold ray control generated 10,268 bytes in 298.272 ms. The combined treatment generated 9,540 bytes in 409.746 ms. The digest-verified diagnostic and the restored image are identified separately in various/receipt.json.
