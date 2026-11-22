# Feedback on "9. Types That Pay for Themselves"

Read as a student reader: article.md straight through, glossary.md consulted for every term I did not
already know. Page-level reactions only; no attempt to check the repository or the cited papers.

## Passages I had to read twice

- "The compiler represents each name as a small integer, so the generated code is the same as today's."
  This contradicts the observation three paragraphs earlier: today the values are 14, 15, 4 and 5, and
  `FindPhase` has six members, so the constants in the emitted code must change (14 -> 4, 15 -> 5, and
  so on). "the same as today's" can only mean "the same shape of code, with different constants"; as
  written I read it as "byte-identical output" and could not tell which the author means.

- "The fact remains valid until `i` or `s` is assigned or any call is made; while it is valid, an
  access `s.charCodeAt(i)` needs no upper-bound check." The access that is being justified is itself a
  call, and in the example it sits inside `if (text.charCodeAt(at) === unit)`. So does "any call"
  include the built-in string operations, and does the fact die at the very expression it protects? I
  had to assume the rule means "any call to user or reactor code", but the article never says so, and
  the example contains no user call inside the guarded body to settle it.

- "The first rung satisfies the criterion of section 9.1." This is said right after the table, and its
  point must be that the second rung (dependent types) does *not* satisfy the criterion — but the
  second rung is described as resting on "function signatures such as 'at is less than the length of
  text'", which sounds exactly like local checking with declared boundaries, i.e. criterion 1. The
  stated reason the second rung should wait ("becomes attractive later, because a signature ... moves
  the check from the callee to the one caller") is a benefit, not a disqualification. I could not
  work out which of the three criteria excludes it.

- "An application receives a fixed set of buffers from the reactor and a state record of scalar
  fields." I did not know what a "state record" is; the glossary has an entry for the *state machine of
  an asynchronous function* and for *frame*, but not for this, and section 9.5 immediately builds two
  rules on the phrase "may not be stored in the state record". I inferred it means the per-world
  persistent record, but the article never introduces it.

- "Because typed functions are defined before they are called and the call graph is acyclic (Article
  7), the compiler knows every callee's effect when it reaches a call." Section 9.9 then lists "the
  ability to call a function defined later in the file" as a gap to be fixed. If forward calls are
  added, a callee's effect may not be known when the call is reached, so the one-pass effect
  computation in 9.7 seems to depend on a limitation the article wants removed. 9.9 only says the
  change "must come with the explicit cycle check ... because the stack bound depends on it", and says
  nothing about the effect computation. I read both passages twice to see whether an ordering
  requirement was stated; it is not.

- "The file browser's key handler (`worlds/files/files.typed`) returns 14 to mean 'delete' and 15 to
  mean 'submit'." A handler returning a number that means an action is odd — the article never says
  who consumes that return value or how it becomes an action, so the motivating example is asserted
  rather than shown.

## Terms used before they were explained, or never explained

- "code unit", "code point", "UTF-8", "UTF-16": used in 9.3 to build the whole motivating example; the
  counts 6/4/3 are given but no definition of what is being counted (why emoji cost two units but four
  bytes) appears in the article or the glossary.
- "RV32": appears in the glossary entries for *trap*, *reactor* and *slot*, but is never expanded or
  defined anywhere; I concluded only from context that it means 32-bit RISC-V.
- "refinement" / "flow-sensitive refinement" (9.4 title and the "Liquid types" row): the article
  defines the *typing* rule but never says what a refinement is, so "Refinements inferred
  automatically from a set of candidate predicates" gives me nothing to attach to.
- "decidable checking" (table, 9.4): never explained.
- "ABCD": only "the bounds-check elimination algorithm described in Article 4" — not explained here
  and not in the glossary.
