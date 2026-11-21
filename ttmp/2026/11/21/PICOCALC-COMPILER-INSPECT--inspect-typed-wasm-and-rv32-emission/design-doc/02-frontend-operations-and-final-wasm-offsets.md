---
Title: Frontend operations and final Wasm offsets
Ticket: PICOCALC-COMPILER-INSPECT
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Observer, numeric and encoded tape snapshots, and final Wasm module offsets
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Frontend operations and final Wasm offsets

Install an observer through the existing compiler options. Use an exact function name to avoid collecting a whole program when reading one body.

```javascript
const events = [];
const program = typedWasm.compile(source, {
    inspect: {
        function: "typedRayInShadow",
        emit(event) { events.push(event); },
    },
});
```

The shared frontend emits a `frontend` event before invoking the numeric function consumer. The event includes the function name and index, parameter types and result type, named locals and final ordered operations. Named locals include scoped declarations whose name is out of scope when the body finishes. A temporary slot receives a count within `localCount` and no invented name. Parameter source positions are null because the body emitter installs parameters before it seeks to the function body.

An operation contains `ordinal`, `offset`, `length`, `op`, `opcode`, `operands` and `source`. The ordinal starts at zero per function. On the RV32 path the offset and length count numeric tape cells. On the Wasm path they count encoded bytes from the first instruction, excluding local declarations. Operands in Wasm events are decoded from the actual byte sequence. A call or local index can use several bytes, and a signed constant must be sign-extended when its encoded representation ends.

## Record available source coordinates

The source anchor describes the token active at the time the emitter appended the operation. It can be the token just after an expression, punctuation, or an empty token at the end of a body. The precision label `emission-token` is part of the contract. The event supplies a lexical context for the instruction without claiming a full syntactic range.

Offsets are half-open UTF-16 positions. An unchanged ordinary body indexes the original input. Async lowering can instead emit a rewritten body or a synthesized helper. Those anchors have unit `generated`, distinguish their origin, and index the exact `sourceText` carried in the event. Diagnostic remapping remains a separate mechanism.

A counted loop temporarily emits its update into a buffer before parsing its body. When the update moves to the loop tail, the observed tape moves its source anchors with it. The event's ordinal follows final emitted order.

## Find the real Wasm instruction bytes

The standalone Wasm module has a code section whose body lengths include local declarations. The body's end minus that function's instruction byte count is the executable start. After building the actual module, read its section and body lengths, then add each frontend byte offset to that start. The `emission` event reports `start`, `end`, `instructionsStart` and operation ranges with `ordinal`, `start`, `end` and `bytes`. The range represents bytes from the final returned module. When the real compiler changes the width of a prior section or body size, these offsets follow it.

The shared frontend can also be called directly or through a Wasm world linker. The standalone `compile` entry provides the final code-section placements. Numeric operations have no Wasm module addresses. Their mapping to native image offsets belongs to the RV32 emitter.

## Preserve the unobserved compiler

An ordinary function uses the existing array and emission paths. The inspector allocates the tape spans, local list and decoder table only when it instruments a selected function. The numeric body is a plain array again before RV32 lowering and follows the existing streaming lifetime. The compiler holds a private copy of each Wasm operation's ordinal and length so editing a callback event cannot change later byte placement. Callback exceptions propagate under their original identity, independently of async syntax recovery.

Compare both targets with the pre-inspection compiler. Test multi-byte positive and negative values, the final bytes from the actual module, moved loop updates, different async origins, and a missing filter. [Baseline receipt](../various/frontend/baseline.json)
