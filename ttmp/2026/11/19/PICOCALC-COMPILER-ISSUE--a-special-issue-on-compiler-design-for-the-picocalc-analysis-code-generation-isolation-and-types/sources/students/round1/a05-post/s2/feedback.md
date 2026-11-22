# Reader feedback on "5. Code Generation: From a Stack Machine to a Register Machine"

Context: I am reading this as article 5 of a series I have not read (articles 1, 2 and 9 are
referred to but not included). I do know what a stack machine, a register, and a compiler pass
are. I do not know RV32 assembly by heart.

## Passages I had to read twice

1. "The measured 34 percent is therefore an upper bound on what the window alone can find, and
   the realistic gain is about half of it."
   *Why twice:* the first half of the sentence follows from the preceding argument, but "about
   half of it" arrives with no reasoning at all. I cannot tell whether it comes from a
   measurement, from an estimate of how many of those store/load pairs are anti-dependencies a
   window cannot see, or from the author's intuition. It is the only quantitative claim in the
   section without a traceable source, and it is the number a reader would use to decide whether
   to write the peephole pass.

2. "The frame therefore need not be kept up to date between joins and calls."
   *Why twice:* this appears to contradict the paragraph immediately above it, which says pending
   values must be moved to "a fixed, agreed location" before a split or merge and before a call.
   If that location is the frame, the frame must be up to date at exactly those points. I think
   what is meant is that the frame does not need to be *consistent with the abstract stack at
   every instruction* — only at the flush points — but as written it reads as a retraction.

3. "The condition `if (a > 0)` shows a second pattern." … `slt t0, t1, t0  # t0 = 1 if 0 < a`
   *Why twice:* the four-line snippet arrives with `t0` and `t1` already loaded and I had to
   reconstruct which held what, and in what order, from the comment alone. The comment `0 < a`
   also silently reverses the source order (`a > 0`), which is correct but made me stop and check.
   The snippet is also not tied to the `bump` function: nothing says whether `a` was loaded from
   offset 8 here.

4. "Model B: … A leaf function keeps up to 10 locals in registers with no frame; other functions
   keep up to 11 in saved registers and pay two instructions each to save and restore them."
   *Why twice:* 10 and 11 are unexplained. RV32 has 7 temporaries and 8 argument registers and 12
   saved registers, so where 10 and 11 come from is a sum I cannot reconstruct — I guessed
   "`a0`–`a7` plus two temporaries" and "`s0`–`s11` minus one", but the article should say.

## Terms used before they were explained, or never explained

- **"the world's turn"** ("A trap ends the world's turn") — never explained; presumably a turn-based
  execution model from an earlier article. It is the only justification offered for skipping a
  flush on a trap.
- **"PR"** inside the Best's-algorithm quotation: "spill the PR that contains the value whose next
  use is farthest in the future". Never expanded (program register?), and never used again.
- **"SSA"** — section 5.10 is headed "An optimizing backend with SSA" and the term is never expanded
  or described.
- **"Amdahl's law"** — used as an argument in 5.9, explained only by pointing at Article 2.
- **"trap"** — used twice in 5.5 as though its meaning were fixed; not defined here.
- **"typed byte arrays"** (5.11) — I assume `Uint8Array`, but the article does not say, so the
  claimed memory saving (1.36 MB to 0.41 MB) is hard to reason about.
- **"QuickJS"**, **"native compile path"**, **"link step"** (5.11) — all assumed known.
- **`1f`** in the hand-written `bump` — a local numeric label, never explained; a reader who does
  not know assembler will not see that it forward-references the label `1:`.
- **`lhu`**, **`slli`**, **`bnez`**, **`blez`**, **`slt`** — used without a one-line gloss; `lhu`
  (load halfword unsigned) in particular carries the point that a character is 16 bits, which
  matters for the bounds-check argument.
- **"operand-stack slot" / "slot"** is introduced properly; **"frame"** is defined as "its private
  area of memory", which is enough, but the phrase "the frame need not be kept up to date" then
  needs a sharper definition of what "up to date" means.
