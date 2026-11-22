# Feedback on "10. Architecture and a Roadmap"

Read as a student reader with no access to Articles 2–9, the Web, or the code. That is worth
stating up front: this article is a synthesis chapter and it repeatedly leans on facts that live in
other articles, so some of what follows is a complaint about being asked to trust a summary.

## Passages I had to read twice

1. > "A count of functions is also packed into a header word that the linker checks."

   Which header word, written by which file, and checked against what? I eventually guessed it is a
   word in the assembly or the compiled module header, but the article never says, so I could not
   tell whether the count protects the compiler's table, the trampoline table, or both.

2. > "The reactor's table gives each function's name and types and fixes its position."

   This follows two paragraphs in which "the compiler's table" and "the trampoline table" are the
   two named things, and "the reactor's table" is a third name for one of them. I had to re-read to
   be sure it meant `compiler/typed-world.js` and not something in `world.c`.

3. > "The natural companion is a compositor written in the typed language. It is today 485 lines of JavaScript compiled by CJI, with CJI's run-time system behind it."

   "It" reads, on first pass, as the typed compositor just proposed, which has no line count yet.
   The sentence means the existing compositor. One word — "That compositor is today…" — would fix
   it.

4. > "Could be removed when: … Now. Its build times of minutes make it unusable interactively…"

   Having "Now" as a cell in a column of conditions is a category break; I had to check whether the
   row was a condition or an instruction.

5. > "A screen of 17 rows of 49 characters is under 2 kB in such a form."

   I did not know whether the row count and width were given as arithmetic support for the 2 kB or
   as an example screen. I worked out 17 × 49 = 833 characters and then could not get from that to
   2 kB without knowing bytes per row of overhead.

6. > "Step 10 is deliberately late and conditional."

   Late relative to what, and conditional on what, is only recoverable from the earlier prose; in
   the list of three sentences this one has no content of its own beyond restating the table.

## Terms used before they were explained, or never explained

- **reactor** — used from the first table onward (and in the title of 10.2) as if known; no
  definition of what a reactor *is* ever appears in this article.
- **nucleus** — "Connects a fully typed application to the nucleus", "The nucleus copies the
  message to the compositor's queue". Never defined.
- **CJI** — appears in the inventory table and throughout as a compiler and a runtime; the acronym
  is never expanded and never given a one-line description here.
- **world** — "Runs JavaScript worlds", "three engines". Presumably an application instance, never
  said.
- **WAMR** — named in the table, never expanded (I assume WebAssembly Micro Runtime).
- **RV32** — used in the table and in "RV32 ELF modules" without saying what it is.
- **PMP** — step 11, "worlds in user mode under PMP", never expanded.
- **trampoline** — "one jump per function", "one trampoline per function"; the mechanism is
  roughly inferable but the word is not defined.
- **content key** — step 1, "Cache compiled modules under a content key", never explained.
- **fuel** — "how much fuel a call should be charged", step 6 "Fuel counter"; never explained as a
  metering/budget mechanism.
- **guard facts** — step 8, "guard facts for bounds checks", never explained.
- **liveness-based saving** — section 10.7, last row; never explained.
- **state fields** — section 10.7, "its current 71 state fields"; the notion is used to judge the
  `await` proposal but never introduced.
- **erasable type syntax**, **Stage 1** — "erasable type syntax" is glossed, but the committee's
  stage numbers are not; I inferred that Stage 1 is early, which may be wrong.
- **resource / handle** — mostly explained via the WIT quotation, but "owned and borrowed handles"
  is left as a phrase.
- **typed source** vs **annotated source** — section 10.4 speaks of "typed source" looking "like
  JavaScript with annotations", while section 10.5 speaks of "unannotated JavaScript". The
  relationship between an annotation language and the typed language is never made explicit.

## Claims I could not verify from the article itself

1. > "The typed versions are five to six times longer than the programs they replace."

   This is checkable from the article's own numbers only for one of the two applications. Editor:
   1,730 ÷ 316 ≈ 5.5, which fits. Agenda: (468 + 869) ÷ 307 = 1,337 ÷ 307 ≈ 4.4, which does not.
   So the stated range holds for Editor and overstates Agenda by roughly a factor of one; either
   the C should be counted differently or the range should be narrower ("four to six").

2. > "A typed application reaches the system through 28 functions that the shared reactor provides."

   The 28 functions are never listed, and only one example (`output.writeLiteral`) appears
   anywhere. I have to take the count on trust.

3. > "A compile-time operand stack gives 593 instructions for Files, where today there are 1,529 (Article 5)"

   No counting convention is given (instructions in the emitted module? in the image? static count
   or executed count?), and the 1,529 is not in this article. Unverifiable here.

4. > "Application code is under 10 percent of key press to pixels (Article 2)"

   Cited to Article 2 with no figure at all — not even the measured proportions. It is presented as
   a prediction to be checked by step 0, so perhaps that is deliberate, but as written I cannot see
   what was measured.

5. > "Native code about 2.7 times smaller; memory headroom" (step 5) and "Removes 2–3 s from every
   boot" (step 1)

   Both are precise numbers whose derivation is in Articles 5 and 6, not here.

