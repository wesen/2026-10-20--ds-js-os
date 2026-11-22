---
Title: Measuring and restoring the on-device compile budget of the four boot-compiled worlds
Ticket: PICOCALC-COMPILE-BUDGET
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "The RAY-PARITY compiler defaults made Agenda and Editor miss their on-device compile deadlines; this ticket measures every world under every step policy on the P4 and restores the budgets."
LastUpdated: 2026-11-21T22:26:51.346876387-05:00
WhatFor: "Deciding which compile policy each boot-compiled world uses, and which compile-speed work restores the default."
WhenToUse: "Before making a compiler option the default, and before installing a firmware built with a new compiler."
---

# Measuring and restoring the on-device compile budget of the four boot-compiled worlds

## The problem

The PicoCalc compiles its native worlds on the device, at boot, from Typed source. Each world's compile runs in a fresh QuickJS runtime with a wall-clock deadline and a heap limit (`port/esp32p4/main/typed_p4.c`, `p4_typed_compile`):

| World | Entry | Deadline | Heap limit |
|---|---|---:|---:|
| Files | `compileFilesRv32` | 1.7 s (`COMPILER_US`) | 2 MiB |
| Agenda | `compileAgendaRv32` | 1.7 s (`COMPILER_US`) | 2 MiB |
| Editor | `compileTypedWorldRv32` | 6.0 s (`editor_p4.c`) | 4 MiB |
| Chess | `compileTypedWorldRv32` | 6.0 s (`chess_p4.c`) | 4 MiB |

None of these entries passes compile options, so every world compiles with the compiler's default policy.

PICOCALC-RAY-PARITY made fourteen code-generation options the default, one step at a time, between its Steps 5 and 13. Each step was qualified on the P4 by a paired board run. That board run compiles only two inputs on the device: the ray tracer and a small Chess evaluation kernel. The four boot-compiled worlds were checked on the host (24 replays and the Chess engine oracle), never compiled on the device.

Installing a playable firmware built at `2712684` exposed the gap. Its boot log (`/tmp/picocalc-playable-ray-parity-2712684/install/boot.log`):

| World | Previous playable firmware (`e7b771aa…`) | Firmware at `2712684` |
|---|---:|---|
| Files | 0.32 s, 0.57 MB peak | 0.75 s, 0.89 MB peak |
| Agenda | 0.61 s, 0.83 MB | interrupted in `inlineCalls` at 1.75 s, 1.25 MB |
| Editor | 2.40 s, 2.54 MB | interrupted in `step` at 6.10 s, 3.46 MB |
| Chess | 1.94 s, 1.99 MB | not reached |

The manifest then failed to load, so the device was not usable. It was restored to `e7b771aa…` the same evening, and its eight worlds were healthy (`scripts/16-restore-playable.py` in RAY-PARITY).

## What the host predicts, and why goja misled

On the host, the RAY-PARITY workbench times compiles in goja, a bytecode interpreter, as a proxy for QuickJS on the P4. Jitless Node, which is also an interpreter, gives a different picture. Both timings are below, from Step 13 compared with `stock` (`various/58-compile-cost-steps-arms.json` in RAY-PARITY; jitless numbers from `node --jitless`):

| World | goja stock → Step 13 | jitless stock → Step 13 | Device (`e7b771aa` → `2712684`) |
|---|---:|---:|---:|
| Files | 12.0 → 40.1 ms (3.3×) | 6.4 → 12.5 ms (2.0×) | 2.4× |
| Agenda | 136.5 → 534.1 ms (3.9×) | 13.3 → 61.1 ms (4.6×) | > 2.9× |
| Editor | 1,163 → 1,893 ms (1.6×) | 52.6 → 164.4 ms (3.1×) | > 2.5× |
| Chess | 301 → 506 ms (1.7×) | 27.8 → 82.8 ms (3.0×) | — |
| ray | 21.5 → 101.4 ms (4.7×) | 8.9 → 47.6 ms (5.3×) | 0.34 → 1.45 s (4.2×) |

goja understates the Editor and Chess growth by half. On the device the Typed lexer's index is native code (`typed_lex_index_install`), but in goja the lexer runs as JavaScript and dominates the large Editor and Chess compiles. That dilutes the backend's growth. Jitless Node matches the device's ratios better. Neither proxy replaces a device measurement, which is what this ticket adds.

The jitless profile of Step 13 compiles (`node --jitless --cpu-prof`, self time) spreads the cost over every phase:

