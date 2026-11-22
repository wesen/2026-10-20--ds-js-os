---
Title: Separate library specialization from numeric range proofs
Ticket: PICOCALC-CJI-RANGES
Status: complete
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-22T17:20:44.147733227-05:00
WhatFor: ""
WhenToUse: ""
---

# Separate library specialization from numeric range proofs

## Overview

Reduce time to a verified module on the physical ESP32-P4 by separating receiver inference from full numeric proofs. The guarded prototype is qualified on the host. A complete physical comparison is pending board access.

## Key Links

- [Intern design and implementation guide](design-doc/01-scheduling-numeric-range-proofs-in-the-cji-compiler.md)
- [Investigation diary](reference/01-investigation-diary.md)
- [Paired Agenda host measurements](various/agenda-guard-native.json)

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
