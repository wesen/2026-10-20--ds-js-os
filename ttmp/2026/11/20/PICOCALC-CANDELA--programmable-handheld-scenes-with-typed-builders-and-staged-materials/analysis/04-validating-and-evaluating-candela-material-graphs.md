---
Title: Validating and evaluating Candela material graphs
Ticket: PICOCALC-CANDELA
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/candela_scene.c
      Note: Validates the graph and connects Typed material callbacks to native C geometry
    - Path: repo://picocalc-os/worlds/candela/builders.typed
      Note: Creates checked scene descriptors and edits one selected parameter
    - Path: repo://picocalc-os/worlds/candela/materials.typed
      Note: Implements scalar and proven scanline graph evaluation in Typed
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Validating and evaluating Candela material graphs

A Candela scene can give two spheres the same blue material and then derive a variation for one sphere. Moving the variation's weight changes the right sphere. The left sphere keeps its original material and its sampled RGB565 pixel stays at 6,640 throughout the experiment. A second scene changes the checker-like tile pattern on the plane by writing one parameter cell. Both effects run through real ray geometry, and the scalar and bulk Typed shaders agree on every pixel tested on Wasm and on a model of the emitted RV32 code. [Host qualification receipt](../various/renderer/host.json)

## Give a material a computational definition

A sphere record contains geometry and a material handle. The handle is an integer index into a separate material table. A material entry points to a color expression. An expression may name another expression as an operand. The resulting directed graph describes which values need to exist before a material color can be computed. For example, a mix has two color operands and a scalar amount. The amount can be a parameter expression, which loads a cell editable after the graph has been built.

The tables are small enough to fit in one Typed buffer. The first eight cells identify the format and how many entries to read. Then come fixed regions for 64 expression nodes, 16 materials, three spheres and eight parameters. Each occupied expression entry has an opcode and three operand cells. The header conceptually identifies how many cells are visible to checked Typed buffer operations. On this ABI the 32-bit capacity lives immediately before the 303 graph payload cells. [Frozen scene contract](../design-doc/01-shared-scene-graph-contract-and-acceptance-fixtures.md)

The hand-built shared fixture uses this sequence. The calls below assume the graph is initialized, and the two sphere entries already reference the material named `shared`.

```typescript
const gold = candelaColor(graph, 220, 170, 40);
const slot = candelaParameter(graph, 0);
const amount = candelaParam(graph, slot);
const mix = candelaMix(graph, blue, gold, amount);
const varied = candelaMaterial(graph, mix);
candelaSphereMaterial(graph, right, varied);
```

The blue expression is still a single entry for RGB `(30, 70, 150)`. The variation refers to that entry as its first operand and to gold as its second. At weight 128 of 256, the mix returns RGB `(125, 120, 95)` before geometric shading. The resulting graph can support running renders at several weights. The original material entry and the variation's operand links survive every edit.

## Validate graph order before the first ray

The C entry point rejects a graph before it writes pixels when its counts, capacity, geometry or references fail validation. Every expression can refer only to smaller expression indices. That makes the buffer order a topological order, meaning each operand is ready by the time the evaluator visits its consumer. A cycle is impossible because an edge to an operand always decreases the node number. The validator records each preceding node's result kind as it walks forward. A mix that points to a color where a scalar belongs is rejected even when the handle names an existing node.

A floor handle names a material, a material names a color expression, and a parameter operand names an occupied parameter slot. Those domains each have their own bounds. The caller cannot pass a parameter index where the material table expects an expression handle and rely on the same numeric range to imply compatibility. The renderer also checks the native geometry envelope. That protects both ordinary integer depth arithmetic and the 16-bit packed discriminant calculation.

The Typed evaluator can rely on these facts once rendering starts. It stores up to three cells for each intermediate. An RGB result uses all three. A vector uses its first two cells. A scalar uses the first. It runs the prefix through the target expression in table order, so an expression shared by several later operands is evaluated once within that pixel's evaluation. The C validator and geometry do no material arithmetic. [Renderer and ABI diary](../reference/02-renderer-investigation-diary.md)

```mermaid
flowchart LR
    B[Typed builders] --> G[Graph and parameter cells]
    G --> V[C validates counts and operand kinds]
    V --> H[C selects nearest surfaces]
    H --> M[Typed samples selected materials]
    M --> L[C applies lighting and RGB565 conversion]
```

## Reuse a result when the sample coordinate changes

