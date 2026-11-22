# Feedback on "9. Types That Pay for Themselves"

## Passages I had to read twice

- "**Cost.** Negative at run time: each removed check saves about four instructions under the improved backend of Article 5 and one trap site." (§9.4) — This contradicts the earlier sentence in the same section, "the hand-written loop of Article 5 has seven instructions without the check and would have nine or ten with it", which implies two or three instructions per check. I could not tell whether "four" includes the trap set-up, or whether the two numbers describe different loops. Also "negative at run time" is a phrase I only decoded on the second pass (it means a saving).
- "The fact does not need to survive the loop's back-edge, because the loop condition establishes it again on every iteration." (§9.4) — Clear only after I re-derived it: the compiler wants a straight-line justification, not a loop invariant. The sentence does not say *when* the fact is dropped (at the assignment `at = at + 1`), so I had to supply that myself.
- "The clean solution is a type: an index type whose values are unsigned by definition. For a variable of that type, the guard is itself an unsigned comparison and implies the whole check." (§9.4) — I had to read this three times. The article never says how such a type is declared, or what happens when that variable is also used as an ordinary `i32` (e.g. `at = at + 1`, comparison with a length); the reader is left to assume the arithmetic story is the same as for distinct types in §9.3.
- "A reference to a buffer is valid for one event and must be obtained again in the next. The state record survives and may hold only scalars. In other words, there are two **regions** with different lifetimes: the current turn, and the life of the application." (§9.5) — The leap from "two existing restrictions" to "therefore there are two regions" is asserted, not argued; and "event", "turn", "current turn" are used interchangeably without ever being equated in a sentence.
- "There is a ladder of more powerful versions, and it is useful to know where the proposal stands on it." followed by a four-row table (§9.4) — The table's last row, "ABCD (Article 4)", is unintelligible here: the acronym is never expanded and the "extended SSA" it is said to work on is never explained.
- "The last must come with the explicit cycle check described in Article 7, because the stack bound depends on it." (§9.9) — I take it to mean that allowing calls to functions defined later is still not recursion, and the cycle check is what keeps it so, but the sentence does not say what would go wrong without the check.

## Terms used before they were explained, or never explained

- **world** — the unit that has a manifest, claims, a state record and 28 reactor functions; never defined in this article.
- **the reactor** — referred to as the only way a typed world reaches the system; never described.
- **the nucleus** — appears once, in "the nucleus resets the pointer" (§9.5), and is never named again or defined.
- **reactor functions** — "the 28 reactor functions, each called by name" (§9.7); no list, no examples.
- **manifest** — mentioned in §9.7 and §9.10 as something that "gives each world its claims"; its contents are never described.
- **claims** — used as if self-evident ("holding no file claim", "holds a claim it never uses"); never defined, though capability systems are cited later.
- **trap / trap instruction / trap site** — never defined; I inferred "a bounds-check trap is a machine instruction that aborts".
- **ABCD** and **extended SSA** — in the §9.4 table, never expanded or explained.
- **nested data** — "for enumerations without nested data the check is a comparison of two sets" (§9.2); the alternative case is never described.
- **turn budget / fuel counter / stack bound** — §9.8 and §9.9 rely on these as if known; only "the fuel counter of Article 7 gives the guarantee at run time" gestures at them.
- **first-order functions** — §9.8, "first-order functions without recursion, plus loops"; not explained.
- **distinct type / dimension types** — explained, but the *keyword* `distinct` appears in code before any statement that it is a keyword.
- **single pass / local check** — §9.1 says "in one pass (Article 4)"; what counts as "one pass" is only checked by reading Article 4.
- **768 KiB limit** — §9.5; no statement of where this bound comes from.
- **graded/gradual boundary** — §9.8 assumes the reader knows where the typed/untyped boundary sits ("it is in the right place"); only the last sentence tells us it is the message decode.

## Claims I could not verify from the article itself

- "The native Editor contains 404 trap instructions, and its source has 85 calls of `charCodeAt` alone." (§9.4) — No file, command, or listing is shown. I cannot check either number or see which build they describe.
- "In scanning loops the check is a large share of the loop: the hand-written loop of Article 5 has seven instructions without the check and would have nine or ten with it." (§9.4) — No instruction listing is given, and the figures do not square with the later "about four instructions" saving. The arithmetic should be shown.
- "The file browser's key handler returns 14 to mean 'delete' and 15 to mean 'submit'. The Editor's event handler tests `event.kind === 4`. The search routine's progress is `state.findPhase` ..." (§9.2) — Three concrete observations with no file or line reference, so the reader takes them on trust.
- "Allocation advances the pointer and is two or three instructions." (§9.5) — No code or derivation; it is unclear whether this includes zeroing, alignment, or an overflow check against the arena end.
- "A position in the Editor's document can be expressed in four coordinate systems: bytes of UTF-8 in the file, UTF-16 code units in memory, code points for the cursor column, and wrapped rows on the display." (§9.3) — Plausible and consistent with the given example, but no code is shown proving all four are `i32` in the source.
- "Agenda can lend its notes file to Editor. The project's notes on that exchange read as a list of obligations ..." (§9.6) — The obligations are paraphrased; the notes themselves, and the code that enforces each, are not shown.
- "This system already has a boundary between typed and untyped code, and it is in the right place. ... a message is checked once when it is decoded." (§9.8) — No evidence, code, or measurement is offered for "in the right place" or "checked once".
- "the processor has hardware support only for single precision" (§9.9) — The processor is never named, so I cannot check it.
- "A few dozen lines in the compiler" (§9.2), "small", "medium", "medium to large" (tables in §9.4 and §9.10) — Effort estimates with no basis given; I cannot tell what a "small" item means relative to a "medium" one.
- "Measurements on a mature implementation found that programs in which some modules are typed and others are not could run up to 105 times slower" (§9.8) — Cited only; nothing in this article lets me see how that measurement was made.

