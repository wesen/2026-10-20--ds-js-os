---
Title: "Research notes for depth-indexed RV32 lowering"
Ticket: PICOCALC-COMPILER-THESIS
Status: active
Topics: [picocalc, compiler]
DocType: reference
Intent: long-term
Owners: []
Summary: "Implementation boundaries, evidence, and review points for the RV32 lowering experiment."
WhatFor: "Reproduce the measured RV32 code change and inspect the allocation invariant."
WhenToUse: "When comparing later lowering changes with f0846ba."
---

# Depth-indexed RV32 lowering notes

The assignment came from the supervisor's work division. The authored user request and its workshop framing appear in [the supervisor diary](01-supervisor-investigation-diary.md#step-1-commission-three-controlled-compiler-experiments). This branch of the workshop borrows the depth assignment and parts of A0 and A1 from NATIVE-NEXT Scope A.

## Measured boundaries

| Boundary | Control and candidate | Observation |
| --- | --- | --- |
| Lowerer implementation | `dd69a81` and `f0846ba` | JavaScript file grows by 1,502 bytes |
| Image words with exact source parity | Same application sources and import signatures | Files 1,529 → 804, Agenda 7,710 → 4,058, Editor 43,965 → 21,886 |
| Structured and ABI cases | Same Wasm body across WebAssembly and both unlinked RV32 implementations | 78 passed including 12 traps and 15 import invocations |
| Whole app host replays | Same 24 workflows, old lowerer supplied via a test preload | 24/24 at each compiler selection |
| Editor full linked ELF | Same fixed reactor and reserved slot | 240,452 bytes in both lanes |
| Files full linked ELF | Same fixed reactor and reserved slot | 24,424 bytes in both lanes |

The control lowerer SHA-256 is `cf4ea4db4f3a4ba57b614b0c9af513e48a9a28343061c640b1991a4dd552ae85`. Candidate is `6f312e42fb873f5c6a676434880eec67ea54bd39a1249d26783d9f66bbe3e26e`. Raw trials and benchmark metadata are in [instruction-counts.json](../various/lowering/instruction-counts.json). Separate cold QuickJS and whole-driver receipts are in [the supervisor's evidence directory](../various/supervisor/).

## Implementation review map

- `FunctionCode.pop` and `push` translate a depth into `t0`–`t4` or a frame spill word. `spillDepth` records the maximum written operand slot including transient call saves.
- `FunctionCode.binary` reads the right spill into `t6` and the left spill into `t5`. The result may overwrite the left input. Signed division can use `a0` for a comparison constant because no operand's home is an argument register.
- `FunctionCode.call` moves or loads arguments into `a0`–`a7`. It spills and restores the surviving register prefix around a call and inserts the result afterwards. The allocator always maintains one copy at the canonical home between opcodes.
- `FunctionCode.begin`, `end`, and `else` maintain structured entry height. Every ordinary result-producing arm writes its result to the same register or spill word. The frontend currently targets void labels with `br` and `br_if`.
- `FunctionCode.lower` computes a 16-byte-aligned frame after all instructions have been visited. The slot guarantee includes every emitted operand access and puts the saved return address above it.

The frontend still supplies eager reads of locals, frame-based variables and explicit comparisons. Delayed local/constant descriptors, branch fusion, local register allocation, and changing the reactor reservation are separate hypotheses. Restoring more than the pre-call prefix can overwrite a result that has already been installed in its home. Testing both depth 1 and depth 6 across a fully clobbering import exercises the ordering and different result locations.

## Toolchain and source anchors

Commands run from the root of `/home/manuel/code/wesen/2026-10-20--ds-js-os`. Counting and differential tests used Node v24.18.0. Host workflows used ESP cross GCC 14.2.0 from `/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/riscv32-esp-elf/bin/riscv32-esp-elf-gcc` and `ttmp/2026/11/17/PICOCALC-CJI--*/sources/cji/build/rv32/rv32emu` with its adjacent support objects. The results are host evidence.

- Prior research design is `ttmp/2026/11/19/PICOCALC-NATIVE-NEXT--*/design-doc/02-scope-a-an-rv32-backend-with-a-compile-time-operand-stack.md`.
- Ertl §5 distinguishes compiler-tracked state from runtime tracking and discusses canonical states at joins. [Stack Caching for Interpreters, PLDI 1995](https://lampwww.epfl.ch/teaching/archive/advanced_compiler/2007/resources/papers/stack-caching.pdf).
- The RISC-V psABI defines register volatility, integer arguments and stack alignment. [RISC-V integer calling convention](https://riscv-non-isa.github.io/riscv-elf-psabi-doc/#_integer_calling_convention).
- WebAssembly specifies the operand stack, structured control and signed division/remainder semantics. [WebAssembly Core Specification](https://www.w3.org/TR/2024/CR-wasm-core-2-20241217/).
