# Feedback

## Passages I had to read twice

1. "The tag is spread over two fields: `readToken` is non-zero while either wait is outstanding, and a boolean field `reading` is false during the first wait (for storage) and true during the second (between slices of normalization)." — The two fields do not carry the same kind of information: `readToken` says *a* wait is outstanding but not *which*, and `reading` does the distinguishing. I expected the tag to be one field holding 1 or 2, matching `frame.state` in 8.5, and it took a re-read to see that the token is doing double duty as "is anything pending". The mapping from `{readToken, reading}` to `frame.state ∈ {0,1,2}` is never written out.

2. "The saved variables of the second continuation are `unitsRead`, `unitsWritten` and `sourceLength`." and later "The hand-written version saves the same three, under the names `sourceLength`, `unitsRead` and `unitsWritten`." — In the listing of `editorNormalize` there is no local `length` at all: the function reads `state.sourceLength` directly. So `sourceLength` is not a saved continuation value, it is an input that could be re-read from `WorldState` at any time; calling it one of "the same three" saved variables hid the difference.

3. "The variable `text` raises a different question... In the example the remedy is to call `typedSdkBuffer(0)` again after the yield." — The wished-for listing declares `const text = typedSdkBuffer(0)` once, outside the loop, and then uses `text` inside the loop across the yield. As printed the listing is therefore illegal by the rule the next paragraph states, and I could not tell whether the listing was meant to be wrong on purpose (to motivate the rule) or was simply not updated after the rule was added.

4. "`start` is called once with the function's arguments and runs to the first wait." plus the outline's line `length = state.sourceLength; read = 0; written = 0` in `case 1` — why `state.sourceLength` must be re-read at resume time but `handle` need not be saved, and whether `state` is guaranteed to be the same object in both calls, is stated elsewhere ("the reactor owns it and passes it in again") but not at the point of use.

5. "WebAssembly has no `goto`, so the jump into the middle of the loop is arranged differently... the pieces are placed as the cases of one `switch` inside one outer loop." — I had to relate this back to the earlier pseudo-code, which freely uses `goto loop_test` and which is *not* WebAssembly; the article does not say the outline is intended to be read as a pre-lowering symbol, leaving me unsure which of the two forms the compiler actually emits.

## Terms used before they were explained, or never explained

- **activation record** (8.6, in the Cooper & Torczon quotation): neither the article nor the glossary defines it or says it is the same thing as the glossary's "frame".
- **WebAssembly**: used as known in 8.5 ("WebAssembly has no `goto`"); not defined in the article or the glossary.
- **data-flow fact** (8.4): liveness is defined, but "data-flow" is not, and the glossary has no entry for it.
- **scalar** ("a record of scalar fields", "80 scalar fields"): never defined; I inferred "not a `string` or `buffer`".
- **`async`** (the `async function openFile` listing): the article says `await` is not in the language, but never says what `async` means or whether it is proposed as new syntax.
- **kind 4** ("An event of kind 4 is the completion of an earlier request"): the number 4 is a bare constant; where the event kinds are enumerated is not said.
- **link time** (quoted Embassy material, 8.6): not explained.
- **CR LF and CR into LF** (8.2): carriage return/line feed are assumed common knowledge, but the glossary is otherwise careful, so this stands out.
- **`typedSdkBuffer(0)`**: why the argument is `0` (buffer index? slot index?) is never said; it is only "returns the document buffer".

## Claims I could not verify from the article itself

