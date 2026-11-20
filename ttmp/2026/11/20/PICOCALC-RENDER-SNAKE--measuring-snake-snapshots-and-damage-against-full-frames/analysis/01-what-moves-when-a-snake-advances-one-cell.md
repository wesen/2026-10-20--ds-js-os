---
Title: What moves when a Snake advances one cell
Ticket: PICOCALC-RENDER-SNAKE
Status: active
Topics:
    - picocalc
    - ui
    - performance
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/apps/snake.js
      Note: Original application and gameplay transitions
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-SNAKE--measuring-snake-snapshots-and-damage-against-full-frames/scripts/11-run.sh
      Note: Reproduces source, raster, skip and recovery experiments
    - Path: repo://ttmp/2026/11/20/PICOCALC-RENDER-SNAKE--measuring-snake-snapshots-and-damage-against-full-frames/various/summary.json
      Note: Host observations and timings
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T11:08:08.408288108-05:00
WhatFor: ""
WhenToUse: ""
---

# What Moves When a Snake Advances One Cell?

A snake game on a 320×320 panel changes very little per step. One cell gains a head, another loses its tail, and the rest of the screen stays the same. Between the game's timer and the display, though, that small change passes through several stages. It becomes game state, then a serialized message, then a layout, then a raster image, and finally a comparison of framebuffers. Each stage can carry much more or much less data than the few cells that changed on screen.

This article follows one real turn through each of those stages. It then reports what a host-side study found about message size, decode cost, paint cost and pixel transfer for a snake game on the PicoCalc. All numbers come from hosted runs on a desktop machine. None are timings from the PicoCalc board itself, and physical device measurements are reported separately.

## The game under study

The board is 22 columns by 18 rows of 13-pixel cells, for 396 cells in all. A new game starts with a snake of length four. Its head is at column 6, row 8, and it moves right. A 110 ms timer advances the snake while the app has focus and the snake is alive. When the app loses focus, movement stops. The interface has no pause button, so losing focus is the only way to pause.

Pressing `p` turns on an autopilot that steers by breadth-first search, and pressing it again turns it off. Any steering key also turns the autopilot off. A key that would reverse the snake onto its own body is ignored.

Eating food adds ten points and leaves the tail in place, so the snake grows by one cell. On a normal move, the head may enter the cell the tail is leaving on that same step. A collision freezes the body, updates the best score and draws an overlay. Enter resets the body and the score, and the best score survives the reset.

With random seed 5172, the first food lands at (7,8), directly in front of the starting head.

## From timer tick to panel pixels

Before introducing any formats, here is the path a single frame takes.

1. The timer fires and the game updates its state. The state includes the body cells, the food cell, score, best score, direction, the alive flag and the autopilot flag.
2. The app builds a UI tree that describes the screen, plus a list of key hints. It serializes both together into one string.
3. The kernel compares that string with the previous one and publishes nothing if they are equal. Otherwise it publishes the string inside an envelope with the fields `app`, `title` and `frame`.
4. The compositor parses the message and lays out the screen. It places the title, two status texts, the centered board and the hints. Its own chrome is fixed in this study. The clock shows as unavailable, and there is no battery indicator or banner.
5. A C rasterizer draws the result into a framebuffer, the block of memory holding one 16-bit RGB565 value per panel pixel. Text uses the production antialiased fonts. The board is filled white. Head and body segments are 11×11 squares inside their 13-pixel cells. Food is drawn as a 7×7 center with an 11×11 outline.
6. `gfx_commit` compares the new frame with the frame previously shown. Within each 16-row band it finds the bounds of the changed pixels, and it may merge adjacent rectangles when that is cheap. It then copies those rectangles toward the panel over SPI, the serial bus to the display.

The board origin was verified at panel pixel (17,52). The x coordinate increases to the right across the 320-pixel width, and y increases downward. Cell (x, y) therefore has its 11×11 interior at panel columns 18 + 13x through 28 + 13x, and rows 53 + 13y through 63 + 13y, inclusive. For the initial head at (6,8), this gives columns 96–106 and rows 157–167, which matches the verified position.

## One worked turn

