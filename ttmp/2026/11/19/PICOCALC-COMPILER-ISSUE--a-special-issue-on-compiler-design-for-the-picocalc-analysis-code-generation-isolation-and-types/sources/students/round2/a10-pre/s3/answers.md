# Answers — "10. Architecture and a Roadmap"

Note: I was not given the article, so the answers below reason from the question wording and from general
compiler/runtime knowledge. Where a question turns on a fact stated only in the article (specific section
numbers, figures, named predictions), I say so and describe the shape the answer must have.

## 1. Reactor-function count in the header

The count check catches the gross case: a reactor function was added, removed or left out of the object file
(or table) without the header being updated, so `header.count != actual_count` and the link fails loudly instead
of the program calling a garbage slot at run time. It misses everything that keeps the total the same — functions
swapped in order, a duplicate registered twice, or a function whose signature/arity/return type changed but whose
slot still exists. A hand-maintained total is a weak checksum: it verifies cardinality, never identity.

An interface description fixes both by making identity machine-checkable: each slot is named and typed
(`name(a: u16, b: *Screen) -> bool`), so a generator/linker stub can verify that every declared entry actually
exists with a compatible signature, and it can emit the index itself, so no human ever writes the count. Then a
permutation or a changed signature becomes a link-time error, while the count is derived rather than trusted.
Confidence: 3

## 2. The five steps of a screen update

The three text-only steps are, in effect: format the update into text (itox/decimal conversion, separators),
ship/transmit that text stream, and parse it back on the other side into structured values — plus the buffer
juggling that text needs (length prefixes, terminator scanning, possibly re-parsing partial lines). Each of these
exists purely because the wire carries characters rather than a fixed layout; with binary fields the emitter can
just store the struct into a byte buffer and the reader can memcpy it out, so all three collapse into a single
"write bytes / read bytes" step.

The other two steps survive in both designs: deciding *what* changed (diffing the desired state against the last
sent state, or batching dirty regions) is a semantic question about the update, not about encoding; and the final
commit to the device — writing the pixels/registers into the display — is local to the Pico and is not transport
at all. Text versus binary only decides how the middle of the pipeline is spelled. Confidence: 3

## 3. Why deleting type annotations is not enough

Annotations are erased, but the guarantees they express are not enforced by the JavaScript engine, so the
translation has to insert runtime work that the annotation was silently promising. Delete the annotations and
you have changed the program's meaning, not just its spelling.

Two concrete constructs: (1) integer arithmetic — a typed `u16`/`i32` division, modulo, and multiplication must
wrap/truncate, but JS `/` yields a float and `*` can exceed 2^53, so the emitter must insert truncation and
masking (`(x / y) | 0`, `& 0xFFFF`) at every such operation, and be careful with precedence when doing it.
(2) value/reference semantics and mutability — a typed struct passed by value, or a `const`/`readonly` field, is
a copy or an invariant in the source language, whereas JS hands out a shared object reference, so the emitter
must emit explicit copies at call boundaries and either respect or check the mutability rule. Related cases with
the same flavour: narrowing casts, out-of-range assignment checks, and pointer/array bounds. Confidence: 3

## 4. What a JS emitter can and cannot detect

Because the JS version is derived from the same source and the same semantics, running both and comparing
outputs is differential testing of the *back end*: it catches code-generation mistakes — a lowered operator with
the wrong associativity or precedence, an off-by-one in a loop or array index, wrong width/truncation, a
miscomputed stack slot, or a missed function call argument reordering. Those are exactly the bugs that only
appear in one of the two encodings.

It cannot catch anything both implementations share: a misreading of the source language in the front end or
semantic analyser (both will be wrong in the same way and agree), and it cannot catch target-specific reality —
timing, actual integer/float behaviour of the device, memory layout and stack depth limits, register or
peripheral behaviour, and performance. Agreement between the two only says "consistent with our model of the
language", not "consistent with the hardware". Confidence: 4

## 5. Why `await` comes before porting the rest

I cannot know the exact figures of section 10.1 without the article, but the argument must be a ratio: the
already-ported application(s) are a small slice of the total, while the remaining applications are the large
majority of the lines/functions to migrate. `await`/async is not a local change — it is viral through the call
graph, changing every caller's shape (colouring functions sync/async, changing how the reactor schedules
continuations, changing error handling). If the apps are ported first, every one of those many lines gets written
in the old style and then rewritten, and the porting work is done twice with two different idioms in the tree at
once.

Doing `await` first means the semantics of suspension, scheduling and cancellation are decided and proven on the
small, cheap surface (the already-ported app and the runtime), and then the bulk of the code is moved once,
straight into its final form. The order is chosen so the expensive, high-volume work happens last, after the
expensive-to-change decision is frozen. Confidence: 4 (for the shape; the numbers are unverified)

## 6. A prediction from section 10.7 and its refutation

I cannot know which predictions section 10.7 makes, so I cannot name one verbatim. A prediction in such a roadmap
almost certainly has one of these forms: "the typed subset covers most of the remaining applications with only a
handful of escape hatches", "the binary protocol is worth its complexity because it removes the parse/format
work", or "the JS emitter pays for itself by catching back-end bugs". Take the first: the refuting observation is
a measurement — after the trial port, a large fraction of functions need raw pointers/casts/`unsafe`, or the
escape-hatch list grows with every app, meaning the subset is not carrying its weight.

The plan should say what happens *then*, and it has to be decided before the measurement, otherwise the
prediction is unfalsifiable: either extend the type system to cover the recurring escape (and re-measure), or
accept the narrower claim and fall back explicitly — e.g. keep the untyped escape hatch as a documented,
delimited part of the language, or keep those apps hand-written — and record the failed prediction rather than
quietly redefining success. Confidence: 2
