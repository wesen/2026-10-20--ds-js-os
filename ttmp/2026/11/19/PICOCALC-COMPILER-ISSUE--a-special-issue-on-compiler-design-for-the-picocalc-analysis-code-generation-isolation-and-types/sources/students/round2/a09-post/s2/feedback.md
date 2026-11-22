# Reader feedback: Article 9, "Types That Pay for Themselves"

Read as a reader, in order, with `glossary.md` open. I did not use the web.

## Passages I had to read twice

1. "The check is expensive in today's backend, which emits 20 instructions for it in the listing of `countUnit`. With the compile-time operand stack of Article 5 it would be about four: load the length, compare and branch, and the trap itself."
   The three items named are a load, a compare and a branch — that is three, and the trap is the failure path, not a cost paid on success. I could not tell whether "about four" includes the trap, the loop increment, or something unlisted. The listing is referred to, not shown.

2. "In hand-written code, where the length is already in a register, it is two; the hand-written loop of Article 5 has seven instructions without the check and would have nine with it."
   7 + 2 = 9 is consistent, so this one I could verify arithmetically. What I could not work out is why the compiler version costs four and the hand-written version two — the difference must be the load of the length, but neither sentence says so.

3. "The fact remains valid until `i` or `s` is assigned or any call is made; while it is valid, an access `s.charCodeAt(i)` needs no upper-bound check." / "Discarding the fact at every call is deliberately cautious."
   `charCodeAt` is written as a call. Does the access clear the fact before or after the fact is used? Read literally, the rule that "any call" discards the fact would discard the very fact used to justify that call. I decided the intended meaning is "the access consumes the fact, it does not invalidate it", but I had to guess.

4. "An application receives a fixed set of buffers from the reactor and a state record of scalar fields." then "Give each world an **arena** for the current turn: a block of memory with a pointer to its first free byte."
   Where does that memory come from? The reactor is prebuilt and the application's code is copied into a reserved slot; the manifest gives each world a memory limit. Nothing says whether the arena is carved out of the world's existing limit, sized by the manifest, or supplied by the reactor. This is the one thing a reader who wanted to implement 9.5 would need first.

5. "The typed language cannot allocate."
   I read this twice because 9.3 discusses `string` values and 9.4 discusses `text.length`, so strings exist and presumably occupy memory. The intended sense — that *new* memory cannot be requested, only buffers handed over by the reactor used — only becomes clear in 9.5, two paragraphs later.

6. "If `Grant` is linear, then on every path through a function a grant must end in exactly one of the operations that consume it: revoking it, sending it to another world, or storing it in the state."
   "Storing it in the state" does not sound like consumption: the value still exists afterwards. It also appears to conflict with the arena rule of 9.5 that a reference may not be stored in the state record, until one notices that a handle is a scalar number, not a reference. The article never says so.

7. "The last must come with the explicit cycle check described in Article 7, because the stack bound depends on it."
   "The last" points back to the last item in a list of five (`else`, `for`, `break`, `!==`, forward calls), four items earlier; I had to count backwards. The reason the cycle check depends on forward calls is also only implicit.

8. "It can be checked locally. The compiler must be able to check a function from its own text and the declarations it mentions" against "Deciding which calls could change a length would need knowledge of the called function, which the first criterion rules out."
   The first criterion explicitly allows *declarations*, so ruling out knowledge of a callee by citing it looks like a contradiction. I now read the second sentence as "knowledge beyond the declared type", but the two sentences need to be reconciled in words.

## Terms used before they were explained, or never explained

