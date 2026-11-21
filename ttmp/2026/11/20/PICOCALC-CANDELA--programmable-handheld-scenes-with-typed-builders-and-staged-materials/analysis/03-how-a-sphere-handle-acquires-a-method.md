---
Title: How a sphere handle acquires a method
Ticket: PICOCALC-CANDELA
Status: complete
Topics:
    - picocalc
    - compiler
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: picocalc-os/compiler/typed-wasm.js
      Note: Receiver resolution, options checking and emission
    - Path: picocalc-os/worlds/candela/fluent.typed
      Note: Working scene used throughout the chapter
ExternalSources: []
Summary: From a static receiver call and a named position to identical executable code and matching materials on Wasm and RV32.
LastUpdated: 2026-11-20T23:50:00-05:00
WhatFor: Understand and reproduce the Candela authoring frontend.
WhenToUse: When developing or reviewing a static builder method, options record or scene fixture.
---

# How a sphere handle acquires a method

A Candela scene author can take a sphere, place it in front of the camera and assign it a material in one expression. The result visible to the renderer is a row of five integers. If you move the author’s parentheses around, add names to the coordinates or use a dot to select a method, what would have to change in that row? What would have to change in the program that creates it?

Consider the right sphere of the shared-material scene. Its center is (100, 65, 105) and its radius is 32. At first it takes the same blue material as the left sphere. The final method changes the right sphere to a material whose color can vary between blue and gold. Here is the user-facing code from the working fixture. [Complete scene](../../../../../../picocalc-os/worlds/candela/fluent.typed)

```typescript
const right = shape.sphere(graph, 32, base)
    .at(graph, {x: 100, y: 65, z: 105})
    .material(graph, derived);
```

`graph` is the Typed buffer holding the scene tables. A *handle* identifies a row in one of those tables. The compiler represents a sphere handle in one 32-bit word and remembers its nominal type, `SphereHandle`, while checking the program. A handle can therefore travel through function calls at the price of an integer, while the compiler still knows which operations the author has declared for it. The graph carries a sphere's persistent state. The author's temporary handle identifies that state while the scene is under construction.

## What the dot means at compile time

Start with a shorter expression, `shape.sphere(graph, 32, base)`. The name `shape` is a namespace declared in the same source unit. Its declaration associates the spelling `sphere` with the ordinary Typed function `fluentSphere`. The compiler collects the function signatures before emitting bodies, so the function can appear later in the file. It checks that the target exists and uses the target's signature to compile the arguments. The emitted call produces a value whose type is `SphereHandle`.

The next dot now has a different source of information. Its left-hand side is a value. The compiler uses the value's type to look up the method `at`. The following two declarations contain every association needed for the expression. [Scene declarations](../../../../../../picocalc-os/worlds/candela/fluent-types.typed)

```typescript
namespace shape {
    sphere = fluentSphere;
}
methods SphereHandle {
    at(SpherePosition) = fluentAt;
    material = fluentMaterial;
}
```

`fluentAt` takes five parameters in order: the sphere handle, the graph buffer, x, y and z. The method group declares which receiver type is allowed. During compilation its first parameter must agree with that type. The value returned by the preceding call already occupies the first argument position. The compiler evaluates `graph` and the three coordinates after it. `fluentAt` returns a sphere handle again, so the next call finds `material` using the same procedure. The generated code can call all three functions at known positions.

We can test this interpretation by writing the expanded expression ourselves. This version appears in the qualification fixture. [Direct-call expansion](../scripts/builders/expanded.typed)

```typescript
const right = fluentMaterial(
    fluentAt(fluentSphere(graph, 32, base), graph, 100, 65, 105),
    graph, derived);
```

These two expressions impose the same sequence of evaluations. They also have the same callees, types and return values. In the complete comparison units the two Wasm modules matched byte for byte. The two RV32 images also matched, both when the compiler emitted one function at a time and when it buffered the functions. This result concerns the cost of the new spelling. A separate, hand-written fixture builds the sphere directly at its final position. That version performs different construction work and can still produce exactly the same scene.

## How much storage does a position need?

The written option `{x: 100, y: 65, z: 105}` looks like a record. In Typed an ordinary record argument is an address. A function using such a record reads fields at fixed offsets. To give this literal an address, the implementation would need to decide who allocates its twelve bytes, how long the bytes remain valid and whether a callee can retain the address. All that the builder actually requires is three integers.

