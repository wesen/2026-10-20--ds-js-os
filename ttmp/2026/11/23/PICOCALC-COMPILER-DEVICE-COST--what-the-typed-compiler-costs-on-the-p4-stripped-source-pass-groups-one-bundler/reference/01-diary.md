---
Title: Diary
Ticket: PICOCALC-COMPILER-DEVICE-COST
Status: active
Topics:
    - compiler
    - firmware
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Investigation diary of PICOCALC-COMPILER-DEVICE-COST: QuickJS source stripping for the compiler bytecode, the P4-only pass-group slowdown, split in the core, one bundler."
LastUpdated: 2026-11-23T12:56:32.229488128-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

The work log of PICOCALC-COMPILER-DEVICE-COST, in the investigation format of the diary skill.

## Step 1: Reading the ticket and the evidence

The ticket asks four things of the Typed compiler on the ESP32-P4: strip QuickJS source text (and maybe all debug
information) from the compiler's bytecode, find the P4-only 15-96 ms boot-compile slowdown that PICOCALC-TYPED-PIPELINE
measured but never explained, move `split` into the core bundle so Files stops loading the loop group, and replace the
three bundlers with one. This step read the program design, the ticket design, the code and the earlier evidence, and
set up the diary before any change.

### Prompt Context
**User prompt (verbatim):** "TICKET: PICOCALC-COMPILER-DEVICE-COST — measure and reduce what the Typed compiler costs on the ESP32-P4: (1) set QuickJS source stripping (JS_SetStripInfo, never called today) where the compiler bytecode is produced, measuring JS_STRIP_SOURCE vs JS_STRIP_DEBUG; (2) find the cause of the P4-only 15–96 ms boot-compile slowdown from the lazily loaded RV32 pass groups and fix or explain it; (3) move `split` (and anything small `default` needs) into the core bundle so Files does not load the loop group; (4) one shared bundler for the three build scripts."
**Assistant interpretation:** instrument the P4 compile path first (device clock around each `eval_file` and the
compile phases), then make the four changes, each measured by a paired board study, with module bytes unchanged.
**Inferred user intent:** less compiler heap and boot time on the handheld, an explanation of an unexplained cost,
and one bundler instead of three.
**Commit (code):** none yet.

### What I did
- `git merge --ff-only main` (ce0bc30 -> 6e9c08c).
- Read AGENTS.md, the program design (`PICOCALC-TYPED-NEXT`), this ticket's design, `typed_p4.c`, `quickjs.h:969`,
  the three `build.mjs`, `rv32/policy.js`, `rv32/passes/{registry,loops-group,inline-group}.js`, and
  PICOCALC-TYPED-PIPELINE's diary Steps 3-5 and `various/02-board-run-2-hoisted/summary.txt`.

### Why
- The slowdown must be explained from device timings, not from the host: callgrind already showed equal instruction
  counts (Agenda 132.35 M vs 132.4 M).

### What worked
- The evidence is consistent and specific: the board run 2 deltas are identical in every block (Files +0.024 s x3,
  Chess +0.096 s x3), which points at a deterministic cost, not noise.

### What didn't work
- No failures in this step.

### What I learned
- `JS_SetStripInfo` is read per function at parse time (`quickjs.c:32873`: `fd->strip_debug`, `fd->strip_source` from
  `ctx->rt->strip_flags`), so it must be set on the runtime that parses a compiler source. In `typed_p4.c` that is
  whichever boot compile first evaluates the source (`eval_file`, `JS_Eval(... COMPILE_ONLY)`, then
  `JS_WriteObject`); every compile runtime is made in `p4_typed_compile`, so setting it there covers every producer.
- The slowdown is not only in compiles that load a group: Agenda and Editor run `interactive` and load no group, yet
  were +15 and +17-20 ms. The TYPED-PIPELINE control was the pre-module single bundle, so its candidate changed both
  the module structure (scope hoisting, the mixed-in FunctionCode prototype) and the lazy loading.
- `default` names `version` and `split`, both in the loops group; moving only `split` does not keep Files from loading
  the loops group unless `version` (16 KB of source) moves too, or the group is split again.
- "compile rejected" is printed only by `typed_p4.c:231`; no host test prints it.

### What was tricky to build
- N/A (reading only).

### What warrants a second pair of eyes
- Whether `version` belongs in the core: the ticket says "anything small `default` needs"; `version-loops.js` is
  16 KB of source, not small.

### What should be done in the future
- N/A.

### Code review instructions
- Start at `firmware/port/esp32p4/main/typed_p4.c` (`eval_file`, `rv32_load`, `p4_typed_compile`).

### Technical details
- Board run 2 of TYPED-PIPELINE (control main e219349, candidate 211383b; 3 blocks, peripherals on):
  Agenda +15 ms, Editor +17-20 ms, Files +24 ms, Chess +96 ms, Candela (first compile) +77-80 ms; peak -149, -157,
  +34, -122, +29 KB. Bytecode: rv32.js 474,091 B -> 260,813 + rv32-inline.js 44,824 + rv32-loops.js 195,486 B.
