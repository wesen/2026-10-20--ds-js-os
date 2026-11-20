---
Title: A smaller RV32 backend, a module cache, safety checks and await for typed PicoCalc worlds
Ticket: PICOCALC-NATIVE-NEXT
Status: active
Topics:
    - picocalc
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T18:31:50.592063-05:00
WhatFor: ""
WhenToUse: ""
---

# A smaller RV32 backend, a module cache, safety checks and await for typed PicoCalc worlds

## Overview

This ticket is the implementation plan for the next stage of the typed-JavaScript compiler on the PicoCalc, derived from the roadmap of the special issue in PICOCALC-COMPILER-ISSUE. It contains 41 tasks in nine scopes: a smaller RV32 backend (A), a cache for compiled modules (B), the CJI tool out of the default profile (C), one interface description for the reactor functions (D), language additions (E), stack bound, trap exit, fuel and a verifier (F), `await` (G), the key-to-frame measurement (M) and later items (H).

Start with [the implementation plan](./design-doc/01-implementation-plan-orientation-task-index-dependencies-and-device-qualification.md). It defines the terms, lists every task with its dependencies, and describes host acceptance, device qualification and the one deferred measurement. The scope documents 02 to 08 in `design-doc/` hold the task descriptions.

No source code has been changed by this ticket. `scripts/01-run-host-replays.sh` runs the 24 existing host replays (all pass, see `various/01-host-replays-baseline.txt`), and `scripts/02-staged-register-model.mjs` gives the predicted instruction counts for each step of Scope A (`various/02-staged-register-model.txt`).

## Open work by scope · 20 November 2026

The [parent checklist](tasks.md) has **30 open tasks out of 41 (73.2%)**. The eleven checked tasks are **E1–E7** and **G1–G4**, including the physical qualification of Editor's async open and find workflows. Task counts give each checkbox equal weight. [E/G acceptance receipt](../PICOCALC-EG-QUAL--implement-and-qualify-the-typed-language-and-asynchronous-editor-on-the-picocalc/various/final-acceptance.json)

| Open tasks | Approach and remaining work |
|---|---|
| **A0–A5** (6) | Qualify the staged backend from the per-function differential harness through lazy operands, comparison fusion, short branches, Agenda and deep Editor expressions. The historical staged compiler emitted 593 Files, 2,793 Agenda and 16,541 Editor instructions. The Agenda model predicted 2,789. Reconcile each milestone against the current compiler and applications. [Physical staged-backend study](../PICOCALC-STAGED-RV32--a-staged-operand-stack-for-picocalc-rv32-compilation/analysis/02-how-a-staged-operand-stack-made-room-for-picocalc-editor.md) |
| **A6–A8** (3) | Direct short-circuit conditions and register allocation for locals met their historical size ceilings. An experimental 80 KiB slot already yielded a 92,996-byte Editor module and 566.1 KiB live world on the board. Production adoption, retiring the old lowerer, and qualification of today's Editor still carry separate acceptance criteria. [A6](../PICOCALC-CONDITION-TARGETS--compile-typed-conditions-directly-to-branch-destinations/analysis/01-when-a-boolean-becomes-a-branch-on-the-picocalc.md) · [A7](../PICOCALC-REGISTER-LOCALS--measure-register-homes-for-profitable-rv32-locals/analysis/01-what-register-homes-save-in-a-picocalc-function.md) · [Slot trial](../PICOCALC-STAGED-RV32--a-staged-operand-stack-for-picocalc-rv32-compilation/analysis/02-how-a-staged-operand-stack-made-room-for-picocalc-editor.md) |
| **B1–B2, C1** (3) | Verify a content-keyed final-module cache, integrate boot hits and misses in simulator and device, and demonstrate a verified hit under 100 ms on the P4. C1 independently requires a build-image check that the default qualification profile excludes the on-device CJI compiler tool. Function fragments for edited source improve a different endpoint. [Release lab](../../20/PICOCALC-RELEASE-LAB--ship-the-playable-firmware-and-measure-literal-data-incremental-builds-and-chess-search/analysis/01-compiling-programs-and-measuring-chess-search-on-a-handheld.md) |
| **D1–D2, E9** (3) | Generate imports, trampolines and C declarations from one SDK description. Add capability, fuel and stack metadata. Compare each world's actual reactor calls with its manifest claims. |
| **E8** (1) | Qualify unsigned indices and bounds proofs against the original trap-site ceilings. A bounded proof improved an isolated, guarded Editor preview copy by about 9.5% on the P4. Cold compilation cost about 8–10% more in that experiment. [Bounds study](../PICOCALC-BOUNDED-INDEX--prove-editor-text-bounds-through-two-guards-with-bounded-search/analysis/01-proving-a-text-index-safe-in-a-streaming-compiler.md) |
| **F1–F6** (6) | Bound native stack use, implement a controlled trap exit, meter loops and reactor calls, verify emitted instructions, qualify the verifier with mutation tests and later add address masking. F1 depends on backend and SDK stack information. |
| **M1–M2** (2) | Attribute key-to-frame time by world using kernel timestamps, then measure physical keypress to visible pixels. M2 is explicitly deferred pending a logic analyzer or high-speed camera. |
| **H1–H6** (6) | Later work covers per-turn arenas, JavaScript output, a typed screen protocol and compositor conditional on M1, linear handles and typestate, PMP/user mode, and a general host/device byte-identity guarantee. |

For the compiler track, repeat **A3–A8 on today's release corpus** before choosing a production lowering. Use the staged and register-local candidates to test current Editor slot fit, physical cold compile time and the same fixed-work Chess searches. The recent literal-pool trial creates a strong independent control for cold builds. Its 49.4% Chess improvement and the fragment trial's 81.7% local-edit improvement belong to different workflows. [Release measurements](../../20/PICOCALC-RELEASE-LAB--ship-the-playable-firmware-and-measure-literal-data-incremental-builds-and-chess-search/analysis/01-compiling-programs-and-measuring-chess-search-on-a-handheld.md)

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

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
