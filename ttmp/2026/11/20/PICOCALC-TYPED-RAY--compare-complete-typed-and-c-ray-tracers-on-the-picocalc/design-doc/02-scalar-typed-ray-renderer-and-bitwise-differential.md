---
Title: Scalar Typed ray renderer and bitwise differential
Ticket: PICOCALC-TYPED-RAY
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://firmware/nucleus/raytrace_demo.c
      Note: Reference geometry and RGB565 rendering semantics
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Scalar Typed ray renderer and bitwise differential

Port the maintained 160 by 160 orthographic ray scene to ordinary Typed source and compile it with the existing Wasm and RV32 targets. The source defines intersection and nearest-depth selection, sphere lighting, floor shading and shadows, and numeric conversion to RGB565. The frozen view fills all misses with the checker plane. The sphere and lamp controls move within the existing scene bounds. Match the production C renderer exactly before evaluating a compiler variant.

## Calls and storage

All frame outputs use Typed buffers with a four-byte capacity followed by 16-bit cells. Pixel cells store RGB565, depth cells use zero for a miss, and nearest IDs use zero for the plane and 1 through 3 for sphere order. The caller gives distinct output buffers and one reusable work buffer of at least 2,048 cells. Work cell 0 supplies stride. Zero chooses 160, while 160 through 320 selects explicit stride and preserves the row padding. Each affected output needs `159 * stride + 160` cells. Validate all buffer capacities, stride, and scene options before writing active pixels or changing scratch.

- `typedRayFrame(pixels,work,sphereX,sphereY,lightX,lightY)` is the image-only renderer with no audit stores.
- `typedRayRender(pixels,depths,ids,work,sphereX,sphereY,lightX,lightY)` shares geometry and shade routines and additionally emits audit planes.
- `typedRayTrace(depths,ids,work,sphereX,sphereY)` writes the primary results without lighting.
- `typedRayShade(pixels,depths,ids,work,sphereX,sphereY,lightX,lightY)` applies the same shader to precomputed planes.

All four return one on success and zero on invalid inputs. The shade-only entry receives depths and IDs already emitted by Typed Trace or its C control for the given sphere configuration. An inconsistent trace plane may cause an early return after preceding pixels have been drawn. The three output regions are distinct. The audited path accepts eight native word arguments, which is the existing backend's limit.

## Arithmetic order

Use the same integer order as C. The row discriminant is `radius² − dy² − dx²`. A tangent with discriminant zero is a hit. The front depth is `center_z − floor(sqrt(discriminant))`, with an earlier sphere winning a tie. Preserve division toward zero for signed lamp coordinates, and the same bounded projection for floor shadows. Replace the nonnegative color bit shifts with divisions and multiplication of the RGB565 channel values. For the checker, adding quotient parity has the same low bit as XOR.

Keep the prepared geometry and lighting in fixed work cells. Cell 0 is configuration, and cells 1–15 record three groups of x, y, z, radius and material. Cell 16 holds the count. Cells 17–20 store biased lamp horizontal components, its squared norm, and floor of its norm. Cells 21–32 store projected shadow centers plus 4,096 and the two reach radii. Cells 40–519 hold three horizontal square arrays, cells 520–1544 the integer square roots, and cells 1545–1864 the current row's depth and ID planes. Other cells remain unused.

The shared helpers `typedRayBuildTables`, `typedRayComputeRow`, `typedRaySphereScale`, `typedRayInShadow`, and `typedRayPack` expose the precise intermediate contracts to the programmable-material experiment. Shader options alter the shading inputs, with the fixed-sphere layout kept as the first control.

## Qualification before performance

Run an exact complete-buffer comparison against the existing C geometry and lighting. Cover the default, independent lamp moves, extreme sphere and lamp positions, a centered lamp and a padded stride. Compare the clean and audited paths as well as separate trace and shade paths. Test invalid capacities and ranges without writes. Keep target timings separate for clean frame, audited frame, primary-only and shade-only calls. Both measured arms in each comparison must write the outputs named by that boundary. The first design requires actual pixels and leaves developer-side profiling instrumentation outside the normal frame entry.
