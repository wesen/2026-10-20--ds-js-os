# Feedback — Article 2, "Measuring Before Optimizing"

Read as a student with the article and `glossary.md` only. Files in this directory: `TASK.md`,
`article.md`, `glossary.md`, `diary-format.md`. The figure that section 2.4 refers to,
`_assets/handheld-compile-phases.png`, is not present here, so I could not check it.

## Passages I had to read twice

1. "Apply it to one key press in Editor, which is one turn of the application." — The article never
   argues that one key press is one turn. A turn is "the handling of one event by one world", so a
   key press could plausibly produce several turns (key driver, compositor, application), and I had
   to guess that only the application's own turn is meant.

2. "An earlier trace of a different application measured 35.6 ms from the moment the compositor
   received a key to the moment the application's handler was called, and that interval contains no
   application code." — "An earlier trace" points at nothing I can find; and I could not tell whether
   the 35.6 ms already contains the compositor's JSON decode and layout, or only the nucleus's
   dispatch. The whole 4.3 percent argument depends on which it is.

3. "The unmeasured drawing time can only add to the denominator, so 4.3 percent is an upper
   limit." — True, but it needs one step the text skips: adding to the denominator lowers *p*, and a
   lower *p* means a *lower* speedup bound, so "upper limit" holds of the share, not of the 1.045
   factor. I had to derive that myself before the sentence carried any weight.

4. "There the interval was 462 ms and the compositor's share 235 ms, made up of 84 ms of drawing,
   5 ms of status updates and 146 ms of handling other messages." — The article never says this
   second boot's interval has the same two endpoints as the 559 ms one, so I could not compare the
   two numbers directly. "Handling other messages" is also 62 percent of the compositor's share and is
   not opened up, which is exactly the number a reader would want next.

5. "Tokenize (the compiler's regular expression alone) | 8.0 ms" — I could not tell whether "the
   compiler's regular expression" is the tokenizer or one regex inside the tokenizer, and "alone"
   leaves unclear what was excluded.

6. "Both figures say that the compiler's own speed is limited by the interpreter running it, and that
   the cheapest improvement is not to run it at all when the source has not changed." — Two per-token
   costs do not show what limits speed. The sentence needs the step the text does not make: that the
   device/workstation ratio of 66 is roughly the same for every phase, which would point at the
   interpreter as the common factor.

7. "Instructions in a store immediately followed by a load of the same slot | 34.1%" — The denominator
   is unstated: 34.1 percent of instructions, of stores, or of store/load pairs? Two readings give
   very different pictures of how bad the temporaries are.

8. "The third row reflects a known hazard." — I had to count rows in the section 2.6 table to find out
   that this means "Repeated trials". Naming the row would be better than indexing it.

## Terms used before they were explained, or never explained

- **RV32** — used from the 2.1 table ("Link, assemble to RV32") onward; not defined in the article, and
  the glossary only mentions RISC-V under *PMP*. A reader never learns it is the 32-bit RISC-V
  instruction set.
- **Interpreter** — "limited by the interpreter running it", "Loading the compiler's own source into
  the interpreter". The glossary's *Engine* entry names QuickJS and WAMR but never uses the word
  "interpreter" or says that QuickJS is one.
- **Segment** — "the nucleus logged which world ran in every segment of it", "attributes segments to
  worlds during boot". A scheduling slice, never defined.
- **Attribution** — "One complete attribution does exist", "attributed 88 percent of all executed
  instructions". Never defined, though it is the article's central method.
- **Native path / WebAssembly path** — used as fixed labels in the 2.4 table and its share column;
  glossed only inside one table cell ("Native path: source text to RV32 code"), never defined as
  distinct terms, and the reader must infer that the WebAssembly path stops at a module.
