---
Title: Selecting typed expression productions from one lookahead token
Ticket: PICOCALC-PARSER-DISPATCH
Status: active
Topics:
    - picocalc
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T00:53:04.661534668-05:00
WhatFor: ""
WhenToUse: ""
---

# Selecting typed expression productions from one lookahead token

## The work a parser performs

When the compiler reads `x + 1`, it first recognizes the expression beginning at `x`. It resolves the name, determines its type, and emits instructions to read its value. The surrounding expression parser then recognizes the infix operator and parses the right operand. In the typed frontend, `FunctionEmitter.prefix()` implements the first part. It shares one lexer with the rest of the function. The lexer exposes a current token and advances when a production consumes it.

A production is a rule describing which token sequence represents an expression. Parentheses begin a grouped expression. The token `!` begins Boolean negation. An integer token begins an integer literal. A name may begin a local read, an enum member or a call. Selecting among these particular alternatives requires only the current token. The existing implementation tries several alternatives by repeatedly calling `Lexer.accept(spelling)`. A failed call leaves the current token in place. A successful call both selects the rule and consumes the token.

## The measured cost opportunity

The old Editor source has 70,857 UTF-16 units. Under the staged token-reuse compiler it enters the prefix parser 4,069 times. Its dynamic call subtree, excluding nested expression calls attributed to their own consumer, performs 26,014 failed token tests. Seven of the top-level spellings account for most misses. The call that tests for the conversion keyword `i32` alone fails 2,740 times. These are counts. The stopwatch runs separately because the wrappers themselves have substantial overhead. The existing best staged frontend took 35.15 ms on this source against the 31.4 ms historical target.

## Design and invariant

Read the token value once. Select a production by spelling, enter that production, advance exactly once, and execute its existing implementation. Integer classification and ordinary identifier resolution retain their original guards and source offsets. The dispatcher introduces no parser table allocation, generated metadata or persistent compiler state. It is a local experiment in the expression parser. Both the Wasm and native compilers consume the resulting checked operations.

```text
current token
    │
    ├── "(" ─── consume ─── parse inner expression ─── expect ")"
    ├── "!" ─── consume ─── parse operand ──────────── require bool
    ├── "-" ─── consume ─── parse operand or signed-limit literal
    ├── true/false, Math, i32 ─── consume ─── existing production
    └── other ─── classify integer or resolve identifier
```

The special signed literal illustrates why the interior of a production stays intact. The magnitude 2,147,483,648 is permitted immediately after unary minus to represent the smallest signed integer. Changing the order of consumption would change either the accepted numeric range or the reported error location.

```text
prefix(lexer):
    spelling = lexer.current.value
    switch spelling:
        case "(":
            lexer.next()
            inner = expression()
            lexer.expect(")")
            return inner
        ... other known prefix forms ...
    if lexer.current.kind == integer:
        check and emit the literal
    else:
        resolve the identifier in its lexical scope
```

## Interfaces, source and measurement

| Interface or artifact | Responsibility |
| --- | --- |
| `picocalc-os/compiler/typed-wasm.js`, class `Lexer` | Own the token, its source position, and advancement. |
| Same file, `FunctionEmitter.prefix` and `expr` | Recognize a prefix, check its type and continue through operators by precedence. |
| `typedWasm.compileFunctions(source, importCount, imports, maxSourceLength)` | Drive the entire frontend used in the professor's benchmark. |
| `scripts/01-count-parser-tests.js` | Count matching and failed decisions inside a fresh host QuickJS process. |
| `various/parser-decisions.json` | Preserve the untouched observed counts by consumer and spelling. |
| Lexical index ticket, `scripts/12-run-professor-frontend.sh` | Reproduce the historical fifteen-run stopwatch and the input assembly. |

Create the prototype in a detached compiler directory. Compare both Editor artifacts and error messages from the existing language fixtures. Include Boolean literals, unary minus at the signed limit, grouped arithmetic, enum members, local functions, ordinary identifiers and malformed punctuation. Compare cold or warm timings only with a control using the same runtime and the same repetition protocol. Run the performance comparison without the counting wrappers. Report the workload and scope of the strongest supported conclusion. If this local change does not materially help, retain the evidence and leave the shipping compiler alone.
