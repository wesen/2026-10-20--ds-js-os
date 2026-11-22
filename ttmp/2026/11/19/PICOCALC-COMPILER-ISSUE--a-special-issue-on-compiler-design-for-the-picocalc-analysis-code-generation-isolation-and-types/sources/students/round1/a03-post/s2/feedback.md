# Feedback on article 3, *Why Whole-Program Inference Costs Minutes*

Editor's note on method: I read the article once in full, then answered the six quiz questions
without looking anything up, then re-read the passages below. Where I quote arithmetic I show what
I computed; where I say "cannot verify" I mean only that the article itself does not give me what
I need, not that the claim is false.

## Passages I had to read twice

1. "Solving means finding the smallest assignment of types that satisfies every constraint." — The
   preceding paragraph says information only grows, and section 3.2 builds on that monotone growth.
   If growth of type sets is the direction of the order, then the fixpoint is the *largest* set,
   i.e. the least precise. "Smallest assignment" reads as the opposite. I only resolved it by
   assuming a constraint solution is ordered per-variable by "fewer possible types = smaller", which
   is the reverse of the growth order used two paragraphs later. One sentence naming the order would
   fix this.

2. "the type of `x` includes whatever `area` passes and whatever `half` passes; the type of `v` in
   `half` includes whatever the callers of `half` pass; the result type of `scale` follows from `x`
   and `k`." — The example uses one caller of `half` and one of `scale`, so these edges do not
   connect `half`'s `v` to `scale`'s `k`: nothing in the stated constraints shows `0.5` reaching `k`,
   which is the whole point of the example. I had to reconstruct the missing edge myself. A diagram
   or a list of edges (`0.5` in `half` → `v` → `k` of `scale` → `x * k`) would remove the guesswork.

3. "A demotion changes a variable's type, which can change other functions' types, so type solving
   must run again after it." — This nests a second fixpoint inside the first (solve types, run the
   range proof, demote, re-solve) but says so in one clause. I could not tell whether the re-solving
   loop in section 3.4's rounds is the *same* loop or a third one, or whether demotions inside one
   round converge.

4. "Running the range proof once after the last round, with a safety guard", with "1,475 s → 544 s" in
   the same table row — "safety guard" is never defined. I do not know whether the guard makes the run do less work than
   the 1,475 s baseline (which would weaken the comparison) or merely keeps the output correct while
   dropping intermediate proofs. A parenthetical is needed, because this row is the arithmetic
   foundation of the "63 %" claim.

