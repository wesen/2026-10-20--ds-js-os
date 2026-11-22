---
Title: Candela's JavaScript front end as a QuickJS world on the PicoCalc
Ticket: PICOCALC-CANDELA-WORLD
Status: active
Topics:
    - picocalc
    - esp32-p4
    - quickjs
    - rendering
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design stub: bundle Candela's modules as QuickJS bytecode in a world with raised memory and turn budgets, memoise the constant GGX table, keep animations and parameters running, and hand programs and packed buffers to the firmware renderer."
LastUpdated: 2026-11-21T23:02:25.401711508-05:00
WhatFor: ""
WhenToUse: ""
---

# Candela's JavaScript front end as a QuickJS world on the PicoCalc

## Overview

Puts Candela's build/compile/pack on the device so that Candela programs, not pre-built scenes, run on the PicoCalc. Parent design: PICOCALC-CANDELA-P4.

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
- quickjs
- rendering
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
