---
Title: Run a subset of Candela on the ESP32-P4
Ticket: PICOCALC-CANDELA-P4
Status: complete
Topics:
    - picocalc
    - compiler
    - rendering
    - esp32-p4
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/analysis/01-how-candela-turns-a-scene-program-into-pixels.md
      Note: How Candela works and what a sample costs on RV32
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/design-doc/01-a-candela-subset-for-the-esp32-p4.md
      Note: 'The design: front end in QuickJS, fixed kernel as C, generated sections as bytecode, T0 subset, 160x160 progressive'
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/reference/01-investigation-diary.md
      Note: Main investigation diary
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/reference/02-quickjs-front-end-diary.md
      Note: QuickJS front-end study diary (subagent)
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/scripts/07-run-kernel.sh
      Note: One-command reproduction of a per-sample instruction count
ExternalSources: []
Summary: 'Research and design for running Candela scene programs on the ESP32-P4: measured per-sample cost of Candela''s own kernel on RV32, numeric-model experiments, the Candela front end in QuickJS, the decided architecture and subset, and five follow-up tickets.'
LastUpdated: 2026-11-22T17:20:50.545834017-05:00
WhatFor: ""
WhenToUse: ""
---

# Run a subset of Candela on the ESP32-P4

## Overview

Research and design for running Candela scene programs (Candela's own JavaScript API) on the PicoCalc's ESP32-P4. No implementation; the follow-up tickets carry it.

- **Analysis:** `analysis/01-how-candela-turns-a-scene-program-into-pixels.md`: Candela end to end, the census of 105 presets, and RV32 instructions per camera sample measured on Candela's own kernel.
- **Design:** `design-doc/01-a-candela-subset-for-the-esp32-p4.md`: Candela's front end unchanged in a QuickJS world; the fixed WGSL kernel translated to C at firmware build time, f32 on the FPU; generated sections translated to bytecode on the device; tier T0 (28 presets) first; 160 x 160 progressive.
- **Diaries:** `reference/01-investigation-diary.md` (main), `reference/02-quickjs-front-end-diary.md` (QuickJS front-end study).
- **Evidence:** `various/` (census, tiers, kernel counts, numeric bench, profiles, cycle model, entry calls, QuickJS front end); every file has its producing script in `scripts/`.
- **Follow-up tickets:** PICOCALC-CANDELA-CPU-KERNEL, PICOCALC-CANDELA-SECTIONS, PICOCALC-CANDELA-WORLD, PICOCALC-CANDELA-FIRST-LIGHT, PICOCALC-TYPED-F32.
- **Input archive:** `~/Downloads/candela-workspace(1).zip`, SHA-256 `873b2dd4bb9c32cac08751baf9fa6960ee4377306a04b2e118a8969dd940df5d` (not copied into the repository).

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- picocalc
- compiler
- rendering
- esp32-p4
- performance

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
