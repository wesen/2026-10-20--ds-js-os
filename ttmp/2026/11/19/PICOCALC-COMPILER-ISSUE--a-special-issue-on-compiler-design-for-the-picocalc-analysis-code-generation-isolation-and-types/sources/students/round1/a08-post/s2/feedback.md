# Feedback on "8. Asynchrony as a Compiler Transformation"

## Passages I had to read twice

- "Its control flow, the fact that normalization follows the read, is no longer written anywhere; it is implied by which token is non-zero." I could not turn this into a checkable statement. A non-zero token field tells the dispatcher *that some read is outstanding and which completion belongs to it*; it does not, by itself, tell a reader or the compiler that normalization follows the read. The ordering is implied by which handler runs next, which is a property of the code layout, not of the token value. I wanted one sentence saying that the ordering lives in the order of the `if` branches.
- "`readToken` being non-zero is tag 1, `unitsRead` and `unitsWritten` and `sourceLength` are the saved variables of continuation 2." The tag is numbered 1 but the saved variables are said to belong to continuation 2, and the previous paragraph says "there are two waits and therefore two possible continuations" with "a tag with the values 1 and 2". It is unclear whether tags count waits (1, 2) or continuations (0, 1, 2), and unclear why the variables are saved at wait 2 when the tag describes resuming after the read (wait 1).
- "case 1: // after the read / if not event.ok: frame.state = 0; return DONE(0)". `ok` is not in the frame table and is not stored in `case 0`, so I could not tell where `event.ok` comes from. Is success carried in the completion event, and if so what else does the event carry? Similarly `case 0` calls `typedSdkFileRead(handle)` although `handle` is not a frame field and, as a parameter, would not survive the return.
- "An asynchronous function that calls another asynchronous function simply records that it is waiting on the callee's frame. Because the call graph is fixed, the dispatcher that resumes the caller when the callee completes is also generated statically." This is the only sentence on nesting, and it is the point where the single-frame argument seems most likely to break, so I read it several times looking for the missing mechanism (does the caller's state need a "waiting on callee" value? what if the callee is already running?).
- "`text` | not yet assigned | see below". In a table whose purpose is a live/dead verdict per variable per wait, one cell is a pointer to prose. I had to go back and reconstruct the answer as "not live, and forbidden to be live".
- "A handler that has used most of its budget asks for a timer of zero delay, receives a token, and returns." A zero-delay timer is the mechanism for yielding, but why zero delay makes other worlds run, and whether `typedSdkYield()` is that timer request, is left to the reader.
- "Editor has five such tokens and 71 state fields" next to "The hand-written version saves the same three." Both are about the same program, so I expected the 71 fields to decompose; the text never says how many of the 71 are frame-like versus document state, so the arithmetic that would connect the two sentences is missing.

## Terms used before they were explained, or never explained

- *nucleus* — used in 8.1 as the thing the handler returns to and the thing that delivers completion events; never defined or cross-referenced here.
- *reactor* — relied on throughout ("the reactor lends to the application", "the reactor's limit"); defined only by reference to Article 1.
- *typed Editor* / "the Editor" — the article's running example; never introduced in this text.
- *turn budget*, *turn* — used quantitatively in the introduction and in 8.2 ("longer than one turn budget"); defined only by reference to Article 1.
- *WorldState* — glossed only in passing as "the record the reactor keeps between events"; its size, lifetime and the reason it holds scalars only are never stated.
- *WorldEvent* — appears only in a signature.
- *typedSdkFileRead*, *typedSdkBuffer*, *typedSdkYield* — three functions that structure every example; none is described, and `typedSdkBuffer(0)`'s argument `0` is unexplained.
- *buffer* (the type) — central to the "reacquire the view" rule in 8.4; never defined as a type.
- *unit* — "1,024 units of work", "copy one unit", "unitsRead"; never said whether a unit is a byte, a character or a fixed-size work quantum.
- *LATER* and *DONE(0)/DONE(1)* — return conventions in the generated code, used without explanation.
- *fuel* / *fuel counter* — the whole of 8.7 contrasts awaits with fuel; fuel is defined only by reference to Article 7.
- *previewToken*, *findToken*, *frameToken* — shown in the dispatcher fragment; the operations they belong to are never described.
- *kind === 4* — the completion event kind, unexplained (is it the only completion kind? do all five tokens share it?).
- *"table-jump instruction"* — WebAssembly terminology asserted as a single instruction, with no reference.
- *acyclic call graph* — the load-bearing premise of 8.6, defined only by reference to Article 7.
- *persistent state* — "a fixed position in the application's persistent state"; persistence is assumed, not explained.
- *stack ripping* — named and immediately supported by a quotation, but the metaphor itself is never unpacked.

## Claims I could not verify from the article itself

- "Editor has five such tokens and 71 state fields." No file, symbol list or counting rule is given, so the number cannot be checked, and it conflicts in spirit with "The hand-written version saves the same three."
- "The search routine alone keeps a phase number and six positions in the record so that it can stop after 1,024 units of work and resume." No code, no name of the routine, and no way to see the phase number or the six positions.
- "which for a 64 KiB file takes longer than one turn budget" — the size of a turn budget is never stated here, and no measurement or estimate is given for normalizing 64 KiB.
- "The project's design notes and tests show the hazards one would predict." The three hazards that follow (foreign timer event, pending preview discarded on open, delayed open reply) are described but not quoted or pointed at, so the claim that tests show them is unsupported by anything in this text.
- "The hand-written version saves the same three." The only hand-written code shown is one slice of `editorNormalize`, which reads `state.unitsRead`/`state.unitsWritten` but does not show the continuation after the read, so I cannot confirm it saves exactly `length`, `read`, `written` and nothing else.
- "at a cost of two bytes per thread" (protothreads) — a citation is given but no evidence or explanation of what the two bytes hold.
- "running out is an error at link time" (Embassy) — presented as a quotation of the documentation, but without a section pointer or quotation marks separating claim from the article's own words.
- "In WebAssembly the `switch` at the top is a single table-jump instruction" — no citation, and no explanation of how the jump into the middle of the loop is arranged beyond the phrase "one loop that dispatches on a state number".
- "The compiler finds them by the same analysis it would use to allocate registers." Similarity is asserted; no algorithm or reference for the register-allocation comparison is given.
- "Editor's 71 hand-managed fields would become a computed number." The computation is never done, even for `openFile`, so the promised benefit is a claim rather than a shown result.
- "Article 7 showed that typed programs have an acyclic call graph." Article 7 is not part of this text, so the premise of the whole of 8.6 cannot be checked from what is here.

## Section scores

- **8.1 Split-phase operations** — 4. The request/token/completion cycle is defined cleanly and the TinyOS provenance is honest; only the zero-delay-timer yield and the size of a turn budget are left fuzzy.
- **8.2 What the programmer does by hand** — 3. The wished-for and hand-written forms are genuinely instructive, but both code fragments are elided (`/* copy one unit */`, `{ ... }` in the dispatcher), so the central claim that the two are the same program, differently cut, cannot be verified by reading.
- **8.3 Continuations, and their representation as data** — 3. The prose definitions of continuation and defunctionalization are the best part of the article, but the tag numbering is muddled and the mapping onto `readToken`/`unitsRead` mixes tag with instance identity, which made quiz question 3 hard to answer with confidence.
- **8.4 Which variables must be saved** — 4. The liveness definition and the table are the clearest teaching in the article; the `text` cell deferred to prose and the buffer-type rule stated only as convention keep it from 5.
- **8.5 The generated state machine** — 3. The frame table plus the three-entry rewrite is a good pair, but the pseudocode introduces `event.ok` and uses `handle` in `case 0` without those values being in the frame, so a careful reader cannot tell what is saved and what arrives in the event.
- **8.6 Why the frames can be static** — 2. The static-allocation argument is stated in three lines, and then the nested-async case is dispatched in one sentence whose mechanism I could not reconstruct; the surrounding survey of protothreads, Céu and Embassy is interesting but crowds out the explanation this section owes.
- **8.7 Waits, budgets and what stays explicit** — 4. The recommendation and its reason (interleaving can change the document; explicit `await` marks interleaving points) are stated once and clearly, and "fuel stops an incorrect program" is a memorable line; it assumes fuel, which 8.7 does not define.
- **8.8 Key points** — 5. Every bullet matches the section it summarises and none introduces a new claim.
- **8.9 Check your understanding** — 4. The six questions test the right things, but two of them (3 and 4) point at the two passages whose wording is least precise, so they are harder than the article intends.

## Questions that the article did not let me answer

- **Question 3**, partly. The article asserts the identification of `readToken` with a tag but numbers continuations and tags inconsistently, and a token also identifies which instance finished, so I could not say cleanly which field plays *tag* and which plays *saved variables* without inventing a distinction the text does not draw. Missing: one mapping line such as "tag 1 = resume after read, saved variables = `ok`; tag 2 = resume in loop, saved variables = `length`, `read`, `written`".
- **Question 4**, partly. The three `state` values and their resume points are in the article, but for `state == 1` the resume point tests `event.ok`, and neither the frame table nor the `case 0` code shows where `ok` is stored, so I could only describe the resume point, not how it knows the read succeeded. Missing: what a completion event carries besides its token.
- **Question 2**, one cell. The live/dead verdicts for `length`, `read`, `written`, `stop`, `ok` and `handle` are all recoverable from the table and the prose; the `text` cell is only "see below", so the answer to "is `text` live at the second wait" has to be inferred from the buffer rule rather than read off the table.
- Questions 1, 5 and 6 were fully answerable from the text.

## One thing to add and one thing to cut

- **Add:** one worked, end-to-end trace of a single event, from `case 0` storing `frame.token` and returning `LATER`, through the key press handled in the interval and a foreign timer event ignored, to the storage completion whose token matches and which enters `case 1`; and alongside it one concrete frame-size arithmetic (for `openFile`: state + token + three integers, and how a total for Editor would be summed and checked against the reactor's limit). That would close the loop between 8.5's pseudocode and 8.6's "computed number", which is currently the article's largest hole.
- **Cut:** the long prior-art survey at the end of 8.6 (protothreads, Céu, Embassy, including the two-byte and link-time details). Two of its claims are unverifiable from this text, it competes for attention with the single-frame argument that the section exists to make, and a one-sentence list of the three systems with their citations would preserve the credit without the distraction.
