---
Title: Mobile Chess painter compiler investigation diary
Ticket: PICOCALC-MOBILE-PAINTER
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-MOBILE-PAINTER--compile-a-chess-painter-delivered-by-the-app-and-paint-psix-frames-on-the-picocalc/scripts/compiler/01-replay.mjs
      Note: Reproduce the host compiler check
    - Path: repo://ttmp/2026/11/20/PICOCALC-MOBILE-PAINTER--compile-a-chess-painter-delivered-by-the-app-and-paint-psix-frames-on-the-picocalc/various/compiler-replay.json
      Note: Exact source and output sizes, digests and replay results
ExternalSources: []
Summary: Chronological investigation of the transported painter and the RV32 execution path.
LastUpdated: 2026-11-20T15:54:00-05:00
WhatFor: Inspect ABI decisions, build failures, and evidence from compiler qualification.
WhenToUse: When reproducing this study or reviewing the native installation.
---

# Mobile Chess painter compiler investigation diary

## Step 1. Reuse the working compiler and agree on a drawing contract

I read the prior PSIX staging trial, the retained Chess view prototype and the production Chess renderer before proposing the compiler entry. The staging trial already compiled generated typed source and patched a reserved ELF slot on the P4. The retained Chess study already extracted a dense board, eight destination masks, and the nine displayed state fields from the game. Using those two boundaries let us focus on moving painter ownership to the compositor.

### Prompt context

My delegated brief called for on-device RV32 compilation of received Chess painter source, a bounded draw result, production pixel order and hints, a separate detailed diary, and a newcomer report. The director records the full request in the [implementation and qualification diary](01-director-implementation-and-qualification-diary.md). The device operator owns firmware builds and physical runs.

### What I did

- Located `p4_typed_compile`, the ESP ELF loader and `typedRv32.linkSlot`.
- Coordinated the 90-cell semantic projection with the producer and the ordered drawing interface with the director.
- Commissioned an independent Opus High design assessment from an isolated temporary directory. The [abstract prompt](../scripts/compiler/03-opus-design.txt) had tools disabled, no MCP access, and no local source or results.

### Why

The shared source type `buffer` already describes a capacity followed by 16-bit cells. It supports two pointer arguments without new compiler lowering or changes to the ESP ELF format. The receiver can validate record lengths and pass well-formed commands to the existing font and geometry operations.

### What worked

The prior Chess snapshot fields match all inputs the painter needs. The display's `s` and `mb` font cell dimensions match the ordinary centered text layout and fix the top row, canvas, footer, and body offset.

### What did not work

The fixed-record and variable-word proposals crossed while agents were coordinating. I sent one final freeze that specified variable-width records in 16-bit words, RGB565, coordinates relative to `(0,22)`, and an explicit final hint record. The portable `nucleus/mobile_painter.h` records that agreement.

The restricted network attempt ran `claude --print --model opus --effort high --output-format json --tools "" --strict-mcp-config` with an empty MCP config and empty settings source list. The CLI ended with `API Error: Can't reach the API server — check your internet or DNS (ENOTFOUND)`. The same abstract request succeeded with network escalation. The [receipt](../various/compiler-opus-design.json) records `claude-opus-5-5`, session `8ab15356-877b-4806-9749-d87c3a29da7a`, 131.636 s elapsed, and zero tools used.

### What I learned

The independent review identified separate claims around source provenance, per-frame equivalence, and actual presentation. It also separated language and memory-boundary checks from confinement of untrusted native machine code. We kept exact firmware byte admission, tracked install and run events separately, and kept the compositor's framebuffer and commit ownership.

### What was tricky to build

Chess uses both the canvas origin and the top margin of the surrounding column. Canvas y=28 is relative to the body, and a board tile starts at relative y=31. The physical tile is at y=53. Font sizing and centering require application width 304 with x=8, while the center of the 228-pixel board is x=46.

### What warrants a second pair of eyes

Verify that the receiver uses relative coordinates once, that glyph length and clip rules match the generic compositor, and that invalid source and frames cannot displace accepted state.

### What should be done in the future

A study that accepts new unreviewed source would require an independently enforced execution boundary. This study pins one known source.

### Code review instructions

Read [the compiler design](../design-doc/02-compiler.md) and `nucleus/mobile_painter.h` before reviewing the producer or compositor changes.

### Technical details

The mature direct-call example is `PICOCALC-PSIX-STAGING/scripts/board/staging_trial.c`. The painter's state follows the dense order in `PICOCALC-RENDER-CHESS/scripts/04-semantic-producer.typed`.

