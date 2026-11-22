# Feedback on article 4, "Making Inference Affordable, or Avoiding It"

## Passages I had to read twice

1. "The summary is computed once *because it is a function of the facts, and does not contain
   them*." — "a function of the facts" reads, on first pass, as "depends on the facts", which is
   the opposite of the intended "is a formula that consumes facts without storing them". The
   italics do the arguing but the phrase is doing the work, and it is the load-bearing sentence of
   the whole summaries subsection.

2. "Extended SSA forms insert a renaming, written π, on each branch outcome so that the stronger
   fact has its own name." — I could not tell at first what π *is*. Both branches get a new name,
   so why does that help? It only becomes clear after realising the rename is an assumption
   attached to one outcome, not an assignment of a value; the article never says that a π
   renaming encodes the branch condition rather than a computed value.

3. "It is never needed between components. This is the structure of the range analysis built by
   Pereira's group for the LLVM compiler. In their measurements, solving component by component
   was the largest single gain, up to 450 times faster on one benchmark, and it also *raised*
   precision, because widening is applied only inside cycles and each component is narrowed
   before its results are used." — two claims (speed and *precision gain*) are packed into one
   sentence, and I had to reconstruct the causal chain myself: less widening overall means less
   loss of precision. It also left me unsure whether 450× and the precision gain were measured on
   the same benchmark.

4. "Only provisional integer operations need a proof" (table, row "Demand") and "the operations
   provisionally compiled as integer arithmetic" (the demand subsection) — "provisional" is a term
   of art of CJI's design that a reader of this article has no way to reconstruct. I guessed it
   means "compiled as integer ops but revertible if the range proof fails", but the text does not
   say so and nothing later confirms it.

5. "The techniques of section 4.1 remain valuable where that rule is deliberately broken, which on
   this project means CJI used as a workstation tool." — I had to read this twice to see that it
   is not a contradiction: breaking the rule is allowed, but only off-device. The sentence is
   compressed to the point where the first reading sounds like advice to break the rule.

6. "Static Hermes announcement states the reason in one line: native compilation 'requires sound
   types for performance', because without them the compiler must generate code for every
   combination of operand types" — "every combination of operand types" is asserted, not shown, and
   I needed a concrete example (say, `a + b` where `a`, `b` are unknown) before the sentence paid
   off. The article never gives that example.

## Terms used before they were explained, or never explained

- **CJI** — used from the first sentence of the article, never expanded and never characterised;
  the reader is assumed to have read Article 3.
- **Agenda** — the only benchmark quoted throughout, never described (size, what the program does,
  why it is representative).
- **"the handheld" / "the device"** — never identified beyond "360 MHz" and "8 MiB heap"; no name,
  no memory model, no notion of flash vs RAM.
- **"provisional integer operations" / "provisionally compiled as integer arithmetic"** — never
  defined; central to the demand-driven section.
- **Widening and narrowing** — used in the dependency-order section as "iteration, with widening
  followed by a refining step called narrowing"; the mechanism is never explained, yet the whole
  precision-improvement claim rests on it.
- **π renaming** — introduced in one clause, never spelled out (see above).
- **"lattice-based analyses"** — the word lattice appears once, in the incremental subsection, with
  no definition of lattice, monotonicity, or why they permit incrementalisation.
- **QuickJS** — named as the fallback engine for the unported code, never explained.
- **"the 22 existing worlds"** — "worlds" is project vocabulary; I still do not know what a world is.
- **"the typed compiler"** — referred to as "the typed compiler of this project", but it is never
  named, and its relation to CJI (separate program? front end? replacement?) is left implicit.
