---
Title: Typed await and the lifetime of a PicoCalc continuation
Ticket: PICOCALC-CONTINUATION-G
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-async.js
      Note: Lexical analysis, frame allocation, and source generation
    - Path: repo://compiler/typed/typed-wasm.js
      Note: Shared type checking and staged emission
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T23:29:34.491932038-05:00
WhatFor: ""
WhenToUse: ""
---

# Typed await and the lifetime of a PicoCalc continuation

## Executive Summary

<!-- Provide a high-level overview of the design proposal -->

## Problem Statement

<!-- Describe the problem this design addresses -->

## Proposed Solution

<!-- Describe the proposed solution in detail -->

## Design Decisions

<!-- Document key design decisions and rationale -->

## Alternatives Considered

<!-- List alternative approaches that were considered and why they were rejected -->

## Implementation Plan

<!-- Outline the steps to implement this design -->

## Open Questions

<!-- List any unresolved questions or concerns -->

## References

<!-- Link to related documents, RFCs, or external resources -->

## A file read spans two handler invocations

The PicoCalc reactor starts a file read and returns a positive integer token. The world returns control to the nucleus, which can schedule another world or deliver other events while the storage request runs. A later event with kind 4 presents the token and a Boolean success flag. A nonpositive token means the request failed before a completion could be scheduled.

A continuation is the remaining computation and the data it will read. In this example its first instruction tests the result of the read. If the read succeeds, it adds the saved amount to an application field.

```typescript
async function addAfterRead(state: WorldState, handle: i32, amount: i32): i32 {
    const ok = await typedSdkFileRead(handle);
    if (!ok) return 0;
    state.total = state.total + amount;
    return state.total;
}
```

The compiler gives the task a frame, a fixed group of fields in the persistent WorldState record. This frame has a wait number, a token, and one field for amount. The request uses handle before suspending. The completion supplies ok and the reactor supplies the current state. Saving amount preserves the value from the original invocation even if the application changes other state during the wait.

## Analysis and source generation

The lowering pass identifies async signatures and collects their call edges. It parses their block structure and asks the normal typed frontend to check the ordinary expressions and statements. A binding is one particular declaration or parameter. Distinct declarations with the same spelling in disjoint blocks have distinct identities, and generated local names preserve those identities when declarations move.

A binding is live where some later path can read its current value before overwriting it. A backward analysis joins branches, accounts for returns and loop exits, and iterates loop heads until no live set grows. At a wait, the awaited expression uses its arguments immediately. The result assignment happens at completion and removes the target's old value from the saved set. A string or buffer in that set produces a diagnostic at the original wait. An ambient reference, such as state or output, is a handler parameter with a known name and type. The next event supplies it again. Reading through that reference on resume observes the current event or buffer.

The rewriter inserts frame fields after the application's declared WorldState fields. It emits ordinary typed statements for saves, loads, branches and waits and preserves structured loops that have no suspension in their body. A generated program counter selects the next piece within the invocation. A wait number selects a piece across invocations. Only the frame lives across an event boundary. The existing typed frontend compiles the generated source to Wasm or supplies the RV32 emitter, and the world linker checks that the combined record fits its 80-field ABI.

## Nested waits and token dispatch

Starting a task calls its root step if its root frame is idle. A busy start returns false and leaves the active task in place. An awaited helper receives a separate static frame for every root task that can reach it. Within one root, the absence of recursion means only one invocation of the helper can be active at a time. If the helper has several incoming await sites in that task, the compiler assigns a number to each site and stores the current one in a caller field. An immediate return needs no waiting state. If the helper suspends, the parent records its wait and holds token zero while the helper holds the reactor token.

The dispatcher first finds a positive token on an active frame. It starts the matching step with the event's success flag. If that step completes, the dispatcher follows its caller and delivers the typed value, continuing until a step waits again or the root returns. A pending query reads task status. Cancellation clears the task's frames and invalidates future matching of its old token. The application still owns any reactor resource that requires an explicit release.

## Validation

The host fixtures cover the save set for a wait inside a loop, reassignment after a wait, nested helpers, two tasks receiving completions out of order, immediate request failure and cancellation followed by a stale completion. A miniature reactor supplies deterministic tokens and lets the same expected state transitions run against Wasm and RV32. Compile-time cases exercise reference rejection, misuse of await, cycles, type checking and the record limit. The existing sync-world compilation is the control for byte identity. Editor integration and physical timing belong to their corresponding workflow receipts.