I chose the turn that comes right after the first meal. On the first tick, the head moves from (6,8) onto the food at (7,8). The score becomes 10 and the tail stays put. Listed head first, the body is now (7,8), (6,8), (5,8), (4,8), (3,8). On the next tick the player steers down.

In the game state, the head moves to (7,9) and the previous head at (7,8) becomes an ordinary body segment. The tail at (3,8) is released. The length stays at five, and the food, score and best score do not change.

On the panel, three cell interiors change.

| Cell | Change | Panel columns | Panel rows | Pixels |
|---|---|---|---|---|
| (7,9) | white becomes head | 109–119 | 170–180 | 121 |
| (7,8) | head becomes body color | 109–119 | 157–167 | 121 |
| (3,8) | body becomes white | 57–67 | 157–167 | 121 |

In RGB565, each pixel is a 16-bit value with 5 bits of red, 6 of green and 5 of blue. White is 0xFFFF, so each of the 121 pixels of the old tail is set to 0xFFFF. The other two cells receive the head and body colors. In total, 3 × 121 = 363 pixels genuinely change. At two bytes per pixel, that is 726 bytes of framebuffer data.

The rectangle `gfx_commit` proposed for this turn was much larger. It was a single rectangle of 1,512 pixels. That figure equals the bounding box of the three cells, which is 63 columns (57–119) by 24 rows (157–180), and I interpret the rectangle that way. Of those 1,512 pixels, 1,149 had not changed but would be sent anyway. When one rectangle spans separated cells in the same 16-row band, it also carries the unchanged pixels between them.

This turn corrects one of my prospective predictions. Before the runs, I wrote an upper bound of 1,014 bytes for this kind of step. That figure is three whole 13×13 cells at two bytes per pixel, so it describes the cell geometry, not the transfer. The rectangle for this one turn covers 1,512 pixels, or 3,024 bytes. The 1,014-byte figure is therefore not a bound on SPI traffic.

The local experimentalist also deliberately skipped the display flush for this exact turn. The framebuffer held the new picture, but the simulated panel kept 363 stale pixels. The test then explicitly requested another draw of the identical app picture. Because the front-plane history had been invalidated, that draw repaired all 102,400 panel pixels.

## The messages and four ways to encode them

The comparison covers four encodings of each frame.

- **J** is the producer's actual string, meaning the serialized UI tree and hints.
- **B** is the same complete object tree passed through Node's V8 binary serializer. It is a host-only control representing a general binary encoder. It is not the compact tagged-operation format I preregistered, which was never built.
- **SJ** is a complete semantic JSON record of the game state.
- **T** is a packed binary record of the same semantic state.

For SJ and T, the receiver rebuilds the same UI tree that J describes before generic layout runs, so all arms feed identical input to layout. For J, the comparison computes the exact `{app, title, frame}` framing that the generic route uses. When T travels inside JSON, its envelope figures include a descriptive schema field and the base64 overhead.

### The T record byte by byte

```
offset  size     field
0       u8       version (1)
1       u8       flags: bit0 = alive, bit1 = autopilot
2       u16      body length
4       u16      food cell index
6       u16      score
8       u16      best score
10      u16 × n  body cell indices, head first
```

Every u16 is little-endian, and a cell index is y × 22 + x. For the worked turn, the body is (7,9), (7,8), (6,8), (5,8), (4,8), which gives the indices 205, 183, 182, 181 and 180.

```
01 01 05 00 FL FH 0A 00 BL BH CD 00 B7 00 B6 00 B5 00 B4 00
```

`FL FH` and `BL BH` stand for the food cell and the best score. Their values at this frame are not in the evidence summary I worked from. The record is 20 bytes, which matches the measured T size after the first meal.

T contains no direction, tick count, seed, focus state or autopilot working data. A receiver can draw the screen from it but cannot advance the game.

The format admits bodies of at most 395 cells. It keeps one of the 396 cells free for food, because food must not overlap the body. That caps a record at 10 + 2 × 395 = 800 bytes. The initial record is 18 bytes.

A separate known issue limits what the 395 figure means. In a simulation where the original game fills the board, placing the last food never completes, because the original placement loop does not terminate in that case. This study does not show a completed 396-segment screen.

### Sizes

All values are in bytes. The last three columns include the full envelope.

