# Answers to 8.9 "Check your understanding"

## 1. What is a token, and what must the application do with it?

A token is the number that a reactor function returns immediately when it starts a long operation — a
file read, or a zero-delay timer — and it identifies that one request. The completion comes later as an
ordinary event that carries the same token plus a flag `ok` saying whether the operation worked. Between
the two, the application must store the token in a long-lived place (the Editor keeps five such fields,
`readToken`, `writeToken`, `previewToken`, `findToken`, `frameToken`) and then return to the nucleus so
that other worlds can run. On each incoming event of the completing kind (kind 4 in the Editor) the
handler compares `event.token` with every stored token and continues only where one matches. An event
whose token matches nothing is ignored, which is how a completion arriving after a cancellation is
dropped.

Confidence: 4

## 2. Which variables are live at the second wait, and which are not? Justify `stop`.

Working, using the article's definition (a variable is live at a point if some path from that point reads
it before writing it), at the yield inside the outer loop:

| Variable | Status at wait 2 | Why |
| --- | --- | --- |
| `length` | **live** | the outer test `read < length`, run again after the resume, reads it |
| `read` | **live** | same test, and it drives `stop` on the next iteration |
| `written` | **live** | `state.textLength = written` at the end reads it |
| `stop` | dead | recomputed as `Math.min(length, read + 4096)` at the top of every outer iteration |
| `ok` | dead | already tested once, directly after the read |
| `handle` | dead | used only in `typedSdkFileRead(handle)` before wait 1 |
| `text` | must not be live | it is a reactor buffer reference; it must be reacquired after a wait |
| `state` | not the function's to save | a parameter, passed in again with every event |

The justification for `stop` is order of execution: the yield sits at the end of the outer iteration,
and the first thing after resuming is the loop test and then a fresh assignment `stop = min(...)`.
So every value `stop` ever holds is dead by the time control reaches the yield — there is no path that
reads the old value. The article's own frame layout agrees: it stores only `length`, `read`, `written`.

Confidence: 4

## 3. Which two fields form the tag, and which are the saved variables?

Section 8.3 says the tag is spread over `readToken`, which is non-zero while either wait is outstanding,
and the boolean `reading`, which is false during the first wait (storage) and true during the second
(between normalization slices). Together they encode the three situations a tag must distinguish: not
running (token zero), waiting for the read, and waiting for the yield. Note that the distinguishing bit is
really `reading`; `readToken` carries the correlation with the event stream rather than the phase. The
saved variables of the second continuation are `unitsRead`, `unitsWritten` and `sourceLength`, the
hand-written counterparts of `read`, `written` and `length`; nothing has to be saved at the first wait.

Confidence: 3

## 4. What are `start` and `resume` called with, and where does `resume` continue?

`start` is called once, with the function's own arguments, `(handle, state)`; it runs forward to the
first wait, stores the returned token, sets `frame.state = 1` and returns `LATER`. `resume` is called
with `(event, state)` — once for each completion event whose token matches the frame, and, per section
8.6, directly by the generated code of a callee that has just finished, carrying the callee's result.
For `frame.state = 1` it continues just after the file read: it tests `event.ok`, returns `DONE(0)` with
`state = 0` on failure, otherwise sets `length = state.sourceLength`, `read = 0`, `written = 0` and
jumps to `loop_test`. For `frame.state = 2` it reloads `length`, `read`, `written` from the frame and
jumps to `loop_test`. `frame.state = 0` means not running; the generated dispatcher only consults frames
whose state is non-zero, so a completion arriving after cancellation matches nothing.

Confidence: 4

## 5. Why is the task, not the function, the unit of storage?

One function can be suspended more than once at a time: two tasks — say a search and a file write — can
both be in the middle of the same shared helper, and each suspended activation needs its own values of
the live variables. A single frame per function would therefore be overwritten by the second task. So the
compiler starts from each kind of task's top-level function, walks the call graph from there, and lays out
one frame for every asynchronous function reachable from that task, so a helper used by two kinds of task
gets a frame in each set. The remaining restriction is that one set of frames per kind of task permits
one instance of that task at a time; the program may declare a fixed larger number of sets, and starting a
task when all sets are busy must be a visible result the program handles — the Editor does this by hand
when it refuses an open while a save is in progress.

Confidence: 4

## 6. Why not insert waits automatically when fuel runs low?

Because a wait is not a neutral pause: other events are handled there, and the application's state can
change underneath the suspended function. In the example, a key press handled between two normalization
slices could modify the document being normalized, which is why the Editor keeps the open request pending
until the first screen is ready. A programmer has to know exactly where such interleavings are possible in
order to reason about the program, and an explicit `await typedSdkYield()` in the source marks exactly
those places. If the compiler inserted waits wherever fuel ran out, the interleaving points would depend
on how much work happened to fit in the budget, so the reasoning would rest on a fact about code
generation rather than on a fact the reader can see in the source.

Confidence: 5
