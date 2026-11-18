---
Title: CJI workspace import and PicoCalc integration analysis
Ticket: PICOCALC-CJI
Status: active
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
LastUpdated: 2026-11-17T19:41:42.188989187-05:00
WhatFor: ""
WhenToUse: ""
---

# CJI workspace import and PicoCalc integration analysis

## Overview

Imported the [compiler and hardware test sources](sources/README.md). The [analysis](analysis/01-what-the-cji-workspace-brings-to-picocalc.md) traces a compiled world into the PicoCalc kernel and distinguishes host and emulator results from hardware validation.

Read the [intern hardware bring-up guide](design-doc/01-running-a-compiled-javascript-world-on-the-picocalc-esp32-p4.md) for the verified host commands, device integration and physical acceptance procedure.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

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
