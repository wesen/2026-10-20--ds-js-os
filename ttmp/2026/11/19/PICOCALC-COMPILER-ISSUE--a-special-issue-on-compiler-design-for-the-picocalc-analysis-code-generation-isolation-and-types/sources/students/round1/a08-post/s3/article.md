# 8. Asynchrony as a Compiler Transformation

A handler on this device may not wait. If it needs a file, or needs more time than one turn budget allows, it must return and continue later, when another event arrives. The typed Editor does this by hand, and the result is the hardest code in the project to read and to get right. This article shows what that code is, names the transformation the programmer is performing manually, and describes how a compiler can perform it instead. By the end you should be able to explain what a continuation is, identify which local variables must be saved across a wait, write the state-machine form of a small function with two waits, and say why the absence of recursion lets the saved state live at fixed addresses with no heap.

Article 1 defined *turn*, *turn budget* and *reactor*. Article 7 established that typed programs have no recursion. Both are used here.

## 8.1 Split-phase operations

Every operation in the system that takes time is **split-phase**: it has a request and, later, a completion, and they are separate events. To read a file, an application calls a reactor function that starts the read and returns at once with a **token**, a number identifying the request. The handler then returns to the nucleus. When the storage system finishes, the nucleus delivers a new event that carries the same token. The application must recognize the token and carry on from where it stopped.

The same mechanism serves long computations. A handler that has used most of its budget asks for a timer of zero delay, receives a token, and returns. Other worlds run. The timer event arrives with the token, and the handler continues.

The term *split-phase* comes from TinyOS, the operating system for sensor nodes, whose language nesC makes it the rule for every long-latency operation: a command returns immediately and completion is signalled later by an event [Gay et al. 2003]. The design is the right one for a machine with one stack and a few hundred kilobytes of fast memory. Its cost falls on the programmer.

## 8.2 What the programmer does by hand

Here is the task "open a file and prepare it for editing" as one would like to write it. The document must be read from storage, and then every line ending must be normalized, which for a 64 KiB file takes longer than one turn budget.

