# Feedback on Article 7, "Safety by Construction"

## Passages I had to read twice

1. > "Define the stack need of a function as the size of its own frame plus the largest stack need
   > of anything it calls, where a called typed function contributes its own stack need and a called
   > reactor function contributes the stack that function uses."

   One sentence carries a recursive definition and two exception clauses at once, and "contributes
   the stack that function uses" is a second meaning of "stack need" (a measured constant rather than
   a computed quantity). I had to redraw it as "need(f) = frame(f) + max over callees c of
   (need(c) if c is typed, measured(c) if c is a reactor function)" before I trusted it.

2. > "The amount is an upper bound on the true cost of each iteration, so the counter is an upper
   > bound on executed instructions, and a budget in milliseconds follows from the processor's speed."

   The last step is asserted rather than shown: no instruction timings, no statement of what the
   processor's speed is, and no acknowledgment that memory accesses and branches cost differently, so
   an instruction count converts to milliseconds only roughly.

3. > "To bound executed instructions, the compiler subtracts a larger amount: the greatest number of
   > instructions that one trip around the loop body can execute, not counting inner loops, which have
   > back-edges of their own. For an `if` it takes the longer branch."

   Two things are missing. I could not tell whether the fuel code itself, and the loop's own exit
   test and branch, are counted inside that "greatest number". And "it takes the longer branch"
   suggests a static choice, but the article does not say how the compiler knows which branch is
   longer when the branches contain calls whose length depends on data.

4. > "With pattern checking alone, the compiler's handling of types would remain in the first row."

   "The first row" refers to a row of a table that is never printed. The comparison table that follows
   has different row labels ("Trusted for memory and control safety of native typed code"), so a
   reader cannot tell what row is meant or what is being claimed.

5. > "The thick arrow is a call the compiler rejects, because at the time `helper` is translated,
   > `scan` is not yet in the table."

   In the diagram the thick arrow runs between the same two nodes as the first solid arrow
   (helper → scan), which also means "helper is defined before scan". I read the picture as
   "helper may call scan" before working out that the solid arrows encode definition order only and
   that the same pair of nodes therefore appears twice with opposite meanings.

6. > "The only indirect jump is the return at the end of a function, and the return address was loaded
   > from the frame slot where the function's entry saved it"

   What exactly the verifier checks here is unclear: that the load's address is that frame slot, that
   no intervening store touched it, or that the value was actually saved at entry. Each is a different
   check with a different difficulty.

7. > "The last-but-one row is the hardware route's distinctive advantage."

   Counting rows backwards in a table with unnumbered rows (and a table in the previous section with
   a similar backward reference, "The last row is the difficult one") costs more attention than naming
   the property.

## Terms used before they were explained, or never explained

- **RV32** — used in the first paragraph ("native RV32 machine code", "emitted RV32 code") and never
  defined in the article or the glossary; I inferred "32-bit RISC-V" from section 7.7.
- **`sp`** — used in the verifier table ("`sp` changes only at function entry and exit") without ever
  saying it is the stack pointer register.
- **supervisor mode** — appears only as something this chip lacks ("with no supervisor mode"), with no
  explanation of what privilege levels exist or how they relate to machine and user mode.
- **linear memory** — the VeriWasm paragraph speaks of "linear-memory accesses" as if the term had been
  introduced; it never is.
- **proof assistant** — "the verifier's own soundness is proved in a proof assistant" is never explained,
  and it matters, because it is the evidence for the claim that the verifier is trustworthy.
- **WAMR** — named as the WebAssembly engine in the opening paragraph; the name is never expanded.
- **QuickJS** — named as the JavaScript engine; never described beyond being interpreted.
- **linker** — the trust table counts "compiler frontend, backend and linker (three files, about 1,070
  lines…)", but the article never says what the linker does in this pipeline or which file it is.
- **ESP-TEE** — given as "the vendor's own isolation framework"; the acronym is never expanded and the
  framework is never described.

## Claims I could not verify from the article itself

1. > "The comment at the top of the device's native loader states the present situation without
   > softening it."

   All the quotations in 7.1 come from `native_elf_p4.c`, which is not reproduced; the reader takes the
   paraphrase on trust. A short verbatim block of the comment would make the section checkable.

2. > "A function's name is entered in the table when the compiler has *finished* translating its body."

   This is the load-bearing fact for all of section 7.4, and the only evidence is a pointer to
   `compiler/typed-wasm.js`. No code fragment is shown, and the claim that a self-call fails with
   `unknown function f` is asserted rather than demonstrated.

3. > "On their benchmark programs they measured an average of 4 percent added execution time
   > [Wahbe et al. 1993]."

   A single number with a citation: no benchmark names, no baseline, no range. The same applies to the
   later "a budget of 4,000 *reductions*".

4. > "The cost is an estimated two or three instructions per loop iteration: subtract, compare, and a
   > branch that is not normally taken."

   Three instructions are described and then called "two or three", and nothing says whether these
   instructions replace or follow the loop's own test; no measurement or code fragment is offered.

