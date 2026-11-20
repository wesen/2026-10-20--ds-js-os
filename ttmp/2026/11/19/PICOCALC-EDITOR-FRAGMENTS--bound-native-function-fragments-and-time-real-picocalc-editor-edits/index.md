---
Title: Bound native function fragments and time real PicoCalc Editor edits
Ticket: PICOCALC-EDITOR-FRAGMENTS
Status: complete
Topics:
    - picocalc
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/worlds/editor/preview.typed
      Note: Runtime witness and edited helper
    - Path: repo://picocalc-os/compiler/typed-rv32.js
      Note: Reference native lowerer, linker and slot ABI
    - Path: repo://picocalc-os/compiler/typed-world.js
      Note: World entry and record contracts
    - Path: repo://picocalc-os/port/esp32p4/main/typed_p4.c
      Note: QuickJS allocator and device compilation wrapper
ExternalSources: []
Summary: Compare warm, partial and clean rebuilds of the full typed Editor from changed source through native return.
LastUpdated: 2026-11-19T22:39:56.718908282-05:00
WhatFor: ""
WhenToUse: ""
---

# Bound native function fragments and time real PicoCalc Editor edits

## Study

The full Editor contains 120 typed functions. A body edit, a repaired signature and two field-layout permutations exercise different causes of fragment invalidation. The clean oracle compiles each input to an ELF independently. Both the emulated and physical native entry compare the preview buffer contents, updated state and return value.

- [Analysis and results](analysis/01-what-it-costs-to-rebuild-the-typed-editor-after-a-real-edit.md)
- [Intern design and implementation guide](design-doc/01-from-an-editor-source-edit-to-a-native-return-with-bounded-fragments.md)
- [Implementation diary](reference/01-incremental-editor-experiment-diary.md)
- [Host counts, hashes and offsets](various/host-oracle.json)
- [Reproduction scripts](scripts/)
- [All 72 physical rows, full hashes, and restored native world records](various/physical.json)
- [Published Obsidian report and figure](https://github.com/go-go-golems/go-go-parc/blob/a2fe6cd9e914be7216b640fd9b83f42359ae96cc/Projects/2026/11/19/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20What%20It%20Costs%20to%20Rebuild%20the%20Typed%20Editor%20After%20a%20Real%20Edit.md)
