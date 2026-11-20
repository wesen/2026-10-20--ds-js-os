---
Title: Continuation compiler investigation diary
Ticket: PICOCALC-CONTINUATION-G
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T23:29:34.829420161-05:00
WhatFor: ""
WhenToUse: ""
---

# Continuation compiler investigation diary

## Goal

<!-- What is the purpose of this reference document? -->

## Context

<!-- Provide background context needed to use this reference -->

## Quick Reference

<!-- Provide copy/paste-ready content, API contracts, or quick-look tables -->

## Usage Examples

<!-- Show how to use this reference in practice -->

## Related

<!-- Link to related documents or resources -->

## Step 1: Trace the request and completion contract

I started from baseline 289281c. The roadmap and Article 8 establish two boundaries for the compiler. A handler must give up control after a successful request, and every persisted continuation value must fit the reactor's WorldState record.

### Prompt context

The parent agent assigned G1 and G2, including production compiler integration, a focused ticket and intern design, host checks, a detailed diary, and a separate published report. The assignment described the production scope and set aside serial access for the parent agent.

### What I did

- Read Scope G, Article 8, the existing compiler entry points, and the earlier single-await experiment.
- Recorded lexical binding, liveness, static frame identity, and token dispatch in the design guide.
- Coordinated generated locals and reuse of expression type checking with the frontend implementer. The parent agent will supply SDK request metadata and load the new compiler module.

### Why

The experimental single-await implementation has enough information for one split but lacks nested call frames, structural loop cuts and a production link path. The shared expression emitter already enforces types and mutation rules. Reusing it avoids giving async functions a different expression language.

### What worked

The baseline RV32 and Wasm world entry points converge on the same typed frontend. Their thin linker wrappers can carry layout information while continuing to supply byte arrays to the loader.

### What did not work

No failures observed while inspecting the baseline and creating the ticket.

### What I learned

RV32 already limits function calls to eight argument registers. Passing every original parameter and another completion parameter to the generated step would lower the accepted source arity. The frame already has a word for the token. After a completion matches, and within that same handler turn, that word can carry the completion value to the step before the step clears it.

### What was tricky to build

A scalar name can refer to separate declarations in disjoint blocks. Tracking liveness by spelling alone would give the wrong result when the generated step hoists locals. Binding identity has to be established before liveness.

### What warrants a second pair of eyes

Review that generated reference slots can never be read before an original initializer and that cancellation leaves no active child frame capable of matching an old token.

### What should be done in the future

Implement the parser, backend-independent generation and host traces described in the design.

### Code review instructions

Start with Scope G and the typed-wasm compiler's FunctionEmitter. Compare those against the static layout and start/resume flow in the ticket's design guide.

### Technical details

Completion kind 4 carries event.token and event.ok. Source imports marked awaitable return an i32 token and produce a bool at the await site. WorldState has four bytes per scalar field and fits at most 80 fields.

## Step 2: Execute generated continuations on both targets

The first implementation lowered async straight-line code, conditional branches, counted loops, and nested waits. The common frontend checked ordinary expressions and compiled the generated source to both targets. The host harness drove the open task through a request and three timer completions and checked the entire record across an unknown or cancelled token.

### Prompt context

See Step 1 for the assigned scope. The parent requested a Git checkpoint of this implementation before reducing its compiler-time token storage.

### What I did

- Added the analysis pass and source generator in compiler/typed-async.js and exercised their production Wasm and RV32 entry points.
- Created 14-check-async-layout.mjs with a deterministic SDK fixture. Ran it in Wasm, streamed RV32 and buffered RV32 modes.
- Compiled the staged Editor source with the application implementer. The generated open-only variant had 72 WorldState fields and the combined variant had 71.

### Why

The same assertions should cover both backends, including a second matching attempt on a consumed token and resuming with a different ambient output buffer address. The open example also needs a comparison to the expected normalization result for the entire 10,000-unit input.

### What worked

Every engine handled 27 delivered events, normalized 10,000 units, and issued exactly four tokens for the open task. The fixture also verified nested caller routing, opposite completion order, immediate request failure, the scalar frame limit and awaited call type errors.

### What did not work

The first compiler smoke failed at `3:29: unknown type Phase`. The generated WorldState then contained an enum-typed spill field before the enum declaration. Generated frames now use i32 storage for enum and distinct values and restore the compile-time type through an internal conversion.

The first test invocation failed with `Error: spawnSync git EPERM` in the sandbox even though Git produced stdout. The harness receives the optional baseline via an extracted Git tree and has no Git subprocess. An initial byte control used the Editor world entry points for Files and then concatenated Agenda's fragments in the wrong order. Files and Agenda now use their own production wrappers and Agenda lists reminder.typed first.

### What I learned

The baseline Editor has locals named start and pending, and Agenda even has a record field named start. The task operators therefore recognize these spellings in their syntactic forms and continue accepting ordinary local and field uses.

### What was tricky to build

A nested task returns an enum synchronously or after an arbitrary number of reactor waits. The same word passes through both paths, and a parent receives it only after its child's state becomes idle. More than one incoming await site within a task needs a saved caller selector.

### What warrants a second pair of eyes

Check that the dispatcher walks upward after a child finishes and stops when a parent immediately starts another wait. Inspect transpiler memory use on the full Editor source.

### What should be done in the future

Replace the full-source token array with a span scan before the physical compile run.

### Code review instructions

Run `node ttmp/2026/11/19/PICOCALC-CONTINUATION-G--*/scripts/14-check-async-layout.mjs`. Pass an extracted baseline repository directory to run the linked byte comparisons as well.

### Technical details

The layout for the open example has five fields. The read wait saves no local values. The yield wait saves length, read and written. There is one separate readHelper frame in each started task, and the nested task's helper frame has a caller field because two await sites reach it.
