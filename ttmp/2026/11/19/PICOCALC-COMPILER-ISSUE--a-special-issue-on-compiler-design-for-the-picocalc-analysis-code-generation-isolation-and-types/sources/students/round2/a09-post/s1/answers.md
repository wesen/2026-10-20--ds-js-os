# Answers to "Check your understanding" (section 9.12)

1. Two of the three places are the file browser's key handler, which returns 14 for "delete" and 15 for "submit", and the Editor's event handler, which tests `event.kind === 4`. (The third is `state.findPhase`, where values below 4 are phases, 4 is "not found" and 5 is "found".) Replacing any of these with an enumeration would change nothing in the generated code, because section 9.2 says the compiler still represents each name as a small integer. What changes is only in the checker: names from one enumeration could not be used as another, and every `match` would have to mention every name.

Confidence: 5

2. The four coordinate systems are: bytes of UTF-8 in the file, UTF-16 code units in memory, code points (used for the cursor column), and wrapped rows on the display. The mistake is passing a code-point column where a code-unit offset is expected; both are `i32`, so it compiles without complaint. The article says the result is wrong only for text with characters that need two code units, such as emoji, which is exactly what tests written with plain text miss. Its example is `a🙂b`: 1 + 4 + 1 = 6 bytes, 1 + 2 + 1 = 4 code units, and 3 code points.

Confidence: 5

3. The fact recorded on entering the guarded block is that `at < text.length` holds, so the access `text.charCodeAt(at)` needs no upper-bound check. The fact is discarded when `at` is assigned, when `text` is assigned, or when any call is made (the article discards it at calls because deciding whether a call could change a length would need facts about the callee). Nothing needs to be remembered from one iteration to the next because the loop condition is tested again before every iteration, so the fact is re-established at the top of each pass. In the example the fact is discarded right away at `at = at + 1` and rebuilt by the next test.

Confidence: 5

4. A signed test `at < text.length` only gives an upper bound; it says nothing about the lower bound, so `at` could still be negative. The existing bounds check is a single unsigned comparison, which rejects negative indices as well, so a signed guard would only imply half of it. The unsigned index type (written `index`, values unsigned 32-bit) fixes this: `length` has that type, the loop counter is declared with it, and comparisons between two `index` values are unsigned. Then `at < text.length` is exactly the comparison the bounds check would make, so it implies the whole check.

Confidence: 5

5. Two rules: (a) a reference into the turn arena may not be stored in the state record, and (b) a reference into the turn arena may not be live across a wait (the rule Article 8 already imposes on buffers). A program that needs data to outlive the turn must copy it into storage that the application owns for its whole life. Both rules are local checks, and the arena itself is reset wholesale when the handler returns, so nothing is ever freed individually.

Confidence: 5

6. On every path through the function the grant must end in exactly one consuming operation, so at the end of each branch it must have been consumed exactly once — revoked, sent to another world, or stored in the state. The two branches may dispose of it in different ways: the article says one branch may revoke the grant that the other stores. What must match is the set of handles consumed, not the manner of consumption; a path that leaves the grant unconsumed is a compile error.

Confidence: 5
