---
Title: From a complete Snake position to changed framebuffer cells
Ticket: PICOCALC-SNAKE-INTEGRATION
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: The semantic Snake frame, admission algorithm, redraw rules, framebuffer ownership and reproduction procedures.
LastUpdated: 2026-11-20T13:31:13.490728404-05:00
WhatFor: ""
WhenToUse: ""
---

# From a complete Snake position to changed framebuffer cells

## The part that moves and the part that stays

Open Snake on the 320×320 PicoCalc. While the game is in focus, its timer attempts a move every 110 ms. The app chooses the direction, checks for collisions, places food, and updates the score. Separately, the compositor owns the framebuffer and the display driver transfers rectangles from it to the panel. The head, body, and food on the screen describe a game position the app has already calculated.

The previous screen callback converted that position into a tree containing two labels and a canvas of rectangle and text commands. Each timer update could cause the compositor to read another expanded tree and draw the entire display. The replacement publishes one complete position through the existing screen interface. The receiver knows which pixels correspond to each cell of this particular game. It can reconstruct the complete image at any time. It can also take a shorter path when two positions prove that only a few cells changed.

```text
Snake timer or keyboard event
   → game updates board positions
   → screen callback returns complete position and hints
   → kernel retains changed frame and delivers a frames message
   → compositor validates sender and position and schedules a draw
   → full composition or two/three changed cell interiors
   → framebuffer compares dirty bands and produces transfer rectangles
   → display acknowledges, skips, or reports a transfer error
```

## The message and its lifetime

The board has 22 columns and 18 rows. Cell 0 is the top left, cell 21 its rightmost neighbor on the top row, and cell 22 is the first cell on the second row. The arithmetic `cell = 22 * row + column` is invertible over the complete 396-cell board. The head appears first in the body list. The following is a position, after decoding the inner object from the ordinary JSON screen message.

```js
{ t: "snake", v: 1, body: [182, 181, 180, 179],
  food: 183, score: 0, best: 0, alive: true, auto: false }
```

The kernel supplies publisher identity. The outer frame also carries the title and hints. Each position contains everything needed to display it, including the score before death and the player's best score. The game does not send its BFS workspace, elapsed ticks or pending direction. None of those determines a pixel for an otherwise identical position. Suppressing identical frames therefore continues to work while Snake is paused in the background. The kernel's existing retained screen permits a compositor to render again after it starts. [Game producer](../../../../../../picocalc-os/js/apps/snake.js) · [Kernel publication](../../../../../../picocalc-os/nucleus/kernel.c)

At acceptance, a screen for Snake must come from the Snake publisher and carry the supported tag and version. The body and food must be disjoint and in range. The body must be contiguous without duplicates. Adjacent integer IDs on opposite sides of a row boundary are geometrically far apart, so a horizontal move also checks the row. Score determines length for this game, since growth adds one segment and ten points. The 395-segment cap allows a separate food cell, matching the playable producer domain. Ordinary app screens continue through the shared widget path.

The validator uses 13 ordinary 32-bit words. Word `cell >> 5` contains the bit `1 << (cell & 31)`. Clear the scratch, mark the food, and test and mark each segment once. This costs a fixed 13-word clear plus one check per segment. The implementation does not retain this scratch as a second model of the board. Invalid snapshots do not replace the compositor's accepted frame. A kernel replay still exposes the kernel's latest publication; validation in this change occurs at the recipient. [Admission and compositor](../../../../../../picocalc-os/js/system/compositor.js)

## Which previous image can the compositor trust?

Two positions matter. The latest admitted position is the one the compositor should display next. The last *painted* position is the one that explains the current pixels in its backbuffer. Several frames can arrive while only one draw is queued. A comparison with the last received position could skip a movement the user has never seen.

The receiver stores the previously painted Snake frame whenever it completes a full unobscured composition or a valid single move. A change of focus, a power update, a banner, display attachment, or another general composition request clears that reference immediately, including when a draw is already queued. The clock displayed in the last Snake composition also has to match. This matters when the minute changes between the draw request and the next periodic clock event.

```text
if previous paint was an unobscured Snake frame and both positions are alive:
    check title, hints, clock, food, score, best and autopilot
    for each segment i from 1 through new length - 1:
        require new.body[i] equals old.body[i - 1]
    if all checks pass:
        erase the old tail unless the new head occupies it
        paint the old head in the ordinary body color
        paint the new head in the accent color
        remember the frame just painted
        commit the resulting framebuffer
otherwise:
    paint the complete screen, including status, header, board, banners and hints
    commit the resulting framebuffer
```

Equal validated scores imply equal lengths. To see why the loop is sufficient, consider old body `[182,181,180,179]` and new body `[204,182,181,180]` with food elsewhere. The cells 181 and 180 keep their ordinary body color. Cell 179 becomes empty, 182 changes from head to body, and 204 becomes the head. The code issues three 11×11 fills. If the new head enters the old tail cell, both the old and new frames have marks there, but the color changes. Only two fills are needed in that case. Growth, death, reset and a coalesced sequence that fails the shift test all invoke the complete painter. The algorithm reads O(length) cells and makes at most three fill calls on its fast path. It never traverses the entire board to find damage.

## Pixel ownership and failed transfers

The full painter uses the original score row layout, font metrics, canvas center, colors and border. It draws the body, then food, then any game-over overlay. The normal compositor still puts its notification banner above app content and draws hints. These later layers are the reason an ordinary game move cannot unconditionally draw into a screen with a visible banner.

A successful framebuffer commit can precede a failed physical transfer. The compositor has an accurate backbuffer even if the panel did not receive those pixels. The graphics layer keeps a separate comparison copy and dirty bands of 16 rows. On a skipped flush or timeout the existing handler calls `invalidate()` so that a later commit transfers the complete reconstructed image. The quantity “363 changed pixels” refers to output pixel differences on an ordinary move. The transfer engine may send more pixels because a rectangle covering two differences can include the unchanged space between them. [Framebuffer implementation](../../../../../../picocalc-os/nucleus/gfx.c) · [Display service](../../../../../../picocalc-os/js/drivers/display.js)

## How to reproduce and extend the qualification

- Run the native SDK fixture using [the CJI emulator checker](../scripts/01-native-fixture.py). It compares game positions decoded from the old output and checks hints and event calls.
- Run [the simulator comparison](../scripts/02-simulate-game.py) with a temporary output directory and a built picocalc-host. It exercises five complete 320×320 panel captures in both builds. The snapshots and source selection use the same virtual input schedule.
- Run the [independent host replay](../scripts/replay/04-production-replay.mjs) and review its archived evidence. The examiner uses the actual game callbacks, compositor callbacks and production RGB565 raster code with frozen input and reference pixels.
- For device work, the [board qualification runner](../scripts/device/01-normal-snake.py) drives real gameplay through the normal native applications. Its companion report defines the timing units and distinguishes callback work, draw work, and presentation. Use the prior release to reproduce historical renderer scripts that read live application source paths.

The native game and native compositor compile separately. Passing the JavaScript test runtime does not establish that the CJI compiler accepts every method in the program. Compile both ordinary world units and replay the resulting device image before promoting later changes.
