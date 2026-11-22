# Feedback on "5. Code Generation: From a Stack Machine to a Register Machine"

Reader: student, first pass, working only from the article. I have not seen Articles 1, 2 or 9, and I have not seen the compiler or the experiment code.

## Passages I had to read twice

1. > ```
>    slt  t0, t1, t0        # t0 = 1 if 0 < a, else 0
>    sw   t0, 12(sp)        # push the truth value
>    lw   t0, 12(sp)        # pop it
>    bnez t0, +8            # if true, skip the next instruction
>    j    after_if          # otherwise jump past the block
>    ```
>
   These five lines appear with no preamble about where `t1` and `t0` got their values. The surrounding prose says only "The comparison is computed as a number, 0 or 1, pushed and popped like any other value, and then tested", which does not say that `a` was loaded into `t1` and the constant `0` into `t0`, nor why the operands are in that reversed order (`i32.gt_s` compiled as `slt` with swapped operands). I had to reconstruct the two missing loads to convince myself the snippet was consistent. They should be shown, or the number of omitted instructions stated.

2. > "The complete function is 41 instructions."

   I cannot check this. The article shows ten instructions for `let a = b + c`, five for the `if` test, and nothing for the `return a` epilogue, the frame setup or the `sw` of `a = a + 1`. Adding up what is shown gives about 20, so 21 instructions are unaccounted for and I have to take the number on trust — which is awkward in a section whose whole method is counting instructions by hand.

3. > "Two situations do *not* require a flush. A trap ends the world's turn, and nothing reads the frame afterwards."

   "The world's turn" is not defined anywhere. I eventually guessed it means the JavaScript event loop's turn (the compiler and generated code run inside QuickJS), so a trap aborts the turn and no further code observes the frame. But a reader who does not already know the runtime model cannot get that from the sentence, and the sense of "the world" is not recoverable from context.

4. > "In the counting model described below, flushes account for 155 of 16,544 instructions in Editor, under one percent. Pending values at a join are rare because most joins occur between statements, when the operand stack is empty."

   Read the first time, this looks like a forward reference to a model that has not been described — and in fact the model *is* described "below", in section 5.8, after the paragraph in 5.5 has already quoted one of its results. Reading the numbers before knowing what Model A and Model B are is confusing; the flush measurement belongs in 5.8 with the other counts, or the forward reference should be explicit ("Model A alone, defined in 5.8, ...").

5. > "Its limit is that it sees only the window. It can turn `sw t0, 12(sp); lw t0, 12(sp)` into the store alone, and it cannot delete the store without knowing that slot 12 is never read again, which requires information from outside the window."

   I read this twice because the first sentence says the pass "can turn the pair into the store alone" and the second says it "cannot delete the store" — both true, but the second clause is about a further step (deleting a store made dead by the copy). The intended reading is: it can delete the redundant *load*, but it cannot remove the *store*, because the store's redundancy depends on what happens after the window. One word ("the pair into the store alone, but no further") would remove the trip.

## Terms used before they were explained, or never explained

- **PR** — quoted in section 5.7: "spill the PR that contains the value whose next use is farthest in the future". PR is never expanded. It is presumably "pseudo-register". This is the most damaging abbreviation in the article because it sits inside the one quoted rule the section asks the reader to remember.
- **spill / spilling** — used in 5.7 ("some must stay in memory", "without spilling") but never defined as an action.
- **trap** — section 5.5 assumes the reader knows what a trap is and that it terminates execution.
- **the world's turn** — section 5.5, never explained (see above).
- **SSA** — section 5.10: "An optimizing backend with SSA". Never expanded to "static single assignment" and never explained.
- **lowering / lowering to RV32** — section 5.11: "lowering to RV32 accounts for 41 percent of the native compile path". The word "lowering" is used as a technical term without definition; section 5.2 earlier says "translation", so the reader has to infer these are the same thing.
- **QuickJS** — section 5.11: "Both run inside the QuickJS interpreter." Assumed background, never introduced.
- **Amdahl's law** — section 5.9, named with a pointer to Article 2 but not stated.
- **bounds check**, **range-check elimination** — 5.9; "bounds check" is reasonably guessable from `charCodeAt`, but neither is defined.
- **slt, bnez, lhu, slli, addi, blez, ret, li, 1f** — only `lw`, `sw`, `add`, `blt` and `j` are introduced in 5.1. The rest appear first in code and are never glossed. `1f` (a forward local numeric label) appears in the hand-written `bump` in 5.2 with no explanation, which matters because the reader is asked to accept that version as "4 instructions" without knowing what the suffix means.
- **operand stack / slot / frame** — these are defined, and well (5.1, 5.2). Worth saying because the article is inconsistent about which terms it introduces.
- **Liftoff** — introduced correctly as "V8's baseline WebAssembly compiler" (5.5). Fine.

