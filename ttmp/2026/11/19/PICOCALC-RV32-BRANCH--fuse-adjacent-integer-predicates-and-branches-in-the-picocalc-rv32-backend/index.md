---
Title: Fuse adjacent integer predicates and branches in the PicoCalc RV32 backend
Ticket: PICOCALC-RV32-BRANCH
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "An isolated Scope A2 candidate with static, differential, linked-app and board evidence."
LastUpdated: 2026-11-19T19:30:35.830243514-05:00
WhatFor: ""
WhenToUse: ""
---

# Fuse adjacent integer predicates and branches in the PicoCalc RV32 backend

## Overview

This experiment evaluates direct RV32 conditional branches for adjacent typed integer predicates. The compiler candidate is reproducible from the matched baseline and an experimental ticket-local patch.

## Evidence

- [Intern guide](design-doc/01-intern-guide-for-fusing-rv32-integer-predicates-into-structured-branches.md)
- [Investigation diary](reference/01-investigation-diary.md)
- [Compiler bundle constructor](scripts/01-construct.sh) and [candidate patch](scripts/02-predicate-fusion.patch)
- [Static and warm compile measurements](various/static.json), [focused differential test](various/differential.json), and [whole guest workflows](various/guest.json)
- [Baseline host workflows](various/baseline-replays.txt) and [candidate host workflows](various/candidate-replays.txt)

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