- **"RV32"** vs **"RV32I"** vs **"RISC-V"** — used interchangeably; fine for the trade press, worth
  one clause on first use.

## Claims I could not verify from the article itself

1. "The complete function is 41 instructions." — only 15 of them are shown (10 for `let a = b + c`,
   5 for the condition, and the branch snippet). The remaining 26 (prologue, epilogue, the
   `a = a + 1` body, the `return`, the end-of-block) are never displayed. Since section 5.8's whole
   credibility rests on exact instruction counts, and since question 1 of the quiz asks the reader
   to reproduce exactly this arithmetic, the missing listing is a real gap. A full listing, or at
   least a per-part count table, would settle it.
2. "The backend emits the two-instruction form because of how it works: it translates in a single
   forward pass, and when it reaches the `if` it does not yet know how far away the end of the
   block will be." — this is a causal claim about a specific program. No source fragment, and no
   alternative explanation is excluded (e.g. that the comparison is materialised as 0/1 for the
   frontend's benefit, which the snippet's `sw`/`lw` of the truth value suggests is a separate,
   additional reason). The two explanations are mixed together in the same paragraph.
3. "it counts the instructions that would be emitted under stated rules … its count equals the real
   output exactly for all 161 functions, which shows that the walk decodes and interprets the code
   correctly." — no listing of the rules, no diff, no statement of which 161 functions. I must take
   the validation on trust.
4. Every row of the Experiment 1 table (55.3%, 70.2%, 34.1%, 1,009/1,008, …) and every row of the
   Experiment 2 table. The article does not say how instruction classes were counted, whether
   percentages are of static instruction count or dynamic executions (it must be static, but that
   is inferred), or what "Editor" and "Agenda" are.
5. "31 of 120 functions are leaves" and "the deepest operand stack in Editor is 8, and 100 of its
   120 functions never exceed 5" — no data shown. Also the step from "deepest stack is 8" to
   "the seven temporaries `t0`–`t6` are enough for almost all code" is not made: a depth-8 stack
   needs 8 live temporaries, one more than exist.
6. "Editor's native code would shrink by about 110 to 123 kilobytes, in a world that currently has
   58 KiB of memory to spare." — the arithmetic I can redo (175,860 − 66,176 = 109,684;
   175,860 − 53,020 = 122,840) and it checks out, but the units are mixed: the differences are
   decimal kilobytes and the budget is binary KiB (58 KiB = 59,392 bytes). Small, but this article
   is about being exact with counts.
7. "In the counting model described below, flushes account for 155 of 16,544 instructions in
   Editor, under one percent." — the arithmetic is right (0.94%) but nothing shows where 155 comes
   from; it is precisely one of the numbers the exact-match validation does *not* test, since
   today's backend performs no flushes.
8. "lowering to RV32 accounts for 41 percent of the native compile path and tokenizing for 16
   percent" — Experiment 3 is named but its method is not described at all.
9. "The project has already seen one such change cut a link step from 483 ms to 259 ms and its
   memory from 1.36 MB to 0.41 MB." — a bare anecdote with no pointer; also not obvious that a
   link step is representative of a code-emission inner loop.
10. "A branch such as `blt t0, t1, target` … can reach targets within about 4 KiB. An
    unconditional jump reaches about 1 MiB." — plausible for RV32 and probably right, but it is
    stated as fact with no reference, and the whole "branch over jump" argument depends on it.
11. "Model B already brings native code within a factor of about 1.3 of hand-written code on this
    example" — this one I *can* check (17 vs 13 = 1.31), so I am noting it as verified rather than
    missing; but "this example" is ambiguous between `countUnit` and `bump`.

## Section scores

- **5.1 Two machine models — 4.** The register-role table is exactly what an outsider needs, and
  the "no operand stack" framing of the problem is crisp; a point lost because RV32 knowledge is
  otherwise assumed throughout.
- **5.2 The current translation, by hand — 3.** The 10-instruction table is the best teaching
  object in the article, but the `if` snippet arrives without its register context, the hand
  version's `slt`/`bnez` operands are confusing, and the 41-instruction total is never reconciled
  with the 15 shown.
