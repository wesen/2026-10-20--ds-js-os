# 8. Asynchrony as a Compiler Transformation

A handler on this device may not wait. If it needs a file, or needs more time than one turn budget allows, it must return and continue later, when another event arrives. The typed Editor does this by hand, and the result is the hardest code in the project to read and to get right. This article shows what that code is, names the transformation the programmer is performing manually, and describes how a compiler can perform it instead. By the end you should be able to explain what a continuation is, identify which local variables must be saved across a wait, write the state-machine form of a small function with two waits, and say why the absence of recursion lets the saved state live at fixed addresses with no heap.

From Article 1 this article uses four terms: a *world* is one scheduled program; the *nucleus* is the kernel that schedules worlds and delivers events to them; a *turn* is the handling of one event, and the *turn budget* is the longest it may run without returning (200 ms for Editor); the *reactor* is the prebuilt C module through which a compiled application calls the system. Reactor functions have names beginning `typedSdk`. Article 7 established that programs in the typed language have no recursion, which section 8.6 relies on.

## 8.1 Split-phase operations

Every operation in the system that takes time is **split-phase**: it has a request and, later, a completion, and they are separate events. To read a file, an application calls a reactor function that starts the read and returns at once with a **token**, a number identifying the request. The handler then returns to the nucleus. When the storage system finishes, the nucleus delivers a new event that carries the same token and a flag, `ok`, saying whether the operation succeeded. The application must recognize the token and carry on from where it stopped.

The same mechanism serves long computations. A handler that has used most of its budget asks for a timer of zero delay, receives a token, and returns. Other worlds run. The timer event arrives with the token, and the handler continues.

The term *split-phase* comes from TinyOS, the operating system for sensor nodes, whose language nesC makes it the rule for every long-latency operation: a command returns immediately and completion is signalled later by an event [Gay et al. 2003]. The design is the right one for a machine with one stack and a few hundred kilobytes of fast memory. Its cost falls on the programmer.

## 8.2 What the programmer does by hand

Here is the task "open a file and prepare it for editing" as one would like to write it. The document must be read from storage, and then every line ending must be normalized, which for a 64 KiB file takes longer than one turn budget.

```
// Wished-for source. `await` is not in the language today.
async function openFile(handle: i32, state: WorldState): i32 {
    const ok = await typedSdkFileRead(handle);        // wait 1: storage
    if (!ok) return 0;
    const length = state.sourceLength;
    let read = 0;
    let written = 0;
    while (read < length) {
        const text = typedSdkBuffer(0);               // obtained afresh for every slice
        const stop = Math.min(length, read + 4096);
        while (read < stop) {
            // copy one unit from position `read` to position `written`,
            // turning CR LF and CR into LF
        }
        await typedSdkYield();                        // wait 2: let other worlds run
    }
    state.textLength = written;
    return 1;
}
```

In this listing `typedSdkFileRead` starts a read and returns a token, `typedSdkBuffer(0)` returns the document buffer, and `typedSdkYield` asks for a timer of zero delay.

The language has no `await`, so the Editor's author wrote something else. The loop's progress lives in fields of `WorldState`, a record of scalar fields that the reactor keeps for the application between events and passes to every handler. One function performs a single slice of the work:

```
function editorNormalize(text: buffer, state: WorldState): i32 {
    let read = state.unitsRead;
    let written = state.unitsWritten;
    const stop = Math.min(state.sourceLength, read + 4096);
    while (read < stop) { /* copy one unit */ }
    state.unitsRead = read;
    state.unitsWritten = written;
    return written;
}
```

and the application's single event handler (in `worlds/editor/editor.typed`) examines every incoming event against every operation that might be outstanding. An event of kind 4 is the completion of an earlier request:

