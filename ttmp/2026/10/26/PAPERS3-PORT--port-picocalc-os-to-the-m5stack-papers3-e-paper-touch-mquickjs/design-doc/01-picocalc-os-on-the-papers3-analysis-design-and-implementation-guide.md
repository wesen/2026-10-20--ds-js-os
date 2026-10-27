---
Title: 'picocalc-os on the PaperS3: analysis, design and implementation guide'
Ticket: PAPERS3-PORT
Status: active
Topics:
    - embedded
    - esp32-s3
    - papers3
    - mquickjs
    - epaper
    - porting
    - os
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: picocalc-os/nucleus/nucleus.h
      Note: The nucleus contract; the engine and board seams are added here
    - Path: picocalc-os/nucleus/vm.c
      Note: The QuickJS engine binding that the mquickjs backend mirrors
    - Path: picocalc-os/nucleus/kernel.c
      Note: The lane, turns, supervision; engine-neutral after phase 0
    - Path: picocalc-os/js/system/compositor.js
      Note: The PicoCalc compositor that the paper compositor replaces
ExternalSources: []
Summary: "How picocalc-os (a JavaScript OS of supervised worlds) is ported to the M5Stack PaperS3: an engine seam so worlds run on MicroQuickJS, gray framebuffers and proportional fonts, an e-paper display driver with a refresh planner, a GT911 touch driver and a touch-first compositor, a host simulator for the board, and the ESP-IDF port."
LastUpdated: 2026-10-26T19:33:08.721292407-04:00
WhatFor: "Onboarding and implementation reference for the PaperS3 port."
WhenToUse: "Before changing the nucleus seams, the paper JS tree, the PaperS3 simulator or the ESP32-S3 port."
---

# picocalc-os on the PaperS3: analysis, design and implementation guide

*Ticket PAPERS3-PORT. Written for an engineer who has not seen picocalc-os, MicroQuickJS or the PaperS3
before. Section 3 explains what the system is; sections 4–5 say what has to change and why; section 6
is the design; sections 7–13 are decisions, flows, the plan, tests, risks and the API reference.
Section 15 records what was built and measured, and is updated as the work goes on.*

## 1. Executive summary

picocalc-os is a small operating system written mostly in JavaScript. A C *nucleus* runs many
isolated JavaScript programs, called *worlds*, one at a time on a single *lane*. Each world has its
own heap limit and time budget. Worlds talk only by messages, hold hardware only through checked
*handles*, and are restarted by the nucleus when they crash. Drivers, the compositor and apps are
all worlds. It already runs on Linux against a simulated PicoCalc and on a real PicoCalc with an
ESP32-P4.

This ticket ports it to the **M5Stack PaperS3**: an ESP32-S3 with 8 MB of PSRAM, a 4.7" 960×540
16-gray e-paper panel driven directly over a parallel bus, a GT911 capacitive touch screen, a BM8563
real-time clock, a battery ADC and **no keyboard**. The port changes four things at once:

1. **The JavaScript engine.** Worlds move from QuickJS to **MicroQuickJS** (mquickjs). Each world
   gets one fixed memory arena, so the per-world heap limit comes free. Contexts are created in about
   0.6 ms, and earlier PaperS3 work (PULP OS, `esp32-s3-m5/0114`) already runs it there. The price is
   the dialect: mquickjs is strict ES5, with no `let`, no arrow functions, no classes, no template
   strings, no Promise and no async. The nucleus therefore gets an **engine seam**, and the PaperS3
   build gets its own ES5 prelude, which implements the turn-and-promise model in plain JavaScript.
2. **Pixels.** Framebuffers become 8-bit gray. The panel shows 16 levels, and its refresh modes
   trade gray depth for speed. The `gfx` primitives learn proportional, anti-aliased fonts made from
   open TTFs.
3. **The screen pipeline.** An e-paper refresh is slow and leaves ghosts, so the display driver
   becomes a **refresh planner**. It merges damaged rectangles, chooses a waveform mode for each
   update, counts partial updates, and schedules a clean full refresh before ghosting builds up. The
   waveforms themselves stay in C (M5GFX `Panel_EPD`).
4. **Input.** A JavaScript GT911 driver polls the touch controller over I2C and publishes touch
   points. The compositor turns them into taps, long presses and swipes, and delivers them to the
   ui node under the finger. The keyboard-first UI becomes a touch-first, paper-style UI. An
   on-screen keyboard is drawn for the REPL.

The PicoCalc build stays as it is and keeps its byte-identical screenshot gate. The PaperS3 gets a
host build (`make BOARD=papers3`) with a simulated panel, touch controller, RTC and battery, so the
whole system can be run, scripted and captured without the device. The device port lives in
`port/esp32s3-papers3/`.

## 2. Problem statement and scope

**In scope**

- An engine seam in the nucleus: `kernel.c`, `hw.c`, `gfx.c` and `util.c` stop depending on QuickJS
  types, and the QuickJS binding (`vm.c`) and a new mquickjs binding (`vm_mqjs.c`) implement one
  interface.
- MicroQuickJS vendored with the same kind of small patches QuickJS got: an interrupt-counter
  getter, a finer counter, and a stdlib that exposes the nucleus's host calls.
- An ES5 prelude (`js-papers3/prelude.js`) that offers the same world API as the PicoCalc prelude.
  Async handlers return thenables instead of using `async`/`await`.
- 8-bit gray framebuffers; proportional anti-aliased fonts; `gfx.measure` and `gfx.wrap` in C.
- An EPD handle type and `epd.update(fb, rect, mode)`. A JavaScript display driver with a refresh
  planner.
- A GT911 touch driver, a BM8563 clock driver and a battery/charge power driver, all JavaScript
  worlds over I2C and ADC/GPIO handles.
- A touch compositor (layout for 540×960 portrait, hit regions, gestures, chrome, crash banners)
  and the paper apps: launcher, system monitor, REPL with on-screen keyboard and sandbox, faults,
  touch inspector, about, and a sketch pad that exercises the fastest waveform.
- A host simulator of the PaperS3 (EPD glass with modes and ghosting, GT911, BM8563, battery) and
  script commands `tap`, `hold`, `swipe`, `drag`, `capture`.
- The ESP-IDF project for the ESP32-S3: kernel task, I2C and EPD worker tasks, PSRAM arenas, the
  embedded JavaScript tree, and a USB-Serial-JTAG console with `shot`. Plus a host client that
  respects this board's serial quirks.

**Out of scope (deferred, see §12):** Wi-Fi, SD card storage, deep sleep, the IMU and the buzzer,
installing apps without reflashing, and bytecode precompilation of worlds.

## 3. Orientation: what picocalc-os is

### 3.1 The big picture

```
            ┌──────────────────────────── worlds (JavaScript, one engine context each) ─────────────────────────────┐
            │  drivers:  touch.js   display.js   clock.js   power.js                                                 │
            │  services: compositor.js   sandbox.js   flaky.js                                                        │
            │  apps:     launcher  system  repl  faults  touch  about  sketch                                         │
            └───────▲───────────────────────▲────────────────────────▲───────────────────────────▲──────────────────┘
                    │ __k / __ka host calls │ messages, channels     │ handles (i2c, epd, adc,    │ frames (ui trees)
                    │                       │                        │ gpio, framebuffers)        │
            ┌───────┴───────────────────────┴────────────────────────┴───────────────────────────┴──────────────────┐
            │ nucleus (C): kernel.c lane + clock + supervision · vm_*.c engine binding · hw.c handles · gfx.c pixels  │
            └───────▲───────────────────────────────────────────────────────────────────────────────────▲───────────┘
                    │ port API (nucleus.h, end)                                                         │
       ┌────────────┴─────────────┐                                                       ┌─────────────┴──────────────┐
       │ host: sim/papers3/*.c    │  virtual clock, simulated GT911/BM8563/EPD/battery     │ device: port/esp32s3-papers3│
       │ host/main_host.c scripts │                                                       │ real clock, worker tasks    │
       └──────────────────────────┘                                                       └─────────────────────────────┘
```