- **5.3 How much of the output is waste — 4.** The table is clean and the "each row maps to a
  technique" bridge is good; marked down only because none of the numbers can be checked here.
- **5.4 Technique 1: a peephole pass — 3.** The idea and its limit (the window cannot see that a
  slot is dead) are clear, but "about half of it" is an unsourced estimate in a section otherwise
  built on measurements.
- **5.5 Technique 2: a compile-time operand stack — 5.** This is the clearest section: three kinds
  of entry, a before/after table, the join rule stated as a correctness requirement, and honest
  treatment of when no flush is needed (modulo the contradictory sentence).
- **5.6 Technique 3: branches without truth values — 3.** Three distinct ideas (pending comparison,
  branch patching, frontend short-circuit translation) are compressed into four paragraphs and the
  reader must keep track of which layer each belongs to.
- **5.7 Technique 4: locals in registers — 3.** Correct but dense: 10 and 11 registers are
  unexplained, the Best's-algorithm quotation contains an unexpanded "PR", and three allocation
  policies plus Sethi–Ullman arrive in one section.
- **5.8 A counting model of the gain — 4.** The results table plus an unusually honest limitations
  paragraph; the missing piece is that the reader cannot see any of the data behind the model.
- **5.9 What one pass cannot do — 5.** The hand loop is annotated well enough to read without an
  assembler manual, and each of the three missing optimisations is named and tied to a reason.
- **5.10 Techniques considered and set aside — 3.** Useful as a survey, but it is the section where
  the citation density most gets in the way: two paragraphs of copy-and-patch history before the
  reader reaches "the reasons to defer it are practical".
- **5.11 The compiler's own speed — 2.** A different topic (compiler performance, not code
  generation) in one page, with three unsourced numbers and an unexplained "typed byte arrays".
  It reads like it belongs in the previous article.
- **5.12 Key points — 5.** Accurate and complete against the body of the article; I used it to
  check my quiz answers.
- **5.13 Check your understanding — 4.** Good questions that track the sections (one per technique
  plus the join rule plus the model), but question 1 cannot be answered exactly from the text
  because the codegen for `i32.const` is never shown.

## Questions that the article did not let me answer

- **Question 1, partially.** The count depends on what the backend emits for `i32.const`, and no
  example in the article contains a constant. The `bump` table shows only `local.get`, `i32.add`
  and `local.set`. I answered 10 by assuming one instruction to materialise the constant plus one
  store, but "9" is also defensible. This is the one quiz item I answered by guessing rather than
  reading.
- **Question 2, partially.** Same gap on the other side: section 5.5 asserts "`a + 1` becomes the
  single instruction `addi t0, t0, 1`", which works only because `a` is *already* in a register.
  In the quiz, `y` is a local in the frame, so the lazy-constant saving is one instruction less than
  the reader might expect; the article never spells out the rule "a lazy operand in a local still
  costs a load when it is consumed by an operation".
- **Question 5** is answerable, but only because the limitations paragraph in 5.8 happens to list
  the three caveats; the section does not say which specific model-A/model-B assumptions (10 vs 11
  registers, two instructions per save/restore, 155 flushes) are untested by the exact-match
  validation. I had to reason that out.
- Questions 3, 4 and 6 are fully answerable from the text.

## One thing to add and one thing to cut

**Add:** a complete listing of the 41 instructions the backend emits for `bump`, annotated in the
same style as the 10-instruction table, with a per-part count (prologue ×, `let` 10, condition 5,
body ×, epilogue ×, joins ×) that sums to 41. This single addition would make question 1 decidable,
make the "41 versus 4" headline checkable, show what `i32.const` and `return` cost, and show the
frame setup that section 5.7's "leaf functions need no frame" argument silently relies on.

**Cut:** section 5.11, "The compiler's own speed". It is about compiler throughput rather than code
generation, its three numbers are unsourced, and it weakens the article's thesis by ending the
argument on a topic the preceding eleven sections did not build towards. Its best sentence — the
Wirth and Lua comparison about choosing small-fast over best — belongs at the end of section 5.9 or
5.10, where the "is an optimising backend worth it?" question is actually decided.