5. "The remedy is widening: when a bound keeps moving, the solver jumps it to a much larger value
   at once, for example to the next constant that appears in the program or to infinity." then "CJI
   widens to thresholds taken from the program's literals plus a set of standard values." — The generic
   description arrived before the concrete rule, and the concrete rule is vaguer ("a set of standard
   values") than the generic one ("the next constant that appears"). I had to read both to see they
   are the same mechanism, and I still do not know what the standard values are or in what order
   thresholds are tried.

6. "The two activities multiply." — The sentence stands alone between a description of specialization
   rounds and a table of counts. It is literally true of the design (7 analyses × 6 rounds) but the
   article never states what is multiplied by what, so "multiply" functioned as a metaphor I had to
   decrypt from the table below it.

7. "| Replacing the range proof by local rules that need no whole-program facts | 170 s, of which
   168 s in the frontend | What remains is type inference and specialization |" — Going from "168 s
   in the frontend" to "what remains is type inference and specialization" requires knowing that the
   frontend's time is not parsing. The nearest support is the 37 ms QuickJS figure, but that is a
   *different* parser. I read this row three times before accepting the inference.

8. "The original CJI ran the complete range analysis after every round." together with the table rows
   "Specialization rounds that added helpers" = 6 and "Complete range analyses" = 7. — Six rounds but seven analyses
   means one analysis before the first round; this is never said. I inferred it, and a reader less
   careful would read the table as internally inconsistent.

## Terms used before they were explained, or never explained

- **turn** and **world** — declared as assumed knowledge from Article 1; never used again in the
  article, so I still cannot say what they mean.
- **CJI** — introduced only as "a compiler that accepts JavaScript without type annotations"; the
  acronym's expansion is never given.
- **Agenda** — the program being compiled appears first in the opening sentence and is never
  described beyond "16,326 bytes of source". Its shape (closures? library calls? loops?) determines
  whether the 11.7 million joins are surprising or expected.
- **frontend** — used twice in the decisive last row of section 3.5 with no statement of what it
  covers (lexing, parsing, IR building, type inference?).
- **safety guard** — never explained (section 3.5, table).
- **a set of standard values** — the widening thresholds; never enumerated (section 3.2).
- **link, assemble and hash** — "hash" is never explained: a hash of what, for what purpose?
- **QuickJS** — first named in a table row before section 3.6 establishes it as the handheld's
  JavaScript engine; the reader meets the name with no anchor.
- **abstract interpretation** — named as "the general theory of this kind of analysis" and no more;
  the reader cannot tell whether the article's widening/join vocabulary comes from it.
- **loss of knowledge ... because of a call site** — quoted as the name of a problem from Cooper &
  Torczon before any version of the problem has been shown in the article's own example; still, the
  example follows immediately, so this one is minor.
- **the typed compiler** — used as a benchmark in section 3.5 (and "the typed language of Article 1"
  in section 3.3) without a reminder of what it is or what it compiles.
- **NaN, negative zero, i32** — used without definition. I know these; a reader who does not is stuck
  at section 3.3, which is the article's load-bearing argument.

## Claims I could not verify from the article itself

1. "A build with the proof disabled computed `(max + 2) - max` as 2 where JavaScript gives 1, and
   converted negative zero to zero." — No value is given for `max`, and the claim is
   value-dependent. When I tried it with `max = 2**53` I got 2 on both sides, because 2⁵³+2 is still
   exactly representable; I could only get 1 from JavaScript by assuming `max = 2**53 - 1`. Without
   the value of `max` and the code that was actually run, the anecdote does not support "the proof is
   required for correctness" — it illustrates it.

2. "Nearly twelve million joins to compile a sixteen-kilobyte source file is the 25 minutes." — This
   identifies the cost by the scale of a count, and counts are not time. The article gives no
   nanoseconds-per-join or any other link between the 11,743,517 joins and the 1,480 s; the 88.0 %
   instruction-attribution datum is closer, but it is from a workstation and no totals are given.

3. "Repeated range analysis was 63 % of the time" — I can reconstruct the arithmetic
   ((1,475 − 544)/1,475 ≈ 63.1 %), so the number is fine, but the article does not show the
   subtraction, and it does not say whether the 1,475 s run and the 544 s run did otherwise
   identical work (see "safety guard" above).

4. "| Visits to individual functions | 11,760 |" against "| Fixpoint visits of the whole program |
   95 |" — 11,760/95 ≈ 123.8. If a whole-program visit visits each function once, the first number
   should be a multiple of the second. The article does not say what counts as a visit, so I cannot
   check the pair for consistency, and 123.8 functions in a 16 KB file is itself worth a note.

5. "and the typed compiler handles the typed part of its version of the program in under one second"
   — No section of the article shows that the typed program is the *same* program minus inference.
   The caution paragraph then admits the typed compiler lacks closures, objects and GC, which is
   exactly the difference in question; the article concedes the point, so this is a limit of the
   evidence rather than an error, but the reader cannot close the gap.

6. "The authors measured the result in a 50-minute interactive session: 21 pauses exceeded one second
   and almost two thirds were under a tenth of a second." — The total number of pauses is not given,
   so "almost two thirds" has no denominator and the two statistics cannot be related to each other.
   Nor is "still ran two to three times faster than the Smalltalk implementations of its day"
   verifiable from anything in this article.

7. "CJI widens to thresholds taken from the program's literals plus a set of standard values." — The
   set is described but never listed, and no evidence is given that this choice is what produced the
   11.7 million joins; an untuned widening could produce more or fewer joins.

8. "Shed Skin ... the inference techniques 'do not scale very well beyond several thousand lines of
   code.'" — The quoted limit is asserted; Agenda is 16 KB of source, so the reader can see the
   analogy but not where the limit lies for CJI's own technique.

## Section scores

- **3.1 Types as unknowns — 3.** The narrative hook (adding `half` changes `scale`) is excellent and
  the conclusion is stated plainly, but the constraint paragraph does not actually connect `half`'s
  argument to `scale`'s parameter and "smallest assignment" contradicts the growth direction used
  later.
- **3.2 Solving by iteration — 4.** Fixpoint, widening and join are each defined in place and the
  three-visit table is exactly the right teaching device; marks lost only because the threshold rule
  is described twice in two different registers and "standard values" is left open.
- **3.3 Why JavaScript integers need a proof — 5.** The clearest section: three checkable conditions,
  the meaning of demotion, the consequence for re-analysis, and an honest statement that the proof is
  not an optimization. Only the `max` value in the anecdote is missing.
- **3.4 Specialization multiplies the work — 4.** The round-by-round counts and the "multiply"
  relationship are well supported by the table, and the 79 total checks out; "the two activities
  multiply" is stated too abstractly, and the seven-versus-six analyses is left for the reader to
  reconcile.
- **3.5 The evidence that inference is the cost — 3.** This is the section that matters and it is the
  weakest argument: the table is well built and the caution paragraph is admirably candid, but the
  central step from "168 s in the frontend" to "therefore inference" is asserted, and the
  joins-to-minutes link is never made.
- **3.6 The same wall, hit before — 4.** Self is the useful case and the lesson drawn from it (fast
  tier first, optimize only hot code) sets up the next article well; RPython and Shed Skin are thin
  but honest analogies, and the Self pause statistics are unfalsifiable as given.
- **3.7 Key points — 5.** Six bullets that match sections 3.1–3.6 in order, each with a number where a
  number matters. Nothing to fix.
- **3.8 Check your understanding — 4.** All six questions point at real content and five of them are
  answerable straight from the text; question 5 inherits section 3.5's weak middle step, so a student
  can produce the row but not quite defend the conclusion.

## Questions that the article did not let me answer

- **Question 2 (partly).** Trace and cost are answerable, but the question asks what widening does
  "on a later visit", and the article gives two incompatible half-answers — "the next constant that
  appears in the program or to infinity" and "thresholds taken from the program's literals plus a set
  of standard values". Which threshold is chosen, and in what order, is missing, so I answered only
  at the level of "a much larger value" and said so.
- **Question 5 (partly).** I can name the measurement (170 s total, 168 s in the frontend) and repeat
  the article's attribution, but I cannot *justify* the attribution from the text, because the step
  that shows the frontend time is analysis rather than parsing is absent. This is why I marked it
  Confidence: 3 while the others are 4–5.
- **Question 4 (minor).** Answerable, but only after inferring that the seventh range analysis is the
  initial one; a reader who did not notice the mismatch might doubt the table rather than the design.

Questions 1, 3 and 6 were fully answerable from the text.

## One thing to add

A worked interprocedural constraint graph for the section 3.1 example, drawn as explicit edges with
the fixpoint steps numbered — e.g. `4 → k`, `0.5 → v → k`, `k` unifies to *number with a fraction
flag*, then `scale`'s multiply demotes and the result type flows back to `area` and `half` — followed
by the same three functions showing the re-solve after demotion. That single figure would carry
sections 3.1, 3.3 and 3.4 (why a demotion restarts solving, why specialization creates new call
sites) and would let question 1 be answered from the picture rather than reconstructed.

## One thing to cut

The sentence "The authors measured the result in a 50-minute interactive session: 21 pauses exceeded
one second and almost two thirds were under a tenth of a second, in a system that still ran two to
three times faster than the Smalltalk implementations of its day." It is the only passage whose
numbers I cannot check or use — no total pause count, no Smalltalk baseline, no CJI equivalent of
either figure — and the paragraph's actual point ("the handheld already has its fast first tier,
which is QuickJS; CJI is an optimizing tier with no mechanism to restrict it") is made in the next
two sentences without it.