| Frame | J | B | SJ | T | J env. | SJ env. | T env. |
|---|---|---|---|---|---|---|---|
| Start | 489 | 478 | 82 | 18 | 529 | 152 | 97 |
| After first meal | 517 | 504 | 87 | 20 | 557 | 157 | 101 |
| Collision | 665 | 648 | 89 | 20 | 705 | 159 | 101 |
| Autopilot tick 200, length 21 | 973 | 930 | 152 | 52 | 1,013 | 222 | 145 |
| Constructed, 300 cells | 8,770 | 8,010 | 1,159 | 610 | 8,810 | 1,229 | 889 |
| Constructed, 395 cells | 11,480 | 10,454 | 1,539 | 800 | 11,520 | 1,609 | 1,141 |

Across the 222 real publications, raw totals were 164,581 bytes for J, 156,586 for B, 25,615 for SJ and 7,732 for T. With full envelopes, J, SJ and T totaled 173,461, 41,155 and 26,790 bytes. Their per-frame medians were 789.5, 181.5 and 121 bytes, and their peaks were 1,026, 223 and 145 bytes. These envelope totals leave out queues, copied headers, controller transfer and the platform bus.

B started at almost the same size as J, 478 bytes against 489. This gives no support for the expectation that a general binary encoding of the same tree would be five to ten times smaller. A hand-written binary operation protocol was not tested, so that question remains open.

## What the trace contains and how equality was checked

The study ran the real JavaScript app with the production JavaScript prelude. It used the source's own callbacks, including the random number generator and the autopilot. Everything ran in a single Node JavaScript realm, with one private hook added to capture state.

The real-input trace has 234 observations. After equal strings were dropped, they produced 222 distinct successive published frames. The trace includes the following events.

- 200 autopilot ticks, reaching score 170 at length 21
- two different collision paths
- a pause caused by losing focus
- a restart
- a legal entry into the cell the tail was vacating
- a rejected reversal

The two constructed serpentine states, with 300 and 395 body cells, were kept separate from the real trace.

For all 236 frames, the trees rebuilt from SJ and T equaled the tree from J. Three sources of images were then compared. Two were independently run reference captures. The third was an independent template that draws the same game appearance without calling the source's screen function. All three produced byte-identical images in all 236 frames.

## Decoder checks and known memory

The T decoder rejected all 15 malformed binary cases. They covered bad version, flags, size, count, scores, food position and body positions, as well as overlapping segments and non-adjacent segments. After each rejection, the previously accepted bytes were unchanged.

Several things were not measured. These include the decoder's allocator behavior, JSON admission, any CRC check, the publisher's generation handling, and behavior on a hostile channel.

For memory, I can report only components whose size is fixed by design, not peak heap use. The current JavaScript decoder uses a 396-byte occupancy map, plus a JavaScript body array and the rebuilt tree. Two raw records at the size cap take 1,600 bytes. The 396-byte map is the only other buffer with a known size, so these figures do not add up to total live memory.

On the C side, the partial painter described below holds an old and a new role grid of 396 bytes each. The two framebuffers underneath it take 409,600 bytes. The simulated panel used in the instrumented runs adds another 204,800 bytes that a real device would not need.

## Host codec timings

Timings came from Node v24.18.0 after warm-up. The study used 20 timing blocks run in rotating order. Each block published the whole deduplicated real corpus six times. The table gives the median of the per-operation means, in microseconds.

| Arm | Produce (µs) | Receive (µs) | What receive covers |
|---|---|---|---|
| J | 4.137 | 3.599 | parse |
| J, repeated as control | 4.153 | n/a | n/a |
| B | 5.705 | 4.976 | V8 deserialize |
| SJ | 0.428 | 0.741 | trusted semantic parse and tree rebuild |
| T | 0.457 | 0.706 | bounded decode and tree rebuild |

The repeated J control landed within 0.02 µs of the first J run. Validation and decoding of T alone, without rebuilding the tree, took 0.431 µs. Decoding T creates a JavaScript list.

None of these figures include the game tick, inter-process communication, generic layout, rasterizing, SPI or JSON admission. They are host figures and support no conclusion about microcontroller timing.

## Painting only the cells that changed