```
// Wished-for source. `await` is not in the language today.
async function openFile(handle: i32, state: WorldState): i32 {
    const ok = await typedSdkFileRead(handle);        // wait 1: storage
    if (!ok) return 0;
    const text = typedSdkBuffer(0);
    const length = state.sourceLength;
    let read = 0;
    let written = 0;
    while (read < length) {
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

The language has no `await`, so the Editor's author wrote something else. The loop's progress lives in fields of `WorldState`, the record the reactor keeps between events. One function performs a single slice of the work:

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

and the application's single event handler examines every incoming event against every operation that might be outstanding:

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

Editor has five such tokens and 71 state fields. The search routine alone keeps a phase number and six positions in the record so that it can stop after 1,024 units of work and resume.

Three things have happened to the wished-for function. Its body has been cut into pieces at each wait. Its local variables have been moved into a long-lived record. Its control flow, the fact that normalization follows the read, is no longer written anywhere; it is implied by which token is non-zero.

This phenomenon has a name. Adya and colleagues, describing event-driven servers, wrote that "manual stack management requires a programmer to rip the code for any given task into event handlers", listed the consequences ("two or more language functions represent a single conceptual function"; variables "must be moved into a new state structure stored on the heap"; "conceptual functions with loops must be ripped into more than two pieces"), and concluded: "We call this phenomenon 'stack ripping' and see it as the primary drawback to manual stack management" [Adya et al. 2002].

The project's design notes and tests show the hazards one would predict. The tests deliver a timer event that belongs to a different job, to confirm that it does not advance the current one. Opening another file must discard a pending preview so that its completion, arriving later, is ignored. The reply to an open request had to be delayed until the first screen was ready, because otherwise the next key press could meet a half-built state.

## 8.3 Continuations, and their representation as data

The concept that organizes all of this is the **continuation**. At any point in a running function, the continuation is *what remains to be done*: the rest of the function's code together with the values of the variables that code will use. When `openFile` reaches its first wait, the continuation is "check `ok`, then normalize, then set the length". To wait is to save the continuation somewhere, return, and later run it.

A continuation contains code, and the typed language has no values that contain code. The classical answer is **defunctionalization**, introduced by Reynolds: replace each function-like value by a small data record consisting of a *tag* that says which piece of code is meant and the values of the variables that code needs; replace "call it" by "look at the tag and jump to the corresponding code" [Reynolds 1972; Danvy & Nielsen 2001].

Applied to `openFile`, there are two waits and therefore two possible continuations. The record needs a tag with the values 1 and 2, and the variables each continuation uses. That record is exactly what the Editor's author built by hand: `readToken` being non-zero is tag 1, `unitsRead` and `unitsWritten` and `sourceLength` are the saved variables of continuation 2. The sentence "the token fields are defunctionalized continuations written by hand" means precisely this.

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
| `text` | not yet assigned | see below |

Three integers must be saved, and only at the second wait. The hand-written version saves the same three. The compiler finds them by the same analysis it would use to allocate registers.

The variable `text` raises a different question. It is a reference to a buffer that the reactor lends to the application for the duration of one event. After a wait, the reference may no longer be valid, and the Editor's design notes say so: code "should reacquire the view in each incoming event". The compiler can turn that convention into a rule: *a variable of type `string` or `buffer` may not be live across a wait.* A program that breaks the rule is rejected with a message naming the variable and the wait. In the example the remedy is to call `typedSdkBuffer(0)` again after the yield. Only scalars cross a wait, which is also the restriction the reactor already places on `WorldState`.

## 8.5 The generated state machine

The compiler's output for `openFile` consists of a static **frame** and a rewritten function. The frame is a group of fields at a fixed position in the application's persistent state:

| Field | Meaning |
| --- | --- |
| `state` | 0 = not running, 1 = waiting for the read, 2 = waiting for the yield |
| `token` | The token of the operation being waited for |
| `length`, `read`, `written` | The variables live across wait 2 |

The function is rewritten so that it can be entered at any of three places. In outline:

```
openFile.step(event, state):
    switch frame.state:
      case 0:                                   // first entry
        frame.token = typedSdkFileRead(handle)
        frame.state = 1
        return LATER
      case 1:                                   // after the read
        if not event.ok: frame.state = 0; return DONE(0)
        length = state.sourceLength; read = 0; written = 0
        goto loop_test
      case 2:                                   // after a yield
        length = frame.length; read = frame.read; written = frame.written
        goto loop_test
    loop_test:
        if read >= length:
            state.textLength = written; frame.state = 0; return DONE(1)
        stop = min(length, read + 4096)
        ... copy units until read == stop ...
        frame.length = length; frame.read = read; frame.written = written
        frame.token = typedSdkYield()
        frame.state = 2
        return LATER
```

The compiler also generates the dispatcher that the author currently writes by hand: for each frame whose `state` is not zero, compare the incoming event's token with `frame.token` and, on a match, call the corresponding `step`. An event whose token matches nothing is ignored. Cancelling an operation is setting its frame's `state` to zero; a completion that arrives afterwards finds no match.

In WebAssembly the `switch` at the top is a single table-jump instruction, and the jump into the middle of the loop is expressed by placing the whole body inside one loop that dispatches on a state number. This is the standard compilation of `async` functions in C#, whose semantics have been formalized [Bierman et al. 2012], and of generators and asynchronous functions in many other languages.

The transformation, stated as an algorithm:

```
for each async function f:
    number its wait points 1..n
    compute the variables live at each wait point
    reject any live variable of type string or buffer
    give f a static frame: state, token, and one field per variable live at some wait
    rewrite f:
        on entry, jump according to frame.state
        at wait k: store the live variables, store the token, set state = k, return LATER
        at each resume point: reload the live variables
        on completion: set state = 0