**Nucleus.** The nucleus is about 2,100 lines of C. It owns the engine contexts, a clock and event
queue, mailboxes and channels, the hardware handles, and pixel primitives. Everything with policy in
it is JavaScript.

**Worlds.** A world is one JavaScript file plus the prelude, run in its own engine context. The
manifest (`system.json`) says which worlds exist and gives each one its *claims* (what hardware or
privileges it may ask for), a turn *budget* in milliseconds and a heap limit in KB. A world is
declared with a builder:

```js
// PicoCalc dialect (QuickJS, ES2020)                        // PaperS3 dialect (mquickjs, ES5)
app("snake").title("Snake").state({ score: 0 })             app("snake").title("Snake").state({ score: 0 })
  .on("key", (s, k) => { ... })                               .on("tap", function (s, t) { ... })
  .every(110, (s) => { ... })                                 .every(110, function (s) { ... })
  .screen((s) => ui.col(ui.text(`score ${s.score}`)));        .screen(function (s) { return ui.col(ui.text("score " + s.score)); });
```

**The lane, turns and segments.** There is one lane of execution. A world runs when it has a
message and the lane is free. The lane takes runnable worlds by priority (drivers 3, services 2,
apps 1, the sandbox 0), then in arrival order (`kernel.c:pick`). A **turn** is one message handled
to completion. If the handler returns a promise, the turn lasts until that promise settles. Each
stretch of execution inside a turn is a **segment**. While a world is in a turn it receives no new
messages; only settlements of its own promises run as further segments.

**Deferred effects.** Messages, channel posts, replies and bus transfers that a segment issues are
collected and applied when the segment ends (`kernel.c:defer`, `apply_deferred`). A segment that
crashes is discarded with all its effects.

**Supervision.** A world that throws, overruns its budget or runs out of heap is torn down. Its
handles are dropped, and it is restarted after 100 ms, with the delay doubling up to 2 s. After five
crashes in ten seconds it stays stopped until a world with `sys.admin` restarts it. Every change is
published on `worlds.status`, and every crash is written as a `#OCT1 {json}` line to the console UART.

**Handles.** A world asks for hardware by claim, for example `hw.i2c("i2c0:0x1f")`, and gets a
handle only if the manifest grants that claim. A handle is an id the kernel checks on every use. It
can be narrowed to fewer rights (`fb.narrow("r")`), sent inside a message, and revoked by the world
that narrowed it (`hw.c`).

**The screen pipeline.** Apps never draw. An app's `screen(state)` returns a tree of plain ui
objects. After every turn in which the tree changed, the nucleus publishes it on the `frames`
channel (`kernel.c:run_segment`). The compositor then:

1. lays out the focused app's tree with its own chrome into the back buffer;
2. calls `fb.commit()`, which diffs the back buffer against the front buffer and returns the changed
   rectangles (`gfx.c:gfx_commit`);
3. asks the display driver to send those rectangles to the panel.

**Two clocks.** On the host, time is *virtual*. A segment costs a fixed entry cost, plus its
JavaScript work counted exactly by the engine's interrupt counter, plus the cost of its host calls.
Bus transfers take the time their bits take on the wire. A script therefore replays identically, and
the screenshots are a byte-exact regression oracle. On the device the clock is real: a segment costs
what it took, and budgets are wall-clock deadlines (`vm.c:on_interrupt`).

### 3.2 The source tree today

```
picocalc-os/
  nucleus/   kernel.c (635) vm.c (754, QuickJS) hw.c (170) gfx.c (159) util.c png.c nucleus.h font_data.h
  sim/       st7365p.c stm32kbd.c bus_sim.c board.c          the simulated PicoCalc
  host/      main_host.c (scripts, capture) port_host.c
  port/esp32p4/main/  port_p4.c bus_p4.c main_p4.c          the ESP32-P4 device build
  js/        prelude.js system.json drivers/ system/ apps/   the PicoCalc's worlds (ES2020)
  third_party/quickjs  tools/gen_font.py tools/p4cap.py scripts/*.txt out/*.png
```

The port API at the end of `nucleus/nucleus.h` is the line between portable and board code:
`port_clock`, `port_heap_*`, `port_big_*`, `port_js_stack`, `port_read_file`, `port_board_name`,
and the bus back ends `bus_run_i2c`, `bus_run_spi_cmd`, `bus_run_spi_pixels`.

### 3.3 The PaperS3

Facts from the earlier PaperS3 projects in `~/code/wesen/go-go-golems/esp32-s3-m5` (paths relative to it):

| Part | What it is | Where it is wired | Source |
|---|---|---|---|
| SoC | ESP32-S3R8, 2× Xtensa LX7 at 240 MHz, 512 KB SRAM | | vendor spec (`ttmp/2026/07/14/ESP-50-*/sources/web/01-*.md`) |
| Memory | 8 MB octal PSRAM (`CONFIG_SPIRAM_MODE_OCT`), 16 MB flash | | every PaperS3 sdkconfig |
| Panel | ED047TC1, 4.7", 960×540 physical, 16 grays, no controller chip | 8-bit parallel via LCD_CAM: D0..7 = G6,14,7,12,9,11,8,10; XSTL 13, XLE 15, SPV 17, CKV 18, XCL 16, XOE 45, PWR 46, SYSPWR 44 | `M5GFX.cpp:1972-2003` in 0114's managed M5GFX |
| Touch | GT911, 2 points, raw range 540×960 | I2C1 SDA 41, SCL 42, 400 kHz, address 0x5D or 0x14, INT 48 (unused) | `M5GFX.cpp:2010-2026` |
| RTC | BM8563 | same I2C1, address 0x51 | vendor spec |
| IMU | BMI270 | I2C1, 0x68 | vendor spec |
| Battery | 1800 mAh, LGS4056H charger | ADC1 ch2 on G3 (÷2 divider), charge status G4 (0 = charging), USB detect G5 | `0109*/main/hal/hal.cpp:86-133` |
| Buzzer | passive | G21 (LEDC) | `0109*/main/hal/hal.cpp:389` |
| microSD | SPI | CS 47, SCK 39, MOSI 38, MISO 40 | vendor spec |
| Button | one side button, handled by the PMS150G power latch, not readable by apps | | `components/s3paper_m5` |
| USB | native USB-Serial/JTAG, `303a:1001` | `/dev/serial/by-id/usb-Espressif_USB_JTAG_serial_debug_unit_D0:CF:13:16:17:DC-if00` | 0114 README |

**Refresh modes.** M5GFX exposes four waveform modes. All the timings recorded on this board measure
the software side, not ink physics (`ESP-50/reference/03:337,362-368`):

| `epd_mode_t` | Grays | Use | Recorded software time per update (0112 soak, avg) |
|---|---|---|---|
| `epd_quality` | 16 | clean full screens, images | 8.9 ms (+ about 243 ms panel work for a clean full, ESP-51 log) |
| `epd_text` | 16 (anti-aliased text) | text pages | 40.0 ms |
| `epd_fast` | thresholded to black/white | text regions, small updates | 4.5 ms |
| `epd_fastest` | black/white, more ghosting | ink, pen strokes | 2.8 ms |

The panel itself takes roughly a second to settle after a quality refresh. Fast modes leave
*ghosts*, faint traces of earlier content. A periodic clean full refresh clears them. PULP OS ran a
clean full every 16–64 partial updates (`components/s3paper_core/include/s3paper/refresh_planner.h:22-53`).
The panel's optical quality was never qualified, and the investigation is paused. Blacks look weak in
every mode (`ESP-50/design-doc/02 §5.2, §8.2`). This port does not reopen that work.

**The serial console has two traps** (0114 README:22-37, ESP-55 reference/01:540-580):

