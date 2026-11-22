# Feedback on article.md

## Passages I had to read twice

1. > "The summary is computed once *because it is a function of the facts, and does not contain them*."

   The italics tell me this is the crux, but "a function of the facts" is doing a lot of work and
   reads as if a summary were *about* the facts. I only understood it after the following sentence
   ("each trip is now an expression evaluation instead of a body analysis"). A concrete sentence —
   e.g. "the summary takes the input ranges as parameters, so a new caller fact is just a new
   argument" — would have made the first reading sufficient.

2. > "Its answers are the same as the exhaustive analysis's for the questions it asks, up to a bound on search effort beyond which it gives up and keeps the check."

   Two qualifications are packed into one clause: the "for the questions it asks" restriction *and*
   the effort bound. It is also not stated what "keeps the check" means for the table's claim of
   "same answers for the questions asked" — giving up is not an answer, so I was unsure whether the
   table row is exact or hedged.

3. > "Function bodies are analyzed again when only their inputs changed | 11,760 function visits"

   immediately followed by

   > "Of the 11,760 function visits for Agenda, 9,019 were skipped because the function's inputs had not changed."

   The same number is used first as evidence of waste and then as evidence that CJI already avoids
   that waste. I had to work out for myself that the relevant figure is the remaining 2,741 visits
   (about 23 percent). Stating one of the two numbers differently would remove the jolt.

4. > "Suppose the analysis learns that `i` lies in [0, 9] at some call of `nextIndex`."

   `i` is a parameter of `nextIndex` but the phrase "at some call" suggests a caller-side variable.
   It is only clear from the diagram-free context that the fact is about the incoming argument
   range and that the [1, 10] result is the range at the entry of `clamp`. One extra clause naming
   which variable at which program point would fix this.

5. > "CJI already accepts type annotations in comments, in the form `/*: Any[] */`; the project used one to remove 15.9 million run-time type dispatches from CJI's own code."

   `Any[]` is an array of `Any`, immediately after a section that described CJI as accepting
   JavaScript worlds and the typed language as having only "integers, booleans, counted strings and
   records". I could not tell what `Any` means here (a dynamic value? the QuickJS tag?), so the
   example did not teach me much.

## Terms used before they were explained, or never explained

- **CJI** — never expanded, and its relationship to "the typed compiler of this project" is never
  stated outright; I inferred they are two separate compilers.
- **Agenda** — used as a benchmark ("95 rounds for Agenda", "170 seconds for Agenda") but never
  defined: size, source language, what it does.
- **QuickJS** — introduced as where the 22 existing worlds run; no explanation of what it is or why
  it is mentioned.
- **worlds** — "the 22 existing worlds are not annotated"; the term is never defined.
- **provisional integer operations** — the consumers that need range proofs; never defined, and
  "provisional" is left unexplained.
- **the companion report** — referred to for the negative-zero error; that evidence is outside the
  article.
- **widening** — used ("widening followed by a refining step called narrowing") only by way of
  naming; what widening *does* to an interval is never shown.
- **lattice-based analyses** — in §4.1 (incremental paragraph); "lattice" is never introduced.
- **calling context** — "a summary valid in any calling context"; context-sensitivity is never
  explained.
- **Extended SSA / π renaming** — the *purpose* is explained well, but π is never shown in an
  example, so I could not picture the renamed form.
- **static single-assignment form** — explained (one assignment per name, φ at merges), but
  "propagation along SSA edges" assumes I know what an SSA edge is.
- **Static Hermes, AssemblyScript, MicroPython, OCaml `.mli`, Modula-2 definition modules** — all
  cited as evidence with one-line characterizations; for a reader who has not used them, the
  evidence is a name plus a claim.
- **isolatedDeclarations** — named by its TypeScript option name only; no link to a semantic
  description beyond the table cell.

## Claims I could not verify from the article itself

