---
Title: A persistent compiler evidence REPL in Go and JavaScript
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "A persistent workbench for formulating, testing and qualifying compiler optimizations against archived LLVM, emulator and ESP32-P4 evidence."
LastUpdated: 2026-11-21T14:19:59.182733114-05:00
WhatFor: ""
WhenToUse: ""
---

# A persistent compiler evidence REPL in Go and JavaScript

## Research objective

Enable a researcher to design and validate compiler optimizations. The decisive result is an evidence-backed engineering decision. A usable session must help the researcher state the intended transformation, choose a fair control, verify semantics, measure the right population and identify a result that would refute the claim.

This workbench hosts a JavaScript query language in Go with go-go-goja. The operator opens an immutable archive once. Each researcher receives a separate live JavaScript runtime for intermediate selections, measurements and calculations.

## Read and run

- [Intern implementation guide](design-doc/01-implementing-the-compiler-evidence-workbench.md) for architecture, data vocabulary, service protocol and code navigation.
- [Research workbook](design-doc/02-research-questions-and-executable-queries-for-the-ray-row.md) for research questions from LLVM load motion to paired device timings.
- [Original API specification and all 26 examples](reference/05-original-language-specification-and-workbook-concordance.md).
- [Run the compiler-engineer persona lab](playbooks/01-running-blind-compiler-engineer-persona-sessions.md).
- [Supervisor investigation diary](reference/01-supervisor-investigation-diary.md), [service engineer diary](reference/02-service-diary.md), [archive measurements](reference/03-archive-diary.md) and [usability diary](reference/04-usability-diary.md).
- [CLI quick start](../../../../../cmd/trace-repl/README.md) and [reproducible scientific decision cell](scripts/11-test-optimization-claim.js).

## Study results

The release replays all 26 original workbook programs. The [raw-evidence study](analysis/02-evidence-from-compiler-passes-to-physical-frames.md) connects LLVM and Typed observations to paired ESP32-P4 measurements. The [runtime study](analysis/03-persistent-investigations-in-a-goja-runtime.md) measures what persists when a query is repeated. The [usability researcher’s textbook case study](analysis/04-using-blind-compiler-engineers-to-qualify-an-evidence-api.md) explains how to qualify such an interface. The [blind evaluation](analysis/01-what-compiler-engineers-found-in-the-trace-repl.md) records which conclusions changed when the interface changed. The director's [synthesis and next compiler experiment](analysis/05-designing-and-validating-compiler-optimizations-with-a-trace-repl.md) walks through the findings for newcomers.

## Ownership and evaluation

Opus xhigh owns all product implementation and fixes following the user's handoff. Earlier Go drafts are retained with their actual authorship and are submitted to Opus for technical ownership. DeepSeek personas use isolated sessions through the public research interface. The lab director writes the questions, freezes the comparison, checks claims against independent evidence, classifies confirmed defects and commissions fixes. A participant's impression can motivate a test; it cannot establish that an optimization works.

See [tasks](tasks.md) and [changelog](changelog.md) for execution status.
