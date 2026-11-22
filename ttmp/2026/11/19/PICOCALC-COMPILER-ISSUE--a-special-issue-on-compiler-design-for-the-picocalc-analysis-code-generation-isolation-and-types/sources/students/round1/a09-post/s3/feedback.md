# Reader feedback: "9. Types That Pay for Themselves"

## Passages I had to read twice

1. "The compiler must be able to check a function from its own text and the declarations it mentions,
   in one pass (Article 4)." — I could not tell whether "one pass" is a hard requirement (the
   implementation is single-pass, so nothing may need iteration) or a shorthand for "no whole-program
   knowledge". §9.4 then introduces a table of facts "cleared at assignments and calls", which sounds
   like a second analysis riding along, and §9.7 says the effect computation happens "during the
   existing single pass". If there is exactly one pass, I want to know where in it these tables live;
   if there may be several, criterion 1 should say so.

2. "*When the compiler enters a block guarded by the condition `i < s.length`, it records that fact;
   the fact remains valid until `i` or `s` is assigned or a call is made that could change the length;
   while it is valid, an access `s.charCodeAt(i)` needs no upper-bound check.*" — the clause "a call
   that could change the length" is the one that decides the whole feature, and it is the vaguest
   part of the sentence. Either every call kills the fact (cheap, safe, and it would gut the value in
   scanning loops that call helpers) or the compiler needs to know which callees can write to `s`,
   which needs a summary per function — and summaries are exactly the kind of whole-program fact
   criterion 1 claims to exclude. As written I cannot tell which reading is meant.

3. "The second becomes attractive later, because a signature that states an index is in range moves
   the check from the callee to the one caller that established it." — "the one caller" reads as if
   there is exactly one caller in each case, and I think what is meant is "the caller that
   established it". I had to re-read to make sure it was not a claim about counting call sites.

4. "A path that forgets is a compile error. With structured control flow the check is a single pass:
   after an `if`, both branches must have consumed the same handles." — "the same handles" is
   ambiguous between "each branch consumed that handle exactly once" and "the two branches consumed
   identical sets, so their residual sets agree". The second reading is the one that generalises, and
   the quiz question 6 rests on it, but the text does not say it plainly.

5. "**Cost.** Negative at run time: each removed check saves about four instructions…" — the sign
   convention took me a moment. §9.1's criterion says a feature must "cost nothing at run time, or
   remove a run-time cost", and then the costs are reported as "none" and "negative", so "negative"
   means "saves". A reader skimming the summary table (§9.10) sees "negative" in the run-time cost
   column with no gloss.

6. "The Hume language was designed around the trade-off involved. It is a stack of language levels,
   from one with no functions at all up to full recursion, in which each level 'adds expressibility
   to the expression semantics, but either loses some desirable property or increases the technical
   difficulty of providing formal correctness/cost models'." — "the trade-off involved" has no clear
   antecedent (which trade-off: bounded loops versus expressiveness?), and the quoted sentence is
   abstract enough that I could not say what any specific level buys or costs.

## Terms used before they were explained, or never explained

- **world** — used from §9.1's context onward (manifest, worlds, typed world) as if defined; never explained here.
- **reactor** and **the 28 reactor functions** — §9.5 and §9.7 rely on it; no definition, no list, no example signature.
- **nucleus** — "when the handler returns, the nucleus resets the pointer" (§9.5); never explained or mentioned again.
- **manifest** — "the manifest gives each world its claims" (§9.7); never shown, and its format is not described.
- **turn / turn budget** — §9.5's "per-turn arena" and §9.8's "turn budget" both use "turn" as a technical term that this article only implies.
- **trap instruction** — "the native Editor contains 404 trap instructions" (§9.4); the mechanism is assumed from Article 7.
- **ABCD** — "ABCD (Article 4)" in the §9.4 ladder; the acronym is never expanded and the algorithm is not described.
- **SSA** — "an optimizer on extended SSA" (§9.4); not expanded or explained.
- **capability system** — "capability systems" and "the principle of least privilege" in §9.7 presuppose a definition of "capability" that is never given, even though the section is about authority.
- **basic plane** — "characters outside the basic plane" (§9.3); Unicode terminology used without expansion.
- **wrapped rows** — listed as one of the four coordinate systems in §9.3 without saying what wrapping means here.
- **fuel counter** — "the fuel counter of Article 7 gives the guarantee at run time" (§9.8); never explained.
- **first-order functions** — "first-order functions without recursion" (§9.8); the term is used to place the language on the Hume ladder and does the argument's work without a definition.
- **session types**, **sized types**, **amortized analysis**, **gradual typing** — each is one clause plus a citation; the reader is expected to know them.

## Claims I could not verify from the article itself

1. "The native Editor contains 404 trap instructions, and its source has 85 calls of `charCodeAt`
   alone." — no file, function or command is named, so neither count can be reproduced. I also do not
   know whether traps and `charCodeAt` calls correspond one-to-one, which is what the motivation for
   removing checks depends on.
2. "The hand-written loop of Article 5 has seven instructions without the check and would have nine
   or ten with it." — no listing is given for either version, and "nine or ten" is a range, so the
   saving per check cannot be pinned down. The same numbers later become "about four instructions"
   in §9.4's **Cost**, which is not obviously consistent with a two-to-three instruction delta.
3. "The file browser's key handler returns 14 to mean 'delete' and 15 to mean 'submit'. The Editor's
   event handler tests `event.kind === 4`." — no source reference; I have to accept the defect
   exists. The `state.findPhase` case is at least self-consistent (four phase names plus `NotFound`
   and `Found`, matching "values below 4 are phases"), but nothing shows the field is still an
   untyped integer.
