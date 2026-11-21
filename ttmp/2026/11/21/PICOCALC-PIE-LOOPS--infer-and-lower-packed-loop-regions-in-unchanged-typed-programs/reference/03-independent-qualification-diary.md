---
Title: Independent packed loop qualification diary
Ticket: PICOCALC-PIE-LOOPS
Status: active
Topics: [picocalc, compiler, performance]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Blind fixture selection and chronological independent differential qualification."
LastUpdated: 2026-11-21
WhatFor: Reproduce qualification separately from the implementation of packed loop lowering.
WhenToUse: Reviewing the held-out case, path behavior, output identity and performance claims.
---

# Independent packed loop qualification diary

## Step 1. Commit the held-out selection before implementation

I selected one complete scalar Typed loop from a different application problem and froze its text, normal input, performance criterion, counterexamples and a random nonce. The selection was made before the compiler change was implemented. The digest of the UTF-8 selection document, including its terminal newline, is `1440aa8c604781122bb7d59d06e7d381946ef6f157fc4b7b046c31e6bd88ba3e`. The director received the digest. The fixture's identity stays private until both loop analysis and emission are frozen.

### Prompt Context

The director assigned the independent qualification lane: “Under the existing lab workflow, please independently preselect a held-out Typed loop for performance and counterexamples and prepare to own the host differential qualification of the new PICOCALC-PIE-LOOPS pass (real unchanged ray, complete 12-pose outputs via appropriate harness, traps/partial writes/misalignment/tails/65535/overlap/edited source; vendor disassembly, Wasm/oracle, dynamic counts). Do not tell me the held-out actual function until after analysis and emitter are frozen. For now only measure/review existing harnesses and select the cases; await guide upload/signal before implementing.”

### What I did

Inspected the existing twelve-pose portable C oracle, prior packed-row vendor disassembler and generic RV32 interpreter, full-frame harness and buffer boundary cases. Selected the primary hold-out and declared how to treat a compiler decline.

### Why

A held-out positive result would show transfer beyond the training renderer. A declined case also tests the claimed scope, provided its original form and selection rule are retained.

### What worked

The independent C oracle already supplies RGB565, nearest depth, IDs and stride padding for twelve poses. The packet interpreter independently consumes vendor disassembly operands and models eight signed saturating lanes, alignment and stack preservation.

### What didn't work

The old runner's 64 KiB arena cannot fit all three full frame planes, particularly with stride 320. The earlier packed-frame experiment established how to enlarge only the host model's arena while leaving guest code intact.

### What I learned

Only the actual compiled instruction path can establish that the candidate used vector operations. A matching image could result from scalar fallback everywhere.

### What was tricky to build

A blinded commitment must include enough detail to prevent changing the fixture after a decline. I froze the source, a canonical input, the counterexample set and the interpretation together under one digest.

### What warrants a second pair of eyes

Verify the commitment preimage at disclosure. Check intermediate buffer mutations on traps and verify that full-frame runs use the unchanged renderer source.

### What should be done in the future

After the guide handoff, implement qualification independently of compiler logic, then await a frozen compiler pair before disclosing the held-out fixture.

### Code review instructions

Inspect the previous `PICOCALC-TYPED-RAY/scripts/renderer/01-reference.c`, `PICOCALC-TYPED-PIE/scripts/review/packed.mjs` and `PICOCALC-SCALAR-BREAKDOWN/scripts/compiler/frames.py` for the qualified reference components.

### Technical details

The comparison will keep stock RV32, matched scalar lowering and packed lowering distinct and will explicitly record both program selection and dynamic packet execution on the primary input.
