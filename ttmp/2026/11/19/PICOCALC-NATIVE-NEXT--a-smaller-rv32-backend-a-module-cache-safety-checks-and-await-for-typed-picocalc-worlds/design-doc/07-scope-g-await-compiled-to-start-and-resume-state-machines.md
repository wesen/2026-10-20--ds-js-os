---
Title: 'Scope G: await compiled to start and resume state machines'
Ticket: PICOCALC-NATIVE-NEXT
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/worlds/editor/editor.typed
      Note: Open path rewritten in G3
    - Path: repo://picocalc-os/worlds/editor/find.typed
      Note: Find path rewritten in G4
    - Path: repo://picocalc-os/worlds/editor/state.typed
      Note: The 71 state fields
ExternalSources: []
Summary: 'Tasks G1 to G4: async and await with liveness and static frames, generated state machines and dispatcher, and the open and find paths of the Editor rewritten, accepted at no more than 71 state fields.'
LastUpdated: 2026-11-19T15:05:41.602183442-05:00
WhatFor: Implementation guide for await.
WhenToUse: When working on asynchrony in the typed language or the Editor's event handler.
---

# Scope G: `await` compiled to start and resume state machines

This document describes four tasks. G1 adds `async` functions and `await` to the language as far as analysis: the compiler finds the waits, computes which variables are live across each, rejects a string or buffer that is live across a wait, and lays out a frame. G2 generates the state machine, the operations that start, resume and cancel a task, and the dispatcher that matches completion events to waiting frames. G3 and G4 rewrite the two hardest hand-written paths of the Editor with it, opening a file and finding text, and are accepted when every existing Editor replay still matches and the state record has no more than 71 fields.

Read Article 8 in full before this document. Its section 8.5 gives the transformation in outline; this document fixes the decisions that section leaves open.

## G.1 What the Editor does by hand

A handler may not wait. An operation that takes time returns a **token**, the handler returns, and a later event of kind 4 carries the same token and a flag `ok`. The Editor's single event handler, `typedWorldEvent` in `picocalc-os/worlds/editor/editor.typed` (lines 175 to 204), therefore compares every incoming event with five stored tokens:

```
if (event.kind === 4 && state.writeToken > 0 && event.token === state.writeToken)     { … }
if (event.kind === 4 && state.readToken > 0 && event.token === state.readToken)       { … }
if (event.kind === 4 && state.previewToken > 0 && event.token === state.previewToken) { … }
if (event.kind === 4 && state.findToken > 0 && event.token === state.findToken)       { … }
if (event.kind === 4 && state.frameToken > 0 && event.token === state.frameToken)     { … }
```

Opening a file is spread over ten functions in the same file, of which these carry the continuation: `editorOpen` (line 54) starts the read and stores `readToken`; `editorReadDone` (line 162) runs when the read completes and distinguishes, through the flag `state.reading`, a completed read from a completed pause; `editorReadSuccess` (line 140) takes the text; `editorNormalize` (line 14) converts line endings for at most 4,096 units and stores its progress in `unitsRead` and `unitsWritten`; `editorDeferRead` (line 126) asks for a zero-delay timer with `typedSdkYield` and stores its token again in `readToken`; `editorContinueRead` and `editorResumeRead` (lines 134, 152) continue. Five fields of `WorldState` (`picocalc-os/worlds/editor/state.typed`, lines 12 to 18) exist only to carry this: `readToken`, `reading`, `sourceLength`, `unitsRead`, `unitsWritten`. `WorldState` has 71 fields in all, and the reactor allows 80 (`world.c`, line 21; `typed-world.js`, line 49).

Article 8 calls the token fields continuations written by hand. The tasks below make the compiler write them.

## G.2 Design decisions

Article 8 describes the transformation for one function. Five things have to be decided to make it work in this compiler, and they are decided here.

**1. Where `await` may appear.** Only at the top of a statement, in one of three forms: `await f(args);`, `const x = await f(args);` (or `let`), and `x = await f(args);`. It may stand inside `if` blocks and loop bodies of an `async` function. It may not be nested inside an expression. This keeps the points at which a function can be suspended at statement boundaries, where the operand stack is empty.

