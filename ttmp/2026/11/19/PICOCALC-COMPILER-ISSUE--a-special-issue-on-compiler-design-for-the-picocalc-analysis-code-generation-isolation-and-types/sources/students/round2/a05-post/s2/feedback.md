# Feedback from a student reader

Read `article.md` (13 sections, all read end to end) with `glossary.md` open beside it.

## Passages I had to read twice

1. "So of the two instructions in each pair, at most one can be removed. The 34 percent in the table counts both, and the most a peephole pass can remove is therefore 17 percent of all instructions."
   The halving is stated as arithmetic but the reason is compressed into "the window cannot see that". I had to work out for myself that the *store* is the half that can never go, and that in the `lw t1` case the "removal" is a saving of a memory access and zero instructions — so the 17 percent is an upper bound that assumes every redundant load is an exact register match.

2. "A leaf function keeps up to 10 locals in registers with no frame; other functions keep up to 11 in saved registers and pay two instructions each to save and restore them. The two limits are assumptions of the model: a called function may overwrite 15 registers (`a0`–`a7` and `t0`–`t6`), and the model sets aside 5 of them for temporaries in a leaf; of the 12 saved registers it uses 11."
   Two separate confusions. "Two instructions each" is ambiguous — is it 2 per local (one save, one restore) or 2 to save plus 2 to restore? And the arithmetic for the leaf case (8 + 7 = 15, minus 5 temporaries = 10) is only reconstructable if you know that `a0`–`a7` and `t0`–`t6` are the caller-overwritable groups, while the 11-of-12 for saved registers is given no reason at all.

3. "RV32 could express the whole test as one instruction, `blez a, after_if`."
   In this same section `a` is a local at frame offset 8, so it is not in a register and one instruction cannot do the job — at minimum it is `lw t0, 8(sp); blez t0, after_if`. I read the passage three times trying to find where `a` went into a register, and the later "the sum is stored to the slot at offset 12 and loaded from the same slot" confirms it never does.

4. "Two situations do *not* require a flush. A trap is a fault that ends the program's handling of the current event, so nothing reads the frame afterwards. A hardware interrupt saves and restores all registers itself."
   This answers a question the section never raises. Nothing before it says flushes were being considered at traps or interrupts, so as a reader I had to guess the implied rule ("flush before anything that might read the frame") before the two exceptions made sense.

5. "The operand stack never holds more than two values in this function, so it needs two slots: the first stack position is the frame slot at offset 12 and the second is the slot at offset 16."
   The frame layout is asserted rather than shown: I had to infer that stack slots are placed immediately after the three locals, that offsets are byte offsets (4 bytes per slot), and that no space is reserved in the frame for the return address, which the tally row "Entry: make the frame, save the return address" then implies must exist somewhere.