- **"CJI's specialization rounds"** — specialization is referenced twice (also "specializing library
  calls" in the closing passage of 4.1) and never defined.
- **"counted strings"** — used as though known.
- **"sound types"** — quoted from Static Hermes; sound is never defined for the reader.
- **"peep-hole pass"** — used unglossed in the Static TypeScript discussion.
- **"φ-function creates a new name that selects between them"** — glossed in seven words; the
  reader who does not already know φ-functions gets a hint, not an explanation.

## Claims I could not verify from the article itself

- "11,760 function visits", "78.3% of 11.7 million joins had identical inputs", "95 whole-program
  rounds", "170 seconds for Agenda" — every number in the premise table is deferred to "Article 3"
  and to "(Agenda)". Missing: what machine, what build, what Agenda is, and whether these are one
  run or a mean. As a reader of *this* article only, I cannot check any of them.
- "An experimental cache that stored complete per-function results avoided 62 percent of the
  remaining visits and cut 29 percent of compile time on a workstation, and it was rejected because
  storing complete results raised peak memory from 4.5 MB to 7.3 MB inside an 8 MiB heap." — this
  is the article's own measurement and has no citation and no method: was the 62% measured against
  the same 11,760 baseline, what does "peak memory" measure, and how is a jump function's memory
  argued to be lower (that is asserted, not estimated).
- "A jump function stores an expression per argument instead of a result per program point, which is
  the property that matters on this device. Whether it fits in CJI's heap is an open, testable
  question." — honest, but it means the recommended remedy's feasibility is unestablished; no order
  of magnitude estimate is offered.
- "One implementation for C made an interval analysis 5 to 110 times faster and extended its reach
  from programs of 111 thousand lines to 1.4 million [Oh et al. 2012]." — 5× to 110× is a very wide
  range with no indication of what varies across benchmarks; the article gives no basis for
  choosing which end to believe for CJI's size of program.
- "solving component by component was the largest single gain, up to 450 times faster on one
  benchmark" — "on one benchmark" is stated and then generalised in the next sentence to "half a
  million lines of code in under ten seconds, with time and memory growing linearly". Missing: the
  hardware for that under-ten-seconds figure, and the relationship between the 450× single-benchmark
  result and the linear-scaling result.
- "In the original implementation it removed on average 45 percent of executed bounds checks, using
  fewer than ten analysis steps per check." — "45 percent of executed checks" is a dynamic measure
  in an article otherwise about static effort; no indication whether this is dynamic or static count.
- "The typed compiler does exactly this. Removing all 25 local annotations from one of its source
  files produced byte-identical output." — one file, 25 annotations; the article generalises to "the
  typed compiler does exactly this", which needs either more files or an argument that this file was
  representative.
- "The viper emitter requires type hints and treats annotated integers as machine words, so that
  arithmetic wraps at the word size" — no citation for the MicroPython paragraph, unlike every other
  system mentioned.
- "The authors report execution far faster than the embedded interpreters it was compared with." —
  "far faster" with no factors; the strongest evidence in the section is the least quantified.
- "the project used one to remove 15.9 million run-time type dispatches from CJI's own code" — no
  saying how dispatch counts were measured, on which workload, or what a "run-time type dispatch" is.
- "Each technique removes a real inefficiency, and the first three would compose." — composition is
  asserted. Summaries, sparseness and dependency-order solving interact non-trivially (sparse
  propagation changes what a summary is computed over), and the article does not argue it.

## Section scores

| Section | Score | Reason |
| --- | --- | --- |
| 4.1 Five kinds of waste | 4 | The waste→remedy→answer-changes table is genuinely useful and each subsection has a worked micro-example, but the prose leans on unexplained terms (provisional, widening/narrowing) and on measurements deferred to Article 3. |
| 4.2 Declared boundaries | 4 | The definition is crisp and immediately tested against four real systems plus a cost list, though the "burden is smaller than it appears" argument rests entirely on one 25-annotation experiment. |
| 4.3 Where the two families meet | 3 | The shortest section and the most asserted: it tells me the families meet and gives a one-sentence design rule, but the meeting point (CJI requiring annotations) is a proposal, not something the article demonstrates or prices. |
| 4.4 Key points | 5 | Seven bullets that restate the article's claims accurately and would work alone as a summary; nothing new is smuggled in. |
| 4.5 Check your understanding | 4 | All six questions are answerable from the text, and Q1's arithmetic is directly modelled by the article's own example; Q5 asks about the handheld specifically and the text only supplies device-independent consequences, so it needs one inference step. |

## Questions that the article did not let me answer

- **Q5, partly.** It asks for consequences "for a compiler that runs on the handheld". Section 4.2
  gives the consequences of local checking in general — cost proportional to function size, any
  order, edits cannot affect other functions — and section 4.3 gives the payoff ("interactive
  compile times on the device", "one-pass compilation in seconds on the device"). What is missing
  is anything handheld-specific: whether local checking saves memory as well as time, and what the
  declared signatures themselves cost to keep resident. I answered with the general consequences and
  a link to the device, flagged as inferred.
- **Q2, partly.** The reasoning error is stated in the article ("a function of the facts, and does
  not contain them"), so this is answerable, but a reader cannot *check* the claim that facts "still
  travel around the call graph as many times as needed" without knowing how CJI's call graph
  iteration works, which is Article 3 material.
- The other four (Q1, Q3, Q4, Q6) are fully answerable from this article alone.

## One thing to add

A short premise paragraph at the top, before the waste table, giving what the rest of the article
assumes: what CJI is (and what the acronym stands for), what Agenda is, the size of the program, and
that the numbers cited are Article 3's. Every quantitative claim in 4.1 depends on these, and a
reader coming to this article cold spends the whole first section reconstructing the context.

## One thing to cut

The MicroPython paragraph in 4.2. Static TypeScript already makes the "declared types replace
optimization" point with a citation, real RAM figures and a quoted characterization of the
optimizer; MicroPython adds a third unfamiliar system, has no reference at all, and its one piece of
new information (word-size wrapping) is a side remark about the typed compiler's `i32` choice.
Cutting it leaves the section's argument intact and removes the reader's weakest-evidenced claim.
