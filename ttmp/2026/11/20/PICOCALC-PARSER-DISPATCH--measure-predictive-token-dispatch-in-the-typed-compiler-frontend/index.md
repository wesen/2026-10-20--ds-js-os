---
Title: Measure predictive token dispatch in the typed compiler frontend
Ticket: PICOCALC-PARSER-DISPATCH
Status: complete
Topics:
    - picocalc
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T01:33:20.539973091-05:00
WhatFor: ""
WhenToUse: ""
---

# Measure predictive token dispatch in the typed compiler frontend

## Overview

The initial predictive-dispatch experiment isolated failed parser lookahead. The follow-up composed parser cleared the original 31.4 ms frontend-only gate in six elapsed-wall sessions with the unchanged professor host and JavaScript driver.

## Key Links

- [Portable benchmark analysis](analysis/01-qualifying-the-portable-typed-frontend-on-the-historical-editor.md)
- [Implementation diary](reference/02-bounded-parser-and-portable-timing-investigation-diary.md)
- [Exact patch](sources/03-parser-and-portable-fallback.patch)
- [Published portable parser article](https://github.com/go-go-golems/go-go-parc/blob/eba16f5b216ffcdc185f85c6de8672743cdda6dc/Projects/2026/11/20/ARTICLE%20-%20PicoCalc%20Compiler%20-%20How%20the%20Typed%20Parser%20Passed%20Its%20Portable%20Frontend%20Gate.md)
- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- picocalc
- performance

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
