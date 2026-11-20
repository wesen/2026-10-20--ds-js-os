---
Title: A Chess app that installs its own native painter
Ticket: PICOCALC-MOBILE-PAINTER
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T15:47:46.677372055-05:00
WhatFor: ""
WhenToUse: ""
---

# A Chess app that installs its own native painter

## Two messages answer different questions

A Chess position tells the operating system which pieces occupy which squares, where the cursor is, which destinations are legal and what status to show. A painting program tells the operating system how to turn those values into pixels. Shipping these two artifacts independently lets an app define its appearance and publish many positions for the cost of a single installation. The research question is whether the real consumer can compile that appearance on an ESP32-P4 and run it on actual game messages at interactive speed.

The earlier mobile-code experiment uploaded a source file and compiled it to Wasm. Its output was another description of a screen. The earlier PSIX writer experiment compiled an encoder to RV32. This design reuses the compiler and loader to create the *consumer's* native function, and delivers its source through an application message. Each installation belongs to the bundled Chess publisher. Supporting further apps requires additional admitted painter identities and their data contracts.

```text
Chess world                         Compositor                         Display
  publish source ────mailbox────► validate source → compile RV32 on worker
  publish PSIX ──────mailbox────► validate packet → retain newest state
                                                   ↓
                                  invoke installed function(state)
                                                   ↓
                                  validate complete command list
                                                   ↓
                                  draw app body + system chrome → commit → SPI
```

## A single cursor move

At game start a dense index of 52 identifies e2. Moving up changes that value to 44, e3. The piece array can remain the same. Chess still sends a complete packet so that a receiver can coalesce updates and recover the latest position after a restart. The PSIX directory supplies record and string locations; a receiver must check them and the Chess data domain before use. A versioned decoder makes 90 native 16-bit cells from the packet. The compiled painter consumes this compact struct-like input without materializing a widget tree.

The painter uses RGB565 color words, body-relative coordinates, and three font IDs already defined by the device. A fill is six 16-bit words: opcode 1, x, y, width, height and color. On a normal 26-pixel tile, a program can draw the base color, the inset rectangle behind a piece and its single-character glyph, then the cursor outline. Drawing order is observable. A cursor outline that precedes the tile fill disappears.

## Boundaries and ownership

- The native game's publisher supplies source exactly once per publisher generation and emits complete counted PSIX bytes on updates. The receiver identifies the sender from the kernel message.
- The compiler accepts the pinned trusted source and generates the native function on the receiving board. The allowed bundle copy supplies an identity check. Its bytes must never replace the delivered source as compiler input.
- The kernel lane accepts and retains the latest validated input while a separate worker compiles. The worker owns its private source copy and returns an executable handle by queue. Only the kernel lane mutates retained UI state or touches a framebuffer.
- Rendering writes a scratch list. The complete list must validate before the receiver swaps it with the previous good list. Published snapshots and scratch are independent of the game world's memory.
- The compositor draws the list between the existing status bar and its banner/hints. It uses the established framebuffer commit and display protocol, including invalidation after a skipped transfer. The display driver determines which rectangles reach the panel.

## Installation and evaluation

```text
on source from Chess:
    compare all source bytes with the trusted version
    submit a private copy to the compiler unless this program is installed or pending
on complete PSIX packet from Chess:
    decode and validate the position
    retain or render it, according to installation status
on native installation completion:
    run the program with the latest accepted position
on successful render:
    validate each command, then atomically replace the retained word stream
    wake the compositor to paint and flush through its normal draw callback
```

The path uses the shipping compiler's RV32 backend, a bounded code slot and the ESP ELF loader. It intentionally gives native execution to a trusted bundled program. Input and drawing validation bound parser and raster operations, but native code still shares the process memory privileges of the component executing it.

## Qualification

Compare the same three product states on paired firmware images. Capture the opening, first cursor motion and second cursor motion; compare the committed application pixels and hints, charge compilation once and record how many native calls and paints occurred. Time from kernel key dispatch to completed SPI work separately from compilation, CPU and observer wait. Also replay the earlier 47-position corpus against frozen pixels and verify refusal of malformed commands. A failed keypad can be bypassed in a research image only if the input method and remaining ordinary-firmware checks are reported explicitly.

## API and source map

The portable vocabulary is in `picocalc-os/nucleus/mobile_painter.h`. `painter_commands_valid` checks counted output, geometry, fonts, ASCII and the terminal hints record. `painter_commands_draw` consumes an admitted list and applies ordinary gfx functions. The `painter_service` in the ESP32-P4 port owns source admission, installation, state and last-good output. The CJI compositor owns the write-capable framebuffer handle. Use its normal draw and commit paths to establish what actually reaches the display. The compiler, transport and physical measurement guides in this ticket document the contracts at their respective entry points.
