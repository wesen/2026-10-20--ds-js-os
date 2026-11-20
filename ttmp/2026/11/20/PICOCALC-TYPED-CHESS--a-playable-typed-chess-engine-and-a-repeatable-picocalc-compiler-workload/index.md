---
Title: A playable typed chess engine and a repeatable PicoCalc compiler workload
Ticket: PICOCALC-TYPED-CHESS
Status: active
Topics:
    - picocalc
    - performance
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/port/esp32p4/main/chess_p4.c
      Note: Generic firmware compiler invocation
    - Path: repo://picocalc-os/worlds/chess/chess.typed
      Note: Typed launcher application and timer-driven state machine
    - Path: repo://picocalc-os/worlds/chess/search.typed
      Note: Bounded iterative deepening, alpha–beta and quiescence
    - Path: repo://ttmp/2026/11/20/PICOCALC-TYPED-CHESS--a-playable-typed-chess-engine-and-a-repeatable-picocalc-compiler-workload/various/engine-oracle.json
      Note: Frozen perft, legality, score and node comparisons
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:32:26.122129692-05:00
WhatFor: ""
WhenToUse: ""
---

# A playable typed chess engine and a repeatable PicoCalc compiler workload

## Overview

Typed Chess is a launcher app and a fourth PicoCalc compiler workload. The engine uses an explicit-stack alpha–beta search with iterative deepening and quiescence. It plays Black against a human, with castling, en passant, all four promotions and checkmate/stalemate adjudication. Wasm and RV32 pass the same independent legal fixtures and shared-reactor replay.

## Key Links

- [Newcomer design](./design-doc/01-a-bounded-orthodox-chess-engine-and-typed-world.md)
- [Technical article](./analysis/01-chess-search-without-recursion-on-the-picocalc.md)
- [Independent Opus High design receipt](./various/opus-search-design.json)
- [Independent Opus High interpretation](./analysis/02-claude-opus-46-high-interpretation.md) · [Dated independent diary](./reference/04-claude-opus-46-high-diary.md) · [Raw author receipt](./various/opus-interpretation.json)
- [Engine and world qualification](./various/engine-oracle.json) · [Linked world transcript](./various/world-oracle.json)
- [Host performance](./various/host-measurements.json) · [Reproduction guide](./reference/03-reproduce-chess.md)
- [Physical RV32 run and restoration](./various/physical-rv32.json) · [Serial timing records](./various/physical-rv32-clock.txt)
- [Implementation diary](./reference/01-typed-chess-investigation-diary.md) · [Supervisor diary](./reference/02-supervisor-experiment-diary.md)

## Status

The host gates passed on both targets, and the physical RV32 game matched the host reply, score, depth and visit count. The operator verified the factory restoration.

## Topics

- picocalc
- performance

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design-doc/ contains the pre-implementation design
- analysis/ contains the technical article
- reference/ contains the diaries and reproduction guide
- scripts/ contains the oracles, benchmarks and measurement-only firmware staging
- various/ contains independent inputs, receipts and figures
