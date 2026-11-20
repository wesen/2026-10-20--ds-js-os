---
Title: How to tell whether a moving Snake reached the screen
Ticket: PICOCALC-SNAKE-INTEGRATION
Status: complete
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/system/compositor.js
      Note: Production semantic admission, incremental painting and display callbacks
    - Path: repo://ttmp/2026/11/20/PICOCALC-SNAKE-INTEGRATION--ship-semantic-snake-snapshots-and-changed-cell-painting-on-the-picocalc/scripts/replay/04-production-replay.mjs
      Note: Reproducible event, framebuffer, lifecycle and refusal assertions
    - Path: repo://ttmp/2026/11/20/PICOCALC-SNAKE-INTEGRATION--ship-semantic-snake-snapshots-and-changed-cell-painting-on-the-picocalc/scripts/replay/06-host-results.json
      Note: Bounded checked results and exact source hashes
ExternalSources: []
Summary: How production Snake snapshots preserved the pixels of 236 screens, and how to distinguish a drawing error from a missed display transfer.
LastUpdated: 2026-11-20T00:00:00Z
WhatFor: Explain the host correctness experiment and its evidentiary boundaries.
WhenToUse: Reviewing the changed-cell painter or reproducing presentation recovery.
---

# How to tell whether a moving Snake reached the screen

The head moves into the square that the tail is leaving. Every square that had a snake still has a snake. Yet 242 pixels must change color. An implementation that marks a square for repaint only when it becomes occupied or empty will leave the head in the wrong place.

That move occurs in the PicoCalc Snake test game. The earlier version of the game sent the compositor a complete drawing for each new position. The new version sends a complete description of the position and lets the compositor choose which squares need painting. On a host replay of the production application and compositor, all 236 screens matched the old version, pixel for pixel. To see what that establishes, we have to follow a position from game state to drawing commands, then from pixels to a simulated display.

## One move with no change in occupancy

The board is 22 columns by 18 rows. Number the squares from the upper left, starting at zero. The square at column 6 and row 9 has number `22 × 9 + 6 = 204`. Snake sends its body as a list of these numbers, head first. During the recorded loop the lists immediately before and after one timer tick are

```text
before     204   205   183   182
after      182   204   205   183
```

Square 204 changes from head to body. Square 182 changes from tail to head. Squares 205 and 183 keep their body color. The pitch of the board is 13 pixels in each direction. The compositor paints an 11-by-11 interior in each square and leaves the surrounding space alone. Two fills must therefore change exactly `2 × 11 × 11 = 242` pixels. For a move into empty space, the departing tail also turns white. That gives three fills and 363 changed pixels. Both predictions appear in the replay.

The complete snapshot includes the food square, score, historical best, alive flag, automatic-play flag, and format version. A separate string carries the keyboard hints. The historical best is worth preserving even when it is lower than the current score. The live header displays their maximum, so examining that line of text alone cannot recover both numbers.

The compositor remembers the position it last **painted**. Suppose positions 11, 12 and 13 arrive before the service gets to draw. Position 12 could describe the most recent incoming move, yet the buffer could still show position 10. The compositor compares the latest position with the one actually represented by the pixels. It uses a short drawing path only when the positions and the surrounding screen admit it.

```text
When two live frames have the same score, food, best, flags, title and hints,
and the surrounding screen is still valid, check each body element after the head.
If every next[i] equals previous[i - 1]:
    whiten the previous tail if it differs from the next head
    paint the previous head in body color
    paint the next head in accent color
Otherwise, reconstruct the screen from the latest complete position.
```

An accepted score fixes the length, since the snake starts with four segments and gains ten points per extra segment. The comparison reads a number of elements proportional to the body length even when it paints only two or three squares. The number of changed pixels alone cannot establish the CPU cost.

## Three images that can disagree

Claude Opus High developed the test design and a separate teaching note before seeing any results. Its worked example assigns a single color to the head and body. In that simpler game, moving from head-body-tail `[h, s1, s2]` to `[n, h, s1]` changes the new square `n` and the vacated square `s2`. Giving the head a distinct color introduces the third change at `h`. The note also asks what happens when a test uses the painter's own erroneous function to find the tail. Matching outputs can then reproduce the very same mistake. These two questions guided the checks below. [Original research design](../scripts/replay/05-opus-design.md) · [Opus teaching note](../scripts/replay/09-opus-theory.md)

The production system maintains two images in memory. The **back buffer** holds the pixels just painted. The **front buffer** holds pixels the display service should already have or is about to receive. The actual commit order matters. The C routine examines dirty 16-row bands, compares the images, joins nearby changes into rectangles and copies the selected bytes from back to front. Only then does the compositor ask the display to transfer the rectangles. The front buffer can advance even if that request subsequently fails.

Our host harness modeled the display with a third 320-by-320 array of RGB565 pixels. RGB565 uses two bytes per pixel, so each image contains 204,800 bytes. On a successful transfer, only rows and columns inside the requested rectangles are copied from front into the third array. After each ordinary draw, comparing the back buffer with this simulated panel checks that the proposed transfers suffice to reproduce the painting. Comparing the candidate back buffer with the old back buffer checks the painting itself. A square missing from a transfer can fail the first comparison even when the second succeeds.

