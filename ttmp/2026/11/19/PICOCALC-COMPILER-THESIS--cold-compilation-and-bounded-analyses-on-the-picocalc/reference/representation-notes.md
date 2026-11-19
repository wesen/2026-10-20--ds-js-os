---
Title: Representation experiment notes
Ticket: PICOCALC-COMPILER-THESIS
DocType: reference
Status: active
Topics:
  - compiler
  - picocalc
---

# Representation experiment notes

The tested boundary is `typedWasm.compileFunctions` → `typedRv32.compile` at Git revision `dd69a81cbf91ebf00e1f527bcbbf785697b1c9a4`. A function comes back with `name`, `params`, `result`, `nlocals`, its Wasm-opcode array `code` and a second array `body`. RV32 uses `code` and counts. Wasm module writing uses `body`. The native path therefore has two independently avoidable costs before instruction selection begins.

| Comparison | Variable | Editor observation |
| --- | --- | --- |
| Bytes → unframed | Omit local vector, body length and duplicate instructions | 60.033 → 58.234 ms median, 3,198,824 → 2,457,840 B incremental heap peak |
| Unframed → packed | Pass signed/unsigned operands directly as numbers | 58.234 → 49.443 ms median, 2,457,840 → 2,427,040 B incremental heap peak |
| Packed → stream | Consume the completed function immediately | 49.443 → 51.103 ms median, 2,427,040 → 1,719,456 B incremental heap peak |

The prepared-input lower-only Editor median fell from 24.830 ms to 22.229 ms. The front-only medians were 35.488 ms for bytes, 33.596 ms for unframed and 27.344 ms for packed. The timing regions have distinct residency and GC behavior. Full compile timings are the comparison for total compile work.

## Contracts to preserve

- The frontend knows the final count of local slots and compiler temporaries at function completion. The original native stack slot formula uses that count. Streaming begins at that point.
- Calls resolve only to prior source functions and imports. Allocate mutable target records before native lowering and patch their addresses after all function word counts are known.
- Continuing source validation after capturing a native lower error preserves frontend-first rejection. The mixed-error fixture verifies this.
- The code reader expects valid producer output. Packed Numbers preserve the existing immediate domains and opcodes. A standalone interchange decoder would have its own validation contract.
- ELF linking was outside the timed boundary. The byte and metadata oracle includes the app image, all native entry offsets, imports, records, signatures and relocations. The linker uses these values after the measured boundary.
- Retaining distinct source-local types requires recording them before emission. Two functions with the same public signature and `const x` assigned `true` as `bool` or 1 as `i32` have the same emitted function records. The type checker still rejects incompatible source expressions.

## Evidence and follow-up

- [Rerunnable launcher](../scripts/representation/run.py) reconstructs the compiler and corpus from Git objects. [Receipt](../various/representation/quickjs-results.json) records SHA-256 values, raw host samples, paired timing ratios, allocator endpoints and correctness cases.
- [Investigation diary](representation-diary.md) explains the failure corrections and how to review generated lanes. [Article](../various/reports/representation.md) works through the protocol and results.
- Packed buffering is the lower-latency configuration on the measured host. Streaming is the lower-peak configuration. It retained all native word arrays and fixups, so measuring an additional reduction would require changing native image construction, such as growing one image plus a compact fixup table.
- A source-aware operation experiment could keep one typed buffer access, including receiver, index and element width, until the relevant local proof runs. This comparison establishes a baseline for operand encoding and lifetime. It measures no such analysis.
