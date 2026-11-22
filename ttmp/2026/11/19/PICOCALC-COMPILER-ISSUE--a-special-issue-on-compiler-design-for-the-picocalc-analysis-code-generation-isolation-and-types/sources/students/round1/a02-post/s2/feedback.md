# Reader feedback: "2. Measuring Before Optimizing"

Read as a student reader with no access to Articles 1, 3, 5, 6, 10, and no access to the repository.

## Passages I had to read twice

> "An earlier trace of a different application measured 35.6 ms from the moment the compositor received a key to the moment the application's handler was called, and that interval contains no application code."

I read twice because the sentence is doing two jobs and does not say which is meant: is 35.6 ms the time the *compositor* spent, or the whole wait from key arrival to the application's turn (which the boot profile elsewhere attributes mostly to queueing)? And "a different application" plus "an earlier trace" means the number does not belong to the Editor whose 1.6 ms sits next to it.

> "Take these two numbers as a rough model of one key press: at least 35.6 ms before the application runs, 1.6 ms inside it, and an unmeasured time afterwards while the compositor draws."

Unclear because the pieces come from two different applications, two different firmware builds, and one of them is a lower bound. I had to work out for myself that the headline "4.3 percent" is therefore an upper bound, not a measurement, and that adding a bound to a measurement is not normally something a reader is warned about until two sentences later.

> "The device takes 1,988 ms for the WebAssembly path that takes 29.9 ms here, a factor of 66."

Unclear because I could not find 29.9 ms in the table above it. The three phases that carry shares (8.0 + 20.5 + 20.2) sum to 48.7 ms, and evaluate + tokenize + frontend sum to 30.9 ms; neither is 29.9 ms. I had to guess which rows make up "the WebAssembly path" before I could check the factor of 66 (1,988 / 29.9 = 66.5, so the factor is right for a number I cannot derive).

> "Scaled to the device, the tokenizer alone costs about half a second per boot, and the source has 16,792 tokens, so each token costs about 118 microseconds."

I read twice because the arithmetic does not run in the direction stated: half a second divided by 16,792 tokens is about 31 microseconds, not 118. Either the half-second is wrong, or the per-token figure comes from a different stage, and the reader is left to decide which.

> "A second trace split the compositor's share further: of 235 ms, 84 ms was drawing and 146 ms was handling other messages."

Unclear on two counts: 84 + 146 = 230, leaving 5 ms unaccounted for, and the boot table above gives the compositor 293 ms, not 235 ms. The sentence says "a second trace" but does not say why a second trace was needed or which of the two compositor numbers the lesson in 2.3 rests on.

> "The count is exact; the result for Agenda (30,840 bytes) equals the size recorded in the project's own diary."

I read twice because the claim being validated is an *instruction count* (7,710) and the evidence offered is a *byte size*. Matching a byte total says the output is the same object; it does not say the decoder counted 7,710 instructions correctly.

## Terms used before they were explained, or never explained