The second question was whether the C side could avoid a full repaint on ordinary moves. The partial candidate keeps its own visual occupancy grid for both the previous state and the new state. It compares all 396 cells and fills only the cells that differ. It falls back to a full paint when any of the following holds.

- the alive flag changes
- any other header field changes
- the body length changes
- the scene shows a dead snake

The candidate assumes the compositor chrome is fixed. Every frame it produced was checked for exact equality against a shared full-frame RGB565 reference.

The full-paint control and the partial painter ran in the same C process over 12 runs. Their order was reversed by frame and by trial. The two arms start their timers at different points.

- The control's timer starts after JavaScript layout and lowering to draw commands.
- The partial painter's timer starts inside C, before rasterizing and the occupancy scan.

The `gfx_commit` call plus the copy to the simulated panel was timed separately. No device SPI was involved.

For ordinary moves, the forced-skip and idle frames were excluded, leaving 196 draws per run. The table gives the median across the 12 within-run medians. The fallback rows cover 24 changed source frames, not counting the initial frame.

| Path | Arm | Paint (µs) | Commit and simulate (µs) |
|---|---|---|---|
| Ordinary move | Full control | 34.642 | 19.697 |
| Ordinary move | Partial | 0.388 | 5.995 |
| Fallback | Full control | 35.118 | 22.102 |
| Fallback | Partial candidate | 34.861 | 22.360 |

On an ordinary move, the partial painter wrote 363 pixels. The control's first step alone, clearing the panel, writes 102,400 pixels.

Both arms produced the same 363 changed pixels per move, and their transfer counts were equal. The median transfer was 385 pixels, the 95th percentile (p95) was 2,136, and the maximum was 4,008.

A collision in the source trace changed 14,102 pixels and transferred 16,855. No frame required a full-panel transfer except the initial frame and the forced repairs. Whether the candidate stays correct for overlays other than those in this trace has not been established.

## Losing a record, skipping a flush, repainting, scheduling

Four different events sit between the game and the panel. These are a lost record, a skipped display flush, a repaint, and the timing of when frames are actually scheduled. The study tested the first two directly. It used the third as its repair mechanism and did not test the fourth.

**Lost records.** Additional traces dropped ten publications in a row. Because each T record is a complete snapshot, the next retained record rendered correctly immediately. It did so both from the last painted frame and from a cold start 75 frames into the trace. I had predicted that T would need periodic keyframes. That prediction is falsified for this format.

**Skipped flushes.** In these tests the framebuffer was current but the panel had not been updated. Stale pixel counts were 558 after a growth step, 363 after a move, 14,102 after a collision and 14,690 after a restart.

**Repaints.** In each case above, the next explicitly invoked draw repaired all 102,400 pixels.

**Scheduling.** The tests triggered the repairs, not the production scheduler. No recovery time in milliseconds was measured. Switching focus to another foreground app was not painted anywhere in this corpus.

## Measured, predicted, open

The hosted runs measured the following. They measured message sizes for all four encodings and host codec times. They measured C paint and commit times on a simulated panel, and pixel and transfer counts. They confirmed image equality across three independent arms and decoder rejection of 15 malformed inputs.

Two of my predictions failed. T does not need keyframes, and the 1,014-byte cell figure is not an SPI bound.

Four predictions remain open for physical evaluation.

- whether the physical flush dominates frame cost
- end-to-end latency
- endurance across 20 seeds
- whether the p95 transfer size is acceptable for adoption

## Recommendation

I recommend evaluating the simpler semantic JSON format, SJ, on physical hardware. I also recommend building a separate damage prototype that handles motion only. The packed T format saves bytes, but it would need bounded admission and versioning before a receiver could trust it. This study does not justify any rollout or any firmware flash change.

## Reproduction

From the repository root, run `scripts/11-run.sh OUTPUT` in the study PICOCALC-RENDER-SNAKE, where OUTPUT is the output location. The relevant files are listed below by basename.

- `05-replay.mjs`, the real-source replay
- `06-semantic.mjs`, the SJ and T codecs
- `07-measure.mjs`, the size and timing measurements
- `09-damage.c`, the C partial painter and control
- `11-run.sh`, the driver script
- `summary.json`, `pixels.json`, `events.json`, `timings.json`, `replay.json` and `raster-trials.csv.gz`, the outputs
