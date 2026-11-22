---
Title: Candela's generated WGSL sections as bytecode interpreted by the P4 kernel
Ticket: PICOCALC-CANDELA-SECTIONS
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - compiler
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design stub: an on-device JavaScript translator from the per-scene WGSL sections (materials, SDFs, heightfields, densities, custom integrator) to a register bytecode, and a C interpreter behind the kernel's five dispatch functions."
LastUpdated: 2026-11-21T23:02:25.24628139-05:00
WhatFor: ""
WhenToUse: ""
---

# Candela's generated WGSL sections as bytecode interpreted by the P4 kernel

## Overview

Gives the firmware kernel each scene's materials and fields without compiling native code on the device. Parent design: PICOCALC-CANDELA-P4.

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
- esp32-p4
- rendering
- compiler

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
