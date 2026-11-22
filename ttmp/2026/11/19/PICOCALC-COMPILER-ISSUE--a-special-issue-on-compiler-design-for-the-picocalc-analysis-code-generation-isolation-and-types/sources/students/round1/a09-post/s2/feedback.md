# Feedback on "9. Types That Pay for Themselves"

## Passages I had to read twice

1. "The fact does not need to survive the loop's back-edge, because the loop condition establishes it again on every iteration." I had to reconcile this with the rule in the same paragraph that the fact dies on assignment: the body assigns `at = at + 1`, so the fact expires just before the back-edge, yet the sentence talks about it not surviving. It became clear only when I worked out that the fact used inside the body is created at the top of the *same* iteration, not inherited from the previous one.

2. "For a variable of that type, the guard is itself an unsigned comparison and implies the whole check." This is doing two steps in one clause and I had to reconstruct them: the variable being unsigned only matters if `text.length` is also compared as unsigned, and I am still unsure whether the article means the guard's typing changes or only the operands' types change. A one-line example of the resulting comparison in section 9.4 would have removed the guesswork.

3. "**Cost.** Negative at run time: each removed check saves about four instructions under the improved backend of Article 5 and one trap site." Section 9.4 earlier says the same check would take two or three instructions ("seven instructions without the check and would have nine or ten with it"). Adding a check costs 2–3, removing one saves about 4; either a number is wrong or the "improved backend" is a different baseline. I read the passage three times and still cannot reconcile it.

4. "The language already has a memory discipline, although it is nowhere written down." A claim presented as the premise of the whole section, with no code, no type declaration and no artifact I can look at. If the discipline is real it should be shown in the state record and a handler signature; if it is only a convention, the section's "observed" status under criterion 3 is weaker than it sounds.

5. "| ABCD (Article 4) | Checks made redundant by any chain of comparisons | An optimizer on extended SSA |" Two unexplained terms in one row: the acronym ABCD is never expanded, and "extended SSA" is assumed known. I understood the row only from its general shape, not from the words.

6. "A world that calls the file-reading function while holding no file claim and receiving no handle is suspect." "Suspect" is doing a lot of work: I cannot tell whether this is a compile error, a warning, or a report a human reads. The mechanism section promised a check, so I expected a verdict.

## Terms used before they were explained, or never explained

- **ABCD** — used in the 9.4 ladder table, never expanded; presumably "array bounds check elimination" but the article does not say.
- **SSA / extended SSA** — used in the same table as if known.
- **trap instruction** — the 404 traps of section 9.4 are central to the argument and a trap is never defined here (Article 7 is the assumed source).
- **nucleus** — "When the handler returns, the nucleus resets the pointer"; the nucleus is never defined.
- **reactor**, **world**, **manifest**, **claim** — the whole of section 9.7 rests on them; "handle" is defined, these are not.
- **native Editor** — "The native Editor contains 404 trap instructions"; native as opposed to what (the typed version? the JavaScript version?) is not stated.
- **basic plane** — "characters outside the basic plane" is the crux of the distinct-type argument and the term is unexplained.
- **first-order functions** — used in 9.8 ("first-order functions without recursion") without definition.
- **untyped value type** — 9.8's closing recommendation ("The typed language should not acquire an untyped value type") uses a term that never appears elsewhere.
- **substructural** — named and handed to Walker; not explained even in one clause.
- **capability** — "capability systems rest [Dennis & Van Horn 1966; Miller 2006]"; claims and authority are used throughout but "capability" is never defined.
- **value being "live across a wait"** — "live" is used as if defined, in both section 9.5 and Article 8.
- **Perceus, Cyclone, Céu, Embassy, nesC, CJI's runtime, Static TypeScript, Flux** — cited as precedents without a clause saying what each is.
- **one pass** — the criterion in 9.1 ("in one pass") is never given as a concrete restriction, so I cannot test claims like "one table of facts in the compiler".

## Claims I could not verify from the article itself

