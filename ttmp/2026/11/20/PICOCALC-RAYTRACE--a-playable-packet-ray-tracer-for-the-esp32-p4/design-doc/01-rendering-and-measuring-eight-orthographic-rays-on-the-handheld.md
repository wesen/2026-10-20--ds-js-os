---
Title: Rendering and measuring eight orthographic rays on the handheld
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
LastUpdated: 2026-11-20T23:19:05.488144894-05:00
WhatFor: ""
WhenToUse: ""
---

# Rendering and measuring eight orthographic rays on the handheld

An orthographic camera gives each pixel a different ray origin and the same direction. Rotate the scene into camera coordinates and choose the z axis along that direction. For a sphere with center (cx, cy, cz) and radius r, subtract its center from the pixel coordinates. The discriminant is r² − (x − cx)² − (y − cy)². A negative result is a miss. Zero denotes tangency. A positive result gives two depths separated from cz by the square root of the discriminant. Select the nearest visible surface before shading. The checkerboard supplies a visible ground plane. Its change of color under a moving shadow makes light position observable even when the camera stays still.

## Division of work

The scalar reference and packed implementation must share projection, depth tie-breaking, shading and RGB565 packing. Start by packing the intersection arithmetic. Eight consecutive x coordinates have consecutive differences from the same sphere center and share a row coordinate. The surviving lanes can use scalar depth and shading. An aligned temporary for intermediate results lets the renderer accept ordinary framebuffer storage. Validate the numerical range for any narrowing operation against the full allowed range of camera and scene controls.

    for each scanline:
        for each consecutive group of eight pixels:
            find candidate hits against each sphere
            for each surviving ray:
                determine the visible depth and material
            resolve lighting and visibility of the light
            store eight RGB565 pixels

A 160 by 160 RGB565 output occupies 51,200 bytes. A doubled display can fill the handheld screen without increasing the number of rays. Scene changes should be deterministic so the original and packed paths can render exactly the same sequence. Reserve one serial owner for build installation, button injection, timing and final health checks.

## Experimental contract

Compare every pixel for each selected scene before interpreting performance. Include a centered sphere, a sphere at the minimum legal center position and a moved light. Report setup, elapsed intersection time and whole-frame time with clear timer boundaries. A measurement of an isolated arithmetic loop has a different denominator from a complete frame. Count surviving lanes per test and total lane tests. Quantify the effect of instrumentation if counter collection enters the timed path. Alternate candidate order on the same P4. Archive compact results and capture the actual displayed scene. A slower packed result still answers the research question.

## Implemented interfaces

The renderer header is picocalc-os/nucleus/raytrace_demo.h. raytrace_demo_render accepts a 16-bit output array, row stride in pixels, scene parameters, scalar or PIE mode, and an optional statistics pointer. raytrace_demo_intersections accepts signed 16-bit output and the same scene, mode and statistics arguments. It writes the nearest depth at each pixel, with zero for a miss. raytrace_demo_has_pie reports whether this build supplies the real hardware function. The host scalar preview exercises the public entry point directly. picocalc-os/nucleus/raytrace_demo_pie.S contains the target row routine.

The movable sphere center has legal coordinates 32 through 127, inclusive. Its radius is 26, leaving a margin even at the endpoints. Light controls span 0 through 159. The renderer caches horizontal squared distances. A row then needs a broadcast of the row term and a packed signed subtraction of eight squared distances followed by a store. Both the square-root lookup and per-pixel depth choice still contribute to the intersection timing. The complete color frame also includes directional lighting and ground shadow tests. Statistics count primary hits before occlusion separately from visible sphere pixels.

Use F1 and then V to open the app from the launcher. Arrow keys move the sphere. WASD changes the light, and R restores the initial scene. The view occupies 240 by 240 display pixels from a 160 by 160 source.