```
function typedWorldEvent(event: WorldEvent, state: WorldState, ...): i32 {
    if (event.kind === 4 && state.writeToken > 0 && event.token === state.writeToken)   { ... }
    if (event.kind === 4 && state.readToken > 0 && event.token === state.readToken)     { ... }
    if (event.kind === 4 && state.previewToken > 0 && event.token === state.previewToken) { ... }
    if (event.kind === 4 && state.findToken > 0 && event.token === state.findToken)     { ... }
    if (event.kind === 4 && state.frameToken > 0 && event.token === state.frameToken)   { ... }
    ...
}
```

Editor has five such tokens and 71 state fields. The search routine alone (`worlds/editor/find.typed`) keeps a phase number and six positions in the record so that it can stop after a fixed amount of work, which it counts in units up to 1,024, and resume.

Three things have happened to the wished-for function. Its body has been cut into pieces at each wait. Its local variables have been moved into a long-lived record. Its control flow, the fact that normalization follows the read, is no longer written in one place; it is spread over the handlers and expressed through the values of `readToken` and a flag.

This phenomenon has a name. Adya and colleagues, describing event-driven servers, wrote that "manual stack management requires a programmer to rip the code for any given task into event handlers", listed the consequences ("two or more language functions represent a single conceptual function"; variables "must be moved into a new state structure stored on the heap"; "conceptual functions with loops must be ripped into more than two pieces"), and concluded: "We call this phenomenon 'stack ripping' and see it as the primary drawback to manual stack management" [Adya et al. 2002].

The project's design notes and tests for the Editor show the hazards one would predict. The tests deliver a timer event that belongs to a different job, to confirm that it does not advance the current one. Opening another file must discard a pending preview so that its completion, arriving later, is ignored. The reply to an open request had to be delayed until the first screen was ready, because otherwise the next key press could meet a half-built state.

## 8.3 Continuations, and their representation as data

The concept that organizes all of this is the **continuation**. At any point in a running function, the continuation is *what remains to be done*: the rest of the function's code together with the values of the variables that code will use. When `openFile` reaches its first wait, the continuation is "check `ok`, then normalize, then set the length". To wait is to save the continuation somewhere, return, and later run it.

A continuation contains code, and the typed language has no values that contain code. The classical answer is **defunctionalization**, introduced by Reynolds: replace each function-like value by a small data record consisting of a *tag* that says which piece of code is meant and the values of the variables that code needs; replace "call it" by "look at the tag and jump to the corresponding code" [Reynolds 1972; Danvy & Nielsen 2001].

Applied to `openFile`, there are two waits and therefore two possible continuations. The record needs a tag that distinguishes them, and the variables each continuation uses. That record is exactly what the Editor's author built by hand. The tag is spread over two fields: `readToken` is non-zero while either wait is outstanding, and a boolean field `reading` is false during the first wait (for storage) and true during the second (between slices of normalization). The saved variables of the second continuation are `unitsRead`, `unitsWritten` and `sourceLength`. The sentence "the token fields are defunctionalized continuations written by hand" means precisely this.

Lauer and Needham observed long ago that a system built from events and one built from sequential processes are two notations for the same thing and can be converted into each other mechanically [Lauer & Needham 1979]. A mechanical conversion is work for a compiler.

## 8.4 Which variables must be saved

A variable needs saving across a wait only if its current value will be read afterwards. That property is **liveness**, a standard data-flow fact: a variable is live at a point if some path from that point reads it before writing it [Cooper & Torczon 2023, §9.2.2]. Mark each variable of `openFile` at each wait.

| Variable | At wait 1 (file read) | At wait 2 (yield in the loop) |
| --- | --- | --- |
| `handle` | dead: not used again | dead |
| `ok` | not yet assigned | dead: already tested |
| `length` | not yet assigned | **live**: the loop test reads it |
| `read` | not yet assigned | **live** |
| `written` | not yet assigned | **live** |
| `stop` | not yet assigned | dead: recomputed on every outer iteration |
| `text` | not yet assigned | dead: obtained again at the start of every slice; see below |
| `state` | a parameter | a parameter, supplied again by the reactor on every event |