4. "A few dozen lines in the compiler." (§9.2) and "medium" / "small" / "medium to large" in the
   §9.10 effort column — no unit is defined for compiler effort, so the ordering in the last column
   rests on the author's judgement alone. Nothing tells me what "small" measures: lines, days, or
   risk.
5. "Agenda's sorted and grouped task list, which is why that logic still lives in C" (§9.5) — a
   causal claim about a decision that is not documented here.
6. "When the handler returns, the nucleus resets the pointer. Nothing is ever freed individually."
   — no statement of who is allowed to hold an arena pointer, or of what happens if a handler stores
   one in a local that outlives its block; the safety argument is the two rules, and the rules'
   sufficiency is asserted, not argued.
7. "The whole computation is one union per call during the existing single pass." (§9.7) — this
   depends on typed functions being defined before they are called *and* on an acyclic call graph
   (both delegated to Article 7), so within this article the claim is conditional and unverifiable.
8. "could run up to 105 times slower than either extreme" (§9.8) — a citation, not an argument; I
   cannot check that the measurement applies to a system whose only boundary is a world message.
9. "the processor has hardware support only for single precision" (§9.9) — an assertion about the
   target hardware that is central to the `f64` recommendation and is not supported here.
10. "For a world with a 768 KiB limit" (§9.5) — where the number comes from is not stated.
11. §9.10's order "follows value for effort, with one dependency: the arena's rule about waits
    presupposes the `await` of Article 8" — but linear handles are ordered 6 while their whole
    motivating example (lending a file between worlds, revocation on timeout) is a protocol story
    that seems to need the arena and effects first. The stated single dependency does not explain the
    whole order.

## Section scores

- **§9.1 The criterion** — 4. Three conditions stated plainly and numbered; only the loose
  "costs nothing at run time, or removes a run-time cost" wording, which is later reported as
  "negative cost", cost it a point.
- **§9.2 Enumerations** — 5. The clearest section: an observed defect, a six-line mechanism, a
  named and standardised check, an honest cost, and the payoff (the compiler lists the sites).
- **§9.3 Distinct integer types** — 3. The defect is convincing and the `a🙂b` example does real
  work, but the code shows `columnOf` with a `{ ... }` body and never shows the conversion function
  or the error you actually get, so the mechanism stays at the level of "trust me".
- **§9.4 Flow-sensitive refinement** — 3. The one-sentence rule and the ladder table are good; the
  "call that could change the length" clause and the tension with criterion 1 leave the central
  soundness question open.
- **§9.5 Regions and arena** — 3. The move from "the language already has two regions, although it is
  nowhere written down" to the arena is a nice argument, but the persistence table lists precedents
  without saying what each costs, and the rules' sufficiency is asserted.
- **§9.6 Linear handles and typestate** — 3. The obligation list from the project's own notes is the
  best motivation in the article, and `File<Opening>`/`File<Ready>` is concrete; the "same handles"
  sentence and the vocabulary paragraph (owned/borrowed, Walker, session types) blur the main line.
- **§9.7 Effects as capabilities** — 4. Short, local, and tied to a real artefact (28 functions,
  the manifest); the both-directions comparison is described but never worked on an example.
- **§9.8 Two directions that should wait** — 2. The densest section: sized types, amortized
  analysis, Hume's level stack, Céu, fuel counters and gradual typing in four paragraphs, most of it
  carried by citations. I could not reconstruct the Hume argument from the text.
- **§9.9 Matters that are not type theory** — 3. A useful honesty paragraph; the missing features are
  listed without saying why each is cheap until the floating-point case, which turns on an
  unverified hardware claim.
- **§9.10 Summary and order** — 4. The table is the most useful page in the article and I could
  reproduce the argument from it; the effort labels and the ordering rationale are underspecified.
- **§9.11 Key points** — 5. Accurate, checks out against the sections, and the last bullet is the
  clearest statement of the boundary rule anywhere in the article.
- **§9.12 Check your understanding** — 4. Five of six questions are answerable from the text; Q6
  depends on a sentence the text never disambiguates (see above).

## Questions that the article did not let me answer

- **Q6 (linear `Grant` across an `if`).** Answerable in outline — each path must consume the grant
  exactly once — but not fully: the text's phrase "both branches must have consumed the same
  handles" does not say what happens when one branch stores the grant in the state and the other
  revokes it, and that is the interesting case. A single worked example with one accepted and one
  rejected function would settle it.
- **Q3 (where the guard fact becomes invalid)** is only *half* answerable as intended. I can quote
  the three invalidating events, but "a call that could change the length" is undefined, so I cannot
  say whether a call to an unrelated helper invalidates the fact. The section never states whether
  the compiler keeps per-function summaries of which parameters' lengths may be written.
- **Q5** is fully answerable, but only by combining §9.5's two bullets with the sentence about
  copying into application-owned storage; the article never names that storage as "the
  life-of-application region" in the same place, so the answer is an inference, not a quote.

## One thing to add and one thing to cut

**Add:** one complete worked example per mechanism is too much to ask, but the article never once
shows a compile error. Adding a short before/after block for §9.3 — the offending call, the exact
diagnostic, and the two-line conversion function that fixes it — would convert "the checker gains
one rule" into something a reader can picture, and it is the section where the mechanism is currently
thinnest.

**Cut:** the Hume passage in §9.8 ("It is a stack of language levels… adds expressibility… loses some
desirable property"). The section's actual point — loops prevent a static time bound, so resource
bounds in types are a research direction and the fuel counter covers it at run time — survives
without the quoted sentence, and the quotation is the least checkable text in the article.
