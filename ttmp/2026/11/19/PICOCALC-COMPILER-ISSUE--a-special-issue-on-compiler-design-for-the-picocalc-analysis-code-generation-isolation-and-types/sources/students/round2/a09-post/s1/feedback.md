# Feedback on "9. Types That Pay for Themselves"

## Passages I had to read twice

1. "In hand-written code, where the length is already in a register, it is two; the hand-written loop of Article 5 has seven instructions without the check and would have nine with it." (9.4, Observation)
   The three numbers — "about four", "two", "seven ... nine" — are all about the same check, but each is measured in a different setting (today's backend, the improved backend, hand-written code). I had to reconstruct that ordering myself; the sentence does not say which setting is which.

2. "Discarding the fact at every call is deliberately cautious. Deciding which calls could change a length would need knowledge of the called function, which the first criterion rules out." (9.4, Mechanism)
   It was not clear to me why "knowledge of the called function" is unavailable, when section 9.7 says the compiler does know each callee's effect set from the declared signatures. Either the criterion is weaker than I think, or the two sections are using "knowledge of a callee" in two senses. Neither is spelled out.

3. "A signed guard `at < text.length` says nothing about `at >= 0`. The clean solution is a type: an index type, written here as `index`, whose values are unsigned 32-bit integers." (9.4)
   "Clean solution is a type" arrives before I am told what happens if you use the type; I had to read the rest of the paragraph twice to see that the point is that the guard then *is* the bounds check.

4. "The language already has a memory discipline, although it is nowhere written down." (9.5)
   The two lifetimes that follow (turn and application) are stated as a fact about the current language, but no example is given of code obeying it, so I could only take the claim on trust.

5. "The order follows value for effort, with one dependency: the arena's rule about waits presupposes the `await` of Article 8." (9.10)
   The table lists the arena at order 5, below effects, yet the arena is called "medium" effort while linear handles are "medium to large" and come later. The stated ordering principle ("value for effort") does not visibly produce this sequence; I could not reproduce the ranking.

## Terms used before they were explained, or never explained

- **Static TypeScript** (9.5 table, "CJI's runtime; Static TypeScript") — never explained, not in the glossary.
- **ABCD** (9.4 table, "ABCD, the bounds-check elimination algorithm described in Article 4") — the acronym is never expanded, and the glossary has no entry; a cross-reference is not a definition.
- **WIT** (References, "the explainer and WIT documentation") — never explained.
- **substructural** (9.6, "the theory of such substructural type systems") — named, given a chapter reference, but never defined in the article.
- **least privilege** (9.7, "contrary to the principle of least privilege") — invoked as a principle without statement; only "capability" is glossed in the same sentence.
- **arena** (9.5 heading) — used in the section title before the definition in Mechanism; the glossary entry is a reader's only help at that point.
- **typestate** (9.6 heading) — same pattern: in the title before the definition.
- **dimension types / units of measure** (9.3) — introduced with a one-clause gloss that mentions "products and quotients of units" but never shows what multiplying units means here, though the article immediately says the Editor never multiplies them.
- **wrapped rows** (9.3) — one of the four coordinate systems, never defined; I inferred it means display lines after wrapping.
- **nucleus** and **turn** are used in 9.5 but are glossary terms (Articles 1), so they are fine.
- **Agenda** and **Editor** — applications referred to throughout; the glossary has no entry for either and the article only describes them in passing ("Agenda's sorted and grouped task list").

## Claims I could not verify from the article itself

- "The native Editor contains 404 trap instructions (counted by Experiment 1 of Article 2), and its source has 85 calls of `charCodeAt` alone." (9.4) — no counting method, no source listing, no range of what was counted; both figures rest entirely on a different article.
- "The check is expensive in today's backend, which emits 20 instructions for it in the listing of `countUnit` ... it would be about four: load the length, compare and branch, and the trap itself." (9.4) — the listing of `countUnit` is not reproduced, and "about four" is not derived from anything shown; I cannot count the instructions myself.
- "The hand-written loop of Article 5 has seven instructions without the check and would have nine with it." (9.4) — the loop is not shown.
- "the 28 functions of its reactor, each called by name" (9.7) — the 28 functions are never listed, so I cannot check the count or the claim that usage is "visible in its source".
- "Agenda's sorted and grouped task list, which in the current port is C code inside Agenda's reactor" (9.5) — no pointer to that code, so the motivating observation cannot be checked.
- "The project's notes on that exchange read as a list of obligations: accepting a new grant revokes the old one; a refusal, a timeout or a failure to send revokes the pending one; Editor releases the previous file only after the new one has been read successfully." (9.6) — the notes are quoted in paraphrase only; I cannot see whether these are the exact obligations or whether anything was left out.
- "The language thus already has two [lifetimes]" (9.5) — stated as fact about existing code with no citation or example.
- "For a world with a 768 KiB limit" (9.5) — the figure has no source in this article, and it is not clear whether it is one world's limit or a typical one.
- "the compiler lists every `match` that must be updated" (9.2) — claimed as a "practical consequence"; no compiler in the article implements it, so this is a promise rather than an observation.
- "Allocation checks that enough room remains and advances the pointer, about four instructions." (9.5) — the four instructions are not written out, unlike the bounds-check count in 9.4.
- "compared with the manifest in both directions" (9.7) — the manifest's format for claims is not shown, so I cannot tell how a claim maps onto a reactor function.
- "We measured ... could run up to 105 times slower" (9.8) — the article itself concedes "The measurement is of another language"; I accept this as a citation, but it is evidence only for gradual typing generally, not for this system.

## Section scores

- **9.1 The criterion** — 5. Three numbered conditions, short, and each is used later in the article.
- **9.2 Enumerations** — 5. The example shows the whole mechanism, and the cost is stated in one line.
- **9.3 Distinct integer types** — 4. Clear, and the emoji example is a good check (`a🙂b` really is 6/4/3), but the four coordinate systems are never quite tied to the `type` declarations shown.
- **9.4 Flow-sensitive refinement** — 2. The mechanism is clear, but the instruction counts (20, ~4, 2, 7, 9) come from three settings at once and the article never says which figure belongs where; this is where I got lost.
- **9.5 Regions and a per-turn arena** — 4. The two local rules are crisply stated; the unverifiable claim that the language "already has" two lifetimes is what cost it a point.
- **9.6 Linear handles and typestate** — 3. The mechanism is well explained, but more vocabulary is dropped per paragraph here than anywhere else (linear, typestate, owned/borrowed, substructural, session types), and the motivating notes are only paraphrased.
- **9.7 Effects as capabilities** — 4. The "may call reactor function *f*" framing is easy to follow; only the unlisted 28 functions and the unexplained manifest format weakened it.
- **9.8 Two directions that should wait** — 4. Clear as a survey; the Hume quotation is doing more argumentative work than the text explains.
- **9.9 Matters that are not type theory** — 5. Short, concrete, and it does not pretend to be type theory.
- **9.10 Summary and order** — 3. The table is useful, but the "one dependency" does not explain the actual ordering, and I could not reproduce it from the "value for effort" principle.
- **9.11 Key points** — 5. A faithful one-line restatement per section.

## Questions that the article did not let me answer

All six quiz questions can be answered from the text. Two are only barely answerable:

- **Question 3** asks for "the three kinds of event that discard it". The text says the fact lasts "until `i` or `s` is assigned or any call is made", which is two variables plus calls; I had to decide whether the article means three *kinds* or three *items*, since assigning either variable could be counted as one kind ("assignment") or two. The answer is recoverable but the phrasing is not pinned down.
- **Question 2** asks for the four coordinate systems. "Wrapped rows on the display" is named but never explained anywhere in the article or glossary, so I answered it by naming the phrase rather than by understanding the system.

No question was unanswerable.

## One thing to add and one thing to cut

**Add:** one worked instruction count for the bounds check, in a single setting, laid out instruction by instruction — the thirteen-ish lines of the loop in 9.4 with the check in place and then without it. Section 9.4 turns entirely on the claim that the check costs a measurable amount, and it is the only section whose numbers I could not follow.

**Cut:** the table of the "ladder" of more powerful approaches in 9.4 (dependent types, liquid types, ABCD). The text says in the next paragraph that three of the four rungs "belong on a workstation", so the table is a survey of things the article explicitly will not build; it invites the reader to compare designs it then dismisses, and it is where the unexplained "ABCD" acronym is dropped.
