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

## Published research reports

| Study | Article in go-go-parc |
| --- | --- |
| Language implementation | [Forward Calls and Exhaustive Typed Domains](https://github.com/go-go-golems/go-go-parc/blob/8689108d861bc628cb172488ac232e8b97176dcf/Projects/2026/11/19/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20Forward%20Calls%20and%20Exhaustive%20Typed%20Domains.md) |
| Independent language study | [Forward Calls and Erased Types in a Two-Target Compiler](https://github.com/go-go-golems/go-go-parc/blob/522f646f027b1ddb4be434af7f26f9792d5628c0/Projects/2026/11/20/ARTICLE%20-%20PicoCalc%20Compiler%20-%20Forward%20Calls%20and%20Erased%20Types%20in%20a%20Two-Target%20Compiler.md) |
| Continuation implementation | [How PicoCalc Compiles Await into Static Continuations](https://github.com/go-go-golems/go-go-parc/blob/000fa2a705bebefdf8b5875304759221074f04be/Projects/2026/11/20/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20How%20PicoCalc%20Compiles%20Await%20into%20Static%20Continuations.md) |
| Independent continuation study | [Which Values Survive a Wait](https://github.com/go-go-golems/go-go-parc/blob/0dd2de8b716391c1fd463a2bd0c5cbd51b42095a/Projects/2026/11/20/ARTICLE%20-%20PicoCalc%20Compiler%20-%20Which%20Values%20Survive%20a%20Wait.md) |
| Editor application | [What Editor Keeps Across a File Read and a Search Pause](https://github.com/go-go-golems/go-go-parc/blob/e2cd8bf0d82ce4c92ae4e49d44b3902c8fcaa365/Projects/2026/11/20/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20What%20Editor%20Keeps%20Across%20a%20File%20Read%20and%20a%20Search%20Pause.md) |
| Independent search measurement | [Timing a Complete Search Across Multiple Turns](https://github.com/go-go-golems/go-go-parc/blob/e7fc3f1e32d81bc3ad931e2d22cce60a49f360d5/Projects/2026/11/20/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20Timing%20a%20Complete%20Search%20Across%20Multiple%20Turns.md) |
| Lexical index implementation | [How a Lexical Index Serves the PicoCalc Compiler](https://github.com/go-go-golems/go-go-parc/blob/6135063660d9087fa452e6fc42a4e1433da7932c/Projects/2026/11/20/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20How%20a%20Lexical%20Index%20Serves%20the%20PicoCalc%20Compiler.md) |
| Independent index measurement | [What Token Indexing Buys on the Physical Board](https://github.com/go-go-golems/go-go-parc/blob/daad20e9598360ed5f44be0c84bc5df1c0f67734/Projects/2026/11/20/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20What%20Token%20Indexing%20Buys%20on%20the%20Physical%20Board.md) |
| Reusing original source spans | [Reusing Source Spans in the Asynchronous Compiler](https://github.com/go-go-golems/go-go-parc/blob/f75a58f4ac8d8c2a9f50550bf90573f84a24710c/Projects/2026/11/20/PROJECT%20REPORT%20-%20PicoCalc%20Compiler%20-%20Reusing%20Source%20Spans%20in%20the%20Asynchronous%20Compiler.md) |
| Portable frontend timing | [How the Typed Parser Passed Its Portable Frontend Gate](https://github.com/go-go-golems/go-go-parc/blob/eba16f5b216ffcdc185f85c6de8672743cdda6dc/Projects/2026/11/20/ARTICLE%20-%20PicoCalc%20Compiler%20-%20How%20the%20Typed%20Parser%20Passed%20Its%20Portable%20Frontend%20Gate.md) |

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