`at(SpherePosition) = fluentAt` makes that requirement explicit. `SpherePosition` declares three `i32` fields in x, y, z order. The compiler checks them against the final three parameter types of `fluentAt`. It checks a literal for completeness, duplicate names, unknown names and value types. For options written in declaration order it emits the values directly. If the caller already has an ordinary `SpherePosition` reference, the compiler evaluates that reference once and loads its three fields. The target continues to receive the same five arguments.

Suppose the author writes the fields in another order and a field expression changes the graph. Sorting the expressions before evaluation could change which nodes the scene contains. To see the issue with smaller numbers, let `mark(out,n)` append digit n to a counter in a buffer, then return n. The following example uses a two-field options record declared in x, y order. The target computes `100*h + 10*x + y`.

```typescript
builder.newHandle(mark(out, 1))
    .place({y: mark(out, 2), x: mark(out, 3)})
```

The written order promises to call the markers in order 1, 2, 3. The target expects the positional arguments 1, 3, 2. Both expectations can hold. The emitter evaluates the receiver first, then both fields in written order. Starting at the first field that arrives out of position, it saves each value in a compiler-generated scalar local. It reloads the saved suffix in field order before making the direct call. On both Wasm and RV32 the buffer contained **123** and the target returned **132**. A second probe discarded the return values of calls made as statements. Its four effects still appeared in the order 4, 5, 6, 7. These probes detect an implementation which happens to get all the constant coordinates right while duplicating or reordering real work. [Host qualification and probes](../scripts/builders/qualify.mjs)

## Following blue through two spheres

The graph has separate expression, material and sphere tables. A sphere refers to a material. A material refers to its root color expression. In this fixture the left sphere’s material ends at one constant blue expression. The right sphere’s material ends at a blend whose first operand points back to that same blue expression. A parameter slot supplies the weight. This structure makes the original color shareable while leaving the right sphere free to vary.

For a weight q, the blend computes each channel as ⌊((256 − q) × blue + q × gold) / 256⌋. At the midpoint the red channel becomes (30 + 220) / 2 = 125. The following readings came from the material evaluator, before scene lighting. Floor samples straddle the boundary between checker cells at (11, 0) and (12, 0). [Measured samples](../various/builders/host.json)

| Weight q | Left sphere | Right sphere | Floor samples |
| ---: | --- | --- | --- |
| 0 | (30, 70, 150) | (30, 70, 150) | (48, 61, 72), (72, 93, 109) |
| 128 | (30, 70, 150) | (125, 120, 95) | same two colors |
| 256 | (30, 70, 150) | (220, 170, 40) | same two colors |

There were three ways to construct the scene: the original hand implementation, the fluent authoring code and the direct expansion of the fluent code. Running each on Wasm and the RV32 instruction interpreter yielded six independently invoked constructors. All produced the same 303-cell descriptor, including its seven expression nodes, three materials, two spheres and one parameter. Comparing the descriptor after each update showed that only the first parameter cell changed. Inspecting the inputs to the blend established the shared blue expression independently of matching colors at weight zero.

The graph tests exercise only construction and material values. The display also involves finding the nearest geometry, applying light and shadow, converting to screen colors and transferring pixels. Similarly, compiling both spellings to the same executable image answers the per-call overhead question for the canonical ordering. It does not measure compiler time or give a bound for a scene full of reordered, effectful options. These distinctions let separate tests answer separate questions using the same graph. [Shared graph contract](../design-doc/01-shared-scene-graph-contract-and-acceptance-fixtures.md)

## A small experiment

Change the position in the fluent source to `{z: 105, x: 100, y: 65}`. Keep the hand fixture unchanged. You can predict the geometry and sampled colors before recompiling. The descriptor should remain identical, because the chosen values for x, y and z have not changed. The compiler may emit temporary locals for the reordered suffix, so the binary-identity assertion against the canonical expansion can now fail. The compiler is preserving an evaluation order that would matter as soon as one of those three constants became a call. Running separate image and scene comparisons makes that distinction observable. [Intern implementation and reproduction guide](../design-doc/03-a-static-builder-call-from-source-to-machine-code.md)