1. On this host's kernel (6.8, `cdc_acm`), merely *opening* `/dev/ttyACM0` asserts DTR and RTS. The
   resulting edges can latch the ESP32-S3 into ROM download mode, and the app then looks dead. The
   fingerprint is `rst:0x15 (USB_UART_CHIP_RESET), boot:0x0 (DOWNLOAD)`. The fix is a client that
   opens the port once, goes through DTR=RTS=0, pulses RTS for reset, and then keeps the descriptor
   open (`ttmp/2026/08/17/ESP-55-*/scripts/04-papers3-console-hold.py`).
2. USB-Serial-JTAG drops output when no reader is attached, and the device re-enumerates on every
   reset. The device also has a known flaky connection: it dropped off USB mid-flash in ESP-57.

### 3.4 MicroQuickJS

MicroQuickJS (`bellard/mquickjs`, vendored at `esp32-s3-m5/imports/esp32-mqjs-repl/.../components/mquickjs`)
is Fabrice Bellard's small JavaScript engine for microcontrollers. Five properties matter here:

- **One fixed arena per context.** `JS_NewContext(mem, size, &stdlib)` takes a caller-owned block.
  The engine never calls `malloc`, and running out of the arena throws `InternalError: out of
  memory`, which leaves the context usable. That is exactly a world's heap limit.
- **A compacting garbage collector.** Values move. C code may keep a `JSValue` across an allocating
  call only through `JS_PushGCRef`/`JS_AddGCRef`. There is no `JS_FreeValue`, and no reference
  counting to get wrong.
- **A compiled-in standard library.** The global object, its classes and its C functions are
  described in a C table (`mqjs_stdlib.c`). A *host* tool (`mquickjs_build.c`) turns that table into
  a ROM header. Exposing a C function means adding it to that table and regenerating the header, which
  is specific to the word size (`-m32` for the device).
- **Calling convention.** Calls go through a value stack: `JS_StackCheck`, `JS_PushArg` for the
  arguments in reverse order, then the function, then `this`, then `JS_Call(ctx, argc)`.
- **The dialect.** Probed on the host for this ticket (scratch build of the vendored copy) and on the
  device in 0113 (`ESP-50/design-doc/05:93-104`):

| Works | Fails |
|---|---|
| `var`, closures, prototypes, `new`, `instanceof`, `arguments` | `let`, `const`, `=>`, `class`, template strings, spread, rest, destructuring, default parameters (SyntaxError) |
| `for…in`, `for…of` over arrays, `switch`, labeled loops, try/catch/finally | `??`, `?.`, shorthand and computed keys, getters in literals (parse, but silently are plain functions) |
| JSON.parse/stringify (no replacer or reviver; both are ignored) | Promise, async/await, generators, Map, Set, WeakMap |
| Array: map, filter, reduce, some, every, indexOf, slice, splice, sort, push, unshift, join, isArray | Array.from, find, findIndex, includes, flat |
| String: split, indexOf, slice, substring, charCodeAt, replace (string and /g), trim, toUpperCase | padStart, repeat, startsWith, endsWith |
| Object.keys, create, defineProperty, getPrototypeOf; Function bind/call/apply | Object.assign, Object.entries, Object.freeze |
| Math (incl. random, assignable), RegExp, typed arrays, indirect `(0, eval)(src)` | `new Date(...)` (only `Date.now()`), direct `eval` |
| errors with `name`/`message` | `e.stack` is an empty string (the engine prints a backtrace through its log function instead) |
| | writing to an array hole (`a = []; a[10] = 1`) throws; assigning an undeclared global throws |

For this OS the missing Promise matters most. Async turns, `ask()`, `sleep()` and every bus
transfer are promise-shaped in the PicoCalc build. §6.3 shows how an ES5 prelude keeps that shape.

## 4. Current-state analysis: what assumes the PicoCalc or QuickJS

| Assumption | Where | Why it breaks on the PaperS3 |
|---|---|---|
| `JSRuntime *`, `JSContext *`, `JSValue` fields in `world_t`, `quickjs.h` included by every nucleus file | `nucleus.h:12,56-108` | mquickjs has different, incompatible types under the same names |
| The manifest is parsed with `JS_ParseJSON` | `kernel.c:kernel_boot` | engine-specific |
| Host calls, promises (`JS_NewPromiseCapability`), job queue (`JS_ExecutePendingJob`), rejection tracker | `vm.c` throughout | mquickjs has no promises or job queue |
| Interrupt-counter getters (patched QuickJS) | `vm.c:56-66`, `third_party/quickjs/PATCHES` | need an equivalent patch in mquickjs |
| RGB565 `uint16_t` framebuffers, RGB blending, `0x0821` sentinel | `nucleus.h:dmabuf_t`, `gfx.c`, `hw.c:dmabuf_alloc` | the panel is 16-level gray; 2 bytes per pixel doubles PSRAM traffic |
| Monospace bitmap fonts (`font_def_t {name,w,h,data}`), text width = n × cell width, and the compositor computes widths in JS the same way | `font_data.h`, `gfx.c:gfx_text`, `compositor.js:len*fw` | at 235 dpi, an 8×16 cell is 1.7 mm tall; readable paper text wants proportional anti-aliased faces |
| `hw.i2c` accepts only `i2c0:*`; `hw.spi` only `spi2`; buses `BUS_I2C0`, `BUS_SPI2` | `vm.c:op_hw_i2c/op_hw_spi`, `nucleus.h:bus_t` | the PaperS3 has I2C1 (touch, RTC, IMU), an EPD bus, an ADC and GPIOs |
| A keyboard on the STM32 at I2C 0x1F; `keys` channel; F1 is home | `js/drivers/keyboard.js`, `compositor.js` | there is no keyboard; input is touch |
| 320×320 screen, status bar 22 px, hint bar 18 px, focus by keys | `compositor.js:1-5` | 540×960 portrait, finger-sized targets (≥ 72 px), no focus ring |
| A flush is `CASET/RASET/RAMWR` + pixels over SPI at 40 MHz, taking milliseconds | `js/drivers/display.js` | an e-paper update takes hundreds of milliseconds and the mode matters |
| `Date` is a virtual subclass with `new Date()` | `js/prelude.js:16-25` | mquickjs has only `Date.now()`; the RTC gives real time on the device |

What carries over unchanged: the event queue, lane, turns, deferred effects, supervision, asks
and timeouts, channels, the handle table and its rights, `gfx_commit`'s band diff, the host's
script runner, the console protocol (`#OCT1`, `#SHOT`), and the device port's architecture (a kernel
task plus bus worker tasks feeding one queue).

## 5. Gap analysis

| Need | Gap | Closed by |
|---|---|---|
| Run worlds on mquickjs | no engine seam; no mquickjs binding | §6.1, §6.2 (phase 0, 1) |
| Async turns without Promise | no promise machinery in ES5 | §6.3 prelude thenables (phase 1) |
| Gray pixels, readable text | RGB565 and monospace only | §6.4 (phase 2) |
| E-paper refresh and ghost control | no EPD handle or policy | §6.5 (phase 2–3) |
| Touch input | no touch driver, gestures or hit testing | §6.6, §6.8 (phase 3) |
| Wall-clock time | no RTC driver | §6.7 (phase 3) |
| Battery | no ADC/GPIO handles | §6.7 (phase 3) |
| Paper UI | PicoCalc compositor and apps are keyboard/320 px | §6.8, §6.9 (phase 3) |
| Simulate the board | sim is PicoCalc-only | §6.10 (phase 2–3) |
| Device | no ESP32-S3 port | §6.11 (phase 4) |

## 6. Proposed architecture

### 6.1 Boards and the engine seam

A **board** is a build configuration made of four things:

- an engine binding (`vm.c` for QuickJS, `vm_mqjs.c` for mquickjs);
- a pixel format (RGB565 or gray8);
- a JavaScript tree (`js/`, `js-papers3/`);
- a simulator (host) or port (device).