**2. What can be awaited.** Two things. A reactor function that returns a token, marked `"awaitable": true` in the interface description of D1: `typedSdkFileRead`, `typedSdkWriteSnapshot` and `typedSdkYield` today. The value of the `await` is a `bool`: `false` at once if the token is zero or negative (the request could not be started), otherwise the `ok` flag of the completion event. And another `async` function; the value of the `await` is its return value.

**3. Where frames live.** In the state record. The compiler appends the frame fields to `WorldState`, after the fields the source declares. They count against the reactor's limit of 80 like any other field, which is what makes "no more than 71 fields" a property the compiler can report. Every `async` function must have a parameter of type `WorldState`.

**4. Which parameters are re-supplied.** The reactor passes `event`, `state`, `output` and `hints` to the handler with every event. An `async` function may have parameters of reference type only if they have the name and type of one of the handler's parameters; these are the **ambient** parameters, and the generated code passes the current ones in on every resume. A scalar parameter is an ordinary variable and is saved if it is live across a wait.

**5. How a task is started, resumed and cancelled.** Four built-in forms, usable in ordinary functions:

| Form | Type | Meaning |
| --- | --- | --- |
| `start f(args)` | `bool` | Begin a task with the `async` function `f`. `false` if that task is already running; then nothing happens. |
| `resume()` | `bool` | Usable in the handler. If the current event is the completion a waiting frame expects, run that task until its next wait or its end and return `true`. Otherwise `false`. |
| `pending()` | `bool` | Some task is waiting. |
| `cancel f` | statement | Set the state of every frame of task `f` to zero. A completion that arrives later matches nothing. |

A **task** is an `async` function named in a `start`. The compiler lays out one frame for every `async` function reachable from it through `await`, so one instance of each task can run at a time, and a helper awaited by two tasks has a frame in each.

**6. How the state machine is produced.** By rewriting the `async` function into ordinary typed source text, which the existing frontend then compiles. The result of the rewrite can be printed and read, tested as text, and compared with the hand-written code it replaces. The frontend stays a one-pass emitter; only `async` functions pass through a small structural parser first.

---

## Task G1: `async`, `await`, liveness and frame layout

**Goal.** Parse `async` functions into a statement tree, number their waits, compute the variables live across each wait, reject a string or buffer that is live across a wait, and report the frame layout of every task, without yet generating code.

**Where to look.**
- `typed-wasm.js`: `Lexer` (line 53), which can only start at offset 0 today; `FunctionEmitter.function` (line 426); `statement` (line 365); `block` (line 355), which implements scopes by copying the `locals` map.
- `edges` and `order` from E5.
- `editor.typed`, lines 14 to 32 (`editorNormalize`) and the wished-for `openFile` of Article 8, section 8.2.
- Article 8, sections 8.3, 8.4 and 8.6. Literature: Cooper & Torczon 2023, §9.2.2 (live variables) and §6.3 (static allocation of activation records when a procedure cannot be active twice); Reynolds 1972 and Danvy & Nielsen 2001 (defunctionalization); Adya et al. 2002 (stack ripping).

**Files to change.** New `picocalc-os/compiler/typed-async.js`, evaluated after `typed-wasm.js` and bundled as `typed/async.js`; `typed-wasm.js` calls into it when it meets `async`. `typed_p4.c` (or `typed_build.c` after B2): one more `eval_file`. `port/esp32p4/main/CMakeLists.txt`: one more bundle entry. `typed-wasm.js`: `RESERVED` (`async`, `await`, `start`, `resume`, `pending`, `cancel`); `Lexer` takes a start offset. `picocalc-os/sdk/typed/interface.json` (D1): the field `"awaitable": true` on `typedSdkFileRead`, `typedSdkWriteSnapshot` and `typedSdkYield`.

**Core algorithm.**

