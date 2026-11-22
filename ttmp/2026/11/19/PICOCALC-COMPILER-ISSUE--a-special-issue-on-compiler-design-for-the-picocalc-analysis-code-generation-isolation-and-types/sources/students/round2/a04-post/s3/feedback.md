# Feedback on "4. Making Inference Affordable, or Avoiding It"

I read the article once for sense, then again with the glossary open beside it, then answered the
quiz. Below, "the article" means article.md and "the glossary" means glossary.md.

## Passages I had to read twice

1. "Of the 11,760 function visits for Agenda, 9,019 were skipped because the function's inputs had
   not changed, which left 2,741 visits in which a body was analyzed. An experimental cache that
   stored complete per-function results avoided 62 percent of those 2,741 and cut 29 percent of
   compile time on a workstation."
   The subtraction is clear, but the two percentages cannot be checked against each other. If only
   2,741 of 11,760 visits (23%) do real work, then avoiding 62% of that fraction is about 14.5% of
   the visits' work, and a 29% cut in compile time does not follow unless the skipped visits are
   nearly free. The reader is asked to accept an unexplained attribution of cost.

2. "Iteration is still needed *inside* a component that contains a cycle: widening first, to make
   the iteration end, and then **narrowing**, a second phase that tightens the widened bounds again
   using the conditions in the code (for example, restoring 'less than `n`' after a jump to
   infinity)."
   "A second phase" of what is never fixed: of the iteration inside the component, of the whole
   analysis, or of each pass? The parenthetical example also assumes the reader can see how a jump
   to infinity happens, which is never shown anywhere in the article.

3. "Range analysis and its relatives have been made incremental by expressing them as rules over
   relations and maintaining the derived facts under changes [Szabó et al. 2018]."
   "Rules over relations" and "maintaining the derived facts" are words I had to decode from the
   reference title alone; the article never says what a relation is here (a table of tuples? the
   edges of the constraint graph?) nor what "maintaining under changes" costs.

4. "A jump function stores an expression per argument instead of a result per program point, which
   is the property that matters on this device. Whether it fits in CJI's heap is an open, testable
   question."
   Two paragraphs earlier the same mechanism was said to have been *rejected* for memory reasons,
   and here it becomes an open question, so I read back to check whether CJI now uses summaries or
   not. The article never states plainly "CJI does not use summaries today".

5. "CJI already accepts type annotations in comments, in the form `/*: Any[] */`, which declares an
   array of values of any type; the project used one to remove 15.9 million run-time type
   dispatches from CJI's own code."
   One annotation producing 15.9 million fewer dispatches is a surprising ratio, and the sentence
   does not say how a comment-only annotation can change generated code, so I re-read it twice
   expecting to have misread the number.

6. "The consistent result is that a language can have classes, closures and managed memory and still
   be compiled one function at a time, provided types are declared where functions meet."
   "The consistent result" refers to the four systems above, but two of them (Static Hermes and
   AssemblyScript) are covered by one sentence with one quotation and no measurement, so the word
   "consistent" carries more weight than the evidence does.

## Terms used before they were explained, or never explained

- **topological order** (4.1, dependency order): used to describe how components are processed, and
  the reader is expected to know that it means "nothing is solved before what it depends on"; the
  glossary defines *strongly connected component* but not this.
- **dominance computation** (4.1, sparse propagation, quoting Braun et al.): "without a separate
  dominance computation" — domination is not described in the article or the glossary.
- **relations / rules** (4.1, incremental analysis): the shape of the "rules over relations" encoding
  is never explained; the word Datalog appears only inside a reference title.
- **bi-abduction** (references; the "fully compositional" variant in 4.1): named in the citation but
  the property that makes the summary "valid in any calling context" is asserted, not defined.
- **separate compilation** (4.2, Modula-2 row): used as if self-explanatory, and it is the very thing
  the row is claiming as a benefit.
- **polynomial time** (4.1, Su & Wagner sentence): assumed background; no glossary entry.
- **the "companion report"** (4.1, demand-driven analysis): referred to as the source of the
  negative-zero error, but no title, number or section is given, so the reference cannot be followed.
- **π and φ** are used well: both are explained where they appear. *Widening*, *join*, *range* and
  *demotion* are explained in the glossary, so I am not counting them against the article.

## Claims I could not verify from the article itself

- "An experimental cache that stored complete per-function results avoided 62 percent of those 2,741
  and cut 29 percent of compile time on a workstation, and it was rejected because storing complete
  results raised peak memory from 4.5 MB to 7.3 MB inside an 8 MiB heap."
  Missing: how compile time divides between the 9,019 skipped visits and the 2,741 analysed bodies,
  and how 62% of the body analyses becomes 29% of total time. The memory figures are given precisely;
  the time figure is left unaccounted for.
- "Solving component by component was the largest single gain, up to 450 times faster on one program,
  and it also *raised* precision, because widening is applied only inside cycles and each component
  is narrowed before its results are used."
  Missing: which program, what the benchmark suite was, and any number for the precision gain. The
  sentence also leaves open whether 450× is typical or the best single case (it says "on one program",
  which is honest, but no median or average follows).