5. > "The reactor functions are C code with no recursion, so each one's stack use is a fixed quantity
   > that is measured once when the firmware is built."

   No measurement method and no numbers. Since the whole stack bound depends on these constants, at
   least one example would let a reader check the arithmetic.

6. > "Every instruction is 4 bytes, so instruction boundaries are fixed."

   True for RV32 only without the compressed extension; the article never states whether the backend
   disables C instructions, and the whole "every target is 4-byte-aligned" check depends on it.

7. > "Because no unbounded execution can avoid passing a back-edge, the program cannot run indefinitely."

   This needs an assumption the article does not state: that a call into the reactor always returns and
   that every reactor function terminates. A reactor function that blocked, or that looped internally
   on data, would never reach the compiled code's back-edge, and no fuel would be charged in the
   meantime beyond the fixed worst-case charge.

8. > "The chip's technical reference manual documents machine and user modes for its main cores, with no
   > supervisor mode, and up to 32 PMP entries."

   No quotation, section, or table is given for the manual, and the article itself says immediately
   afterwards that the relevant facts ("how many entries can be spared… what a trap costs") are unknown,
   so the reader cannot tell which parts of this paragraph are checked and which are remembered.

9. > "The vendor's own isolation framework, ESP-TEE, does not support this chip at the time of writing."

   A negative claim about a third-party product with a date-sensitive "at the time of writing" and no
   citation to the supported-targets list.

10. > "The firmware already uses PMP to separate code from data in internal memory, an option visible in
    > its build configuration."

    No file, option name or path, so a reader cannot find this.

11. > "The verifier (estimated at a few hundred lines of C)."

    An estimate with no comparable object: a few hundred lines against what measurement of the present
    compiler's 1,070 lines, and by whose guess.

12. > "The backend uses about twenty different instructions; the table in Article 5 lists the common ones."

    "About twenty" and "the common ones" do not add up to a closed list, and the verifier's first check
    ("every word decodes to one of the instructions the backend is permitted to emit") requires exactly
    such a closed list.

## Section scores

- **7.1 — 5.** Short, direct, and the two tables separate the three properties and the three possible
  faults cleanly; the loader quotations make the problem concrete.
- **7.2 — 4.** The four-way comparison is the clearest thing in the article, but the prose beneath the
  table packs four research programmes into two paragraphs at a speed that leaves the reader unable to
  say what RockSalt or proof-carrying code actually gained.
- **7.3 — 5.** The bullet argument is complete: every way of producing a reference, and every indexed
  access, is accounted for, and the concluding caveat about the compiler is stated honestly.
- **7.4 — 4.** The impossibility argument for recursion is excellent; the stack-need definition is one
  overstuffed sentence and the mermaid diagram confuses rather than helps.
- **7.5 — 3.** This is the hardest section and the thinnest: the shift from "subtract 1" to "subtract the
  greatest straight-line cost" is asserted in three paragraphs with no worked example, and the reactor
  charge is described only by the search example.
- **7.6 — 4.** The verifier check table is genuinely teachable, and the pattern-checking versus masking
  contrast is the best explanation in the article; the dangling "first row" sentence and the unexplained
  `sp` cost it a point.
- **7.7 — 3.** The PMP explanation is good and the comparison table is useful, but the section mixes
  documented facts, guesses and open questions without marking which is which, and depends on terms
  (supervisor mode, TEE) that are never defined.
- **7.8 — 5.** The key points are accurate and would stand alone; each maps to a section and none
  introduces a new claim.
- **7.9 — 4.** The six questions are fair and mostly answerable from the text; question 4 depends on the
  one passage (7.5, second bullet) that the article explains least.

## Questions that the article did not let me answer

None was unanswerable, but one was answerable only in outline.

- **Question 4** — the difference between "subtract 1" and "subtract a larger amount" is stated, but the
  article never says whether the fuel instructions themselves are inside the counted "greatest number
  of instructions", nor whether the loop's own test and branch count. I could name the charges but could
  not be sure the bound is as tight and as sound as claimed, which is why I marked that answer 4 rather
  than 5.
- **Question 6** — answerable, but only because the 7.7 comparison table exists; the prose of 7.7 never
  says directly that the hardware route covers other compilers' output. A reader skipping tables would
  miss the answer entirely.

## One thing to add and one thing to cut

**Add:** one worked numeric example for section 7.5, tracing a three-function program through the fuel
charge — frame sizes from Article 5, the straight-line cost of each loop body, the added typed-call cost,
and one reactor call charged at span length — ending in a total instruction upper bound and a millisecond
budget. The definitions are all present; only the arithmetic that joins them is missing, and it is the
single place where a reader is most likely to give up.

**Cut:** the CHERIoT sentence at the end of 7.7 ("At the far end of the hardware spectrum, the CHERIoT
architecture replaces addresses with unforgeable capabilities…"). It is a second processor, a second
mechanism and a third vocabulary introduced in one sentence that the reader is explicitly told is off
topic, and it sits immediately after the honest admission that the actual PMP questions are unanswered;
cutting it keeps the section's attention on the experiment the article says is needed. (If something must
instead be shortened for space, the safest cut is the Wahbe/NaCl/RockSalt lineage paragraph in 7.2, which
is context rather than argument.)
