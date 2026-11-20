---
Title: "A compiler proof of the values that survive a wait"
Ticket: PICOCALC-EG-QUAL
Status: review
Topics:
    - picocalc
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Independent Opus High analysis checked against the implementation and its recorded experiments."
LastUpdated: 2026-11-20T00:00:00-05:00
WhatFor: "Read with the implementation team's compiler and application measurements."
WhenToUse: "When studying the completed E and G compiler phases."
---

# A compiler proof of the values that survive a wait

## 1. Problem Statement

The PicoCalc Editor runs on an ESP32-P4 microcontroller. Its application logic is written in a typed language with functions, `await` at supported statement sites, and SDK calls such as `typedSdkFileRead` and `typedSdkYield`. The compiler, implemented in `picocalc-os/compiler/typed-async.js`, targets either Wasm or RV32 machine code. It runs inside vendor QuickJS with a 4 MiB heap limit and a six-second deadline.

The question is how to express asynchronous file I/O and multi-step normalization when all inter-turn state must fit in a flat, persistent record with a fixed word budget. The answer is a **source-to-source state-machine transform**. Each async function is rewritten into an ordinary typed function whose persistent state occupies fields in a typed **WorldState** record capped at 80 scalar 32-bit words. Each invocation uses its execution stack until it returns. The task saves the required continuation data in WorldState. The two async compiler APIs (`typedAsync.analyze`, `typedAsync.rewrite`) consume source plus the SDK descriptors from `typed-world.js`, and the rewritten ordinary typed functions are compiled to Wasm or RV32 by the same backend that handles synchronous code.

## 2. The Turn Model

Each turn, the outer `typedWorldEvent` handler receives an event and directs it to the generated `resume()` dispatcher for the appropriate async root. The dispatcher advances the state machine only when the delivered token is positive and matches the single outstanding request token. Four arguments supply the context of the current turn.

- **`event: WorldEvent`** — `kind` (i32), `token` (i32), `ask` (bool), `ok` (bool). A completion has kind 4. The Boolean `ok` indicates success or failure. The task retrieves file contents through the SDK.
- **`state: WorldState`** — a persistent typed record. Its backing memory survives across turns. The original synchronous Editor used 71 fields. The async migration produces 57 declared + 13 generated = 70.
- **`output: buffer`** and **`hints: buffer`** — fresh per-turn views.

When the dispatcher receives an unmatched token (unknown, stale, or duplicate) it returns without advancing state. The dispatcher fixtures compare the whole record before and after this call. The language supplies an explicit `cancel` operation.

## 3. The State-Machine Transform

Each suspension site becomes a **resume point** with an integer label. The generated code uses ordinary guarded if-tests and loops to select the resume label. This excerpt shows the fixture with its normalization body abbreviated.

```
async function openFile(handle: i32, state: WorldState): i32 {
  const ok = await typedSdkFileRead(handle);
  if (!ok) return 0;
  const length = state.docLength;
  let read = 0;
  let written = 0;
  while (read < length) {
    // reacquire typedSdkBuffer(0), normalize up to 4096 UTF-16 units,
    // update read and written
    await typedSdkYield();
  }
  state.normalized = written;
  return 1;
}
```

The following pseudocode gives symbolic names to the pending request and continuation labels. The generated dispatcher performs the token check before entering the task step. A separate field holds each value selected by the liveness analysis.

```text
on_start(handle):
    issue file read using handle
    save outstanding token and continuation AFTER_READ
    return to kernel

on_resume(event):
    if event.kind differs from 4 or token does not match an active request:
        return false
    consume the matching token
    if continuation is AFTER_READ:
        if the read failed: finish the task
        initialize length from docLength and both positions to zero
    if more input remains:
        normalize up to 4096 units in the SDK document buffer
        issue a yield and remember continuation AFTER_SLICE
        return to kernel
    store final normalized length and finish the task
```

Recursion is rejected, including cross-boundary cycles, so the call graph is a DAG and frame sizes are statically known.

## 4. Liveness Analysis and Frame Allocation

