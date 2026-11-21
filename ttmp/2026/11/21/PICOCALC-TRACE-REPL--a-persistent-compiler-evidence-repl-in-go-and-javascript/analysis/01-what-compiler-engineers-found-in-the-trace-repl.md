---
Title: What compiler engineers found in the trace REPL
Ticket: PICOCALC-TRACE-REPL
Status: active
Topics:
    - compiler
    - performance
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T14:23:47.88367247-05:00
WhatFor: ""
WhenToUse: ""
---

# What compiler engineers found in the trace REPL

## Research questions and evidence

The analyzer has two kinds of input. LLVM's pass printer captures text after each invocation. This makes it possible to inspect static code at a particular point in the compiler pipeline. A separate execution study counts instructions while the ray tracer processes a fixed scene. That record can compare executed work across compiler variants. It lacks a per-instruction address histogram. Our participants needed to discover how far each type of evidence could support their assigned conclusion.

| Role | Task | Scoring evidence withheld from the participant |
|---|---|---|
| Compiler intern | Count events across the archive, split the checked run by phase, relocate a particular middle-end event | 4,133 headers overall, 195 checked middle end, 116 checked backend. Ordinal 74 is an EarlyCSEPass print on the function row. Its inflated byte interval is [240363, 248127). |
| Middle-end researcher | Find the first observed decrease in direct 32-bit loads from argument zero of the checked row, then determine whether the source lines can be identified | 11 sites at ordinal 73, six at 74, SROAPass then EarlyCSEPass. Both are full prints. The checked raw module lacks debug locations. A gap breaks a claim of adjacency. |
| Performance reviewer | Measure the loop-strength-reduction ablation and determine whether it identifies a hot PC | Checked llc with LSR disabled executed 1,275,560 instructions. With it enabled the count was 1,233,611 over 160 opening-scene rows. Difference −41,949, or −3.29% relative to the disabled baseline. Attribution to a particular PC requires observations absent from those totals. |

The judge holds the table separately from Pi. The JSON receipts record public user-facing replies and tool actions. A lexical checker independently inflates the checked compiler log and verifies its digest, reads the reported counters, and detects the expected literals in each answer. Manual inspection ties those literals to queries, resolves signs and denominators and checks the absence claims. The outcome of each run concerns one agent on this archive.
