# Feedback on "8. Asynchrony as a Compiler Transformation"

## Passages I had to read twice

1. "The record needs a tag with the values 1 and 2, and the variables each continuation uses. That record is exactly what the Editor's author built by hand: `readToken` being non-zero is tag 1, `unitsRead` and `unitsWritten` and `sourceLength` are the saved variables of continuation 2."
   — Unclear because the two halves use different numbering schemes. If `readToken > 0` is tag 1, then the field name should also tell me which field is tag 2 and which saved variables belong to continuation 1. Is the "tag" field `readToken` itself, or a separate phase integer? The sentence slides from "the record needs a tag" (one field) to a list of hand-written fields (many fields) without saying how they correspond.

2. "In WebAssembly the `switch` at the top is a single table-jump instruction, and the jump into the middle of the loop is expressed by placing the whole body inside one loop that dispatches on a state number."
   — Unclear because the outline in §8.5 already mixes two mechanisms, a `switch` on `frame.state` and a `goto loop_test`, and then this sentence replaces the `goto` with "one loop that dispatches on a state number" without showing the rewritten loop. I could not picture the actual shape of the output code.

3. "`stop` | not yet assigned | dead: recomputed on every outer iteration"
   — Unclear in the table itself, because in the wished-for source `stop` is re-assigned at the *top* of each outer iteration and read immediately after; the row does not say whether `stop` counts as dead because the next write precedes any read, or because the loop variable scope ends. I had to go back to the code listing to check the ordering.

4. "Only scalars cross a wait, which is also the restriction the reactor already places on `WorldState`."
   — Unclear because `WorldState` is described earlier as "the record the reactor keeps between events" and it evidently holds tokens and many scalars; I could not tell what "only scalars" is restricting — the fields of `WorldState`, the arguments of SDK calls, or something else.

5. "An asynchronous function that calls another asynchronous function simply records that it is waiting on the callee's frame. Because the call graph is fixed, the dispatcher that resumes the caller when the callee completes is also generated statically."
   — Unclear because the previous paragraph's dispatcher matched events by token, and here completion of a callee is not an event with a token. How the caller is woken, and what field records "waiting on the callee's frame", is asserted rather than shown.

## Terms used before they were explained, or never explained

- **nucleus** — used three times in §8.1 ("returns to the nucleus", "the nucleus delivers a new event") and never defined in this article.
- **turn budget** — used in §8.1 and §8.2, defined only in Article 1; the article never says how big it is, which matters for the "64 KiB takes longer than one turn budget" claim.
- **reactor** — used from the first page, defined only in Article 1.
- **world / worlds** — "Other worlds run"; never explained here at all, yet central to what a wait means.
- **fuel counter** — "Article 7 proposed a fuel counter"; used in §8.7 as if known.
- **`WorldState`** — used as a type in code before anything says what it is or what its fields are.
- **`typedSdkFileRead`, `typedSdkBuffer`, `typedSdkYield`** — never explained: no signatures, no statement of what a yield returns or what it waits for.
- **buffer / `string`** — the prohibition in §8.4 depends on these types being pointers to borrowed memory; that is implied by "lends" but never stated as a type rule.
- **view** — "code should reacquire the view in each incoming event" (quoted from design notes); "view" is never explained.
- **unit / 1,024 units of work** — the unit of work is never defined, so "takes longer than one turn budget" cannot be checked.
- **table-jump instruction** — §8.5, used without explanation of what a jump table is.
- **`LATER` / `DONE(0)`** — used in the generated code only; never introduced.
- **static frame** — properly introduced in §8.5; but the phrase "one frame of fixed size" appears in the §8.8 key points as if already familiar, and "static allocation" in §8.6 is never defined for a reader who does not know activation records.

## Claims I could not verify from the article itself

1. "The design is the right one for a machine with one stack and a few hundred kilobytes of fast memory."
   — No device is described: no memory size, no stack size, no numbers. "The right one" is a design judgement with no evidence given.

2. "Editor has five such tokens and 71 state fields. The search routine alone keeps a phase number and six positions in the record so that it can stop after 1,024 units of work and resume."
   — The excerpt shows five token checks, so the "five" is partly corroborated; the 71 fields and the search routine's phase number and six positions are not shown anywhere, and no file or test is named.

3. "The project's design notes and tests show the hazards one would predict."
   — Three hazards are then described in prose (a foreign timer event, a discarded preview, a delayed open reply). No test name, file path or excerpt is given, so I have to take the summary on trust.

