# Answers — "10. Architecture and a Roadmap"

## 1. Reactor table and trampoline table in different orders after an edit

I cannot know this without the article, but the failure mode is almost certainly positional coupling: if a function's identity is its index in one table and a call is emitted as "slot 3", then reordering one table without the other rebinds events to the wrong handler. Nothing crashes, no type checker complains — the app just calls the wrong function, or the trampoline jumps to a function with a different arity and corrupts its arguments. The proposed interface description would prevent this by making the identifier derive from the name and signature rather than from position, with both tables generated from that single description so they cannot drift.

Confidence: 2

## 2. Screen-update steps that exist only because of text exchange

I cannot know this without the article, but the shape is clear: the application formats a command into text (converting numbers to decimal digit strings, choosing keywords and separators), writes it into a buffer or pipe, and the compositor then scans/parses that text back, converting digit strings to numbers again and validating tokens. On top of that come escaping or delimiter-escaping rules, buffer sizing and copying, and an intermediate allocation for the message itself. Each of these steps disappears if the caller can hand over a structured value (a command word plus typed arguments) that the compositor reads directly.

Confidence: 2

## 3. Why deleting type annotations is not enough

Erasing annotations only works for constructs that are purely static. Two counterexamples: a TypeScript `enum` is a runtime value that must be emitted as an object literal (plus the name→value mapping and, for numeric enums, the reverse mapping) — deleting the word `enum` leaves the program referring to an undefined binding. Constructor parameter properties (`constructor(private x: number)`) are a declaration that must be lowered into an explicit `this.x = x` assignment; erased, the field is simply never initialised. Namespaces and value-carrying `const enum` uses need similar lowering, and numeric types like i32/f32 need inserted conversions (masking or rounding) because the annotation was the only record that the value must be wrapped at 32 bits.

Confidence: 4

## 4. What a JS emitter can and cannot detect

Because it shares the frontend and the source, a JS emitter gives a reference implementation that catches backend-specific miscompilation: wrong arithmetic width, wrong branch condition, wrong field offset, wrong calling convention, wrong evaluation order in the native emitter — any divergence in observable output or return value between the two backends on the same input. It cannot detect errors the two backends share by inheritance: a wrong parse, wrong type inference, or wrong semantics fixed in the AST, since the reference would reproduce the same mistake and the differential test would pass. It also says nothing about device-only properties — timing, memory pressure, stack depth — and nothing about inputs the differential harness never runs.

Confidence: 3

## 5. Why `await` comes before porting the remaining applications

I cannot know the article's stated reason, but the ordering follows from the fact that porting is the expensive, hard-to-repeat step. Applications will need to wait on things — file writes, timers, input, other processes — and on a single-threaded event loop that must be expressed without blocking the compositor. If the async model is bolted on after the ports, every ported application is rewritten against a synchronous API and has to be ported a second time. Doing `await` first means the compiler, trampoline and event loop expose the final concurrency contract, so each application is written once.

Confidence: 3

## 6. A prediction from section 10.7, and what would refute it

I cannot know this without the article; I do not have the list of predictions in 10.7. Taking the most natural candidate — that the interface description removes the whole class of ordering/mismatch bugs, or that differential testing against the JS emitter finds most codegen errors — the refuting observation would be a bug in the mismatched-table class appearing after the interface description is in place, or a native-backend miscompile that the JS emitter's test suite passes over. What the plan ought to say then is what roadmaps of this kind usually say: record the counterexample as a failing test first, treat the prediction as a decision point rather than a commitment, and revise the mechanism (or downgrade the claim) instead of adding an ad-hoc patch.

Confidence: 1
