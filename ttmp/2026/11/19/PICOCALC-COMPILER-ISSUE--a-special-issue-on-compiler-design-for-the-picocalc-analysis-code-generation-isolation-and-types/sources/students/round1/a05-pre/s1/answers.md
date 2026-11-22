# Answers — "5. Code Generation: From a Stack Machine to a Register Machine"

*Written without access to the article. Every answer states its assumption about the
instruction set, and flags where the article's own numbers may differ.*

---

## 1. Naive translation of `x = y + 1`

I take the "current backend" to mean the literal scheme implied by the question: each
WebAssembly operation is compiled in isolation, the operand stack is *real*, living in
memory, with depth 0 at offset 8 and depth 1 at offset 12. A push is "compute into a
register, store to the next stack slot"; a pop is "load from the slot". With that
reading:

| wasm op | emitted | stack depth after |
|---|---|---|
| `local.get y` | `ldr r0,[fp,#0]` ; `str r0,[fp,#8]` | 1 |
| `i32.const 1` | `mov r1,#1` ; `str r1,[fp,#12]` | 2 |
| `i32.add` | `ldr r2,[fp,#8]` ; `ldr r3,[fp,#12]` ; `add r2,r2,r3` ; `str r2,[fp,#8]` | 1 |
| `local.set x` | `ldr r4,[fp,#8]` ; `str r4,[fp,#4]` | 0 |

That is **9 instructions** (or 8 if your backend stores a constant directly to memory
without a separate `mov`, which would make `i32.const 1` a single instruction). The
salient fact is not the exact number but where the cost sits: six of the nine are pure
traffic to and from the operand-stack slots at offsets 8 and 12, and the real work
(`add`) is one instruction.

Confidence: 3

---

## 2. Same statement with a compile-time stack, lazy constants and locals

Now the compiler keeps the operand stack only in its own head: an entry is either a
*local reference* (`y@0`), a *constant* (`1`), or a *pending expression* (an operator
applied to entries). Nothing is emitted until a value is actually consumed by something
that needs a real machine location.

| wasm op | compile-time stack after | emitted |
|---|---|---|
| `local.get y` | `[ y@0 ]` | — |
| `i32.const 1` | `[ y@0 , 1 ]` | — |
| `i32.add` | `[ add(y@0, 1) ]` | — |
| `local.set x` | `[ ]` | `ldr r0,[fp,#0]` ; `add r0,r0,#1` ; `str r0,[fp,#4]` |

**3 instructions.** The local reference costs no load until it is used; the constant
never becomes a value at all, it folds into the immediate field of `add`; and the store
to `x` is the only unavoidable memory write. So the comparison is 9 → 3, and the
reduction comes entirely from materialising operands at the point of use rather than at
the point of definition.

Confidence: 3

---

## 3. Why pending values must be moved to agreed places before a join

Because a join block (the `end` of an `if`, the header of a loop, the target of a
`br_if`) is compiled **once** but reached from **several** predecessors, and each
predecessor may have left the logical operand stack in different physical form — one in
`r0`, one folded into an immediate, one already spilled to a slot. The join code has to
assume one layout, so every pending value must be forced into that single agreed layout
on every incoming edge first.

This is a **correctness** matter, not a code-quality one. If predecessor A leaves the
value in `r1` and predecessor B in `r2` and the join reads `r1`, B's path silently
computes the wrong answer; there is no local repair, because the join has already
committed to a location. Choosing *which* agreed locations (all in registers, all in
slots, or a mix) is a quality decision; *that* they agree is not negotiable.

Confidence: 4

---

## 4. Why `if` costs a conditional branch plus an unconditional jump

Because the backend is a one-operation-at-a-time translator: at `if` it knows only "the
next block runs when the condition is nonzero", so it emits a conditional branch to a
label after the then-arm. At the end of the then-arm it knows only "we have reached
`end`/`else`, so control must not fall into the other arm", so it emits an unconditional
jump past the else-arm. Neither decision can look ahead to see that the jump is
unnecessary — the redundancy is a consequence of local, gapless translation, and it is
emitted for *every* `if` regardless of shape.

I cannot know this without the article: I do not have the section 5.3 measurement, so I
cannot quote its numbers. The only thing that can be said in advance is what such a
measurement *must* show for the argument to work — that the unconditional jump is
usually droppable. The two natural classes of droppable jump are (a) `if` with no else
arm, where the branch target and the jump target coincide, and (b) either arm ending in
a `br`/`return`, where the jump is dead. If roughly half of the `if`s in a real corpus
have no else arm, the honest claim is "most of these jumps are never taken and could be
elided", not "all".

Confidence: 2

---

## 5. What exact reproduction of the 161-function instruction count establishes

It establishes that the counting model is a **faithful model of the existing
backend** — the abstraction it uses (what counts as one instruction, what is folded,
what the per-op overheads are) tracks the real emitter function-by-function, with no
drift accumulating over 161 functions. That is what makes it legitimate to use the model
as a *baseline*: the "today" number in any table is not a guess but a re-derivation.

What it leaves unproven is the **extrapolation to models A and B**. Reproducing today's
counts only exercises code shapes the current backend already produces; models A and B
introduce shapes it never produces (materialisation at point of use, lazy constants,
register-resident values, elided jumps). The model could well be exact on the old shapes
and wrong on the new ones — for example if an anti-optimisation pattern, a fixed prologue
per function, or a fixed per-basic-block cost is baked into the model and does not
survive the change. Validating a model on data it was fitted to is not validation; the
predictions for A and B need either a second measurement against a real modified
backend, or at minimum a hand-check of a few functions in each new shape.

Confidence: 3

---

## 6. Two things in the hand-written loop a one-op translator cannot produce

I cannot know this without the article — I have not seen section 5.9's listing — so this
is a reasoned guess at the two most likely items, with the knowledge each demands.

- **Strength reduction / induction-variable rewrites**: turning `i * 4` into a shift or a
  pointer bump, and maintaining that pointer incrementally across iterations. This needs
  *knowledge of the loop as a whole* — which variable is the induction variable, what its
  stride is, and that no aliasing write invalidates the derived pointer. A translator
  that sees one `i32.mul` at a time has no notion of "iteration".
- **Fusing the array access into one addressing mode** (`ldr r0,[r1,#i,lsl #2]`, or a
  pre/post-indexed load) so that address arithmetic, load and store are not separate
  operations. This needs *knowledge of the target machine* (which addressing modes exist
  and what their encoding limits are) plus knowledge that the address and the index are
  used once, which again is a whole-statement property.

Both are the same root cause: the hand-written loop is the product of a compiler that can
see an entire statement or an entire loop, while the one-op translator is structurally
forbidden from seeing more than the instruction in front of it.

Confidence: 2
