---
Title: Implement and qualify the typed language and asynchronous Editor on the PicoCalc
Ticket: PICOCALC-EG-QUAL
Status: active
Topics:
    - picocalc
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Integration of professor phases E1–E7 and G1–G4, per-researcher reports, device qualification and publication records."
LastUpdated: 2026-11-19T23:29:25.491737874-05:00
WhatFor: ""
WhenToUse: ""
---

# Implement and qualify the typed language and asynchronous Editor on the PicoCalc

## Overview

The compiler accepts forward calls, typed control flow, exhaustive enums, distinct integers and asynchronous tasks. Editor Open and Find exercise these features on the ESP32-P4. This ticket compares the generated continuations with the handwritten implementation, measures the compiler on the device and preserves the exact experiments used to select a frontend.

## Key Links

- [Independent language study](analysis/02-independent-language-study.md)
- [Independent continuation study](analysis/03-independent-continuations-study.md)
- [Independent complete-search study](analysis/04-independent-editor-study.md)
- [Cold compiler and memory comparison](../../20/PICOCALC-LEXICAL-INDEX--index-typed-source-once-for-the-cold-picocalc-compiler/various/physical-comparison-composed.json)

## Read the study

Start with [the integration guide](design-doc/01-from-forward-declarations-to-a-resumable-editor.md) and [the supervisor’s illustrated project report](analysis/01-compiling-a-complete-asynchronous-editor-on-the-picocalc.md). The [chronological diary](reference/01-integration-and-device-qualification-diary.md) identifies the code commits, experiments and independent reviews. The initial four-guide PDF is in the reMarkable research folder recorded in [the bundle receipt](various/remarkable-design-bundle.txt).

- [Frontend language implementation and experiments](../PICOCALC-LANGUAGE-E--control-flow-forward-calls-enums-and-distinct-integers/index.md)
- [Continuation layout, compiler and execution fixtures](../PICOCALC-CONTINUATION-G--compile-typed-await-into-static-picocalc-continuations/index.md)
- [Editor Open and Find source and behavioral replays](../PICOCALC-EDITOR-ASYNC--suspend-and-resume-editor-open-and-find-in-typed-source/index.md)

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
