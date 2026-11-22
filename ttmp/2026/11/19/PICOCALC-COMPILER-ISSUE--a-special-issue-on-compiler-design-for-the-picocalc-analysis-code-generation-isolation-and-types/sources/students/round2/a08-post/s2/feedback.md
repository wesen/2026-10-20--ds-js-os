# Feedback on "8. Asynchrony as a Compiler Transformation"

## Passages I had to read twice

1. > "The tag is spread over two fields: `readToken` is non-zero while either wait is outstanding, and a
   > boolean field `reading` is false during the first wait (for storage) and true during the second
   > (between slices of normalization)."

   Section 8.3 has just said that two waits give two continuations and that a tag distinguishes them, but
   `readToken` is non-zero in *both* waits, so as described it distinguishes nothing; only `reading` does.
   I also could not tell whether `readToken` is the token of the read (in which case it is stale during the
   yield wait) or a reused "a wait is outstanding" slot, and the article never says when it is cleared.
   And `reading` appears in no listing anywhere in the article.

2. > "When an asynchronous function awaits another, the token of the outstanding operation is held in the
   > innermost function's frame, and the caller's frame records only 'waiting for my callee'."

   followed by

   > "it knows which function that is because, within one kind of task, each callee has exactly one caller
   > position recorded in the caller's `state`."

   The frame table in 8.5 has fields `state`, `token`, `length`, `read`, `written` — there is no field in
   which "waiting for my callee" can be recorded, and "caller position" is never shown. The two sentences
   are doing a lot of work with nothing to check them against.

3. > "`const ok = await typedSdkFileRead(handle);        // wait 1: storage`"

   Section 8.1 says the reactor call returns a *token* and that the `ok` flag arrives in the completion
   event, so a reader has to infer that `await` yields the completion's value and not the call's return
   value. The article says what `typedSdkFileRead` starts, but not what awaiting it produces.

4. > "while (read < stop) { /* copy one unit */ }"

   In `editorNormalize` the comment hides the only statement that makes the loop terminate (`read` is
   incremented). Read literally the snippet is an infinite loop, so I could not check the invariant that
   the function is supposed to preserve, nor how `written` advances.

