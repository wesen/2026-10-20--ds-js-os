---
Title: When a Streaming Compiler Should Remember a Divisor
Ticket: PICOCALC-BOUNDED-FACTS
Status: active
Topics:
    - performance
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-rv32.js
      Note: Signed guards and per-function streaming in the production control
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Emits numeric operations and enables the arithmetic indicator
ExternalSources: []
Summary: "Design and preregistration for bounded signed divisor analysis in the streamed RV32 compiler."
LastUpdated: 2026-11-19T20:23:55.07213836-05:00
WhatFor: ""
WhenToUse: ""
---

# When a Streaming Compiler Should Remember a Divisor

A typed PicoCalc application ships with a small source compiler. At start-up the compiler checks the source and turns it into RV32 machine instructions. It currently builds one function’s numeric operation array, lowers it, and releases the array. This study asks when a compiler with that lifetime should spend work learning facts about a single function.

Consider `return x / 60;`. The function first emits operations for `x` and `60`, then signed division. The target instruction returns a machine value on dividing by zero or overflowing. The typed language uses WebAssembly integer semantics, which trap in those two cases. A compiler that sees a divisor of 60 can prove both failures impossible. With a divisor passed in as a parameter, it needs both guards. [WebAssembly numerics](https://webassembly.github.io/spec/core/exec/numerics.html#op-idiv) · [RISC-V M extension](https://riscv.github.io/riscv-unified-db/manual/html/isa/isa_20240411/chapters/m-st-ext.html#_division_operations).


## The proof runs before machine-code emission

The numeric operations are in postfix order. For `x / 60`, the get for `x` comes first, then `i32.const 60`, then the division. Each operation and operand occupies a numbered cell. Decode by opcode width so an operand with the numeric value of `i32.const` cannot be mistaken for an instruction. The division site remembers only which guard predicates are false. Its record can disappear as soon as the backend emits that function.

The first pass identifies constant local slots. Imagine `let unit = 60; return x / unit;`. The compiler gives `unit` a slot number unique to its declaration. A single root-level write of 60 initializes that slot. Every execution reaching the later read passed the write, because all forward targets inside a structured block stay inside the enclosing structure and a return exits the function. If any other instruction writes the same slot, reject the fact for the whole function. This avoids needing to reason about which conditional write ran or how many times a loop iterated. If a nested block shadows the name, its slot number differs and is tracked separately. Direct positive or negative constants need no slot.

The second pass reads each division and remainder. The instruction immediately before it can supply the divisor. A constant pushes its value and a local read pushes that slot’s current value. A branch, control marker or call between the producer and site breaks the match. Record a bit for nonzero and a bit for division overflow known impossible. Scan the records in order as the backend lowers the exact function. An empty record list gives ordinary lowering.

```text
for function in source order:
    if policy admits its numeric cells:
        scan decoded operations for single root-level constant writes
        scan decoded operations for divisors proved by preceding producers
    lower function, consulting proofs only at the matching arithmetic offsets
    release proofs and the numeric operation array
```

The local table needs an explicit unknown state, because zero is a real signed value. The proof test also needs to distinguish source-level unary minus from its numeric representation. The small matcher recognizes a two-constant subtraction only when the first constant is zero. The actual emitted operand operations remain in their original order. For `x / -1`, preserve the overflow guard and the signed division. For `x % -1`, remove the zero guard and preserve the signed remainder. The ordinary reference result for the smallest signed value modulo minus one is zero.

Begin with a literal and a local initialized to a literal. Compare the counted guard words to what disassembly emits. Add a mutable divisor with a conditional write, a loop divisor that changes, and a negative constant. Exercise each with the same args on WebAssembly and RV32. Then wire the fixed policy decision before the pass and compile Files and Agenda through their ordinary entry points. Commit the held-out prediction as its own record before running the Editor lane.

## Preregistration for the PicoCalc experiment

Local operator record. The design below uses the signed arithmetic contract of the compiler at `40bcf850a5809ef6d839127869faa952596ed157`. The experiment lives in a ticket overlay. Board compilation uses the ordinary Files, Agenda and typed-world RV32 wrappers. Save SHA-256 digests of the raw instruction image and the complete reactor ELF, the built app source and the compiler scripts. The linked ELF has a preallocated region for code, so the raw image is the measure of instruction size.

| Policy | Analysis admission |
|---|---|
| Control | Use the pinned compiler files byte-for-byte. |
| Always | Attempt every function with at most 2,048 numeric cells. The function limit applies to both analysis policies. |
| Select | Admit a function in source order if its numeric emitter saw at least one signed divide or remainder, it contains at most 2,048 numeric cells, and the remaining per-compilation budget covers twice its cell count. Deduct the charge before starting. Start with 32,768 cell visits. Skip functions that do not fit and permit later functions that do. |

The budget counts worst-case visits over the two passes, including immediately decoded operands. A function larger than the cap, an unrecognized opcode, or exhausted proof storage leaves the affected arithmetic guards in place. Allocate scratch only after admission. Use fixed arrays for 128 local slots and 128 proof sites. Their combined byte length is the upper bound on explicit backing-store space at one time. Store a local’s signed value, state and defining offset. Store a proof site’s offset and two guard bits. Release the local table before returning the proof sites, and discard sites when lowering ends. Use each proof only at the exact decoded site. The allocator’s global high-water remains a separate physical reading.

The implementation may recognize a numeric constant directly and a signed negation emitted as `i32.const 0`, `i32.const N`, `i32.sub`, with an i32 result. For local proofs, require a single decoded write in the entire function, following a recognized constant at root depth, and require that write to precede the use. Ignore parameters and slots beyond the table. Each other write invalidates the slot, including writes in loops and unreachable branches. Calls cannot mutate the caller’s scalar local slots. Whole control-flow results, runtime loads and other operations do not qualify as constant producers. At each division or remainder, an immediately preceding recognized producer supplies the top operand. A control marker ends that adjacency. After removing the proved guard, preserve operand evaluation and the native arithmetic instruction.

Production emits two words to trap on a zero divisor. Division emits seven more words to guard the one unrepresentable quotient. A known nonzero divisor removes the zero guard. A division with a known nonzero divisor other than minus one removes both guards. Remainder by minus one returns zero even for the smallest signed integer. The fixture will check all of these cases. It will also check nested block shadowing, mutation, loop writes, imported callbacks and value-producing control expressions where applicable to the fixture. Unknown expressions must retain div or rem behavior.

### Training and the held-out transfer test

Use the exact pinned `picocalc-os/worlds/files/files.typed` and the Agenda native wrapper source, which combines the pinned `reminder.typed` then `entry.typed`. Files provides a negative example because source inspection found no divide or remainder. The Agenda calendar code supplies many literals and the formatter supplies a mutable divisor. The training run will establish the share of possible savings that Select can recover and the cost of visiting functions. Commit a numerical prediction informed by that run, and the training receipts, before building Editor with any of the policies.

Editor is the only held-out app. Use the pinned `picocalc-os/worlds/editor/source.list` concatenation as performed by the native reactor build. It is a complete previously shipped app and shares the compiler with training. At preregistration I have not read its source or compiled it with these policies. The preregistered device workflow is the existing native 64 KiB Editor preview replay (`03-check-large-preview-on-p4.py --engine native --long-inline` from PICOCALC-EDITOR-CAPACITY at the pinned revision), when the supervisor can install and select the tested module for the replay. The fixture is the exact UTF-8 markdown heading and suffix from that script, padded with byte `d` to 65,536 bytes. It opens the file, enters preview, captures a verified framebuffer, moves one page, captures again and removes the scratch file. Match expected file size, screenshot comparison outside the status clock, verified CRCs and cleanup. Record precisely which compiled module the workflow exercises. If the board slot permits only cold compilation, use the qualification status for that scope and run the host arithmetic and byte-level app checks. Mark Editor guest replay unavailable. Report net dynamic execution only for an actual measured kernel.

The training guest kernel is Agenda’s unchanged `entryWeekday(today)`. Run dates 19990101, 19991231, 20000229, 20000301, 20240229, 20241231, 21000301 and 21001231. Compare to the existing Wasm frontend’s output and report each RV32 image’s result digest and emulated instruction counts. When a physical cycle slot is available, repeat these fixed inputs in each order block under the same timing harness. Measure the signed arithmetic edge cases in a separate emulated program, checking ordinary Wasm return values and required traps. Keep each expected trap in its own invocation so a trap early in the series cannot hide a later case.

### Evidence and decision rule

Measure both app-level cold compile elapsed time and a separately instrumented host helper time. Prototype policy reporting records functions seen and admitted, charged cells, explicit peak table bytes, proof records, guards omitted by type, and image words per function. Compare device time and allocator peak using the supervisor’s rotated order within each boot. Report per-block differences, median and range. The host phase timer describes a different runtime from the device cold timer. Link every time and memory row to an output hash. Require equal native results and preserved traps before interpreting performance. Reject the selective strategy if it saves fewer than 75% of Always’s emitted-word reduction on Editor, or if it performs no less charged work than Always. If both produce zero improvement, record an empty opportunity and compare costs. A fixed work claim applies to charged numeric cells and array storage, while an actual time or heap claim requires the physical measurements.

## Research provenance

Claude Opus 5.5 at high effort drafted the generic two-pass proof, the control-flow argument, the three-policy comparison and the arithmetic edge fixture design in a tool-free session. The prompt described a fictional compiler with public instruction semantics. It included no PicoCalc files, source-derived workload facts, outcomes, or project paths. The local operator verified the design against the pinned compiler and fixed the smaller budgets, parser-side selector, proof layouts, actual app inputs and scope. In particular, the prototype keeps the entire ordinary guard sequence for a known zero, avoids allocating a decoded copy of the function, and preserves the instructions that produced every operand. [Research receipt](../various/opus-design-receipt.json).
