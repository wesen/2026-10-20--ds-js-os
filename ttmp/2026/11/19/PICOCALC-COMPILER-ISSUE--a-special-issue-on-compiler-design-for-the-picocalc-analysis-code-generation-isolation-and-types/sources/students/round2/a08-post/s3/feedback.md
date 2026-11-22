# Reader feedback on "8. Asynchrony as a Compiler Transformation"

Read once straight through, then with `glossary.md` open. Where I say "not explained" below I have checked
both the article and the glossary.

## Passages I had to read twice

1. > "The tag is spread over two fields: `readToken` is non-zero while either wait is outstanding, and a boolean field `reading` is false during the first wait (for storage) and true during the second (between slices of normalization)."

   Unclear because `reading` has never appeared: it is not in the hand-written listings of 8.2, not in the
   list of Editor's field counts ("five such tokens and 71 state fields"), and not in the frame table of 8.5.
   I also had to work out for myself that the pair is really three-valued (no continuation / wait 1 / wait 2),
   which is the whole point being made, and that step is left to the reader.

2. > "| `ok` | not yet assigned | dead: already tested |" and "| `text` | not yet assigned | must not be live; discussed below |"

   The table mixes three different kinds of statement in one column: a real liveness verdict ("dead"),
   "not yet assigned" (the variable does not exist yet, so liveness does not apply), and "must not be live"
   (a design rule, not a fact about the program). Nothing in the table says which rows are answers and which
   are requirements, so the promised "mark each variable at each wait" cannot be read off it.

3. > "In the listing `typedSdkFileRead` starts a read and returns a token" versus `const ok = await typedSdkFileRead(handle);`

   In the wished-for source the awaited value is called `ok`, a success flag; in 8.5 `start` stores the return
   value of the same call as `frame.token`. The article never says that `await` re-interprets the call, so on
   first reading I took the two listings to be inconsistent.

4. > "it knows which function that is because, within one kind of task, each callee has exactly one caller position recorded in the caller's `state`."

   The caller's `state` is a single number meaning "0 = not running, 1 = waiting, 2 = waiting". How one
   number records both "waiting for my callee" and which callee it is, is not shown, and no example of an
   `await` of another async function is given anywhere in the article.

5. > "Liveness-based saving, as described here, sits between protothreads and these systems: it preserves exactly the variables that need preserving."

   "Between" in what ordering? Memory cost, amount of saved state, or expressiveness? I could not attach the
   claim to any of the three systems described just before it.

6. > "The document must be read from storage, and then every line ending must be normalized, which for a 64 KiB file takes longer than one turn budget."

   Ambiguous antecedent: does the *read* exceed the budget, or only the *normalization*? The wished-for code
   has one wait for the read and one for a slice of the loop, which suggests the latter, but the sentence reads
   as if both are slow.

## Terms used before they were explained, or never explained

- `await` — never defined; the article only notes that the language lacks it and says C# compiles it a certain way. Nothing says what it means for the program.
- `async` — appears as a function modifier in the wished-for source with no explanation of what it marks.
- `task` — used in 8.2 ("the task 'open a file'", "the code for any given task") and 8.3, but only defined in 8.6 ("one piece of work started by an event"), and there is no glossary entry.
- `unit` — "copy one unit from position `read` to position `written`": byte, character, or 16-bit word is never said, though the 4,096 slice and the 64 KiB file invite an arithmetic check I could not do.
- `event.kind === 4` — the event-kind numbering is used in the listing and in 8.2's prose ("An event of kind 4 is the completion of an earlier request") but no other kind is named and where 4 comes from is not explained.
- `scalar` — "a record of scalar fields", "all scalars", "80 scalar fields": used as a known category, but neither the article nor the glossary says scalar means the non-`string`/`buffer` types.
- `preview` / `previewToken` — the field is listed and 8.2 mentions "discard a pending preview", but what a preview is in the Editor is never described.
- `frameToken` — one of the five tokens, but the operation it belongs to is never identified (write, read, preview, find are guessable; frame is not).
- `CR`, `LF`, `CR LF` — used in the comment on line-ending normalization with no explanation; a reader who has not met carriage return before cannot follow the copy step.
- `link time` — appears inside the Embassy quotation ("running out is an error at link time") without explanation.

## Claims I could not verify from the article itself

1. > "Editor has five such tokens and 71 state fields."

   The five tokens can be counted from the `kind === 4` listing, so that part checks out. The 71 cannot:
   no manifest, struct listing or state-record listing is given, and "state field" is not defined (does it
   include tokens? the `reading` flag? `WorldState` scalars only?). The evidence needed is a listing of the
   record, or a path and a line count.

2. > "The search routine alone (`worlds/editor/find.typed`) keeps a phase number and six positions in the record so that it can stop after a fixed amount of work, which it counts in units up to 1,024, and resume."

   A file path is given but no excerpt and no size, so nothing lets me check the count "six" or the 1,024.

3. > "which for a 64 KiB file takes longer than one turn budget"

   No step or figure is offered: not the number of units per slice actually achieved, nor the per-turn
   allowance in units, nor a measurement. A one-line estimate (units per millisecond, or why 4,096 units
   cannot fit in 200 ms) would make it checkable.