Claims I *could* verify: the worked example "The string `a🙂b` is six bytes, four code units and three code points" checks out (`a` 1 byte + `🙂` 4 bytes + `b` 1 byte = 6; 1 + 2 + 1 = 4 code units; 3 code points). This is the only place where the article shows its arithmetic, and it was the clearest paragraph in the piece.

## Section scores

- **9.1 The criterion** — 5. Three numbered conditions, each with a one-line justification and a forward pointer; nothing to decode.
- **9.2 Enumerations with exhaustive matching** — 5. The `FindPhase` example is complete enough to run mentally, and the two added checks are stated plainly.
- **9.3 Distinct integer types** — 4. The example and the cost are clear, but "the reactor's function that maps a code-point count to a code-unit offset" and the wrapped-rows coordinate are never shown.
- **9.4 Flow-sensitive refinement and bounds checks** — 3. The core rule is well stated in one sentence, but the two instruction counts disagree, and the lower-bound/unsigned argument and the four-row ladder both assume background I did not have.
- **9.5 Regions and a per-turn arena** — 3. The two rules and the fixed-capacity recommendation land, but the derivation of the two regions is asserted, "nucleus" appears from nowhere, and three persistence designs are disposed of in one table.
- **9.6 Linear handles and typestate** — 3. Linear types and typestate are each explained, but four vocabularies (Wadler, Strom & Yemini, Component Model borrowed/owned, session types) arrive in two paragraphs and the `File<Opening>` example stops before showing what the checker does with it.
- **9.7 Effects as capabilities** — 4. Clear mechanism, and the union-per-call computation is convincing because it leans on facts already given (acyclic call graph, definitions before uses); "manifest" and "claims" are the weak spots.
- **9.8 Two directions that should wait** — 2. This is a citation stack: Hume's level description is quoted but not illustrated, and neither direction is given an example.
- **9.9 Matters that are not type theory** — 4. Short and honest, but the `f64`/`i32` separation and the cycle check are stated in one clause each.
- **9.10 Summary and order** — 4. The table is the most useful page of the article; "small/medium" effort is undefined and the 9.8 items are silently absent.
- **9.11 Key points** — 5. A faithful condensation; each bullet matches its section.
- **9.12 Check your understanding** — 4. Six questions that map onto the sections, though Q4 asks for reasoning the section only partly supplies (see below).

## Questions that the article did not let me answer

- **Q4 (partly unanswerable).** I could state *why* a signed guard is insufficient — the article says so directly — but not *how* an unsigned index type resolves it in practice: §9.4 never says how such a type is declared, whether `at = at + 1` stays legal, or what a comparison against `text.length` means when the two have different types. My answer leans on §9.3's distinct types rather than on anything in §9.4.
- **Q3 (mostly answerable, one gap).** The article states where the fact comes from and why the back-edge is unproblematic, but "where it becomes invalid" is only given as "until `i` or `s` is assigned or a call is made that could change the length". It does not say what "could change the length" means operationally — any call, or only calls that receive the string? I answered with the article's own wording and marked my confidence 4.
- **Q6 (answerable but thin).** "After an `if`, both branches must have consumed the same handles" is enough to answer, but the article does not work through a two-branch example, so I could not check my answer against a stated one.
- **Q1, Q2, Q5** were fully answerable from the text.

## One thing to add and one thing to cut

**Add:** one worked listing for §9.4 — the loop of the section compiled with and without the guard fact, a dozen instructions each, with the removed check and trap site marked, and the count reconciled with the "four instructions" figure. This is the article's most valuable item and the only one whose numbers currently contradict each other, and the whole selling point ("negative cost at run time") rests on it.

**Cut:** §9.8, "Two directions that should wait". Two paragraphs, no examples, ten citations, and nothing a reader must know to understand the rest of the article; the argument ("we should not do these yet") fits in one sentence at the end of §9.1 or in the key points. Cutting it would also make room for the §9.4 listing.
