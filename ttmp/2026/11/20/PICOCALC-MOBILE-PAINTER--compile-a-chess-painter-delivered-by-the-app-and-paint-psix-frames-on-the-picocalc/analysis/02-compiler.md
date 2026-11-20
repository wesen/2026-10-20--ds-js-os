---
Title: From a delivered Chess painter to reusable RISC-V instructions
Ticket: PICOCALC-MOBILE-PAINTER
Status: active
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/port/esp32p4/main/mobile_painter_p4.c
      Note: Device compile, load and run path
    - Path: repo://picocalc-os/worlds/chess/painter.typed
      Note: Painter code used in the worked example
    - Path: repo://ttmp/2026/11/20/PICOCALC-MOBILE-PAINTER--compile-a-chess-painter-delivered-by-the-app-and-paint-psix-frames-on-the-picocalc/various/compiler-replay.json
      Note: Operation equality for the host replay
ExternalSources: []
Summary: A newcomer study of source provenance, install-time relocation and frame-time rendering for a transported Chess painter.
LastUpdated: 2026-11-20T15:55:00-05:00
WhatFor: Explain how a running app can deliver typed source that becomes a callable renderer.
WhenToUse: When studying the separation between installing a view program and using it to render changing state.
---

# From a delivered Chess painter to reusable RISC-V instructions

The Chess app sends the compositor a typed drawing function when it starts. The PicoCalc compiles that function to RISC-V machine instructions and keeps its native entry point in memory. When the player moves the cursor, the app sends a snapshot of the board and cursor position. The compositor calls the existing entry point with that snapshot, reads the draw operations it returns, and applies them before committing the framebuffer to the display.

This arrangement makes two changes to the ordinary Chess renderer. Drawing policy moves from the game process to a program owned by the receiver. The repeated messages describe the game state needed for drawing, so they no longer carry each tile background, label, and piece glyph. The experiment preserves the drawing order, text, margin sizes, and colors of the original screen.

## How a message becomes a native function

An install message contains the UTF-8 bytes of the typed painter. The receiver identifies the current Chess publisher and compares the message's bytes with the firmware's known source. This admits one source identity. Changing a byte, even in a comment, changes that identity. The compiler receives the delivered bytes after the comparison. This matters because it establishes which message supplied the program the device compiled.

Shipped PicoCalc firmware already has a typed frontend and an RV32 backend. The frontend checks types and emits an intermediate description of each function. The backend lowers each function to RV32 instructions as it is parsed in the streamed configuration. It arranges the instructions in an image and resolves calls among functions in that image. The painter has no external imports. Its entry takes two typed buffer pointers and returns a signed 32-bit word count.

The resulting instruction image needs a runnable address. The firmware includes a small *reactor*, a shared ELF file containing a reserved part of its executable section and a C entry named `app_main`. ELF is a format for packaging code and describing how to load it. Here the reserved section contains a placeholder for one entry, then room for the compiler's machine instructions. The linker replaces the placeholder with an RV32 jump to the byte offset of `paintChess`. That jump is relative to its own address. Moving the whole code section preserves the distance from the jump to the function.

The ESP loader checks the resulting ELF, places its executable section in memory, and synchronizes its data and instruction caches. The compiler worker uses a stack in external PSRAM. The cache synchronization temporarily disables external memory access, so the worker passes the linked image back to the kernel task for loading on its internal DRAM stack. The kernel calls the relocated `app_main` once to retrieve a function pointer to the patched jump. The receiver can now call the compiled renderer repeatedly through that pointer. The compiler context and the in-memory copy of the ELF file can be freed because the loader owns the executable image from this point on.

| Object | Lifetime |
| --- | --- |
| Received typed source | The sender publishes it at startup. The receiver keeps its copy until installation completes. |
| Compiler runtime and patched ELF bytes | The compiler runtime ends on the worker. The patched ELF crosses to the kernel task and is freed after loading. |
| Loaded native function | The receiver keeps it available for subsequent frames. |
| PSIX snapshot | It supplies current visible state for one native invocation. |
| Drawing records | The receiver retains the validated current result for compositor redraws. |

A failed install has no native entry to invoke. An accepted install remains useful when subsequent packets carry different board positions. The retained executable contains rules for turning snapshots into draw operations. Every invocation reads current field values supplied by the sender.

## Follow e3 from a state packet to pixels

A snapshot contains 64 piece codes in row-major order, eight masks that identify legal destination squares, and nine signed fields for the cursor, selection, last move, and display text. The receiver decodes the bounded PSIX packet into 90 sixteen-bit cells. The two halves of each signed field are stored in separate cells with the low half first.

