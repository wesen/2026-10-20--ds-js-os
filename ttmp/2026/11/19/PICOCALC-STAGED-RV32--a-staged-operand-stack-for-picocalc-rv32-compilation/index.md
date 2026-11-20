---
Title: A staged operand stack for PicoCalc RV32 compilation
Ticket: PICOCALC-STAGED-RV32
Status: complete
Topics:
    - picocalc
    - native
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Model calibration and physical qualification of staged RV32 lowering and the 80 KiB Editor reservation.
LastUpdated: 2026-11-19T21:23:58.125329392-05:00
WhatFor: ""
WhenToUse: ""
---

# A staged operand stack for PicoCalc RV32 compilation

## Overview

Files reached 593 words and Agenda emitted 2,793 against the prespecified 2,789-word prediction. The staged compiler fit Editor into an 80 KiB reservation, freeing 144 KiB of live world memory in matched native trials. Staging adds about 445 ms to Editor cold compilation with the standard reservation.

## Key Links
- [Intern guide](design-doc/01-where-an-rv32-operand-lives-between-instructions.md)
- [Study and results](analysis/02-how-a-staged-operand-stack-made-room-for-picocalc-editor.md)
- Vault publication `cd9068343729df710b826c45197ad7b779382238`
- [Board recipe](playbooks/01-qualify-the-80-kib-editor-slot.md)
- [Investigation diary](reference/01-staged-rv32-investigation-diary.md)

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **complete**

## Topics

- picocalc
- native

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
