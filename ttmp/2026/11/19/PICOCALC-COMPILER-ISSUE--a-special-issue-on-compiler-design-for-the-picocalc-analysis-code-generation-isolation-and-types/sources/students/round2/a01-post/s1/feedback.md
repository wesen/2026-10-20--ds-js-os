# Reader feedback on Article 1

Read as a student: `article.md` start to finish, with `glossary.md` consulted whenever a bolded
term or a piece of jargon appeared.

## Passages I had to read twice

- "The first four rows are budgets that later articles spend: Article 5 is about the size of
  compiled code in PSRAM, Article 6 about what is kept in flash, and Article 8 about living
  without internal RAM to spare."
  I read "budgets that later articles spend" three times before I decided it was a metaphor for
  "consume". A plainer word ("use up", "draw on") would not have stopped me. It also is not
  obvious why row 3 (PSRAM) maps to Article 5 and row 5 (protection) maps to Article 7, so the
  mapping felt arbitrary rather than derived.

- "Whether a piece of code may be run as machine code is therefore a question about where that
  code came from and who checked it."
  "Who checked it" introduces a checker that the reader has not met; the glossary's *Verifier*
  entry says [7], i.e. six sections later. At this point I could not tell whether this was a
  social process (a user approving a program) or a technical one (a program checking emitted
  code).

