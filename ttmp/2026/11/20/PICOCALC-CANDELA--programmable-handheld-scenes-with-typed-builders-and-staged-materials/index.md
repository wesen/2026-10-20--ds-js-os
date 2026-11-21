---
Title: Programmable handheld scenes with Typed builders and staged materials
Ticket: PICOCALC-CANDELA
Status: complete
Topics:
    - picocalc
    - compiler
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T00:01:27.749823673-05:00
WhatFor: ""
WhenToUse: ""
---

# Programmable handheld scenes with Typed builders and staged materials

## Overview

Typed source now builds and edits two programmable scenes on the ESP32-P4. Three source styles agree on Wasm and RV32. C retains visibility and lighting, and Typed evaluates the material graph. The callback stage's scanline path took 28.877 ms for the shared scene and 18.202 ms for the tile scene. The physical review includes 108 paired measurements and five complete viewport comparisons.

Start with the [director report](analysis/02-from-a-typed-scene-description-to-pixels-on-the-picocalc.md), [researcher measurements](analysis/05-what-does-it-cost-to-change-a-material-on-a-handheld.md) and [director diary](reference/01-director-investigation-diary.md). The five articles and figures were published in go-go-parc main at `8f6d2e2621c20b11788d61f3eade412060a2ec34`.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **complete**

## Topics

- picocalc
- compiler
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
