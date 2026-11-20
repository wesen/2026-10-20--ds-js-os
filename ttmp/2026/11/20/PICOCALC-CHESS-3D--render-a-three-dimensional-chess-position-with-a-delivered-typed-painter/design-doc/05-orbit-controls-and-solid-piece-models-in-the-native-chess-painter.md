---
Title: Orbit controls and solid piece models in the native Chess painter
Ticket: PICOCALC-CHESS-3D
Status: active
Topics:
    - picocalc
    - compiler
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T16:39:43.600383978-05:00
WhatFor: ""
WhenToUse: ""
---

# Orbit controls and solid piece models in the native Chess painter

The board stores a piece on one of 64 squares. A camera turn changes where the renderer projects that square on the screen. The game must continue to find the same piece at the same algebraic address, and the player should be able to move the cursor toward the same screen edge after the turn. The implementation puts the orientation in the compositor, which owns both the keyboard routing and the drawing surface. Chess continues to publish complete PSIX positions.

## Follow one key from the keyboard to a pixel

Press F4 while Chess has focus and the service has admitted a rotatable painter. The native keyboard world sends the compositor a down event. The compositor increments its quarter-turn counter, wraps it modulo four, and schedules a draw. F3 takes one step in the opposite direction. Key release is ignored. Non-Chess views receive their usual events. The trusted service advertises the camera through its authenticated `painter.ready` message. Selecting a flat painter produces the standard key routing. The compositor stores the current orientation across subsequent frames and focus changes. A compositor restart starts a new view at its default orientation.

```text
keyboard ── F4 ──> compositor.chessYaw ──> fb.paintView(yaw)
                          │                       │
                          │                       ├─ retained 90-cell position
                          │                       ├─ append receiver-owned yaw
Chess rules <── arrow translated into board axes  └─ run installed paintChess
                                                       │
Chess position ── complete PSIX ──> service            ▼
                                             validated triangle list
                                                       │
                                                framebuffer → panel
```

The API boundary has two useful properties. First, the sender never needs to resend the static painter source for a camera change. Second, a selected square and its legal destination masks can be used at every orientation. A source frame cannot smuggle its own direction into the keyboard router. The receiver decodes the 90 PSIX cells first. The renderer's native input adds a 91st unsigned 16-bit cell, at offset 184 from the start of the Typed buffer. The unsigned capacity occupies bytes 0–3 and cell zero starts at byte four. A public caller still supplies two Typed buffers to `paintChess(state,out)`.

## Derive the screen and keyboard transforms together

Let `u,v` name a column and row of the board in the view before isometric projection. Dense rank zero is the eighth rank. The following table maps view axes to the actual piece array. For example, after one clockwise camera step, increasing the view column by one decreases the game rank by one. The compositor therefore sends an Up key to the Chess world when the player presses Right in this view.

| Quarter-turns | Game file | Game rank | Right arrow sent to Chess |
|---:|---|---|---|
| 0 | u | v | Right |
| 1 | v | 7 − u | Up |
| 2 | 7 − u | 7 − v | Left |
| 3 | 7 − v | u | Down |

Iterating cells in view order keeps the far squares ahead of the near squares in the drawing stream. After the lookup, use the game square for checkerboard parity, the cursor, selection, move markers, piece identity and the legal mask bit. An asymmetric piece such as a knight provides an additional visual test of model orientation.

## Validating a candidate before showing it

The live service keeps the most recently validated display list. A candidate is written into a separate command buffer while the old one remains available. The camera compares the requested yaw with the orientation already used to generate that list. An ordinary clock or battery redraw can replay the same commands. A camera change reruns the native painter with the retained game state and validates the new list. The request itself is already inside a compositor draw, so successful replacement consumes the previous notification state without queuing a duplicate draw.

```text
if requested orientation differs:
    remember previous orientation
    assign new orientation in retained input
    emit commands into scratch
    if validation fails: restore previous orientation and report failure
    on success: swap the validated list into the current slot
rasterize the current list into the framebuffer
```

A triangle carries three pairs of body-relative coordinates and one RGB565 color. Validate all seven operands after the opcode. The renderer owns the 320 × 280 body beginning at screen row 22. The normal compositor draws the app title, battery, clock and hint strip. Both the command-count and word-count checks apply before the framebuffer changes. A sufficiently detailed model can exceed the old flat painter's limits even when the wire message describing its position stays the same size.

## Reproduce a game several turns deep

1. Run `node scripts/camera/01-match.mjs MATCH_DIR` from this ticket, using an absolute path for the output if the next commands run elsewhere. It boots the ordinary Typed Chess rules and search with the semantic observer. White plays e2–e4, Ng1–f3, Bf1–c4 and castles kingside. The engine chooses a reply after each complete sequence of timer callbacks. Inspect `match.json` for both moves, the actual 64 squares, masks, numeric fields, routed keys and camera orientation at every capture.
2. Run `node scripts/camera/02-paint.mjs MATCH_DIR`, followed by `python3 -B scripts/camera/02-reference.py MATCH_DIR`. These generate reference pixels from the same maintained painter compiled to Wasm. The independent host raster tests pixel-center coverage against directed triangle edges. It includes the full system hint strip.
3. Build the camera firmware with `scripts/camera/03-build.sh PRIVATE_TREE LOCK ordinary`. The ordinary image uses the physical keyboard and display buses. Use `observe` for a private image with the completed-SPI observer and keyboard-register substitution. A peripheral failure can then be reported separately from errors in Chess rules, key routing or rasterization.
4. The device driver in `scripts/camera/04-device.py` replays the key transcript, compares the panel CRC with the expected image, obtains the actual PicoCalc framebuffer over UART and checks every game and hint pixel. A single clock change in the system header should not change this comparison. After all cases pass, it verifies the selected ordinary firmware by flash readback and boots its eight native worlds. Failed qualifications restore the saved release.
5. Use `scripts/camera/05-gallery.py MATCH_DIR ACTUAL_SHOTS GALLERY` to make two looping GIFs. The game advances one pair of moves per frame. The camera sequence holds the final position fixed and shows four orientations. The screenshot region retains native resolution and an external caption identifies each frame. The playback interval is editorial and supplies no device frame-rate measurement.

The tests specifically cover an inverse key, four quarter-turns with identical output on return, a retained selection and legal mask, and a screen-relative arrow after rotation. When reviewing an image, inspect both knights, the crowned pieces, and the square the castled king occupies. A symmetric opening alone gives poor coverage of the transformation.

## Source and API reference

- `picocalc-os/js/system/compositor.js` owns focus, key authentication and view orientation. `cji/src/world-native.js` maps the framebuffer's `paintView(yaw)` method to the C syscall.
- `picocalc-os/port/esp32p4/main/painter_service.c` owns the installed program, the last decoded PSIX state, and the pair of display lists. `mobile_painter_p4.c` constructs the counted two-buffer ABI.
- `picocalc-os/worlds/chess/painter-3d.typed` is the source delivered by the app. `mobile-view.typed` publishes the normal Chess position after an event. The build records the identical source as its admission reference.
- `picocalc-os/nucleus/painter_commands.c` validates the stream. `painter_triangle.h` implements the shared-edge raster convention. `picocalc-os/tests/compositor-auth.test.mjs` exercises the actual key and admission callbacks.