| Phase | Editor | Agenda | Chess |
|---|---:|---:|---:|
| `inlineCalls` | 8.8% | 9.0% | 12.6% |
| `planLocations` | 8.1% | 7.5% | 8.4% |
| lexer `next` (native on the device) | 7.0% | 4.2% | 6.6% |
| emitter `step` | 6.6% | 8.2% | 6.0% |
| `commuteConstants` | 3.7% | 3.7% | 3.3% |
| `versionLoops` + `transform` + `version` | 4.4% | 4.3% | 6.1% |
| `splitLocals` | 2.4% | 2.4% | 1.9% |

Inlining doubles the code that every later phase processes: Agenda's image grows from 11.3 KB to 20.9 KB at Step 7. Versioning duplicates every eligible loop on top of that.

## Measuring every world under every policy on the device

`scripts/01-stage-arms-firmware.py` builds a measurement copy of the playable firmware. It copies the tracked tree and turns `p4_typed_compile` into a wrapper. For Files, Agenda, Editor and Chess, the wrapper first compiles the world's real bundle source under each arm, passing the arm's options object as the entry's third argument. It does this for two rounds, reversing the arm order in the second, and prints one `CCARM` line per compile with wall time, heap peak, module size and an FNV-1a digest of the module. Then it performs the world's normal compile.

Every deadline in this image is 60 s, so slow arms finish and the boot completes with the Step 13 default. The heap limits are unchanged, so an arm that exceeds its world's heap fails visibly. The arms (`various/01-arms.json`) are the cumulative RAY-PARITY policies, written with `"policy":"stock"` and every field spelled out, plus the compiler's default:

| Arm | Adds |
|---|---|
| `stock` | nothing |
| `step6` | operand locations, saved homes, direct reads, instruction selection |
| `step7` | inlining in loops, capacity homes, nested weights, commutation |
| `step8` | loop rotation, constant homes |
| `step11` | shared homes, short branches, pointer homes |
| `step13` | `{}` (the default): versioned loops, split locals |

`scripts/02-run-arms-firmware.py` flashes the image's app slot and captures two cold boots, each a reset followed by a fixed-length UART capture that ends with `worlds`. That gives four measurements per world and arm, two per arm order. The script then writes and verifies the playable app and records its health. The final `worlds` query also tests whether the worlds compiled with the new default run on the device. The digests show whether each arm's module is identical across rounds.

A `CCARM` time covers the same span as the firmware's own compile line: the runtime's creation, evaluation of the compiler sources, the frontend, the backend and linking. That is the quantity the deadline limits.

## Levers

1. **Compile speed with byte-identical output.** The profile has no single dominant cost. The candidates are: allocation in the tape transforms (`inlineCalls` builds an `{at, local}` object for every `local.get` and `const`); full-tape walks of functions in which no call site qualifies; the lexer's share, which is native on the device anyway; and repeated `opClose` scans in versioning. Each change is checked by the image pins and by the device digests.
2. **A compile policy per world.** A world can name its policy in the firmware: an options object passed as the entry's third argument, which the C side already supports. A compute kernel such as the ray tracer wants every option. An interactive world wants the most optimizing policy that fits its deadline with margin. This needs no compiler change, so it restores the device immediately, but it makes "the default" mean different things for different worlds.
3. **Cheaper transforms that change output.** For example, inline or version only loops whose body does a minimum of work. This trades runtime speed for compile time inside the compiler itself.
4. **Tiered compilation.** Compile at boot with a cheap policy, recompile with the full policy when the device is idle, and swap the native module at a quiescent point. This removes the trade-off but needs runtime module replacement in the kernel.

## Decision rule

A world's boot compile must fit its deadline with at least 25% margin on the device. Until the default does that for every world, each world compiles with the most optimizing arm that fits. That choice is measured by the arms firmware, not predicted by a host proxy. An option becomes or stays the default only if the arms firmware shows every boot-compiled world inside that margin. The RAY-PARITY qualification gains one gate: the arms firmware, run with the candidate default, before the default changes.

## Plan

1. Run the arms firmware against `2712684` and publish the device table (this ticket's diary, Step 2).
2. Choose per-world policies by the decision rule and install a playable firmware that uses them, with its world list and Chess oracle checked on the device.
3. Make the compile-speed changes, measured with jitless Node and confirmed with the arms firmware, keeping images byte-identical.
4. Write the tiered-compilation design as its own ticket if levers 1 and 2 leave a gap.
