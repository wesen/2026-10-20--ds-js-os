# Answers — "8. Asynchrony as a Compiler Transformation"

1. A token is the runtime's handle identifying one outstanding request — the value an application gets
   back from an asynchronous operation before the operation has finished, standing in for the result
   that does not exist yet. Between issuing the request and its completion the application must keep
   the token alive in storage that survives the wait (a frame slot, not a temporary), present it back
   to the runtime on resume to claim the result, and never lose or silently drop it — a dropped token
   means the completion can never be matched, and a token must not be treated as reusable once its
   result has been consumed.
   Confidence: 3

2. I cannot know the exact variable list without the article. Reasoning about what the answer must
   look like: liveness is decided by the continuation only, so at the second wait the variables live
   are exactly those read on some path after that wait (typically the file/descriptor value obtained
   from the first wait, plus any loop counter or flag inspected after the second wait), and the dead
   ones are those whose last use precedes the wait (typically the path string, the mode/flags argument
   and the first request's token once its result has been claimed). `stop` must be justified by the
   use-after-wait test: it is live if any control path reachable from the second wait reads it — for
   example if it is a cancellation/stop flag or a cleanup routine consulted after resume — and dead if
   every read of it happens before the wait, including reads on error paths, since a variable read only
   on an unsuspended path still needs no storage. A dead-code/liveness pass that ignores error paths
   would wrongly call `stop` dead.
   Confidence: 2

3. I cannot know this without the article. The design implied by the question is that a single state
   number is not enough to identify a continuation, so the tag is the pair (state slot, discriminator
   slot) — for instance a phase/state field plus a sub-step or saved-condition field — together forming
   the label that says "waiting for the second half of opening a file" as opposed to the first. The
   saved variables would then be the remaining fields of the same struct: the locals hoisted out of
   the function, one field per variable that is live across a wait, with the tag fields and the saved
   variables occupying the same record.
   Confidence: 2

4. I cannot know the exact signatures without the article. The shape it must have: `start` is called
   once to begin the task and is passed the task's own inputs — the original function arguments, plus
   (or returning) the storage the task will use — and it runs until the first wait. `resume` is called
   when a request completes and is passed the frame/task to continue plus the completion token or
   result of the request that was being waited on; it switches on `frame.state`, where the initial or
   "never started" value is not handled by `resume` at all, and every other value is the label of a
   wait site, so `resume` continues execution immediately after the corresponding wait, consuming the
   token and storing the result into the frame before falling through to the next wait or to return.
   Confidence: 2

5. One frame per function is not enough because the suspended thing is an *activation*, not a
   definition: the same function can be in progress many times at once — through recursion, through a
   loop that starts a task per iteration, or through several callers — and each of those activations
   is suspended at a different place and needs its own copy of the saved variables, so keying storage
   by function would make the second activation overwrite the first. The compiler therefore lays
   frames out per task: it allocates the storage from the task descriptor (a frame block that the task
   owns, often with one slot per wait site per saved variable) and lets slots share storage when their
   live ranges do not overlap, so the layout is computed from the control-flow graph rather than from
   the function's lexical scope. What remains restricted is the consequence of doing this statically:
   the task storage has to be a fixed, compile-time-known size and a task has to be a single chain of
   suspension (no unbounded nesting or dynamic creation of frames at run time), so recursive or
   re-entrant waiting has to be bounded or turned into an explicit task spawn.
   Confidence: 3

6. Because a wait is not a neutral yield: while the task is suspended, other code runs and the outside
   world moves on, so an arbitrary interruption point can be observed from outside in a state the
   program never intended to expose. If the compiler inserts waits on its own when fuel runs low, it
   can split a sequence that the programmer wrote as indivisible — a lock or exclusive access held
   across two operations, a half-built data structure, a value read and then used without rechecking —
   so another task can see the intermediate state, mutating what the first task assumed stayed fixed,
   and the compiler additionally has no frame slot prepared for the temporaries live at a point it
   invented. Waits are therefore only legal where the programmer designated them, which is exactly the
   points the transformation has a state label for.
   Confidence: 3
