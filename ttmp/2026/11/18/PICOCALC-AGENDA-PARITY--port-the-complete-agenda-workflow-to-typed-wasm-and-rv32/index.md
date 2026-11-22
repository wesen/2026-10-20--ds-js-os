---
Title: Port the complete Agenda workflow to typed Wasm and RV32
Ticket: PICOCALC-AGENDA-PARITY
Status: complete
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-22T17:20:40.007500934-05:00
WhatFor: ""
WhenToUse: ""
---

# Port the complete Agenda workflow to typed Wasm and RV32

## Overview

Port the complete original Agenda workflows to typed source. This is the implementation ticket for the expanded [Agenda compiler goal](../PICOCALC-AGENDA-COMPILER--compile-agenda-on-the-picocalc-with-wasm-and-rv32/index.md). Run the same behavior through Wasm first and then RV32. Preserve the separate powered cold-start and physical keypress-to-LCD qualification.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- picocalc

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
