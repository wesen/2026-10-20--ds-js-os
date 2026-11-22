# Reader feedback on Article 4, "Making Inference Affordable, or Avoiding It"

Read as a first-time reader with `glossary.md` open. Terms are reported as
unexplained only where neither the article nor the glossary explains them.

## Passages I had to read twice

1. > "A proof is needed only for operations compiled as integer arithmetic pending that proof"

   This is the *evidence* column of the waste table, but it is not evidence: no
   number, no measurement, no citation. I had to reread the sentence several
   times to work out that it is describing *which* values have consumers rather
   than what was measured about them. Every other row's evidence cell has a
   figure ("78.3% of 11.7 million joins", "95 passes"); this one breaks the
   pattern silently.

2. > "In SSA each variable is assigned in exactly one place; where two definitions meet at a control-flow merge, a φ-function creates a new name that selects between them."

   The material after this point assumes I understand that a "merge" is a place
   in the control-flow graph, but the article has never introduced that picture.
   I read it twice and only the later π example (`if (i1 < n) { i2 = π(i1) ... }`)
   made it concrete.

3. > "Inside the body of `while (i < n)`, the value `i` is known to be less than `n`, and plain SSA uses the same name for `i` on both sides of the test."

   "Both sides of the test" is ambiguous: it could mean the two outcomes of the
   branch, or before-and-after the test. The following code sample uses `if`,
   not `while`, so the `while` version I was meant to picture is never shown.
   The sentence is also doing two jobs at once — stating the fact and stating
   the naming problem — which is why it reads as self-contradictory on a first
   pass.

4. > "Iteration is still needed *inside* a component that contains a cycle: widening first, to make the iteration end, and then **narrowing**, a second phase that tightens the widened bounds again using the conditions in the code (for example, restoring 'less than `n`' after a jump to infinity)."

   One long sentence carrying three new ideas (widen, narrow, the example). The
   parenthetical "restoring 'less than `n`' after a jump to infinity" is the only
   explanation of narrowing and it is too compressed to reconstruct the
   mechanism from: it is not said *how* the condition is used to restore the
   bound.

5. > "When a jump function would be too complicated to represent, the analysis records 'unknown' for that argument. The result is then less precise, and it is still safe: the compiler falls back to the general code."

   "The general code" is never defined. From the glossary I inferred this means
   demotion to floating-point arithmetic (glossary: *Demotion*), but the article
   does not say so here, and a reader who does not remember Article 3's section
   will not make the connection.

## Terms used before they were explained, or never explained