The compiler determines which variables are **live across** each resume point. A read in a loop condition after resumption makes its input live. A value last read before the wait can die at that point. The implementation (`liveBefore`/`liveSequence` in `typed-async.js`) works recursively over structured statements with repeated backedge stabilization for loops, iterating until no live set at any backedge changes.

The `openFile` fixture saves zero user locals at the initial `typedSdkFileRead` await. The SDK request consumes `handle`, and the fixture has no later read of it. At the `typedSdkYield` await, **`[length, read, written]`** are saved because all three are read on the next iteration. Frame allocation is static and per-root. Separate root instances sharing a helper get separate fixed fields. A helper's `caller` disambiguation field is generated only where multiple call sites require it. A transient buffer or string that would cross an `await` is rejected at compile time.

## 5. Event Trace for 10,000 UTF-16 Units

The 10,000-unit normalization test issues exactly four requests with tokens 1 through 4. Each completion event carries `kind = 4` and `ok = true`.

**Turn 1.** The function issues `typedSdkFileRead(handle)`, receives token 1 and returns to the kernel. The initial continuation needs no user locals.

**Turn 2.** The event has kind 4, token 1 and a true success flag. The dispatcher consumes the token. The task initializes length to 10,000, normalizes its first slice, and issues token 2 through `typedSdkYield()`. It saves the length and its input and output positions.

**Turns 3 and 4.** Tokens 2 and 3 each return control to the normalization loop. Each completed slice issues another yield, producing tokens 3 and 4 in order.

**Turn 5.** Token 4 completes. The next loop test sees the input position at the document length. The function stores the normalized length and finishes.

If a stale token (say token 2 again) arrives after turn 3, the dispatcher returns without changing state.

## 6. Real Editor Differences

The real Editor task in `worlds/editor/editor.typed` retains `handle` for ownership management, so its live set at normalization waits is `[handle, length, read, written]`. Real Find saves `[at, end, anchor, foldedAt, phase]`. The full Editor uses 70 of the 80-word ABI cap. The pending title length occupies spare code unit 95 of an existing buffer. The word count measures the record ABI. Layout receipts are in `PICOCALC-EDITOR-ASYNC/various/06-checkpoint-layouts.jsonl`, checked by `PICOCALC-CONTINUATION-G/scripts/14-check-async-layout.mjs`.

## 7. Measured Compiler Performance

The following timings come from QuickJS on the workstation. The raw RV32 clock stops before final linking and module loading.

**Comparison 1: whole-module tokens vs. spans, staged full G4 input.** The whole-module token representation (commit `62d829f`) exceeded the 4 MiB heap limit. Under an 8 MiB ceiling for measurement, the transition to spans reduced median rewrite time from 93.141 to 34.739 ms, median raw RV32 generation from 205.218 to 139.184 ms, and peak tracked allocation from 5,720,480 to 2,653,592 bytes. The span version fits within 4 MiB.

**Comparison 2: span compiler vs. final compiler, same pinned input.** Alternating runs on one host core with input pinned by `ea6354bd`, span compiler `0f23617` vs. final compiler `2e4fee1`: rewrite median 28.915 → 23.597 ms, raw RV32 median 103.558 → 97.939 ms.

**Comparison 3: synchronous E6 source, different input.** Synchronous E6 source through the final compiler measured 80.877 ms. This input differs from comparisons 1 and 2.

## 8. Behavioral Verification

Schedule semantics are verified by 29 deliveries on each of Wasm, streamed RV32, and buffered RV32. Tests cover stale/duplicate completion, nested/shared calls with two parents, immediate nonpositive request failures, lexical shadowing, and known WorldState record equality before and after unknown and canceled deliveries. Artifacts of the original synchronous Files, Agenda, and Editor are reproduced byte-for-byte. The busy-start fix (commit `2e4fee1`) preserves exact Editor ELF and Wasm bytes versus the first full migration, on a fixed reactor. Reference scripts: `PICOCALC-CONTINUATION-G/scripts/14-check-async-layout.mjs` and `15-benchmark-quickjs.c`.

The implementation team supplied the measurements for this independent article. The companion ticket is `PICOCALC-CONTINUATION-G`. [Verified inputs](../sources/verified/continuations.md) · [Researcher's investigation diary](../reference/03-independent-continuations-diary.md)
