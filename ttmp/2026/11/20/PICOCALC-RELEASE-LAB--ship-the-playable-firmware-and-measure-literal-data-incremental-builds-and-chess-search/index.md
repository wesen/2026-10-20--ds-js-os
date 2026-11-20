---
Title: Ship the playable firmware and measure literal data, incremental builds and Chess search
Ticket: PICOCALC-RELEASE-LAB
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
LastUpdated: 2026-11-20T18:28:26.612128013-05:00
WhatFor: ""
WhenToUse: ""
---

# Ship the playable firmware and measure literal data, incremental builds and Chess search

## Release and research

The [ordinary native PicoCalc firmware](https://github.com/wesen/2026-10-20--ds-js-os/releases/tag/picocalc-p4-smooth-chess-20261120) is published. Its [download verification receipt](various/release.json) identifies the app and matching partition table. The [director diary](reference/01-director-investigation-diary.md) records release and experimental decisions.

The lab measures three costs separately. Literal lowering concerns the size and cold-build cost of reconstructing a program's immutable data. Function-fragment reuse concerns the delay between an actual source edit and a working native module. Chess search concerns the running cost of the resulting program. Each department stores reproducible experiments in its own subdirectory of scripts/.

## Reading the results

- [Director synthesis](analysis/01-compiling-programs-and-measuring-chess-search-on-a-handheld.md) connects the installed code census, edit correctness and generated search profiles.
- [Literal-pool design](design-doc/02-pool-checked-buffer-literals.md) describes checked UTF-16 copies and their native representation.
- [Incremental compiler design](design-doc/03-incremental-builds.md) defines reusable fragments, invalidation and measurement boundaries.
- [Chess benchmark](analysis/04-chess-search.md) records the host and board outcomes for seventeen search workloads.
- [Remaining rendering tasks](../PICOCALC-RENDER-NEXT--bounded-screen-snapshots-and-compiled-layouts-for-the-picocalc-compositor/index.md) group the six original gates still open.

## Publication

Four illustrated studies were [published together in go-go-parc](https://github.com/go-go-golems/go-go-parc/commit/c419e4ea768271ad49dbe8bdb2be6472f4a8f1f6). The [incremental study](analysis/03-incremental-builds.md) contains the P4 RAM and flash checkpoint results. The [literal study](analysis/02-literal-data.md) explains how source becomes instructions or data. The [publication receipt](various/publication.json) identifies all articles, figures and the reMarkable study-design bundle.

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
