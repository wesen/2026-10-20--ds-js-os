---
Title: Designing a JS-like language for interactive compilation on the PicoCalc
Ticket: PICOCALC-CJI-DIALECT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-18T16:16:11.06796357-05:00
WhatFor: ""
WhenToUse: ""
---

# Designing a JS-like language for interactive compilation on the PicoCalc

## Investigation design

A programmer submits a world source file, obtains an executable artifact, starts an isolated world and observes a turn responding to an event. We compare time and memory at each boundary. Native ELF generation, VM bytecode generation and executing application code have separate tests. The candidate language can change, but the experiment must state exactly what changed and give independent behavioral examples. The existing language and previous installation stay available as the reference.

The working hypotheses are that global numeric proof is expensive, ordinary JS syntax is affordable to parse, and a fixed library and local typing could make native compilation cheaper. The catalog audit tests which semantics are actually exercised. The board experiments distinguish hypotheses with physical evidence from architectural proposals that still need implementation.
