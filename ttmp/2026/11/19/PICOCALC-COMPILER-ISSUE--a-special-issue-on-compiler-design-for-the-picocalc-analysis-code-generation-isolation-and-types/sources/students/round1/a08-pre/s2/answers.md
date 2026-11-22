# Answers — article 8, "Asynchrony as a Compiler Transformation"

1. A token is the small data record (a struct of fields, not a first-class object) that stands in for a function's suspended
   activation: it is issued/pointed to by the application when it starts a request, and it is what the application must keep
   holding between the request and its completion. Between those two points the application must not let the token die, be
   reused, or be overwritten by another request — it must retain it (and pass it back in when the completion arrives, so the
   function can be resumed). Practically this means the token is either a static variable of the owning task or a field of a
   longer-lived object, and the caller must respect the invariant "one outstanding request per token".
   Confidence: 3

2. I cannot know this without the article (the exact local names and the exact shape of `openFile` are given only there).
   The rule that the answer must satisfy, though, is: a variable is live at the second wait exactly when some path after that
   wait reads it before writing it, so typically the buffer pointer, the byte count/length, the file descriptor or result slot
   and any loop index or progress counter are live and therefore need token fields. Variables that were only used to *build*
   the arguments of the already-issued request (the path string, the mode/flag argument, a temporary length or scratch pointer)
   are dead, because their last use is before the wait and the callee has its own copy. `stop` is justifiable as not live
   because it is fully consumed at the wait boundary — it is set and read only to decide whether to suspend/keep going, and
   that decision has already been taken by the time the wait returns, so nothing after the wait observes it.
   Confidence: 2

3. A defunctionalized continuation replaces a first-class "rest of the computation" value with a data structure plus a
   dispatcher. Here the *tag* is the `state` field: an integer that names which resumption point (which remaining piece of the
   computation) this token represents. The *saved variables* are the fields holding the live locals captured at the point of
   suspension, i.e. the environment half of the closure. So `(tag, saved variables)` is a closure encoded as plain data, and
   the switch on `state` at function entry is the apply function written by hand instead of being supplied by a runtime.
   Confidence: 4

4. I cannot know this without the article (the literal values and their spellings are the article's choice). The answer must
   have the following three-way shape, because the function is entered once per completion plus once at the start: one value
   for "never started / start", where control enters at the top of the body and issues the first request; one or more values
   for "waiting for a particular outstanding request", where control jumps past the corresponding wait to the code immediately
   following it (with results already stored into the saved-variable fields); and a final value for "finished", where control
   jumps to the epilogue that returns the result to the caller. If the example has two waits but only three values, then it is
   likely ordered as `start`, `resumed after the first wait`, `done`, with the second wait being the one whose completion
   arrives directly in the `done`-style branch.
   Confidence: 2

5. The saved state can sit at a fixed address because in this language the asynchronous function is never instantiated more
   than once at a time — no recursion and no nested/overlapping invocations — so the compiler can emit its token, saved
   variables and `state` as ordinary static (or per-object, single-slot) storage fixed at compile/link time, with no heap and
   no stack frame to preserve. The consequence is the restriction that there is at most **one simultaneous instance** of each
   asynchronous function: a second request cannot be started while the first is in flight, so the caller must not recurse
   into, re-enter, or share the async function between two tasks/threads/interrupt handlers.
   Confidence: 3

6. The reason is that a wait is not a no-op: while the function is suspended, arbitrary other code runs — other tasks, other
   requests, interrupt handlers — and it may mutate, free, or reuse exactly the objects the suspended function still holds
   pointers to, may invalidate its assumptions about device/global state, or may complete the very request in progress.
   Inserting a wait automatically at an arbitrary point therefore (a) forces the compiler to compute and save an arbitrary
   live-variable set that the programmer did not design for, and (b) can split an operation that had to be atomic with respect
   to the rest of the system. A stay-put point must be chosen by the programmer at a place where the invariants still hold,
   which is why hand-written waits at well-understood yield points are preferred.
   Confidence: 3