6. > "with twelve applications still to port"

   The total number of applications is never given, so I cannot check twelve against a remainder.

7. > "The design notes budget up to six output bytes per input unit for this step."

   "The design notes" are not identified (no reference, no article number), so this is unsourced
   inside the issue's own citation scheme.

8. > "the proposal before the JavaScript standards committee would have engines ignore annotations as if they were comments (it is at the first of the committee's stages)"

   References give "TC39 … Stage 1", but I cannot tell from this article what the practical
   consequence of Stage 1 is, nor whether the proposal will land.

9. > "It is today 485 lines of JavaScript compiled by CJI, with CJI's run-time system behind it."

   The compositor's 485 lines do not appear in the section 10.1 inventory table, whose "Component"
   list would naturally hold them, so the inventory I was asked to trust is already incomplete
   relative to this section.

## Section scores

- **10.1 What the firmware contains — 5.** The inventory tables are the clearest part of the
  article; sizes and roles are laid out so I can count "three engines, two compilers, two run-time
  systems and three reactors" myself, and the only slip is the five-to-six-times figure.
- **10.2 One description of the reactor's functions — 4.** The problem (three hand-kept lists, order
  is identity, nothing checks order) and the remedy are both concrete, and the diagram carries the
  argument; it loses a point because "the reactor's table"/"the compiler's table" naming and the
  "header word" are not pinned down.
- **10.3 A typed screen protocol — 4.** The five-step walkthrough is excellent and the
  before/after contrast is unmistakable; the 2 kB figure and the "up to six bytes per input unit"
  budget are asserted without a derivation I can follow.
- **10.4 One source for both engines — 3.** The rewrite table is genuinely instructive, but this
  section most depends on several things at once — typed source vs annotated JavaScript, the
  device-language study's earlier rejection, and what "the reactor's 28 functions" in JavaScript
  means — and the distinction between "cannot detect source-logic errors" and "can detect backend
  errors" needed a third reading to feel solid.
- **10.5 Fewer engines — 3.** The "Needed as long as / Could be removed when" frame is a strong
  idea, but the cells are telegraphic, "Now" breaks the column's grammar, and the CJI row depends
  on knowing what CJI does — which this article never explains.
- **10.6 The roadmap — 4.** The table is well designed and the three explanatory sentences after it
  do real work; the graph duplicates the table rather than adding to it, and "late and conditional"
  is asserted more than shown.
- **10.7 Predictions that would falsify the plan — 3.** Praiseworthy in intent, but half the "If it
  fails" cells are restatements ("The verifier's list of checks is incomplete", "Liveness-based
  saving is less economical than hand-written state") rather than an action, and the numbers being
  predicted are all from other articles with no figure repeated here.
- **10.8 Key points — 5.** A faithful and accurate compression of the article; each bullet
  corresponds to a section and none introduces a new claim.
- **10.9 Check your understanding — 4.** Questions 1, 2, 3 and 5 are answerable directly from the
  text; 4 needs a two-step inference; 6 is weaker, see below.

## Questions that the article did not let me answer

Strictly, no question was unanswerable, which is better than I expected of a summary chapter. Two
were answerable only by inference, and the editor should know which:

- **Question 4** ("what kind of error can it detect, and what kind can it not") is answerable only
  if the reader assembles the answer from "a second, independent implementation of the language's
  semantics" plus "needs no hand-written original" plus the closing "cannot reveal an error in the
  source's logic". The article never states positively *what* it detects — it only states what it
  does not. A single sentence naming backend lowering errors would make this direct.
- **Question 6** ("state what observation would refute it and what the plan says to do then") is
  only comfortably answerable for the rows whose "If it fails" cell names an action. For the
  verifier row and the `await` row, the cell describes a conclusion rather than a step, so "what
  the plan says to do then" has no content. The question also asks for one prediction without
  saying the rows differ in answerability, which makes it feel like a trap.
- Weaker still: **Question 2** asks to list "the steps … that exist only because the two sides
  exchange text", but step 3 (copying to the queue under a 16 KiB cap) is text-driven in origin and
  the article does not say whether it counts. I answered 1, 2 and 4 by following the article's own
  phrasing "Steps 1, 2 and 4", but a reader could defensibly include 3.

## One thing to add

A worked example of the failure in section 10.2. Show the first three functions of
`compiler/typed-world.js` and of `sdk/typed/rv32-slot.S` side by side, then show what happens —
concretely, with one call and its wrong callee — when one entry is inserted in the JavaScript file
only. The section argues this well, but one worked trace would convert the argument from
plausible to obvious, and it would also demonstrate the "arguments of the wrong meaning" point,
which is currently asserted in a single clause.

## One thing to cut

Step 11 ("Experiment: worlds in user mode under PMP") is the only roadmap row with no article
behind it in the "Article" column except Article 7, it is the only one marked high risk, it is
absent from the dependency graph, and it is never mentioned in the "Three features of the ordering"
paragraph or in the key points. In a chapter whose argument is that order follows evidence, an
unattached, unexplained, highest-risk row invites the reader to wonder what else is unargued. Cut it
from this table, or give it the two sentences that would place it.
