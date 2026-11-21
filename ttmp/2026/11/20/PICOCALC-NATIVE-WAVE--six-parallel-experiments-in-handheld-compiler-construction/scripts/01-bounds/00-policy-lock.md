---
Title: Select redundant bounds-check analysis while streaming
Ticket: PICOCALC-NATIVE-WAVE
Status: active
DocType: design-doc
Intent: long-term
Topics: [picocalc, esp32-p4, performance, native]
---

# Select redundant bounds-check analysis while streaming

The native compiler receives a checked function after the shared frontend parses it. Its numeric instructions explicitly check a position against the UTF-16 capacity before computing the address. A second access at the same position can reuse an earlier successful check when both use the same buffer and position and nothing in between can change that relation. The study charges an analysis only while the current function is available. It keeps no function bodies for a second pass over the program and uses the ordinary RV32/Wasm paths as controls.

## Proof and invalidation

Recognize the numeric instruction sequence for the original bounds guard. Accept only a checked position temporary whose reaching definition directly copies a local or constant. Distinguish immediate constants from local versions. A proof key contains the current receiver binding and the position identity. A repeated guard in the same straight-line region may be replaced by an unconditional continuation. The address calculation and subsequent operation remain unchanged. A guard can trap, so an unexecuted, bypassed, or invalidated check supplies no fact.

Discard cached checks on structured control, branch, return, call, and every memory write. State from one loop iteration cannot carry into the next. Numeric temporary identities originate in the same straight-line decode segment and are cleared with the proofs. Every local assignment advances its defined identity. An assignment to a position or receiver invalidates keys based on its prior version. The parser and native backend still validate their normal input. If the auxiliary decoder cannot understand an instruction, discard the function's analysis result and use that function's ordinary body. Raw ABI pointers outside valid Typed objects are beyond this proof.

## Frozen decision rules

1. Never analyzes no function. Always analyzes every completed function.
2. Source-order budget inspects each function if its numeric tape cell count fits the compilation's remaining budget of 640 cells. It debits the full tape count before running and continues to later functions after rejection.
3. Selected uses the same source-order budget and refuses tapes smaller than 24 cells or larger than 192 cells. It also requires at least one buffer or string parameter. Eligibility uses only the current checked signature and cell count. It requires no scanning, training, or prediction from the upcoming held-out inputs.

Charge describes inspected tape cells, not measured time. Report total functions, accepted functions, visited cells and eliminated guards, and keep reported time and native extent distinct. A selection that misses profitable code or attains the same reduction with more work is a negative result. Neither policy bypasses normal checks when proof fails. Thresholds and source-order behavior remain fixed after held-out disclosure.

## Evaluate

Apply the four policies through the same default-streamed compiler on real Chess/Editor and bounded integer scene code. Add targeted checks for control joins, mutable indices, calls and writes, along with a frozen unseen input. Compare complete buffers and result/trap behavior to scalar native and Wasm. Report where code savings occur rather than equating analysis coverage with speed. A hardware benchmark runs generated routines from the same placement on the ESP32-P4 and times literal native workloads separately from compiler orchestration. Preserve the playable app on completion.
