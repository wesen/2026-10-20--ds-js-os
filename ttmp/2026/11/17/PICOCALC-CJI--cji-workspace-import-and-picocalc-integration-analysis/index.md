---
Title: CJI workspace import and PicoCalc integration analysis
Ticket: PICOCALC-CJI
Status: complete
Topics:
    - picocalc
    - esp32-p4
    - native
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-17T20:07:21.683548091-05:00
WhatFor: ""
WhenToUse: ""
---

# CJI workspace import and PicoCalc integration analysis

## Overview

The [compiler and hardware test sources](../../../../../cji/) live at the repository root. The [import notes](sources/README.md) record their provenance. The [analysis](analysis/01-what-the-cji-workspace-brings-to-picocalc.md) traces a compiled world into the PicoCalc kernel and distinguishes host and emulator results from hardware validation.

Read the [intern hardware bring-up guide](design-doc/01-running-a-compiled-javascript-world-on-the-picocalc-esp32-p4.md) for the verified host commands, device integration and physical acceptance procedure.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Physical bring-up completed on ESP32-P4 v1.3. See the [UART evidence](various/p4-acceptance.txt), [display capture](various/p4-repl-pong.png), and [system-wide migration analysis](analysis/02-from-one-compiled-service-to-the-picocalc-system-image.md).

## Topics

- picocalc
- esp32-p4
- native

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