```
                 BOARD=picocalc (default)                    BOARD=papers3
engine           nucleus/vm.c + third_party/quickjs          nucleus/vm_mqjs.c + third_party/mquickjs
pixels           RGB565 (NUCLEUS_GRAY8 undefined)             gray8 (-DNUCLEUS_GRAY8)
fonts            nucleus/font_data.h (Terminus cells)         nucleus/font_paper.h (Charis, Liberation, DejaVu Mono)
js tree          js/ (ES2020)                                 js-papers3/ (ES5)
host sim         sim/{st7365p,stm32kbd,bus_sim,board}.c       sim/papers3/{epd,gt911,bm8563,bus,board}.c
device port      port/esp32p4/                                port/esp32s3-papers3/
host binary      build/picocalc-host                          build-papers3/papers3-host
```

The nucleus stops including `quickjs.h`. `world_t` loses its engine fields (`rt`, `ctx`,
`fn_dispatch`, `fn_render`, `pend`, `unhandled`) and gains one opaque pointer, `struct vmw *vm`.
Each binding defines `struct vmw` privately. `kernel.c` checks `W->vm` where it used to check
`W->ctx`. The manifest is parsed by the binding (`vm_read_manifest`), because each engine has its
own JSON parser. Everything else in `kernel.c` and `hw.c` is already engine-neutral.

```c
// nucleus.h — the engine interface each binding implements (vm.c, vm_mqjs.c)
struct vmw;                                    // the binding's per-world state
int     vm_create(world_t *W);                 // a context, the prelude, the world's file, __init → meta
void    vm_dispose(world_t *W);
void    vm_begin_segment(world_t *W, vtime_t budget_us);
int64_t vm_steps(world_t *W);                  // interrupt-counter steps since vm_begin_segment
int     vm_dispatch(world_t *W, msg_t *m);     // 0, or -1 with W->last_error set
int     vm_settle(world_t *W, settle_t *s);
char   *vm_render(world_t *W);                 // the frame JSON, malloc'ed, or NULL
void    vm_calibrate(void);
int     vm_read_manifest(const char *json, size_t n, void (*world)(void *arg, const manifest_world_t *w), void *arg);
const char *vm_engine_name(void);              // "quickjs 2026-06-04", "mquickjs 84d793e0"
```

The PicoCalc gate stays. After the seam, `make && make shots` must still produce byte-identical
`out/*.png`.

### 6.2 The mquickjs binding (`nucleus/vm_mqjs.c`)

**Arenas.** `vm_create` allocates the world's arena with `port_heap_malloc(mem_limit × mem_scale)`
and calls `JS_NewContext(arena, size, &js_stdlib)`. On the host (64-bit `JSValue`) `mem_scale` is
measured, as it was for QuickJS. `mem_used` comes from the engine's own memory statistics after each
segment. Out of memory is the exception `InternalError: out of memory`, which the binding maps to
`W->oom` and the existing "ran out of memory" crash. There is no allocator hook to account through:
the arena *is* the limit.

**Host calls.** The stdlib table (`third_party/mquickjs/paper_stdlib.c`) is the stock
`mqjs_stdlib.c` global object minus `load`, `setTimeout`, `clearTimeout` and `gc`, plus two C
functions: `__k(op, ...)` for operations that finish now and `__ka(op, ...)` for operations that
finish later. Unlike QuickJS, `__ka` does not return a promise. It returns a **promise id**, an
integer. The prelude maps that id to a thenable and resolves it when the kernel later calls
`__settle(id, ok, json)` (§6.3). The C side keeps no JS function references at all, so the moving
GC never surprises it.

```
C → JS entry points (globals defined by the prelude, looked up by name each call)
  __init()                      → meta object   (needs, provides, every, start, screen, kind, title)
  __dispatch(kind, type, json, from, isAsk) → reply JSON string or undefined; calls __k("turn.async") for async turns
  __settle(id, ok, json)        → resolves or rejects the thenable for promise id, then drains callbacks
  __render()                    → frame JSON string or null
JS → C  (C functions in the stdlib table)
  __k(op, ...)                  synchronous ops: now, send, publish, log, turn.*, hw.*, h.*, gfx.*, epd.info, adc.read, gpio.get, sys.*
  __ka(op, ...)                 → promise id: sleep, ask, i2c, epd.update
```

**Budgets and step counting.** Patch the engine the way QuickJS was patched. Set
`JS_INTERRUPT_COUNTER_INIT` to 1000, and add `JS_GetInterruptCounter(ctx)` and
`JS_GetInterruptCounterInit()`. The interrupt handler is the same function as in `vm.c`: it counts
calls, enforces the virtual budget on the host and the wall-clock deadline on the device, and stops
the world on overrun (the engine throws `InternalError: interrupted`).

**Errors.** `e.stack` is empty in mquickjs, but the engine prints a backtrace when it prints an error
value. The binding sets `JS_SetLogFunc` to write into a per-call buffer, and calls
`JS_PrintValueF(ctx, exc, JS_DUMP_LONG)` to get `TypeError: … at f (file:line)`. That string becomes
`last_error` and the fault frame's `detail`, so `#OCT1` frames look the same on both engines.

**Calibration.** The step-cost model needs a measurement of mquickjs on the ESP32-S3. Until the
device run (phase 5) the papers3 profile carries an estimate, and the About app says so.

### 6.3 The ES5 prelude and thenables

The prelude (`js-papers3/prelude.js`) defines the same globals as the PicoCalc prelude: `app`,
`driver`, `service`, `send`, `ask`, `publish`, `sleep`, `now`, `log`, `hw`, `dma`, `gfx`, `sys` and
`ui`. All of it is written in ES5. Asynchrony becomes a small **Task**, a thenable with `then`,
`catch` and `Task.all`. It is about 80 lines and implements just the parts of Promises/A+ the OS
uses:

```js
// js-papers3/prelude.js (sketch)
var pending = {};                 // promise id → Task; an object, not an array (no holes)
var queue = [];                   // callbacks to run before the segment ends (the "microtask" queue)
function Task() { this.state = 0; this.value = undefined; this.cbs = []; }
Task.prototype.then = function (ok, bad) { var t = new Task(); this.cbs.push([ok, bad, t]); if (this.state) schedule(this); return t; };
Task.prototype.catch = function (bad) { return this.then(null, bad); };
function settle(t, state, v) {
  if (t.state) return;
  if (state === 1 && v && typeof v.then === "function") { v.then(function (x) { settle(t, 1, x); }, function (e) { settle(t, 2, e); }); return; }
  t.state = state; t.value = v; schedule(t);
}
function drain() { while (queue.length) { var t = queue.shift(); run(t); } }   // run every callback of every settled task
g.__settle = function (id, ok, json) { var t = pending[id]; delete pending[id]; if (t) settle(t, ok ? 1 : 2, ok ? decode(json) : new Error(json)); drain(); };
function kernelTask(id) { var t = new Task(); pending[id] = t; return t; }
g.sleep = function (ms) { return kernelTask(ka("sleep", ms)); };
g.ask = function (to, type, payload, opts) { var e = enc(payload); return kernelTask(ka("ask", to, type, e[0], e[1], (opts && opts.timeout) || 2000)); };
```

`__dispatch` calls the handler. If the result is a thenable, it marks the turn async
(`k("turn.async")`) and attaches `turn.done` / `turn.fail` to it, exactly as the PicoCalc prelude
does with a promise. It then calls `drain()` before returning, so callbacks that are already ready
run in the same segment. That matches QuickJS, where `run_jobs` drains the job queue at the end of
every segment. An unhandled rejection (a Task that failed with no `bad` callback by the end of the
drain) is logged, as `vm.c:drop_unhandled` does.

What changes for world authors is syntax only:

