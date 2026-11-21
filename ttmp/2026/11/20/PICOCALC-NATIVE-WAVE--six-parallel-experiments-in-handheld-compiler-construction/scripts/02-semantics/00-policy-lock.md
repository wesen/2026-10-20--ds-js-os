---
Title: Preserve checked operation identity until native lowering
Ticket: PICOCALC-NATIVE-WAVE
Status: active
DocType: design-doc
Intent: long-term
Topics: [picocalc, esp32-p4, performance, native]
---

# Preserve checked operation identity until native lowering

The shared frontend knows when a checked access begins and where the corresponding buffer, index and payload operation come from. Early expansion replaces this knowledge with primitive stack instructions. This experiment retains only two small Typed operations on the optional numeric RV32 path. It tests which operations benefit, and whether a simple rule can choose them without a second parse.

## Preserve checks, side effects and value lifetimes

The first retained operation is the checked UTF-16 address. It describes the receiver and saved position locals and produces the same checked header-relative address as the early operation. On RV32, the unsigned bounds comparison branches directly across the existing trap instruction. The address is produced only once the comparison succeeds. A load or store retains its existing four-byte payload offset. A checked write still computes its address before evaluating the value, so a failing check may stop that evaluation at exactly the same point.

The second operation is the write of an already checked literal. The existing start and end guards run before it. A late native lowering loads the address once and emits ordered immediate halfword stores using the shared address register. This is still the direct scalar writer. It changes no image data segment and uses no bulk-copy pool. The accompanying result count comes from the same frontend code. Empty strings preserve evaluation and generate no stores.

Keep the default Wasm and RV32 paths available. The early arm expands the operations as today. Late retains both address and already checked literal writes. The static rule retains the address for reads and retains literal writes of at least eight UTF-16 units. It keeps address expansion early for scalar writes and literal guards. It sees the method kind and literal length during normal frontend emission. This threshold and method rule are fixed before the held-out input. They make a testable tradeoff between a narrow policy and opportunities deliberately left to early emission.

## Compare completed operations

Report code bytes and work per real input from the same shared compiler and fixed linker. Count which methods retained identity, then compare exact output and traps for both operation arms. Required independent tests cover unsigned negative and endpoint indices, dynamic side effects, aliased valid buffers, nested operand stacks, read-versus-write sequencing, and UTF-16 literal lengths on either side of eight. Check at least one real bounded-index renderer and real application sources plus an independently supplied holdout. A rule can be inferior to always-late; record that where observed.

On the board use matched emitted code images in the same physical placement. Treat a local primitive and its workload as separate timing boundaries. Boot, cache residency, EFI loading and whole-application response need separate evidence. Keep the release compiler and app intact.