4. > "The tests deliver a timer event that belongs to a different job, to confirm that it does not advance the current one. Opening another file must discard a pending preview so that its completion, arriving later, is ignored. The reply to an open request had to be delayed until the first screen was ready."

   Three concrete-sounding anecdotes, but no test names, no file paths, and no code. These are the most
   persuasive evidence in the article for "stack ripping is a hazard" and they are the least traceable.

5. > "The `switch` itself is a single WebAssembly instruction that jumps according to a number."

   True of `br_table` as far as I know, but the article cites nothing here and does not say that the
   instruction is `br_table`; the immediately following sentence cites Bierman et al. for C#, which is a
   different claim.

6. > "The usual design gives each kind of task one set by default, lets the program declare a larger fixed number, and makes starting a task when all its sets are busy a visible result that the program must handle."

   "The usual design" is presented as a consensus but no system is cited for it, and the paragraph's other
   claims are cited (Protothreads, Céu, Embassy). Either name a system or mark it as this issue's proposal.

7. > "Liveness is also the information a compiler needs to decide which values may share a register"

   The Cooper & Torczon reference covers the definition of liveness, but not this consequence; nothing in
   the article explains how liveness feeds allocation.

## Section scores

- **8.1 Split-phase operations — 5.** Token, request, completion and `ok` are defined in order and illustrated with two examples (file read, zero-delay timer); I finished it knowing what a token is.
- **8.2 What the programmer does by hand — 3.** The wished-for/actual contrast is the heart of the article, but the actual code is elided exactly where the state lives (`{ ... }`, `/* copy one unit */`), `reading` is missing from it, and `event.kind === 4` is unexplained.
- **8.3 Continuations and defunctionalization — 3.** Definition and defunctionalization are explained clearly, but the mapping of the tag onto (`readToken`, `reading`) is asserted rather than derived and introduces a field the reader has not seen.
- **8.4 Which variables must be saved — 3.** The one-row-per-variable table is a good idea, but the column mixes liveness facts with design rules ("not yet assigned", "must not be live"), and the `text`/buffer discussion runs the wished-for code and the slice function together.
- **8.5 The generated state machine — 4.** The frame table, the `start`/`resume` outline and the numbered algorithm are the clearest pages in the article; only the `goto` out of a `switch` case and the `ok`-versus-token mismatch spoil it.
- **8.6 Why the frames can be static — 3.** The no-recursion argument is convincing, but "the unit is the task" needs the two-instances example earlier, the caller's `state` records more than one thing unexplained, and the related-work paragraph is unverifiable detail at the end.
- **8.7 Waits, budgets and what stays explicit — 4.** Short and well argued; the distinction between `await` as division of work and fuel as a safety net is stated plainly, and the interleaving argument is concrete.
- **8.8 Key points — 5.** Seven bullets that match the body and would work as a revision summary on their own.
- **8.9 Check your understanding — 4.** All six are answerable in principle and five of them point at real content; Q3 depends on one sentence about `reading` and Q4 on a pseudocode detail.

## Questions that the article did not let me answer

- **Q1 (partly).** The article says the application "must recognize the token and carry on", and shows token comparison, but never says what happens to the stored token afterwards. Clearing it is only implied by "Cancelling an operation is setting its frame's `state` to zero" (about generated code) and by "opening another file must discard a pending preview" (about the hand-written code). Whether an application must also zero the token field on completion is left open.
- **Q2 — answerable**, given 8.4 and the frame table in 8.5, which agree on `length`, `read`, `written`.
- **Q3 (partly).** Answerable only from one sentence in 8.3. Because `reading` is absent from every code listing and from the field counts, I could not cross-check that it exists as described, or where else in `WorldState` a boolean like it lives.
- **Q4 (partly).** `start`'s arguments and the meaning of `frame.state = 0/1/2` are explicit. What `resume` is called *with* has to be inferred from the parenthetical "(event, state)" in the code, and the mismatch between `await`-returning-`ok` and the token-returning call made me unsure whether `ok` arrives in the event or as the awaited value. I could not have written `case 1` without copying it from the outline.
- **Q5 — answerable**, though the restriction paragraph had to be read twice.
- **Q6 — answerable**; 8.7 states the reason directly.

## One thing to add and one thing to cut

**Add:** one small table for the two waits that ties the three representations together — for each wait:
the source variable, the hand-written field name (`sourceLength`/`unitsRead`/`unitsWritten`), and the
generated frame field (`length`/`read`/`written`), plus the tag value (`readToken` ≠ 0 with `reading`
false/true, or `state` = 1/2). The article currently gives this mapping three times in three
incompatible notations (`state` 1/2 in 8.5, `readToken`+`reading` in 8.3, `unitsRead`+`unitsWritten` in
8.2) and never in one place. That single table would let a reader do what the article asks for — identify
the tag and the saved variables themselves — instead of matching names by eye.

**Cut:** the last paragraph of 8.6 about Protothreads, Céu and Embassy. It arrives after the argument is
finished, its claims cannot be checked from the article (Protothreads' "two bytes of memory per thread",
three quoted Embassy phrases with no page or section), and its closing sentence ("sits between
protothreads and these systems") needs an ordering the paragraph never establishes. One sentence pointing
at prior art, or a note in the references, would keep the same credit without the unverifiable detail.
