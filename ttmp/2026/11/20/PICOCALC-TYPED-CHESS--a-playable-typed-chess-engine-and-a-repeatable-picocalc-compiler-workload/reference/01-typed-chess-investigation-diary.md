---
Title: Typed Chess investigation diary
Ticket: PICOCALC-TYPED-CHESS
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:33:58.010034231-05:00
WhatFor: ""
WhenToUse: ""
---

# Typed Chess investigation diary


## Step 1: Match the chess design to the shared typed-world reactor

The compiler requires an acyclic typed call graph. An explicit frame stack therefore represents the search independently of the representation of ordinary typed calls. Two existing shared reactor buffers can keep the visible position separate from the board that currently has a speculative search move applied.

### Prompt Context

The supervisor assigned a playable typed orthodox chess world with a bounded, nontrivial engine, dual-target validation, measurement, a newcomer design and publication. The user emphasized that the engine should not be entirely naive.

### What I did

- Read the shared typed-world ABI, buffer capacities, C slot linker and Editor event idioms.
- Designed an explicit-stack iterative deepening engine, legal rule path and timer-driven UI.
- Confirmed the source can use the shared generic reactor on both targets.

### Why

Using the same application ABI as Editor lets the compiler qualification treat Chess as another real source workload. The game requires no C move generator or C search code.

### What worked

The shared reactor offers two 65,536-unit buffers, key-event text, JSON screen transport and an SDK yield timer. The function signatures match the app wrapper and source assembly conventions.

### What didn't work

The local Python interpreter initially reported `ModuleNotFoundError: No module named 'chess'`. Published independent perft vectors supply a reference, and a separate optional oracle can be installed only if needed.

### What I learned

Typed source uses one-word buffer accesses and arithmetic rather than a general object heap. Dense packed moves and a mailbox suit the representation.

### What was tricky to build

Castling safety and en passant expose attacks that depend on temporarily changing the board. One make/unmake implementation should serve perft, UI legality and engine search.

### What warrants a second pair of eyes

Check the search caps and exact in-check quiescence behavior, snapshot restoration, and the draw rules admitted by the UI.

### What should be done in the future

Calibrate the timer slice on the physical board after host qualification.

### Code review instructions

Open the intern design, then trace a move from its encoded word through the reversible position update.

### Technical details

The engine uses source functions in `picocalc-os/worlds/chess` and the generic `typedWorldMeta` and `typedWorldEvent` entry points.