The scalar API returns the material's RGB888 value at one `(x, y)`. The bulk API takes the 160 winning material handles for a scanline and returns two halfwords per pixel. One halfword packs red and green. The second contains blue. The scene graph and evaluation rules are the same in both modes.

Moving one pixel can change x, the selected material, or both. A constant color can be reused until the material run ends. A mix of two literal colors and a parameter can use the same rule because the parameter stays fixed during the draw. For a checker with literal branches, a change of quotient `x / cell_size` is another invalidation event. For example, y = 13 is in checker row 1 at cell size 12. The quotient is zero at x = 11 and one at x = 12, so the sample must switch branches there.

The tile fixture demonstrates another kind of reuse. The canonical expression scales a position by a parameter, takes the fractional components, turns those into a binary mask, and selects between two literal colors. Coordinates and weights use Q8, where 256 represents one. A pixel x first enters the graph as `256*x`. Scaling by `weight` and dividing by 256 then gives `x*weight` exactly. The fractional component is `(x*weight) % 256`. In a row the y component stays fixed. The bulk code proves that exact graph shape, computes the y decision once per material run and samples between the two literal colors. A material with a different structure still runs through the general evaluator.

Pixel `(12,13)` illustrates why a parameter edit can change the pattern. At weight 64 the residues are 0 and 64. The x residue is below 32, so the mask selects the low color. Weight 73 produces residues 108 and 181, which select the high color. Both are integer decisions and require no floating-point tolerance. The largest position component, `159*256 = 40,704`, fits a scratch halfword, and the largest intermediate product, `40,704*256 = 10,420,224`, fits a signed 32-bit multiply.

## A general dependency rule and its local application

An independent public-methodology chapter considers an expression such as `(a*b+c)*sin(t)+(a*b+c)`. A forward pass marks each node according to whether it depends on the changing coordinate `t`. The shared `a*b+c` then stays constant within the run, provided the parameters stay fixed. The same argument applies to the literal mix in Candela. The per-row routine implements a few small shape proofs rather than a general dependence pass. Checker reuse additionally needs a stable cell quotient, and the tile rule additionally factors out the y calculation.

The generic chapter was commissioned from Claude Opus High with tools disabled and only a public computer-science question. The Candela-specific implementation, arithmetic examples and measurements here were produced and checked locally. The independently authored public chapter contains no project inputs or outcomes. [Public methodology chapter](../sources/renderer/02-opus-high-public-methodology.md) · [Model provenance](../sources/renderer/provenance.json)

## Compare material colors and finished frames

The host test asked the real C geometry for every material handle that won the depth test. It then ran the ordinary Typed compiler's Wasm and RV32 outputs against the resulting rows. For each row it compared the scalar calls with the bulk result and checked the whole guest memory between the two compilation targets. It replayed the agreed colors through the real C lighting and RGB565 conversion. This separates host process cost from the work done by either shader and still exposes the actual material selection and rendered pixels.

| Fixture and weight | Sample coordinate | RGB565 values |
|---|---|---|
| Shared, 0 / 128 / 256 | Left sphere at (60, 61) | 6,640 / 6,640 / 6,640 |
| Shared, 0 / 128 / 256 | Right sphere at (110, 65) | 4,493 / 23,208 / 39,875 |
| Tiles, 64 / 73 / 128 | Plane at (12, 13) | 8,552 / 27,799 / 8,552 |

Both scene families keep geometry constant through the parameter edits. Each frame therefore has 25,600 rays, 4,470 sphere pixels and 3,339 visible shadow pixels. The tests also check parameter edits byte for byte. Only the intended parameter payload cell may change. Full tables and invalid handles leave the buffer untouched. Malformed graph controls include a self-reference, an incorrect operand kind, a bad floor handle and an invalid sphere. They are rejected before the color callback runs or the destination changes.

The test also wraps the tiled color at weight 73 in a redundant mix whose two inputs are the same. It still produces the same full image. That wrapper prevents the exact tile recognizer from applying and exercises the general bulk path. The RV32 model counts about 44.2 million shader instructions for the scalar tile scene and 2.35 million for its specialized row form at the same weight. The wrapped fallback uses about 44.9 million row instructions for the same pixels. These counts measure compiled shader work in the host model, including the test's row loop. Physical elapsed time also depends on native execution, the renderer, buffer traffic and integration. [Complete host receipt](../various/renderer/host.json)