- **Garbage collection** — appears only as a cost ("85.9 s", "dynamically typed, garbage-collected
  values"); no glossary entry.
- **Harness** — "The harness links the same QuickJS that the firmware uses" (Experiment 3). Never
  explained.
- **Token** — the glossary defines *Token* only as the handle of a split-phase operation [8]. Here it
  means a lexical token in source text ("Editor's source has 16,792 tokens"). Same word, opposite
  sense, no warning.
- **Clock rate / 360 MHz** — "at the device's 360 MHz clock". The frequency is introduced only in
  passing, with no statement of where it comes from.
- **"Nucleus accepts the application's first screen description"** — "accepts" never explained
  (validated? queued? copied?). It is one of the four endpoints in the 2.1 table.

## Claims I could not verify from the article itself

- "Tokenizing alone, scaled by the same factor of 66, costs about half a second per boot, or
  31 microseconds and 11,000 cycles per token." — The factor of 66 was measured for the *whole*
  WebAssembly path (1,988 ms vs 29.9 ms). Nothing in the article shows the tokenizer slows down on the
  device by the same factor, so the 31 µs is an assumption presented as a figure.
- "which at the device's 360 MHz clock is about 42,000 processor cycles" — Needs both the clock (no
  source given) and the assumption that the compiler enjoys the full clock rate; neither is argued.
- "A profile of the same compiler on a workstation attributed 88 percent of all executed
  instructions to one analysis" — No run, revision, program or table is given, unlike every other
  number in the section, which sits in a table. The reader can only take it on trust, yet section 2.8
  repeats it as a key point.
- "in the firmware that was profiled, the compositor had already been compiled to native code by CJI"
  — This is the pivot of the "not slow execution, but what the work is" argument, and there is no
  manifest excerpt or engine listing to check it against.
- "its output for Agenda is 30,840 bytes ... the same size that the project's diary records for the
  device's build" — The diary is not quoted and is not in this directory, so the equality cannot be
  checked; the reader is asked to accept that the script and the device agree.
- "produces a WebAssembly module of 88,255 bytes, the same size as the one built on the device" —
  Same problem. The article honestly adds that equal size is not proof of identical bytes, which also
  means the check cannot be verified in either direction from the text.
- "Editor's source has 16,792 tokens" and "175,860 bytes of RV32 for 36,917 bytes of function bodies"
  — No counting method stated (comments? strings? whitespace? what counts as a function body), so the
  per-token costs cannot be recomputed.
- "the time to first response fell from 2.04 s to 1.70 s ... about 340 ms in each case" — Three boots
  per configuration and no spread (min/max, median) is reported, so "about 340 ms" cannot be weighed
  against noise — the very standard section 2.6 sets. The two deltas are 340 ms and 340 ms, which is
  suspiciously tidy for three-run samples.
- "A compiler improvement could not have found those 340 ms." — Plausible from the boot profile, but
  no experiment varied compiler speed and re-measured first response.
- "The WebAssembly Editor needs 8.8 ms per turn, so moving from WebAssembly to native code saved about
  7 ms" — The 8.8 ms has no stated source: which application, build, engine, number of turns.
- "The same discipline applies to compile time. The phases of CJI compiling Agenda on the device, in
  one run of the original build that took 1,480 s in total (the run quoted in Article 1 took
  1,475 s)" — two totals are given with no explanation of the 5 s difference (different program?
  build? rerun?), and the phase rows add to 1,480.8 s, above the stated total.
- Figure `_assets/handheld-compile-phases.png` (section 2.4) — absent from this directory, so the bar
  chart's numbers cannot be compared with the table.

## Section scores

- **2.1 — 5.** The table names both ends of every interval and the "does not include" column removes
  exactly the ambiguity that the section is about.
- **2.2 — 3.** The arithmetic is complete and I could redo all of it, but the model silently equates
  one key press with one average turn and mixes a 33-turn average from native Editor with a single
  trace from a different application.
- **2.3 — 4.** The profile adds up (293 + 81 + 32 + 123 + 30 = 559) and the consequence is a real
  before/after, but "segment" and "attribution" are undefined and the second boot's endpoints are
  never stated to match the first's.
- **2.4 — 3.** The CJI table is clear; the typed-compiler table puts a 48.7 ms native path and a
  29.9 ms WebAssembly path in one grid under one "share of the native path" column, and the step to
  device numbers rests on an unargued factor of 66.
- **2.5 — 4.** Four experiments are each given a check and a caveat, which is exemplary; the cost is
  that the per-"store then load" percentage has no stated denominator.
- **2.6 — 4.** The table is the most useful page in the article: each missing measurement comes with
  a how-to. Indexing rows by number ("the third row") is fragile.
- **2.7 — 5.** Four outcomes, four investments, four article numbers; nothing to misread.
- **2.8 — 4.** Faithful to the body, but "58 percent frontend ... and 41 percent translation" sums to
  99 without a note that this is rounding.

## Questions that the article did not let me answer

None were unanswerable outright, but two were answerable only by accepting something the article does
not establish.

- **Question 6** cannot be answered from the text as a *measurement*: the 31 µs / 11,000 cycles figure
  exists only by scaling tokenize time by the factor 66, and the article never justifies reusing that
  factor. I could state the number and say what it measures, but not whether it is real.
- **Question 5**'s second half ("what that check does not establish") is only half-answered in
  section 2.5: the article says "This is a model, not an implementation; Article 5 states its
  assumptions", which defers the answer to another article. I inferred the rest.
- **Question 3** asks what Agenda was doing during the 559 ms. The article says the file was ready and
  Agenda needed 2 ms once it ran, so the answer "waiting for its turn" is inference from the segment
  log, not a statement; nothing records what runnable-but-not-running worlds were doing.

## One thing to add and one thing to cut

**Add:** one figure — a horizontal timeline of a single key press with the measured spans drawn
solid (compositor receive → handler call, 35.6 ms; handler, 1.6 ms) and the unmeasured spans drawn as
blanks (drawing, accept, LCD transfer). It would make the article's own thesis — "no interval ends at
the LCD" — visible at a glance, and show why the 4.3 percent is an upper limit, without which section
2.2's most important sentence has to be believed rather than seen.

**Cut:** the fine decomposition of the second boot in section 2.3 ("84 ms of drawing, 5 ms of status
updates and 146 ms of handling other messages"). It is the only place where an interval's endpoints
are left unstated, it changes no conclusion, and its largest term is left unexplained. Keep the 462 ms
versus 559 ms comparison and fold the compositor's 235 ms into a single clause.