## Replaying the game through both applications

I ran the two Snake applications independently with seed 5172 and the same 234 recorded input, focus and timer events. Each called its production initialization, dispatch and render entry points. I also supplied two deliberately constructed, connected bodies of lengths 300 and 395. The latter leaves just one of the 396 cells for food. Those fixtures belong to the 236-screen pixel corpus and are excluded from the 234-event traffic calculation.

Both compositors received the ordinary frame and draw messages. Both used the project's C fills, outlines, lines, fonts, text renderer, framebuffer comparison and invalidation. The baseline application, service, event stream, original frame hashes and original pixel hashes were read from Git revision `e339b6a`. The harness also verifies the shared C raster and font inputs against that revision. An assertion checks the new snapshot against the old game's state, including the historical best. Another checks that the baseline produced the same frame JSON as the archived run. The complete pixel arrays and the ordered lists of transfer rectangles then have to agree.

| Observation | Changed pixels | Candidate drawing calls | Full clear | Transfer rectangles |
|---|---:|---:|:---:|---:|
| Ordinary move down | 363 | 3 | No | 1 |
| Enter departing tail square | 242 | 2 | No | 1 |
| Timer while focus is elsewhere | 0 | 0 | No | 0 |
| Hit own body | 14,102 | 25 | Yes | 2 |
| Restart after collision | 14,690 | 20 | Yes | 4 |
| Constructed 395-segment position | 11,694 | 411 | Yes | 3 |

All 236 back buffers matched both the archived full-frame hashes and the freshly executed old renderer. The simulated panels and the old and new transfer rectangles also matched. The candidate painted 197 changed screens without a full clear, performed 27 full clears and suppressed publication on 12 unchanged observations. A full clear is a drawing command. The commit routine can still find a much smaller changed area afterward, as the collision row illustrates. [Host replay receipt](../scripts/replay/06-host-results.json)

The 234 recorded events led to 222 distinct consecutive frame publications. Their complete frame JSON, including hints and excluding the outer channel message, totaled 164,581 bytes in the old representation and 42,659 in the new. That saves 121,922 bytes, or 74.1%, on this recorded sequence. The identical rectangle lists mean the display received the same proposed regions in both runs, while the game and compositor exchanged substantially different amounts of JSON.

## When the previous drawing stops being a reliable starting point

A visual test that starts the compositor afresh on every frame will miss a damaged background. We kept services and buffers alive for 34 additional cases. They included skipping ten intermediate positions, accepting three replacements before one draw, opening an ordinary app, receiving Snake in the background, returning through the launcher, changing battery and clock displays, showing and expiring a notification, changing title or hints, and restarting after a crash. Fresh compositor instances also reconstructed five positions, including game over and the near-full board, from a single latest snapshot. Four more constructed lengths within these 34 cases exercised a score widening from 90 to 100 and body length crossing from 255 to 256.

The most informative failures were intentional. In one test the display answered that it had skipped the transfer. In another the request threw a timeout. In each case the simulated panel demonstrably differed from the intended image after the missed transfer. We delivered the *identical* snapshot again. On that next draw the compositor transferred one 320-by-320 rectangle and restored every pixel. No focus change, score change or new move helped it recover. This checks recovery once another draw occurs. Time until that draw, and what someone sees in the meantime, require separate observations.

Nineteen rejection checks exercised the normal decoded-message callback. They included wrong sender, missing frame, unknown type or version, false boolean encodings, a duplicate body square, food on the body, a score inconsistent with the length, and horizontally adjacent numbers that actually lie on opposite edges of different rows. Each refusal preserved the identity of the last accepted object, left the accepted-frame count unchanged, scheduled no draw and issued no transfer. A fresh valid frame afterwards still worked.

## Reading the result at the right boundary

The host test answers a concrete regression question. Given this input stream and these exceptional states, the production JavaScript recreated the previous pixels and supplied enough transfer data to reconstruct them in an independent memory buffer. Old and new share the same fonts and C primitives. An error in the shared font or RGB565 conversion could appear identically in both, including the archived hashes. A specification-derived renderer or a carefully chosen independent pixel sample would answer a different question.

The display model copies the requested bytes in memory. LCD byte order, bus timing, tearing, physical visibility and native-world speed need evidence from the handheld. The same distinction applies to validation. This experiment exercises malformed *decoded objects*. Parsing a truncated byte stream or handling duplicate keys happens before the callback under test. The article separates the Opus researcher's proposed methods from the operator's implementation and host observations. [Researcher provenance](../scripts/replay/10-opus-provenance.json) · [Investigation diary](../reference/03-replay-diary.md)

To reproduce from this checkout on Linux, use Node.js with its N-API headers in `/usr/include/node`, a C compiler named `cc`, and Git history containing `e339b6a`. The runner compiles its binding in a temporary directory, removes the build on exit, and writes its JSON receipt to standard output.

```sh
node ttmp/2026/11/20/PICOCALC-SNAKE-INTEGRATION--*/scripts/replay/04-production-replay.mjs
```
