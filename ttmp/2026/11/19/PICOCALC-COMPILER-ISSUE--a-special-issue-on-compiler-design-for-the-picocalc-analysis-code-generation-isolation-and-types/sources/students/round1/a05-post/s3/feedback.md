# Feedback on "5. Code Generation: From a Stack Machine to a Register Machine"

## Passages I had to read twice

**1.** "The frame holds the locals `b`, `c` and `a` at offsets 0, 4 and 8, and operand-stack slots at offsets 12 and 16."
The table below then talks about "stack slot 0" and "stack slot 1" without ever restating the offset. I had to hold two numberings in my head (slot index 0/1 and byte offset 12/16) with no line saying "slot *n* is at offset 12 + 4*n*". One clause would fix it.

**2.** "The comparison is computed as a number, 0 or 1, pushed and popped like any other value, and then tested: `slt t0, t1, t0` ..."
The snippet starts at `slt` with `a` and `0` already in `t0` and `t1`, but the loads that put them there are not shown and are not mentioned. I had to infer that two instructions were omitted and that `t1` holds `a` and `t0` holds `0` — the operand order of `slt` is only decodable if you already know `slt rd, rs1, rs2` computes `rs1 < rs2`. Showing the two `lw`s, or saying "the two loads are omitted", would remove the guesswork.

**3.** "It can turn `sw t0, 12(sp); lw t0, 12(sp)` into the store alone, and it cannot delete the store without knowing that slot 12 is never read again, which requires information from outside the window."
These two halves appear to contradict each other, and the first half does not match the quoted textbook rule ("the load can be replaced by a copy operation"). Replacing the load by a copy of the value just stored would give `sw t0, 12(sp); mv t1, t0`, not "the store alone". I think the intent is "the *load* can be dropped from the pair, but the store survives", but as written the sentence says the pair becomes one store and then says the store cannot go — so a reader cannot tell what the peephole pass is actually allowed to do.

**4.** "Leaf functions ... keep up to 10 locals in registers with no frame; other functions keep up to 11 in saved registers."
I had to work out where 10 and 11 come from. `s0`–`s11` is twelve registers, so 11 leaves one spare; the caller-overwritable set is `a0`–`a7` plus `t0`–`t6` = fifteen, so 10 leaves five for expression evaluation. Neither derivation is stated, and "up to" hides the fact that the number must be less than the register count because temporaries are needed.

**5.** "The model predicts code 2.7 times smaller from the compile-time stack alone and 3.3 times smaller with locals in registers. Editor's native code would shrink by about 110 to 123 kilobytes, in a world that currently has 58 KiB of memory to spare."
The first sentence I could check (43,965/16,544 = 2.66; 43,965/13,255 = 3.32). The second mixes units: 109,684 and 122,840 *bytes*, reported as "kilobytes", sit next to a "58 KiB" figure. In KiB the saving is 107 to 120. The two numbers are close enough that the reader cannot tell whether the sloppiness matters, but it is exactly the sort of thing to get right in an article about bytes.

## Terms used before they were explained, or never explained

- **typed compiler** — used in the first paragraph and throughout ("the typed compiler's backend", "the typed compiler translates `p && q`"); never defined. I do not know whether it means "the compiler for a typed language", "the compiler that has passed type checking", or "Article 3's compiler".
- **backend** — used in 5.2 ("what the typed compiler's backend does today") as if already known; never defined, nor is **frontend**, which appears in 5.6.
- **`i32`** — appears in the `bump` signature with no explanation of the type notation or of what the `i32` prefix on `i32.add` means.
- **`li`, `addi`, `slt`, `slli`, `lhu`, `bnez`, `bne`, `beq`, `blt`, `blez`** — `lw`, `sw`, `add` and `blt` are explained in 5.1; the rest are used with no gloss, including `addi`, which a reader meets in 5.5 (`addi t0, t0, 1`) before any instruction list mentions it.
- **KiB / MiB** — used in 5.1 ("about 4 KiB", "about 1 MiB") without saying what the "i" means.
- **PR** — inside the Best's-algorithm quotation: "spill the PR that contains the value whose next use is farthest in the future". "PR" (pseudo-register) is never expanded and the sentence is unreadable without it.
- **SSA** — section 5.10 heading "An optimizing backend with SSA", never expanded or explained.
- **loop-invariant code motion**, **range-check elimination**, **loop inversion** — named in 5.9 as "the subject of the optimization chapters", but none of the three is described. "Loop inversion" in particular is not guessable from its name.
- **bounds check** — used in 5.9 ("no bounds check", "removing bounds checks") without ever saying what a bounds check *is* or what happens when it fails.
- **destination-driven code generation** — given only as a name plus a citation; the article never says what "destination" means in it (where the value should go, where control continues), beyond the four-word hint.
- **intermediate representation** — used in 5.9 and 5.11 as something one-pass compilers lack; never explained as a concept.
- **Experiment 1, Experiment 2, Experiment 3** — referred to as if described here; they are in Article 2, which this article does not summarise beyond the numbers it needs.
- **Amdahl's law** — "a question for Amdahl's law (Article 2)"; the law itself is never stated.
- **static stack caching**, **value stack**, **virtual stack** — all three are named as this article's technique under other names, which is fine, but "state machine in the compiler" (Ertl) is asserted rather than described, so I could not check that it is the same idea.
- **direct-coded** — "the form the textbook calls direct-coded [Cooper & Torczon 2023, §2.5.2]"; the term is cited, not explained.
- **coverage of "reduce code size by 25 to 30 percent"** — "16-bit compressed encodings" is at least described in outline, but never shown; I do not know what `c.addi` looks like or what it costs to mix widths.

