---
Title: Compiling the received Chess painter into an RV32 entry
Ticket: PICOCALC-MOBILE-PAINTER
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://apps/typed/chess/link-painter.js
      Note: Typed entry qualification and slot linking
    - Path: repo://firmware/nucleus/mobile_painter.h
      Note: Portable state and drawing ABI
    - Path: repo://firmware/port/esp32p4/main/mobile_painter_p4.c
      Note: Source admission, compilation and executable lifetime
ExternalSources: []
Summary: Source admission, RV32 compilation, executable ownership, and the draw word contract.
LastUpdated: 2026-11-20T15:54:00-05:00
WhatFor: Review the compiler and painter across installation and steady state.
WhenToUse: When changing the source pin, entry ABI, or drawing records.
---

# Compiling the received Chess painter into an RV32 entry

The receiver accepts the known Chess painter source from a live publisher and compiles that received byte sequence locally. Its private compiler runtime and patched ELF bytes are temporary. The relocated executable and output scratch belong to one resident painter handle. Subsequent game snapshots call its entry with two typed buffers. The compositor validates the complete result and draws the ordered records through its existing framebuffer primitives.

## Installation

1. The receiver binds the delivered message to the current Chess sender epoch and validates its application message envelope.
2. `mobile_painter_source_allowed` caps the source at 16,384 bytes and compares its length and every byte with `chess/painter.typed` from the immutable firmware bundle. The bundle read is a comparison reference. `p4_typed_compile` receives the delivered source pointer and length.
3. The worker opens a fresh QuickJS context with the existing typed frontend, optional C lexical index and streamed RV32 backend. The budget is a 2 MiB JavaScript allocator ceiling and a 1.7 s QuickJS interrupt deadline. They apply to the compiler invocation.
4. `linkMobilePainter` requires the `paintChess(buffer, buffer): i32` signature, an empty import and relocation list, and no asynchronous layout. `typedRv32.linkSlot` writes the machine image into a 16 KiB reserved executable section and patches its one entry stub to jump to that function.
5. The worker transfers the patched ELF file to the kernel lane. The ESP ELF loader allocates, places and relocates the image on the kernel task’s internal DRAM stack. The loader synchronizes caches by briefly disabling external-memory cache access. The relocated `app_main` returns a function pointer to the patched jump. The kernel frees the linked file bytes and keeps the painter handle. Compilation and relocation timings are available to the receiver separately.

The explicit byte pin is the authority for executing this reviewed native program. Buffer checks, record validation, and a checked entry signature catch particular classes of faults. Native machine code executes with firmware privileges. The experiment validates a transported program with a single allowed source identity and depends on the compiler and loader for safe execution.

## Per-frame call

The PSIX decoder supplies 90 unsigned 16-bit cells in host memory. The first 64 entries are piece codes in row-major order. The next eight are destination masks with the a-file in bit zero. Each of the last nine signed fields occupies two little-endian cells. Field order is cursor, selected square, previous origin, previous destination, status, hint, completed depth, nodes, and evaluation. The absent-square sentinel is 64. The receiver owns the state and only passes a temporary copy to the painter.

On RV32 each typed buffer begins with an aligned 32-bit capacity in cells. Cell `i` is at byte offset `4 + 2*i`. The output capacity is 4,096 cells. `mobile_painter_run` returns the used prefix length after calling the native entry and copies only that prefix into caller-owned scratch. Coordinates are relative to the display body at physical origin `(0,22)`.

| Tag | Words after the tag |
| --- | --- |
| `1` Fill | `x, y, width, height, RGB565` |
| `2` Outline | `x, y, width, height, RGB565` |
| `3` Text | `x, y, font, RGB565, maxWidth, count, ASCII[count]` |
| `4` Hints | `count, ASCII[count]`, once at the end |

The text record font indices `0`, `1` and `2` select `s`, `m` and `mb`. The painter requests `312 - x` as the maximum width of the status and footer lines, matching the ordinary compositor's 8-pixel app margins. Board glyphs use zero for the natural width case. The complete command stream fits within the 274-command admission ceiling. A Chess position with 32 pieces uses at most 64 tile fills, 64 piece records, 64 destination marks, 16 coordinate labels, one board outline, one cursor outline, two lines and one hints record. The text size follows from the fixed literals plus the bounded integer fields.

The painter emits labels and tiles in the same order as Chess's ordinary canvas. A single tile can emit its background, piece background, piece glyph, destination mark, then cursor outline. Overlapping pixels are resolved by later primitives. A consumer that sorts by primitive kind changes that order and can erase parts of an overlay.

## Ownership and evidence

The compiler and C lexical index use private runtime state. The trusted bundle is immutable and comparison reads make private copies. The slot contains no imports and has one export. The ESP loader owns executable pages until `mobile_painter_free`. Input memory and output scratch stay inside their synchronous call ownership boundaries. The director's receiver owns any queueing, epoch handling, and cached rendering records.

The [replay runner](../scripts/compiler/01-replay.mjs) builds the same slot and compiles the same source on a host. It also compiles to Wasm and runs the extracted RV32 text under the CJI emulator. The [compiler receipt](../various/compiler-replay.json) records exact image identities and the 47 command streams compared with the ordinary Chess view. This validates generated instructions and layout with recorded states. Board evidence is required for ESP loading, transport, and real display publication.