```js
// PicoCalc                                         // PaperS3
.on("flush", async (s, { rects }) => {             .on("update", function (s, m) {
  await s.epd.update(s.fb, r, "fast");                return s.epd.update(s.fb, m.rect, m.mode).then(function (r) {
  s.updates++;                                          s.updates++;
  return { ms: now() - t0 };                            return { ms: now() - t0 };
})                                                    });
                                                    })
```

Sequential awaits become `.then` chains. The prelude also provides `seq(list, fn)` (run async steps
one after another) because driver start-up sequences need it. It also provides small helpers the
dialect lacks: `assign`, `pad2`, `repeat`, `startsWith`, `clockText(ms)`.

**Handles in messages.** JSON in mquickjs ignores replacers and revivers, so the prelude's `enc` and
`decode` walk the value themselves. They collect `{ $h: id }` markers for the kernel and turn them
back into `Handle` objects.

### 6.4 Gray pixels and proportional fonts

With `-DNUCLEUS_GRAY8`, `pixel_t` is `uint8_t`, where 0 is black and 255 is white. The changes:

- `gfx_color("#rrggbb")` returns the luminance `(299r + 587g + 114b)/1000`. Named grays are the
  compositor's business.
- `blend()` works on one channel.
- `dmabuf_t` keeps `back` and `front`, now `pixel_t *`. Framebuffers are 518 KB each for 540×960, and
  both live in PSRAM.
- The "never drawn" sentinel becomes `0x01`.
- `gfx_commit` is unchanged apart from the element size. It still reports 16-row bands, merged.

Fonts get one optional field: `font_def_t { name, w, h, data, adv, asc }`, where `adv` is NULL for
monospace and otherwise a per-glyph advance table. A new generator, `tools/gen_paper_font.py`,
rasterizes TTFs with PIL into the same 4-bit alpha cells, with real anti-aliasing (levels 0..15). It
writes `nucleus/font_paper.h`. The faces are Charis SIL (OFL) for body text, Liberation Sans Bold
(OFL) for titles and numerals, and DejaVu Sans Mono for tables and the REPL:

| name | face | px | use |
|---|---|---|---|
| `s` | Charis SIL | 20 | captions, secondary text |
| `m` | Charis SIL | 26 | body text, list rows |
| `mb` | Charis SIL Bold | 26 | emphasis, buttons |
| `l` | Liberation Sans Bold | 36 | titles |
| `xl` | Liberation Sans Bold | 64 | hero numerals (clock, battery) |
| `mono` | DejaVu Sans Mono | 20 | tables, REPL, logs |

Because text is proportional, the compositor must not compute widths in JS. Two synchronous host calls
do the measuring in C:

```
gfx.measure(text, font)            → width in pixels
gfx.wrap(text, font, maxWidth)     → [line, line, …]   (word wrap, long words broken)
```

### 6.5 The e-paper display: the EPD handle and the refresh planner

The waveform engine is C, because its timing is microseconds on a parallel bus. The *policy* is
JavaScript, in the display driver world. They meet at one handle type:

```
hw.epd("epd0")                               → handle (claim "epd0"); one per panel
epd.info()                                   → { w: 540, h: 960, modes: ["quality","text","fast","fastest"] }
epd.update(fb, x, y, w, h, mode)             → Task; settles when the panel has taken the update
                                               (the bus "epd0" is busy meanwhile; updates are serialised)
```

On the device, `epd.update` becomes a request to the EPD worker task. The worker waits for
`displayBusy()` to clear (bounded to 5 s, as PULP does), sets the mode, pushes the rectangle's gray
rows from the framebuffer's front buffer (pinned while in flight), calls `endWrite()`, waits again,
and posts the result. On the host, the simulated panel applies the mode's effect to its *glass* and
the bus is busy for the mode's modelled duration (§6.10).

The **display driver** (`js-papers3/drivers/display.js`) is the refresh planner. The compositor asks
it to `present` a list of damaged rectangles together with an *intent*:

- `"page"`: a new screen. The app changed, or a dialog opened or closed.
- `"text"`: content changed inside a screen.
- `"ink"`: pen strokes or a pressed-button highlight; latency matters most.

The planner turns that into `epd.update` calls:

```
present(rects, intent):
  if intent == "page" or partials ≥ MAX_PARTIALS or partialArea ≥ MAX_AREA or now − lastClean ≥ MAX_AGE:
      update(full screen, "quality"); partials = 0; partialArea = 0; lastClean = now      // clean full: clears ghosts
  else:
      rects = merge(rects, distance = 16 px); align x to 8 px                              // fewer, bigger updates
      mode  = intent == "ink" ? "fastest" : intent == "text" ? (anyGray(rects) ? "text" : "fast")
      for r in rects: update(r, mode); partials += 1; partialArea += area(r)
```

The constants start at PULP's values (`refresh_planner.h:22-53`): 16-pixel merges, 8-pixel x
alignment, a clean full after 32 partials or 16 screens' worth of partial area or 15 minutes. They
live in the driver's state and are shown in the System app. A world with the `display.policy` claim
can change them, as PULP's `paper.refreshTurns(n)` did.

### 6.6 Touch: the GT911 driver

`js-papers3/drivers/touch.js` is a driver world with the claim `i2c1:0x5d`. The GT911 uses 16-bit
big-endian register addresses, so a register read is one write-then-read transaction:
`dev.transfer([0x81, 0x4e], 1)`. Every 20 ms the driver does the following:

```
status = read(0x814E)                               // bit 7: buffer ready; bits 0..3: number of points
if status & 0x80:
    n = status & 0x0F
    if n: pts = read(0x814F, 8·n)                   // per point: id, xL, xH, yL, yH, sizeL, sizeH, _
    write(0x814E, 0)                                // hand the buffer back to the controller
    for each id that is new / moved / gone → publish("touch", { id, x, y, phase: "down" | "move" | "up", t })
```

Raw coordinates are mapped to the 540×960 portrait screen with a transform from the driver's
constants. On the host the simulated GT911 reports screen coordinates directly. On the device the
transform is checked in phase 4 with the Touch app, by tapping the four corners. The driver
publishes *points*, not gestures, so the Touch app can show raw data the way the PicoCalc's Keys app
shows raw key events.

### 6.7 Clock and power drivers

- **Clock** (`drivers/clock.js`, claim `i2c1:0x51`). On start it reads the BM8563 time registers
  0x02–0x08 (BCD seconds through years) and publishes `{ epochMs }` on the `time` channel. It reads
  them again every 60 s so drift is corrected. The prelude's `wallClock()` adds the virtual or real
  milliseconds since that reading. On the host the simulated RTC starts at 2026-10-22 09:41 UTC,
  which is the PicoCalc prelude's boot time, so captures stay deterministic. The same I2C bus is
  shared with the touch driver, and the kernel serialises the two, just as the PicoCalc kernel
  serialised the keyboard and power drivers on one STM32.
- **Power** (`drivers/power.js`, claims `adc1:2` and `gpio:4`). Every 10 s it calls
  `bat.read()`, which returns millivolts at the pin; the battery is twice that. It converts the
  voltage to a percentage with a LiPo curve, reads the charge pin (`chg.get()`: 0 means charging),
  and publishes `{ pct, mv, charging }` on `power`. These are two new handle types, `H_ADC` and
  `H_GPIO`, both synchronous: the port reads the pin now.

### 6.8 The paper compositor

The compositor (`js-papers3/system/compositor.js`) keeps its role. It owns the framebuffer, lays out
the focused app's ui tree, commits and asks the display driver to present. What changes is the
layout vocabulary, the chrome, the input path and the refresh intents.

**Screen.** 540×960 portrait, white paper, ink black, with grays at 25/50/75%. The layout follows
PULP's "Swiss" style: a 40 px margin, a title in Liberation Sans Bold, a 4 px rule under it, and the
body below. A 96 px footer holds the navigation chips **Home** and **Back** (the app's own `back`
message), the clock and the battery.

