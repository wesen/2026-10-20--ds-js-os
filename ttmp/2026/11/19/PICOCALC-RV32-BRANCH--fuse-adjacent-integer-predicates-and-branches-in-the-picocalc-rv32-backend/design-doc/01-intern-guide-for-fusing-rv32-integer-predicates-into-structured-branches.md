---
Title: Intern guide for fusing RV32 integer predicates into structured branches
Ticket: PICOCALC-RV32-BRANCH
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design and qualification guide for the PicoCalc RV32 adjacent predicate experiment."
LastUpdated: 2026-11-19T19:30:44.901982139-05:00
WhatFor: ""
WhenToUse: ""
---

# Intern guide for fusing RV32 integer predicates into structured branches

The PicoCalc RV32 compiler receives an array of structured integer operations from the typed frontend. A comparison normally writes a boolean to the current operand stack home. The conditional operation immediately after it reads that boolean and decides whether to transfer control. This experiment asks how much application code and execution the compiler can save by testing the original inputs directly.

## Starting point

Use revision `6426798f69c691f5c1979233ebdeb540f8ce7c61`. In `picocalc-os/compiler/typed-rv32.js`, `FunctionCode` assigns operand depths zero through four to `t0` through `t4`. Deeper values use 32-bit frame slots. `pop(T5)` or `pop(T6)` lowers the abstract height and loads a frame operand into the supplied scratch register if necessary. Arithmetic and comparisons consume operands, write their result in the next available depth, and push it onto the abstract stack. `begin(0x04)` consumes one condition before recording an `if` frame. The `0x0d` case consumes one condition and takes a branch to the loop start or block end when the condition is nonzero.

The previous depth-indexed register study reduced the three application images to 804 words for Files, 4,058 for Agenda, and 21,886 for Editor. It kept comparison results eager. The Scope A2 design proposes delayed comparison entries over a richer virtual stack. This experiment tests a narrower rule using the production depth-indexed implementation and adjacent frontend operations. The Scope A2 model includes lazy operand evaluation and has a different baseline. [Scope A tasks](../../PICOCALC-NATIVE-NEXT--a-smaller-rv32-backend-a-module-cache-safety-checks-and-await-for-typed-picocalc-worlds/design-doc/02-scope-a-an-rv32-backend-with-a-compile-time-operand-stack.md) · [Measured register baseline](../../PICOCALC-COMPILER-THESIS--cold-compilation-and-bounded-analyses-on-the-picocalc/various/reports/lowering.md).

## The equivalence to implement

