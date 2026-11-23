---
Title: The Typed-next program
Ticket: PICOCALC-TYPED-NEXT
Status: active
Topics:
    - compiler
    - firmware
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T12:44:19.155289256-05:00
WhatFor: ""
WhenToUse: ""
---

# The Typed-next program

## Executive Summary

<!-- Provide a high-level overview of the design proposal -->

## Problem Statement

<!-- Describe the problem this design addresses -->

## Proposed Solution

<!-- Describe the proposed solution in detail -->

## Design Decisions

<!-- Document key design decisions and rationale -->

## Alternatives Considered

<!-- List alternative approaches that were considered and why they were rejected -->

## Implementation Plan

<!-- Outline the steps to implement this design -->

## Open Questions

<!-- List any unresolved questions or concerns -->

## References

<!-- Link to related documents, RFCs, or external resources -->

# The Typed-next program

PICOCALC-TYPED-FIRST (ttmp/2026/11/22) restructured the compiler, added floats and bitwise operators, moved Agenda and Files into Typed and generated Candela's kernel in Typed. It ended with a list of open problems. This program takes the ones that pay off most, in five tickets.

| Ticket | What it delivers | Why now | Depends on |
|---|---|---|---|
| PICOCALC-COMPILE-CACHE | compiled modules cached on the FAT partition, keyed by source, reactor, compiler and policy; the Typed Candela arm in the playable gallery | boot is 2.8 s slower since Agenda and Files moved into Typed, and Candela's Typed arm compiles for 85 s | — |
| PICOCALC-TYPED-VALUES | `continue`, `?:`, `u32`, more than 8 parameters per class, value records, record results, local arrays | Candela's generator works around each of these, at a speed cost | — |
| PICOCALC-COMPILER-DEVICE-COST | `JS_STRIP_SOURCE`, the P4-only pass-group slowdown, `split` in the core, one bundler | compiler memory and time on the device | — |
| PICOCALC-BOARD-HARNESS | painter wait, console timeout, health after a power cycle, the compositor overrun, bus deltas | each cost an investigation during TYPED-FIRST | — |
| PICOCALC-CANDELA-KERNEL-CODEGEN | the kernel regenerated with value types, a profile, the compiler work the profile justifies, a paired study against 1.76× | the largest measured gap between Typed and C++ | TYPED-VALUES |

Not planned, and why:
- **A JavaScript Chess.** Its only purpose would be a fallback for a compile that has never failed on the playable image. The compile cache makes a compile failure at boot rarer still.
- **The renderer core in Typed.** It is worth doing after the kernel reaches C++ speed, because its cost is small next to the kernel's.
- **PaperS3 link failures.** Unrelated to the goal.

## Rules every ticket follows

The rules of PICOCALC-TYPED-FIRST's design (`ttmp/2026/11/22/PICOCALC-TYPED-FIRST--*/design-doc/01-*.md`) apply, with these from its lessons:

- **Agents.** Each ticket is built by a subagent (Opus, `xhigh` effort) in its own git worktree, committing on its branch. It never pushes and never merges into main.
- **Diary.** A diary in the investigation format of the diary skill (`/home/manuel/.claude/skills/diary/references/investigation-entry.md`), plus docmgr tasks and changelog.
- **Board.**
  - Use the serial lock (`bench/board/device.py`).
  - Restore from the **main checkout** (`cd /home/manuel/code/wesen/2026-10-20--ds-js-os && make restore-playable`).
  - Never write `firmware/PLAYABLE.json`.
  - Peripherals are on; never use `off-by-user` unless the user switched them off.
  - After a panic that leaves the keyboard's I2C NACKing, stop board work and report.
- **Processes.** No `pkill` or `kill` one-liners; use checked Python scripts. Before reporting, stop every background shell the agent started, so the agent does not stay listed as waiting.
- **Gates.** `make test`, `make test-host` with both policies (25/25), and the 84-digest harness for refactors. A speed claim needs a paired board study.

## Execution

- **Wave 1, in parallel:** COMPILE-CACHE, TYPED-VALUES, COMPILER-DEVICE-COST, BOARD-HARNESS. Three of them use the board; the lock serializes them.
- **Wave 2:** CANDELA-KERNEL-CODEGEN, after TYPED-VALUES merges.

The coordinator merges in dependency order, reruns the gates after every merge, installs the newest playable after every merge that changes firmware, and keeps this program's diary.

## Vault reports (textbook style)

1. **Boot without compiling:** COMPILE-CACHE, COMPILER-DEVICE-COST and BOARD-HARNESS. What a boot costs, and what caching and stripping bought.
2. **Value types in a streaming compiler:** TYPED-VALUES and CANDELA-KERNEL-CODEGEN. Scalar replacement without a syntax tree, and how close the kernel came to C++.
