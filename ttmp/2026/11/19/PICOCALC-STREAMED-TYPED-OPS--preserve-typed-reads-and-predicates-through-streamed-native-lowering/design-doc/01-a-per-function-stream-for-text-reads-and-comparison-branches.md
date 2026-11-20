---
Title: A per-function stream for text reads and comparison branches
Ticket: PICOCALC-STREAMED-TYPED-OPS
Status: active
Topics:
    - picocalc
    - compiler
    - research
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Pre-implementation protocol and acceptance criteria for a native-only typed operation stream."
LastUpdated: 2026-11-19T21:54:07.686943504-05:00
WhatFor: ""
WhenToUse: ""
---
# A per-function stream for text reads and comparison branches

The RV32 compiler at dbe26be uses the shared typed parser to produce one numeric stack program at a time. The staged research backend applies deferred operands, comparison fusion, short branches and smaller frames to that program. A text read has already become a temporary local, a length load and an unsigned comparison by the time the native backend sees it. A scalar comparison emitted by the parser reaches the backend as a Boolean computation whose branch consumer the backend must infer.

## Three frozen variants

Reconstruct the designated staged lane with the prior study's script and patches from dbe26be. Measure that control against two variants which preserve the same typed operations through the function callback.

| Variant | Frontend stream | RV32 consumer |
| --- | --- | --- |
| Staged control | Existing numeric cells | Existing staged lowerer |
| Typed observation | Numeric cells and two typed operations | Expand the typed operations into the exact original cells before invoking the staged lowerer |
| Direct read | Numeric cells and the same operation vocabulary | Consume text reads in the lowerer, keeping the original projection for predicates |

The operation for a text read identifies the receiver binding, whether its header is a string length or buffer capacity, and the temporary used by the original projection. Its input is the evaluated i32 position already on the operand stack. Its result is one zero-extended UTF-16 code unit. In the direct variant the temporary is unnecessary. The receiver is loaded after argument evaluation, matching the existing frontend's order. The direct lowering loads the four-byte header, compares the index with unsigned `bltu`, falls through to `ebreak` on failure, and loads the code unit at `receiver + 4 + 2*position` on success. The address calculation uses two scratch registers and leaves values at lower operand depths intact. A negative i32 fails the same unsigned bound.

The comparison event identifies a scalar operator, a branch consumer, its structural argument and whether the predicate is inverted. It comes from a typed expression followed by a real control consumer. Boolean values, including Boolean variables, keep the current stack semantics. The observation projection reproduces the original comparison and control cells, allowing the existing peephole to choose identical machine instructions.

Use integer tags outside the numeric opcode space. Scan the stream by instruction boundaries when projecting an event because ordinary operands can have the same numeric values as the tags. Release the numeric stream after lowering has consumed the function. Preserve the ordinary Wasm frontend and buffered RV32 mode as behavioral controls. Keep the study under this ticket and expose the variant transform to the combined compiler experiment.

## What the trial measures

1. Compare complete RV32 images, entry maps, relocations, record layouts, and function signatures for Files, Agenda, Editor and purpose-built edge fixtures. Hash complete linked ELFs where the reactor input is fixed. Run the professor's staged replay matrix through the supervisor.
2. Record per-function operation counts, stream cells and the maximum function stream size. Treat these as measurements of representation size. Use repeated fresh QuickJS contexts and heap sampling on ESP32-P4 to measure actual compile latency and peak heap.
3. Compare direct-read native size with the observed lane. Execute identical guest workflows. Check, in particular, indices zero, length minus one, length, negative one and the signed endpoints, high UTF-16 values and a call used to compute the position. Exercise deep operand stacks, both receiver kinds, both branch destinations and short circuit.
4. Separate compile latency from guest cycles. Match the reactor reservation, compiler inputs and replay between lanes. Accept an optimization only when native results and traps agree and the byte and timing report identifies each observed cost.

If allocation changes move the peak between parsing and assembly, retain the phase and total high-water measurements. If the board cannot run a lane, record the exact stage and report the physical comparison as incomplete.