A comparison over two integers consumes both and produces one integer with value zero or one. The following conditional consumes that integer. When the two operations are adjacent, a direct RV32 comparison and branch has the same net effect on the operand stack and selects the same successor. For `if` the explicit jump takes the alternate path when the condition is false. For `br_if` it takes the label path when the condition is true. The branch emitter accepts the predicate for taking the jump. It emits the inverse as a local branch over an unconditional `jal zero,target`. This distinction matters because the opcode seen in the image is the inverse of the logical jump predicate. [WebAssembly execution semantics](https://www.w3.org/TR/wasm-core-2/#exec) · [RV32I control transfer](https://docs.riscv.org/reference/isa/unpriv/rv32.html#conditional-branches).

| Frontend operation | True predicate for `br_if` | False predicate for `if` |
| --- | --- | --- |
| `i32.eqz a` | `beq a,zero` | `bne a,zero` |
| `i32.eq a,b` | `beq a,b` | `bne a,b` |
| `i32.lt_s a,b` | `blt a,b` | `bge a,b` |
| `i32.gt_s a,b` | `blt b,a` | `bge b,a` |
| `i32.le_s a,b` | `bge b,a` | `blt b,a` |
| `i32.ge_s a,b` | `bge a,b` | `blt a,b` |
| `i32.ge_u a,b` | `bgeu a,b` | `bltu a,b` |

The funct3 values are 0 and 1 for equality, 4 and 5 for signed ordering, and 6 and 7 for unsigned ordering. In each pair, XOR with one complements the test. The original operand order still determines the relation. For `x <= y`, reversing the operands changes the test to `y >= x`, which includes equality. The unsigned check matters for the frontend's buffer operations. An index of `-1` has the bit pattern `0xffffffff`, which is greater than any supported buffer length under unsigned ordering and must select the trap arm.

Accept one optional adjacent `i32.eqz` between the predicate and branch to cover negated comparisons and loop exit tests. That extra opcode flips the true predicate. The lookahead is limited to two cells after the current opcode. The array is the frontend's structured representation, where operands and numeric immediates occupy separate cells. The lookahead starts after an opcode whose arity as an instruction is known and whose encoding has no immediate cells. Advance the reader only once a supported consumer has been found. A comparison that feeds assignment, return, a call, or a longer expression still computes its ordinary zero-or-one value.

## Preserve the operand and control invariants

Read the right operand first into `t6` when spilled. Then read the left operand into `t5` when spilled. The predicate uses the two resulting locations, in the selected order. A unary `eqz` uses `zero` for its right operand. Neither operand is written by the RISC-V branch. The number of popped operands is identical to the baseline's net change after materializing and consuming the boolean. `begin` records the post-pop height so both arms still begin above the same live operand prefix. `br_if` must interpret the label index with the same current control stack as `br` and the ordinary `br_if` path.

```text
look up predicate encoding for the current opcode
look ahead for if or br_if, allowing one optional eqz
if the lookahead matches:
    consume only the matched opcode cells
    read predicate operands from their existing homes
    complement the predicate if an additional eqz was consumed
    if consumer is if:
        reuse the ordinary block opening with the supplied operand registers
        jump to alternate on false
    else:
        read the usual branch label index
        jump to that label on true
```

The baseline for `if (a > 0)`, after its two inputs have been read, emits `slt t0,t1,t0`, `bne t0,zero,+8`, and `j alternate`. The candidate emits `blt t1,t0,+8` and `j alternate`. The condition's constant still occupies its ordinary home because operand production is eager. The B-type predicate always branches by eight bytes. The target is reached by the current J-type relocation, so the rule applies equally to a short arm and one longer than 4,096 bytes. Identical control flow preserves the number of taken unconditional jumps on a fixed execution.

A shallow signed comparison should save one or two words according to its baseline boolean sequence. An optional `eqz` can save another word. A spilled boolean result can also save the store and subsequent load, although reads of the original operands are still required. Distinguish these savings from branch shortening. A separate experiment could change relocation layout and measure the effect of eliminating the unconditional jump.

## Implementation and measurement sequence

1. Save a patch against the pinned baseline in this ticket. Build an isolated compiler pair from the same tracked commit and apply the patch only to the candidate directory. Confirm that the two compiler trees differ only in the backend.
2. Compare all three application images through `typedRv32.compile`. Compute their SHA-256 digests, words per function, and opcode mix. Compare buffered and streaming code, signatures, record layouts, entry offsets, and relocation records within each compiler. Run app packaging through the normal Files, Agenda, and typed SDK entry points.
3. Compare WebAssembly with both RV32 images on signed extrema, equality, reversed arguments, and zero. Exercise `if` with two arms, result-producing joins, `while`/forward exits, late materialization, spilled operands, and names obtained from calls. Assert buffer bounds with an index below zero, at zero, at the last valid index, and at the length. Include one large arm to verify the long jump. Record linked emulator output identities for normal app paths.
4. Measure complete driver steps under the RV32 emulator for fixed app workflows. Use the same executable, inputs and module pathname for each pair. Capture full stdout hashes and each raw guest count. Count instructions as guest work. Physical hardware timing requires the same board, compiler build conditions, data layout and workflow on both runs.
5. Record node, cross-GCC, and emulator versions and binary provenance. Keep benchmark scripts, the exact patch and raw outputs together. Report which outcomes came from the isolated source comparison, emulator, or board.

The patch remains experimental in this ticket while the supervisor evaluates the paired hardware result.
