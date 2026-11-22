# Feedback on "2. Measuring Before Optimizing"

## Passages I had to read twice

- "An earlier trace of a different application measured 35.6 ms from the moment the compositor received a key to the moment the application's handler was called, and that interval contains no application code. Take these two numbers as a rough model of one key press: at least 35.6 ms before the application runs, 1.6 ms inside it, and an unmeasured time afterwards while the compositor draws."
  The 35.6 ms comes from a *different* application, yet it is then used as "before the application runs" for Editor, next to a 1.6 ms figure taken from Editor measuring a *different* interval (total CPU over a session divided by turns). Both ends are borrowed, so I could not tell why the resulting "at most 4.3 percent" is a bound rather than just a guess.

- "The device takes 1,988 ms for the WebAssembly path that takes 29.9 ms here, a factor of 66."
  I could not reconstruct 29.9 ms from the table above it. The rows are 2.4, 8.0, 20.5, 1.3 and 20.2 ms; 8.0 + 20.5 + 1.3 = 29.8, but 2.4 + 8.0 + 20.5 + 1.3 = 32.2. It is unclear whether "the WebAssembly path" includes evaluating the compiler's own source and the link step.

- "Scaled to the device, the tokenizer alone costs about half a second per boot, and the source has 16,792 tokens, so each token costs about 118 microseconds."
  These two halves do not agree. Half a second over 16,792 tokens is about 31 microseconds per token, not 118. 118 microseconds is 1,988 ms / 16,792, i.e. the whole compile per token. I first assumed I had misread the factor.

- "Within the same table the phrase 'Share of the RV32 path' heads three rows whose neighbours are marked '—'."
  I had to work backwards to guess that the RV32 path total is about 50 ms (since 8.0 ms is 16 percent of it), because no row states the total.

- "It was the largest consumer of time anyway."
  Grammatically this hangs off the previous sentence about native compilation, and I read it first as "the native compiler was the largest consumer" before realising the subject is the compositor.

## Terms used before they were explained, or never explained

- **CJI** — used as a name throughout (2.3, 2.4, 2.8) and never expanded or defined in this article.
- **nucleus** — central to the definition of every interval, only deferred to Article 1.
- **compositor** — likewise deferred to Article 1, yet sections 2.2, 2.3 and 2.7 depend on it.
- **worlds / turns / engines** — explicitly deferred to Article 1 in the second paragraph.
- **RV32** — used from 2.4 onwards; the article never says this means 32-bit RISC-V.
- **QuickJS** — named in the 2.4 table heading and Experiment 3; never described beyond "the interpreter running it".
- **WebAssembly reactor** — "reactor" appears in one table row and is never explained.
- **numeric range analysis** — attributed 88 percent of instructions, deferred to Article 3.
- **specialization** — listed as a frontend phase without explanation.
- **hash** — in the last CJI phase row ("Link, assemble to RV32, hash"); what is hashed and why is never said.
- **binary screen protocol** — offered as the first investment in 2.7 with no explanation of what it is.
- **store immediately followed by a load of the same slot** — a row in the Experiment 1 table; the phenomenon is counted but never named as store-to-load forwarding or explained.
- **"Compiled module returned"** — in the 2.1 table; what a compiled module is here (WebAssembly module? RV32 image?) is not stated.
- **processor cycles** — "roughly 42,000 processor cycles" without ever stating the device clock rate, so I cannot check it.

## Claims I could not verify from the article itself

