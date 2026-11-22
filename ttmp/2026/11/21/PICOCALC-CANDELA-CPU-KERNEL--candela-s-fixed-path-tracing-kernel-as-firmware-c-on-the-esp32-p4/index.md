---
Title: Candela's fixed path-tracing kernel as firmware C on the ESP32-P4
Ticket: PICOCALC-CANDELA-CPU-KERNEL
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - performance
    - porting
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design stub: generate C from Candela's kernel.js (PRELUDE, SPECTRAL, CORE, PATH, POST) at firmware build time, add CPU-specific math, and measure cycles per sample on the ESP32-P4."
LastUpdated: 2026-11-21T23:02:25.065019029-05:00
WhatFor: ""
WhenToUse: ""
---

# Candela's fixed path-tracing kernel as firmware C on the ESP32-P4

## Overview

Turns the PICOCALC-CANDELA-P4 prototype translator into a firmware build step and produces the first device measurement of Candela's path tracer. Parent design: PICOCALC-CANDELA-P4.

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
- performance
- porting

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
