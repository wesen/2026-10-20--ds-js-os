---
Title: Infer turn-lifetime parameters at Typed suspension boundaries
Ticket: PICOCALC-NATIVE-WAVE
DocType: design-doc
Status: active
---

# Infer turn-lifetime parameters at Typed suspension boundaries

A Typed async function can acquire a temporary buffer during one event-handler turn. A continuation stores live scalar values so it can resume in another event. A transient reference has no valid continuation representation. The production frontend checks this for locals using backwards liveness and rejects a nonambient buffer parameter at its declaration. The prototype asks whether a parameter could be safe when its last use precedes every suspension and no helper can retain it.

## Keep the existing continuation boundary

Reuse the parser's resolved bindings and the existing check for any nonscalar value live across `await`. Change only admission of nonambient `buffer` parameters in async functions whose uses pass the added proof. A private buffer parameter supplies the initial turn. On resume, the generated dispatcher already supplies the current ambient output buffer. Pass that current-turn buffer as an unused ABI placeholder for the dead parameter. It does not encode the original handle, and the liveness check prevents its value from being observed after resumption.

For example, `scan(borrowed)` can return an i32 count before the first await and save that count. `const alias = borrowed` then use the alias after the wait still fails, even if `borrowed` itself is dead. A buffer stored into an opaque field or passed to an unproved foreign function escapes before the wait and also fails. A synchronous identity helper may return a buffer reference to its caller in the same turn. The caller still owes the liveness and call checks for the returned alias.

## Summarize direct calls

Analyze parsed statements with resolved binding references and actual callees. Record calls found in conditions, return expressions, assignment RHS and nested expressions. The conservative prototype treats every nonambient buffer in these reachable contexts as turn-only. Assignments and same-turn alias returns preserve that classification. It uses the existing liveness transfer for kills, branch joins and loops. At an opaque assignment, inspect the typed statement and reject buffer-bearing retained stores, without rejecting known buffer cell writes. Resolve synchronous direct helper summaries transitively over the frontend's acyclic call graph. Treat unknown or unsupported reference-carrying operations as unproved, and stop at a deterministic bound. Pointer-width integers and a general ownership ABI are outside the experiment.

Use three runs on the same source bytes. The stock arm shows existing grammar and lifetime diagnostics. The explicit arm consumes a separate list of intended turn-parameter declarations, then checks the common escape and liveness conditions. The inferred arm discovers the same candidates using resolved type information and checks the same proof. The explicit declaration is a checked assertion, not permission to cross a wait. Correct inferred acceptance should generate the same reduced source, continuation slots and executable results as explicit acceptance.

## Verification and costs

Use fixtures for no-wait and dead-before-wait uses, a single live alias, a synchronous identity/reader chain, overwrite, both branch outcomes, loops, nested await calls, fake buffer receivers and unknown imports. Use a realistic Editor buffer-read workflow adapted from the maintained source, checking what it borrows and what crosses the yield. Request an independent held-out suite only after the whitelist, statement rules and resource bounds are frozen. Report covered and rejected reasons, full emitted frame/result equivalence for accepted code, and time/operations for the proof separately from source lowering. An artificial timed workload amplifies compile-cost differences without being a representative application latency measurement.

## Locked prototype policy

Admit nonambient buffer formals selectively, after standard liveness proves that no buffer binding would be saved. Keep source immutable in all arms. Study synchronous helper bodies on demand, allowing acyclic proofs up to 128 helpers and 24 nested calls, with a 200,000 inspected-token limit. Allow the built-in checked buffer cell methods and the verified SDK buffer resolver and event-text copy. Reject unknown reference-bearing imports, nonscalar retained stores, unsupported ordinary helper shapes and all reference persistence. Async calls can pass a buffer to another selected nonambient parameter for its initial turn only. Decline reference-bearing arguments to any other formal that lacks a checked contract.

## Follow a reading through one yield

```typescript
function scan(chunk: buffer): i32 { return chunk.charCodeAt(0); }

async function task(state: WorldState, chunk: buffer): i32 {
    const first = scan(chunk);
    await typedSdkYield();
    state.sum = first;
    return first;
}
```

The borrowed argument exists on the first call. `scan` keeps it inside the turn and produces an i32 observation. Looking backward from the return, `first` is needed after the wait. The receiver buffer is dead because no later expression reads `chunk` or an alias. The checked explicit arm supplies a sidecar entry named `task.chunk`. The inferred arm derives the same candidate from the resolved formal `chunk: buffer`. Both admit this case after the same call and liveness checks.

```text
current event buffer --> task(chunk) --> scan(chunk)
                                           |
                                      checked i32 read
                                           |
                                           v
yield returns token ----> scalar frame {state, token, first}
                                           |
new completion event --> dispatcher ------+
                           |               |
                    new ambient output    restored i32 first
                    as dead ABI argument       |
                                              return first
```

A reference alias and a scalar copy have different consequences. `const local = chunk` gives the same reference a second name. Reading `local.charCodeAt(0)` after the wait makes `local` live and the existing continuation check rejects it. Calling an unknown `opaqueKeep(chunk)` before the wait also rejects because an opaque caller may keep that address even after the lexical binding dies.

```text
for each selected async function:
    parse using the stock checker and resolved binding identities
    compute stock live-after sets for each wait
    reject any nonambient buffer in a saved set
    walk expressions, conditionals and loops for retaining stores and calls
    prove actual synchronous callee bodies transitively within fixed limits
    check imported reference use against the small trusted SDK table

resume(frame):
    supply current ambient handler values
    supply current output as each admitted dead buffer argument
    restore the counted scalar slots and resume at the saved program point
```

The implementation is in `scripts/06-lifetimes/{stage.mjs,policy.js}`. Its `check.mjs HELD_OUT OUTPUT` uses the same source in the three arms and compares the generated native bytes and continuation layout. A modeled completion event changes the old scratch contents and supplies a different ambient output. The workflow includes the exact CRLF loop extracted from the maintained Editor, with the outer task adapted to make the borrowed data a formal. It changes the buffer's units during the initial turn and carries the resulting count across the yield as a scalar. The prototype's aggregate host analysis and compile windows are available in the same receipt. [Independent Opus design](../various/06-lifetimes/opus-design.txt) · [Runtime and cost receipt](../various/06-lifetimes/runtime-and-cost.json)
