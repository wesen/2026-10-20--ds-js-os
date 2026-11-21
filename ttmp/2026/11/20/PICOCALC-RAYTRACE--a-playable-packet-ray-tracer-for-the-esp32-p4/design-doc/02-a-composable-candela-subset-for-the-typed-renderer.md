---
Title: A composable Candela subset for the Typed renderer
Ticket: PICOCALC-RAYTRACE
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
LastUpdated: 2026-11-20T23:29:21.224301084-05:00
WhatFor: ""
WhenToUse: ""
---

# A composable Candela subset for the Typed renderer

The source archive on the workstation is ~/Downloads/candela-workspace.zip. In candela/src/scene.js the immutable Comp object stores kind, properties and metadata. Changing a property constructs a new component. Methods on the public builder are presented through a Proxy. In src/fx.js expression-building operations record nodes. A pattern callback receives symbolic shading inputs and constructs an expression once. src/ir.js exposes the resulting material and expression graph for inspection. src/compile.js lowers components, allocates uniforms and emits code for the rendering backend. src/kernel.js supplies the WGSL path tracer used by the browser. These stages need different amounts of work on the handheld.

## A small authoring language with reusable values

Begin with sphere placement, a ground plane, an orthographic camera, one directional light, diffuse colors, checker patterns, a scalar parameter, and a color mix. A shape and a material should have independent identities. Two spheres may share the same material. Deriving a lighter version of a material for the second sphere must leave the first sphere intact. Treat a user-defined fragment as a normal Typed function that constructs and returns a derived material. For version one, expose a closed set of fields. Candela's open-ended registration of new fluent methods and interceptors can wait.

For a concrete test, give two spheres a shared blue diffuse material. Derive a second material by mixing blue and gold-colored diffuse albedos with a user-adjustable parameter. Give the plane a procedural checker input. Changing the parameter should alter only the derived material. A second test can mix colors by surface normal or position, which verifies that per-hit inputs remain live. A gold-colored diffuse surface here has no metallic reflection. This is color-expression composition; Candela's general bsdf.mix can mix scattering distributions, with different sampling behavior.

    blue = diffuse(scene, rgb(30, 70, 150))
    amount = scalarParameter(scene, sliderId)
    tint = mixColor(scene, materialColor(scene, blue), goldColor, amount)
    painted = withColor(scene, blue, tint)
    addSphere(scene, left, blue)
    addSphere(scene, right, painted)

The above is API design pseudocode. Implement constructors as ordinary Typed functions over a caller-owned buffer or record with bounded tables. Each constructor allocates a tagged record and returns a handle. Validate that child handles refer to earlier nodes and fit in the table before committing a record. Distinct handle types can distinguish color expressions, scalar expressions, shapes and materials. Retain sharing when the same handle is used twice. Compile the graph once to a compact sequence of operations. Constant-fold expressions with only literal inputs, refresh parameter-only values on edits and evaluate spatial expressions at hits. A fixed-point scale is part of the public numeric contract. Specify overflow, interpolation endpoints and RGB conversion before comparing pixels. These are necessary to make two implementations agree at silhouettes and checker boundaries.

## What the existing compiler proved

A host probe compiled two Typed functions. One wrote a four-cell mix record to a buffer. The other blended two integer channels with weight in 0..256. Together they emitted 232 bytes of Wasm and 336 instruction bytes of RV32. A Wasm run wrote cells [3,1,2,3] at index 8 and blended 32 and 224 at the midpoint to 128. This establishes the representation and arithmetic work with the existing compiler. The probe exercised neither a graph evaluator nor the on-device renderer.

## Device work and acceptance

1. Extend the current fixed-scene renderer with uniformly consumed sphere and material descriptors. Preserve its existing defaults as a golden scene. All objects can share one descriptor layout in the scalar and PIE intersection paths.
2. Add the bounded Typed builders and a small material evaluator. Start with a scene whose mixes and colors resolve before rendering. Add the spatial checker after verifying sharing and immutable derivation.
3. Compare scalar and PIE depth and color pixels on the board. Change a parameter repeatedly and record graph build time, parameter update time, frame time, and peak bytes separately. Capture a diagnostic for a full table and for an invalid typed graph.
4. If evaluating material nodes per hit dominates rendering, use the typed compiler to specialize a small named shading function for a material at scene installation. Benchmark the installation cost and run enough frames to measure amortization.

Archive examples B-01-hello-sphere.js, A-01-mix.js and A-06-own-fragment.js make good conceptual tests. Each uses facilities outside this first profile, including thin lenses, studio illumination, general scattering, procedural noise or method interception. Do not promise to execute these presets verbatim. The initial milestone demonstrates their composition patterns with the handheld's explicit lighting and numeric model.