Three integers must be saved, and only at the second wait. The hand-written version saves the same three, under the names `sourceLength`, `unitsRead` and `unitsWritten`. Liveness is also the information a compiler needs to decide which values may share a register, so the analysis is a standard component and not something special to `await`.

The variable `text` raises a different question. It is a reference to a buffer that the reactor lends to the application for the duration of one event. After a wait, the reference may no longer be valid, and the Editor's design notes say so: code "should reacquire the view in each incoming event". The compiler can turn that convention into a rule: *a variable of type `string` or `buffer` may not be live across a wait.* A program that breaks the rule is rejected with a message naming the variable and the wait. The example obeys the rule by calling `typedSdkBuffer(0)` at the start of each slice, inside the loop. Had the call been placed once before the loop, `text` would be live across the yield and the program would be rejected. The saved values that cross a wait are therefore all scalars, which matches the reactor's existing rule that `WorldState` may contain only scalar fields. The `state` record itself is not saved by the function: the reactor owns it and passes it in again with every event.

## 8.5 The generated state machine

The compiler's output for `openFile` consists of a static **frame** and a rewritten function. The frame is a group of fields at a fixed position in the application's persistent state. The table sets it beside what the Editor's author wrote by hand.

| In the wished-for source | Hand-written field today | Field of the generated frame |
| --- | --- | --- |
| Which wait is outstanding | `readToken` non-zero, together with the flag `reading` | `frame.state`: 0 = not running, 1 = waiting for the read, 2 = waiting for the yield |
| The token being waited for | `readToken` | `frame.token` |
| `length` | `sourceLength` | `frame.length` |
| `read` | `unitsRead` | `frame.read` |
| `written` | `unitsWritten` | `frame.written` |

The function is rewritten into two entry points. `start` is called once with the function's arguments and runs to the first wait. `resume` is called for each matching completion event and continues from the recorded place. Each returns one of two results: `LATER`, meaning the task is still waiting, or `DONE` with the function's value. In outline:

```
openFile.start(handle, state):
    frame.token = typedSdkFileRead(handle)      // `handle` is used here and never again
    frame.state = 1
    return LATER

openFile.resume(event, state):
    switch frame.state:
      case 1:                                   // after the read; `ok` arrives in the event
        if not event.ok: frame.state = 0; return DONE(0)
        length = state.sourceLength; read = 0; written = 0
        goto loop_test
      case 2:                                   // after a yield
        length = frame.length; read = frame.read; written = frame.written
        goto loop_test
    loop_test:
        text = typedSdkBuffer(0)                // obtained afresh; never saved
        if read >= length:
            state.textLength = written; frame.state = 0; return DONE(1)
        stop = min(length, read + 4096)
        ... copy units until read == stop ...
        frame.length = length; frame.read = read; frame.written = written
        frame.token = typedSdkYield()
        frame.state = 2
        return LATER
```

The compiler also generates the dispatcher that the author currently writes by hand: for each frame whose `state` is not zero, compare the incoming event's token with `frame.token` and, on a match, call the corresponding `resume`. An event whose token matches nothing is ignored. Cancelling an operation is setting its frame's `state` to zero; a completion that arrives afterwards finds no match.

WebAssembly has no `goto`, so the jump into the middle of the loop is arranged differently. The function body is cut into numbered pieces at the waits and at loop boundaries, and the pieces are placed as the cases of one `switch` inside one outer loop; "go to piece *k*" becomes "set a variable to *k* and go round the outer loop". The `switch` itself is a single WebAssembly instruction that jumps according to a number. This is the standard compilation of `async` functions in C#, whose semantics have been formalized [Bierman et al. 2012], and of generators and asynchronous functions in many other languages.

The transformation, stated as an algorithm:

