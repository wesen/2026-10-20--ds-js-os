# Feedback from a student reader

## Passages I had to read twice

1. "The number of functions is also stored in a header at the start of the reactor's code
   area, and the linker compares it with the length of the compiler's table. That check
   catches a function added to one list and not the other."
   — The section says there are *three* places that must agree, and the diagram labels
   them A, B and C, but the check described touches only two of them. The reader has to
   work out which two: presumably the header count comes from the assembly file (one
   trampoline per function) and is compared with the compiler's table. That is never
   stated, and the C file's order is left completely unchecked with no comment. It also
   says "the linker" here where the diagram promises a "build step" for the generated
   files, which is a different actor.

2. "Two further facts that Articles 7 and 9 need for each function are not part of WIT and
   would be this project's own additions to the description: which capability the function
   requires, and how much fuel, the counter that bounds a handler's running time, a call
   should be charged."
   — Four clauses are nested inside one another, and the second list item hides its own
   apposition in the middle. I had to unpack it into "…and how much fuel a call should be
   charged, where fuel is the counter that bounds a handler's running time".

3. "A full Editor screen is 17 rows of at most 49 characters. As 16-bit code units that is
   833 × 2 = 1,666 bytes of text, and with a four-byte header per row for style,
   indentation and length, 1,734 bytes in all."
   — The arithmetic works (17 × 49 = 833, 833 × 2 = 1,666, plus 17 × 4 = 68 gives 1,734),
   but the field widths are never given, so the reader cannot see how three fields fit in
   four bytes. I had to guess one byte for style, one for indentation and two for length.

4. "Article 2 presented evidence that the compositor is the largest consumer of time on the
   path to the screen, and noted that in the measured firmware it was already native code.
   The cost lies in what the compositor is asked to do."
   — These sentences pull against each other until section 10.3's step list explains it. If
   the compositor is already native code, the reader's first guess is that there is no time
   left to win; only later does the article say the lost time is the JSON parsing and the
   garbage-collected tree, not the drawing.

5. "It takes stock of what the firmware now contains, describes four structural changes that
   the earlier articles imply but did not develop…"
   — The count of four never reappears, so the reader must decide which sections count.
   10.2, 10.3 and 10.4 are clearly changes; 10.5 ("Fewer engines") reads as a consequence
   of the others and contains no new structure, and section 10.3 in fact contains two
   proposals (the protocol and the typed compositor). Four is plausible but not obvious.

6. In the section 10.5 table, the row for the on-device CJI compiler reads "Needed as long
   as … Compiling unannotated JavaScript on the device remains a goal" and then, under
   "Could be removed when", "Now, by giving up that goal."
   — The column headings are about a condition that will happen in the future, and the
   entry is an argument, not a condition. It took a second reading to see that the table
   is saying the row can be removed by a decision rather than by finishing other work.

7. "The `await` transformation reproduces Editor's behaviour using no more than its current
   71 state fields" … "If it fails … Saving every variable that is live across a wait is
   less economical than hand-written state; examine which variables it saves that the
   hand-written code does not."
   — "71 state fields" and "the counting model" in the first row both refer to work in
   Articles 5 and 8 that this article does not summarise, so a reader who is reading this
   article alone cannot judge whether the prediction is generous or strict.

## Terms used before they were explained, or never explained

- **firmware** — used in the first sentence ("what the firmware now contains") and never
  defined in the article or in the glossary, though most later sections depend on it.
- **ELF** (section 10.1, "Loads RV32 ELF modules") — not explained anywhere; only the
  glossary's *Engine* entry hints that native means RV32 machine code.
- **capability** (section 10.2, "which capability the function requires") — not in the
  glossary. *Claim* is close but is defined as a manifest entry, and it is not said whether
  the two are the same thing.
- **relocation** (section 10.5, "a boot-time relocation that had to be scheduled around") —
  never explained, although it is one of the costs used to argue for removing the CJI tool.
