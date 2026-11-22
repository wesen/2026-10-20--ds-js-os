# Feedback on `article.md` (Article 2, "Measuring Before Optimizing")

## Passages I had to read twice

1. "The device takes 1,988 ms for the WebAssembly path that takes 29.9 ms here, a factor of 66."
   *Unclear:* 29.9 ms is not the sum of any obvious rows. Tokenize + rest of frontend + link is
   8.0 + 20.5 + 1.3 = 29.8 ms, and adding "evaluate the compiler's own source" gives 32.2 ms, while
   the RV32 path is 2.4 + 8.0 + 20.5 + 20.2 = 51.1 ms. I had to guess that 29.9 excludes the 2.4 ms
   self-evaluation (and rounding accounts for the 0.1 ms). The ratio itself checks out
   (1,988 / 29.9 = 66.5), but which rows are in the numerator is never stated.

2. "Scaled to the device, the tokenizer alone costs about half a second per boot, and the source has
   16,792 tokens, so each token costs about 118 microseconds, or roughly 42,000 processor cycles."
   *Unclear / wrong:* half a second over 16,792 tokens is about 31 µs, not 118 µs. The 118 µs figure
   follows from the *whole* device compile: 1,988 ms / 16,792 ≈ 118.4 µs. So either the sentence
   mixes the tokenizer with the whole compile, or "half a second" is not 528 ms. I could not tell
   which. The cycle figure also implies a ~356 MHz clock that the article never gives.

3. "A second trace split the compositor's share further: of 235 ms, 84 ms was drawing and 146 ms was
   handling other messages."
   *Unclear:* 84 + 146 = 230, so 5 ms is missing. Is the remainder unattributed, or is 235 the wrong
   total? Reading it as "of 230 ms" makes the two parts add up but leaves the relation to the 293 ms
   in the previous table unexplained (a different trace, so possibly fine, but the article does not
   say how the two traces relate).

4. "Take these two numbers as a rough model of one key press: at least 35.6 ms before the application
   runs, 1.6 ms inside it, and an unmeasured time afterwards while the compositor draws."
   *Unclear:* the 1.6 ms is "52.9 ms of CPU over a 33-turn session", i.e. per *turn*, and the jump
   from turn to key press is not argued — one key press could produce several turns. The step also
   silently borrows 35.6 ms from "a different application", which the article admits later but not
   where the number is used.

5. "Framebuffer capture | … | Does not include: Anything about time; it is a correctness check."
   *Unclear:* this is a row in a table of intervals, but it is explicitly not a timing, and its
   "starts at / ends at" columns describe a test-script action. It reads as a category error and I
   initially tried to use it as a latency.

6. "Share of the RV32 path" column in section 2.4 (16%, 42%, 41%).
   *Unclear:* the shares sum to 99% and only match the table if the denominator is the RV32 path
   *minus* the 2.4 ms self-evaluation (about 48.7 ms): 8.0/48.7 = 16.4%, 20.5/48.7 = 42.1%,
   20.2/48.7 = 41.5%. Using the visible RV32-path total of 51.1 ms gives 16%, 40%, 40%. I re-derived
   this three times to be sure, which is exactly the work a reader should not have to do.

7. "The model then predicts 16,544 instructions for Editor if temporaries stay in registers (2.66
   times fewer)."
   *Unclear:* "times fewer" is ambiguous between 2.66× less and (1 − 1/2.66). The arithmetic
   supports the former (43,965 / 16,544 = 2.66), but mixing a *real* count (43,965) with a *modelled*
   count (16,544) in one ratio is what the passage goes on to warn against.

## Terms used before they were explained, or never explained

- **nucleus** — used in the 2.1 table and in 2.6 without definition (presumably Article 1).
- **world, turn, engine, compositor** — announced as Article 1 terms, never summarised here; "world"
  and "turn" carry a lot of weight in 2.2, 2.3 and 2.6.
- **CJI** — used ten times, never expanded; I still do not know what the letters stand for.
- **RV32** — the target instruction set; never said to be RISC-V, or 32-bit.
- **WebAssembly reactor** — "Link into the WebAssembly reactor" appears in the profile table as if
  self-explanatory; "reactor" is unexplained.
- **QuickJS** — "QuickJS on a workstation" and "the same QuickJS that the firmware uses"; what it is
  (an embeddable JavaScript interpreter) is never stated, though 2.4's conclusion depends on it.
- **numeric range analysis** — named in 2.4 as 88% of executed instructions but only explained in
  Article 3.
- **binary screen protocol** — recommended in 2.7, never defined.
- **screen description** — used in 2.1 and 2.3 ("decode a JSON screen description"); the format is
  implied but never described.
- **world counters** — in 2.6 ("World counters measure different things in different engines");
  neither the counters nor the engines' differences are explained.
- **allocator's free and largest-block figures** — the measurement in 2.6's last row; fragmentation
  is never named.
- **temporary values vs local variables** — the distinction carries the whole of Experiment 1 and 2
  (55.3% vs 70.2%) but is never defined; I inferred it from context.