```
for each async function f:
    number its wait points 1..n
    compute the variables live at each wait point
    reject any live variable of type string or buffer
    define f's frame layout: state, token, and one field per variable live at some wait
    rewrite f into start and resume:
        start runs from the beginning to the first wait
        resume jumps according to frame.state
        at wait k: store the live variables, store the token, set state = k, return LATER
        at each resume point: reload the live variables
        on completion: set state = 0
for each kind of task (section 8.6):
    allocate one instance of the frame of every async function the task can reach
    add those frames to the generated dispatcher
```

## 8.6 Why the frames can be static

In a language with recursion, a function can be active many times at once within a single chain of calls, each activation with its own variables, so saved continuations must be allocated dynamically. Article 7 showed that typed programs have an acyclic call graph. A function can therefore appear at most once on any chain of calls. The textbook describes the same reasoning for the simplest case: "If a procedure q calls no other procedures, then q can never have multiple active invocations", so that "the compiler can statically allocate" its activation record [Cooper & Torczon 2023, §6.3]. Without recursion the argument extends to every function on a chain.

A chain of asynchronous calls belongs to a **task**: one piece of work started by an event, such as "open this file" or "find the next match". Several tasks can be suspended at the same time, for example a search and a file write, and two tasks may both use the same helper function. The unit that needs storage is therefore the task. For each kind of task, the compiler walks the call graph from the task's top-level function and lays out one frame for every asynchronous function it can reach. A helper used by two kinds of task gets a frame in each.

The consequences are substantial for a device with no general-purpose heap in the typed language.

- The total size of all frames is known at compile time. It can be checked against the reactor's limit, currently 80 scalar fields, when the program is compiled. Editor's 71 hand-managed fields would become a number the compiler computes; Article 10 lists as a test of this proposal that the computed number should not exceed 71.
- No allocation can fail at run time.
- When an asynchronous function awaits another, the token of the outstanding operation is held in the innermost function's frame, and the caller's frame records only "waiting for my callee" in its `state`. The dispatcher resumes the innermost function. When that function completes, the generated code must continue the right caller. If the callee is awaited from one place only, that caller is known at compile time and its `resume` is called directly. If it is awaited from several places, the caller writes a small number identifying the place into the callee's frame before starting it, and the callee's completion code switches on that number.

One restriction follows. One set of frames per kind of task means one instance of that task at a time. If an application needs two searches in progress at once, it needs two sets, and the compiler must know that number. The usual design gives each kind of task one set by default, lets the program declare a larger fixed number, and makes starting a task when all its sets are busy a visible result that the program must handle. The Editor already behaves this way by hand: it refuses a request to open a file while a save is still in progress, and replies "The editor is saving."