## Step 2. Compile and compare complete drawing streams

I implemented the closed typed painter, compiler linker, RV32 slot, and P4 loader. The host replay ran real generated Wasm and actual RV32 instructions under the emulator. Both agreed word for word with the drawing commands derived from 47 generic Chess screen trees.

### Prompt context

See Step 1. The compiler and painter milestone is `3a0dcda`, “Compile the received Chess painter to an owned RV32 entry.”

### What I did

- Authored the typed geometry, text formatting, and piece, mark, and cursor draw logic in `worlds/chess/painter.typed`.
- Added `compiler/mobile-painter.js` and a 16 KiB executable slot. `mobile_painter_slot.c` exposes one generated entry after relocation.
- Pinned the exact received byte sequence in `mobile_painter_source_allowed`, bounded the on-device compile, and wrote `mobile_painter_run` to copy only the output prefix after a native return.
- Built an emulator fixture runner under `scripts/compiler` and compared all ordered commands and untouched output tails. The replay checks that buffered and streamed compilation produce identical linked ELF bytes.

### Why

A host assertion on code length does not exercise the generated function. The emulator executes the emitted RV32 instructions against precisely the same capacity-prefixed input and output layout as the P4. The ordinary compositor layout supplies the expected order and geometry independently of the typed painter.

### What worked

`node "$ticket/scripts/compiler/01-replay.mjs" /tmp/mobile-painter-compiler-replay "$gcc"` passed with GNU RISC-V GCC from ESP toolchain `esp-14.2.0_20260121`. Its 127 Chess events across 11 groups produced 47 screens, of which 46 would publish after deduplication. The host linked ELF was 17,456 bytes, of which 11,216 were generated machine instructions. The largest command stream was 1,085 words. All rows and source and image SHA-256 values are recorded in the [host receipt](../various/compiler-replay.json).

### What did not work

The first local commit command failed with `fatal: Unable to create '/home/manuel/code/wesen/2026-10-20--ds-js-os/.git/index.lock': Read-only file system`. I reran the same path-scoped commit through approved escalation and confirmed `3a0dcda`.

### What I learned

The legacy renderer uses a 12-pixel `s` font and a 16-pixel `mb` font. Its fill and text calls expect RGB565 quantization exactly as `gfx_color` computes it. Using a 16-bit RGB565 literal in the painter still preserves the original color conversion for both solid fills and glyph rendering.

### What was tricky to build

Chess score text is signed. I kept the magnitude negative when writing decimal digits so the arithmetic also covers `INT32_MIN` without negating it into an unrepresentable positive `i32`. Its repeated tile commands have fixed loop counts, and its two decimal loops are bounded by the value domain.

### What warrants a second pair of eyes

Review the P4's publication and relocation cache synchronization when the compiler worker and consumer run on different cores. The compiler context, allocator counters and lexer state are private. Bundle data are immutable. The loader's PSRAM path writes back data cache and calls the existing dual-core flash-cache synchronization functions.

### What should be done in the future

The physical trace should record source delivery and compilation once, then multiple native returns and display commits carrying a matching app epoch and frame sequence.

### Code review instructions

Start with `paintChess` and `mobile_painter_install`. Reproduce the command-stream comparison using [01-replay.mjs](../scripts/compiler/01-replay.mjs). Build the shared Wasm reactor using `make -C picocalc-os typed-world-reactor` if the Chess capture runner does not find it.

### Technical details

The ELF template uses one entry slot whose 32-bit placeholder is changed to a direct jump. The host receipt carries the start offset of the generated function within its instruction image. Matching commands establish drawing inputs and order. A board test establishes the separate transport, relocation, compositor, and display claims.

## Step 3. Teach the boundary through a recorded move

The newcomer report follows e3 through the real opening replay. Its snapshot carries cursor index 44, selected square 52, no piece at 44, and rank mask `0x10`. These values explain a tile fill, an orange destination mark, and a red cursor outline in their emitted order. The example uses body-relative coordinates and explains the one y-offset applied by the compositor.

### Prompt context

See Step 1. The user requested a textbook-style project report as a separate research deliverable.

### What I did

- Commissioned a second [abstract Opus High prompt](../scripts/compiler/04-opus-article.txt) on explaining a source install, a callable ELF entry, and one tile's geometry to a newcomer.
- Inspected the opening snapshot and ordinary canvas operations from the replay and substituted those recorded values for the abstract examples.
- Separated the claims supported by command parity from the claims needing physical transport and display evidence.

