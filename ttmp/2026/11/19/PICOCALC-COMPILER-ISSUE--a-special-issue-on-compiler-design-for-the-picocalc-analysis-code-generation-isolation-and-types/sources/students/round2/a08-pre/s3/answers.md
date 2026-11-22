# Answers: "8. Asynchrony as a Compiler Transformation"

1. As I understand the setup, a token is an opaque value handed back by a request call that names one
   particular pending operation, so that the completion can later be matched to the request that
   caused it. The application cannot treat the result as available at the request; it must keep the
   token alive somewhere that survives (in its own saved state, not in a temporary) and hand it back
   when it asks whether the operation has completed, then read the result only at that point.
   Graphically it is a capability/receipt for one outstanding I/O job rather than the data itself.
   Confidence: 3

2. I cannot know this without the article, so the following is reasoning from the shape the example
   must have. If `openFile` waits twice (once for the open request, once for something like reading
   or closing), then the values that are live at the second wait are exactly the ones computed since
   the first wait that are still needed afterwards — typically the handle/fd and any buffer or
   counter produced by the first completion — plus any parameters that are used after the second
   wait. `stop` is the interesting case: the article says it is *not* live, which can only be
   justified by liveness, i.e. no path from the second wait to a use of `stop` before it is
   redefined, so it was only consumed in the prologue (as a loop bound, sentinel, buffer end or flag)
   and its slot can be reused rather than saved. The general rule must be: live at a wait iff some
   path from that wait reaches a read of the variable before a write.
   Confidence: 2

3. I cannot know this without the article. My best guess is that the tag is a pair of small
   integer fields — something like a program counter (`pc`/`state`) selecting the wait site plus a
   secondary field (`phase`/`sub`/`step`) selecting which of two alternative continuations of that
   site is meant — because one wait site in the hand-written code can be re-entered from two
   different call sites (open succeeded vs. open failed, or first call vs. retry), and a single
   integer would then be ambiguous. The saved variables would be the live locals at the wait,
   i.e. the parameters and intermediate results that the continuation reads before writing, encoded
   as fixed offsets in the frame; dead temporaries are omitted.
   Confidence: 2

4. Reasonably: `start` is called with the same arguments the original function took (plus, in some
   designs, the frame to fill in), allocates and initialises the frame, and runs synchronously until
   the first wait, at which point it records the state and returns the token or a "not done" marker.
   `resume` is called with the frame and the completion value (the token's result or an error), and
   switches on `frame.state`: the initial/entry value would be unreachable there (that is what
   `start` handles), each wait-site value continues after the corresponding request, and a terminal
   `done` value means the task has finished so `resume` does nothing (or just returns the value).
   Confidence: 2

5. I cannot know the article's exact wording, but the argument must be that a function is not a
   unit of execution with a unique lifetime: the same function can be entered again while an earlier
   activation is still suspended (re-entrancy from callbacks, two files opened at once, the same
   helper used by two tasks), so a single per-function frame would be clobbered by the second
   activation. The compiler therefore allocates a frame per *activation* and makes storage follow the
   task: frames are laid out as a fixed, statically sized set of slots (one per task, or per call
   site of a task) and the frame pointer is carried in the task rather than in the function. The
   restriction that remains is some form of static bounding — e.g. a compile-time known maximum
   number of concurrent tasks, or no recursion/recursive async calls, or a fixed depth per task —
   since without it the layout could not be sized ahead of time.
   Confidence: 2

6. The reason in terms of what can happen during a wait is that a wait is not a no-op: while it is
   pending, other tasks run and the outside world changes. If the compiler inserts a wait
   automatically when fuel runs low, it does so at an arbitrary instruction boundary chosen by the
   scheduler, not at a point the programmer designed, so a sequence the programmer wrote as one
   atomic step gets split and unrelated tasks can observe or mutate the intermediate state —
   shared invariants break, locks or handles may be re-entered, and the same program can behave
   differently depending on how much fuel it happened to have. Emission of waits should therefore
   stay at the explicit request points, where the programmer has already reasoned about what is
   consistent.
   Confidence: 3