1. "Editor has five such tokens and 71 state fields." — The five tokens are visible in the excerpted handler; 71 fields is an assertion with no source shown and no way to count them from the text. The whole cost argument of 8.6 ("should not exceed 71") rests on this number.
2. "The search routine alone ... keeps a phase number and six positions in the record so that it can stop after a fixed amount of work, which it counts in units up to 1,024, and resume." — No excerpt from `worlds/editor/find.typed`, no citation of a line or test; I must take the count of fields and the limit of 1,024 on trust.
3. "The document must be read from storage, and then every line ending must be normalized, which for a 64 KiB file takes longer than one turn budget." — This is the only quantitative motivation in the section and no arithmetic is given: the turn budget (200 ms), the slice size (4096 units per outer iteration), the per-unit cost and the resulting number of slices (which would be 16 for 64 KiB) are never combined. I cannot check that one budget is not enough.
4. "The project's design notes and tests for the Editor show the hazards one would predict. The tests deliver a timer event that belongs to a different job..." — Named as tests but not cited; no file, test name or output. Three separate behaviours are asserted this way, and none can be checked from the article.
5. "It can be checked against the reactor's limit, currently 80 scalar fields, when the program is compiled." — The 80 is attributed to the reactor but no document, header or constant is named.
6. "The Editor already behaves this way by hand: it refuses a request to open a file while a save is still in progress, and replies 'The editor is saving.'" — Quoted string with no location given.
7. "One restriction follows. One set of frames per kind of task means one instance of that task at a time... the compiler must know that number." — Presented as following from the static layout, but the alternative (allocating a fixed pool of N sets and indexing them) is not ruled out, so I could not see why "the compiler must know" rather than "the pool size is a declared constant".
8. "Liveness-based saving, as described here, sits between protothreads and these systems: it preserves exactly the variables that need preserving." — A comparative judgement in which the protothread and Céu/Embassy designs are described only in one sentence each; nothing lets me weigh "between".
9. "When an asynchronous function awaits another, the token of the outstanding operation is held in the innermost function's frame, and the caller's frame records only 'waiting for my callee'... it knows which function that is because, within one kind of task, each callee has exactly one caller position recorded in the caller's `state`." — A nontrivial design claim with no example: no listing of a two-level await, and no statement of what happens if one function is called from two positions in the same task.
10. "The `switch` itself is a single WebAssembly instruction that jumps according to a number." — Asserted as fact about an external system, with no reference attached at that sentence (the C# citation covers the compilation strategy, not the instruction).

## Section scores

- **8.1 Split-phase operations — 5.** Clear, short, and a concrete example (file read) followed by the timer case; the TinyOS provenance is well placed.
- **8.2 What the programmer does by hand — 3.** The three consequences (split body, moved variables, lost control flow) are excellent, but the two listings do not line up: the wished-for listing is illegal under a rule introduced three paragraphs later, and `editorNormalize` never declares the `length` that the table later treats as a saved variable.
- **8.3 Continuations, and their representation as data — 4.** The definition and the defunctionalization step are the clearest writing in the article; only the identification of the two-field tag with a state number is left to the reader.
- **8.4 Which variables must be saved — 4.** The liveness table is the most teachable device in the section and the `stop` case is a good test; the `text` discussion, though correct, contradicts the earlier listing, and "scalar" is used without definition.
- **8.5 The generated state machine — 4.** The frame table, the two entry points and the algorithm block are all clear; the confusion is that the outline mixes `goto` with a later claim that WebAssembly has no `goto`, and `frame` is used in two senses (this frame, and a stack frame).
- **8.6 Why the frames can be static — 3.** The recursion argument itself is short and convincing; the task-versus-function step is the hardest reasoning in the article and is given one paragraph, while the closing survey of protothreads, Céu and Embassy reads as an appendix of names that a reader cannot weigh.
- **8.7 Waits, budgets and what stays explicit — 5.** The interleaving argument is made in one concrete image (a key press between two slices) and the closing two-sentence division of labour is the sort of sentence a reader remembers.
- **8.8 Key points — 4.** Accurate and each bullet maps to a section, though the bullets are compressed to the point of being a checklist rather than a summary; nothing in them would teach a reader who had not read the body.
- **8.9 Check your understanding — 4.** Six questions, all answerable, and they cover the section's claims well; question 5 is the only one that needs material from three separate paragraphs joined up by the reader.

## Questions that the article did not let me answer

- **Question 2, partially.** The `stop` justification is answerable from the table and the code. The `text` entry, however, says only "must not be live; discussed below", and since the listing as printed *does* keep `text` across the yield, I could not tell from the text whether the correct answer is "`text` is dead there" or "`text` is live, and the program is therefore rejected". The article needs to state which reading question 2 expects.
- **Question 5, partially.** "How the compiler lays frames out instead" is answerable, but the restriction that follows ("one instance of that task at a time") is stated without explaining why a declared pool of N sets cannot simply be indexed by a task number, so my answer to the second half rests on repeating the article rather than on understanding it.
- **Question 4, partially.** Where `resume` continues for `frame.state` 1 and 2 is given, but "what each one is called with" for `resume` had to be inferred from `start`'s signature and from the dispatcher description — the outline writes `openFile.resume(event, state)` without saying the parameter list is the rule for all generated functions.

All other questions could be answered from the article alone.

## One thing to add and one thing to cut

**Add:** a single worked number in 8.2 showing why `openFile` needs two waits — the 200 ms turn budget, the 4096-unit slice, and the 64 KiB file, giving 16 slices and hence 15 yields — and, next to it, the generated frame for `openFile` filled in with its actual fields and its two `state` values. That one table would tie the liveness table of 8.4 to the state machine of 8.5 and would replace several of the assertions listed above with something a reader can check.

**Cut:** the survey paragraph at the end of 8.6 (Protothreads, Céu, Embassy). It is three one-sentence summaries of systems a reader cannot evaluate, it arrives just after the article's hardest argument — the task-versus-function distinction — and it dilutes it. Protothreads is worth keeping as one sentence in 8.7, where the "preserve local variables or not" contrast actually bears on the argument; the rest belongs in a footnote or a separate article.