- "at most 1.6 / (35.6 + 1.6) = 4.3 percent of the path" — the arithmetic is right (4.30 percent), but the "at most" needs the unmeasured drawing time to be excluded, and the numerator and denominator come from different applications and different firmware. The claim that this is an upper bound is not derived in the text.
- "The WebAssembly Editor needs 8.8 ms per turn, so moving from WebAssembly to native code saved about 7 ms of a path that is longer than 37 ms." The subtraction (8.8 − 1.6 = 7.2) checks out, but "longer than 37 ms" is the sum of two borrowed numbers, and no measurement of the path exists.
- "which removed about 340 ms from boot" — no before/after table, no run count, no range. The 340 ms cannot be checked against the 559 ms profile or against the 293 ms compositor share.
- "A second trace split the compositor's share further: of 235 ms, 84 ms was drawing and 146 ms was handling other messages." 84 + 146 = 230, leaving 5 ms unaccounted. Also, the 235 ms does not match the 293 ms compositor row in the same section (different boot or different trace is not stated).
- "a factor of 66" for the device against the workstation — I can check 1,988 / 29.9 ≈ 66 only if I accept 29.9 ms, which the table does not produce.
- "each token costs about 118 microseconds, or roughly 42,000 processor cycles" — neither the 118 µs nor the cycle count can be reproduced from the numbers given (see the half-a-second conflict above, and the missing clock rate).
- "The count is exact; the result for Agenda (30,840 bytes) equals the size recorded in the project's own diary." The 30,840 bytes and 7,710 instructions imply 4.0 bytes per instruction, while the Editor column implies a different ratio; the diary itself is not quoted, so the cross-check is asserted, not shown.
- "RV32 bytes per byte of WebAssembly function body 4.76 / 5.68 / 5.42" — the WebAssembly function-body byte counts are never given, so the ratios cannot be checked. Also, since the Editor module is later said to be 88,255 bytes, 4.76 × body bytes must be 175,860 bytes of RV32, which is much larger than the 88,255 module; the meanings of "module" and "function body" need stating.
- "it matches the real output for all 161 functions, which validates the walk" — the matching is asserted, with no statement of what was compared (total count per function? per opcode?) or where the check can be re-read.
- "identical in size to the one built on the device" (88,255 bytes) — no independent confirmation in the text.
- "CJI spends 99.9 percent of its time in its frontend" — 1,479.1 s of a total that must be 1,480.8 s; the "about 0.5 s" and "about 1.2 s" rows are rounded, so the percentage cannot be reproduced exactly, though it is close enough to accept.

## Section scores

- **2.1 Every timing has two ends — 5.** The table names both events and the exclusions for each interval, and the "no interval ends at the LCD" sentence is the clear point of the section.
- **2.2 Amdahl's law, with denominators — 3.** The formula and the 1.11 example are clean, but the key-press model mixes two measurements from different applications and then calls the result a bound, which I had to reconstruct rather than read.
- **2.3 A worked profile: one boot — 2.** The table sums to exactly 559 ms, which is excellent, but the second trace does not add up (230 of 235 ms), that trace's 235 ms contradicts the 293 ms row, and the 340 ms saving is asserted without a comparison.
- **2.4 A compile profile for each compiler — 2.** The idea is good and the CJI side is convincing, but the typed-compiler table has no stated total, its shares cannot be reconciled with the "29.9 ms" and "118 microseconds" figures, and two rows have no share at all.
- **2.5 Four experiments run for this issue — 3.** Each experiment is stated with a revision and a location, which I could not check, but Experiment 1's table has columns whose denominators are never printed and the validation of Experiment 2 is asserted in one clause.
- **2.6 What is still unmeasured — 5.** The most useful section in the article: every missing measurement comes with why it matters and a concrete method, and the two citations are tied to a rule rather than dropped in.
- **2.7 What each outcome would imply — 4.** The conditional table is a nice device and each row points at an article, but "binary screen protocol" and "typed compositor" are named as investments without explanation, and "boot compile dominates perceived startup" does not obviously fit the 2.1 reminder that compilation happens before the first response.
- **2.8 Key points — 5.** Five bullets that match the body, and the second one is the claim the rest of the issue turns on.
- **2.9 Check your understanding — 4.** All six questions are answerable from the text, but question 1 depends on the reader noticing that the quoted report's own start event is never named.

## Questions that the article did not let me answer

- **Question 1 could only be answered partially.** The report quoted ("Agenda responds 1.8 seconds after power-on") does not say which of the four intervals it uses, and there is no "power-on to first response" row in the 2.1 table. I had to assume it is the "first response after boot" interval. The section would be airtight if the table had a row starting at power-on.
- **Question 5 was answerable but thin.** The article says the walk "matches the real output for all 161 functions" without saying what is compared, so I could state the check but not judge its strength.
- The other four questions were fully answerable from the text.

## One thing to add and one thing to cut

- **Add:** a short "arithmetic of this article" box (or explicit totals in each table) giving the device clock rate, the RV32-path total, the WebAssembly-path total, and the token count arithmetic, so that every percentage in 2.4 and every ratio in 2.5 can be recomputed by the reader. Right now a reader who checks the numbers stops trusting the section, which is fatal in an article whose whole subject is checking numbers.
- **Cut:** the second compositor trace in 2.3 ("of 235 ms, 84 ms was drawing and 146 ms was handling other messages"). It does not sum, it does not match the 293 ms row above it, and the only load it carries — that drawing is not the compositor's main cost — is already made by the 293 ms row and by the sentence about decoding JSON into garbage-collected values.
