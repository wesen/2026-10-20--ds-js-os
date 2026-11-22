# Answers — "8. Asynchrony as a Compiler Transformation"

I have not read the article. Everything below is my best reasoning from the question wording alone;
where a question turns on details I cannot see, I say so and describe what the answer would have to
look like.

## 1. What is a token, and what must the application do with it between request and completion?

A token is the handle an asynchronous request returns to the caller — an identifier (or small integer)
naming a pending operation that the runtime will later complete. Because the request returns before the
result exists, the application must *store* the token somewhere that outlives the call: typically in a
frame field, a table, or a global slot, so that when the completion arrives the runtime can match it to
the right continuation. It must also be prepared to treat the token as invalid (the operation may fail
or be cancelled), so the token is really a claim check the app holds across a gap in time rather than a
direct call result. Confidence: 3

## 2. In the `openFile` example, which variables are live at the second wait, and which are not? Justify `stop`.

I cannot know this without the article, but the shape of the answer is forced by the definition of
liveness: a variable is live at a point if some path from that point reads it before overwriting it. So at
the second wait the live set is exactly the values the remaining continuation still needs — most likely
the file handle/descriptor, the buffer being filled (and its length/cursor), and the token of the
operation in flight — while everything already consumed by the first call (the path string, the open
flags/mode, argument temporaries) is dead. `stop` is presumably a variable that was read only before the
second wait (its last use precedes the suspension point), so no continuation reads it afterwards;
therefore it must *not* be given a frame slot. The justification is always "last use before the wait,
no use after", not "it looks unimportant"; if any later read existed, `stop` would have to be saved.
Confidence: 2

## 3. In the Editor's hand-written code, which two fields together form the tag, and which fields are the saved variables?

I cannot know this without the article, so I can only describe the required form. A tag that
distinguishes the two continuations of opening a file is normally a pair of fields: one naming *which
operation* is being continued (something like `kind`/`op`/`mode` = "open") and one naming *where inside
that operation* resumption happens (something like `state`/`stage`/`step` = 0 for "request issued, wait
for result" and 1 for "result in hand, do the next thing"). The saved variables would be exactly the
live-across-wait locals of that code: the path, the target handle/descriptor slot, the buffer or length,
and any scratch value that the second continuation reads — the same set that a spilling compiler would
compute, arrived at by hand. Confidence: 2

## 4. The two entry points `start` and `resume`: what each is called with, and where `resume` continues per `frame.state`.

I cannot know the exact signatures without the article, but the contract is nearly forced by the design.
`start` is called with the function's ordinary parameters (plus whatever runtime/context the handoff
needs); it allocates or fills a frame, records the live arguments into it, runs until the first wait, and
returns a token or "still running" status. `resume` is called with a frame (or a token that is looked up
to a frame) plus the completion value of the wait that resumed it; it switches on `frame.state`, where
`0`/the initial value means "not yet entered" (re-entry before the first wait, or an error path), `1`
means "continue right after the first wait with the result in hand", `2` the second wait, and so on, with
each case ending either in another wait (new state plus a new token) or in a terminal state that returns
the result and releases the frame. A state the code does not recognise should be a hard error, not a
silent fall-through. Confidence: 2

## 5. Why the unit needing storage is the task, not the function; how frames are laid out; what restriction remains.

A task can outlive and outnumber any single function activation: the same function code can be
suspended several times at once (two files open concurrently, or recursion), so one frame per function —
a static slot per compiled function — would either collide or lose state. The compiler therefore
allocates a frame per *activation* (per task), sized and shaped from the union of all values live at any
wait in that function, with a state field and any continuation/parent link needed to model the logical
call chain, and it copies values in and out of frame slots at each suspension boundary. The remaining
restriction is almost certainly a suspension-scope one: waits are allowed only at points the
transformation can express, so not inside arbitrary expression positions, not across native/callback
boundaries, and possibly not through dynamically chosen call targets — the set of continuation points
must be statically known, and frame memory is finite, so deep or unbounded logical call chains are
limited by the frame pool. Confidence: 2

## 6. Why not insert waits automatically when fuel runs low?

I cannot know the article's stated reason without reading it, but the argument has to be about what a
wait does to the world. During a wait other code runs: other tasks, callbacks, maybe the network or a
timer, and they can mutate exactly the shared state, buffers and globals the suspended code was halfway
through updating, and the operation being waited on may fail or never complete. A wait is therefore only
safe where the programmer has decided that the intermediate state is consistent and may be observed —
inserting one automatically at an arbitrary low-fuel point breaks atomicity and invariant assumptions
the code was written under, and can also require saving state at a program point where no continuation
has been built. So low fuel should be handled by bounding work (smaller units, cheaper algorithms, or an
explicit wait the author placed), not by an invisible yield. Confidence: 2
