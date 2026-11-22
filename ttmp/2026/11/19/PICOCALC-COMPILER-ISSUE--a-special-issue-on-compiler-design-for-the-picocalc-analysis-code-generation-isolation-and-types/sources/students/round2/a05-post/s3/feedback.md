# Reader feedback on `article.md`

I read the article once straight through, then worked the quiz with `glossary.md` open.
For the arithmetic below I checked every percentage I could recompute from the numbers
printed in the article, and I say which ones I could not.

## Passages I had to read twice

> "Where the load uses a different register, as in `sw t0, 16(sp)` followed by `lw t1, 16(sp)`, the load becomes a register copy, which saves a memory access and no instruction."

"Replaced by a register copy" and "saves a memory access and no instruction" fight each
other on first read: a copy is still an instruction, so the sentence means the
*replacement* keeps the instruction count but drops the memory access. Writing the
replacement out (`mv t1, t0`) would make it immediate.

> "- **the current value of local i**: the value is in the frame, and no instruction has been emitted to fetch it yet."

The word "current" carries a lot of weight here. It has to mean "the frame still holds
what local *i* holds at this point in the translation", so the entry is invalidated the
moment anything in between writes *i* (or the frame slot). The article never says that
a later write to a local must kill such a pending entry, and this is exactly the case
where the technique goes wrong.

> "Two situations do *not* require a flush. A trap is a fault that ends the program's handling of the current event, so nothing reads the frame afterwards. A hardware interrupt saves and restores all registers itself."

I still do not know what problem the interrupt case is a solution to. Nothing earlier in
the article explains how interrupts reach a compiled function's frame, so "saves and
restores all registers itself" reads as reassurance against an unstated worry.

> "Instructions belonging to a store immediately followed by a load of the same slot (both instructions of each pair counted; Editor has 7,490 such pairs) | 34.1%"

The row header is a sentence, not a label, and it took a second pass plus the 7,490
figure to see what was counted. (It does check out: 7,490 × 2 = 14,980, and
14,980 ÷ 43,965 = 34.1%.)

> "When a function has more locals than registers, some must stay in memory. Two classical policies choose which."

"Two classical policies choose which" is elliptical: it means two policies choose *which
locals go in registers*, and the sentence that follows then presents "spill" and Best's
algorithm, which choose which value *leaves* a register — a third thing again. I read
this paragraph three times.

## Terms used before they were explained, or never explained

- **Intermediate representation** (5.9, 5.10, 5.11: "an intermediate representation of the whole function", "with no intermediate tree") — never defined in the article and not in the glossary. This is the term the whole argument of 5.9 and 5.11 rests on.
- **Calling convention** (5.5, 5.7) — never defined as a term; the register table in 5.1 only implies one. Not in the glossary.
- **Typed byte arrays** (5.11) — "build output in typed byte arrays instead of arrays of numbers" is never explained; a reader cannot tell whether this is about `Uint8Array` or something project-specific.
- **Bounds check** (5.9) — the comment says "no bounds check" and a later sentence glosses range-check elimination, but the check itself (what it compares, what it does on failure) is never shown.
- **The length field at offset 4** (5.9) — `lhu t2, 4(t2)` implies a record layout with something before the characters, and neither the article nor the glossary says what is at offset 0. `slot`, `frame`, `flush`, `join`, `spill`, `leaf function`, `peephole` and `compile-time operand stack` were all fine thanks to inline definitions and the glossary; `reactor`, `world` and `abstract interpretation` are covered by the glossary.

## Claims I could not verify from the article itself

> "The complete function is 41 instructions, which the output of Experiment 4 lets us tally."

Only two of the six rows of that tally table are backed by listings (the 10 and the 11).
The entry row (4), the `a = a + 1` row (they say 10, I believe it is the same shape as
`let a = b + c`, but this is not shown), the return row (3) and the exit row (3) are
asserted. The five rows I cannot check add up to 20 of the 41 instructions. I also never
learn what Experiment 4 is; the article says Articles 1 and 2 introduced the
measurements but never says which experiment produced the listing of `bump`.

> "| Loads and stores of operand-stack slots | 55.3% | 52.5% | 50.0% |" and "| All frame loads and stores, including locals | 70.2% | 65.8% | 61.9% |"

These are percentages with no counts anywhere, so unlike the pair row I cannot recompute
them. A single instruction count per row would make the table checkable.

> "After the previous techniques, the remaining memory traffic is reads and writes of local variables: 11 to 14 percent of today's instructions."

This one I could try to check, and it does not come out. Subtracting the two rows of the
5.3 table gives 70.2 − 55.3 = 14.9, 65.8 − 52.5 = 13.3 and 61.9 − 50.0 = 11.9 percent —
that is **12 to 15 percent**, not 11 to 14. Either the range is misquoted or the two rows
are not meant to be subtracted; the article should say which.

> "The walk first reproduces the *current* backend's rules; its count equals the real output exactly for all 161 functions of the three applications, which shows that the walk decodes and interprets the code correctly."

The rule set is "the script itself, about 250 lines, kept with the issue as
`scripts/03-register-cache-model.mjs`". I do not have that script, so the strongest
evidence in the article is a pointer to something outside it. What I *can* check is
internal consistency, and it holds: 5.3 and 5.8 agree on 43,965 / 7,710 / 1,529, and
the byte row in 5.8 is exactly four times the instruction row (16,544 × 4 = 66,176 and
13,255 × 4 = 53,020), which matches "every ordinary RV32 instruction occupies 4 bytes".
It would be worth saying that.

> "In Editor, 31 of 120 functions are leaves." / "the deepest operand stack in Editor is 8, and 100 of its 120 functions never exceed 5" / "there are 228 such blocks in Editor" / "they account for 155 of 16,544 instructions in Editor"

