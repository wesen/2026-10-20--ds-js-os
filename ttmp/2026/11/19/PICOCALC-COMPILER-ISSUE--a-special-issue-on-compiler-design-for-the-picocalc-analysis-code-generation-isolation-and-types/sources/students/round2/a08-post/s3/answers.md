# Answers to "Check your understanding" (section 8.9)

## 1. What is a token in this system, and what must an application do with it between a request and its completion?

A token is the number a reactor function returns at the moment it starts a split-phase operation; it identifies that particular request. The completion arrives later as an ordinary event, and the same number comes back inside that event, together with an `ok` flag saying whether the operation succeeded. Between the two, the application must remember the token — in the hand-written Editor, in a state field such as `readToken` or `writeToken`, whose non-zero value means "this request is outstanding". When an event arrives, it compares `event.token` with each stored token and continues only on a match, so that a completion belonging to a different job is ignored. In the compiled form the token is stored in the function's frame and the comparison is done by a generated dispatcher.

Confidence: 4

## 2. In the `openFile` example, which variables are live at the second wait and which are not? Justify `stop`.

Live at the yield: `length` (read by the loop test), `read` (read by the loop test and by the copy), and `written` (read only at the end, by `state.textLength = written`, which is still reachable from the wait). Not live: `handle`, last used to start the read at wait 1; `ok`, already tested before normalization begins; and `stop`. `stop` is dead because control never reads the old value after the yield: the recorded place is `loop_test`, and the very first thing the outer iteration does is recompute `stop = Math.min(length, read + 4096)` before any use. So its previous value is always overwritten before it is read. `text` and `state` are the special cases: `state` is not saved at all because the reactor passes it in again with every event, and `text` is a buffer reference that the article forbids from being live across a wait rather than a variable to be saved.

Confidence: 4

## 3. Which two fields together form the tag that distinguishes the two continuations of opening a file, and which fields are the saved variables?

The tag is the pair (`readToken`, `reading`). `readToken` being non-zero is common to both waits — it says "a continuation of this operation exists" — and the boolean `reading` splits the two cases: `false` means the file read is still outstanding, `true` means the read is done and the function is between slices of normalization. So the pair encodes three situations: no continuation, continuation 1, continuation 2. The saved variables, i.e. the payload for the second continuation, are `sourceLength`, `unitsRead` and `unitsWritten`, which correspond exactly to `length`, `read` and `written` in the wished-for source. The first continuation needs no payload because the only thing it reads is `ok`, which arrives in the completion event itself.

Confidence: 4

## 4. What is each entry point called with, and where does `resume` continue for each value of `frame.state`?

`start` is called once, by whoever begins the task, with the function's arguments — in the outline `(handle, state)`. It runs from the top to the first wait, storing the token returned by `typedSdkFileRead(handle)` in `frame.token`, setting `frame.state = 1`, and returning `LATER`. `resume` is called by the generated dispatcher for each completion event whose token matches `frame.token`, with `(event, state)`. With `frame.state = 1` it continues after the storage read: it tests `event.ok`, and on failure sets the state to 0 and returns `DONE(0)`; otherwise it initializes `length = state.sourceLength, read = 0, written = 0` and jumps to `loop_test`. With `frame.state = 2` it continues after the yield: it reloads `length`, `read` and `written` from the frame and jumps to `loop_test`. From `loop_test` it either finishes (set `state.textLength`, `frame.state = 0`, `DONE(1)`) or copies one slice, saves the three variables, asks for a new yield, sets `frame.state = 2` and returns `LATER`. `frame.state = 0` means not running, so no event resumes it.

Confidence: 4

## 5. Why is one frame per function not enough, how does the compiler lay frames out instead, and what restriction remains?

One frame per function is not enough because the unit of suspended work is the task, and several tasks can be suspended at the same time: a search and a file write, for instance. Two different tasks may both use the same helper function, and each of them needs that helper's saved variables to survive independently; a single frame per function would be overwritten by whichever task ran last. The compiler therefore works per kind of task: it starts at the task's top-level function, walks the call graph, and lays out one frame for every asynchronous function reachable from it. A helper reachable from two kinds of task simply gets a frame in each task's layout. Because typed programs have no recursion, a function occurs at most once on any chain of calls, so within one task's layout nothing can be activated twice, and the whole layout has a size known at compile time (checkable against the reactor's 80 scalar fields). The restriction that remains is that one layout per kind of task means one running instance of that task at a time: to allow two searches at once the program must declare two sets, and starting a task while all its sets are busy becomes a visible failure result the program has to handle — as the Editor already does when it replies "The editor is saving."

Confidence: 3

## 6. Why does the article advise against inserting waits automatically when fuel runs low?

Because a wait is not a neutral pause: it is a point where the nucleus may deliver other events and run other worlds, so the application's own state may change underneath the suspended function. In the example, a key press handled between two slices could modify the very document being normalized, which is why the Editor keeps the open request pending until the first screen is ready. A programmer can only reason about such interleavings if the places where they can happen are visible, and an explicit `await` marks exactly those places; an automatically inserted wait would hide them. So the two mechanisms are kept separate: `await typedSdkYield()` is how a correct program divides long work, and fuel is what stops an incorrect one.

Confidence: 5
