---
Title: Keep typed Editor cursor navigation responsive and visible
Ticket: PICOCALC-EDITOR-NAV
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T01:33:22.928180003-05:00
WhatFor: ""
WhenToUse: ""
---

# Keep typed Editor cursor navigation responsive and visible

## Overview

The typed Editor's row checkpoints now support late cursor moves, page navigation, edits and reopen. Its edit frame uses the LCD's actual 17-row capacity. The capacity ticket contains the original full-file search and preview work.

- [Design guide](design-doc/01-typed-editor-row-checkpoints-and-cursor-navigation.md)
- [Implementation diary](reference/01-implementation-diary.md)
- [Host EOF screenshot](various/eof-visible-wasm.png)

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
