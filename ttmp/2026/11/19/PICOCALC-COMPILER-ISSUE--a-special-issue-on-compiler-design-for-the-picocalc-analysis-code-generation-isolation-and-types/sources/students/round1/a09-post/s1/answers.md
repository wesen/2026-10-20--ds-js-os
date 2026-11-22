# Answers — "9. Types That Pay for Themselves"

1. The exhaustiveness check makes every `match` on that enumeration mention each name, so when a seventh phase is added, the compiler rejects all six places until each one is updated — in effect the compiler produces the list of sites that must change, instead of the programmer remembering them or a comment. It is valuable because the defect it removes is a forgotten case (a handler that silently does nothing for the new value) and because the check is a comparison of two sets, so it is cheap. The generated code does not change: each name is still a small integer, so this buys error prevention at no run-time cost. It also prevents one enumeration's value being passed where another's is expected.
Confidence: 5

2. Distinct types prevent a `Point` (a code-point count, e.g. a cursor column) from being passed to a parameter declared `Unit` (a UTF-16 code-unit offset), even though both are `i32` underneath; the only way across is an explicit conversion function. This matters because such a mix-up is correct for ordinary text and wrong only for characters outside the basic plane, which is exactly the error testing tends to miss. At run time the cost is nothing: the representation is unchanged, so the generated code is identical, and the only price is one extra rule in the checker plus the conversion functions. Arithmetic stays usable inside one type — two `Unit` values add to a `Unit`.
Confidence: 5

3. Recording working from the loop:

```
while (at < text.length) {          // fact F: at < text.length
    if (text.charCodeAt(at) === unit) { ... }   // F still valid -> no upper-bound check needed
    at = at + 1;                    // F now invalid, because at was assigned
}
```

The fact the compiler records on entering the guarded block is `at < text.length`, which is what licenses skipping the upper-bound check on `text.charCodeAt(at)`. It becomes invalid when `at` or `text` (or `s` in the general rule) is assigned, or when a call is made that could change the length. It does not need to survive the back-edge because the loop condition is re-tested at the top of every iteration, so the fact is established again before the body runs; the compiler only needs it to hold along the straight-line path from the test to the access. This keeps the check local and single-pass: no fixpoint over the loop is required.
Confidence: 4

4. The existing check is a single *unsigned* comparison, which rejects both `at >= length` and `at < 0` in one instruction. If the guard `at < text.length` is read as a *signed* comparison, it says only that `at` is below the length; it is equally true for `at = -1`, so the lower bound `at >= 0` is still unproven and the check cannot be dropped. The article's fix is to give `at` an index type whose values are unsigned by definition. Then the same guard is itself an unsigned comparison, so it implies both halves of the bounds condition at once, and a variable of that type can never be negative in the first place.
Confidence: 4

5. The two rules are: (a) a reference into the turn arena may not be stored in the state record, and (b) a reference into the turn arena may not be live across a wait — the same rule Article 8 already imposes on buffers. Both are local checks on one function, since they only look at stores to the state and at waits in the body. Data that has to outlive the turn must be copied into storage the application owns for its whole life, i.e. fixed-capacity collections declared in the state rather than in the arena. Nothing is freed individually: the nucleus resets the arena's free pointer when the handler returns.
Confidence: 5

6. Both branches must consume the same handles: on every path through the `if`, the linear `Grant` must end in exactly one consuming operation — revoking it, sending it to another world, or storing it in the state. So if the `then` branch revokes the grant, the `else` branch must also consume it (e.g. revoke or store it), and a branch that simply returns or falls through without doing so is a compile error. The check is described as a single pass with structured control flow: after the `if`, the sets of held linear values from both branches must agree. Typestate would add that the grant may only be consumed in states where that operation is permitted, e.g. `File<Opening>` does not allow a write.
Confidence: 4
