# Feedback on "Asynchrony as a Compiler Transformation" (section 8)

Student reader report. Read in one pass, then re-read the sections below.

## Passages I had to read twice

> "Its control flow, the fact that normalization follows the read, is no longer written anywhere;
> it is implied by which token is non-zero."

The claim is bold, but the fragment of `typedWorldEvent` shown in the same section is truncated
with `...` and its bodies are `{ ... }`, so at the point where this sentence is made I cannot see
the implication myself. I had to accept it and move on.

> "The variable `text` raises a different question." / "| `text` | not yet assigned | see below |"

The table in 8.4 says "see below", but "below" is two paragraphs later and never adds a table
row, so for a moment I looked for a footnote that does not exist.

> "`state = 1` // after the read: `if not event.ok:`"

The wished-for source tested a local `ok` returned by `await typedSdkFileRead(handle)`, but here
the test is `event.ok`, and nothing says where that field comes from. I had to guess that the
completion event carries a success flag; note also that the wished-for source returns `0` on
failure while this outline returns `DONE(0)`.

> "Only scalars cross a wait, which is also the restriction the reactor already places on
> `WorldState`."

"Already places" points back to material not quoted here, so the reason a `WorldState` field
cannot be a buffer reference is asserted rather than shown.

> "Because the call graph is fixed, the dispatcher that resumes the caller when the callee
> completes is also generated statically."

This is the most interesting sentence in 8.6 for me and it is one line with no example: an
asynchronous function calling another asynchronous function is never shown.

## Terms used before they were explained, or never explained

- *nucleus* — used in 8.1 ("returns to the nucleus") and never defined in this article.
- *reactor* — used throughout; the article says Article 1 defined it, but nothing here.
- *WorldState* — used as if known; the reader learns only its role (record kept between events).
- *world* / "Other worlds run" — used as a term of art ("long computations… other worlds run").
- *turn*, *turn budget* — defined in Article 1, used in 8.1 and 8.2 without restatement.
- *fuel* — used in 8.6/8.7 as the Article 7 mechanism, never described here.
- *typed* (language, program, SDK) — used as an adjective from the first paragraph with no
  definition in this article.
- `typedSdkFileRead`, `typedSdkBuffer`, `typedSdkYield` — appear inside the listing and the
  compiler output with no signature or contract given (what does `typedSdkYield()` return?).
- `LATER` and `DONE(0)` / `DONE(1)` — used in the generated code in 8.5 and never explained;
  I inferred "return now, resumable" and "finished, with result".
- *frame* — introduced in 8.5 as if familiar ("a static **frame**"); the reader must bridge from
  "activation record" (only cited later, in 8.6, from the textbook).
- *event.kind === 4* — the magic number 4 in the dispatcher is never identified as "timer".
- *table-jump instruction* — named without its WebAssembly name (`br_table`), so I cannot look
  it up without the web (out of scope for me).

## Claims I could not verify from the article itself

> "Editor has five such tokens and 71 state fields."

No listing, no count shown, no file named. I have to take the number on trust, and the whole
quantitative punch of 8.2 rests on it.

> "The project's design notes and tests show the hazards one would predict."

Three hazards are then described in prose (foreign timer event, discarded preview, delayed reply)
but no test name, no file, no failure output is given, so I cannot check that these are real
behaviours rather than plausible ones.

> "The compiler finds them by the same analysis it would use to allocate registers."

The live-variable table is convincing on its own, but the register-allocation analogy is not
argued. A cross-reference to where the compiler does register allocation would be needed.

> "The total size of all frames is known at compile time. It can be checked against the reactor's
> limit when the program is compiled; Editor's 71 hand-managed fields would become a computed
> number."

No limit value is given, and the article never shows the transformation actually being run, so
"would become a computed number" has no worked figure. Since the title promises a compiler
transformation, a single end-to-end example (the before code, the generated frame, the generated
dispatcher, byte counts) is the missing evidence.

> "the Editor's design notes say so: code 'should reacquire the view in each incoming event'."

A direct quotation from the project's own notes with no document name or section.

> "Because the call graph is fixed, the dispatcher that resumes the caller…"

Depends on 8.6's restatement of Article 7 ("typed programs have an acyclic call graph"), which
this article asserts without proof; I am asked to import a result from another article.

> "Lauer and Needham observed long ago that a system built from events and one built from
> sequential processes are two notations for the same thing and can be converted into each other
> mechanically [Lauer & Needham 1979]."

Fine as a citation, but the "mechanically" is doing real work here and no sketch of the
conversion is given in this article.

## Section scores

| Section | Score | Reason |
| --- | --- | --- |
| 8.1 Split-phase operations | 4 | Token/request/completion is clear, but *nucleus*, *turn* and *reactor* arrive undefined. |
| 8.2 What the programmer does by hand | 5 | The wished-for source beside the sliced function is the clearest part of the article. |
| 8.3 Continuations and defunctionalization | 4 | The tag/saved-variables mapping is explained well; the tag = "which token is non-zero" jump still needs the reader's own inference. |
| 8.4 Which variables must be saved | 4 | The liveness table works, and `stop` is justified; `text`/`buffer` is handled by a "see below" that does not arrive in the table. |
| 8.5 The generated state machine | 3 | The outline is readable but inconsistent with the source it rewrites (`ok` versus `event.ok`, `DONE(0)`), and it is pseudo-code, not the WebAssembly shape it claims to describe. |
| 8.6 Why the frames can be static | 4 | The no-recursion argument is the right one and the single-instance restriction is stated honestly, but the caller-resumes-callee case is one unsupported line. |
| 8.7 Waits, budgets and what stays explicit | 5 | Short, argued, and the key-press-during-normalization example makes the point concrete. |
| 8.8 Key points | 5 | Faithful summary of the article, no new claims. |
| 8.9 Check your understanding | 4 | All six questions are answerable from the text; Q2 and Q4 needed the most assembly. |

## Questions that the article did not let me answer

None were unanswerable, but two came close and needed reconstruction:

- **Question 4** asks where execution continues for each `state` value. The article gives this,
  but the resume path for `state = 1` tests `event.ok`, whose origin is never stated, so my answer
  rests on guessing that the completion event carries the result of the read.
- **Question 2** asks me to justify `stop`. The table gives the reason ("recomputed on every outer
  iteration"), yet the hand-written `editorNormalize` slice recomputes `stop` from
  `state.sourceLength` on each call — I had to connect those two facts myself. Likewise `text` is
  answered only by the rule in 8.4 plus the parenthetical remedy after the yield.
- **Question 1** is answerable only by combining 8.1 (the token identifies the request) with the
  dispatcher in 8.2/8.5; 8.1 alone tells me to "recognize the token and carry on" without saying
  that the token must be stored in persistent state.

## One thing to add and one thing to cut

**Add.** One complete worked trace end to end: a single call of `openFile.step` through both
waits, showing the concrete frame contents after each `return LATER` (state, token, length, read,
written) and the dispatcher's token comparison on each incoming event, plus the generated
function's actual shape (the `loop` + `switch`/`br_table` form the article only mentions). That
would convert 8.5 from an outline into evidence and would also supply the "computed number"
figure that 8.6 promises.

**Cut.** The Lauer & Needham sentence in 8.3 ("Lauer and Needham observed long ago…"). It states
the article's own thesis a second time in the abstract and is never returned to; the Reynolds /
Danvy defunctionalization material immediately before it already does the work, and removing it
would shorten the section without losing any step of the argument.