## Claims I could not verify from the article itself

**1.** "The complete function is 41 instructions."
The article shows 10 instructions for `let a = b + c` and 4 for the `if` test, and never shows the other 27. Since 41 is the anchor for the whole argument ("One instruction in ten does arithmetic", and later `bump` 41 → 15 → 5 → 4), I would like either the full listing or a per-statement breakdown. As it stands I have to trust it.

**2.** "the realistic gain is about half of it."
No basis is given for the factor of one half. Is it measured, argued from the structure of the missed opportunities, or a guess? The article presents it in the same paragraph as measured percentages, so a reader will assume it is measured.

**3.** "In Editor, 31 of 120 functions are leaves."
No method. Does "calls no other function" count only direct WebAssembly `call` instructions? Are calls to operators (e.g. `+` on strings) counted? I cannot reproduce the 31.

**4.** "the deepest operand stack in Editor is 8, and 100 of its 120 functions never exceed 5. The seven temporaries `t0`–`t6` are enough for almost all code without spilling."
The 8 is deeper than 7, so at least one function *does* need more than the temporaries, and model B "assumes a free temporary register is always available" — this is the assumption doing work, but no statement is made about how much code falls outside it. I cannot check how "almost all" is justified.

**5.** "there are 228 such blocks in Editor."
No method given for counting `&&` blocks, and no lower bound shown on how much they cost.

**6.** "flushes account for 155 of 16,544 instructions in Editor, under one percent."
The arithmetic checks (0.94 percent), but the 155 arrives from nowhere — I cannot see which joins triggered a flush or why most joins are free.

**7.** "Experiment 3 found that lowering to RV32 accounts for 41 percent of the native compile path and tokenizing for 16 percent."
No table, no timing method, no statement of what "the native compile path" includes (parsing? type checking? assembly? the 483 ms link step mentioned two paragraphs later?). Also no baseline in milliseconds for this experiment, unlike Experiment 1's instruction counts.

**8.** "Model B: ... other functions keep up to 11 in saved registers and pay two instructions each to save and restore them."
"Two instructions each" is asserted, not derived. With 11 saved registers the prologue would normally need 11 stores and the epilogue 11 loads, which is 22 instructions — the same total, but "each" reads as "per local" only if you assume one `sw` and one `lw` per local. This matters because `bump`'s model-B count is 5, and I could not reconstruct where the 5th instruction comes from.

**9.** "a link step from 483 ms to 259 ms and its memory from 1.36 MB to 0.41 MB."
Presented as precedent from this project, with no pointer to where it was measured. It is the only evidence offered for the byte-array change.

**10.** "It then applies two alternative rule sets" — with the counting rules stated in three lines of prose (bullet list under section 5.8). That is not enough to re-derive 16,544 or 13,255 by hand: I do not know how a call is costed, how an `if` with no result is costed, whether the model charges for the frame pointer setup, or how a `local.set` whose value is already in the local's slot is treated. The exact-match validation is offered in place of the rules; that justifies the *baseline*, not the new counts.

**11.** "Its authors report a WebAssembly compiler that generates code 4.9 to 6.5 times faster than Liftoff" and "the specification says typically reduce code size by 25 to 30 percent."
Second-hand numbers with citations but no note on whether the comparison is like-for-like (compile speed, not code quality, in the copy-and-patch case). Fine as cited claims, but I could not check them and the article does not say what would be different here.

**12.** "Model B already brings native code within a factor of about 1.3 of hand-written code on this example."
17/13 = 1.31, which checks. But it checks only for `countUnit`; the article says "on this example", so it is a single data point, and no other hand-written comparison exists to say whether 1.3 is typical.

## Section scores