Every one of these four facts is a property of the WebAssembly that I cannot see, and
none of them is derivable from the article. Quoting a short excerpt of the script's
output would fix all four at once.

> "The two limits are assumptions of the model: a called function may overwrite 15 registers (`a0`–`a7` and `t0`–`t6`), and the model sets aside 5 of them for temporaries in a leaf; of the 12 saved registers it uses 11."

The 10 follows from 15 − 5, so that one I can redo — but 5 temporaries contradicts
section 5.7, which justifies "the seven temporaries `t0`–`t6`". And why 11 of the 12
saved registers, rather than 12? Both numbers are load-bearing for model B and neither
is defended.

> "the project's records show one such change, in the step that links Agenda into its reactor, cutting that step from 483 ms to 259 ms and its memory from 1.36 MB to 0.41 MB"

Section 5.11 gives no measurement method (timed where, how many runs) and points at
"the project's records". The 41 percent and 16 percent shares come from
"Experiment 3 (Article 2, section 2.4)", which I also do not have.

> "The 34 percent in the table counts both, and the most a peephole pass can remove is therefore 17 percent of all instructions."

This is an argument, not a measurement, and it silently assumes every one of the 7,490
pairs is one of the two shapes discussed and that merges do not create new copies. It is
probably right, but it is stated as if measured.

## Section scores

| Section | Score | Reason |
| --- | ---: | --- |
| 5.1 Two machine models | 5 | The two instruction tables and the register-group table are exactly what a reader needs, and every listing in the article uses only instructions from that table. |
| 5.2 The current translation, by hand | 4 | The two listings are easy to follow and the waste is visible line by line, but the 41-instruction tally leans on rows that are never shown, and "RV32 could express the whole test as one instruction, `blez a, after_if`" quietly reads a frame slot as if it were a register operand (it would have to be `blez t0`). |
| 5.3 How much of the output is waste | 3 | The idea is clear but the table is the hardest thing in the article: a sentence for a row header, percentages with no counts, and a graph whose categories I cannot map back to the rows. |
| 5.4 Technique 1: a peephole pass | 3 | The central limit of the technique is well made, but "saves a memory access and no instruction" and the 17 percent derivation both needed a second read. |
| 5.5 Technique 2: a compile-time operand stack | 4 | The named techniques are all introduced before use, but two sentences are unclear: "the current value of local i", and the interrupt case of the no-flush rule. |
| 5.5 "The rule at control-flow joins" (subsection) | 4 | The correctness argument is convincing and well put, but a flush is never *shown*: the whole article contains no instruction sequence for one, which makes the section assert rather than teach. |
| 5.6 Technique 3: branches without truth values | 4 | Short and effective, and the link between the pending comparison and the two-instruction branch is clear. |
| 5.7 Technique 4: locals in registers | 3 | Four policies arrive in three paragraphs (Best's, linear scan, count-and-assign, Sethi–Ullman) and the "11 to 14 percent" figure does not match the 5.3 table. |
| 5.8 A counting model of the gain | 4 | The clearest section on method: the limits are stated honestly and the table is internally checkable (bytes = 4 × instructions), but the 10 and 11 register limits are asserted and one of them contradicts 5.7. |
| 5.9 What one pass cannot do | 4 | The hand-written loop is the best teaching in the article, though the record layout (`lhu t2, 4(t2)`) is unexplained. |
| 5.10 Techniques considered and set aside | 4 | Well argued and it answers the obvious objection, though it is dense with citations and pre-empts material the reader has not asked for yet. |
| 5.11 The compiler's own speed | 3 | The weakest section: none of its numbers can be checked from the article and it changes subject from code quality to compiler performance. |
| 5.12 Key points | 5 | Accurate and it matches the body; I could use it to check my own understanding. |

## Questions that the article did not let me answer

- **Question 2** is answerable only by inference. The article says `a + 1` becomes the
  single instruction `addi t0, t0, 1`, but its only worked table (section 5.5) is the
  register-and-register case, `b + c`, which emits three instructions including two
  loads. So I had to guess that the `lw` of `y` is still emitted and that the constant
  becomes the immediate, giving three instructions rather than four. A single extra
  row in the 5.5 table, "`local.get y`; `i32.const 1`; `i32.add`" with a constant
  operand, would remove the guess.
- **Question 1** is answerable, but only because the `if` listing in 5.2 happens to show
  that `i32.const` costs `li` plus `sw`. Section 5.2 never states that rule; it says "a
  constant is treated like any other value", which a careful reader can act on.
- **Question 5** is answerable only if the reader remembers the "58 KiB of memory to
  spare" phrase from the middle of a paragraph in 5.8 and knows to divide by 1024. Both
  steps work, but the question depends on a fact that is not in a table.
- **Questions 3, 4 and 6** were fully answerable from the text.

## One thing to add and one thing to cut

**Add** a worked flush. Section 5.5 tells the reader that pending values must be moved
to agreed locations at a join, says this is "a correctness requirement", and gives no
example; the reader therefore finishes the article able to recite the rule but not to
apply it. Three lines would do it: for `if (p) { x = 1 } else { x = 2 }`, show the
pending entry before the split, the two stores, and the re-read after the merge.

**Cut** the five-source precedent paragraph in section 5.5 ("Fabrice Bellard's Tiny C
Compiler calls its list the *value stack* ... Ertl ... Liftoff ... Titzer"). Four
names and four quotations for one mechanical idea cost the reader a screen and teach
almost nothing; keeping TCC and Ertl, and moving the rest to a note, would keep the
credit and give the space back to the missing example.