add f to the generated dispatcher
```

## 8.6 Why the frames can be static

In a language with recursion, a function can be active many times at once, each activation with its own variables, so saved continuations must be allocated dynamically. Article 7 showed that typed programs have an acyclic call graph. A function can therefore be active at most once on any chain of calls, and one fixed frame per asynchronous function suffices. The textbook describes the same reasoning for the simplest case: "If a procedure q calls no other procedures, then q can never have multiple active invocations", so that "the compiler can statically allocate" its activation record [Cooper & Torczon 2023, §6.3]. Without recursion the argument extends to every function.

The consequences are substantial for a device with no general-purpose heap in the typed language.

- The total size of all frames is known at compile time. It can be checked against the reactor's limit when the program is compiled; Editor's 71 hand-managed fields would become a computed number.
- No allocation can fail at run time.
- An asynchronous function that calls another asynchronous function simply records that it is waiting on the callee's frame. Because the call graph is fixed, the dispatcher that resumes the caller when the callee completes is also generated statically.

One restriction follows. A single static frame means a single instance. If an application needs two reads outstanding at once, it needs two frames, and the compiler must know that number. The usual design gives each asynchronous function one frame by default, lets the program declare a larger fixed number, and makes starting an instance when all frames are busy a visible result that the program must handle.

Several systems for small devices embody the same design. Protothreads give C programs a sequential style on top of events by recording only a resume point, at a cost of two bytes per thread; they do not preserve local variables across a wait, which the programmer must work around [Dunkels et al. 2006]. The Céu language compiles `await` and parallel compositions to a single-threaded program with statically allocated state, and its semantics have been proved to give reactions that are memory-bounded, deterministic and terminating [Sant'Anna et al. 2013; Santos et al. 2018]. Embassy, an asynchronous framework for Rust on microcontrollers, states that tasks "get transformed at compile time into state machines", require "no dynamic memory allocation", and that each task's storage is a static whose size is computed at compile time, so that running out is an error at link time. Liveness-based saving, as described here, sits between protothreads and these systems: it preserves exactly the variables that need preserving.

## 8.7 Waits, budgets and what stays explicit

Article 7 proposed a fuel counter that ends a turn when a loop runs too long. It is tempting to combine the two mechanisms and have the compiler insert a wait automatically wherever fuel runs low, so that programmers could write plain loops and never mention yielding.

This issue recommends against that. A wait is a point at which other events are handled and the application's state may change. In the example, a key press handled between two slices could modify the very document being normalized; the Editor guards against this by keeping the open request pending. The author must know where such interleavings can occur in order to reason about them, and an explicit `await` in the source marks exactly those places. Adya and colleagues make the same argument for cooperative scheduling in general: its value is the ease of reasoning it gives, because control is given up only where the program says so.

The two mechanisms therefore have separate roles. `await typedSdkYield()` is how a correct program divides long work. Fuel is what stops an incorrect one.

## 8.8 Key points

- Every long operation on the device is split-phase: a request that returns a token, and a later completion event carrying it.
- Without language support, the programmer cuts each task into handlers, moves its variables into persistent fields and matches tokens by hand. This is stack ripping, and Editor's 71 state fields and five tokens are an instance.
- A continuation is the rest of a computation. Defunctionalization represents it as a tag plus saved variables, which is what the hand-written fields are.
- Only variables live across a wait need saving. References to reactor buffers must not be live across a wait and should be rejected by the compiler.
- An `async` function compiles to a static frame and a function that dispatches on a state number. The token matching is generated.
- Because typed programs have no recursion, each asynchronous function needs one frame of fixed size, and the total is known at compile time.
- Waits should stay explicit in the source, because they are the points where other events may change state.

## 8.9 Check your understanding

1. What is a token in this system, and what must an application do with it between a request and its completion?
2. In the `openFile` example, which variables are live at the second wait and which are not? Justify `stop`.
3. Explain the statement "the token fields are defunctionalized continuations written by hand", using the terms *tag* and *saved variables*.
4. Write the three possible values of the `state` field for `openFile` and say, for each, where execution continues when the function is entered.
5. Why can the saved state of an asynchronous function be placed at a fixed address in this language, and what restriction on the number of simultaneous instances follows?
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
