---
Title: Diary
Ticket: PICOCALC-P4-PORT
Status: active
Topics:
    - embedded
    - esp32-p4
    - picocalc
    - quickjs
    - porting
    - os
DocType: log
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological implementation diary for porting picocalc-os to the PicoCalc ESP32-P4."
LastUpdated: 2026-10-24T03:40:34.253302321-04:00
WhatFor: "Reasoning, failures and evidence behind each step of the port."
WhenToUse: "Resume work, review a commit, or trace why the port looks the way it does."
---

# Diary

Entries are chronological (oldest first). Task IDs refer to `tasks.md`.

## Step 1: Study picocalc-os and prior ESP32-P4 work; write the guide

The goal of this step was to understand picocalc-os well enough to port it, and to write that
understanding down for an intern. I read every C file of the nucleus, the simulator, the host runner,
the prelude and all JavaScript worlds. Then I read the earlier ESP32-P4 PicoCalc projects (0097, 0099,
0101) and the go-go-parc writeups the user pointed to. The result is the design doc
`design-doc/01-picocalc-os-on-the-esp32-p4-analysis-design-and-implementation-guide.md`, which was
uploaded to reMarkable.

The central finding is that the nucleus already touches the board in only a few places: three bus back
ends in `hw.c`, the virtual clock in `kernel.c`, the glibc allocator in `vm.c`, and `fopen`. Bus effects
are already asynchronous promises settled through events. A small port seam is therefore enough, and
the same nucleus can serve both builds.

### Prompt Context

**User prompt (verbatim):** "I plugged in my picocal esp32-p4, and I downloaded picocalc-os from the web where we tested it in an emulator. Study it, create a new docmgr to port it to the actual hardware, and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

Then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"

Follow-up (verbatim, mid-step): "you can look for previous esp32-p4 work in /home/manuel/workspaces/2025-12-21/echo-base-documentation/esp32-s3-m5 and also in ~/code/wesen/go-go-golems/go-go-parc for writeups, if you want."

**Assistant interpretation:** Create a docmgr ticket and an intern-level design guide (uploaded to
reMarkable), then implement the port to the real ESP32-P4 PicoCalc with commits and a detailed
investigation-mode diary.

**Inferred user intent:** Get picocalc-os from emulator to working hardware, with documentation good
enough that someone new can maintain it.

### What I did

- Read `picocalc-os/README.md`, `Makefile`, `nucleus/*.c|h`, `sim/*.c`, `host/main_host.c`,
  `js/prelude.js`, `js/system.json`, all of `js/drivers`, `js/system`, `js/apps`.
- Confirmed the host build reproduces the committed screenshots:
  `make -j8 && make shots && git status --short` showed only `build/` and `out/uart.log` as untracked.
  Every `out/*.png` was byte-identical. (My first md5 comparison looked different only because the
  file names in the two listings had different path prefixes.)
- Hardware present: `/dev/ttyACM0` = `usb-1a86_USB_Single_Serial_5B61091051-if00` (CH343, the P4
  console, same id as the 0099 README), `/dev/ttyUSB0` = a CH340 (not the P4 console).
- ESP-IDF trees exist under `~/esp/`. `esp-idf-5.4.2` is the one earlier P4 projects used.
- Read `esp32-s3-m5/0099-*` (pins, SPLL SPI clock, keyboard sequence, RST timing), `0101-*` (QuickJS
  under ESP-IDF, 32 KiB stack lesson, 133/31 ms benchmark), `components/quickjs_native` (the
  `malloc_usable_size` shim, the `ESP_PLATFORM` timezone patch).
- Read go-go-parc: "ESP32-P4-WIFI6 as PicoCalc MCU" (chip v1.3, CH343 console, serial ownership,
  reset-and-capture via DTR/RTS) and "PicoCalc Keyboard Reset and I2C Recovery" (register 0x08 is
  dangerous; quiet-bus recovery).
- Created ticket `PICOCALC-P4-PORT`, vocabulary topics, the design doc and this diary. Uploaded the
  guide: `OK: uploaded PICOCALC-P4-PORT picocalc-os on ESP32-P4 guide.pdf -> /ai/2026/10/24/PICOCALC-P4-PORT`.

### Why

- A port seam rather than a fork (decision 7.1), because the host build is the only deterministic
  regression harness, and pixel-identical screenshots are a strong refactoring oracle.
- Real time on the device (7.2), and worker tasks for buses (7.3), because the simulator models the
  buses as running in parallel with the lane. Synchronous transfers on the kernel task would contradict
  that and would cost about a third of the lane in keyboard polling alone.

### What worked

- The determinism of the host build: `make shots` is a byte-exact gate.

### What didn't work

- N/A in this step.

### What I learned

- This repo's QuickJS lacks the `ESP_PLATFORM` branch for `getTimezoneOffset`
  (`third_party/quickjs/quickjs.c:49893-49899` uses `tm.tm_gmtoff`, which newlib lacks). A third patch
  is needed.
- QuickJS records `stack_top` at `JS_NewRuntime` and the limit is `stack_top - max_stack_size`, so
  the device's JS stack limit must be below the kernel task's stack size minus the depth at which
  runtimes are created.
- ESP-IDF's `malloc` with `CONFIG_SPIRAM_USE_MALLOC` puts allocations under 16 KB in internal RAM. A
  JS heap is mostly small blocks, so world heaps must use `heap_caps_malloc(..., MALLOC_CAP_SPIRAM)`
  explicitly, or they would exhaust internal RAM.

### What was tricky to build

- Nothing built yet. The subtle analysis point was proving that the front framebuffer is not written
  while a flush reads it. The compositor's `draw` handler is async and awaits the flush, and the lane
  never gives an in-turn world a new message (`pick()` checks `!W->in_turn`). The only remaining hazard
  is a world being killed mid-DMA, which reference-pinning the buffer covers.

### What warrants a second pair of eyes

- Decision 7.4 (wall-clock budgets on the device) can make worlds crash on the device that never
  crashed in the simulator. That is intended, but the budgets in `system.json` may need revisiting.

### What should be done in the future

- See the design doc section 12.

### Code review instructions

- Read the design doc sections 3 (orientation) and 6 (architecture).

### Technical details

- Pins: SDA 50, SCL 49, SCK 3, MOSI 2, CS 7, DC 24, RST 25; console UART0 37/38.
- Task IDs: xbul guide, d4pu P0, e8ng P1, 6j46 P2, zmq1 P3, iiv4 P4, hn6q P5.