- **garbage collector / garbage-collected heap** — used in section 10.3 ("allocated on a
  garbage-collected heap") and in the 10.1 table; the glossary mentions "a garbage
  collector" inside the *CJI runtime* entry without defining what one does.
- **mutation testing** (section 10.7, "Mutation testing of emitted modules") — never
  explained; the reader must infer that it means changing emitted code deliberately and
  checking that the verifier rejects it.
- **guard facts** (section 10.6, step 4, "guard facts for bounds checks") — never
  explained; presumably facts that let a check be removed, but that is a guess.
- **UTF-16, UTF-8, code unit** (section 10.3) — used as if known, including in the byte
  calculation, with no definitions in the article or glossary.
- **interpreter** (section 10.4, "the interpreter would still treat every number as a
  general value") — the glossary defines *engine* but not the interpreter inside one.
- **Agenda** and **Files** — used throughout as applications whose ports are being costed,
  but the article never says what either program does, and the glossary has no entries
  for them (only *Compositor*).
- **frontend**, **linker** (section 10.1 table, "Frontend, WebAssembly linker, RV32
  lowering") — neither is defined in the article or the glossary; *Lowering* is.

## Claims I could not verify from the article itself

- "Article 2 presented evidence that the compositor is the largest consumer of time on the
  path to the screen" — no figure, no percentage and no summary of the measurement is
  given here. Since section 10.3's whole proposal is made conditional on that measurement
  ("started only if the key-to-pixel measurement of Article 2 confirms"), the article
  should at least state the number it is relying on.
- "The design notes budget up to six output bytes per input unit for this step" and "The
  figure of six bytes per unit in step 2 is from the Editor's capacity design note in the
  project's records." — the note is cited but not quoted and is not in the reference list,
  so the six-fold expansion cannot be checked. This matters because it is the evidence
  that step 2 is expensive.
- "Its build times of minutes make it unusable interactively, and it costs 660 kB and a
  boot-time relocation that had to be scheduled around." — no build time is given, for
  which program, on which device. The 660 kB is repeated from the table but not measured
  in front of the reader; "minutes" is the only performance number and it has no range.
- "Native code about 2.7 times smaller" (step 5 of the roadmap) — the only two numbers the
  article offers give 1,529 / 593 = 2.58, so 2.7 cannot be reproduced. Either the 2.7 comes
  from a different application or the ratio should be "about 2.6".
- "The project's device-language study considered compiling the typed language to
  JavaScript as the way to *run applications fast*, and rejected it for that purpose" — the
  study is not cited in the reference list and its reasoning is only paraphrased in one
  clause, so the reader cannot tell how far the rejection carries over to the new purpose.
- "Twelve applications still to port" — the article never lists the applications or says how
  many exist in total, so the size of the remaining work, which drives step 7's ordering,
  is unverifiable.
- "The typed versions are four to six times longer" — the two factors given are 5.5 and 4.4,
  which is a narrower range than "four to six", and the article does not say what the other
  applications measure. (The two quoted factors themselves check out: 1,730 / 316 = 5.5 and
  (468 + 869) / 307 = 4.4.)
- "Editor contains 104 such `writeLiteral` calls" — plausible and specific, but no way is
  given to confirm it and no second example beyond the one quoted line.
- The asm.js quotation ("by means of an explicit coercion on function entry") and the
  TypeScript 5.8 and TC39 stage-1 claims are attributed to outside sources in the
  reference list; they cannot be checked from the article, and the article does not say
  what a reader should conclude if the stage-1 proposal is withdrawn.

## Section scores

- **10.1** — 4. The inventory table and the size comparison are easy to follow and the two
  multipliers are arithmetically correct, but "four to six times" is looser than the two
  figures given, and the reader is left to work out what "three reactors" counts.
- **10.2** — 4. The diagram makes the three hand-written lists concrete and the failure
  mode is stated plainly, but the passage about the count check leaves the reader to guess
  which two of the three lists it covers, and the WIT paragraph is dense.
- **10.3** — 4. The numbered five-step walkthrough is the clearest passage in the article
  and the byte arithmetic can be checked line by line; it loses a point for the unstated
  field widths and for the unexplained tension with "already native code".
- **10.4** — 3. The rewrite table is genuinely useful, but the asm.js and TypeScript history
  takes three paragraphs to reach it, and the reader is asked to accept the list of
  semantic differences on the authority of Articles 8 and 9 without a summary.
- **10.5** — 4. Removing one mechanism at a time with an explicit condition is easy to
  follow, but the fourth row's "Could be removed when: Now" breaks the column's logic and
  the reader has to reinterpret it as a decision.
- **10.6** — 3. The roadmap table is the most useful artefact in the article, but effort
  classes are only relative, and the flowchart's edges do not match the table's "Unlocks"
  column (step 3 does not list step 10 in the table although the graph draws
  interface description → screen protocol), so a reader cannot tell which of the two to
  trust.
- **10.7** — 4. Every prediction has a check and a consequence, which is exactly what the
  reader needs, but several predictions quote models and counts from earlier articles
  ("the counting model", "71 state fields") that are not described here.
- **10.8** — 5. Six bullets that could serve as the summary of the issue; nothing unclear.
- **10.9** — 4. Five of the six questions can be answered from this article alone; question
  5 requires the reader to connect "no `await`" among three missing features to the 4–6
  times multiplier, which the text never does explicitly.

## Questions that the article did not let me answer

- **Question 1, partly.** The failure the check catches and the failure it misses are both
  stated. What is not stated is which of the three files supplies the header count, so the
  phrase "one list and not the other" has to be interpreted by the reader. It is also never
  said whether the C implementation's order is checked at all, which is one half of "how
  does the interface description remove both".
- **Question 5, partly.** The ordering reason is given ("porting twelve applications in the
  current style would produce a great deal of code that `await` would then make obsolete")
  and the multiplier can be recomputed, but the article never says how much of the 4–6
  times comes from the absence of `await` rather than from the absence of allocation and
  string operations. A reader can quote the ordering but cannot weigh it.
- Questions 2, 3, 4 and 6 are answerable from the text; question 6 needs the reader to
  choose from a table, which is fair, though the "counting model" it refers to is not
  described anywhere in this article.

## One thing to add and one thing to cut

**Add.** A worked example of the interface description: one entry for one reactor function
showing name, parameter types, result type, capability and fuel, next to the three artefacts
generated from it — the compiler table row, the assembly trampoline and the C prototype —
with one sentence on how the *order* is derived. Section 10.2 is the article's most
load-bearing proposal and its smallest, and one example would make both the "one source"
claim and question 1 concrete, instead of leaving the reader to infer where the header
count comes from.

**Cut.** The WIT resource-and-handle aside in 10.2 ("it can declare a *resource* type, an
entity 'that can only be passed around indirectly via handle values', with owned and
borrowed handles…"). It introduces a fourth topic — handle ownership — in a sentence that
already carries the main point that WIT is a precedent, and no step of the roadmap in 10.6
depends on it; the capability and fuel additions that follow are the parts the roadmap
actually needs.