```
┌──────────────────────────────── 540 ────────────────────────────────┐
│  System                                              09:41  ▮▮▮ 82%  │  40 px margin, title "l"
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │  4 px rule
│                                                                      │
│  body: the app's ui tree, laid out at 460 px wide                    │
│                                                                      │
│                                                                      │
│ ──────────────────────────────────────────────────────────────────── │
│   ( Home )   ( Back )                         3 of 15 worlds · 0 ✕   │  96 px footer
└──────────────────────────────────────────────────────────────────────┘
```

**Ui nodes.** The same set as the PicoCalc (`col`, `row`, `box`, `text`, `gap`, `sep`, `bar`,
`spark`, `list`, `table`, `lines`, `grid`, `kv`, `canvas`, `input`), plus three new ones:

- `button(label, {msg, arg, primary})`: an inverted chip when primary.
- `keyboard({msg})`: an on-screen QWERTY keyboard with 48×56 keys, a shift row and a symbols row.
- `ink(w, h, strokes, {msg})`: a drawing surface that receives drags.

Any node with `{ tap: "msg", arg: … }` is tappable.

**Hit regions.** While drawing, the compositor records a region `[x, y, w, h, msg, arg]` for every
tappable node. A tap is delivered to the focused app as `send(app, msg, { arg, x, y })`. A list row
reports its index and a keyboard key its character. Regions are rebuilt on every paint, so they always
match the pixels.

**Gestures.** The compositor needs `touch` and recognises gestures with PULP's constants
(`s3paper_core/include/s3paper/input.h:83-91`):

- tap: up within 300 ms, moved less than 16 px;
- hold: down for 600 ms;
- swipe: moved more than 64 px with an off-axis ratio under ½;
- drag: moves over an `ink` node, forwarded as they happen.

A swipe up from the bottom edge goes home. Other swipes go to the app as `swipe` with a direction,
which lists use for paging.

**Intents.** A focus change or a crash banner presents with `"page"`. A frame from the focused app
presents with `"text"`. The pressed highlight on a button, and ink strokes, present with `"ink"`. The
compositor never fills and then erases a highlight: on e-paper that is a visible flash.

### 6.9 The apps

| world | kind | claims | what it shows |
|---|---|---|---|
| `launcher` | app | `sys.read` | tiles for every app; worlds running and crashes since boot |
| `system` | app | `sys.read` | tabs: Worlds (state, turns, cpu%, mem/limit), Handles, Buses (i2c1, epd0 busy%), Display (planner counters) |
| `repl` | app | | output lines, an input line and the on-screen keyboard; evaluates in `sandbox` |
| `sandbox` | service | | `(0, eval)(code)` with a 200 ms budget and 128 KB arena |
| `faults` | app | `sys.admin`, `sys.read` | buttons that make worlds loop, throw, run out of memory; restart stopped worlds |
| `flaky` | service | | crashes on purpose when asked |
| `touch` | app | | raw touch points and the recognised gesture, with a trail drawn in `ink` mode |
| `sketch` | app | | an ink surface: strokes with the fastest waveform, "clean" button forces a quality refresh |
| `about` | app | `sys.read` | board, engine, clock (real or virtual), calibration, refresh counters, licences |

### 6.10 The PaperS3 simulator (host)

`sim/papers3/` models the board closely enough that the JavaScript drivers talk to it register by
register, as they will to the real chips:

- **`gt911.c`**: the register file (product id `"911"` at 0x8140, config, status 0x814E, points
  from 0x814F), the buffer-ready protocol, and two touch points. Scripts drive it with
  `tap X Y`, `hold X Y MS`, `swipe X0 Y0 X1 Y1 [MS]` and `drag X0 Y0 X1 Y1 [MS]`. Points are sampled
  at the controller's 10 ms report rate.
- **`bm8563.c`**: BCD time registers advancing with the virtual clock.
- **`epd.c`**: the panel. It keeps the *glass*, which is what the panel shows, and a *ghost* map.
  - `quality` copies the 16 gray levels exactly and clears ghosts.
  - `text` copies them and adds a little ghost.
  - `fast` thresholds to black and white (as M5GFX does for anti-aliased text in fast modes) and
    leaves a ghost of the previous pixel.
  - `fastest` does the same with a stronger ghost.
  - Ghosts render as a faint blend toward the previous value, and a clean full removes them.
  - Each mode keeps the EPD bus busy for a modelled duration: quality 450 ms, text 300 ms, fast 120 ms,
    fastest 60 ms. These are placeholders until phase 5 measures the real panel.
  - `capture` writes the glass as a PNG, with an optional `ghosts` flag that makes ghosts visible.
- **`board.c`**: the battery voltage and charge pin, set by the script commands `battery PCT
  [charging]`.

The host runner (`host/main_host.c`) is shared. The board supplies its input commands through a
small table, so `key` exists on the PicoCalc and `tap` on the PaperS3.

### 6.11 The device port (`port/esp32s3-papers3/`)

It has the same shape as the P4 port, with the PaperS3's peripherals:

```
core 1: kernel task (prio 5)   kernel_run_until(port_clock()), sleeps until the next event or a queue item
core 0: i2c1 worker (prio 6)   GT911 + BM8563 transactions via i2c_master (400 kHz), one at a time, in order
core 0: epd worker (prio 4)    M5GFX: wait busy → setEpdMode → startWrite → pushImage rows → endWrite → wait busy
core 0: console task (prio 3)  USB-Serial-JTAG lines → kernel queue; shot task encodes the framebuffer
```

- **Memory.** World arenas and framebuffers go in PSRAM (`heap_caps_aligned_alloc(8, …, SPIRAM)`).
  The kernel task stack is in internal RAM. mquickjs recurses less than QuickJS, but the stack stays
  generous (32 KB) until it has been measured.
- **ESP-IDF.** v5.3.4, the version PULP builds with. M5Unified 0.2.18 and M5GFX 0.2.25 are pinned
  through the component manager, exactly as `components/s3paper_m5/idf_component.yml` pins them.
  `COMPONENTS` must list `esp_psram`, or PSRAM silently disappears (0113 lesson).
- **The JS tree** is compiled into the firmware by the same `bundle_js.cmake`, pointed at
  `js-papers3/`.
- **The stdlib header** is generated at build time by running the host generator with `-m32`.
- **Console.** USB-Serial-JTAG, the same commands as the P4 (`stats`, `worlds`, `handles`, `heap`,
  `crash`, `restart`, `bench`, `trace`, `shot`), with `tap X Y`, `swipe …` and `refresh` replacing
  `key` and `type`. `tools/s3cap.py` is a hold-open client in the style of ESP-55 `04-*.py`: it opens
  the port once, resets through DTR=RTS=0 → RTS pulse, sends commands at times, and decodes
  `#SHOT w h g8` blocks (run-length gray) to PNG.

## 7. Decision records

### Decision 7.1: one nucleus with an engine seam, not a fork

- **Context:** The PaperS3 needs a different engine, pixel format, input and UI. The kernel's
  semantics (lane, turns, supervision, handles) are exactly what should be shared.
- **Options considered:** (a) copy picocalc-os into papers3-os and edit freely; (b) one nucleus with
  board and engine seams; (c) make QuickJS and mquickjs look identical through a big shim.
