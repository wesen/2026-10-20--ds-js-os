# Answers to 8.9 Check your understanding

## 1. What is a token, and what must an application do with it between request and completion?

A token is a small number that the reactor hands back immediately when an application starts a split-phase operation such as a file read or a timer. It is not the result of the operation; it is a name for that one request, because the request and its completion are two separate events. Between the two, the application must store the token somewhere that survives the return from the handler — in practice a field of the persistent `WorldState` record, such as `readToken`. When the later completion event arrives, the handler compares the event's token with the stored token, and only on a match does it resume the work that was waiting. An event whose token matches no stored token must be ignored.

Confidence: 5

## 2. Which variables are live at the second wait, and which are not? Justify `stop`.

Applying the article's definition — a variable is live at a point if some path from that point reads it before writing it — the variables live at the second wait (the `await typedSdkYield()`) are `length`, `read` and `written`, and the article's own table marks exactly those three. `handle` is dead because it is never used again after the read starts; `ok` is dead because it was already tested before the loop; `text` is a buffer reference and therefore may not be live across a wait at all (it must be reacquired with `typedSdkBuffer(0)` after the yield). `stop` is dead because after resuming, control returns to `loop_test` and every outer iteration recomputes `stop = min(length, read + 4096)` before `stop` is read again — a write happens on every path before the next read, which is precisely what liveness forbids.

Confidence: 4

## 3. Explain "the token fields are defunctionalized continuations written by hand" using *tag* and *saved variables*.

A continuation is "the rest of the computation" at a wait point: the remaining code plus the values that code will need. Defunctionalization turns that code-plus-values into data: a *tag* saying which remaining piece of code is meant, and *saved variables* holding the values that piece will read. In the hand-written Editor, a non-zero `readToken` is being used as the tag for the continuation "resume after the file read", and the stored fields `unitsRead`, `unitsWritten` and `sourceLength` are the saved variables that the resume point will read. Where a compiler-generated frame would have a `state` field plus one field per live variable, the author's `WorldState` has token fields and per-job position fields. The comparison is exact in structure but loose in one place: a token also identifies *which instance* of the operation finished, a job the compiler's separate `state` and `token` fields divide between them, so the hand-written fields are carrying both meanings at once.

Confidence: 3

## 4. The three values of the `state` field, and where execution continues for each.

The values are `0`, `1` and `2`, defined as 0 = not running, 1 = waiting for the read, 2 = waiting for the yield. Entered with `0`, the function is at its first entry: it calls `typedSdkFileRead(handle)`, stores the returned token in `frame.token`, sets `frame.state = 1` and returns `LATER`. Entered with `1` the read has completed, so it tests success (`if not event.ok`), and if the read succeeded it initializes `length = state.sourceLength; read = 0; written = 0` and jumps to `loop_test`; on failure it sets `frame.state = 0` and returns `DONE(0)`. Entered with `2` the yield has completed and other worlds may have run, so it reloads the three saved locals from the frame (`length`, `read`, `written`) and jumps back into the same `loop_test` label; reaching the end of a slice stores them again, sets `state = 2` and returns `LATER`.

Confidence: 4

## 5. Why can the saved state sit at a fixed address, and what restriction follows?

Because the typed language has no recursion, Article 7's acyclic call graph means a function can be active at most once on any chain of calls; the textbook argument quoted for a procedure that calls nothing extends, without recursion, to every function. So a single activation of each asynchronous function can be outstanding at a time, its live variables always live in the same place, and one fixed frame per asynchronous function is enough. The total frame size is then a compile-time constant that can be checked against the reactor's limit, so no run-time allocation exists and none can fail. The restriction is that one static frame means one instance: if an application needs two reads outstanding at once it needs two frames, the program must declare that larger fixed number, and starting an instance when all frames are busy must become a visible result the program handles.

Confidence: 4

## 6. Why not insert waits automatically when fuel runs low?

A wait is not a pause in one thread of control; it is a point at which the handler returns to the nucleus and other events are handled, so the application's state may change underneath the suspended work. In the article's own example, a key press handled between two slices of the normalization loop could modify the very document being normalized, which is why the Editor keeps the open request pending. The author therefore has to know where interleavings can occur in order to reason about correctness, and an explicit `await` in the source is what marks those places; the Adya et al. argument is the same, that cooperative scheduling earns its keep by yielding control only where the program says so. The two mechanisms keep separate roles: `await typedSdkYield()` is how a correct program divides long work, and fuel is the safety net that stops an incorrect one.

Confidence: 5