### Why

A concrete square makes the state representation, coordinates, output order, and display offset checkable. Introducing the installed entry before calling it makes source-message timing and later reuse understandable.

### What worked

The [article research receipt](../various/compiler-opus-article.json) records `claude-opus-5-5`, session `a61d9568-b19e-4c7f-9d6c-dbd95e70e8bd`, 89.799 s elapsed, and zero tools used. The independent outline gives a clear install/frame sequence and makes the different evidence claims explicit.

### What did not work

The abstract writing research assumed a generic ELF relocation table and a mark encoded in the board cell. I checked those assumptions against our implementation. Chess uses a separate rank mask. The closed painter uses a relative entry jump and local relative calls inside the loader-placed section. I anchored the project report in those actual details.

### What I learned

Showing exact record words for one square explains the meaning of command equivalence before presenting a result count. The report introduces capacities and fonts at the places they affect that square or the surrounding content.

### What was tricky to build

The canvas-relative operations from the existing renderer have a second offset to reach the compositor's body-relative records. I checked the screen tree values against the typed formulas and then added the physical display offset exactly once in the exposition.

### What warrants a second pair of eyes

Check the worked example against `opening/009 up` in the host replay and verify the article's claims about placement against the slot and loader code.

### What should be done in the future

Record the physical validation under the same evidence boundaries when the device run completes.

### Code review instructions

Regenerate the replay and inspect the line identified by `opening/009 up` in `control.ndjson` and its corresponding `states.ndjson` row.

### Technical details

The three records have body-relative coordinates `(167,161)`, `(186,180)`, and `(168,162)`. The first renders at display y=183.

## Step 4. Move ELF loading onto an internal DRAM stack

During the integration review I inspected the loader's P4 cache path together with the newly wired worker stack. The worker compiled and relocated on its external PSRAM stack. The loader disables external memory caches during its cache synchronization sequence, and ESP-IDF asserts that the current stack pointer lies in internal DRAM. I moved the ELF load to the existing kernel stack and kept the expensive QuickJS compilation on the worker.

### Prompt context

See Step 1. Compiler split commit 9b7e8c3. The correction keeps the source compilation off the compositor's event path and preserves the transport design.

### What I did

- Read the P4 branch of `esp_elf_arch_flush` in `managed_components/espressif__elf_loader/src/esp_elf_adapter.c` and IDF 5.4.2's `components/spi_flash/cache_utils.c`.
- Split the compiler into `mobile_painter_compile`, which returns an owned `mobile_painter_image`, and `mobile_painter_load`, which consumes it.
- Coordinated the queue ownership transfer and kernel-side load with the director and informed the device operator before physical qualification.

### Why

The kernel task already provides an internal 80 KiB stack. Compiling off-task keeps the UI responsive during the expensive phase. Loading on the kernel stack satisfies the loader's concrete cache requirement while preserving separate diagnostics for both phases.

### What worked

Source and ELF command-stream generation remain covered by the host replay. The new split changes the C ownership and cache synchronization boundary around the image.

### What did not work

Static inspection disqualified the original worker-side load. `spi_flash_disable_interrupts_caches_and_other_cpu` calls `assert(esp_task_stack_is_sane_cache_disabled())`. That helper checks `esp_ptr_in_dram(sp)` or optional internal RTC DRAM. An external PSRAM stack violates that condition even though QuickJS itself can run on it.

### What I learned

Concurrent compiler state and executable publication require different checks. The compiler's own runtime is private. The loader's cache helper is coordinated across CPUs but requires an internal stack on the calling CPU.

### What was tricky to build

The worker still owns the source and scratch compiler runtime. The returned patched ELF stays allocated after both the source and compiler are gone. The queue transfers ownership of that ELF. Only the kernel loader consumes it, and both failure and success free the file bytes.

### What warrants a second pair of eyes

Verify that every queue completion hands any non-null image to exactly one load call and that the result cannot be used before relocation finishes.

### What should be done in the future

Capture the physical install as two timed phases and retain the first following RGB565 frame as an execution witness.

### Code review instructions

Review `mobile_painter_compile` and `mobile_painter_load` alongside the worker and `p4_painter_poll` in `painter_service.c`.

### Technical details

The compiler's JS timing closes before the queue transfer. The relocation timing starts on the kernel task and includes loading the ELF, retrieving the function pointer, and freeing the linked file bytes.
