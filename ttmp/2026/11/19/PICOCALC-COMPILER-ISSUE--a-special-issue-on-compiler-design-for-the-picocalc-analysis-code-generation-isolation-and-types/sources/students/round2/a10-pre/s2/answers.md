# Answers — article "10. Architecture and a Roadmap"

I have not been given the article. Every answer below is either (a) my best reconstruction from the
question's own wording plus general compiler/runtime knowledge, or (b) explicitly marked as
unknowable, with the shape the answer would have to take.

## 1. The reactor header count and what the linker check catches

I cannot know this without the article which exact mistake the check was introduced for, but the
check's shape is fixed by the question: the header declares the number of reactor functions and the
linker verifies that number against what is actually linked into the table. That catches a table
that has grown or shrunk by an entry — the classic off-by-one where a function is hand-added to the
table and the count is not updated, so the last slot is unreachable or the runtime reads one slot
past the end. It misses everything a count cannot express: a table that is consistently wrong in
both places (count and table agree, and both are wrong), and — more importantly — entries in the
wrong order or with the wrong signature, because "four functions" says nothing about which four or
of what type. An interface description removes both by making the list itself the single source of
truth: entries are named and typed once, the count is derived rather than maintained, and reorder or
signature drift becomes a structural mismatch instead of a number that still adds up.

Confidence: 2

## 2. The three text-only steps of a screen update

I cannot know this without the article: I have not seen the five steps, so I cannot name the three.
My reasoning is that a text protocol costs exactly three steps a binary one does not need — turning
values into decimal/ASCII characters, assembling (and quoting/terminating) those characters into a
line, and lexing/parsing that line back into fields on the receiving side. The two that survive any
encoding are the ones that correspond to real work rather than to representation: moving the bytes
across the transport, and writing the decoded result into the screen buffer so the panel actually
changes. Those two remain because a link is a physical link and a screen is a physical device; no
choice of encoding removes either, whereas text inserts a full format/parse round trip between them.

Confidence: 2

## 3. Why erasing type annotations does not make typed source run correctly in JS

I cannot know which two constructs the article picks, but the general reason holds: annotations are
the only part of a typed program that is genuinely redundant at runtime, so everything else the type
checker relied on must reappear as emitted code. Construct one, fixed-width integers: `a + b` on
int32 has to become `(a + b) | 0` and division has to truncate toward zero, because the engine
computes in doubles and will otherwise silently differ from the typed semantics near overflow and on
negative division. Construct two, enums and sum/tagged types: the declaration must be emitted as a
real runtime object (member values, tags, constructors) and `match` lowered to tag dispatch, because
an erased declaration leaves nothing for the switched-on value to *be*. Generics and interface types
are the easy case — they really are erased — which is precisely what makes the mistake tempting.

Confidence: 4

## 4. What a same-source JavaScript emitter can and cannot detect

Because it is a second lowering of one shared meaning, it is a differential test: run the same
programs through both and compare, and it will catch anything the typed emitter gets wrong relative
to that shared meaning — arithmetic lowering, control flow, argument order, output formatting,
buffer/frame bookkeeping at the seam. What it cannot catch is anything both paths share: a bug in
the parser or the type checker, a wrong assumption about what the language means, or a wrong answer
from a library both call, because both would be wrong identically and the diff would be empty. It
also cannot say anything about target-specific properties — calling convention, memory layout,
stack/heap limits, timing, interrupt behaviour — since the JS host has different ones by
construction. So it raises confidence in the back end while leaving the front end and the device
assumptions exactly as exposed as before.

Confidence: 3

## 5. Why `await` comes before porting the remaining applications

I cannot know the figures of 10.1, and this argument depends entirely on them: it only works if the
remaining unported mass is large relative to what is already ported. Given that, the reason is
leverage — `await` is not additive, it is infectious, changing the shape of every call site and
transitively every enclosing function signature, so introducing it after the bulk port means
touching and revalidating all the newly ported code a second time. Landing it first costs one pass
over the smaller, better-understood corpus, and the remaining applications then get written once, in
their final shape, instead of written and rewritten. If the figures showed the remaining work to be
small, the ordering would be hard to defend and would look like gold-plating ahead of the port.

Confidence: 2

## 6. A 10.7 prediction, what would refute it, and the response

I cannot know the predictions without the article, so I will state the form and one plausible
candidate rather than pretend to the content. A prediction is only refutable if it names an
observation, so take: "the interface description eliminates the class of linker-visible mismatch
bugs in practice." That is refuted by a mismatch still reaching the device — a count or signature
that slips past the generated checks because the description is hand-maintained in a second place,
or an entry that the description cannot express. The honest response the plan should specify is to
record the refutation and fall back to the simpler check, since such a prediction is a bet about
cost, not a requirement; defending the description after a counterexample is how a roadmap stops
being a roadmap.

Confidence: 1
