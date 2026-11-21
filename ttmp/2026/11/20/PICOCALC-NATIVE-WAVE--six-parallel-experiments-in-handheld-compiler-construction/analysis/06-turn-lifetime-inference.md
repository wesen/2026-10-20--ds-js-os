---
Title: Inferring turn lifetimes for borrowed buffers in the Typed compiler
Ticket: PICOCALC-NATIVE-WAVE
DocType: analysis
Status: active
Author: Claude Opus High
---

# Inferring Turn Lifetimes for Borrowed Buffers in the Typed Compiler

A handler in the Typed compiler often receives a buffer it does not own. The prototype treats the reference as usable in the current turn. The runtime owns the memory and may reuse its contents across events. This article describes a narrow prototype that lets the compiler find these borrowed buffer parameters from their types, so they do not need a separate declaration. The prototype ran on the host only. Nothing changed on the device or in the production toolchain.

## Turns, yields and continuation frames

A *turn* is one uninterrupted run of handler code. It starts when the dispatcher calls in and ends when the handler returns or waits. An `await` can end the turn early. When the operation suspends, the handler returns to the dispatcher and resumes on a later event.

Native code cannot keep its machine stack across that gap. If the wait suspends, the generated code saves the needed scalars in a *continuation frame*. On resume, the dispatcher restores the frame and jumps to the code after the wait. The frame must hold every value that will be needed again. It must never hold a pointer into memory that the runtime has since reused.

Borrowed buffers are exactly such pointers. The ambient event text and the scratch output both belong to the runtime. After a wait, either one may contain the next event's bytes.

## Liveness, aliases and escape

A variable is *live* at a point in the program if some later path reads it before overwriting it. Backwards liveness finds these variables by walking the control-flow graph from the exits toward the entry. The Typed compiler already runs this analysis. It already permits buffer locals, and it already refuses non-scalar values that are live across a wait.

An *alias* is a second name for the same buffer. If a function assigns `q = b`, then `q` has the same lifetime obligation as `b`. A helper that returns its argument also creates an alias.

A buffer *escapes* when a reference to it is stored somewhere that outlives the turn. Writing it into an object field counts as a possible escape. So does passing it to an import that might keep it, or handing it to an asynchronous callee.

The prototype asks one narrow question. Can any borrowed buffer formal, or any alias of one, be live across a wait or escape the turn?

## Legacy, sidecar and inferred modes

The study runs three compiler modes on the same source.

The stock *explicit legacy check* rejects every buffer formal that is not ambient. It is safe, but it rejects many programs that would be fine.

A *checked explicit sidecar* lists the borrowed formals in a separate declaration. These are not source annotations, so the program text stays the same.

The *inferred* mode finds buffer formals by their type, with no list at all.

The sidecar and inferred modes compile the same source and run the same checked core. Only the way the borrowed formals are selected differs. The comparison therefore tests discovery. It does not compare two different checkers.

## What the prototype analyzes

The prototype reuses the parser's resolved bindings and the existing backwards liveness. It adds no new intermediate form.

Its alarm is conservative. Every buffer in a selected scope is treated as transient. There is no points-to solver that tracks where each buffer came from, so the analysis never tries to prove that one buffer is durable while another is borrowed.

Synchronous local helper calls are analyzed on demand. The compiler checks the actual helper bodies over the existing acyclic call graph within a fixed budget. Helpers may use borrowed buffers as direct values. They may also return an alias, provided the caller consumes it within the same turn. The budget allows 128 synchronous helpers, a nesting depth of 24 and 200000 inspected tokens. A test with 129 helpers was rejected, as intended.

Imports are handled more strictly. An import whose signature carries a buffer is admitted only if it matches the resolver or the non-retaining event-text copy. The prototype refuses any other external call that carries a reference. It also refuses possible stores of a reference. Asynchronous transfers are refused unless the receiving child parameter is itself selected and dead across that child's own waits. A nested eager async call is accepted only under the same condition.

The existing ambient handler channels already hold current-turn values, so they need no new rule.

## How resumption is tested

On resume, the dispatcher passes the current ambient output as a placeholder for the dead buffer parameter. The continuation frame saves only the scalars that are actually live.

The runtime harness uses synthetic, modeled resumed events. Between the turn that waits and the turn that resumes, it changes the initial scratch contents and the ambient output. A program that wrongly read the old buffer after resuming would see different bytes. The harness checks each expected result. It also hashes the whole memory and compares the explicit and inferred builds. The results and hashes matched for every accepted case.

## A real example from Editor

The realistic workload adapts the inner CRLF copy loop that Editor maintains. It is that loop alone, not the complete Editor.

