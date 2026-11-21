---
Title: Shared scene graph contract and acceptance fixtures
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
LastUpdated: 2026-11-20T23:38:16.658099696-05:00
WhatFor: ""
WhenToUse: ""
---

# Shared scene graph contract and acceptance fixtures

The validated scene consumes a little-endian array of unsigned 16-bit cells using the existing Typed buffer ABI. The header occupies 8 cells: magic 0x4341, version 1, expression count, material count, sphere count, parameter count, floor material handle, reserved zero. All handles are zero based in separate tables. Tables start at fixed cell offsets: nodes at 8 (64 entries of four cells), materials at 264 (16 entries of one color-expression handle), spheres at 280 (three entries of five cells: x,y,z,radius,material), parameters at 295 (eight Q8 unsigned weights). Total capacity required 303 cells. Populate fresh storage before publishing. Reject out-of-range counts, malformed operands, type errors, forward or cyclic references, unknown operators, bad material and parameter handles, or undersized buffers before drawing or replacing the previous scene. Builders check capacity before writes. Coordinates are source-image pixels, x right, y down, in the existing ray tracer's camera/depth convention. Match the existing geometry envelope and shading; sphere positions/radii in the fixtures match the existing scene.

Node layouts are (opcode,a,b,c). 1 COLOR packs RGB888 as a=red, b=green, c=blue. 2 PARAM reads scalar parameter slot a (0..256 inclusive). 3 MIX takes color handles a,b and scalar handle c and blends each channel with integer truncation after division by 256. 4 CHECKER takes color handles a,b and immediate cell size c>0; parity is floor(x/c)+floor(y/c) mod 2. 5 POSITION is the pixel-space vec2 at a hit, 6 SCALE multiplies a vec2 handle a by scalar handle b with Q8 semantics, 7 FRACT returns the fractional part of a vec2 in Q8, 8 TILEMASK converts a vec2's fractional coordinates to a scalar (256 if both components >=32, else zero). Use signed wide intermediates where needed. Constants and per-hit boolean expressions may extend the vocabulary by agreement. A material is a diffuse color expression; deriving it creates a fresh material. The normal ray tracer remains the geometry and light kernel. Typed owns material computation; benchmark scalar per-pixel and bulk per-scanline execution where feasible.

Shared-material fixture: two visible spheres initially reference one blue material COLOR(30,70,150). Derive material MIX(blue,COLOR(220,170,40),PARAM(0)) for only the right sphere. Compare at 0,128,256. Floor CHECKER uses distinct color nodes at cell size 12. Tile fixture: construct position → scale by captured parameter → fract → tileMask → mix colors; use the same graph after a parameter edit. Compare values including boundaries and verify identical semantics on both targets regardless of node numbering. Keep fixture-specific initial/final parameters and chosen sample coordinates in the receipt so others can replay them.
