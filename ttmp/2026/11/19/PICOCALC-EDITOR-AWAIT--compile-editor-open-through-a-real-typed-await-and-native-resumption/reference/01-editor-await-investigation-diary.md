---
Title: Editor await investigation diary
Ticket: PICOCALC-EDITOR-AWAIT
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Chronological compiler, host and device investigation for one real Editor await.
LastUpdated: 2026-11-19T22:11:51.637166756-05:00
WhatFor: ""
WhenToUse: ""
---

# Editor await investigation diary

## Step 1: Trace the real file-read wait and preregister the trial

I traced Editor Open from the Files ask to the native read and through the settlement dispatcher. The experiment covers that read in typed source and resumes into the existing normalization policy. I designed a physical cancellation stimulus after finding that the kernel serializes the Editor's normal mailbox while its first turn remains open.

### Prompt Context

**Study specification (verbatim):** “Compile one real await end to end. Scope G. Take Editor Open from typed source through suspension and native resumption. Determine which locals must survive the wait, generate the continuation, then compare it with the hand-written implementation on success, failure and cancellation. Record saved fields, frame bytes, code size and compile time. One complete workflow is a substantial result; Find supplies a later independent test.”

**Assistant interpretation:** Compile the real `typedSdkFileRead` in an isolated firmware and qualify the emitted native continuation when normal file events arrive.

**Inferred user intent:** Measure a single vertical slice while preserving enough evidence to judge whether the same mechanism is suitable for later normalization and Find waits.

### What I did

- Traced `editorOpen`, `editorReadDone`, `nw_on_event`, `native_call`, `fs_defer` and `nat_settle`.
- Read the larger scope G design and the independent Opus High review. I adopted its stale-completion and buffer-lifetime checks. The pilot uses the kernel's existing positive tokens and epoch gating.
- Wrote the [preimplementation design](../design-doc/01-compiling-a-typed-editor-open-into-a-start-and-a-native-continuation.md), including the injected cancel boundary and runtime assumptions.

### Why

The actual disk-control path and imported SDK operations need to execute through the generated code. A mock backend alone cannot establish that a cold device compile preserves that integration.

### What worked

The architecture trace found a single source-level suspension point before the existing normalization slices. The five state values that drive normalization remain in place, leaving the experiment's liveness inference to choose the continuations' saved handle and title length.

### What didn't work

No implementation or trial ran in this design step. The source inspection showed that a normal second mailbox message cannot race a suspended Open turn: `kernel.c` excludes that mailbox while `W->in_turn` is true. The test explicitly injects a cancel event at the loaded native handler boundary.

### What I learned

A positive token identifies one kernel file request and occupies the generated frame. The kernel checks the destination world's epoch before delivering a later result. A file handle is a scalar used after the wait, whereas an event buffer is supplied fresh on the resumed turn.

### What was tricky to build

Cancellation must release the offered grant and clear the frame while allowing the already prepared file operation to settle harmlessly. Changing the normal scheduler merely to make the test easier would prevent a fair comparison of the two app paths.

### What warrants a second pair of eyes

Inspect how the generated code distinguishes immediate failure from a failed settlement and how the native probe ensures one cancellation stimulus cannot select a user file.

### What should be done in the future

Use the observed frame and compile costs to determine whether another study should lower normalization's loop waits and Find.

### Code review instructions

Start at the sequence diagram, then read the linked foreground `editorOpen` and `typedWorldEvent` implementation and the kernel's conditions for choosing a world event.

### Technical details

The existing `WorldState` has 71 fields and the runtime allows 80. The prospective generated frame is 12 bytes. It is separate from the still hand-written normalization continuation.