- **Decision:** (b).
- **Rationale:** About 85% of the nucleus has no engine dependency once `world_t` drops its JS
  fields. The PicoCalc screenshots are a byte-exact oracle for the refactor. A fork would let the two
  kernels drift, so a fix found on one board (like the P4's message-for-a-dead-driver race) would
  have to be found twice.
- **Consequences:** `vm.c` and `vm_mqjs.c` must keep the same contract. Two JS trees exist, because
  the dialects differ.
- **Status:** accepted.

### Decision 7.2: MicroQuickJS on the PaperS3

- **Context:** The user suggested mquickjs. QuickJS would also fit the S3's 8 MB of PSRAM.
- **Options considered:** (a) QuickJS, the same as the P4, with all existing JS reused; (b) mquickjs.
- **Decision:** (b).
- **Rationale:**
  - Fixed arenas give hard, exact per-world memory limits with no allocator accounting.
  - Contexts are created in 0.6 ms (measured in 0113), so restarts are nearly free.
  - The compacting GC means no fragmentation across long uptimes.
  - The engine is proven on this board by PULP OS.
  - The UI has to be rewritten for touch and paper anyway, so the dialect's cost falls mostly on code
    that is new regardless.
- **Consequences:**
  - ES5 JavaScript and thenables instead of async/await.
  - The prelude carries the promise machinery.
  - The stdlib header must be regenerated per word size.
  - Step costs must be calibrated again.
  - The REPL accepts only ES5, and the About app says so.
- **Status:** accepted.

### Decision 7.3: promises in the prelude, not in C

- **Context:** mquickjs has no Promise. The kernel's async ops (`sleep`, `ask`, bus transfers) and
  async turns are promise-shaped.
- **Options considered:** (a) callbacks registered with the kernel (C keeps JS functions alive with
  GC refs); (b) C returns ids and the prelude keeps the callbacks; (c) port a full Promise
  implementation into the engine.
- **Decision:** (b).
- **Rationale:** No JS value crosses a moving GC in C's hands. The turn rules (a turn ends when its
  thenable settles) carry over unchanged. Crash semantics stay simple: a dead world's `pending` table
  dies with its arena.
- **Consequences:** The prelude is about 80 lines longer. `__settle` must drain callbacks before the
  segment ends.
- **Status:** accepted.

### Decision 7.4: gray8 framebuffers

- **Context:** The panel shows 16 grays. PULP pushed RGB565 rows to M5GFX.
- **Options considered:** RGB565 (no gfx changes); 4-bit packed (smallest); 8-bit gray.
- **Decision:** 8-bit gray, behind `NUCLEUS_GRAY8`.
- **Rationale:** Gray8 is half the PSRAM of RGB565: 1 MB for both buffers instead of 2 MB. One byte
  per pixel keeps `gfx` simple: no nibble packing in the fill and blend loops. The 16 levels the panel
  shows are the top four bits.
- **Consequences:** The EPD worker converts rows (gray8 → the format M5GFX takes) while pushing.
- **Status:** accepted.

### Decision 7.5: refresh policy in the JavaScript display driver

