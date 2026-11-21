---
Title: Implementation and qualification diary
Ticket: PICOCALC-PIE-LOOPS
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T07:14:05.80882175-05:00
WhatFor: ""
WhenToUse: ""
---

# Implementation and qualification diary

## Step 1. Establish the source and select the region

The goal is to infer a packed arithmetic region in the ordinary ray-tracing loop while preserving its existing scalar consumer. I read the frontend tape, matched-row experiment, instruction semantics and inspector before designing the pass.

### Prompt Context

User request (verbatim):

> Ok, create a new docmgr ticket, Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.
>
>
> Then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)

The previous request fixed the algorithm and encouraged host comparison of assembly and intermediate information. I interpreted this as a compiler experiment with explicit treatment selection.

### What I did

Created the ticket, three tasks and the intern guide before implementation. Read the real numeric tape and the historical assembly. Assigned independent host and device qualification and separated region analysis from emission.

### Why

Earlier recognition pinned the whole function's operations. A subregion analysis can admit a changed function and reject an unsafe dependence. A matched scalar schedule provides a meaningful control for the packed instruction.

### What worked

The stock inspector exposed the inner loop and each checked buffer operation; the ray source already uses the unit induction and conditional consumer required by this proof.

### What didn't work

The sandbox does not show a /dev/serial/by-id directory. The device researcher will check the actual host before claiming hardware availability.

### What I learned

A successful packed subtraction can be decided from its unsigned lane value if the row term stays below signed saturation and only nonnegative results are observed. The source cell itself can span the full u16 range.

### What was tricky to build

Read-ahead changes the order of memory operations. Every scalar output must preserve the eight input values fetched early or force a fallback. The original scalar trap path is part of the semantic contract.

### What warrants a second pair of eyes

Induction updates, alias guards, sign recovery, private scratch alignment, trap order and values visible after the loop.

### What should be done in the future

Upload the guide, implement the optional pass and qualify both code schedules on unchanged source plus a held-out loop.

### Code review instructions

Begin with the ticket guide and inspect the source-level row and older vendor kernel before reviewing any generated words.

### Technical details

Software baseline 36964c4. The scalar oracle uses numeric i32 subtraction after a zero-extended u16 read. The native packed instruction is signed saturating subtraction.

## Step 2. Implement a checked subregion and freeze it for transfer

I wrote the region analyzer, emitter and inspector changes myself. The recorded scalar row now has one admitted loop at tape cell 172. The decisions for its two other loops identify the missing subtraction pattern. The candidate retains the checked original loop and the existing scalar code for a hit.

### Prompt Context

See Step 1. The user added (verbatim): “you know you should do the work yourself.” I stopped the preliminary helper reviews, including an independent fixture selection. They contributed feasibility and analysis observations without authoring the implementation. I took over the code, tests and device work.

### What I did

Added a per-function tape decoder entry, a separate optional pass, two lowering modes, loop facts in the JSONL inspector and instruction names in listings. Assembled the exact four encoding constants with ESP binutils. Uploaded the committed intern guide before writing the pass.

### Why

The group may only read ahead if a store cannot alter the input header or any prefetched cell. A conservative runtime test covers both different buffers and overlapping views. Keeping the stock loop also preserves tail behavior and error order.

### What worked

The vendor disassembler decoded broadcast, vector load, signed subtract and vector store at four independent PCs. The unchanged production scene yields a 1,688-byte experimental row versus 944 stock bytes. This is a static checkpoint before execution qualification.

### What didn't work

The guide's upload command initially returned a session while synchronizing its cloud tree. Polling returned success; no retry or overwrite was needed.

### What I learned

The hit body consumes arbitrary scalar operations. Replaying its original instructions lets a second program use a different scalar continuation without synthesizing a whole function template.

### What was tricky to build

The new lowering can emit a second copy of the continuation and later return to the original tape cursor. Its inspection ranges therefore carry both final code-segment labels and original input offsets. The induction slot must still be updated after every processed lane.

### What warrants a second pair of eyes

Mutable local bindings, shifted overlaps between buffers, trap behavior on a late lane and a miss value escaping the guarded arm.

### What should be done in the future

Run independent artifact decoding and whole-memory differential execution, then qualify matched targets on the P4.

### Code review instructions

Inspect typed-pie-loops.js, followed by the small optional dispatch in typed-rv32.js and the normal typed-inspect command with --pie-loops pie.

### Technical details

Guide checkpoint fd7cea6. Cloud receipt: OK: uploaded PicoCalc Inferred PIE Loops - Intern Guide.pdf -> /ai/2026/11/21/PICOCALC-PIE-LOOPS. Initial accepted plan maps the unchanged hit continuation to tape interval [207,292).
