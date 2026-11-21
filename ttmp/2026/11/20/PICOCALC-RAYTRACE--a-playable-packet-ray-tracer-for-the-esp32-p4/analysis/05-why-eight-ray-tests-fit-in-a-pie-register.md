---
Title: Why eight ray tests fit in a PIE register
Ticket: PICOCALC-RAYTRACE
Status: active
Topics:
    - picocalc
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/raytrace_demo.c
      Note: Shared intersection, depth, lighting and shadow contracts
    - Path: repo://picocalc-os/nucleus/raytrace_demo_pie.S
      Note: Actual packed instruction sequence and ABI
    - Path: repo://ttmp/2026/11/20/PICOCALC-RAYTRACE--a-playable-packet-ray-tracer-for-the-esp32-p4/scripts/renderer/03-qualify.sh
      Note: Rebuilds strict host checks and the linked PIE instruction model
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Why eight ray tests fit in a PIE register

The PicoCalc ray tracer casts 25,600 primary rays per frame, one for each pixel of a 160 by 160 image. Each ray tests three spheres. One renderer computes the intersection candidates with ordinary scalar instructions. The ESP32-P4 renderer calculates eight candidates for one sphere at once with its Processor Instruction Extension, or PIE. Both paths resolve depth and shade the same surfaces. Across 12 host control scenes they produced identical complete depth and RGB565 buffers. The default scene casts 4,793 visible checkerboard shadow pixels, so the comparison includes the effect of lighting as well as the silhouettes. [Host renderer receipt](../various/renderer/host-model.json)

## Start with a ray and a sphere

An orthographic camera gives each pixel its own origin and gives every primary ray the same direction. Here the ray for pixel `(x, y)` starts at `(x, y, 0)` and proceeds along positive z. A sphere has center `(cx, cy, cz)` and radius `r`. Substituting the ray into the sphere equation gives

```text
(x − cx)² + (y − cy)² + (z − cz)² = r²
(z − cz)² = r² − (y − cy)² − (x − cx)²
```

Call the right side `d`. It is the reduced discriminant for this ray. When `d` is negative, no real z satisfies the equation. Zero is a tangent, which counts as a hit. A positive value gives a front and back surface at `cz − sqrt(d)` and `cz + sqrt(d)`. The renderer uses floor of the square root so both paths choose the same integer depth. All sphere fronts are in front of the camera. A smaller positive depth wins, and a stored depth of zero denotes the checkerboard plane.

The piece of the calculation that changes with x is the squared horizontal distance. The renderer prepares a 160-element array of those squares for each sphere. For any one row the vertical distance stays fixed, so the scalar expression needs only one row constant and one subtraction per pixel.

```c
const int16_t row_term = radius * radius - dy * dy;
for (int x = 0; x < 160; ++x)
    discriminants[x] = row_term - x_squared[x];
```

The actual renderer does this for each sphere, then tests each candidate and updates the nearest depth. It currently tests every sphere against every primary ray. This keeps the candidate count the same when the sphere moves or the lamp changes. [Renderer implementation](../../../../../../picocalc-os/nucleus/raytrace_demo.c)

## Prove the lane width before packing