- **exact** (in the table, "No, if the summary is exact", and in "A jump function
  stores an expression per argument instead of a result per program point, which
  is the property that matters"). "Exact" is doing real work — it is the
  condition under which the answer does not change — and neither the article nor
  the glossary says what distinguishes an exact summary from an approximate one.
- **topological order** ("Process the components in topological order"). Used as
  if known; not in the glossary and not explained in the article.
- **dominance computation** ("SSA itself can be built directly while parsing
  structured code, without a separate dominance computation"). Never explained
  and not in the glossary, so the sentence's point is lost.
- **polynomial time** ("the exact best answer can even be computed in polynomial
  time with no widening at all"). Never explained; the reader is expected to know
  what makes this a contrast with the previous sentences.
- **linear in program size** ("time and memory growing linearly in program size").
  Used as a selling point without saying what it is being contrasted with.
- **machine word / word size** ("treats annotated integers as machine words, so
  that arithmetic wraps at the word size"). Neither the glossary nor the article
  explains the notion of a fixed-width word or of wrapping.
- **narrowing**. Defined only inside the single sentence quoted above; not in the
  glossary, although its partner *widening* is there. A reader who looks it up
  finds nothing.
- **SSA edges** ("Propagation along SSA edges touches a statement only when one
  of its inputs has changed"). The phrase is new terminology here even though the
  idea is simple; not in the glossary.
- **peak memory / 8 MiB heap vs "4.5 MB" and "7.3 MB"**. The article mixes MB and
  MiB inside one sentence without comment, so I could not tell whether the 4.5→7.3
  growth is being compared against the same unit as the 8 MiB limit.
- **specialization rounds** ("CJI's specialization rounds are the automatic
  version of the first"). The glossary has *Library specialization*, which is
  about library routines per call site, not about generating copies of generic
  user functions per element type. The connection is asserted, not shown.

## Claims I could not verify from the article itself

1. > "An experimental cache that stored complete per-function results avoided 62 percent of those 2,741 and cut 29 percent of compile time on a workstation, and it was rejected because storing complete results raised peak memory from 4.5 MB to 7.3 MB inside an 8 MiB heap."

   Missing: how the 62 percent and 29 percent were measured (which edits, which
   build, one run or a mean), and what "compile time on a workstation" is
   measured against — the 25-minute figure came from Article 3 and no baseline
   is restated here. Without that, I cannot tell whether 29 percent is a large
   saving or a small one.

2. > "One implementation, a range analysis for C programs, became 5 to 110 times faster and extended its reach from programs of 111 thousand lines to 1.4 million."

   Missing: what the range of 5 to 110 is a range *over* (different benchmark
   programs? one program under different settings?), and what the 111 thousand /
   1.4 million line figures measure — the largest program it could finish, or the
   largest it was run on. As written the two numbers cannot be checked against
   each other.

3. > "In their measurements on a standard benchmark suite, solving component by component was the largest single gain, up to 450 times faster on one program"

   Missing: which benchmark suite, which one program, and what the *median* gain
   was. "Up to 450 times on one program" is a best case reported without the
   distribution, so I cannot judge the typical benefit.

4. > "The resulting analysis processes half a million lines of code in under ten seconds, with time and memory growing linearly in program size."

   Missing: the machine. Ten seconds is meaningless for a claim about a compiler
   that must run on a 360 MHz handheld; the article elsewhere is scrupulous about
   naming the device, and here it is silent.

5. > "On benchmarks dominated by access to object properties, the authors report execution well over ten times faster than the embedded interpreters it was compared with."

   Missing: what the embedded interpreters are, and what "dominated by access to
   object properties" excludes. Since this sentence carries the whole argument
   that a nearly-optimizing compiler is fast enough, the exclusions matter.

6. > "Removing all 25 local annotations from one of its source files produced byte-identical output."

   Missing: which file, what "local annotations" are (annotations on `let`
   bindings? on expressions?), and how byte-identical output was checked. This is
   the single piece of evidence for the claim that interior types need not be
   declared, so its details are load-bearing.

7. > "the project used one to remove 15.9 million run-time type dispatches from CJI's own code"

   Missing: over what run — one compile of Agenda, one build, or a whole
   benchmark? Also unstated is how a dispatch was counted.

8. > "with the range analysis removed altogether, CJI still needs 170 seconds for Agenda"

   Missing: the machine again, and whether 170 seconds is the figure on the same
   device as the 25 minutes. The comparison is the article's central concession,
   and both figures are inherited from an article the reader may not have.

9. > "the first three would compose"

   Missing: any argument or citation. Three techniques are said to compose
   (summaries, sparse propagation, dependency order) but nothing says whether the
   speedups multiply, or whether building SSA and jump functions interacts badly
   with solving in component order. This is an assertion, not a demonstrated
   claim.

10. > "which is the same decision the typed compiler made for `i32`"

    Missing: what decision exactly — wrap on overflow, or treat `i32` as a machine
    word, or both — and where in the issue the typed compiler's decision is
    documented. I was asked to take the parallel on trust.

## Section scores

- **4.1 Five kinds of waste** — **4**. The five-way split is genuinely useful and
  the table is the best single artefact in the article; it loses a point because
  one evidence cell contains no evidence, and because the jump-function
  subsection is the only place where the "does the answer change?" column is
  argued rather than asserted.
- **4.1 subsections on sparse, dependency order, demand, incremental** —
  **3**. Each is a dense paragraph of citation-backed claims with almost no worked
  example, so I finished able to repeat the conclusions but not to reconstruct
  any of the four techniques. The π example is the exception and shows what the
  rest is missing.
- **4.2 Declared boundaries** — **5**. The clearest section in the article: a
  definition, an immediate statement of what follows from it, a table of four
  real systems, and then the costs stated plainly. I could teach this section to
  someone else after one reading.
- **4.2 "How much language can a one-pass compiler carry?"** — **4**. Convincing
  as an argument, weaker as evidence, because the four systems are named but none
  is described in enough detail to check the parallel to the typed compiler.
- **4.3 Where the two families meet** — **3**. The design rule is well put, but
  the "meet in the middle" picture is asserted in two sentences and never shown;
  I could not say what the typed language still lacks or what CJI would lose.
- **4.4 Key points** — **5**. An accurate summary of the article, and the last
  bullet correctly preserves the article's own limitation.
- **4.5 Check your understanding** — **4**. All six questions are answerable from
  the text, which is more than most quizzes manage; question 2 in particular
  tests the one conceptual point the article makes carefully.

## Questions that the article did not let me answer

None were unanswerable. Some notes on the margins:

- **Question 1** is answerable only because the article happens to work the
  `[0, 9] → [1, 10]` example in the same subsection; it never states the rule
  that adding a constant shifts both endpoints. A reader who had to extrapolate
  the rule from one example could reasonably get the endpoints transposed.
- **Question 4** asks for a subtraction (11,760 − 9,019) that the article does
  state explicitly ("which left 2,741 visits"), so it is answerable; but the
  article never says why the 9,019 are irrelevant to a summary's benefit, which
  is the interesting half of the question. The reader has to supply that
  argument.
- **Question 6** requires knowing that annotations are currently *optional* in
  CJI. The article says CJI "already accepts" them and later that they would have
  to become required, but never states in one place that they are optional today.
  Answerable, but by inference.

## One thing to add and one thing to cut

**Add:** one worked end-to-end example carried through all five remedies, on a
single small function. The jump-function subsection does this for summaries and it
is the reason that subsection is understandable; a two-line loop with one call,
used first to show a summary, then the SSA/π version, then the constraint graph
with its one cycle, then one demand query, would make the other four remedy
paragraphs usable rather than merely quotable. It would also give the
"does the answer change?" column something to point at.

**Cut:** the "What these remedies cannot do" subsection's restatement of Article
3's 170-second figure, or alternatively cut the taxonomy table's fifth row
(*incremental analysis*). The 170-second paragraph is doing nothing that key point
7 and section 4.3's design rule do not already do, whereas the incremental row is
a technique with no measurements of its own in this article and no appearance in
the quiz — it is the one row of the five where the reader is sent to a citation
instead of to a number.
