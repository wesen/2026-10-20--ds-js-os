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

Editor application logic is in typed JavaScript. This ticket addresses two large-document regressions identified after the port. The initial Wasm stress comparison confirms that the full-size absent search now completes. The typed preview now reaches EOF and matches reference screenshots on the host. Dense matches, late-document edit traversal, and board requalification remain open.

- [Design and implementation guide](design-doc/01-bounded-search-and-preview-for-large-picocalc-documents.md)
- [Implementation diary](reference/01-implementation-diary.md)
- [Full-size host stress results](various/editor-large-host-seek.json)

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