- "Editor's budget on the device is 200 ms. … A handler that cannot finish in one budget must
  save its progress, ask for a timer, and continue when the timer event arrives."
  I could follow the rule but not the mechanics: what "save its progress" means for a plain
  JavaScript world versus a typed program is only answered much later (Article 8, "state
  machine", "stack ripping"). As written in Article 1 the instruction is a slogan.

- "`text.length` is a load of the 32-bit count stored at the start of the string."
  This sentence is doing hidden work. Section 1.3 says the typed language has "no objects",
  yet here a property is read off a value, and "counted sequence" was never unpacked into
  "count first, then the code units". I had to guess the layout.

- "QuickJS … compiles the 16,326-byte Agenda source to bytecode in 37 ms on the same device.
  That figure is compile time only … It shows that compiling for an interpreter was never
  slow."
  I read this twice because 37 ms is *faster* than the typed compiler's 0.52 s for Agenda, so
  the sentence seemed to contradict the table above it. It only works if you notice that the
  comparison is QuickJS against itself, and that the two compilers are not being compared at
  all in that paragraph.

- "The measured compile times on the handheld differ by a factor of more than a hundred for a
  whole application, and by about a thousand where only part of an application is typed."
  I had to do the divisions to see which pairs were meant: 425 / 3.14 ≈ 135 (fine), but
  1475 / 0.72 ≈ 2049, 206 / 0.25 ≈ 824 and 523 / 0.72 ≈ 726. "About a thousand" fits three of
  those numbers only loosely, and the text never says which ratio it is quoting.

- "It may also do anything the firmware may do."
  Two sentences earlier the subject was the native version, and two paragraphs earlier "it"
  was the memory limit. The sentence is about privilege, not size, and one re-read was needed
  to be sure.

## Terms used before they were explained, or never explained

- **firmware** — used in section 1.1 ("the firmware's tasks", "the firmware image") and
  throughout, but defined nowhere in the article and absent from the glossary.
- **code unit** / **UTF-16 code units** — used in the type list (`string`) and in the running
  example ("counts how many times a given code unit occurs"). Neither the article nor the
  glossary says what a code unit is, nor why a string of code units is not a sequence of
  characters.
- **counted sequence** — the phrase defining `string` never says "counted" means "length stored
  first", which is exactly what section 1.4 later assumes.
- **JSON** — "a description of its screen as a JSON document" (section 1.2 and the diagram);
  never explained and not in the glossary.
- **bounds check** — section 1.4: "`text.charCodeAt(at)` is a bounds check followed by a load";
  the term is used as if known, and neither source defines it.
- **RISC-V** — section 1.1 says "Two RISC-V cores of the 32-bit kind called RV32", which never
  states that RISC-V is an instruction set architecture; the glossary has no entry for it
  either.
- **receipts** — section 1.6: "the diaries, receipts and scripts kept in the repository".
  Project jargon, unexplained.
- **Espressif ESP32-P4** — named as if known what Espressif is (a company) and what an ESP32-P4
  is (a chip family), which the rest of the section then treats as given.
- **companion report** — "*Two Compilers on the PicoCalc*" is cited as the place where all
  conditions of measurement live. Not an error, but for a reader who only has this issue it is
  a missing document, and no section number or link is given.

## Claims I could not verify from the article itself

- "Between 58 and 169 times slower than a laptop core, measured by running the same compiler on
  the same inputs on both."
  No laptop model, no clock speed, no list of the compiler runs, and no indication why the range
  is three times wide. The spread itself is the interesting part and is left unexplained.

- "**CJI** … can compile itself, and the self-compiled CJI runs on the handheld; the companion
  report describes how its output on the device was checked, byte for byte, against the
  workstation's."
  The one strong correctness claim in the section is handed off to a document not present here.
  I have no way to see the check.

- "Two compilers now exist in the repository, built in the same week."
  No dates, no commits. It matters, because the point of the sentence is that the two designs
  are contemporaries rather than a rewrite.

- "The system's **manifest** … lists 22 worlds."
  No excerpt of the manifest, no list. A count of 22 is the kind of thing a reader wants to see
  enumerated once, especially since memory limits and turn budgets are quoted per world later.

- "One recording shows 363,727 bytes free early in boot and 35,831 bytes free once all programs
  were running."
  "One recording" is the whole provenance. Which build, which programs, and whether those
  programs were the same as the Editor measurements are all missing — and the two numbers
  differ by a factor of ten, so the conditions matter.

- "262 s originally; 206 s after the optimizations described in Article 3" (Files) and
  "1,475 s originally; 523 s after the same optimizations" (Agenda).
  The claimed cause of a 2.8× improvement in one row and a 1.3× improvement in the other is in
  Article 3, which is not part of this text. Nothing here shows the optimizations alone did it.

- "It shows that compiling for an interpreter was never slow. What is expensive is producing
  *machine code from untyped source*."
  This is the article's central causal claim, and the numbers given do not isolate it. 37 ms is
  QuickJS compiling bytecode for the *original JavaScript* Agenda; 523 s is CJI producing native
  code for the *same* original source, so that pair supports the claim. But the typed compiler
  produces machine code from typed source in 0.72 s, which is far from slow, so "machine code"
  alone cannot be the expensive part — "untyped" must be. The article states this but does not
  show it; only Article 3's experiments, which are missing here, could.

- "WAMR … 2–6 times slower than native in the measurements here."
  "The measurements here" points at section 1.5, which reports a single 33-turn session
  (290.6 ms vs 52.9 ms, i.e. 5.5×). Where the 2× end of the range comes from is not stated.

- "Every figure in this article is taken from the project's own measurement records."
  A blanket provenance claim I cannot test; no record is quoted except the two free-memory
  bytes counts.

- Implicit, but load-bearing: the article never says what happens to the rest of the system when
  a *native* world faults. The rule "a world that overruns its budget, or exceeds its memory
  limit, is stopped and reported; the other worlds continue" is stated for budgets and memory,
  not for a wild write. For a device whose whole safety argument rests on the absence of an MMU,
  that is the missing experiment.

## Section scores

1. **1.1 The machine — 5.** The table of five resources with a "consequence" column is the
   clearest page in the article; I could recite the numbers after one pass. Only the 58–169×
   range is soft.
2. **1.2 The operating system in eight terms — 3.** Every term is defined, but all eight arrive
   in three pages, several with two or three sub-terms each (engine → bytecode → interpreter →
   linear memory → ELF), and the compositor paragraph adds a fourth new idea (JSON screen
   descriptions) inside the definition of the third.
3. **1.3 The mission and the two compilers — 4.** The framing question ("how much must the
   compiler understand before it emits the first instruction?") is excellent and the two
   pipeline diagrams are the part of the article I went back to most usefully. The two cautions
   about the table are honest, but they also leave the table doing very little work.
4. **1.4 One function through both pipelines — 3.** The CJI half is the best explanation of
   whole-program inference I have read. The typed half skips the step the reader needs: how
   `.length` is reached in a language with no objects, and what `charCodeAt` is as a primitive.
5. **1.5 Where the code runs, and what that costs — 4.** Good table, and the numbers agree with
   each other (290.6 / 52.9 = 5.5×, 240,452 / 88,255 = 2.7×, 768 − 710 = 58 KiB), which built my
   trust. The "not all of the 182 KiB difference is code" caveat is honest but arrives without
   any way to attribute the rest.
6. **1.6 Where the numbers come from — 3.** Right thing to include, but as written it is a
   promise rather than a method: the records are elsewhere and no measurement conditions are
   reproduced here beyond naming the companion report.
7. **1.7 Key points — 5.** Exactly the five things I would have underlined, and they match the
   sections.
8. **1.8 Check your understanding — 4.** All six are answerable from the text, but two of them
   (Q2's native case, Q4's "one reason") depend on the reader making an inference the prose does
   not quite state — see below.

## Questions that the article did not let me answer

All six quiz questions were answerable, but two only by inference:

- **Q2, the native case.** The article says native code "runs with firmware privileges" and "can
  read and write the whole address space unless the software prevents it", and separately says
  that a world stopped for budget or memory reasons leaves the other worlds running. It never
  states the outcome of a native fault (does the nucleus catch it? does the device reboot?). I
  answered "yes, it can damage other worlds" from the privilege statement, not from a described
  consequence.
- **Q4.** "Give one reason from this article why the native version is larger" is answerable
  (RV32 instruction size, 77 bytes vs 412 bytes). What I could not do is check the *magnitude* of
  the 182 KiB difference, because the article only says some of it is not code.

Q3 was answerable but only because the article lists the needed facts explicitly in section 1.4;
a reader who skipped that paragraph would not find them elsewhere.

## One thing to add and one thing to cut

**Add:** a short paragraph in section 1.4 on the representation of `string` — that the count is
the first 32-bit word, that a code unit is one 16-bit UTF-16 unit, and how `text.length` and
`text.charCodeAt(at)` are expressed in a language that has no objects, together with the exact
rule for when the bounds check traps. This is the single place where a reader with no prior
knowledge of the typed language has to stop and reconstruct the compiler's assumptions, and it
is also what makes the 77-byte / 412-byte comparison meaningful.

**Cut:** the last two sentences of the QuickJS paragraph in section 1.3 ("It shows that compiling
for an interpreter was never slow. What is expensive is producing *machine code from untyped
source*."). The data given does not carry the first sentence, the second one pre-empts Article
3's controlled experiments, and both invite the false reading that the typed compiler's 0.52 s is
"slow" when it is the QuickJS figure of 37 ms that is faster.