```
parse an async function body into a tree:
    seq [node...]
    simple   {from, to, uses, defs}        # a token range holding one ordinary statement
    if       {cond: {from, to, uses}, then: seq, else: seq?}
    while    {cond: {from, to, uses}, body: seq}
    await    {k, target: x or none, declares: bool, callee, args: {from, to, uses}}
    return   {from, to, uses}
    uses = every identifier in the range that names a local or parameter; defs = the assigned or declared name
    (an over-approximation of uses is safe: it can only save more)

live(node, out):                           # the set of variables live before the node, given the set live after it
    simple:  (out - defs) ∪ uses
    return:  uses
    seq:     fold live over the nodes from last to first
    if:      uses(cond) ∪ live(then, out) ∪ live(else, out)          # else absent: ∪ out
    while:   L = uses(cond) ∪ out;  repeat  L' = uses(cond) ∪ out ∪ live(body, L)  until L' = L;  L
    await k: after[k] = out - {target};   result: after[k] ∪ uses(args)

for each wait k of f:
    saved[k] = the variables of after[k] that are scalars and not ambient
    for each variable v of after[k] whose type is string or buffer and that is not an ambient parameter:
        fail "<v> is live across the wait at line <n>; obtain it again after the wait"

frame(f)   = state, token, one field for each variable in the union of saved[k]
             + caller, a small number, only if f is awaited from more than one place
tasks      = the async functions named in a start
layout     = for each task, in source order: frame(g) for every async g reachable from it through await
             fields are named  <task>$<function>$<variable>  and appended to WorldState
report     = { task: [ {function, waits, fields: [names]} ], total fields of WorldState }
```

**Steps.**
1. Give `Lexer` a start offset and an end offset, so that a token range of the source can be compiled later.
2. Write the structural parser for `async` bodies. It recognizes `if`, `else` (E1), `while`, `for` (E2, if present), `return` and the three `await` forms; everything else up to the next `;` at brace depth 0 is a `simple` node.
3. Write `live` and the checks. Enforce the rules of section G.2: `await` only in an `async` function and only in statement position; the `WorldState` parameter; ambient parameters.
4. Extend E5's cycle check to edges created by `await` and `start`.
5. Return the report as `asyncLayout` in the compile result, and write `$NEXT/scripts/14-check-async-layout.mjs`.

**Worked example.** Input, the function of Article 8 in the syntax of this plan:

```
async function openFile(handle: i32, state: WorldState): i32 {
    const ok = await typedSdkFileRead(handle);
    if (!ok) return 0;
    const length = state.sourceLength;
    let read = 0;
    let written = 0;
    while (read < length) {
        const text = typedSdkBuffer(0);
        const stop = Math.min(length, read + 4096);
        while (read < stop) { text.setCharCodeAt(written, text.charCodeAt(read)); read = read + 1; written = written + 1; }
        await typedSdkYield();
    }
    state.textLength = written;
    return 1;
}
```

Expected report: two waits; `saved[1]` is empty (`handle` is not used after the read, `ok` is the target); `saved[2]` is `{length, read, written}`; `stop` and `text` are not live at wait 2 because both are assigned at the top of the next iteration before any use; the frame is `state`, `token`, `length`, `read`, `written`: five fields, the same number as the five hand-written fields named in section G.1. With `const text = typedSdkBuffer(0);` moved above the outer loop, the expected result is the error `text is live across the wait at line 11; obtain it again after the wait`.

**Acceptance on the host.**
- `node $NEXT/scripts/14-check-async-layout.mjs` prints the report above for the example and the error for its variant.
- Further fixtures: a variable assigned before a wait and used only before it (not saved); a variable used only in the loop condition (saved); a wait inside an `if` inside a loop; two waits that save overlapping sets (one field per variable, not per wait); a helper awaited from two tasks (two frames, and a `caller` field only if it is awaited from two places within one task).
- Rejected programs with their diagnostics: `await` in an expression; `await` outside an `async` function; an `async` function without a `WorldState` parameter; a `buffer` parameter that is not ambient; an `await` cycle.
- Byte identity of the existing sources: none of them uses the new words.

