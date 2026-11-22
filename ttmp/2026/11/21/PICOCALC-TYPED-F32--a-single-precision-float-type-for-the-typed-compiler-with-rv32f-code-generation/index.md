---
Title: A single-precision float type for the Typed compiler with RV32F code generation
Ticket: PICOCALC-TYPED-F32
Status: active
Topics:
    - picocalc
    - compiler
    - esp32-p4
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design stub: a single-precision float scalar in Typed (types, literals, arithmetic, comparisons, conversions, Math functions), FP register allocation and RV32F emission, measured against GCC on Candela kernel fragments."
LastUpdated: 2026-11-21T23:02:25.675794685-05:00
WhatFor: ""
WhenToUse: ""
---

# A single-precision float type for the Typed compiler with RV32F code generation

## Overview

Gives the on-device compiler floating-point code, so per-scene Candela code (SDFs, heavy fields) can become native code later. Not needed for the first Candela subset. Parent design: PICOCALC-CANDELA-P4.

- Design stub: `design-doc/01-design-stub.md`
- Parent ticket and design: `ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/design-doc/01-a-candela-subset-for-the-esp32-p4.md`
- Analysis and measurements: `ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/analysis/01-how-candela-turns-a-scene-program-into-pixels.md`

Status: not started (design stub only).

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- picocalc
- compiler
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