## Claims I could not verify from the article itself

1. > "the measured 34 percent is therefore an upper bound on what the window alone can find, and the realistic gain is about half of it."

   The 34.1/33.4/34.3% row is in the table, but "about half of it" is a new number with no measurement behind it. What is missing: either a count of how many of those store-load pairs are followed by no further read of the slot (a two- or three-instruction window count the same experiment could have produced), or a citation for the factor of one half.

2. > "In Editor, 31 of 120 functions are leaves."

   No supporting table in this article. Section 5.8's table has function counts (120 functions) but nothing about leaves. Missing: the per-application leaf count, or a pointer to which experiment produced it.

3. > "The typed applications rarely stress this: the deepest operand stack in Editor is 8, and 100 of its 120 functions never exceed 5."

   Same problem — a precise statistic with no table, experiment or reference. It is also the sole support for the claim that seven temporaries suffice, so it carries weight it cannot bear as an unbacked sentence.

4. > "The typed compiler translates `p && q` into a WebAssembly block that leaves 0 or 1 on the stack; there are 228 such blocks in Editor."

   No source given for 228. This is a frontend property, so it is plausible that Article 2 or 3 measured it, but the reader of this article alone cannot check it and is not told where to look.

5. > "Experiment 3 found that lowering to RV32 accounts for 41 percent of the native compile path and tokenizing for 16 percent."

   No table, no method, no definition of "the native compile path". This is the only evidence in section 5.11 and it is stated purely in prose, unlike Experiment 1 and 2, which both get tables. Missing: a breakdown table with absolute times, and the measurement conditions.

6. > "the project has already seen one such change cut a link step from 483 ms to 259 ms and its memory from 1.36 MB to 0.41 MB."

   No reference, no date, no commit, no measurement setup. These are exactly the kind of numbers a reader wants to check and cannot.

7. > "It would also add compile time and memory on a device where the compiler already takes two to three seconds."

   "Two to three seconds" appears without the experiment that produced it. Compare section 5.11, which gives 41% and 16% but no absolute total, so the reader cannot reconcile the two statements.

8. > "Model B already brings native code within a factor of about 1.3 of hand-written code on this example"

   Checkable for `countUnit` (17 vs 13 = 1.31), and it is qualified "on this example", so this one stands. Listed only to note that it is the one model-versus-hand claim that *is* verifiable, which makes the unverifiable ones stand out more.

9. > "Its authors report a WebAssembly compiler that generates code 4.9 to 6.5 times faster than Liftoff"

   Attributed to [Xu & Kjolstad 2021], and the article makes no attempt to verify it — which is legitimate for a cited external result, but the reader should be told the claim is the authors' report rather than project measurement. It is, in fact ("Its authors report"). No complaint, noted for completeness.

## Section scores