6. "The model has limits that must be stated. ... It assumes a free temporary register is always available, and so counts no spills." then, two sentences later, "In the few places where more computed values are pending than registers are free, the compiler must spill one, and Best's rule says which."
   These pull in opposite directions (§5.7 says spilling is needed and Best's rule decides, §5.8 says the model counts no spills) and the reconciliation — that spilling is a rare case the count ignores — is not written down.

## Terms used before they were explained, or never explained

- **flash** (§5.10, "a place in flash to keep it") — never defined anywhere in the article or the glossary, and never connected to the "58 KiB of memory to spare" in §5.8. I do not know from the text whether compiled code lives in flash or in RAM.
- **KiB / MiB** (§5.1, §5.8) — used for branch reach and code size; the article switches between "bytes", "KiB", "MB" and "KB" without a table of units, so comparing 175,860 bytes with "58 KiB" is left to me.
- **calling convention** (§5.5, "the calling convention lets the called function overwrite `t0`–`t6`") — the term is used to justify a rule but is only inferable from the register table in §5.1; the glossary has no entry.
- **Experiment 1–4** — the numbering crosses articles and is never introduced. "Experiment 1 of Article 2" and "Experiment 3 (Article 2, section 2.4)" are locatable; "Experiment 2" and "Experiment 4" are referenced for the 41-instruction tally and the counting model but I was never told where they are recorded.
- **bounds check** (§5.9) — used twice before any gloss, and the only explanation is inside the parenthetical for range-check elimination. Why `text.charCodeAt(at)` would need one at all is never said.
- **expression tree** (§5.7, §5.10) — assumed knowledge; the glossary has no entry and the article never says what a one-pass translator would build instead.
- **hardware interrupt** (§5.5) — the only explanation is "saves and restores all registers itself", which does not say who saves the frame.

## Claims I could not verify from the article itself

1. "This is what the typed compiler's backend does today." (§5.2) — no path, listing or reference identifies the backend code, and no emitted listing is shown, so the ten-instruction translation is an illustration I have to trust.
2. "The complete function is 41 instructions, which the output of Experiment 4 lets us tally." (§5.2) — the six row values do add to 41 and the hand version is 4 as claimed, but Experiment 4 is never identified and the per-row counts (entry = 4, `a = a + 1` = 10, `return a` = 3) are not shown anywhere, so only the sum is checkable, not the parts.
3. "The operand stack never holds more than two values in this function, so it needs two slots" (§5.2) — a claim about compiler state that needs the emitted listing or a stack-depth computation to confirm.
4. "In Editor, all but one of the 1,009 long-form branches could have been the short form." (§5.3) — internally consistent with the `1,008` row, but the 4 KiB-reach test that produced it is not described and the measurement is delegated to Article 2.
5. "its count equals the real output exactly for all 161 functions of the three applications" (§5.8) — the properties are 7 + 34 + 120 = 161, which checks out, but the evidence is a `~250`-line script and a `.txt` output kept with the issue; nothing in the article shows how "exactly" was tested or that the two rule sets were exercised independently.
6. "Editor's native code would shrink by about 107 to 120 KiB, in a world that currently has 58 KiB of memory to spare." (§5.8) — the 107.1 KiB and 120.0 KiB I can reproduce from the table, but the 58 KiB has no source, date or unit, and (see the `flash` entry above) I cannot even tell which memory it is.
7. "The deepest operand stack in Editor is 8, and 100 of its 120 functions never exceed 5" / "31 of 120 functions are leaves" / "there are 228 such blocks in Editor" (§5.5, §5.7, §5.6) — four statistics that all come from files outside the article, so none can be checked from the text alone.
8. "Its authors report a WebAssembly compiler that generates code 4.9 to 6.5 times faster than Liftoff" (§5.10) — a citation is given, but nothing about what was measured (compile speed only? code quality too?) or why the range is so wide.
9. "the project's records show one such change, in the step that links Agenda into its reactor, cutting that step from 483 ms to 259 ms and its memory from 1.36 MB to 0.41 MB." (§5.11) — "the project's records" is not identified, and no measurement setup is given, so this is the weakest kind of supporting evidence in the article.
10. "The pattern seen in `bump` is the whole program's pattern." (§5.3) — generalisation from one function to 43,965 instructions; the table that follows is delegated to Article 2 and to a figure I was not given the data for.

## Section scores

| Section | Score | Reason |
| --- | ---: | --- |
| 5.1 Two machine models | 5 | The register-group table and instruction table give exactly what a reader needs; every later listing is decodable from it. |
| 5.2 The current translation, by hand | 4 | The step-by-step table is the clearest thing in the article, but the "`blez a` would be one instruction" remark is wrong for a value in the frame, and the frame layout is asserted. |
| 5.3 How much of the output is waste | 3 | The percentages are unarguable arithmetic once you spot that "both instructions of each pair counted", but that whole row takes real decoding and the 4 KiB test is never described. |
| 5.4 Technique 1: a peephole pass | 4 | The distinction between "delete the load" and "turn it into a copy" is crisp; only the collapse to 17 percent needed a second pass. |
| 5.5 Technique 2: a compile-time operand stack | 4 | The four-row table teaches the technique better than the prose; the trap/interrupt paragraph arrives with nothing to attach to. |
| 5.6 Technique 3: branches without truth values | 4 | Good, but it packs a fourth entry kind, branch patching, a frontend change and two citations into three paragraphs. |
| 5.7 Technique 4: locals in registers | 3 | Leaf versus non-leaf is clear, then spilling, Best's rule, linear scan, Sethi–Ullman and two register budgets land in two paragraphs with no worked example. |
| 5.8 A counting model of the gain | 2 | The load-bearing numbers of the whole article; model B's register budget is only reconstructable with effort, "two instructions each" is ambiguous, and no per-function example shows how 15 or 5 arise. |
| 5.9 What one pass cannot do | 4 | The listing and the three named obstacles are concrete; the only gap is that `bump` was never given the same model-B treatment for comparison. |
| 5.10 Techniques considered and set aside | 3 | Three techniques are dismissed in a page; the copy-and-patch numbers arrive as citations only and "flash" appears here unexplained. |
| 5.11 The compiler's own speed | 3 | Reasoning is sound but sketchy: a percentage from another article and a before/after pair from unidentified records. |
| 5.12 Key points | 4 | Faithful to the body, though it omits the measurement that branches are almost always reachable and the model's own limits. |

## Questions that the article did not let me answer

- **Question 5, second half.** I could compute 107.1 KiB and 120.0 KiB from the §5.8 table, but "explain why that amount matters for Editor in particular" rests entirely on "a world that currently has 58 KiB of memory to spare", which has no source, no unit explanation, and no statement of whether code occupies RAM or flash — §5.10 speaks of "a place in flash", which suggests code may not compete for that 58 KiB at all. I answered with a hedge and marked my confidence low.
- **Question 2, partly.** The article shows how a lazy constant becomes `addi` only by remarking on `a + 1` in prose; it never shows a constant inside a worked compile-time-list translation, so I had to transfer the rule from §5.5's prose to a new statement to get `addi t0, t0, 1` instead of `lw`/`li`/`add`.
- Questions 1, 3, 4 and 6 were answerable from the text.

## One thing to add and one thing to cut

**Add:** a worked model-B translation of `bump` in §5.8, one instruction per line, showing the 15 instructions of model A and the 5 of model B and naming the two save/restore instructions. The table's claims "5 (the hand version plus one copy of the result)" and "two instructions each to save and restore" are the only places where the reader has to take the model on trust, and one eight-line listing would make the whole prediction auditable.

**Cut:** the linear-scan-allocation sentence and the Sethi–Ullman sentence in §5.7 ("Across a whole function, linear-scan allocation gives each variable one interval…", "For an expression tree, evaluating the operand that needs more registers first minimizes the total"). Neither policy is used by the one-pass translator the article is designing, both arrive without a worked example, and replacing them with one sentence ("which local gets a register is decided by a mention count, since a one-pass compiler cannot build intervals") would remove the impression that the reader is expected to learn register allocation here.