| Section | Score | Reason |
| --- | --- | --- |
| 5.1 Two machine models | 4 | The register table and the stack/register contrast are clear, but `i32`, KiB and several opcodes arrive unexplained, and the RV32 instruction vocabulary is half-glossed. |
| 5.2 The current translation, by hand | 5 | The best section: ten instructions shown one per row with a purpose column, and the waste made visible ("the only instruction that computes anything"). The `if` snippet is the one weak spot. |
| 5.3 How much of the output is waste | 4 | The table is easy to read and its percentages are internally consistent, but it inherits unexplained figures from Article 2 and never says how any row was counted. |
| 5.4 Technique 1: a peephole pass | 2 | The peephole idea is clear, but the central sentence contradicts itself about what the rule does, and "the realistic gain is about half of it" has no support. |
| 5.5 Technique 2: a compile-time operand stack | 5 | The three-way entry list (register / constant / local) plus the four-row table is exactly the right shape; the history paragraph earns its length. |
| (rule at control-flow joins) | 5 | "no single instruction sequence after the join could be right for both" is the clearest sentence in the article, and the loop/trap/interrupt exceptions are stated. |
| 5.6 Technique 3: branches without truth values | 4 | The pending comparison and the patch-later branch are both clear; the `&&`/destination-driven half is name-dropping that I had to take on faith. |
| 5.7 Technique 4: locals in registers | 3 | Leaf versus non-leaf is clear, but the "10" and "11" are unexplained, the Sethi–Ullman sentence is a non sequitur in its paragraph, and the "PR" quotation is unreadable. |
| 5.8 A counting model of the gain | 4 | The validation argument is stated honestly and the limitation paragraph is unusually candid; what is missing is enough rule detail to re-derive the numbers. |
| 5.9 What one pass cannot do | 4 | The loop listing plus the three named transformations makes the boundary concrete; the missing setup code means I could not verify the 13. |
| 5.10 Techniques considered and set aside | 3 | Copy-and-patch is well explained; tree-pattern matching is explained by reference only, and "SSA" is undefined. |
| 5.11 The compiler's own speed | 3 | Short and answerable, but the percentages are unsourced and "direct-coded" is a citation rather than an explanation. |
| 5.12 Key points | 5 | Six bullets that are each checkable against a named section above. |
| 5.13 Check your understanding | 4 | Good questions: 1, 3 and 4 are answerable straight from the text, 2 and 6 need assembly of two sections, and 5 is the one that tests understanding of the article's own argument. |

## Questions that the article did not let me answer

**Q1 (and Q2) — the `i32.const` push.** The article never shows the current backend emitting a constant. The `bump` example has only `local.get`, `i32.add` and `local.set`, so I had to invent `li t0, 1` (or `addi t0, x0, 1`) for the middle push in question 1. It does not change the count of ten, but it means the answer is partly reconstructed rather than read off the text. Relatedly, slot numbering is only given as a pair of offsets in prose, so mapping "stack slot 0/1" to "offset 8/12" is an inference.

**Q2 — whether the pending constant costs a register.** The article says "A constant operand often never needs a register at all: `a + 1` becomes the single instruction `addi t0, t0, 1`", which makes three instructions the intended answer. But the only worked example with a constant-adjacent operand is that one clause, and the 5.5 table shows a two-local add emitting three instructions. So the answer depends on reading a general rule out of a single example, and a reader who answered four instructions would not be clearly wrong.

**Q3, Q4, Q6 — fully answerable.** Q3 from the "correctness requirement" paragraph, Q4 from 5.2 and the branch rows of 5.3, Q6 from the loop listing and the three named transformations in 5.9. Q5 is answerable as an argument, but only because 5.8's limitation paragraph exists; the question implicitly asks for the list that paragraph supplies.

**Not a quiz question, but unresolvable:** the 41-instruction count for `bump`, since 27 of the instructions are never shown.

## One thing to add and one thing to cut

**Add.** The full 41-instruction listing of `bump`, laid out like the existing 10-row table with a WebAssembly column, so that the chapter's headline number ("41 → 15 → 5 → 4") can be counted rather than trusted. It would also settle the `i32.const` question in Q1 and show the loop-test-at-the-bottom waste that 5.9 only mentions in passing. If 41 rows is too many, a per-statement tally — how many instructions for the prologue, for `let a`, for the `if` test, for the body, for the return — would be enough.

**Cut.** The history paragraph in 5.5 that walks through TCC, Lua, Ertl, Liftoff and Titzer one name at a time. Four of those five only supply synonyms for "compile-time stack", and the fifth ("one forward abstract interpretation of the operand stack") is a phrase, not a technique. One sentence — "the idea is independently named *value stack* in TCC, *static stack caching* in Ertl's work, *virtual stack* in V8's Liftoff, and appears in a survey of six WebAssembly compilers [refs]" — carries the same scholarship in a tenth of the space, and the saved space could pay for the `bump` listing above.
