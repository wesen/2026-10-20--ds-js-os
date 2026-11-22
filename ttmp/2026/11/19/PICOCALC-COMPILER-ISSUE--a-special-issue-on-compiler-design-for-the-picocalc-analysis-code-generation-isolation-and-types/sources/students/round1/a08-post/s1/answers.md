# Answers to "Check your understanding" (section 8.9)

## 1. What is a token, and what must an application do with it between a request and its completion?

A token is a number that the reactor returns at once when an application starts a split-phase
operation such as a file read; it identifies that particular request. The application must keep
the token in state that survives the event, return to the nucleus, and then compare it against
the token of every incoming event that might be a completion. When an event's token matches, the
handler resumes the work that was waiting; when the token matches nothing, the event is ignored.
In the hand-written Editor this means storing the token in a field of `WorldState` (one of the
five `*Token` fields) and testing it in `typedWorldEvent`.

Confidence: 5

## 2. Which variables are live at the second wait, and which are not? Justify `stop`.

Live at the second wait (the `typedSdkYield` inside the loop) are `length`, `read` and `written`:
the loop-test reads `length` and `read`, and `written` is the running output position that is
still being advanced. Dead are `handle` (never used again), `ok` (already tested before the
loop), and `stop` (computed anew on each pass of the outer loop, so the value in hand at a wait
is never read afterwards). `text` is a special case: it is a buffer reference, so it is not
saved but reacquired with `typedSdkBuffer(0)` after the yield. `stop` is dead precisely because
it is recomputed rather than carried: the outer loop recomputes `Math.min(length, read + 4096)`
on every iteration, so no path from the wait reads the old value of `stop`.

Confidence: 4

## 3. Explain "the token fields are defunctionalized continuations written by hand", using *tag* and *saved variables*.

Defunctionalization replaces a code-valued thing (here, a continuation) with a data record made
of a tag naming which piece of code is meant, plus the values that code will need. In `openFile`
there are two waits, hence two continuations, so the tag takes values 1 and 2 — and in the
hand-written code the tag is "which token field is non-zero" (`readToken` non-zero = tag 1, the
"after the read" continuation). The *saved variables* are the record's other fields: `unitsRead`,
`unitsWritten` and `sourceLength` are exactly what the after-yield continuation reads. Matching a
token in `typedWorldEvent` is the "look at the tag and jump to the code" step. The point of the
sentence is that the author wrote out by hand the exact data layout a compiler would generate.

Confidence: 4

## 4. The three possible values of `state`, and where execution continues for each.

`state = 0` means not running; a fresh entry starts at the top of the function, which calls
`typedSdkFileRead(handle)`, stores the token, sets `state = 1` and returns `LATER`.
`state = 1` means waiting for the read; on entry the function resumes at the "after the read"
point, tests `event.ok`, initializes `length = state.sourceLength, read = 0, written = 0` and
jumps to `loop_test`. `state = 2` means waiting for the yield; on entry it reloads
`length`, `read` and `written` from the frame, then also jumps to `loop_test`. Reaching the end
of the loop sets `state = 0` and returns `DONE(1)`, so the function may be started again.

Confidence: 5

## 5. Why can the saved state sit at a fixed address, and what restriction on simultaneous instances follows?

Typed programs have no recursion, so the call graph is acyclic and a function can be active at
most once along any chain of calls; one fixed frame per asynchronous function therefore suffices,
exactly as the textbook argument for non-recursive procedures allows static allocation of the
activation record. This means the total frame size is known at compile time, can be checked
against the reactor's limit, and no allocation can fail at run time. The restriction is that one
static frame is one instance: an application that needs two reads outstanding at once needs two
frames, so each asynchronous function gets one frame by default, the program may declare a larger
fixed number, and starting an instance while all frames are busy must become a visible result the
program handles.

Confidence: 4

## 6. Why not insert waits automatically when fuel runs low?

Because a wait is a point at which other events are handled and the application's state may
change: in the example, a key press processed between two slices could modify the very document
being normalized. A programmer can only reason about such interleavings if the places where they
occur are visible in the source, which is what an explicit `await` marks. A wait inserted by the
compiler wherever the fuel counter runs low would appear in positions the author never chose and
cannot enumerate. That is why the article keeps the roles separate: `await typedSdkYield()` is
how a correct program divides long work, and fuel is only what stops an incorrect one.

Confidence: 5
