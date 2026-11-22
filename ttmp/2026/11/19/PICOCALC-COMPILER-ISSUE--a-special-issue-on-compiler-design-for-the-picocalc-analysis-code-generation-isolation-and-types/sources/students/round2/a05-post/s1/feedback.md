# Reader feedback on Article 5, "Code Generation: From a Stack Machine to a Register Machine"

A note on method: I read `article.md` straight through, once without stopping and once while doing the
quiz, and looked terms up in `glossary.md` as I went. I did not read the other articles, so everything
below is judged against this article plus the glossary only.

## Passages I had to read twice

1. *"Instruction belonging to a store immediately followed by a load of the same slot (both
   instructions of each pair counted; Editor has 7,490 such pairs)"* (table, 5.3).
   As a table row this is a definition squeezed into a cell, and it takes a reread to check that
   7,490 × 2 = 14,980 is 34.1% of 43,965. Worse, this row is titled by *slot*, but section 5.4
   immediately splits the row's members into two kinds — pairs where the load's register matches the
   store's, and pairs where it does not — which the row's definition does not distinguish.

2. *"A conditional branch reaches only 4 KiB; a jump reaches 1 MiB. The backend therefore always
   emits the long form, which is always correct."* (5.2).
   I had to reread this because the reasoning runs backwards from what one expects: the *short* form
   would be correct in almost all cases, and the argument is about not knowing the distance, not about
   reach. The intervening sentence ("when it reaches the `if` it does not yet know how far away the end
   of the block will be") carries the whole point and could come first.

3. *"An entry in the list is one of three things"* (5.5) followed by *"The compiler can record a fourth
   kind of entry, **a pending comparison**"* (5.6).
   I had just memorised "three kinds"; the fourth arrives one section later as if it were part of the
   same list. Either say "three kinds, plus a fourth introduced in 5.6", or move the comparison entry
   into the list and defer only the branch-shortening part.

4. *"A called function may overwrite 15 registers (`a0`–`a7` and `t0`–`t6`), and the model sets aside
   5 of them for temporaries in a leaf; of the 12 saved registers it uses 11."* (5.8).
   This is the only place the "up to 10 locals" and "up to 11 locals" numbers are grounded, and it
   does the arithmetic silently: 15 − 5 = 10, and 12 − 1 = 11 with no reason given for the 1 that is
   dropped. I had to reconstruct both subtractions to make the model defensible.

5. *"In the few places where more computed values are pending than registers are free, the compiler
   must spill one, and Best's rule says which."* (5.7) versus *"It assumes a free temporary register is
   always available, and so counts no spills."* (5.8).
   These contradict each other unless one notices that 5.7 speaks of a future implementation and 5.8 of
   the model. Read in sequence they look like a flat disagreement about whether spills happen.

6. *"`lhu t2, 4(t2)` # text.charCodeAt(at), no bounds check"* (5.9).
   To accept that one instruction I had to infer the whole string layout from it — length at offset 0,
   characters at offset 4, two bytes each — because `slli t2, t0, 1` and the `+ 4` are the only hints.
   The article never states that layout, so this line is only readable to someone who already knows it.

7. *"Each row of the table corresponds to a known technique. The following sections take them in order
   of increasing power."* (5.3).
   I read the table rows expecting sections 5.4–5.7 to follow the row order. They do not: the row order
   is stack slots → all frame traffic → store/load pairs → branch-over-jump, while the sections run
   peephole (row 3) → compile-time stack (row 1) → branches (row 4) → locals in registers (row 2).

## Terms used before they were explained, or never explained

Only terms that neither the article nor `glossary.md` explains are listed here.

- **`i32`** — used throughout (`i32.add`, `i32.const`, `i32.const 0`) and never said to mean a 32-bit
  integer. It is the single most repeated unexplained token in the article.
- **bounds check** — used in 5.9 ("no bounds check") and in the same section as a named optimisation
  ("range-check elimination"), but a reader is never told what a bounds check *is* (a test that an
  index lies within an array's length before the access).
- **flash** — 5.10: "a place in flash to keep it". Never defined, and it is doing real work in the
  argument about why copy-and-patch is deferred (code size budget).
- **`text.charCodeAt`** — 5.9 uses the method as if its cost and semantics were known; nothing in the
  article or glossary says what it returns (a UTF-16 code unit, evidently from `lhu`) or that it is the
  operation whose bounds check is being removed.
- **WebAssembly itself** — the article leans on it from its first paragraph but never says what it is.
  The glossary defines nothing about it either; it is presumably Article 1's job, and this article does
  not say so.

## Claims I could not verify from the article itself

1. *"The complete function is 41 instructions, which the output of Experiment 4 lets us tally."* (5.2)
   — "Experiment 4" is never identified. Section 5.3 points to "Experiment 1 of Article 2", 5.8 to
   "Experiment 2", 5.11 to "Experiment 3 (Article 2, section 2.4)". What is missing: a citation for
   Experiment 4 and, better, the six per-part counts shown rather than asserted. (The arithmetic does
   check: 4 + 10 + 11 + 10 + 3 + 3 = 41.)

2. *"`bump` … Model A 15"* (5.8 table).
   Applying the stated model-A rules myself (locals in the frame, lazy constants and local reads,
   comparison folded into the branch) I get 18: entry 4, `b + c` into `a` 4, `if` 2, `a + 1` 3,
   `return a` 2, exit 3. What is missing: a listing of model A's output for `bump`, or a worked count,
   so the 15 can be reproduced. As it stands the number I could check (model B = 5 = hand 4 + one copy
   of the result) is the only one that works out.

3. *"In Editor, 31 of 120 functions are leaves"*, *"the deepest operand stack in Editor is 8, and 100 of
   its 120 functions never exceed 5"*, *"there are 228 such blocks in Editor"*, *"they account for 155 of
   16,544 instructions in Editor"*.
   All four come from `scripts/03-register-cache-model.mjs`, which is not part of this article and not in
   this directory. Missing: the numbers themselves, or at least the per-function table for the two small
   applications, so that a reader can check the counting method rather than trust it.

4. *"its count equals the real output exactly for all 161 functions of the three applications, which
   shows that the walk decodes and interprets the code correctly."*
   161 = 120 + 34 + 7, so the totals agree — but the equality with real output is entirely external.
   Missing: which function or two was compared in full, so a reader can see one case of the match.

5. *"Editor's native code would shrink by about 107 to 120 KiB, in a world that currently has 58 KiB of
   memory to spare."* (5.8)
   The 107 KiB I can check (175,860 − 66,176 = 109,684 bytes ≈ 107 KiB), but the 58 KiB figure is an
   unexplained import from Article 2, and the article never says whether the code bytes being saved and
   the memory "to spare" are the same pool. Missing: where 58 KiB comes from, and whether it is RAM or
   flash, since a saving in one is not a saving in the other.

6. *"the project's records show one such change, in the step that links Agenda into its reactor, cutting
   that step from 483 ms to 259 ms and its memory from 1.36 MB to 0.41 MB."* (5.11)
   This is the article's only concrete evidence that typed byte arrays would help, and it rests on an
   uncited record. Missing: a reference to the record, and ideally the same measurement for the
   WebAssembly-to-RV32 step, which is the step the change is being proposed for.

7. *"Written by hand the function is 4 instructions"* (5.2) — the four-instruction listing is plausible,
   but the article does not say whether it keeps the same semantics for all inputs (it does: `blez` on
   `a0` after the add), nor why the article's own model B for `bump` is 5 rather than 4. Missing: one
   sentence on what the extra instruction is.

Everything else I checked held: 43,965 × 4 = 175,860 and 16,544 × 4 = 66,176 and 13,255 × 4 = 53,020;
43,965 / 16,544 ≈ 2.66 and 43,965 / 13,255 ≈ 3.32; 7,490 × 2 / 43,965 ≈ 34.1%; 155 / 16,544 ≈ 0.94%;
1,008 + 274 + 75 = 1,357 of 1,009 + 274 + 75 = 1,358 pairs short-reachable; and the hand loop in 5.9
counts 4 + 7 + 2 = 13.

## Section scores

- **5.1 Two machine models — 5.** The two machine models are set out in two short tables and nothing is
  assumed except reading `lw t0, 12(sp)`.
- **5.2 The current translation, by hand — 5.** The instruction-by-instruction tables are exactly the
  right form for this subject, and every count in them can be checked by counting rows.
- **5.3 How much of the output is waste — 4.** The percentages are convincing, but the store/load row's
  definition and the "take them in order of increasing power" sentence do not match what follows.
- **5.4 Technique 1: a peephole pass — 4.** The "at most one of the two instructions" argument is clear
  and honest; the two-case split of the 34% row could be tabulated instead of told.
- **5.5 Technique 2: a compile-time operand stack — 4.** The four-row table teaches the technique well,
  but "one of three things" is superseded two pages later and the trap/interrupt paragraph explains a
  rule the reader had not yet seen questioned.
- **5.6 Technique 3: branches without truth values — 3.** Three separate ideas (pending comparison,
  branch shortening by patching, frontend short-circuit translation) are packed into four paragraphs,
  and only the first is really about branches without truth values.
- **5.7 Technique 4: locals in registers — 3.** Five named techniques (leaf functions, Best's rule,
  linear scan, a mention-count heuristic, Sethi–Ullman) arrive in two paragraphs, and the article never
  says which one the project would adopt, so the section reads like a literature review rather than a
  plan.
- **5.8 A counting model of the gain — 3.** The table is the heart of the article, but the model's rules
  are delegated to a 250-line script, the register arithmetic is silent, and one row (`bump`, model A)
  does not reproduce.
- **5.9 What one pass cannot do — 4.** The loop listing is good and the three missing optimisations are
  each given a plain-language gloss; only the string layout behind `lhu t2, 4(t2)` is unstated.
- **5.10 Techniques considered and set aside — 4.** Each item gets a reason for deferral, which is what
  this section needs; the ancestor citations are dense but skippable.
- **5.11 The compiler's own speed — 3.** Mostly citations plus one uncited anecdote (483 → 259 ms), with
  no statement of how much of the 41% would actually be recovered.
- **5.12 Key points — 5.** Six bullets, each traceable to a section.
- **5.13 Check your understanding — 5.** The questions are answerable from the text, which is a real
  achievement for a section this technical; question 2 in particular forces the reader to do the work.

## Questions that the article did not let me answer

All six were answerable, but two only just:

- **Question 2** hinged on one sentence in 5.5 ("`a + 1` becomes the single instruction
  `addi t0, t0, 1`"). Without it I would not have known whether the constant had to be materialised. A
  reader who skipped that sentence would give 4 instead of 3, and nothing else in the article settles it.
- **Question 5** asks why the saving "matters for Editor in particular", and the only support is "a world
  that currently has 58 KiB of memory to spare" — a figure whose origin is in Article 2 and whose unit
  (RAM or flash) is not stated. I could compute the KiB and point at the 58 KiB, but I could not tell
  whether the comparison is legitimate.
- **Question 3** is answerable, but only from two sentences in 5.5 that introduce hardware interrupts
  nowhere else in the article; a reader who skims that paragraph has nothing to fall back on.

## One thing to add and one thing to cut

**Add:** one worked listing of model A's output for `bump`, next to the model B and hand-written
versions already in 5.2 and 5.8. It would cost eight or so lines and would turn the section 5.8 table
from a claim into something a reader can check. At present the article shows the 41-instruction backend,
the 4-instruction hand version and a 5-instruction model B, but the 15-instruction model A — the number
that carries the 2.7× prediction — exists only as a cell in a table, and it is the one number in that
table I could not reproduce from the stated rules.

**Cut:** the two-sentence paragraph in 5.5 on traps and hardware interrupts. It answers an objection the
reader has not raised, introduces interrupts which the article never mentions again, and dilutes the
flush rule, which is the one thing in that subsection a reader must retain. If the point is worth
keeping, one clause — "the rule is unchanged at traps and interrupts, where nothing later reads the
frame" — would do.
