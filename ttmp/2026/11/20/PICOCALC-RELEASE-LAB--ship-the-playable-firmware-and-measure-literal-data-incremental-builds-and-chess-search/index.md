---
Title: Ship the playable firmware and measure literal data, incremental builds and Chess search
Ticket: PICOCALC-RELEASE-LAB
Status: active
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
LastUpdated: 2026-11-20T17:55:31.294084591-05:00
WhatFor: ""
WhenToUse: ""
---

# Ship the playable firmware and measure literal data, incremental builds and Chess search

## Release and research

The [ordinary native PicoCalc firmware](https://github.com/wesen/2026-10-20--ds-js-os/releases/tag/picocalc-p4-smooth-chess-20261120) is published. Its [download verification receipt](various/release.json) identifies the app and matching partition table. The [director diary](reference/01-director-investigation-diary.md) records release and experimental decisions.

The lab measures three costs separately. Literal lowering concerns the size and cold-build cost of reconstructing a program's immutable data. Function-fragment reuse concerns the delay between an actual source edit and a working native module. Chess search concerns the running cost of the resulting program. Each department stores reproducible experiments in its own subdirectory of scripts/.

## Status

Current status: **active**

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