- "One implementation, a range analysis for C programs, became 5 to 110 times faster and extended its
  reach from programs of 111 thousand lines to 1.4 million."
  Missing: whether the speed range and the size range come from the same experiment, and against what
  baseline analysis.
- "Removing all 25 local annotations from one of its source files produced byte-identical output."
  Missing: which file, how the removal was done, and whether the result holds for other files. As
  written it is a single anecdote offered as proof that local type inference works.
- "the project used one to remove 15.9 million run-time type dispatches from CJI's own code."
  Missing: the mechanism (how a type-annotated array avoids dispatch), the program, and whether the
  15.9 million is per run, per compilation or cumulative.
- "The techniques of section 4.1 remain valuable for a compiler that does not follow that rule."
  This is a judgement, not a finding; the article gives no case where a technique from 4.1 was tried
  on CJI and paid off.
- "Each technique removes a real inefficiency, and the first three would compose."
  Missing: any argument for why summaries, sparse propagation and dependency order compose without
  interfering (for instance, whether a jump function can be represented on the sparse form).
- "In the original implementation, in a research Java virtual machine, it removed on average 45
  percent of the bounds checks executed by its benchmark programs, using fewer than ten analysis
  steps per check."
  The article never says whether these numbers transfer to a 360 MHz device with an 8 MiB heap, which
  is the only setting the article cares about.
- "**Static TypeScript** … On benchmarks dominated by access to object properties, the authors report
  execution well over ten times faster than the embedded interpreters it was compared with."
  Missing: the comparison is against *interpreters*, not against a JavaScript compiler, so it does
  not by itself support the article's point about declared types replacing optimization. The article
  also does not say what "well over ten times" means numerically.

## Section scores

- **4.1 Five kinds of waste — 4.** The table is a genuinely good map, the "does the answer change?"
  column keeps the five remedies from blurring together, and the jump-function example is worked well
  enough to imitate; it loses a point because the two cost/precision claims (cache 62%/29%, dependency
  order "raised precision") are asserted with numbers that cannot be reconciled or traced.
- **4.2 Declared boundaries — 5.** The definition is crisp, the four-consequence sentence
  ("proportional to the size of the function, any order, an edit cannot change another function")
  is the clearest passage in the article, and the costs section is honest about annotation, generics
  and the 22 unported programs.
- **4.3 Where the two families meet — 3.** The one-sentence design rule is excellent, but the path
  from `/*: Any[] */` comments to "a larger-language relative of the typed compiler" is a jump of
  several steps that the reader has to supply alone.
- **4.4 Key points — 4.** Every bullet is a real claim from the body rather than filler; the only
  weakness is that the bullets say "preserves precision if names are split at branches" without
  repeating why, so they help a reviser more than a first-time reader.
- **4.5 Check your understanding — 4.** Five of the six questions can be answered from the text; the
  arithmetic in question 4 is easy to get wrong if the reader starts from 11,760, which is exactly
  the trap the question intends, so this section does its job.

## Questions that the article did not let me answer

None of the six was impossible, but two were only answerable at a shallower depth than asked:

- **Question 4** ("why is that the number that matters?") — the article never says how much of the
  11,760-visit total the 9,019 skipped visits cost. Without that split, I can argue that 2,741 is the
  pool of *analysis* work, but I cannot say it is the pool of *savings*, which is what the question
  implies.
- **Question 6** — the article states that `/*: Any[] */` annotations exist and are optional, and that
  making them mandatory on every boundary would make inference local. What it does not say is whether
  this has been tried, what breaks (the demand-driven consumer? library specialization?), or what
  happens to the 22 unannotated programs. So the answer is a restatement of 4.3 rather than a
  prediction I could defend.
- **Question 3** was answerable but thin: the article shows the π renaming and says it "does nothing
  at run time", yet gives no example of the fact that would be lost without it, so I had to construct
  the loss myself.

## One thing to add and one thing to cut

**Add:** one worked mini-example of dependency order with widening and *narrowing*, of about ten lines,
in the style of the `nextIndex` example: a loop such as `let i = 0; while (i < n) { i = i + 1 }`,
showing the widened bound after the first iteration, the jump to infinity, and the narrowing that
brings the result back to "less than `n`". This is the only technique in 4.1 whose payoff ("it also
raised precision") the reader currently has to take on trust, and it is also the one whose wording I
had to read twice.

**Cut:** the sentence "Range analysis and its relatives have been made incremental by expressing them
as rules over relations and maintaining the derived facts under changes [Szabó et al. 2018]." It is
one line of unexplained vocabulary that carries no usable information for the reader, and the
following sentence (compositional analysis, Infer) already tells the reader what incrementality buys.
If the idea must stay, replace it with a sentence saying in plain words what is kept from the last
build and what is thrown away after an edit.