The loop normalizes the supplied UTF-16 buffer in place. It changes a carriage return to a line feed and skips an immediately following line feed. Given `A CR LF B`, it writes `A LF B`. It keeps the output length, 3, in a scalar, waits, and returns 3 after resuming.

Liveness explains why inference accepts this loop.

```
inside the loop   live {buffer, read index, write count}
at the wait       live {count}
after resume      live {count}
```

The buffer is dead by the time the function reaches the wait. Only the scalar count enters the continuation frame. The harness poisons the stale memory before it resumes, and the function still returns 3. The inferred build was accepted at 1300 bytes, from 53 inspected tokens, with no helper summaries.

## Results on the case suites

The development suite has ten cases. Five should be accepted, and four were. All five that should be rejected were rejected, each with a located diagnostic. These were an alias across a wait, an escape through a transitive helper, a buffer carried around a loop, a reference killed on only one branch, and an opaque reference sink. A typical message reads "b is live across the wait at line 7. Obtain it again after the wait." Both escape cases were caught at the same point, an unproved reference import named `opaqueKeep`. The accepted cases included a nested async prefix of two functions, compiled at 1544 bytes.

The held-out suite comes from eight operations specified independently of the prototype. They were transcribed, and the study policy hash was frozen before they ran. Five operations translate exactly into the language, and inference agreed with the expected verdict on all five. Three were correctly accepted (parse then yield, borrow helper and dead alternate arm). Two were correctly rejected (resume through alias and escaping helper).

The other three held-out operations need a persistent buffer value type, and the shared grammar has no such type. Substituting a fresh ambient buffer would change the scenario. These three are reported as outside the language and are not scored.

## The false negative

One development case shows a coverage gap. The handler reads a character from a borrowed buffer and stores it into a field with `state.sum = b.charCodeAt(0)`. The right-hand side is a scalar, so the program is safe. The prototype rejected it anyway, with "turn buffer: unproved retained store" at line 7, column 22. The conservative rule for member stores treats this store as a possible transfer of the reference.

The equivalent version first reads the character into a local scalar and then stores that local. It was observed to be accepted. Both outcomes belong in the record. The first is a real false negative, and the second is a workaround that a programmer would have to discover.

## Host costs

Each configuration was measured with 11 interleaved warm Node samples. *Analyze* covers parsing, liveness, the lifetime proof and allocation. It excludes generating the full lowered source and emitting native code. *Compile* includes full code generation. All times are in milliseconds, shown as the median followed by the range.

| Helpers | Mode | Analyze | Compile |
|---|---|---|---|
| 16 | sidecar | 0.518 (0.409–1.677) | 1.380 (0.885–2.307) |
| 16 | inferred | 0.486 (0.358–1.302) | 1.156 (0.868–1.609) |
| 64 | sidecar | 1.405 (0.833–2.700) | 2.598 (1.582–3.482) |
| 64 | inferred | 1.186 (0.868–2.865) | 2.400 (1.426–4.306) |
| 120 | sidecar | 1.872 (1.475–2.902) | 3.901 (2.573–10.835) |
| 120 | inferred | 2.489 (1.700–6.064) | 3.593 (2.773–7.973) |

Both modes inspected the same number of tokens at each size (359, 1415 and 2647) and built the same number of helper summaries. The ranges overlap in every row. The inferred analyze median was lower at 16 and 64 helpers and higher at 120. Since both modes run the same checked core, these numbers show the range of host cost and support no claim that either mode is more efficient. They are host timings only. They are not combined with timings from other targets.

## Scope of the result

The prototype ran on the host with a small, explicit SDK retention contract. Its modeled event tests cover the selected paths. Treating every buffer in those paths as transient keeps the proof bounded and contributes to the conservative field-store rejection. Three held-out scenarios remain outside the language until it gains a persistent buffer type.

What the prototype does show is narrower. With the parser's own bindings and the compiler's existing liveness, inference matched the sidecar declarations on every accepted case, both in results and in whole-memory hashes. In these cases, it never accepted a program that should have been rejected.

A follow-up boundary case assigns the result of the buffer resolver directly into a buffer-valued member of `WorldState`. The low-level RV32 compiler accepted it under this prototype. The complete Typed world linker rejected it because persisted world fields must be scalar. That admission rule is part of the qualification. Applying the standalone analysis to a dialect with reference-valued persistent fields would require proving the type of the destination field even when the expression has no local buffer binding. [World boundary receipt](../various/06-lifetimes/world-boundary.json)

## Links

- [Reproduction guide](../design-doc/06-infer-turn-lifetime-parameters.md)
- [Investigation diary](../reference/16-turn-lifetime-diary.md)
- [Host evidence](../various/06-lifetimes/runtime-and-cost.json)
- [Independent design](../various/06-lifetimes/opus-design.txt)