- **"link order or environment size"** (2.6) — the Mytkowicz example is cited but not described, so
  the reader must take the specific mechanism on trust.

## Claims I could not verify from the article itself

1. "each token costs about 118 microseconds, or roughly 42,000 processor cycles" — the numerator and
   the clock rate are both missing, and half a second per 16,792 tokens gives 31 µs. Evidence needed:
   the exact tokenizer time on the device and the CPU clock frequency.
2. "in the firmware that was profiled, the compositor had already been compiled to native code by
   CJI" — no trace, no build identifier, no counter-example. Evidence needed: which firmware build
   was profiled and how its provenance was determined.
3. "which removed about 340 ms from boot" — no before/after numbers, no repetition. 559 − 340 = 219 ms
   is the implied after-figure, but it is never stated, and one run cannot support 340.
4. "the result for Agenda (30,840 bytes) equals the size recorded in the project's own diary" — the
   diary is not cited by name, date or path, so the cross-check cannot be reproduced.
5. "it matches the real output for all 161 functions" — "matches" is not defined: equal instruction
   count, or identical instruction sequence? No per-function table or script output is quoted.
6. "produces a WebAssembly module of 88,255 bytes, identical in size to the one built on the device"
   — equal size is not equal content; the profile lists a hash phase, so a hash comparison was
   available and is not reported.
7. "The device takes 1,988 ms …" and, more generally, every device figure in 2.3–2.5 — the article
   itself says in 2.6 that "Most device figures are one run, or three", so none of the headline
   numbers can be separated from noise by anything in the text.
8. "A profile of the same compiler on a workstation attributed 88 percent of all executed
   instructions to one analysis" — no profiler named, no sampling method, no total instruction count.
9. "at least 35.6 ms before the application runs" (2.2) — from a single trace of a different
   application on different firmware; the article flags the weakness but still builds the 4.3%
   figure on it.
10. "at most 1.6 / (35.6 + 1.6) = 4.3 percent of the path" — arithmetically right (4.30%), but the
    denominator omits the unmeasured compositor drawing time, so 4.3% is an *upper* bound whose
    tightness depends on the very measurement section 2.6 says is missing.

## Section scores

- **2.1 — 4.** The table of four intervals is the clearest thing in the article and the "no interval
  ends at the LCD" point lands hard; marked down because one row is not a timing and "nucleus" is
  assumed.
- **2.2 — 4.** Amdahl's law, its limit and the "find *p* first" rule are taught well, and the passage
  is honest about the model's weaknesses; the per-turn-to-per-key-press substitution is under-argued.
- **2.3 — 4.** One complete attribution, a table that adds to 559, and two transferable lessons; the
  second trace's 230 ≠ 235 and the relation between the traces is murky.
- **2.4 — 2.** The most important section for the issue's thesis, and the one I trust least: 29.9 ms,
  the RV32-path denominator and 118 µs per token all failed my arithmetic, so I cannot tell which
  conclusions survive.
- **2.5 — 3.** The four experiments are well-delimited (revision, script location, what is counted),
  but "validates the walk" and "identical in size" are weaker checks than the prose implies.
- **2.6 — 3.** Naming what is missing is the most useful page in the article; "extend the same log to
  a key press" is a wish rather than a how, and "world counters" is unexplained.
- **2.7 — 3.** The consequence table is a good device for making measurement matter, but "dominates"
  has no threshold, so I could not use it to decide anything from the numbers I have.
- **2.8 — 3.** Key points are the right five, but they restate the section 2.4 figures I could not
  reproduce, so the summary inherits the doubt.
- **2.9 — 4.** Five of six questions are answerable from the text; question 1 depends on a mapping
  the article never makes, and question 5's "assumptions" live in Article 5.

## Questions that the article did not let me answer

- **Question 1** was only partly answerable. The article gives no definition of "responds N seconds
  after power-on", so I had to assume it means the "first response after boot" row. A single sentence
  mapping the phrase to an interval would close this.
- **Question 5** was partly answerable. I could name the check (reproducing the current backend for
  all 161 functions) and its first limit, but "what does that check not establish" needs the model's
  assumptions, which the article defers to Article 5. One list of "the model assumes X, Y, Z" here
  would make the question fair.
- **Question 6** was answerable in outline, but only half-explained: the article says to alternate the
  order without saying why alternation matters (drift and carry-over between runs). I recognised the
  argument from the citations' titles, not from the text.
- Questions 2, 3 and 4 were fully answerable, including all arithmetic.

## One thing to add and one thing to cut

**Add:** a denominator line under each table and percentage — which rows are included, whether the
figure is per run or a median, and what the base is (e.g. "shares are of the RV32 path excluding
self-evaluation; device figures are one run"). Nearly every doubt I recorded above dissolves with one
such line per table, and it costs nothing in length.

**Cut:** the "Framebuffer capture" row from the section 2.1 table. It is not an interval, it breaks
the table's own logic, and the point it makes ("it is a correctness check") is better as one sentence
of prose — or, better still, cut the 118 µs / 42,000-cycle sentence in 2.4 until the arithmetic is
fixed, since as written it teaches a wrong calculation in an article about trusting calculations.