| Section | Score | Reason |
| --- | ---: | --- |
| 5.1 Two machine models | 5 | The stack-versus-register contrast is set up cleanly, the register table is exactly what the rest of the article needs, and every RV32 instruction used later is introduced here (except the ones it forgets). |
| 5.2 The current translation, by hand | 3 | The ten-instruction table is excellent and the one-in-ten framing lands, but the `if` snippet omits its operand loads and the "41 instructions" total cannot be reproduced from what is shown. |
| 5.3 How much of the output is waste | 4 | The table is clear and every later section points back into it by row, which is good design; only the unexplained "half of it" claim in 5.4 undermines the row about store-load pairs. |
| 5.4 Technique 1: a peephole pass | 3 | The technique and its window limit are explained well, but the quantitative conclusion ("realistic gain is about half") is asserted rather than measured, and the "can turn... / cannot delete..." pair reads as self-contradiction on first pass. |
| 5.5 Technique 2: a compile-time operand stack | 4 | The three-kinds-of-entry idea and the four-instruction table are the clearest teaching in the article, and the flush rule is stated as a requirement with a reason; it loses a point for the forward reference to the counting model and for "a trap ends the world's turn". |
| 5.6 Technique 3: branches without truth values | 4 | Pending comparisons and the short-branch-plus-patch trick are both explained clearly and connected back to 5.2 and 5.3; the digression into `&&` and destination-driven generation is interesting but arrives faster than the rest. |
| 5.7 Technique 4: locals in registers | 3 | The leaf/non-leaf split is well motivated and the Best's-algorithm example with three-versus-twenty instructions is genuinely helpful, but the quoted spill rule depends on "PR", which is never defined, and three statistics here (31 leaves, 228 blocks, depth 8) are unsourced. |
| 5.8 A counting model of the gain | 4 | The model definitions are crisp, the table is the payoff of the whole article, and the limits paragraph is honest; I checked 2.7x, 3.3x, 110–123 KB and 1.3x against the table and they all come out right, which is not true of most prose numbers here. |
| 5.9 What one pass cannot do | 3 | The seven-instruction loop is the most convincing artifact in the article, but the reader is never shown where `t1` (the length) and `a0`/`a1` come from, so the claim that three optimisations are hiding in it has to be taken on the prose. |
| 5.10 Techniques considered and set aside | 3 | The three rejections are each argued on a real constraint (build step, flash, compile time) rather than waved away, which is good; but the citation density is high and nothing here is checkable from the article. |
| 5.11 The compiler's own speed | 2 | The section's entire evidence is two percentages and a memory anecdote with no table, no method and no absolute numbers, while every other experiment in the article gets a table; the Wirth and Lua tradition paragraph is the only part that lands. |
| 5.12 Key points | 5 | Six points that map one-to-one onto the six techniques and the one negative result; I could use this as an index back into the article. |
| 5.13 Check your understanding | 4 | Every question is answerable from the text, which is rarer than it sounds, but question 1 depends on a `i32.const` translation the article never shows. |

## Questions that the article did not let me answer

**Question 1** is the one with a real gap. The article's table in 5.2 shows translations for `local.get`, `i32.add` and `local.set` only. Question 1 requires translating `i32.const 1` in the current backend, and the article never shows what that emits. The rule as stated ("load its inputs from their slots, compute, store the result to its slot") makes the answer derivable — two instructions, materialise then `sw` — but a reader cannot confirm whether the backend emits `li` or `addi t0, zero, 1`, or whether it might already fold small constants. What is missing is one more row in the 5.2 table.

**Question 2** is answerable, and well supported, because 5.5's table is exactly this translation with `b + c` substituted for the constant, and the prose even says "`a + 1` becomes the single instruction `addi t0, t0, 1`". No gap.

**Question 5** is answerable but the wording invites over-claiming. The question asks "what does that leave unproven", and the article lists the model's limits in 5.8, so the ingredients are there. What would have helped is a sentence in 5.8 saying explicitly which of the limits could invalidate the *ratio* rather than merely the absolute count.

**Question 6** is answerable, since 5.9 names all three optimisations and the kind of analysis each needs.

So: one question (1) is only derivable, not answerable by confirmation; the other five are properly supported.

## One thing to add and one thing to cut

**Add:** a worked instruction count for the *whole* of `bump` — the same table style as 5.2, continued through the `if`, the `a = a + 1`, the `return` and the epilogue — showing where the remaining 21 instructions of the 41 come from. The article's method is counting, its central claim is a count, and the one function it steps through by hand accounts for only half its own total. Filling that gap would also make question 1 fully answerable, since the missing `i32.const` row would have to appear.

**Cut:** the second half of 5.11, from "The broader tradition is worth knowing" to the end of the section, or rather move it to 5.12 — the Wirth and Lua paragraph restates the introduction's trade-off and 5.10 already made the copy-and-patch-versus-compile-time-stack argument. Cutting it would not lose a claim; the section's real problem is that 41% and 16% float without a table, and the space is better spent on that table. If something must go entirely rather than move, cut the "typed byte arrays" precedent sentence in 5.11 (483 ms to 259 ms, 1.36 MB to 0.41 MB), which is a project anecdote with no reference, in a section that already has too few sourced numbers.