- **Context:** E-paper updates are slow and ghost, and the right mode depends on what changed.
- **Options considered:** (a) policy in C next to the waveforms (PULP's RefreshPlanner); (b) policy
  in the JS display driver; (c) in the compositor.
- **Decision:** (b).
- **Rationale:** This OS's principle is that drivers are JavaScript and the nucleus has mechanism
  only. The display driver is the one world that sees every update, so it is the natural owner of the
  partial count and ghost budget. A crash there is supervised like any other.
- **Consequences:** The EPD handle API is small: info and update. The compositor passes intents, not
  modes.
- **Status:** accepted.

### Decision 7.6: portrait 540×960

- **Context:** M5GFX's memory is 960×540, and PULP used portrait.
- **Decision:** Portrait, with the layout reading `W` and `H` from the framebuffer so landscape is
  one constant.
- **Rationale:** The device is held like a book. A 460 px column of proportional text is comfortable,
  and tables fit with DejaVu Sans Mono at about 38 columns.
- **Status:** accepted.

### Decision 7.7: M5GFX for the waveforms

- **Context:** The options are M5GFX `Panel_EPD` (PULP, 0112), EPD_Painter (0107, 2 bpp) and epdiy.
- **Decision:** M5GFX 0.2.25 via the component manager.
- **Rationale:** It is the only driver this repository has run in a full OS on this board. It
  supports all four modes and 16 grays. The optical-quality questions are the same for every driver
  and are out of scope.
- **Consequences:** The EPD worker is C++. `M5.begin()` also brings up M5Unified's power and touch
  objects; the port must not use M5's touch, because the JS driver owns I2C1.
- **Status:** accepted; revisit if M5Unified's I2C ownership conflicts with the i2c1 worker.

## 8. Key flows in pseudocode

### 8.1 A tap, end to end

```
GT911 (sim or chip) has a point at (270, 500)
touch driver, every 20 ms:   dev.transfer([0x81,0x4E],1)           → i2c1 worker or sim → settle
                             .then(status) → read points → write 0x814E=0 → publish("touch", {id:0,x:270,y:500,phase:"down"})
… 80 ms later:               publish("touch", {id:0, phase:"up"})
compositor on "touch":       gesture = recognise(track)            → tap at (270, 500)
                             r = hitTest(regions, 270, 500)        → ["open", "repl"]
                             send(focus, r.msg, {arg: r.arg, x, y})   (or handle it itself: footer chips)
launcher on "open":          send("compositor", "open", {app: "repl"})
compositor on "open":        focus = "repl"; paint; rects = fb.commit(); ask("display", "present", {rects, intent: "page"})
display driver:              clean full → epd.update(fb, 0,0,540,960, "quality")
EPD worker / sim:            the glass shows the REPL
```

### 8.2 An async turn on mquickjs

```
kernel: run_segment(display, msg "present")
  vm_dispatch → JS __dispatch(0, "present", json, "compositor", true)
     handler returns Task T (epd.update(...).then(...))
     prelude: k("turn.async"); T.then(done → k("turn.done", json), err → k("turn.fail", text)); drain()
  segment ends; the deferred epd.update starts on bus epd0
… EPD finishes → kernel_settle_at(display, epoch, id, ok)
kernel: run_segment(display, settle id)
  vm_settle → JS __settle(id, 1, "{...}") → T resolves → drain() runs the .then → k("turn.done", json)
  kernel: finish_turn → the compositor's ask settles
```

### 8.3 The refresh planner's ghost budget

```
state: partials, partialArea, lastClean
on present({rects, intent}):
   full = intent == "page" || partials >= 32 || partialArea >= 16·W·H || now() - lastClean >= 15 min
   if full: return epd.update(fb, 0, 0, W, H, "quality").then(reset counters)
   rects = mergeClose(alignX(rects, 8), 16)
   mode = modeFor(intent, rects)
   return seq(rects, function (r) { return epd.update(fb, r[0], r[1], r[2], r[3], mode); }).then(count them)
```

## 9. Implementation phases

| Phase | What | Gate |
|---|---|---|
| P0 | Engine seam: `world_t` engine-free, `vm_read_manifest`, `struct vmw`; Makefile `BOARD` | PicoCalc `make shots` byte-identical; `make M32=1`, `SAN=1` build |
| P1 | mquickjs vendored + patches + `paper_stdlib.c`; `vm_mqjs.c`; ES5 prelude with Task; a minimal papers3 manifest of test worlds | host runs worlds that send, ask, sleep, crash, overrun and OOM; supervision log matches expectations |
| P2 | gray8 `gfx`, `font_paper.h` generator, `gfx.measure/wrap`; `sim/papers3` EPD + bus; EPD handle; display driver with planner | a capture of a test screen; planner counters behave (full after N partials) |
| P3 | GT911, BM8563, battery sims; touch, clock, power drivers; paper compositor; apps | scripted tour (tap, swipe, REPL typing, faults, sketch) with captures in `out-papers3/` |
| P4 | `port/esp32s3-papers3`: build, flash, console, `tools/s3cap.py` shots | boots on the device; shot of the launcher; taps work; clock and battery read |
| P5 | Measure: calibration, refresh timings, memory per world, lane load; tune budgets | numbers in §15 |

## 10. Test strategy

- **Regression oracle (PicoCalc).** `make && make shots`, then `git status` must show no changed PNG.
  Run after every nucleus change, in normal, `M32=1` and `SAN=1` builds.
- **PaperS3 host scripts** (`scripts-papers3/*.txt`): boot, tour, REPL, faults, sketch, refresh. Each
  writes captures to `out-papers3/`. The PNGs are committed, and the same script must reproduce them
  byte for byte. That is the PaperS3's own oracle.
- **Engine conformance.** A test manifest (`js-papers3/test/`) checks the prelude's contract, mirroring
  the PicoCalc's behaviour:
  - ask/reply with a handle in it, ask timeout, and ask to a stopped world;
  - sleep ordering;
  - async turn with a rejection;
  - unhandled rejection log;
  - budget overrun, arena OOM, restart backoff, five crashes → stopped.
- **Sanitizers.** `make BOARD=papers3 SAN=1 shots`.
- **Device.** The console tour through `tools/s3cap.py`:
  - shots compared visually with the host captures;
  - `stats` and `worlds` read back;
  - taps in the four corners to fix the touch transform;
  - the planner's clean-full cadence observed on the glass.

## 11. Risks and open questions

- **mquickjs speed on the S3.** It has not been measured for this workload (13+ worlds, a 540×960
  layout in JS). If the compositor's paint is too slow, more layout moves into C, for example
  `gfx.wrap` and a C table renderer.
- **Arena sizing.** Transient memory during eval is about 10× retained (ESP-55). The compositor's
  arena must hold a full ui tree, its JSON and the layout. Start with 256 KB and measure.
- **M5Unified and I2C1.** `M5.begin()` may claim I2C1 for its own touch and RTC objects. The port
  may need to start only M5GFX's panel, or configure M5Unified to leave I2C alone.
- **Touch transform.** The GT911's raw orientation relative to the portrait viewport is unverified
  (M5GFX applies `offset_rotation=1`).
- **Ghosting model.** The simulator's ghosts are qualitative. Real ghosting depends on the waveform
  and temperature.
- **Serial.** Download-mode latching, the flaky USB and lost early output (§3.3). Flashing can fail;
  the port must be workable from host captures until the device is reachable.
- **Licences.** Charis SIL and Liberation are under the OFL, and DejaVu under the Bitstream Vera
  licence; both go into `third_party/fonts/`.

## 12. Deferred work

Wi-Fi and a web console; SD card storage and loading worlds from it; deep sleep with RTC wake;
bytecode-compiled worlds (PULP's `pulpjsc`); the IMU (auto-rotation); the buzzer; a second lane for
the second core.

## 13. API reference

### 13.1 World API (ES5 prelude)

```
app(name) | driver(name) | service(name) → builder
  .title(t) .state(obj) .needs(ch...) .provides(ch...) .onStart(fn) .on(type, fn) .every(ms, fn) .screen(fn) .hints(s|fn)
  handler fn(state, payload, info) → value | Task | undefined
send(to, type, payload)             publish(ch, payload)          ask(to, type, payload, {timeout}) → Task
sleep(ms) → Task                    now() → ms since boot          wallClock() → ms since epoch (RTC)
log(...)  show(v)  errText(e)       seq(list, fn) → Task           Task.all(list) → Task    Task.resolve(v)
hw.i2c("i2c1:0x5d", hz) → Handle    hw.epd("epd0") → Handle        hw.adc("adc1:2") → Handle   hw.gpio("gpio:4") → Handle
dma.alloc(w, h) → Handle            gfx.fonts()  gfx.measure(s, font)  gfx.wrap(s, font, w)
Handle: .transfer(bytes, nread, gapMs) → Task   .read16(reg, n) → Task   .write16(reg, bytes) → Task      (i2c)
        .update(fb, x, y, w, h, mode) → Task    .info()                                                  (epd)
        .read() → mV  (adc)   .get() → 0|1  (gpio)
        .fill .rect .line .text .commit .invalidate  (framebuffer)   .narrow(r) .revoke() .release()
sys.worlds() sys.handles() sys.stats() sys.fault(name) sys.restart(name)
ui.col row box text title gap sep bar spark list table lines grid kv canvas input button keyboard ink
```

### 13.2 Port API additions

```c
const char *port_board_name(void);
void bus_run_i2c(deferred_t *d, vtime_t at);           // now for bus i2c1 too (h->bus)
void bus_run_epd(deferred_t *d, vtime_t at);           // an EPD update; settles when the panel has it
int  port_adc_read_mv(int unit, int channel);          // H_ADC
int  port_gpio_get(int pin);                           // H_GPIO
```

### 13.3 Files to read, in order

1. `picocalc-os/README.md`: what the OS is and how it was measured.
2. `nucleus/nucleus.h`: every type and the port API.
3. `nucleus/kernel.c`: `pick`, `run_segment`, `crash_at`, `kernel_run_until`.
4. `nucleus/vm.c`, then `nucleus/vm_mqjs.c`: the two engine bindings side by side.
5. `js/prelude.js`, then `js-papers3/prelude.js`: the same API in two dialects.
6. `js-papers3/system/compositor.js` and `drivers/display.js`: layout, hit regions, the planner.
7. `sim/papers3/epd.c`, `gt911.c`: what the drivers talk to on the host.
8. `port/esp32s3-papers3/main/*.c`: the device.

## 14. References

- picocalc-os and its P4 port: `ttmp/2026/10/24/PICOCALC-P4-PORT--*/design-doc/01-*.md` (this repository).
- PULP OS: `esp32-s3-m5/0114-papers3-pulp-os/README.md`; onboarding guide
  `esp32-s3-m5/ttmp/2026/07/16/ESP-53-*/design-doc/02-pulp-os-system-onboarding-guide-*.md`.
- mquickjs spike results: `esp32-s3-m5/ttmp/2026/07/14/ESP-50-*/design-doc/05-microquickjs-spike-results-and-proceed-decision.md`.
- E-paper qualification: `esp32-s3-m5/ttmp/2026/07/14/ESP-50-*/design-doc/02-papers3-e-paper-qualification-deep-dive.md`.
- M5GFX board config: `esp32-s3-m5/0114-papers3-pulp-os/managed_components/m5stack__m5gfx/src/M5GFX.cpp:1920-2030`.
- M5 backend transaction: `esp32-s3-m5/components/s3paper_m5/src/m5_backend.cpp:20-30,306-470`.
- Serial discipline: `esp32-s3-m5/ttmp/2026/08/17/ESP-55-*/scripts/04-papers3-console-hold.py`.
- GT911 register map: Goodix GT911 programming guide (0x8140 product id, 0x814E status, 0x814F points).
- BM8563 datasheet (NXP PCF8563-compatible register map, 0x02–0x08 BCD time).

## 15. Implementation status and findings

*Updated as the work proceeds.*

| Phase | Status | Commit | Notes |
|---|---|---|---|
| Guide | done | aeceab5 | this document; reMarkable `/ai/2026/10/26/PAPERS3-PORT` |
| P0 | done | d2bb7f5, db0a452, 016f9a1 | engine, board and pixel seams; PicoCalc shots byte-identical (normal and SAN); P4 port builds |
| P1 | done | 4e67f09 | mquickjs binding, ES5 prelude with Task, conformance manifest passes (also under SAN) |
| P2 | done | 4e67f09, 7f96c33 | gray8 gfx, paper fonts, EPD simulator; display driver with the refresh planner (one update per present over the union of the damage; clean after 32 partials, 16 screens or 15 min) |
| P3 | done | 7f96c33 | paper compositor (chrome, hit regions, gestures, ink forwarding), touch/clock/power drivers, seven apps; 22 deterministic captures in `out-papers3/`, SAN clean |
| P4 | in progress (device blocked) | 78bba9a | ESP32-S3 firmware builds with IDF 5.3.4 (1.6 MB, 74% of the app partition free); not yet flashed: `cdc_acm` is not loaded on the host, needs `sudo modprobe cdc_acm` |
| P5 | not started | | |
