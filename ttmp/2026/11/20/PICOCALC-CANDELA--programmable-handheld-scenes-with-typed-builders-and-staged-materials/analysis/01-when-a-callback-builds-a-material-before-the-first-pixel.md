---
Title: When a callback builds a material before the first pixel
Ticket: PICOCALC-CANDELA
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T23:47:12.152134677-05:00
WhatFor: ""
WhenToUse: ""
---

# When a callback builds a material before the first pixel

The handheld compiler accepts a direct call of the form `pattern(p => expression)`. Here is the tile callback from the running source, formatted across lines.

```javascript
const tiles = ScalarExpr(candelaParam(graph, slot));
const mask = pattern(p =>
    tileMaskExpr(graph,
        fractExpr(graph,
            scaleExpr(graph, surfacePosition(graph, p), tiles))));
```

The point supplies a symbolic position. The captured `tiles` identifies a parameter node. Building this callback appends four nodes. The frame shader later reads the coordinates and the current slot value. The Opus High researcher's worked example below uses a more general pseudolanguage to explain the staging and capture rules. Its local declarations, float operations and selection syntax are illustrative. The PicoCalc implementation accepts a single expression, uses named direct functions, and evaluates the validated graph in a compiled Typed shader.

## What a Construction-Time Callback Is

A procedural image can be described as a function from a position to a color. A small statically typed language can let the programmer write that function as a callback that runs once, while the program assembles a graph. The callback receives symbolic values instead of numbers. Each operation it performs creates a node, and its return value is the root of an expression graph. A later stage translates the graph into code for one or more backends, which evaluate it at each sample position.

The callback is limited to expressions. It may bind names with `let`, but it cannot assign variables or loop. The type system separates two kinds of value. A host value such as `Float` is known during construction. A graph value such as `Expr<Float>` is known only during evaluation.

## A Tile Example

Consider a square tile with a diagonal band and an optional circular inset.

```
fn tile(rounded: Bool, width: Float) -> Shader {
  shader(fn (p: Expr<Vec2>) -> Expr<Color> {
    let d = abs(p.x - p.y)
    let inBand = d < width              // Expr<Bool>
    let base = select(inBand, rgb(0.9, 0.6, 0.2), rgb(0.1, 0.1, 0.2))
    if rounded {                        // Bool, decided at construction
      let inDisc = length(p - vec2(0.5, 0.5)) < 0.2
      select(inDisc, rgb(1.0, 1.0, 1.0), base)
    } else {
      base
    }
  })
}
```

Calling `tile(true, 0.1)` builds a graph containing disc nodes. Calling `tile(false, 0.1)` builds a smaller graph without them.

## Host Conditionals Versus Spatial Boolean Nodes

The `if rounded` expression tests a `Bool` that is fixed during construction. It runs once and decides which nodes exist. When `rounded` is false, the disc nodes are never created, and no backend evaluates them.

The comparison `d < width` is different. Its left operand is a graph value, so the comparison produces neither true nor false. It produces a node of type `Expr<Bool>` that represents a region of the plane: the set of positions where the condition holds. During evaluation, the `select` node uses that region to choose between two colors at each position.

Static typing enforces the separation. Writing `if inBand { ... }` is a type error, because `if` requires a `Bool`. Without the check, the language would have to evaluate the condition at an arbitrary position or silently pick a branch.

## Uniforms and the Single Construction Pass

A uniform is an input whose value can change after construction. For example, the `width` parameter could be replaced with `uniform<Float>("width")`. Its type is `Expr<Float>`, and its node refers to a named slot rather than a constant.

Changing the value bound to that slot does not rerun the callback. Construction has already finished and the shape of the graph is fixed. The existing nodes read the new value at the next evaluation. For the same reason, a uniform cannot control a host conditional. The type checker rejects the attempt, and the `if rounded` decision was made before evaluation began. To switch a feature at evaluation time, the programmer writes the switch as a node, such as `select(uniform<Bool>("rounded"), withDisc, base)`. This keeps both subgraphs in the graph.

A related mistake is reading a uniform's current value during construction and passing it to a host parameter. That value is copied into the graph as a constant, and later updates have no effect on it.

## Lowering: Capture Lifetime and Lexical Shadowing

A lowering pass translates the graph into a backend form. Two issues in that translation need explicit rules.

The first is capture lifetime. A callback may refer to host variables from its enclosing scope, such as `width`. Evaluation typically happens after the enclosing function has returned, so the variable may no longer exist. The pass can resolve each capture in one of three defined ways:

- copy its value into the graph as a constant;
- promote it to a uniform with a named slot;
- reject the program with a diagnostic, when the capture refers to mutable state whose later value the programmer may expect to see.

Each option removes any dependence on the host variable's lifetime.

The second is lexical shadowing. Nested callbacks may reuse names, as in an inner `let p = p * 2.0` that shadows the outer parameter. The target language may resolve such names differently. The pass can rename every binding to a unique identifier before emission. Renaming follows the source's scoping, so the two `p` bindings receive distinct names. Each reference in the output then names exactly one definition, regardless of the target's scoping rules.

## Testing Equality Across Two Backends

Suppose a graph lowers to two backends, such as a reference interpreter and generated shader source. A direct test compares their outputs. Both backends evaluate the same graph on the same grid of positions with the same uniform values.

Color channels are compared within a stated tolerance, because the backends may round floating-point operations differently. Boolean nodes need separate treatment. Positions far from a region's boundary should agree exactly. Positions very near the boundary may differ after rounding.

Randomly generated graphs drawn from the node grammar exercise combinations that hand-written cases miss.

## What Equality Tests Cannot Establish

Agreement on sampled positions does not establish agreement at unsampled positions, for untested uniform values, or for graphs the generator did not produce. It does not show that either backend is correct, since both may inherit the same defect from a shared lowering stage. A tolerance conceals differences below its threshold.

Equality tests also say nothing about speed or resource use. They cannot confirm that a graph expresses what its author intended. Those questions require other methods, such as a written semantics for each node, review of the lowering rules, and direct measurement.

## What we measured in the Typed implementation

One focused test called two different builders and counted their construction effects. They produced two increments, and a callback point with the same name as an outer scalar left that scalar available after the call. Two compiled targets rejected all five intentionally invalid programs, including the attempt to branch on a per-hit BoolExpr. A separate integrated test executed code generated for both Wasm and RV32, built each complete fixture, changed its single parameter three times, and compared memory after every operation. The only graph bytes allowed to differ after an edit were the two bytes of the parameter cell. This check detects unintended appends even when the resulting colors happen to be equal. [Integrated execution results](../various/director/stages.json)

The lowering in the production compiler emits the callback body directly while the original function's locals are in scope. Argument evaluation in the body follows ordinary function-call rules. The implementation restores the previous lexical binding on every exit from the parser, including a diagnostic. Inspection of the board results is necessary for conclusions about physical speed, because the host instruction model establishes behavior but has no model of the P4's instruction or data caches. [Implementation design](../design-doc/06-lexical-lowering-for-immediate-pattern-construction.md)
