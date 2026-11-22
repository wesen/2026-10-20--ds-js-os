# Answers to "Check your understanding" (Article 9)

1. Two of the three places are the file browser's key handler (`worlds/files/files.typed`), where the
   number 14 means "delete" and 15 means "submit", and the Editor's event handler, which tests
   `event.kind === 4` to recognise one kind of event. (The third is the search routine's
   `state.findPhase`, where values below 4 are phases, 4 means "not found" and 5 means "found".)
   Replacing these numbers by an enumeration changes nothing in the generated code, because the
   article says the compiler represents each name as a small integer, so the emitted code is the same
   as today's. What changes is only what the checker accepts: a value of one enumeration cannot be
   used where another is expected, and every `match` must name all the values.
   Confidence: 3

2. The four coordinate systems are: bytes of UTF-8 in the file, UTF-16 code units in memory, code
   points for the cursor column, and wrapped rows on the display. For `a🙂b` the article counts six
   bytes (1 + 4 + 1), four code units (1 + 2 + 1) and three code points, so the four systems give
   three different numbers for the same position. All four are `i32`, so passing a code-point column
   where a code-unit offset is expected compiles without complaint. The article says the error is
   wrong only for text containing characters that need two code units, such as emoji, which is
   exactly the case that tests written with plain text never exercise.
   Confidence: 4

3. The fact recorded is the loop guard `at < text.length`: entering the guarded block, the compiler
   records that `at` is below the length of `text`. It is discarded in three kinds of event: when the
   index is assigned (`at = at + 1`), when the string is assigned, and when any call is made. Nothing
   has to be carried from one iteration to the next because the loop condition is tested again before
   each iteration, and that test re-establishes the fact from scratch.
   Confidence: 3

4. `at < text.length` is a signed comparison, so it says nothing about `at >= 0`; an index of -1 would
   pass the guard. The existing run-time check is a single *unsigned* comparison, which rejects
   negative indices and out-of-range large ones at once, so removing the check on the strength of a
   signed test would let negative indices through. The proposed `index` type is an unsigned 32-bit
   integer: `length` has that type, a loop counter is declared `let at: index = 0`, and comparisons
   between two `index` values are unsigned. Then the guard `at < text.length` is exactly the
   comparison the bounds check would perform, so it implies the whole check, upper and lower bound.
   Confidence: 4

5. The two rules are: a reference into the turn arena may not be stored in the state record, and a
   reference into the turn arena may not be live across a wait (the rule Article 8 already imposes on
   buffers). Together they keep the arena's contents from outliving the turn that owns them, so the
   arena can be reset wholesale when the handler returns. Data that must outlive the turn has to be
   copied into storage the application owns for its whole life.
   Confidence: 4

6. At the end of each branch the grant must have been consumed exactly once, by one of the operations
   that consume it: revoking it, sending it to another world, or storing it in the state. The
   requirement is on the set of handles, not on the manner: after the `if`, both branches must have
   consumed the same set of handles, but one branch may revoke a grant that the other stores. A branch
   that simply drops the grant is a compile error.
   Confidence: 4
