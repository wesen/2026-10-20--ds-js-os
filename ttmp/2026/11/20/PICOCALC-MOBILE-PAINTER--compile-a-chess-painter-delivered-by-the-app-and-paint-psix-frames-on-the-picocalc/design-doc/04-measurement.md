---
Title: Qualification from the cursor key to the completed RGB565 transfer
Ticket: PICOCALC-MOBILE-PAINTER
DocType: design-doc
Status: active
Topics:
  - picocalc
---

# Qualification from the cursor key to the completed RGB565 transfer

The comparison starts from a fresh Chess position. The program starts its cursor on e2. Opening Chess, pressing Up, and pressing Right should show e2, e3, and f3. No piece moves. The game has no reason to search, score or animate these positions. This makes a complete static comparison possible between the program that emits a screen tree and the program that sends state to an application-supplied painter.

## What constitutes a match

Compare every 16-bit RGB565 pixel on the 320 × 320 device from the beginning of row 22 through the end of row 319. This includes the complete board, status, background and hints. The system owns the first 22 rows independently of the game. Record their differences separately. A difference of one unit in one color channel of one application pixel fails equivalence. At each position check the 92-pixel outline unique to the cursor. A second key must move that outline 26 pixels on the correct axis. An unchanged or hidden app cannot pass because the pictures happen to agree.

The original host comparator runs the release's typed Chess source as Wasm, using the original compositor and a virtual display. Its 640 × 640 screenshots are nearest-neighbor enlargements. Before reducing one, confirm that repeating each of the reduced pixels yields the original raster exactly. Convert each 8-bit red, green and blue component back to its original 5, 6 or 5 significant bits. Compare the resulting bytes directly to the UART screenshot. This host and the physical implementation share fonts and primitive drawing code. A consistent font or RGB conversion error in both can pass.

## What the panel observer records

The SPI driver programs a column interval with CASET (0x2a), a row interval with RASET (0x2b), and begins a write with RAMWR (0x2c). Both interval ends are inclusive. For each completed transaction, a test-only hook reads the exact DMA buffer returned by ESP-IDF before the driver can refill it. Two bytes in most-significant-first order reconstruct one RGB565 value. The observer places that value at the next position in the programmed window, moving down one row when it reaches the end column. A new window before receipt of all previous pixels increments its fault counter. A semaphore gives the console a snapshot between bus operations. The observer allocates a separate 200 KiB shadow in PSRAM, initially filled with a distinctive nonzero value. It runs from boot so unchanged pixels survive across cursor moves.

The UART screenshot is an independent read of the front framebuffer. The host validates its run lengths, size and transmitted CRC. The observer CRC covers decoded, completed SPI payloads across the same 298 rows. The run fails on mismatched CRC, an incomplete window, a transfer error or a missing cursor. SPI bus byte and transfer deltas support these comparisons. This evidence extends to the driver completion boundary. The experiment has no sensor for panel scanout or visible light.

## Installation and reuse

An opt-in build selects the release-pinned painter source, binary state transport and native consumer. The control retains the tree implementation. Read the service at boot, then after launch and each cursor key. Exactly one compile must have occurred and the executable must be installed. Each arrow must advance packet acceptance, native execution and rasterization counters without another compilation. Classify compilation at game initialization separately from compilation at foreground focus. The startup background worlds can render before the operator opens Chess.

The normal release preflight checks actual I²C activity independently of UART key command acknowledgment. On a non-acknowledging STM32, a temporary image answers only the keyboard status register with the number of queued serial key events. The normal native keyboard world consumes those events, so launcher routing, game logic and the physical display remain exercised. Report the substituted run separately from normal firmware, retain the physical controller error counts, and restore the verified ordinary release. Physical keypad operation requires a working STM32.

[Board qualification script](../scripts/device/play.py) · [Completed transaction observer](../scripts/device/panel-observer.inc) · [Host comparator](../scripts/device/compare.py) · [Independent Opus High methods review](../various/device/opus-methods.json)
