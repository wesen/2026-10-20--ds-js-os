# Answers to "Check your understanding" (section 9.12)

## 1. Exhaustiveness when an enumeration gains a value

Adding a name to the enumeration makes every `match` that does not mention it fail the exhaustiveness check, so the compiler reports six errors, one for each of the six places, instead of silently falling through. That is valuable because today nothing connects the number to its meaning except a comment, and nothing detects a handler that forgets a case; the list of errors is effectively a to-do list of the sites that the new value changes the meaning of. The check is cheap: for enumerations without nested data it is only a comparison of two sets, and it costs nothing at run time since each name is still a small integer.

Confidence: 5

## 2. `Unit` versus `Point`

Both are represented as 32-bit integers, but the checker treats them as different types, so a `Point` cannot be passed where a `Unit` is expected. What this prevents is the four-coordinate-system confusion of section 9.3: a code-point column handed to a parameter expecting a UTF-16 code-unit offset compiles today and is wrong only for text outside the basic plane, "the kind of error that tests miss". The conversion is no longer implicit; it must go through a function that performs it, such as the reactor's code-point-to-code-unit mapping. At run time it costs nothing, because the representation is unchanged; the compiler only gains one rule.

Confidence: 5

## 3. The recorded fact in the loop of 9.4

On entering the loop body guarded by `at < text.length`, the compiler records the fact that `at < text.length` holds there, and while that fact is valid an access `text.charCodeAt(at)` needs no upper-bound check. The fact becomes invalid when `at` or `text` is assigned, or when a call is made that could change the length — in this loop the `at = at + 1` does exactly that, so the fact dies at the end of the body. It does not need to survive the back-edge because the loop condition is tested again at the top of every iteration and re-establishes the same fact before the body is entered.

Confidence: 4

## 4. Why the signed guard is not enough

The existing check is a single unsigned comparison, which rejects negative indices as a side effect; a signed test `at < text.length` is true for `at = -1`, so it would justify removing a check and leave a real out-of-bounds access behind. In other words the guard says nothing about `at >= 0`, and the lower bound has to be discharged some other way. An index type whose values are unsigned by definition does that: for a variable of that type the guard is itself an unsigned comparison, so the same test simultaneously implies `at >= 0` and `at < text.length`, which is the whole bounds check.

Confidence: 4

## 5. The two arena rules

First, a reference into the turn arena may not be stored in the state record, because the state record outlives the turn while the arena is reset when the handler returns. Second, a reference into the turn arena may not be live across a wait, the same rule Article 8 already imposes on buffers. Data that has to outlive the turn must be copied into storage that the application owns for its whole life — for example a fixed-capacity collection declared in the state. Both rules are local checks, so they fit the criterion of section 9.1, and allocation itself costs only two or three instructions since the pointer is simply advanced and the whole arena is reset at the end of the turn.

Confidence: 4

## 6. A linear `Grant` in an `if`

Every path through the function must end the grant in exactly one of the consuming operations — revoking it, sending it to another world, or storing it in the state — so neither branch may forget it, and neither branch may use it twice. The single-pass rule the article states is that after an `if` both branches must have consumed the same handles. A branch that returns early is a path too, so it must dispose of the grant before it returns. If typestate is also tracked, the branches must additionally leave the handle in a state the code after the `if` is allowed to use, such as `File<Ready>` rather than `File<Opening>`.

Confidence: 3
