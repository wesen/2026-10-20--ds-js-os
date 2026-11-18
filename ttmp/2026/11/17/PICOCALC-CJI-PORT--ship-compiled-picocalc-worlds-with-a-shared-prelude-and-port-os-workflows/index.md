---
Title: Ship compiled PicoCalc worlds with a shared prelude and port OS workflows
Ticket: PICOCALC-CJI-PORT
Status: active
Topics:
    - picocalc
    - native
    - esp32-p4
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-17T21:31:34.072957812-05:00
WhatFor: ""
WhenToUse: ""
---

# Ship compiled PicoCalc worlds with a shared prelude and port OS workflows

## Overview

Migrate shipping PicoCalc workflows to trusted CJI native worlds. Start with the [intern guide](design-doc/01-porting-picocalc-workflows-to-shared-cji-machine-code.md). The [diary](reference/01-implementation-diary.md) records the implementation and hardware tests. See [tasks](tasks.md) for the verified workflows.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Phase 3 is complete and verified on the ESP32-P4. The [on-device compiler guide](design-doc/02-compiling-worlds-on-the-picocalc-phases-4-through-6.md) covers Phases 4 through 6.

## Topics

- picocalc
- native
- esp32-p4

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