**What a wrong implementation looks like.** Liveness computed in one backward sweep without iterating at loops misses variables that are used at the top of a loop and defined at its bottom. In the example, `read` is used by `read < length` at the top; a single sweep starting from the code after the loop sees `read` as dead at the wait. The frame then lacks `read`, and the generated code of G2 would restart the copy from zero after every pause. The fixture "used only in the loop condition" exists for this and requires the variable in `saved`.

**Dependencies.** E1 (`else` in `async` bodies), E5 (call edges and the cycle check). **Size.** M. **Risks.** The structural parser duplicates a small part of the grammar that `FunctionEmitter` implements. Keep it to control structure only, and let the existing emitter parse every `simple` range, so that there is one implementation of expressions.

---

## Task G2: generating the state machine, the task operations and the dispatcher

**Goal.** Rewrite each `async` function into an ordinary typed function that runs from its current state to its next wait, implement `start`, `resume`, `pending` and `cancel`, and compile the result on both targets.

**Where to look.**
- The tree and layout of G1.
- `editor.typed`, lines 126 to 173: the hand-written equivalent for the open path, which is what the generated text for the worked example should resemble.
- `typed-world.js`, `validate` (line 42): the limit of 80 fields is checked on the record the compiler returns, so appended frame fields are counted.
- Article 8, section 8.5 (the generated state machine; pieces as cases inside one outer loop) and section 8.6 (static frames; the caller's frame records "waiting for my callee"). Literature: Bierman et al. 2012 (the formalized compilation of C# `async`); Dunkels et al. 2006 (protothreads) for the minimal version without saved variables; Sant'Anna et al. 2013 (Céu) for static allocation.

**Files to change.** `picocalc-os/compiler/typed-async.js`: the rewriter. `typed-wasm.js`: compile the rewritten text in place of the `async` function; expand the four built-in forms.

**Core algorithm.**

```
cut the tree of f into pieces at every wait and at the head of every loop that contains a wait
    piece numbers p = 0, 1, 2 ...;  each wait k has a resume piece r(k)

generated text for f (a typed function; F stands for f's frame fields in `state`):

function f$step(<ambient parameters>, <scalar parameters>, value: i32): i32 {
    <declare every local of f with a zero value>
    let pc = 0;
    if (state.F$state === k) { <reload saved[k] from the frame>; <target of wait k> = value; pc = r(k); }   # one per wait
    state.F$state = 0;                                        # running; a later cancel during this turn is visible
    while (pc >= 0) {
        if (pc === p) { <the simple statements of piece p>; <the transfer at its end> }                       # one per piece
    }
    return <result>;
}

transfers at the end of a piece:
    fall through / branch / loop head:   pc = <next piece>;                  (an if selects between two)
    return e:                            result = e; pc = -1;
    wait k on a reactor function:        const t = <callee>(<args>);
                                         if (t <= 0) { <target> = 0; pc = r(k); }                 # could not start: false
                                         else { <store saved[k]>; state.F$token = t; state.F$state = k; return 0; }
    wait k on an async function g:       const v = g$step(<ambient>, <args>, 0);
                                         if (state.G$state === 0) { <target> = v; pc = r(k); }     # g finished at once
                                         else { <store saved[k]>; state.F$token = 0; state.F$state = k; return 0; }

start f(args):   state.F$state !== 0 ? false : (f$step(<ambient>, <args>, 0), true)
pending():       the || of F$state !== 0 over all frames
cancel f:        F$state = 0 for every frame of task f

resume(), expanded in the handler; frames are tested innermost first:
    for each frame F of each task, where F waits on a token (F$token > 0):
        if (event.kind === 4 && state.F$state !== 0 && state.F$token === event.token) {
            let v = f$step(<ambient>, <zeros for the scalar parameters>, <event.ok as 0 or 1>);
            <while the function just run has finished and has an awaiting caller c in this task:
                 v = c$step(<ambient>, <zeros>, v) >
            consumed = true
        }
```

The scalar parameters are passed as zeros on a resume. That is correct because liveness guarantees that a parameter read after a wait was saved, and the reload at the top of `f$step` restores it.

**Steps.**
1. Implement the cut into pieces and the text generation. Add a compiler option that returns the generated text, for tests and for reading.
2. Append the frame fields to `WorldState` before the functions are compiled.
3. Compile the generated text with a `Lexer` over it; map a diagnostic inside generated text back to the line of the original statement.
4. Implement the four built-in forms.
5. Extend the interpreter harness of A0 with a miniature reactor in JavaScript: `typedSdkYield` and `typedSdkFileRead` return increasing tokens and record them; the test delivers events with chosen tokens and `ok` values, in order, out of order and with unknown tokens.
6. Fixtures: the `openFile` example against a buffer with mixed line endings; a task that awaits a helper that waits twice; two tasks suspended at once whose completions arrive in the opposite order; `start` of a running task; `cancel` followed by the late completion; a wait whose request fails (`t <= 0`).

**Worked example.** For `openFile` of G1, the generated text has four pieces. In outline, with the frame fields abbreviated:

```
function openFile$step(state: WorldState, handle: i32, value: i32): i32 {
    let ok = false; let length = 0; let read = 0; let written = 0; let stop = 0; let result = 0;
    let pc = 0;
    if (state.s === 1) { ok = value === 1; pc = 1; }
    if (state.s === 2) { length = state.length; read = state.read; written = state.written; pc = 2; }
    state.s = 0;
    while (pc >= 0) {
        if (pc === 0) { const t = typedSdkFileRead(handle);
                        if (t <= 0) { ok = false; pc = 1; } else { state.token = t; state.s = 1; return 0; } }
        if (pc === 1) { if (!ok) { result = 0; pc = -1; }
                        else { length = state.sourceLength; read = 0; written = 0; pc = 2; } }
        if (pc === 2) { if (read < length) { pc = 3; } else { state.textLength = written; result = 1; pc = -1; } }
        if (pc === 3) { const text = typedSdkBuffer(0); stop = Math.min(length, read + 4096);
                        while (read < stop) { … }
                        const t = typedSdkYield();
                        if (t <= 0) { pc = 2; }
                        else { state.length = length; state.read = read; state.written = written;
                               state.token = t; state.s = 2; return 0; } }
    }
    return result;
}
```

Driven by the test reactor with a 10,000-unit buffer, the expected event sequence is: `start` issues token 1 (the read) and returns; event token 1 with `ok` runs piece 1, 2, 3 and issues token 2; token 2 runs pieces 2 and 3 again and issues token 3; token 3 copies the last 1,808 units, issues token 4; token 4 finds `read === length`, sets `textLength` and finishes. An event with token 99 at any point returns `false` from `resume()` and changes nothing.

**Acceptance on the host.**
- The fixtures pass on both targets and agree with each other; for the `openFile` fixture the final buffer contents and `textLength` equal those produced by the hand-written `editorNormalize` path driven by the same events.
- The token trace of the worked example is exactly 1, 2, 3, 4.
- An unknown token and a token of a cancelled task leave every field of `WorldState` unchanged, checked by comparing the whole record before and after.
- A program whose declared and generated fields exceed 80 is rejected with `WorldState supports up to 80 scalar fields`, the existing message.
- Byte identity of the existing sources.

**What a wrong implementation looks like.**
- *Resuming at the wait instead of after it.* The request is issued again on every completion; the token trace of the example grows without the copy advancing. The trace check catches it.
- *Frames tested outermost first.* A caller whose `state` says "waiting for my callee" has no token; if the dispatcher resumes it on the callee's token, the caller continues before the callee has finished. The helper fixture returns the wrong value.
- *The state not cleared on completion.* `start` then reports the task as busy for ever; the fixture that starts the same task twice in sequence fails on the second start.
- *Saved variables stored at the wrong wait.* Storing `saved[2]` at wait 1 is harmless; storing nothing at wait 2 because the set was computed for wait 1 loses progress. The buffer comparison with the hand-written path fails after the first pause.

**Dependencies.** G1. **Size.** L. **Risks.** The generated function evaluates one `if (pc === p)` per piece on each trip round the loop. For the open path that is a handful of comparisons per 4,096 units of work. If a later use has many pieces in a hot loop, order the tests so that the loop's own pieces come first. The frontend's nesting limit of 128 (`typed-wasm.js`, lines 237 and 356) applies to generated text as to any other.

---

## Task G3: the Editor's open path with `await`

**Goal.** Replace the hand-written open and normalize continuation in `editor.typed` by one `async` function, and match every existing Editor replay.

**Where to look.**
- `editor.typed`: `editorOpen` (54), `editorOpened` (83), `editorOpenFailed` (119), `editorDeferRead` (126), `editorContinueRead` (134), `editorReadSuccess` (140), `editorResumeRead` (152), `editorMissingFile` (157), `editorReadDone` (162), and the second token test in `typedWorldEvent` (lines 181 to 183).
- `state.typed`, lines 12 to 18: the fields `readToken`, `reading`, `sourceLength`, `unitsRead`, `unitsWritten`. Other functions read `state.readToken` to know whether a file is being opened: `typedWorldEvent` (lines 177, 186, 202) and the view functions; `grep -n readToken picocalc-os/worlds/editor/*.typed` lists them.
- The Editor tests that Article 8, section 8.2, mentions: a timer event that belongs to another job must not advance this one; the reply to an open request is delayed until the first screen is ready.
- `ttmp/2026/11/18/PICOCALC-TYPED-WORLDS*/scripts/02-check-editor-world.mjs`: the comparison is on the sequence of frames the Editor publishes, so the rewritten path must publish the same frames at the same points.

**Files to change.** `picocalc-os/worlds/editor/editor.typed`, `state.typed`, and whichever files read `state.readToken`.

**Steps.**
1. Write `async function editorOpenTask(state, output, hints, handle, …)` containing, in order, the read, the two failure branches (missing file, other error), the normalization loop with `await typedSdkYield()` after each 4,096 units, and the call of `editorOpened`.
2. Replace `editorOpen`'s tail by `start editorOpenTask(…)`, and the `readToken` test in `typedWorldEvent` by `resume()`.
3. Replace every reading of `state.readToken > 0` outside the task by a boolean field `opening` set at the start of the task and cleared at each of its ends, or by `pending()` where the meaning is "anything outstanding".
4. Delete the five hand-written fields and the functions that only carried the continuation.
5. Run the thirteen Editor workflows.

**Worked example.** The `--large` workflow opens a file of 65,536 bytes with CR LF line endings. Today the open takes one read completion and then one timer event per 4,096 source units, each handled by `editorResumeRead`. After the task the same events arrive, each handled by `resume()`, and the frames published are the same: `No file open.`, then `entry.txt  1:1` with the first rows, in the same order and number.

**Acceptance on the host.**
- All thirteen Editor workflows pass on both targets, which includes the comparison of published frames with the JavaScript original and, for WebAssembly, of the framebuffer captures.
- `01-run-host-replays.sh` passes as a whole.
- The compile result reports at most 71 fields in `WorldState`, counting declared and generated fields.
- The number of typed source lines of `editor.typed` is lower than today's 204.
- Editor's RV32 instruction count is reported, with the difference from before the task; the plan expects an increase of less than 300 instructions from the generated dispatch code, set against the functions removed.

**What a wrong implementation looks like.** The existing code refuses key input while a file is opening (`event.kind === 0 && state.readToken === 0`, line 177). A rewrite that drops this test lets a key press edit a half-normalized document between two pauses. No frame comparison notices unless a key arrives during an open. The `--large` workflow sends keys only after waiting; add to this task a scenario that sends a key 50 ms after the open request for the 65,536-byte file and requires the saved file to be byte-identical to the input with normalized line endings.

**Dependencies.** G2. **Size.** M. **Risks.** `readToken` serves two purposes today: it is the continuation's token and it is the flag "a file is being opened". The rewrite must keep the second purpose as explicit state. This is the kind of field that makes the 71-field prediction uncertain: the frame replaces five fields with five, and the explicit flag may add one.

---

## Task G4: the Editor's find path with `await`, and the field count

**Goal.** Rewrite the search continuation with `await`, qualify the result on the device, and decide the prediction that the transformation needs no more than the 71 fields the hand-written Editor uses.

**Where to look.**
- `picocalc-os/worlds/editor/find.typed`: `editorFindStep` (line 43), which does at most 1,024 units of work and then stores `findToken = typedSdkYield()` (line 76); `editorFindAdvance` (line 29) and its phase numbers; `editorFindNext` (line 81), which starts a search; `editorFindMarks` (line 147), which reads search state to draw marks.
- `state.typed`, lines 51 and 52 and the fields that follow: `findToken`, `findPhase` and the positions `findAt`, `findEnd`, `findFolded`, `findFrom`, `findOrigin`, `findStart`.
- `typedWorldEvent`, lines 188 to 192.
- Article 8, section 8.6, first consequence; Article 10, section 10.7, fifth prediction.

**Files to change.** `find.typed`, `state.typed`, `editor.typed`.

**Steps.**
1. Write `async function editorFindTask(state, …)`: the four phases as straight-line code with loops, a work counter, and `await typedSdkYield()` when the counter reaches 1,024.
2. Start it from `editorFindNext`; cancel it where a new search or an open replaces a running one.
3. Determine which of the position fields are continuation state, to be replaced by saved locals, and which are read by `editorFindMarks` and the view and must remain fields.
4. Run the `--find`, `--dense-search`, `--tail-search` and `--late-navigation` workflows, then all.
5. Count the fields. Device qualification.

**Worked example.** The `--tail-search` workflow searches a 65,536-byte document for `needle`, which occurs once at the end. The search crosses about 851 lines in slices of 1,024 work units. The expected final status frame is `entry.txt  852:1` with the cursor on a row whose text is `needlezzz`, as the replay asserts today.

**Acceptance on the host.**
- All thirteen Editor workflows pass on both targets.
- `WorldState` has at most 71 fields, declared plus generated. The script `14-check-async-layout.mjs` prints the layout: every task, every frame, every field.
- `01-run-host-replays.sh` passes.
- A scenario added by this task: start a search in the 65,536-byte document and open another file 100 ms later; the late timer completion of the cancelled search must change nothing, and the frames after the open equal those of opening the file without a search.

**Device qualification.** Paired Editor images, three trials per engine in alternating order.

| Receipt | Prediction | Fails if |
| --- | --- | --- |
| Editor workflow of `04-qualify-editor-on-p4.py`, both engines | pass; the search and preview captures have the same SHA-256 as the captures of the build before G3 | any difference |
| `WorldState` fields reported at compile time | at most 71 | 72 or more |
| Editor compile time, native | at most 10 percent above the receipt before G1 | more |
| Editor native `cpu_ms` over the workflow | at most 10 percent above the build before G3, median of three | more |
| Search for a string at the end of a 65,536-byte file, typed on the device | the status line shows the match position; no `crashed` or `timed out` line | any fault |

**What a wrong implementation looks like.** Saving every position of the search as a frame field in addition to the state fields that the marks need gives a correct program with more fields than before. The replays pass and the count is 72 or more. That outcome is a result, not a defect of the rewrite: it is the case Article 10 describes as "saving every variable that is live across a wait is less economical than hand-written state". The response the article prescribes is to list which variables the generated frames save that the hand-written code did not, and report them.

**Dependencies.** G3. **Size.** M. **Risks.** The prediction can fail. If it does, the layout report shows why, and two remedies exist that stay within the design: let a frame field and a state field be the same field when the program declares it so, or recompute a position after the wait instead of keeping it live. Neither is planned; the count comes first.

## Key points of Scope G

- `await` stands only at statement level in an `async` function. A wait is either a reactor function that returns a token or another `async` function.
- Liveness over the statement tree, iterated at loops, decides what a frame holds. A string or buffer live across a wait is a compile error; ambient parameters are passed in again on every resume.
- Frames are fields appended to `WorldState`, one set per task, so the total is known and limited at compile time.
- The state machine is generated as typed source text and compiled by the existing frontend.
- The Editor's open and find paths are the test. Acceptance is every existing replay unchanged and at most 71 fields; the second can fail, and the plan says what to report then.
