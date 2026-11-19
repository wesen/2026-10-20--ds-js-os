---
Title: Qualify typed Editor across the supported document range
Ticket: PICOCALC-EDITOR-CAPACITY
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T00:42:56.344975185-05:00
WhatFor: ""
WhenToUse: ""
---

# Qualify typed Editor across the supported document range

## Overview

Editor application logic is in typed JavaScript. This ticket addresses two large-document regressions identified after the port. The initial Wasm stress comparison confirms that the full-size absent search now completes. The typed preview now reaches EOF and matches reference screenshots on the host. The updated Wasm and RV32 builds passed the standard Editor workflow on the board. Dense and late-match searches now pass the long simulator replays. Late-document edit traversal and long imported lines with inline markup remain open.

- [Design and implementation guide](design-doc/01-bounded-search-and-preview-for-large-picocalc-documents.md)
- [Implementation diary](reference/01-implementation-diary.md)
- [Full-size host stress results](various/editor-large-host-windowed.json)
- [Dense and late search result](various/editor-search-traversal-after.json)
- [Paired hardware receipt](various/p4-preview-build-workflow.json)
- [RV32 handheld capture at preview EOF](various/p4-preview-end-rv32.png)

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