5. > "one function performs a single slice of the work: `function editorNormalize(text: buffer, state:
   > WorldState): i32`"

   The function takes a `buffer` argument, yet 8.4 forbids buffer references across a wait and says the
   view must be reacquired in each event. How the slice function gets its `text` after a yield is not
   shown, so the rule and the example pull against each other until the reader guesses that each slice is
   called from a new event and receives a fresh view.

6. > "The compiler's output for `openFile` consists of a static **frame** and a rewritten function."

   then, in the listing, `case 2: ... goto loop_test` with the label `loop_test:` written *after* the
   switch and after `case 2`. Three times I misread the control flow because the label's code is
   physically outside and below the `switch` while the `goto`s are inside it.

7. > "The algorithm: ... give f a static frame: state, token, and one field per variable live at some
   > wait"

   This is per *function*, but 8.6 then says frames are laid out per *kind of task*, one frame for every
   asynchronous function reachable from the task. The algorithm listing in 8.5 is never amended, so I had
   to keep two models in mind and decide which one the generated code follows.

## Terms used before they were explained, or never explained

- `event.kind === 4` — the magic number 4 is named as "the completion of an earlier request", but the set
  of event kinds, or where they are defined, is never given.
- `WorldEvent` — the record's fields (`kind`, `token`, `ok`, and whatever the `...` hides) are never listed,
  although the whole token-matching scheme depends on them.
- "scalar field" — `WorldState` is called "a record of scalar fields" and the reactor limit is "80 scalar
  fields", but what counts as scalar (is `bool` scalar? is a `record` of scalars scalar?) is never stated.
- `step` — "on a match, call the corresponding `step`" uses a name that appears exactly once and conflicts
  with the `resume` entry point of the previous paragraph; I assumed it is a typo for `resume`.
- `typedSdkBuffer(0)` — the argument `0` is unexplained: buffer index? slot? Why zero is the document?
- "one unit" in "copy one unit" — not defined whether a unit is a byte or a 16-bit code unit, which matters
  for a CRLF scan and for how `length` relates to `written`.
- "caller position" (8.6) — never explained or shown.
- `WebAssembly` — used as known ("WebAssembly has no `goto`", "a single WebAssembly instruction"); the
  glossary mentions it only incidentally inside the entry for the WAMR engine.
- "the reactor's limit, currently 80 scalar fields" — the limit is asserted without saying what it counts
  (fields? words? bytes? per task or per application).

## Claims I could not verify from the article itself

- > "Editor has five such tokens and 71 state fields."

  No listing, no count, no file and line. It matters twice more: the 80-field limit and Article 10's test
  that the computed number "should not exceed 71" both rest on this number.

- > "The search routine alone (`worlds/editor/find.typed`) keeps a phase number and six positions in the
  > record so that it can stop after a fixed amount of work, which it counts in units up to 1,024, and
  > resume."

  A file is named but nothing from it is shown, so a reader cannot check the six positions or the 1,024.

- > "the reactor's existing rule that `WorldState` may contain only scalar fields"

  Asserted as an existing rule; no place where the rule lives is given, and it is the premise of the whole
  reason why saved state can be static.

- > "The Editor's design notes say so: code 'should reacquire the view in each incoming event'."

  A quotation with no location (file, section) and no surrounding argument.

- > "The tests deliver a timer event that belongs to a different job, to confirm that it does not advance
  > the current one. Opening another file must discard a pending preview so that its completion, arriving
  > later, is ignored."

  Three behaviours and no test names; also "must discard" reads as a requirement rather than as an
  observed test, so it is unclear whether the Editor does this today or is supposed to.

- > "it refuses a request to open a file while a save is still in progress, and replies 'The editor is
  > saving.'"

  A user-visible string quoted with no file reference. Every other claim in the article that names a
  source names a file, so this one is conspicuous.

- > "The reply to an open request had to be delayed until the first screen was ready, because otherwise the
  > next key press could meet a half-built state."

  No reference; also the mechanism by which the reply is delayed (a frame in a waiting state?) is not shown,
  although it would be a good third example of the transformation.

- > "which for a 64 KiB file takes longer than one turn budget"

  The turn budget (200 ms) is given, but no cost per unit is, so the arithmetic cannot be redone: 16 slices
  of 4096 exist only if a slice is a full 4096 units, which the article does not state.

- > "the result is the hardest code in the project to read and to get right"

  Editorial judgement presented as fact.

- All bracketed external claims (the Adya quotation, "two bytes of memory per thread" for protothreads, the
  Embassy wording, the C# formalization) are cited but not checkable here; the Embassy sentences are quoted
  without a page or section, and "This is the standard compilation of `async` functions in C#" is a strong
  claim resting on a single citation.

## Section scores

| Section | Score | Reason |
| --- | --- | --- |
| Opening | 4 | Sets up the problem, lists reused terms and cross-references Article 7 crisply, though "the hardest code in the project" is unearned. |
| 8.1 | 5 | Split-phase is defined by a concrete file read, the token and `ok` are named, and the TinyOS origin explains why the design exists. |
| 8.2 | 4 | The wished-for and hand-written forms are shown side by side and stack ripping is named and quoted, but both listings have holes (`/* copy one unit */`, and the elided `...` in the handler) that stop a reader checking them. |
| 8.3 | 3 | Continuation and defunctionalization are explained well, but the identification of the tag with `readToken` plus `reading` is asserted rather than shown, and `reading` is never displayed. |
| 8.4 | 4 | The liveness table is the clearest thing in the article and the buffer rule is stated as a checkable compile-time rule; it never mentions that values like `length` could be refetched from `state`, so `stop` gets a discussion of rematerialization but `length` does not. |
| 8.5 | 3 | The frame table and the pseudocode convey the shape, but the listing mixes `goto` with `switch`, puts the label outside and below the switch, and contradicts 8.6 by giving one frame per function. |
| 8.6 | 3 | The static-allocation argument from the acyclic call graph is convincing, but the per-task frame sets, the innermost-frame rule and "caller position" are compressed into two sentences each with no layout to check. |
| 8.7 | 5 | Short, and the argument is made with a concrete interleaving (a key press during normalization) rather than asserted. |
| 8.8 | 4 | A faithful summary, useful for revision. |
| 8.9 | 4 | Five of the six questions are answerable from the text alone; question 3 needs an inference and question 4 needs the reader to reconcile two listings. |

## Questions that the article did not let me answer

None was unanswerable, but two were answerable only by inference, which I record as a partial failure:

- **Question 3** (which two fields form the tag). Answerable only because 8.3 states the answer in one
  sentence. What is *not* answerable is how the tag behaves in the not-running case: the article never says
  that `readToken === 0` means "no continuation" (that is only inferable from the handlers' guards of
  the form `state.writeToken > 0`), and it never shows `reading` anywhere, so I could not confirm which value of `reading`
  means which wait beyond the prose.
- **Question 4** (where `resume` continues). Answerable for `frame.state` 1 and 2 from the 8.5 listing, but
  the listing leaves `frame.state = 0` out of the `switch` entirely, so "what `resume` does when the task is
  not running" had to be assembled from the dispatcher paragraph instead. The listing also does not show
  the reload of the *token* or the caller routing described in 8.6, which question 5's answer leans on.
- **Question 5** names the restriction explicitly ("one instance of that task at a time"), so no gap there;
  what is missing is only the arithmetic of the field budget — the article never says how a per-task frame
  set is counted against the 80-field limit, which is the one part of the answer I could only assert.

## One thing to add and one thing to cut

**Add.** One worked table plus one complete listing that show the central claim instead of asserting it: a
table mapping each variable of the wished-for `openFile` to (a) the hand-written field that stands in for it
and (b) the generated frame field, and the full hand-written open handler including the statements that set
and clear `readToken` and `reading`. As written, "the token fields are defunctionalized continuations
written by hand" is the article's thesis sentence and the only evidence offered is prose.

**Cut.** The paragraph beginning "Several systems for small devices embody the same design" (protothreads,
Céu, Embassy). It introduces three systems in six sentences, none of which the argument needs, and each
raises details (two bytes per thread, link-time failure, a proved semantics) that a reader cannot check
here. The one-sentence Lauer and Needham remark before it already makes the point that the conversion is
mechanical, and section 8.7 does the comparative work that matters.