- **world** — used in the first table ("Nucleus calls a world's handler") with no definition; the article says Article 1 defined it, but a standalone reader cannot tell whether a world is a process, a module or a task.
- **turn** — used from 2.2 onward ("33-turn session", "per turn", "first turn") as a unit with no definition.
- **nucleus** — used in 2.1 and throughout; never explained (kernel? message loop? scheduler?).
- **compositor** — used in the first table; its job only becomes partly clear in 2.3.
- **engine** — used once, in 2.6 ("measure different things in different engines"), and never introduced.
- **CJI** — appears in 2.3 and 2.4 as a name with no statement of what it stands for or how it relates to "the typed compiler".
- **the typed compiler** — named in 2.4 as the second of "the two compilers", but the article never says how the two are related (same source language? same input? is one written in the other?).
- **compiled to native code by CJI** — the idea that CJI compiles itself is implied in one clause and never explained.
- **WebAssembly reactor** — "Link into the WebAssembly reactor" is never explained; I inferred "reactor" means a module with no main function.
- **lowering** — "Lower WebAssembly to RV32" / "RV32 lowering" is never defined as a term.
- **numeric range analysis** — named in 2.4 and deferred to Article 3, so the 88 percent claim cannot be evaluated from here.
- **segment** — "the nucleus logged which world ran in every segment of it" and "attributes segments to worlds"; what a segment is never said.
- **startup work** — "the application's first turn now runs ahead of other startup work" leaves open what else is in the boot phase.
- **Agenda**, **Files**, **Editor** — three applications appear, but none is described (size, language, what it does), so I cannot judge whether the profiles are representative.
- **`countUnit`** — the "running example" of Experiment 4 is never shown; the reader is told 103 versus 13 instructions with no way to see either.
- **repository revision `60a38f0`**, **`scripts/`**, **`various/`** — referred to as the place where results live; a reader without the repo cannot check anything.
- **control run interleaved with it** (2.6) — the practice is named, not described; I could not tell what a control run is or how interleaving is done.
- **link order**, **environment size** (2.6), from the Mytkowicz reference — never explained as sources of bias.
- **processor cycles** (2.4) — used for a per-token cost without ever stating the processor clock, so cycles cannot be converted to time.
- **spare pin**, **logic analyzer**, **high-speed camera** — fine, but the suggested measurement is given in one sentence with no note on what resolution is needed to see ~37 ms.

## Claims I could not verify from the article itself

> "The device takes 1,988 ms for the WebAssembly path that takes 29.9 ms here, a factor of 66."

Missing: the arithmetic that turns the phase table into 29.9 ms. The shares (16/42/41) imply a denominator of about 48.7 ms, not 29.9 ms, and no row or sum in the table equals 29.9 ms. Without that number I cannot tell which phases are on the device path and which are not.

> "the source has 16,792 tokens, so each token costs about 118 microseconds, or roughly 42,000 processor cycles"

Missing: both the division and the clock. Half a second over 16,792 tokens is about 31 µs, and 42,000 cycles in 118 µs implies a 356 MHz clock, which is far above any clock rate the article mentions. If the number is right, either the tokenizer's device cost is nearer 2 s or the clock is far lower, and the article should say which.

> "of 235 ms, 84 ms was drawing and 146 ms was handling other messages"

Missing: the 5 ms remainder, and an explanation of why this trace gives the compositor 235 ms where the main table gives 293 ms. The difference is larger than several of the effects the article goes on to discuss.

> "this profile is the reason the project changed the scheduler ..., which removed about 340 ms from boot"

Missing: before/after numbers, how many runs, and whether the change was measured in the same way. It is the single largest verified-sounding number in the section and it has no table behind it.

> "A script walks the same WebAssembly and counts the instructions ... it matches the real output for all 161 functions, which validates the walk."

Missing: where the 161 comes from (all functions in the Editor module?), and what "matches" means — exact per-function equality, or aggregate. The strength of "validates" depends entirely on that.

> "The harness links the same QuickJS that the firmware uses and produces a WebAssembly module of 88,255 bytes, identical in size to the one built on the device."

Missing: identical in size is offered as evidence of identical output; hash equality is what would establish it ("Link, assemble to RV32, hash" suggests a hash is available). Also no device-side timing is given for this build, so the factor of 66 rests on a single device figure.

> "RV32 bytes per byte of WebAssembly function body | 4.76 | 5.68 | 5.42"

Missing: the WebAssembly body byte counts, so the three ratios cannot be recomputed; and the ratios are not summarised in any sentence, so I do not know what conclusion to draw from them.

> "More than half of the emitted instructions move temporary values to and from memory."

Missing: this is not true of the number printed for Files (50.0 percent, exactly half). If the claim is about the three programmes together, the aggregate is not given.

> "A profile of the same compiler on a workstation attributed 88 percent of all executed instructions to one analysis"

Missing: no table, no phase, no instruction total, no statement of how instructions were attributed to analyses. This is the strongest claim in 2.4 and it is stated in one clause.

> "CJI spends 99.9 percent of its time in its frontend and 88 percent of its instructions in one analysis."