4. "The hand-written version saves the same three."
   — `editorNormalize` shows `state.unitsRead`, `state.unitsWritten` and `state.sourceLength`, which is consistent, but the article never shows the full set of fields the real routine keeps, so "the same three" is an assertion.

5. "The compiler finds them by the same analysis it would use to allocate registers."
   — No example of the data-flow equations or of the analysis running on this function is given, so the analogy is unverified.

6. "In WebAssembly the `switch` at the top is a single table-jump instruction."
   — No reference and no code. I cannot check the WebAssembly instruction chosen or whether the costs are as implied.

7. "Editor's 71 hand-managed fields would become a computed number."
   — The computed number is never given. This is the one place where a concrete arithmetic result would have made the whole argument land, and it is missing.

8. "The reply to an open request had to be delayed until the first screen was ready, because otherwise the next key press could meet a half-built state."
   — How the delay was implemented (a pending flag? a suppressed token?) is not shown, so I cannot see how it fits the frame/state model proposed here.

9. The Protothreads / Céu / Embassy paragraph.
   — Four separate claims about other systems, each backed only by a citation or a quotation from embassy.dev. I could not check any of them, and the article does not say what each system's state consists of, so the comparison "sits between protothreads and these systems" is hard to evaluate.

## Section scores

- **8.1 Split-phase operations — 4.** The request/token/completion cycle is clear and the TinyOS origin is well placed; marks lost because *nucleus* and *turn budget* are used as if already known.
- **8.2 What the programmer does by hand — 3.** The wished-for source and the sliced function make the contrast vivid, but the dispatch excerpt is a wall of near-identical `if`s and the numeric claims (71 fields, five tokens) arrive without support.
- **8.3 Continuations, and their representation as data — 3.** The definition of continuation and the defunctionalization idea are well done, but the mapping from tag/saved-variable theory onto the actual Editor fields is inconsistent in its numbering and left me unsure.
- **8.4 Which variables must be saved — 4.** The liveness table with per-cell justifications is the clearest part of the article; the `text`/buffer rule is stated abruptly and "only scalars" is vague.
- **8.5 The generated state machine — 3.** The frame table is good and the algorithm listing is clear, but the code outline mixes `switch` and `goto`, uses unexplained `LATER`/`DONE`, and the WebAssembly remark assumes knowledge the reader may not have.
- **8.6 Why the frames can be static — 3.** The core argument (no recursion ⇒ one frame) is convincing; the extension to async-calling-async is a hand-wave, and the closing tour of other systems is dense and unverifiable.
- **8.7 Waits, budgets and what stays explicit — 5.** Short, well argued, with a concrete example of the interleaving danger and a memorable closing contrast between `await` and fuel.
- **8.8 Key points — 4.** Accurate restatement of the article; loses a mark only because it reuses the unexplained "frame" and "scalars" without their definitions.
- **8.9 Check your understanding — 3.** Every question is answerable in principle, but Q3 asks for the tag-mapping that §8.3 leaves half-explained, and no question exercises the dispatcher or cancellation.

## Questions that the article did not let me answer

- **Q3** could only be answered partially. The article says `readToken > 0` is tag 1 and names continuation 2's variables, but never says which field is tag 2 or what continuation 1's saved variables are, so the "tag" half of the sentence is guesswork. What is missing: one table mapping each hand-written field to (tag, saved-variable) role.
- **Q2** was answerable, but only after re-reading the code listing, because the table marks `stop` "not yet assigned" at wait 1 and "recomputed on every outer iteration" at wait 2 without saying in which order the write and the read occur.
- **Q4** was answerable, though the phrase "where execution continues when the function is entered" is slightly ambiguous: I read it as "which resume label is taken", not as "which instruction of the original source runs".
- Q1, Q5 and Q6 were fully answerable from the text.

## One thing to add and one thing to cut

**Add:** a worked trace of a single event through the generated dispatcher and `openFile.step` — event arrives with a token, matches `frame.token`, `state = 1` so `case 1` runs, `event.ok` is false so the frame is cleared — plus the size arithmetic that turns "71 hand-managed fields" into "N frames of M bytes, total K". One trace and one number would convert the whole argument from description into demonstration.

**Cut:** the closing paragraph of §8.6 on Protothreads, Céu and Embassy. Three systems in five sentences, each with a citation but no shared terms, and none of them needed for the argument that recursion-free code can use static frames. The one sentence that matters, that liveness-based saving preserves exactly the variables that need preserving and so sits between protothreads and the others, could be kept as a footnote.