1. "The native Editor contains 404 trap instructions, and its source has 85 calls of `charCodeAt` alone." No method: was this counted from a compiled artifact, and which build? I can only take the numbers on trust.
2. "the hand-written loop of Article 5 has seven instructions without the check and would have nine or ten with it." No instruction listing is shown, and the "nine or ten" range is unexplained — a check either costs two instructions or three, presumably depending on the backend. Without the listing the reader cannot reproduce either count.
3. "each removed check saves about four instructions under the improved backend of Article 5." Contradicts item 2 as noted above; the two numbers need one worked listing to be believable together.
4. "The file browser's key handler returns 14 to mean 'delete' and 15 to mean 'submit'. The Editor's event handler tests `event.kind === 4`." No source is quoted, so the reader cannot see how bad the situation is; three quoted lines would settle it.
5. "It is not enough for Agenda's sorted and grouped task list, which is why that logic still lives in C." A causal claim about a design decision with no evidence; a sentence saying what the C module does and what shape the data has would be enough.
6. "Each obligation is enforced by careful code and a test." No file or test name; the section's authority rests on the reader believing the obligations exist, and I cannot check them.
7. "The code of a typed world reaches the system only through the 28 reactor functions." The count is asserted; the list is not shown, so the effect-set proposal cannot be sanity-checked for size.
8. "Allocation advances the pointer and is two or three instructions." No listing, and nothing about alignment or object size, which is usually where the extra instructions come from.
9. "This is the cheapest item in the article and removes the most frequent source of confusion in the existing code." "Most frequent" is a measurement claim (criterion 3 asks for observations) with no count of confusions.
10. "For a world with a 768 KiB limit, a bound known at compile time is a benefit and fixed capacity should be the default." The recommendation is plausible but the article does not show an Agenda or calculator data structure that fits in a fixed capacity.
11. "when a new phase is added, the compiler lists every `match` that must be updated." True of the mechanism by construction, but the article never shows a `match` that would have to be *edited*, as opposed to merely satisfying the check by grouping names, which the example itself does (`LineSuffix, LaterLines, EarlierLines, LinePrefix:`).

## Section scores

- **9.1 The criterion** — 5. Three conditions, stated as a checklist that every later section visibly calls back to.
- **9.2 Enumerations** — 5. Observation, mechanism, cost, all short; the example is the actual code being replaced.
- **9.3 Distinct integer types** — 4. Clear, but "basic plane" is unexplained and the `a🙂b` byte/code-unit arithmetic is asserted rather than counted out.
- **9.4 Flow-sensitive refinement and bounds checks** — 2. The core rule is stated well, but the instruction counts disagree with each other and the unsigned-index fix is compressed to the point of ambiguity.
- **9.5 Regions and a per-turn arena** — 3. The two rules are excellent and checkable; the opening claim about an unwritten memory discipline is evidence-free and "nucleus" is undefined.
- **9.6 Linear handles and typestate** — 3. Linear types are explained well; "both branches must have consumed the same handles" is ambiguous, and the section fans out into WebAssembly handles, substructural theory and session types without saying what the implementation needs.
- **9.7 Effects as capabilities** — 4. The union-per-call computation is crisp and clearly local; the missing list of 28 functions and the vague word "suspect" leave the payoff undefined.
- **9.8 Two directions that should wait** — 2. Two unrelated topics, dense with unexplained names (Hume, sized types, gradual typing), and the strongest number in the paragraph (105×) comes from elsewhere.
- **9.9 Matters that are not type theory** — 4. Refreshingly concrete list; `f64` in software is well motivated, though the section is short enough to feel like an appendix.
- **9.10 Summary and order** — 5. The table is the most useful page in the article; effort and order columns make the trade-off visible.
- **9.11 Key points** — 5. Accurate restatement, each bullet traceable to a section.
- **9.12 Check your understanding** — 5. All six questions are answerable from the text, which is the test that matters; see the caveat under the next heading.

## Questions that the article did not let me answer

All six could be answered from the text, but two answered only in outline:

- **Question 4** — the intended answer ("the guard becomes an unsigned comparison") depends on a sentence I could not fully parse; I answered it by reasoning about wrap-around rather than by following the article's own wording. A displayed comparison, e.g. what the guard looks like with both operands unsigned, is the missing step.
- **Question 6** — "both branches must have consumed the same handles" does not say whether the branches must reach the *same* disposition (both revoke, or both store) or merely both consume the grant exactly once, in possibly different ways. The list of permitted operations suggests the second reading, the phrase "the same handles" suggests the first. I answered with the second and lost confidence because of it.

Everything else — the exhaustiveness list, `Unit`/`Point`, the loop fact and its invalidation, the two arena rules — is stated plainly enough that I could point at the sentence I was using.

## One thing to add and one thing to cut

**Add:** one worked listing for the bounds check — the loop of section 9.4 compiled with and without the check, in the style of Article 5's seven instructions — so that "seven", "nine or ten", "saves about four" and "two or three instructions per object" all become checkable in one place. This is the article's only self-contradiction and the single addition that would fix it.

**Cut:** the second half of section 9.8, the gradual-typing paragraph and the Hume/sized-types paragraph before it. Both are interesting, neither starts from an observation in the repository, neither proposes anything to build, and together they are longer than section 9.5, which proposes a memory model. A two-sentence note that resource bounds and gradual typing are out of scope would keep the point and free the space for the listing above.
