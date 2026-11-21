---
Title: A complete ray tracer in Typed
Ticket: PICOCALC-TYPED-RAY
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/worlds/raytrace/raytrace.typed
      Note: Matches the complete published scene in ordinary Typed
    - Path: repo://ttmp/2026/11/20/PICOCALC-TYPED-RAY--compare-complete-typed-and-c-ray-tracers-on-the-picocalc/various/renderer/host.json
      Note: Records all frame and audit identities, padding and explicit landmarks
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# A complete ray tracer in Typed

The maintained PicoCalc ray tracer has three spheres, a checker plane and a movable directional lamp. The Typed implementation now computes the entire image, including the winning sphere, its depth, its light level and the pixel's RGB565 value. That gives the compiler a single frame function with ordinary checked buffers and integer arithmetic. On 12 host scenes, the compiled Typed Wasm matched the production C reference in every color, depth and ID cell. Two scenes had 165-cell rows and one had 320-cell rows, with every padding cell preserved. [Host receipt](../various/renderer/host.json)

## Follow one ray from the camera to a pixel

An orthographic camera sends parallel rays along positive z. In this scene, pixel `(x,y)` starts at `(x,y,0)`. For a sphere centered at `(cx,cy,cz)`, first subtract `cx` and `cy` from the pixel coordinates. Those differences, `dx` and `dy`, stay fixed throughout the ray. The sphere equation gives the squared distance along z from the sphere center to either intersection.

```text
d = radius² − dy² − dx²
z = cz − floor(sqrt(d))    when d >= 0
```

The sign of `d` gives the hit decision. Zero denotes a tangent and is included. A positive value yields two depths, and the minus sign picks the front surface. A smaller positive depth wins. The renderer visits spheres in their declared order and replaces a winner only on a strictly smaller depth, so equal depths keep the first sphere. Its audit planes write zero for a miss and IDs 1 through 3 for the selected sphere.

In the default scene, the movable sphere is centered at `(68,61,56)` with a radius of 26. At the center pixel, `d` is 676, so the front depth is 30. Along the same row at x = 42, the primary ray is tangent and records depth 56. At x = 41 the ray misses and records depth and ID zero. The tests capture all three values directly. [Host landmarks](../various/renderer/host.json)

## Prepare small tables and share the row computation

The Typed implementation does not allocate a new buffer per frame. The caller supplies one scratch buffer of 2,048 halfwords. It contains the sphere parameters, the current lamp, precomputed horizontal squares for each sphere, a square-root table that covers `0..1024`, and one row of nearest depth and ID. Cell zero supplies output stride and stays unchanged.

Two expensive-looking operations collapse to indexed reads after setup. The difference `x−cx` depends on the sphere and horizontal pixel only, so the horizontal square table is reused for each row. The square-root table is prepared by walking successive squares. Once an index reaches the next square, the integer root increments by one. Both tables are rebuilt when the frame refreshes and live only in the caller-supplied scratch buffer.

The core row loop, abbreviated here, compares a new candidate with the result already written to scratch.

```typescript
const d = rowTerm - work.charCodeAt(horizontal + x);
if (d >= 0) {
    const depth = cz - work.charCodeAt(520 + d);
    const previous = work.charCodeAt(1545 + x);
    if (previous === 0 || depth < previous) {
        work.setCharCodeAt(1545 + x, depth);
        work.setCharCodeAt(1705 + x, sphere + 1);
    }
}
```

That strict comparison matters independently of the output color. A small synthetic check puts two identical objects in scratch and confirms the first object's ID wins at the same depth. The ordinary fixtures also include an overlap where the movable sphere completely hides the gold sphere. Those checks make nearest-ID errors visible even when two objects could have produced similar colors.

## Apply the same light and shadows as the C implementation

The sphere shader uses an integer surface normal proportional to `(dx,dy,-height)`. It dots that vector with a directional light whose z component is −32. The horizontal components come from the lamp's screen control. At the default control `(31,25)`, the components are −14 and −16 because integer division truncates toward zero. The stored integer lamp norm is the floor of the vector length. The original C scale uses base level 62 and caps diffuse contribution at 183, so the Typed shader follows the same clamps and integer rounding.

At the center pixel of the movable sphere, the normal height is 26. Its light dot product is `32*26 = 832`. The integer lamp length is 38 and the divisor is `26*38 = 988`. The diffuse contribution truncates to 154 and the resulting scale is 216. Applying it to the sphere's RGB888 color gives `(207,70,56)`. RGB565 keeps five, six and five bits of the channels, producing the measured `0xca27`.

A ray that misses all three spheres shows the checker plane. The floor starts beyond the spheres. An oblique test from that point toward the lamp first rejects spheres whose projected bounds exclude the point, then tests the signed dot product and quadratic discriminant to decide whether the floor pixel is in shadow. The fixed camera shows the plane across the whole background. Its shadow cases are part of the complete color comparison.

## Test the outputs at matched boundaries

The clean entry point writes RGB565 only. The audited entry also writes two additional planes. A primary-only call fills the audit planes without shade work. A shade-only call consumes those planes using the same sphere and light rules. The production C test exposes those same four boundaries. This makes it possible to compare ordinary draw latency separately from diagnostic writes, or to examine primary and shading costs without estimating either from the total.

| Host case | Width / stride | Image checksum | Sphere pixels | Shadow pixels |
|---|---:|---|---:|---:|
| Default | 160 / 160 | `2f75a8a5` | 6,123 | 4,793 |
| Lamp-only move | 160 / 160 | `97296759` | 6,123 | 3,923 |
| Bottom-left sphere, corner lamp | 160 / 165 | `8f52db52` | 6,537 | 1,976 |
| Top lamp with wide stride | 160 / 320 | `3b0e6bef` | 5,738 | 3,027 |

Every row compared the bytes of the compiled Wasm result to the actual C renderer. The host runner also verifies the clean output leaves both audit areas untouched, and shade-only preserves its two input planes. Ten invalid calls return zero and leave memory unchanged. Moving only the lamp changes the image and shadow count while preserving the whole depth and ID planes. It is a useful transformation test because it states an expected relation that does not depend on copying a magic image checksum.

The standalone Wasm compiler emits one fixed memory page. For this host test only, the runner changes the memory section's initial and maximum page counts from one to eight. Three full audit buffers already need more than the original page. All instructions and the Typed source remain untouched, and the receipt records both module hashes. The firmware RV32 module uses caller-provided buffers and takes no part in this host-memory adjustment. [Reproduction contract](../design-doc/02-scalar-typed-ray-renderer-and-bitwise-differential.md)

## Specify the target before choosing an oracle

The independent Claude Opus High memo recommended fixing integer rounding, tie handling and every observable plane before interpreting a mismatch. That methodology informed the differential and the tangent and light-only cases. Its illustrative camera uses a different lighting model, including an exactly normalized integer lamp, a black background and sphere-to-sphere shadowing. The actual PicoCalc target has a floored lamp norm, the existing checker plane, and shadows on the plane. Using those concrete C rules is what makes bitwise comparison meaningful. The external model received a public methodology question. The source and all measurements were validated locally. [Independent public memo](../various/commission/scalar.md) · [Host qualification receipt](../various/renderer/host.json)