- "capability", "capability system", "principle of least privilege" (9.7): the parenthetical gloss on
  capability arrives in the same sentence where the term is first used for real work ("the principle
  of least privilege on which capability systems rest"), and least privilege itself is never defined.
- "substructural type systems" (9.6): named with a citation only.
- "sized types", "amortized analysis", "reactive program" (9.8): each appears with a one-clause gloss;
  "reactive program" is never explained at all.
- "session types" (9.6): explained in a clause, but only as an extension; the term is left dangling.
- "state record" (9.5): never explained (see above).
- "match" as a language construct (9.2, and in the summary tables): it appears only as a code sample;
  the article never says whether it is a new statement form, whether the arms are `Name:` or
  `Enum.Name`, or how the grouped arm `LineSuffix, LaterLines, ...:` behaves.
- "i32" and "f64": used as if known; the glossary lists `i32` among the typed language's types but
  does not say it is a signed 32-bit integer, and `f64` appears only in 9.9.
- "768 KiB limit" (9.5): stated as a fact about worlds; the glossary's *world* entry mentions "its own
  memory limit" but no size.
- "Experiment 1", "Article 2", "Article 5", "Article 7", "Article 8" in the body text are fine as
  pointers, but the article asks the reader to accept numbers from them (see next section).

## Claims I could not verify from the article itself

- "The native Editor contains 404 trap instructions (counted by Experiment 1 of Article 2), and its
  source has 85 calls of `charCodeAt` alone." No excerpt, listing or measurement method is in this
  article; both numbers have to be taken on trust from another article.
- "The check is expensive in today's backend, which emits 20 instructions for it in the listing of
  `countUnit`. With the compile-time operand stack of Article 5 it would be about four: load the
  length, compare and branch, and the trap itself." The step from 20 to 4 is central to the section's
  argument and is not shown; also the enumeration of "about four" names only three things, so I cannot
  see where the fourth instruction comes from.
- "In hand-written code, where the length is already in a register, it is two; the hand-written loop of
  Article 5 has seven instructions without the check and would have nine with it." Nothing in the
  article shows the seven-instruction loop, so the arithmetic cannot be followed even though the
  internal consistency (two added instructions) is reassuring.
- "`a🙂b` is six bytes, four code units and three code points." I can just about check the byte count
  myself (1 + 4 + 1) and guess the rest, but the article gives no rule for code units, so this reads as
  an assertion.
- "The typed sources communicate through bare integers" and the three example sites (`14`, `15`,
  `event.kind === 4`, `state.findPhase`): quoted as fragments, with no file excerpt in which I can see
  the numbers used.
- "The file browser's key handler ... returns 14 to mean 'delete'": the calling convention that gives
  meaning to the return value is missing.
- "The manifest ... gives each world its claims" and "the 28 functions of its reactor": the reader is
  told there are 28 but is shown neither the list nor an example claim.
- "Whether a world holds a claim it never uses" — the comparison of the computed effect set against
  the manifest is claimed to be possible "in both directions", but the article never says how claims
  and reactor functions are put into correspondence (is there one function per claim? a table?).
- "The project's notes on that exchange read as a list of obligations: accepting a new grant revokes
  the old one; ..." — three obligations are paraphrased; I cannot see the notes, the code that enforces
  them, or the test that checks them.
- "Allocation checks that enough room remains and advances the pointer, about four instructions." No
  sequence of instructions is given, unlike elsewhere where the article at least names the parts.
- "The processor has hardware support only for single precision, so a 64-bit `f64` type would be
  computed in software" — asserted about unnamed hardware (RV32 with no FPU extension, presumably).
- "could run up to 105 times slower than either extreme" — a number from another language, explicitly
  labelled as such, but presented without any indication of the shape of the slowdown curve; I accept
  it only as a warning.
- "twelve more applications" (opening sentence): the number is never tied to a list.

## Section scores

- Opening (untitled preamble): 4 — it states the plan, the count of six plus two, and the dependencies
  on Articles 4, 7 and 8, which is exactly what a reader needs; only the "five kinds of type" and the
  "twelve more applications" are left uncounted.
- 9.1 The criterion: 4 — three conditions are short and checkable, and the later sections are visibly
  held to them; "and where possible removes some" is the one vague phrase.
- 9.2 Enumerations with exhaustive matching: 3 — the defect and the payoff (exhaustiveness catching
  added phases) are clear, but the match syntax is unshown and the "same generated code" claim fights
  the 14/15 observation.
- 9.3 Distinct integer types: 4 — one of the best sections: a concrete confusing example, a three-line
  mechanism, an explicit restriction of scope, and a stated cost; only the emoji counts are unexplained.
- 9.4 Flow-sensitive refinement and bounds checks: 2 — the core rule is genuinely useful and the loop
  example is right, but the "any call" wording collides with the example, the unsigned-index argument
  is compressed into one paragraph, and the four-row ladder introduces three systems it never explains.
- 9.5 Regions and a per-turn arena: 4 — the two safety rules are crisp, the reset-on-return trick is
  memorable, and the persistence table gives an honest default; "state record" carries weight before
  it is defined.
- 9.6 Linear handles and typestate: 3 — the "exactly once, not the same way" rule and the specification
  check are clear, but counting "storing it in the state" as consuming a linear value sits badly with
  "must be used exactly once", and the motivating obligations are paraphrased rather than quoted.
- 9.7 Effects as capabilities: 4 — effect = union of callee effects, computable in the existing pass,
  compared with the manifest both ways; a reader can restate this. The capability aside is dense.
- 9.8 Two directions that should wait: 3 — the two "no" decisions are justified, but this is a survey
  of four named type systems (sized, amortized, Hume levels, gradual) none of which the reader can
  evaluate from the text.
- 9.9 Matters that are not type theory: 4 — a clear, short list of omissions with one stated ordering
  constraint ("must come with the explicit cycle check"); the `f64` paragraph is compressed.
- 9.10 Summary and order: 4 — the table matches the sections, gives both cost columns and an explicit
  order, and names the single dependency; "compiler effort: small/medium" is the only unanchored column.
- 9.11 Key points: 5 — the seven bullets restate the article accurately and could be used as the
  article's abstract.

## Questions that the article did not let me answer

- Question 1, second half ("say what replacing them by an enumeration would change in the generated
  code"): answerable only by repeating the article's assertion. No before/after output is shown, and
  the assertion is in tension with the 14/15 values it is meant to replace, so I answered with the
  claim plus "Confidence: 3" rather than with a fact I could check.
- Question 3 ("the three kinds of event that discard it"): the first two are stated plainly, but the
  third ("any call") is ambiguous exactly where the example depends on it — whether `text.charCodeAt`
  counts as the call that kills the fact. I answered with the article's wording and flagged the doubt.
- Question 5 ("say what a program must do with data that has to outlive the turn") is answerable in
  outline ("copy it into storage that the application owns for its whole life"), but the article never
  introduces that storage or its type, so I could not say how a reader would actually write it.
- Questions 2, 4 and 6 are answerable from the text as it stands.

## One thing to add and one thing to cut

**Add:** a worked *before/after* for one cost claim — the bounds-check listing (the 20 instructions of
`countUnit` reduced to the four, and the seven-instruction loop becoming nine) and, right beside it, the
four instructions of an arena allocation. Costs are the article's whole argument ("types that pay for
themselves"), and the numbers 20/4/2/7/9 and "about four" are the only things in the article a reader
cannot check or reproduce; one small listing would convert them from assertions into evidence and would
also settle the arithmetic slip where "about four" is spelled out as three things.

**Cut:** the four-row ladder table in section 9.4 (guard facts / dependent types / liquid types / ABCD)
and the paragraph that follows it, in favour of one sentence saying that stronger versions exist and are
workstation-sized. The table introduces four terms that neither the article nor the glossary defines
(and one, ABCD, that is defined only in another article), the sentence introducing it contradicts the
article's own criterion 1, and it interrupts the one section whose single-pass rule the reader actually
needs to carry away.