- **dependent types** (9.4 table): named as an approach, never defined; "with decidable checking" describes a property, not the thing.
- **substructural type systems** (9.6): glossed only as "the theory of such type systems"; what makes a system substructural (no copying, no discarding, no reordering) is not stated, so the word does no work.
- **wrapped rows** (9.3): the fourth coordinate system is named and never described, and the example `a🙂b` gives no value for it, so the fourth system is the only one I could not check.
- **code point / code unit** (9.3): used and illustrated by arithmetic but never defined; to verify "six bytes, four code units and three code points" the reader must already know that 🙂 is four UTF-8 bytes and two UTF-16 units. Neither term is in the glossary.
- **nested data** (9.2): "for enumerations without nested data the check is a comparison of two sets" — what nested data would be (variants carrying values) is not said.
- **structured control flow** (9.6): given as the reason the linear check is one pass; not defined (does it exclude `goto`, early `return`, `break`, exceptions?).
- **least privilege** (9.7): named as "the principle of least privilege on which capability systems rest"; the parenthetical explains *capability*, not the principle.
- **session types** (9.6): one clause ("an entire exchange of messages between two parties"); too little to tell what a session type is.
- **ABCD** (9.4 table): described only as "the bounds-check elimination algorithm described in Article 4"; not expanded, and "any chain of comparisons" is not explained.
- **`Notice` / `state.notice`** (9.2 code): `Notice.NoMatch` appears as a qualified name while the `match` arms are bare names, and `Notice` is never introduced.
- **state record** (9.2 onward): used from 9.2 but its rule ("scalar fields only") is only stated in 9.5, and the glossary has no entry for it (only *frame*, in the Article 8 sense).
- **`f32`** (9.9): "the processor has hardware support only for single precision" implies a 32-bit float type, which is never named; the glossary lists only `i32`, `bool`, `string`, `buffer`, `record`.
- **`index`** (9.4): introduced in one sentence as a proposal ("written here as `index`"), which is fine, but the glossary's type list does not mention that the article proposes new types; a reader checking the glossary will think the list is closed.

Everything else I looked up was in the glossary: *claim*, *handle*, *manifest*, *nucleus*, *reactor*, *trap*, *turn*, *turn budget*, *world*, *arena*, *distinct type*, *effect system*, *enumeration*, *flow-sensitive typing*, *linear type*, *region*, *typestate*, *local checking*, *fuel*, *compile-time operand stack*, *lowering*.

## Claims I could not verify from the article itself

1. "The native Editor contains 404 trap instructions (counted by Experiment 1 of Article 2), and its source has 85 calls of `charCodeAt` alone."
   Two numbers, both from outside this article. No listing, no file path, no command, no denominator (85 of how many calls?). I can only take them on trust.

2. "The check is expensive in today's backend, which emits 20 instructions for it in the listing of `countUnit`."
   The listing is never shown. Since the whole justification of 9.4 rests on 20 versus 4, a reader cannot check the saving, and "about four instructions" is repeated in the cost paragraph and in the summary table.

3. "With the compile-time operand stack of Article 5 it would be about four: load the length, compare and branch, and the trap itself."
   No instruction sequence, and the count does not match the items named (see Passages, item 1).

4. "Most of these checks are redundant, and visibly so."
   "Most" is a quantity. The article never estimates what fraction of the 404 traps the first rung of the ladder removes, which is the number a reader would use to judge "value for effort" in the order of 9.10.

5. "The result is wrong only for text containing characters that need two code units, such as emoji."
   Plausible, but no worked failure is given: a concrete example such as "the cursor should be at code-unit 3 but the code computes 2" would make it checkable. The `a🙂b` character counts are given, but not the failure.

6. "A world that calls the file-reading function while holding no file claim and receiving no handle can never succeed in that call, and the compiler should report it."
   This depends on the nucleus rejecting such a call, which is cited to Article 1 but not stated here. As written, the claim is about the system, not about the type system, and I cannot confirm it from this article.

7. "The code of a typed world reaches the system only through the 28 functions of its reactor, each called by name."
   The count 28 is stated without a list. The whole of 9.7 — the effect set, the comparison with the manifest in both directions — would be checkable if the 28 function names were given.

8. "Allocation checks that enough room remains and advances the pointer, about four instructions."
   Here, unlike 9.4, the four are not broken into named instructions at all.

9. "The typed language cannot allocate. An application receives a fixed set of buffers from the reactor and a state record of scalar fields."
   This is a claim about the current implementation. No file, test or compiler diagnostic is cited, and 9.3's use of `string` makes the reader doubt it (see Passages, item 5).

10. "The language already has a memory discipline, although it is nowhere written down. A reference to a buffer is valid while one event is being handled, which is one turn, and must be obtained again in the next."
    Presented as an observation about the repository; no source, comment or test is pointed at. If the discipline is "nowhere written down", the article is the place to quote the code that relies on it.

11. "Measurements on a mature implementation found that programs in which some modules are typed and others are not could run up to 105 times slower."
    Properly cited, but the article then concludes "This system already has a boundary between typed and untyped code, and it is in the right place" without any measurement of this system. The 105× figure belongs to another language, as the article admits.

12. "It removes ... Excess or missing claims" (9.10 summary row for effects).
    Section 9.7 argues that the comparison is possible; it never shows a world in the repository that holds an unused claim or calls without one. Compare 9.2 and 9.4, which do start from named code.