1. > "An experimental cache that stored complete per-function results avoided 62 percent of the remaining visits and cut 29 percent of compile time on a workstation, and it was rejected because storing complete results raised peak memory from 4.5 MB to 7.3 MB inside an 8 MiB heap."

   Missing: what "the remaining visits" is (2,741?), on which benchmark, whether 62 percent and 29
   percent are from the same run, and how peak memory was measured. The conclusion ("a jump function
   stores an expression per argument instead of a result per program point, which is the property
   that matters") is plausible but not evidenced: no estimate of how many bytes a jump function
   would take.

2. > "One implementation for C made an interval analysis 5 to 110 times faster and extended its reach from programs of 111 thousand lines to 1.4 million [Oh et al. 2012]."

   Missing: which analysis, which programs, and what machine — the 110× figure is the top of a
   range whose spread is never explained.

3. > "In their measurements, solving component by component was the largest single gain, up to 450 times faster on one benchmark"

   Missing: what the 450× benchmark is, and how much of the gain came from the raised precision
   rather than the ordering. "The largest single gain" on one benchmark does not tell me the effect
   on a normal program.

4. > "In the original implementation it removed on average 45 percent of executed bounds checks, using fewer than ten analysis steps per check."

   Missing: whether "45 percent of executed bounds checks" means static checks removed weighted by
   dynamic execution, and what counts as one "analysis step". This is the only number given for
   demand-driven analysis, and it is about a different analysis (bounds checks), not ranges.

5. > "Removing all 25 local annotations from one of its source files produced byte-identical output."

   Missing: which file, how many lines, and how the claim was checked — "byte-identical output"
   against what (the previous binary, the previous generated assembly?).

6. > "The burden on the programmer is smaller than it appears, because annotations are needed only *at* the boundary."

   This is asserted, and the only support is that local inference exists in the literature. No count
   of annotations per function or per file for this project is given, though "a few tokens per
   function" is later offered without arithmetic.

7. > "The typed compiler does exactly this."

   ("this" = local type inference and bidirectional typing.) The article does not say how the typed
   compiler's own implementation corresponds to bidirectional typing, so the identification is
   unverified.

8. > "The consistent result is that a language can have classes, closures and managed memory and still be compiled one function at a time, provided types are declared where functions meet."

   The examples (Static TypeScript, MicroPython viper, Static Hermes, AssemblyScript) are all
   described in one or two sentences each and none is shown compiling a *closure* one function at a
   time; the closure case is the hard one and is exactly where I wanted evidence.

9. > "with the range analysis removed altogether, CJI still needs 170 seconds for Agenda"

   Attributed to Article 3; nothing in this article shows the measurement or the machine.

10. > "the project used one to remove 15.9 million run-time type dispatches from CJI's own code"

    Missing: over what workload, and how dispatches were counted.

## Section scores

- **§4.1 Five kinds of waste — 4.** The table of five wastes against five remedies is the clearest
  thing in the article and the four paragraphs each give a cause, a mechanism and a measured
  consequence; it loses a point for the reused 11,760 figure and for "widening"/"lattice" never
  being defined.
- **§4.2 Declared boundaries — 5.** The definition is a single unambiguous sentence, and the three
  costs are stated plainly with the awkward ones (annotation burden, generic code, 22 unported
  worlds) not hidden; the Modula-2/OCaml/TypeScript table makes the "old idea rediscovered" claim
  concrete.
- **§4.3 Where the two families meet — 3.** The design rule is quotable, but this section moves
  fastest: the `/*: Any[] */` example is unexplained, and "its specialization could be driven by
  declared types without rounds of solving" is asserted without saying what becomes of the
  specialization rounds described earlier.
- **§4.4 Key points — 5.** Seven bullets, each one a claim that the body actually earned, and the
  last bullet correctly preserves the negative result from §4.1's closing paragraph.
- **§4.5 Check your understanding — 4.** Five of the six questions are answerable from the text
  alone and the sixth (question 1) needs a small inference about which variable the interval
  describes; nothing requires material that is only in the references.

## Questions that the article did not let me answer

- **Question 1** was answerable in substance, but only after deciding for myself that jump functions
  are expressed over `nextIndex`'s parameters and that "`i` lies in [0, 9] at some call" means the
  incoming argument range. The article never states the convention for what a jump function's free
  variables are, so a reader could plausibly write `J₁` over the caller's names instead.
- **Question 5** asked for "two practical consequences". The article gives three properties of local
  checking but converts only one of them (rebuild after an edit) into a stated consequence; I had to
  derive "any order / parallel" and "memory proportional to one function" myself from §4.1's heap
  numbers. The question is answerable, but the consequences were mine, not the text's.
- **Question 6** asked what supplies the information an optimizer would otherwise discover. The
  article states the conclusion twice but never shows an example of the code difference (with and
  without annotations), so I could only restate the claim, not demonstrate it.
- No question was unanswerable outright. The nearest miss is question 3: the article explains
  *that* π renaming preserves precision but gives no example, and the quiz asks "why does this lose
  information", which is answerable only from the `while (i < n)` sentence.

## One thing to add and one thing to cut

**Add:** one worked jump-function example that runs end to end and includes a caller-side update —
call `nextIndex` twice with different argument ranges, show the summary being evaluated both times,
and show what the "unknown" case looks like when a jump function is too complicated. This single
example would carry section 4.1's central mechanism, quiz question 1 and quiz question 2 at once,
and it would let the 62 percent / 4.5 MB-to-7.3 MB numbers be put on a per-argument byte estimate,
which is what a reader needs to judge whether jump functions fit in the heap.

**Cut:** the list of systems in "How much language can a one-pass compiler carry?". Four systems
(Static TypeScript, MicroPython viper, Static Hermes, AssemblyScript) are each given one or two
sentences, and none is given enough detail to support the strong claim about closures and managed
memory. Keep Static TypeScript, which is measured and quoted, and keep the MicroPython viper line
because it explains the `i32` wrapping decision; drop the other two, or promote them to a sentence
each about what exactly they contribute that Static TypeScript does not.
