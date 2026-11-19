---
Title: Preserve inline Markdown across the typed Editor document limit
Ticket: PICOCALC-EDITOR-INLINE
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T01:45:37.532242564-05:00
WhatFor: ""
WhenToUse: ""
---

# Preserve inline Markdown across the typed Editor document limit

## Overview

Typed preview truncates formatted physical lines after its 4,096-unit scratch capacity. A malformed long line can also overrun while seeking closers. Both baseline behaviors are reproducible.

- [Design guide](design-doc/01-bounded-typed-markdown-inline-formatting-for-imported-lines.md)
- [Implementation diary](reference/01-implementation-diary.md)
- [Matched host baseline](various/long-inline-before.json)

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
