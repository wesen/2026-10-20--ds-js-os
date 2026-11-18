---
Title: A JS-like device language and a low-latency compiler for the PicoCalc
Ticket: PICOCALC-CJI-DIALECT
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-DIALECT--a-js-like-device-language-and-a-low-latency-compiler-for-the-picocalc/analysis/02-catalog-contracts.md
      Note: Observed world and prelude requirements
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-DIALECT--a-js-like-device-language-and-a-low-latency-compiler-for-the-picocalc/analysis/03-fast-paths.md
      Note: Standalone compiler and kernel alternatives
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-DIALECT--a-js-like-device-language-and-a-low-latency-compiler-for-the-picocalc/design-doc/01-designing-a-js-like-language-for-interactive-compilation-on-the-picocalc.md
      Note: Intern architecture guide with language contract and measurements
ExternalSources: []
Summary: Physical measurements and a design for a JS-like PicoCalc language with fast interactive compilation.
LastUpdated: 2026-11-18T16:16:10.92066368-05:00
WhatFor: Choose a device compiler architecture and qualify the first typed world.
WhenToUse: Before changing language semantics, the edit/run path or native optimization policy.
---

# A JS-like device language for the PicoCalc

The attached ESP32-P4 compiled the entire 22-world JS catalog to QuickJS bytecode, produced independently verified native Agenda and Files modules under a bounded numeric policy, and compiled and ran an explicitly typed compositor function with WAMR. The guide uses these observations to propose the editor path, a typed language contract and an implementation order.

## Start here

- [Intern design and implementation guide](design-doc/01-designing-a-js-like-language-for-interactive-compilation-on-the-picocalc.md)
- [Catalog contracts and app-port evidence](analysis/02-catalog-contracts.md)
- [Execution format alternatives and simulator workflows](analysis/03-fast-paths.md)
- [Physical timing and identity receipts](various/board/) and [board reproduction instructions](scripts/board/README.md)

## Investigation diaries

- [Architecture, physical board and publication](reference/01-architecture-and-board-investigation-diary.md)
- [Numeric representation experiment](reference/02-numeric-lowering-experiment-diary.md)
- [Catalog semantics and behavior](reference/03-catalog-semantics-investigation-diary.md)
- [QuickJS and typed-Wasm experiments](reference/04-fast-compiler-alternatives-investigation-diary.md)

The experiments are under [scripts](scripts/). The next production milestone proposed by the research is a complete typed world that handles a real event and satisfies the existing ABI, memory and turn budgets. [Task ledger](tasks.md) · [Changelog](changelog.md)
