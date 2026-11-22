---
Title: Inspect Typed Wasm and RV32 emission
Ticket: PICOCALC-COMPILER-INSPECT
Status: complete
Topics:
    - picocalc
    - compiler
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-rv32.js
      Note: Final native emission and fixups
    - Path: repo://compiler/typed/typed-wasm.js
      Note: Frontend observations and final Wasm section ranges
    - Path: repo://compiler/typed/tools/typed-inspect.mjs
      Note: Host CLI and profile join
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T00:38:18.78500541-05:00
WhatFor: ""
WhenToUse: ""
---

# Inspect Typed Wasm and RV32 emission

Inspect final Wasm module bytes and native RV32 words from the ordinary Typed compiler. The host CLI joins source-associated operations to a hash-checked execution profile and compares lowering decisions across builds.

## Read the study

- [Reading what the Typed compiler emits](analysis/01-reading-what-the-typed-compiler-emits.md)
- [Following Typed operations into a Wasm module](analysis/02-following-typed-operations-into-a-wasm-module.md)
- [Experimental design and implementation guide](design-doc/01-experimental-design-and-implementation-guide.md)
- [Frontend operations and final Wasm offsets](design-doc/02-frontend-operations-and-final-wasm-offsets.md)
- [Director investigation diary](reference/01-director-investigation-diary.md)
- [Investigation diary for frontend and Wasm inspection](reference/02-frontend-inspection-investigation-diary.md)

Reproduction programs are in [scripts](scripts/). The [evidence directory](various/) contains frozen inputs, compact receipts or raw timing records. See the [tasks](tasks.md) and [changelog](changelog.md) for status.
