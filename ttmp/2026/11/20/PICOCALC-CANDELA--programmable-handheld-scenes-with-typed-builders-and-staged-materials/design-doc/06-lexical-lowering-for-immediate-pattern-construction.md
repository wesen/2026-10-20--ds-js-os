---
Title: Lexical lowering for immediate pattern construction
Ticket: PICOCALC-CANDELA
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T23:49:26.551621233-05:00
WhatFor: ""
WhenToUse: ""
---

# Lexical lowering for immediate pattern construction

An accepted callback appears in the direct call form pattern(p => expression). Its result is an expression handle. The function containing it can accept a caller-owned graph buffer and local handles for parameters or materials. At scene construction the body accesses these bindings in the same stack frame. When the body finishes, only its result handle survives. Individual pixels later supply coordinates to the graph evaluator. No runtime object holds a pointer into a returned stack frame.

    recognize the direct intrinsic before unknown-function checking
    consume the point parameter and contiguous arrow
    preserve the surrounding binding with that name
    bind the parameter to the construction-time SurfacePoint
    typecheck and emit the ordinary expression
    require an expression-handle result and the closing parenthesis
    restore the original lexical binding, including on a diagnostic

The checker treats per-hit BoolExpr values differently from construction-time bool. An if condition requiring bool rejects BoolExpr with a diagnostic identifying the staging error. The pattern accepts one expression and has no binding-assignment statement. Its direct calls can append nodes to the graph buffer; these effects implement the builder. Read-only capture refers to binding reassignment.

The archived independent [Opus design study](../various/callbacks/opus-design.md) also considered escaping values, a dedicated context ABI, sticky errors and a different fixed-point representation. Those alternatives are research notes. The implemented schema, handle numbering and Q8 arithmetic follow [the shared contract](01-shared-scene-graph-contract-and-acceptance-fixtures.md). Inspect FunctionEmitter.patternBody and call in picocalc-os/compiler/typed-wasm.js, and the tile definitions in picocalc-os/worlds/candela/patterns.typed. The tests use a construction counter and shadow an outer variable intentionally. They compare both target diagnostics and run the complete captured tile against the hand-built graph.