Several systems for small devices embody the same design. Protothreads give C programs a sequential style on top of events by recording only a resume point, which their authors report costs two bytes of memory per thread; they do not preserve local variables across a wait, which the programmer must work around [Dunkels et al. 2006]. The Céu language compiles `await` and parallel compositions to a single-threaded program with statically allocated state, and its semantics have been proved to give reactions that are memory-bounded, deterministic and terminating [Sant'Anna et al. 2013; Santos et al. 2018]. Embassy, an asynchronous framework for Rust on microcontrollers, states that tasks "get transformed at compile time into state machines", require "no dynamic memory allocation", and that each task's storage is a static whose size is computed at compile time, so that running out is an error at link time. Liveness-based saving, as described here, sits between protothreads and these systems: it preserves exactly the variables that need preserving.

## 8.7 Waits, budgets and what stays explicit

Article 7 proposed a fuel counter that ends a turn when a loop runs too long. It is tempting to combine the two mechanisms and have the compiler insert a wait automatically wherever fuel runs low, so that programmers could write plain loops and never mention yielding.

This issue recommends against that. A wait is a point at which other events are handled and the application's state may change. In the example, a key press handled between two slices could modify the very document being normalized; the Editor guards against this by keeping the open request pending. The author must know where such interleavings can occur in order to reason about them, and an explicit `await` in the source marks exactly those places. Adya and colleagues make the same argument for cooperative scheduling in general: its value is the ease of reasoning it gives, because control is given up only where the program says so.

The two mechanisms therefore have separate roles. `await typedSdkYield()` is how a correct program divides long work. Fuel is what stops an incorrect one.

## 8.8 Key points

- Every long operation on the device is split-phase: a request that returns a token, and a later completion event carrying it.
- Without language support, the programmer cuts each task into handlers, moves its variables into persistent fields and matches tokens by hand. This is stack ripping, and Editor's 71 state fields and five tokens are an instance.
- A continuation is the rest of a computation. Defunctionalization represents it as a tag plus saved variables, which is what the hand-written fields are.
- Only variables live across a wait need saving. References to reactor buffers must not be live across a wait and should be rejected by the compiler.
- An `async` function compiles to a frame layout and a pair of functions, `start` and `resume`, the second of which dispatches on a state number. The token matching is generated.
- Because typed programs have no recursion, each kind of task needs one frame of fixed size for every asynchronous function it can reach, and the total is known at compile time.
- Waits should stay explicit in the source, because they are the points where other events may change state.

## 8.9 Check your understanding

1. What is a token in this system, and what must an application do with it between a request and its completion?
2. In the `openFile` example, which variables are live at the second wait and which are not? Justify `stop`.
3. In the Editor's hand-written code, which two fields together form the tag that distinguishes the two continuations of opening a file, and which fields are the saved variables?
4. The generated code has two entry points, `start` and `resume`. Say what each one is called with, and for each value of `frame.state` where `resume` continues.
5. Section 8.6 says the unit that needs storage is the task, not the function. Explain why one frame per function is not enough, how the compiler lays frames out instead, and what restriction remains.
6. The article advises against inserting waits automatically when fuel runs low. State the reason in terms of what can happen during a wait.

## References

- [Adya et al. 2002] A. Adya, J. Howell, M. Theimer, W. J. Bolosky, J. R. Douceur. "Cooperative task management without manual stack management." *USENIX Annual Technical Conference*, 2002.
- [Bierman et al. 2012] G. Bierman, C. Russo, G. Mainland, E. Meijer, M. Torgersen. "Pause 'n' play: formalizing asynchronous C#." *ECOOP*, 2012.
- [Cooper & Torczon 2023] K. D. Cooper, L. Torczon. *Engineering a Compiler*, 3rd edition. Morgan Kaufmann, 2023. §6.3 (static allocation of activation records), §9.2.2 (live variables).
- [Danvy & Nielsen 2001] O. Danvy, L. R. Nielsen. "Defunctionalization at work." *PPDP*, 2001.
- [Dunkels et al. 2006] A. Dunkels, O. Schmidt, T. Voigt, M. Ali. "Protothreads: simplifying event-driven programming of memory-constrained embedded systems." *SenSys*, 2006.
- [Gay et al. 2003] D. Gay, P. Levis, R. von Behren, M. Welsh, E. Brewer, D. Culler. "The nesC language: a holistic approach to networked embedded systems." *PLDI*, 2003.
- [Lauer & Needham 1979] H. C. Lauer, R. M. Needham. "On the duality of operating system structures." *ACM SIGOPS Operating Systems Review* 13(2), 1979.
- [Reynolds 1972] J. C. Reynolds. "Definitional interpreters for higher-order programming languages." *ACM Annual Conference*, 1972.
- [Sant'Anna et al. 2013] F. Sant'Anna, N. Rodriguez, R. Ierusalimschy, O. Landsiedel, P. Tsigas. "Safe system-level concurrency on resource-constrained nodes." *SenSys*, 2013.
- [Santos et al. 2018] R. C. M. Santos, G. F. Lima, F. Sant'Anna, R. Ierusalimschy, E. H. Haeusler. "A memory-bounded, deterministic and terminating semantics for the synchronous programming language Céu." *LCTES*, 2018.
- Embassy project documentation, embassy.dev (executor section) and repository README.
