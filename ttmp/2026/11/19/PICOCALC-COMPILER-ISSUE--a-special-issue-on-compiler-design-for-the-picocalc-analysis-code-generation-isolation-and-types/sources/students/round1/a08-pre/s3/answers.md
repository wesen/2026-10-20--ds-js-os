# Answers — "8. Asynchrony as a Compiler Transformation"

Note: I was not given the article. These answers are reasoning from the question wording
and from general knowledge of how explicit-state / event-loop asynchrony is usually done.
Where a specific identifier or number from the article is required, I say so explicitly.

1. A token is a small handle (most plausibly an integer or a pointer to a per-request struct)
   that identifies one in-flight asynchronous request so the completion callback can tell which
   request finished. Because the language has no coroutines, the application cannot block; between
   issuing the request and its completion it must write everything it will need later into that
   token/state record, record where to resume, and return to the event loop. In other words the
   "waiting" is done by returning a value (the token) upward rather than by suspending.
   Confidence: 4

2. I cannot know this without the article, because the answer depends on the exact variables in the
   `openFile` example. The shape of the answer must be: at the second wait the live set is exactly
   the variables read by the code between the second wait and the function's exit — typically the
   handle/file descriptor if it is used again, the destination buffer the pending read fills, and
   any index or loop bound still consulted afterwards. Everything whose last use is before the
   second wait is dead — the path string (consumed by the open), the open mode, and any temporary
   used only to prepare the first request. `stop` would be justifiable as dead if its last use is
   the comparison that drove the loop/copy before the wait: liveness is "used on some path from
   here to exit", and there is no such path, so its slot need not be copied into the saved state.
   Confidence: 2

3. Defunctionalization replaces a first-class function (here: "the rest of the computation") with
   a data value that carries a *tag* saying which continuation it is and the *saved variables* that
   are the continuation's free variables. In the token, the tag is the `state` field and the saved
   variables are the copied locals/spills; resuming means dispatching on the tag with a `switch`
   and jumping to the matching label with the environment restored. It is "written by hand" because
   there is no compiler pass generating that struct and that switch — the programmer declares the
   fields, assigns the state numbers, and writes the dispatch themselves, which is why the article
   frames the manual style as the target that a transformation could later automate.
   Confidence: 4

4. I cannot know this without the article (the values may be named constants or magic numbers, and
   `openFile` may have a different number of suspension points than I assume). The three values must
   partition "where am I in the body": one value for *never started / entered fresh*, one for
   *suspended at the first wait*, one for *suspended at the second wait* — with the state set
   immediately before returning to the event loop, not after. On entry, `state == 0` falls into the
   top of the body, `state == 1` jumps to the label just after the first wait's request-send site
   (so the completed result is consumed and execution continues), and `state == 2` jumps to the
   label just after the second wait. That mapping is what makes the entry point a small dispatch
   switch rather than a plain function prologue.
   Confidence: 2

5. It can sit at a fixed address because the compiler can allocate static storage for the token —
   there is no recursion and no reentrancy requirement for asynchronous functions, and the target
   is a single-threaded event loop, so exactly one instance of "this function, in progress" exists
   at a time and its suspension point is unique at any moment. The follow-on restriction is that
   there can be at most one simultaneous in-flight instance per asynchronous function: a second
   call made while the first is still waiting would overwrite `state` and the saved variables, so
   the second completion would resume the wrong continuation with the wrong environment. Any
   concurrency in the application must therefore be achieved by having distinct functions (distinct
   static records), not by having many instances of one.
   Confidence: 3

6. The reason is that a wait is not a pause in a private world: while the function is suspended,
   the event loop runs other code, and that code can change exactly the state the function is
   depending on — globals and buffers it was mid-way through updating, and, per question 5, the
   function's own saved record if the same function is called again. So an automatically inserted
   wait silently converts an atomic sequence into an interruptible one, and it can only be placed
   where the live state is actually expressible in the saved record (not in the middle of an
   expression, and not while holding a resource that nothing else knows is held). The programmer
   knows which points are safe to make observable; the compiler only knows that fuel ran out, which
   says nothing about correctness of the interruption point.
   Confidence: 3