An ESP32-P4 PIE vector register holds 128 bits. In this kernel we interpret it as eight signed 16-bit lanes. Signed lanes matter because the next stage must distinguish misses from zero and positive discriminants. [Espressif ESP32-P4 Technical Reference Manual](https://documentation.espressif.com/esp32-p4_technical_reference_manual_en.pdf)

A sphere center can move between 32 and 127 on either axis. The other two centers stay inside the same range. Pixels range from 0 to 159, so the magnitude of a horizontal or vertical difference is at most 127. Each squared term is at most 16,129. The most conservative lower bound on their subtracted sum is −32,258, and the upper bound on the discriminant is the largest radius squared, 1,024. The signed 16-bit range contains both bounds. The PIE subtraction saturates at the ends of that range. Saturation cannot change an admitted scene's arithmetic.

Take the movable sphere at its default center `(68, 61, 56)`, with radius 26. In row `y = 61`, the packet starting at `x = 88` has these exact values.

| Lane x | 88 | 89 | 90 | 91 | 92 | 93 | 94 | 95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Squared horizontal distance | 400 | 441 | 484 | 529 | 576 | 625 | 676 | 729 |
| Discriminant | 276 | 235 | 192 | 147 | 100 | 51 | 0 | −53 |

The seven nonnegative values enter the shared depth test. The negative value at x = 95 rules out this sphere, while a different sphere can still hit that pixel. At x = 94 the tangent has depth 56 because the integer square root of zero is zero. This is why the lane sign and the inclusion of zero are part of the equivalence contract.

## The four PIE operations in the row kernel

The C renderer passes a pointer to the horizontal squared terms in `a0`, the address of the signed row constant in `a1`, a scratch output pointer in `a2`, and a positive count of eight-lane groups in `a3`. The assembly begins by broadcasting the row constant. The loop loads eight consecutive squared terms, subtracts them from the broadcast value, and stores the resulting signed discriminants.

```asm
    esp.vldbc.16.ip q0, a1, 0
loop:
    esp.vld.128.ip  q1, a0, 16
    esp.vsub.s16    q2, q0, q1
    esp.vst.128.ip  q2, a2, 16
    addi a3, a3, -1
    bnez a3, loop
    ret
```

The increment of 16 is bytes, the size of eight halfwords. Each row has exactly 20 complete groups. The full vector loads and stores use explicitly 16-byte-aligned private arrays. The broadcast uses a halfword-aligned scalar. The public color and depth buffers need ordinary halfword alignment, even when their row spacing differs from 160. The packed assembly touches only `q0` through `q2`. Those registers are covered by the project's installed FreeRTOS PIE state-save path. [PIE instruction introduction](https://developer.espressif.com/blog/2024/12/pie-introduction/)

## Resolve depth, light and shadows with shared code

For each nonnegative discriminant the C code looks up its integer square root in a small table computed once per render. It subtracts that height from `cz` and keeps the nearest sphere at each pixel. Shading uses the winning sphere's front-surface normal and the direction toward the lamp. The common C code converts the final channels into an RGB565 word with five red bits, six green bits and five blue bits.

A pixel that misses the spheres shows the checker plane. To decide whether to darken it, the renderer sends an oblique ray from the plane toward the lamp. Let `v` be the vector from that plane point to a sphere center and `L` the lamp direction. A sphere in front of the shadow ray satisfies both `v·L > 0` and `(v·L)² >= (v·v − r²)(L·L)`. The checker plane lies beyond all spheres, so it starts outside them. The engine first excludes points outside a conservative projected rectangle and then evaluates that expression. Moving the lamp changes the ray direction and the shadow projection while the primary rays and depths stay the same.

The intersections-only API runs exactly the same row and nearest-depth code and stores a depth plane. It skips shadows, lighting and RGB565 output. This gives an operator two distinct timing boundaries, complete image generation and primary intersections. For the default scene, 6,983 of the 76,800 sphere-candidate lanes are active because their discriminant is nonnegative. That is 9.09% active intersection candidates. All lanes are issued across 9,600 groups in a PIE frame. There are 6,123 winning sphere pixels because some candidate hits overlap. These three counts answer different questions.

## Check both the frame and the emitted instructions

The full renderer test ran the default scene, moved lamp positions, overlapping spheres, and legal extreme sphere and lamp coordinates. It compared complete padded RGB565 and depth buffers, with deliberately non-vector-aligned destinations and untouched padding. An independent unpruned double-precision intersection calculation checked every nearest depth and the hit and shadow totals. Moving only the lamp in one control preserved depth checksum `ee9a0b05`, changed color checksum from `2f75a8a5` to `97296759`, and moved the visible shadow count from 4,793 to 3,923. The full-frame packed arm in this host run used a C model of the PIE lane subtraction. [Scalar receipt](../various/renderer/host-scalar.json) · [Packed model receipt](../various/renderer/host-model.json)

The instruction test assembled the production row function with Espressif's toolchain, decoded the linked machine words, and ran those exact bytes through the previously reviewed RV32 and PIE model. Across 754 row cases it observed 14,890 vector stores and compared every byte to the expected result and canaries. The observed discriminants ranged from −31,729 through 1,024. This checks the instruction choice, addressing, signedness, group loop and preservation of surrounding memory. The physical PicoCalc benchmark provides the separate evidence for the installed target and elapsed speed. [Linked PIE model receipt](../various/renderer/pie-model.json) · [Physical article](04-measuring-a-packet-of-eight-rays-on-a-playable-esp32-p4.md)