Consider the recorded opening replay where a player selects the pawn on e2 and moves the cursor up to e3. The cursor is dense square 44, and the selected pawn is on square 52. Divide 44 by eight to get row five and use its remainder to get file four. The snapshot's piece cell 44 is zero. Rank mask five is hexadecimal `10`. Its bit four is set, because e3 is one of the pawn's two legal destinations. Those three facts determine which layers the painter emits for e3.

The board starts at display x=46 and body-relative y=28. The first tile starts another 17 pixels to the right and three down. Each tile occupies 26 by 26 pixels. For e3 the painter computes `x = 63 + 26*4 = 167` and `y = 31 + 26*5 = 161`. These values are relative to the body, which begins at physical y=22.

| Record | Ordered words | Effect at the compositor |
| --- | --- | --- |
| Tile background | `1, 167, 161, 26, 26, 29773` | Fills the tile at physical y=183 with the dark-square color. |
| Destination mark | `1, 186, 180, 5, 5, 56259` | Draws the orange marker at the tile's lower right. |
| Cursor outline | `2, 168, 162, 24, 24, 59973` | Draws the red outline one pixel inside the tile. |

The leading word selects the primitive. The last word of each box record is a color encoded as RGB565, with five bits for red, six for green, and five for blue. These colors match the conversion from the original renderer's hexadecimal color values. The native code emits no piece glyph at e3 because the board cell is empty.

The order is observable. Drawing the tile background after the destination mark would overwrite the mark. On a square with a piece, the tile background also comes before the piece background and text glyph. The compositor's loop must apply all records in sequence. Later layers win wherever they paint the same pixels. Text records carry an explicit font, maximum width, and ASCII length. The last record carries the current hints. The compositor uses the same font rasterizer and gives the hints their normal bar. It continues to own the title bar, display damage tracking and frame commit.

## Bound the work at the calling interface

The compiled function takes an input buffer and an output buffer. Each begins with a 32-bit capacity followed by sixteen-bit cells. To read cell 44 the generated code checks the index against the capacity, then loads from byte offset `4 + 2*44 = 92`. The immutable snapshot fields the sender published have become integer operands.

The painter's row and file loops visit exactly 64 tiles. The only variable count of operations per tile comes from piece, destination, and cursor conditions. The receiver admits at most 32 pieces, so the painter can emit at most 64 piece records. Even with all 64 destination marks present, the board and text fit the 274-command and 4,096-word format ceilings. The consumer checks the returned count and all record lengths and geometry before drawing. The compiler's buffer checks and this record validation address separate failure modes. The native code executes with firmware privileges. This test authorizes it by source pinning, a reviewed compiler path and known loader behavior.

The footer uses the same decimal rendering rules on both targets. A negative evaluation needs a minus sign and its digits. The signed 32-bit range contains one value whose positive magnitude cannot be represented, so the painter computes decimal digits with a negative magnitude. A replay case with evaluation −77 exercised the same signed-digit path used for other negative scores.

## What equality and reuse each establish

The host replay regenerated 47 screen states from 127 Chess events across 11 scenario groups. These include the opening and engine reply, two castling directions, en passant, promotion and underpromotion, checked positions, mates, draws, and signed statistics. It ran the ordinary Chess renderer to collect its screen tree. An independent reader derived the RGB565 draw operations from that tree, using the ordinary renderer's layout conventions. The same snapshots then went through the typed painter compiled to Wasm and through its generated RV32 code running in the CJI emulator.

All 47 sequences matched word for word. The test also checked untouched space after each returned prefix. The largest stream occupied 1,085 words. The program was 6,204 bytes of typed source, the generated RV32 instructions occupied 11,216 bytes, and the complete patched ELF occupied 17,456 bytes. The [host receipt](../various/compiler-replay.json) records the per-frame lengths and exact artifact hashes. The [reproduction program](../scripts/compiler/01-replay.mjs) builds the same slot template, checks the typed entry signature, and fails on the first command difference.

Ordered commands provide an exact comparison of geometry, text, color, and layering before rasterization. A transport trace answers a different question. It needs a source publication, one receiver compiler invocation attributable to those bytes, a successful load, and multiple subsequent native returns for later snapshot messages. This sequence establishes the amortized cost: compilation and relocation are paid on install while native generation and rasterization repeat per accepted frame. A framebuffer comparison after commit tests whether the real compositor applied the commands and presented the same pixels. Device measurements include loader cache behavior, frame scheduling, and display transfers that the host emulator cannot establish.

## Reading the implementation

`paintChess` shows how the wire snapshot becomes draw records. `linkMobilePainter` shows which entry signature is admitted and where the object is patched. `mobile_painter_compile`, `mobile_painter_load`, and `mobile_painter_run` show the compiler and executable lifetimes. The [compiler design](../design-doc/02-compiler.md) gives the complete buffer layouts and ownership. The [investigation diary](../reference/02-compiler-diary.md) records the independent abstract review and the implementation decisions that followed.
