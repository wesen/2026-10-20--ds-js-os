---
Title: Preserve inline Markdown across the typed Editor document limit
Ticket: PICOCALC-EDITOR-INLINE
Status: complete
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T02:13:44.87884022-05:00
WhatFor: ""
WhenToUse: ""
---

# Preserve inline Markdown across the typed Editor document limit

## Overview

The typed formatter now preserves full-size inline Markdown and bounds malformed delimiter handling. The original staging and scheduler regressions are reproduced and fixed in the host replay.

- [Design guide](design-doc/01-bounded-typed-markdown-inline-formatting-for-imported-lines.md)
- [Implementation diary](reference/01-implementation-diary.md)
- [Matched host baseline](various/long-inline-before.json)
- [Replay after the fix](various/long-inline-after.json)
- [Cross-target parity](various/full-inline-parity.json)
- [Physical 64 KiB preview](various/p4-full-inline.png)
- [Physical build and workflow receipts](various/p4-inline-builds.json)
- [Prior capacity work](../PICOCALC-EDITOR-CAPACITY--qualify-typed-editor-across-the-supported-document-range/index.md)
- [Navigation and persistent cursor qualification](../PICOCALC-EDITOR-NAV--keep-typed-editor-cursor-navigation-responsive-and-visible/index.md)

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **complete**

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
