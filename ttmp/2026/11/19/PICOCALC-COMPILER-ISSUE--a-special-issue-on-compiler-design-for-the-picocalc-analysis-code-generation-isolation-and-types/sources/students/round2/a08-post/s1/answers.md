# Answers to 8.9 Check your understanding

## 1. What is a token, and what must the application do with it?

A token is a number the reactor returns when a split-phase operation starts: the call returns at once, having only launched the request, and the number stands for that particular request. The handler then returns to the nucleus so other worlds can run. When the operation finishes, the nucleus delivers a new event carrying the same token plus an `ok` flag saying whether it succeeded. The application must remember the token across the gap — normally by storing it in a persistent state field — and, in its event handler, compare the token of every incoming completion against the ones it has outstanding, continue only on a match, and ignore events whose token matches nothing. The five `event.kind === 4` tests on `state.writeToken`, `readToken`, `previewToken`, `findToken` and `frameToken` in section 8.2 are exactly this bookkeeping.

Confidence: 5

## 2. Which variables are live at the second wait, and which are not? Justify `stop`.

At the yield in the loop, the values that are read again on some later path are `length`, `read` and `written`: `length` is read by the loop test `read < length`, and `read` and `written` are the loop's own cursors. Not live: `handle` (its only use was the `typedSdkFileRead` call, so it is dead already at wait 1), `ok` (already tested on the first resume), and `text`, which is a buffer reference and is therefore excluded by the rule that `string` and `buffer` variables may not be live across a wait. `stop` is not live because it is a bound recomputed from `length` and `read` at the top of every outer iteration: `stop = Math.min(length, read + 4096)`. On resumption the code reloads `length` and `read`, goes to the loop test, and computes `stop` afresh, so the old value would be overwritten before any read. Working it out: the saved set is {`length`, `read`, `written`} — three scalars, at the second wait only.

Confidence: 4

## 3. Which two fields form the tag, and which fields are the saved variables?

The tag is the pair `readToken` together with the boolean `reading`. `readToken` being non-zero says that a wait on the open operation is outstanding at all; `reading` being false says the outstanding wait is the storage read (the first continuation), and `reading` being true says it is the yield between slices of normalization (the second continuation). The tag therefore selects which piece of code to run, exactly as a defunctionalized tag does. The saved variables of the second continuation are `unitsRead`, `unitsWritten` and `sourceLength`. So the hand-written record is: two tag-ish fields plus three scalars, which is the same shape the compiler generates as `frame.state`, `frame.token` and the three live values.

Confidence: 4

## 4. What is `start` called with, what is `resume` called with, and where does `resume` continue?

`start` is called once, with the function's arguments — here `handle` and `state` — and runs from the top of the body as far as the first wait, then stores the token, sets `frame.state = 1` and returns `LATER`. `resume` is called from the generated dispatcher for each event whose token matches `frame.token`, and it takes the event and the state record: `resume(event, state)`. For `frame.state` = 1 it continues just after the file read: it tests `event.ok`, and on success initialises `length = state.sourceLength`, `read = 0`, `written = 0` and jumps to the loop test (on failure it sets state 0 and returns `DONE(0)`). For `frame.state` = 2 it continues just after a yield: it reloads `length`, `read` and `written` from the frame and jumps to the loop test. When the loop test finds `read >= length` it stores `state.textLength = written`, sets state 0 and returns `DONE(1)`. A state of 0 means not running, so the dispatcher never calls `resume` for that frame.

Confidence: 5

## 5. Why the task, not the function, is the unit of storage.

One frame per function would be enough only if a function could be active at most once in the whole system. Two tasks can be suspended at once — a search and a file write — and both may call the same helper, so the helper would need two live copies of its saved variables at the same time; a single shared frame would let one task overwrite the other's saved state. The compiler therefore takes the task as the unit: for each kind of task it walks the call graph from the task's top-level function and lays out one frame for every asynchronous function reachable from it, so a helper used by two kinds of task gets a frame in each. The remaining restriction is that one set of frames per kind of task means one instance of that task at a time; to have two searches in progress the program must declare a larger fixed number of sets, and starting a task when all its sets are busy must be a visible result the program handles — as the Editor does when it answers "The editor is saving."

Confidence: 4

## 6. Why not insert waits automatically when fuel runs low?

Because a wait is not a neutral pause: it is a point where the nucleus handles other events, and this application's state can change underneath the suspended task. In the example a key press handled between two slices of normalization could modify the document that is being normalized, so the code between waits must have an invariant the author knows about — the Editor protects the case by keeping the open request pending. If the compiler scattered waits wherever fuel happened to run low, the author would not know where such interleavings occur, and could not reason about the state each slice sees. An explicit `await typedSdkYield()` in the source marks exactly those places, which is also the argument Adya and colleagues make for cooperative scheduling. Hence the division: `await` is how a correct program splits long work; fuel is what stops an incorrect one.

Confidence: 5
