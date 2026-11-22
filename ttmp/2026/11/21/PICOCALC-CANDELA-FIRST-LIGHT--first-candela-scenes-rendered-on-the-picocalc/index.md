---
Title: First Candela scenes rendered on the PicoCalc
Ticket: PICOCALC-CANDELA-FIRST-LIGHT
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - testing
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design stub: integrate the Candela world, the firmware kernel and the bytecode sections; render tier T0 presets progressively at 80 x 80 and 160 x 160 on the PicoCalc; measure samples per second and compare 64-pass images with host goldens."
LastUpdated: 2026-11-21T23:02:25.546552748-05:00
WhatFor: ""
WhenToUse: ""
---

# First Candela scenes rendered on the PicoCalc

## Overview

The integration ticket: the first time a Candela program produces a physically based image on the PicoCalc's screen. Parent design: PICOCALC-CANDELA-P4.

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
- testing

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
