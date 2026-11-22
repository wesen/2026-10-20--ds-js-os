# Answers to "Check your understanding" (Article 9)

## 1

Two of the three places are: the file browser's key handler in `worlds/files/files.typed`, which returns the bare integer 14 for "delete" and 15 for "submit"; and the Editor's event handler, which tests `event.kind === 4`. (The third is `state.findPhase`, where values below 4 are search phases, 4 means "not found" and 5 means "found".) Replacing them by an enumeration changes nothing in the generated code, because the article says the compiler represents each name as a small integer, "so the generated code is the same as today's." What changes is at compile time: a value of one enumeration may not be used where another is expected, and every `match` must mention every name, so adding a phase makes the compiler list all the matches that need updating.

Confidence: 5

## 2

The four coordinate systems are: bytes of UTF-8 in the file; UTF-16 code units in memory; code points, used for the cursor column; and wrapped rows on the display. The mistake is passing a code-point column where a code-unit offset is expected: both are `i32`, so it compiles without complaint, and the value is wrong only for text containing characters that need two code units, such as emoji. Working the example: in `a🙂b` the text is 6 bytes (1 + 4 + 1), 4 code units (1 + 2 + 1) and 3 code points, so a code-point column of 2 is a code-unit offset of 3 — the difference is exactly the character that is two units wide. Tests written with plain text miss it because for ASCII text all of bytes, code units and code points agree; the error only appears once a two-unit character precedes the position.

Confidence: 4

## 3

The fact recorded is the guard itself, `at < text.length`, taken as true on entry to the block it guards — here the body of the `while` loop. Three kinds of event discard it: an assignment to `at` (`at = at + 1`), an assignment to `text` (or to its length), and any call. Nothing needs to be remembered from one iteration to the next because the loop condition is tested again before every iteration and establishes the fact afresh: entering the body a second time re-proves `at < text.length` for the new value of `at`, so the compiler never has to carry a fact around the back-edge. The article's phrase is that the fact is "recorded on entering the loop body, used at `text.charCodeAt(at)`, and discarded at `at = at + 1`."

Confidence: 5

## 4

The existing bounds check is a single unsigned comparison, which rejects both an index that is too large and a negative index, since an unsigned negative-looking value compares as enormous. A signed test `at < text.length` says nothing about `at >= 0`: it is true for `at = -1`, so it justifies removing only the upper half of the check, and a negative index would slip through unchecked. An unsigned index type resolves this: `index` values are unsigned 32-bit integers, a string's `length` has type `index`, and `let at: index = 0` makes comparisons between two `index` values unsigned. Since the guard `at < text.length` is then exactly the comparison the bounds check would make, it implies the whole check, lower bound included, and the check can be dropped.

Confidence: 5

## 5

The two rules are: a reference into the turn arena may not be stored in the state record, and a reference into the turn arena may not be live across a wait. Both are local checks. A program whose data must outlive the turn must copy that data into storage the application owns for its whole life (the article's other option is a fixed-capacity collection declared in the state, sized at compile time). The arena itself is reset in bulk — the nucleus resets the pointer when the handler returns — and nothing in it is ever freed individually.

Confidence: 5

## 6

At the end of each branch the grant must have been consumed exactly once, by one of the operations that consume it: revoking it, sending it to another world, or storing it in the state. A branch that simply falls through without doing any of these is a compile error, because the check requires the same set of handles to have been consumed after an `if`. The two branches may dispose of the grant in different ways: the article says the branches "need not have consumed them in the same way; one branch may revoke a grant that the other stores." So the requirement is on which values are consumed, not on how.

Confidence: 4

## Notes on confidence

- Question 2: I could not check the *wrapped rows* system at all; the article names it and never gives a wrapped-row value for `a🙂b`, so my answer for the fourth coordinate system rests on the name alone.
- Question 3: "three kinds of event" fits the text if one counts the two assignments separately; the article's own sentence lists "until `i` or `s` is assigned or any call is made", which reads as two kinds with three instances.
- Question 6: the phrase "the same set of handles" is ambiguous between "the same handles" and "the same number of handles"; I read it as the former, which is the only reading that makes the following sentence ("need not have consumed them in the same way") sensible.
