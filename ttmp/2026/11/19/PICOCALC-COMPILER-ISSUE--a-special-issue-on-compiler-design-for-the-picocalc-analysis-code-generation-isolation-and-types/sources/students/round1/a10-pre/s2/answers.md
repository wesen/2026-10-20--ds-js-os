# Answers — "10. Architecture and a Roadmap"

1. If the two tables are generated independently, an edit that reorders, inserts or removes a reactor
   function shifts every later slot, so a trampoline call by index reaches the wrong function: the
   runtime does not crash, it silently dispatches `onKey` to `onTick` or to whatever now sits in that
   slot. Nothing at link time notices, because both tables are individually well formed — only their
   agreement is wrong. An interface description fixes this because one declaration is the single
   source for both tables: the function list, names and stable identities live in the description and
   the compiler and the trampoline emit from it, so a reordering either cannot happen or becomes a
   compile-time error instead of a silent mis-dispatch. (I have not seen the article's exact
   mechanism — whether it uses stable string/builtin ids, a checked slot map, or ordering by
   declaration identity — but the answer must take that shape.)
Confidence: 2

2. As I would expect, the pure text round trip adds roughly these steps: the application formats a
   draw command into characters (numbers to decimal digits, separators, a terminator); the transport
   frames it, escapes or delimits it, and may split or coalesce it across buffer boundaries; the
   compositor scans the byte stream for message boundaries before it can start; it then parses and
   validates the fields, converts digits back to numbers, and only then calls the drawing primitive.
   Each of those is pure overhead that disappears if the compositor accepts a structured command
   (a packed record, handle or op-id) instead of text. I cannot know the article's exact step list, so
   the count and names are my reconstruction rather than a quotation.
Confidence: 3

3. Erasure alone fails wherever a type construct also carries runtime meaning. `enum` is the clearest
   case: the annotation looks like a type but the emitted program needs a real object with the
   members (or the members substituted at each use site), so the emitter must synthesize that object,
   not just delete text. Parameter properties (`constructor(private x: number)`) are the second: the
   `private` looks like an annotation but stands for an assignment `this.x = x` in the constructor
   body, so the emitter must desugar it into an explicit field and assignment. Other candidates in
   the same family are `namespace`s, decorators and `const enum` inlining; and in a fixed-width
   target, dropping `i32`/`u8` annotations also drops range and wrapping information the JavaScript
   semantics do not reproduce on their own.
Confidence: 4

4. A JavaScript emitter built from the same front end detects code-generation bugs: if the native
   back end computes a different result than the straightforward JavaScript translation of the same
   IR, one of them is wrong, and JavaScript gives a cheap executable oracle for arithmetic, control
   flow and data layout that can be diffed against the device. It cannot detect anything the two
   paths share — a front-end misreading of the source language, an analysis that legitimately
   mis-optimizes in the IR, or a wrong assumption both back ends inherit — nor anything that only
   exists on the target: memory exhaustion, stack depth and trampoline limits, pointer aliasing,
   interrupt timing, hardware registers, and width-dependent overflow. In short it catches divergence
   between back ends, not errors common to both, and not platform-specific failures.
Confidence: 3

5. `await` is not a local feature: it changes the calling convention, because every suspendable
   function must be compiled into something with state that can be entered again, and the trampoline
   and reactor protocol have to know how to resume a suspended call. Porting applications first would
   mean rewriting them (or their reactor tables and hand-written continuations) a second time once
   the suspension model lands, and any application that is ported early sets conventions the `await`
   design would then have to break. Putting `await` first means the remaining ports are done once
   against the final shape. This is inference from the ordering, not something I can confirm.
Confidence: 2

6. I cannot know this without the article: I have not read section 10.7, so I cannot name one of its
   predictions. The form of the answer is clear, though — take a falsifiable claim such as "the
   JavaScript reference emitter will find most code-generation bugs before any code runs on the
   device"; the observation that refutes it is a class of bug that appears only on hardware and that
   the JavaScript path accepted silently; and the plan should then say what to do with the claim
   (record the counter-example, add a regression case to the reference or conformance suite, and
   either narrow the prediction or spend the next increment on that gap rather than continuing the
   roadmap as written). Whether the article's plan actually prescribes that, I cannot say.
Confidence: 1