## Section scores

| Section | Score | Reason |
| --- | ---: | --- |
| 9.1 The criterion | 4 | Three conditions stated plainly, but condition 1 is later used in a way that seems to exclude the declarations it permits (see Passages, item 8). |
| 9.2 Enumerations | 5 | Observation, six-line mechanism, cost and effort all present, and the "generated code is identical" consequence is stated explicitly; the cheapest thing to follow in the article. |
| 9.3 Distinct integer types | 4 | The `a🙂b` arithmetic is convincing and the rule is one sentence, but the fourth coordinate system, wrapped rows, is never explained or illustrated. |
| 9.4 Flow-sensitive refinement | 3 | The mechanism is clear, but every number in the cost argument (20, "about four", two, seven, nine, "most") is either underived or referred to a listing the reader does not have, so the section's central claim cannot be checked. |
| 9.5 Regions and a per-turn arena | 3 | The two safety rules are excellent and quotable, but the reader is left without the facts needed to picture the arena: where the memory comes from, how big it is, and whether a `string` already allocates. |
| 9.6 Linear handles and typestate | 4 | The obligation story from Agenda is the best motivating example in the article, and the `if` rule is stated; "storing it in the state" as a form of consumption and the unexplained "substructural" leave two loose ends. |
| 9.7 Effects as capabilities | 4 | The mechanism is one union per call and the payoff (compare with the manifest both ways) is concrete, but the 28 reactor functions are a bare number and no real excess or missing claim is shown. |
| 9.8 Two directions that should wait | 3 | The refusal to build is well argued, but the section is mostly names of other systems (Hume, Céu, sized types, amortized analysis) with no example of what a bounded loop would look like in this language. |
| 9.9 Matters that are not type theory | 4 | Honest and short; the `f64`-in-software point is the kind of concrete constraint the rest of the article benefits from. The forward-reference sentence needs unpacking. |
| 9.10 Summary and order | 5 | Every row is a claim the reader has already met, effort estimates are comparable, and the one dependency is named. |
| 9.11 Key points | 5 | A reader could revise from this alone; each bullet matches a section and adds the "why". |
| 9.12 Check your understanding | 4 | Five of the six questions are answerable from the text; question 3's "three kinds of event" and question 2's fourth coordinate system are answerable only loosely. |

## Questions that the article did not let me answer

None were unanswerable, but three were answerable only loosely:

- **Question 2** asks me to "name the four coordinate systems". I could name all four, but for *wrapped rows* the article gives no definition and no value for `a🙂b`, so the fourth was a name I copied, not a system I understood. A sentence saying what a wrapped row is, and that the same 6 bytes are, say, 2 wrapped rows at a given width, would close this.
- **Question 3** asks for "the three kinds of event that discard it". The text says the fact holds "until `i` or `s` is assigned or any call is made", which is naturally two kinds (assignment, call) with three instances. I answered with three instances; a reader could reasonably answer two and feel marked wrong.
- **Question 6** asks whether the branches may dispose of the grant differently. The text answers yes, but "both branches must have consumed the same set of handles" is ambiguous, and the article does not say what the checker does when the grant is not the function's only handle, or when the branch returns early.

Question 1 is answerable only because the article's own sentence is quotable; note that question 1 asks "what replacing them by an enumeration would change in the generated code", and the answer is "nothing", which a reader may take as a trick question rather than as the point.

## One thing to add and one thing to cut

**Add:** one worked instruction listing for the bounds check — `countUnit`'s index test as the current backend emits it (20 instructions) beside the same test under the compile-time operand stack (4), with the two instruction sequences written out. Every cost claim in 9.4, and the "value for effort" ordering that puts guard facts at position 3, rests on that comparison; a single listing would convert the article's weakest numbers into its strongest evidence, the way the `a🙂b` example already does for 9.3. A short appendix listing the 28 reactor functions would do the same for 9.7.

**Cut:** the sentence "Recent work on tracking the capabilities that a value captures in its type shows the same idea carried into a full language [Boruch-Gruszecki et al. 2023]" in 9.7. It adds a citation but no mechanism: "captures in its type" is never connected to the world-level effect set the section is proposing, and the reader who stops to work out what a captured capability is loses the thread of a section that is otherwise tight. Nothing else in the article depends on it, and 9.7's argument is complete without it. (If something must be cut for *length* rather than for coherence, the session-types sentence in 9.6 is the next candidate, for the same reason.)