Missing: these are two different machines (device time, workstation instructions) merged into one key point without saying so.

## Section scores

| Section | Score | Reason |
| --- | ---: | --- |
| 2.1 Every timing has two ends | 5 | The table of intervals with starts, ends and exclusions is the clearest thing in the article, and the point that no interval reaches the LCD is stated without hedging. |
| 2.2 Amdahl's law, with denominators | 3 | The formula and the 1.11 example are clear, but the worked application mixes two applications and two builds, the denominator of the "4.3 percent" is admittedly unmeasured, and the reader has to reconstruct which is a bound and which is a measurement. |
| 2.3 A worked profile: one boot | 3 | The 559 ms table adds up and teaches the right lesson, but "Segments" is never used, the second trace disagrees with the first (235 versus 293 ms, 84 + 146 = 230), and no number is given for the 340 ms scheduler fix. |
| 2.4 A compile profile for each compiler | 2 | The CJI half is consistent and instructive; the typed-compiler half has an unexplained 29.9 ms denominator, shares that imply a different denominator, and a per-token cost that does not follow from the half-second figure. I lost confidence here and stopped trusting the arithmetic. |
| 2.5 Four experiments run for this issue | 3 | Experiments 1 and 2 are well reported and the self-check on the counting model is the best methodological touch in the article; but the byte-size-versus-instruction-count validation, "more than half" versus 50.0 percent for Files, and the invisible `countUnit` keep it from being checkable. |
| 2.6 What is still unmeasured | 5 | The missing-measurement table is excellent: each row says what is missing, why it matters and how to get it, and the two references are attached to the right hazard. |
| 2.7 What each outcome would imply | 4 | A clear decision table that makes the measurement programme consequential; only the "Display transfer dominates" row is empty, which is honest but leaves the table looking unfinished. |
| 2.8 Key points | 2 | Concise, but it firms up what the body hedges: "application code is under 5 percent of a key press" was a hypothesis built from two incomparable numbers, and one bullet silently combines device time with workstation instruction shares. |

## Questions that the article did not let me answer

- **Question 1 ("Agenda responds 1.8 seconds after power-on").** 1.8 seconds appears nowhere in the article, and the word "responds" is never defined for a third-party report. I could answer only by assuming the report uses the article's own "first response after boot" definition and that "responds" means the nucleus accepted the screen description. The article should either put such a number in section 2.1 or tell the reader to check the end event before believing any such report.
- **Question 5 (Experiment 2's check).** Answerable in outline, but not properly: the article never says what the 161 functions are or what "matches" compares, so "validates the walk" cannot be weighed. Asked to state what the check does *not* establish, I had to supply register pressure and calling conventions myself; the article defers those to Article 5 rather than listing them.
- **Question 6 (ten runs in alternating order).** Answerable, but only because the two references are named. The article never explains what bias "link order" or "environment size" cause, so the *why* rests on trusting citations rather than on the text.
- **Question 4** was answerable (5.8 percent and the 1.2 percent heap saving), but the "two numbers" are slightly ambiguous: the 88 percent instruction share would serve equally well as one of them.
- **Questions 2 and 3** were fully answerable from the text.

## One thing to add and one thing to cut

**Add:** a short "terms borrowed from Article 1" block — six one-line definitions (world, turn, nucleus, compositor, CJI, typed compiler) — either before section 2.1 or as a boxed note. Right now a reader who meets this article first cannot tell whether a world is a process or a thread, and the article's central claim ("the nucleus accepts a screen description", "which world ran in every segment") depends on those words. This is the cheapest possible fix for the largest number of paragraphs I had to re-read.

**Cut:** the "Segments" column of the boot table in section 2.3. No sentence in the article uses those counts (30, 44, 46), they look like an independent measurement that ought to be discussed, and they invite the question of why two drivers with 44 and 46 segments take 81 ms and 32 ms. Removing the column would let the section spend its space on the two real problems instead: the unreconciled second trace (235 versus 293 ms) and the unmeasured 340 ms scheduler win.
