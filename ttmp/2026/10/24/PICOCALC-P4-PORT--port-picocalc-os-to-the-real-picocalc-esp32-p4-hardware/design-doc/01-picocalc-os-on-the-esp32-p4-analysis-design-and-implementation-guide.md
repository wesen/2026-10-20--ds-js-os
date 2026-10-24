---
Title: 'picocalc-os on the ESP32-P4: analysis, design and implementation guide'
Ticket: PICOCALC-P4-PORT
Status: active
Topics:
    - embedded
    - esp32-p4
    - picocalc
    - quickjs
    - porting
    - os
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: picocalc-os/js/system/compositor.js
      Note: The largest world; owns the framebuffer and drives the display driver
    - Path: picocalc-os/nucleus/hw.c
      Note: Handles and bus accounting; its bus back ends move behind the port seam
    - Path: picocalc-os/nucleus/kernel.c
      Note: The lane, the clock, messages and supervision; gains the real-time clock mode
    - Path: picocalc-os/nucleus/nucleus.h
      Note: The nucleus contract, including the new port API
    - Path: picocalc-os/nucleus/vm.c
      Note: One QuickJS runtime per world; allocator, budget and stack limit become port-dependent
    - Path: picocalc-os/sim/st7365p.c
      Note: Simulated panel; the behaviour the device back end must reproduce on real glass
    - Path: picocalc-os/sim/stm32kbd.c
      Note: Simulated STM32 southbridge; defines the I2C register contract the JS drivers rely on
    - Path: repo://picocalc-os/port/esp32p4/main/bus_p4.c
      Note: I2C and SPI worker tasks, buffer pinning
    - Path: repo://picocalc-os/port/esp32p4/main/main_p4.c
      Note: Kernel task real-time loop and serial console
    - Path: repo://picocalc-os/port/esp32p4/main/port_p4.c
      Note: Real clock, aligned PSRAM heaps, JS bundle lookup
    - Path: repo://picocalc-os/tools/p4cap.py
      Note: Reset, console commands and shot decoding from the host
ExternalSources:
    - /home/manuel/code/wesen/go-go-golems/esp32-s3-m5/0099-esp32-p4-picocalc-display-keyboard
    - /home/manuel/code/wesen/go-go-golems/esp32-s3-m5/0101-esp32-p4-native-quickjs
    - /home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/06/01/ARTICLE - ESP32-P4-WIFI6 as PicoCalc MCU - Deep Technical Dive.md
    - /home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/06/25/ARTICLE - PicoCalc Keyboard Reset and I2C Recovery - ESP32-P4 Host Investigation.md
Summary: How picocalc-os works, what in it is simulation-only, and how the same nucleus and the same JavaScript run on a PicoCalc whose RP2040 was replaced by a Waveshare ESP32-P4-WIFI6 (implemented; section 15 has the results).
LastUpdated: 2026-10-24T03:40:34.130287221-04:00
WhatFor: Onboarding an engineer to picocalc-os and to the ESP32-P4 port; the reference for the port seam.
WhenToUse: Read before changing the nucleus, the bus back ends, the ESP-IDF project, or before debugging the device build.
---

# picocalc-os on the ESP32-P4: analysis, design and implementation guide

## 1. Executive summary

picocalc-os is a small operating system for the PicoCalc handheld in which almost everything is
JavaScript. A C core of about 2,100 lines, the *nucleus*, runs a dozen independent QuickJS virtual
machines, called *worlds*, one at a time. Each world has its own heap limit and its own time budget.
The keyboard driver, the battery/backlight driver, the display driver, the window compositor and every
app are worlds. Until now the system has only run on Linux, against a simulated board: a model of the
ST7365P LCD controller and a model of the STM32 keyboard controller. Time on Linux is *virtual*. The
nucleus computes how long each piece of work would have taken on the ESP32-P4 and advances a simulated
clock by that amount, so a test script replays identically every time.

This ticket ports picocalc-os to the real device. The device is a PicoCalc whose RP2040 Pico has been
replaced by a Waveshare ESP32-P4-WIFI6 board on a pin-for-pin adapter. The port has three parts:

1. **A port seam in the nucleus.** The three bus back ends (I2C transfer, SPI command, SPI pixel
   transfer), the clock, the world-heap allocator and file loading move behind a small C interface.
   The Linux build implements it with the existing simulator and virtual clock. Its screenshots must
   stay byte-for-byte identical.
2. **An ESP-IDF project** (`picocalc-os/port/esp32p4/`). It compiles the unchanged nucleus and QuickJS
   for the ESP32-P4. The interface is implemented with the real clock (`esp_timer`), real buses
   (ESP-IDF `i2c_master` and `spi_master`, each driven by its own FreeRTOS worker task), PSRAM world
   heaps, and the JavaScript tree embedded in the firmware image.
3. **A serial console** for operating and verifying the device without looking at it: world and bus
   statistics, crash/restart, key injection, and a framebuffer screenshot sent over the UART and turned
   into a PNG on the host.

The JavaScript does not change, apart from one cosmetic line (the About app reads the board name from
the kernel instead of hard-coding "simulated").

## 2. Problem statement and scope

The README of picocalc-os ends with a paragraph titled "From here to the device"
(`picocalc-os/README.md`). It claims that the nucleus is written against the board only through `hw.c`
and `sim/`. On the ESP32-P4, it says, the bus functions call ESP-IDF drivers, the kernel loop runs in a
FreeRTOS task with the real clock, budgets are still enforced, world heaps come from PSRAM, and fault
frames go out on the console, while "the JavaScript does not change." This ticket turns that paragraph
into working firmware and checks each claim against the code.

In scope:

- Running all thirteen worlds of `js/system.json` on the device. That includes the real keyboard
  (STM32 at I2C 0x1F), backlight and battery, and the real LCD.
- Keeping the Linux host build working and deterministic. Its committed screenshots under `out/` are
  the regression oracle.
- A console for statistics, fault injection, key injection and screenshots over the UART.
- Measuring what the virtual clock predicted against what the device actually does.

Out of scope (recorded in section 12): a second execution lane on the P4's second core, Wi-Fi, SD-card
storage, updating JavaScript without reflashing, backlight PWM, and sleep.

## 3. Orientation: what picocalc-os is

This section explains the vocabulary that the rest of the document depends on. Each term is defined
before it is used.

### 3.1 The hardware

The **PicoCalc** (ClockworkPi) is a handheld with a 320 x 320 LCD, a QWERTY keyboard and an 18650
battery. It was designed around a Raspberry Pi Pico plugged into a socket on its mainboard. Two other
chips on the mainboard matter here:

- An **LCD controller**, an ST7365P (some notes call it ILI9488-compatible). It is connected over SPI
  with extra GPIO lines: D/C (data/command), chip-select and reset. It holds the image in its own
  memory (GRAM), so the host only has to send the pixels that change.
- An **STM32F103 "southbridge"** at I2C address 0x1F. It scans the keyboard into a 31-entry FIFO,
  controls the LCD and keyboard backlights, and measures the battery. The host reads it like a register
  file: write one byte (the register number), wait about 2 ms, read the answer.

In this device the Pico has been replaced by a **Waveshare ESP32-P4-WIFI6** board on a "same-position"
adapter. Each Pico socket pin lands on the Waveshare header pin in the same position. The ESP32-P4 is
a dual-core 360 MHz RISC-V chip with 32 MB of on-package PSRAM and about 580 KB of free internal RAM.
Its console is a CH343 USB-UART bridge on UART0, which appears on Linux as
`/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00` (currently `/dev/ttyACM0`). The board
has silicon revision v1.3, which ESP-IDF 5.3 and later support. The firmware is built with ESP-IDF
v5.4.2, as earlier projects on this board were.

The pin map was verified on hardware in project `0099-esp32-p4-picocalc-display-keyboard`:

| Function | Pico pin | ESP32-P4 GPIO |
|---|---|---|
| keyboard I2C SDA | GP6 | 50 |
| keyboard I2C SCL | GP7 | 49 |
| LCD SPI SCK | GP10 | 3 |
| LCD SPI MOSI | GP11 | 2 |
| LCD CS | GP13 | 7 |
| LCD D/C | GP14 | 24 |
| LCD RST | GP15 | 25 |
| console TX / RX | (Waveshare CH343) | 37 / 38 |

Two hardware facts from earlier work shape the design:

- **The LCD pins are routed through the GPIO matrix, not the SPI2 IO-MUX.** ESP-IDF rejects SPI clocks
  above 20 MHz unless the SPI device selects `SPI_CLK_SRC_SPLL`. With SPLL, 40 MHz and 80 MHz work.
  picocalc-os's display driver asks for 40 MHz (`js/drivers/display.js:9`).
- **STM32 register 0x08 resets the keyboard MCU, and touching it can wedge the bus until the device is
  power-cycled.** The JavaScript drivers never touch it. The device back end must not add any
  "recovery" that does.

### 3.2 Worlds

A **world** is one QuickJS runtime and context with a heap limit (`mem_kb`) and a time budget per turn
(`budget_ms`). Each world's source file defines it through a builder API that the *prelude*
(`js/prelude.js`) installs:

```js
app("snake")                     // or driver(...), service(...)
  .title("Snake")
  .state({ score: 0 })           // kept until the world restarts
  .needs("keys")                 // channels it receives
  .onStart((s) => ...)
  .on("key", (s, payload, msg) => ...)   // a return value answers an ask; async is fine
  .every(110, (s) => ...)                // a timer
  .screen((s) => ui.col(...))            // what it shows, as a tree of plain objects
  .hints("←→↑↓ steer");
```

The **manifest** `js/system.json` lists the worlds, the files they come from, their *claims* (the
hardware or privileges they may ask for), their budgets and their heap limits. These are the thirteen
worlds:

```text
drivers (priority 3):   keyboard  power  display
services (priority 2):  compositor  sandbox(prio 0)  flaky
apps (priority 1):      launcher  sysmon  repl  snake  faults  keys  about
```

Worlds share nothing. They communicate only by messages carrying JSON payloads:

- `send(to, type, payload)` delivers a message to one world.
- `ask(to, type, payload)` does the same and returns a promise for the receiver's answer.
- `publish(channel, payload)` sends to every world that `needs` the channel.

### 3.3 The lane, turns and segments

There is one **lane** of execution: at any moment at most one world runs. A **turn** is one message
handled to completion. If the handler is `async`, its turn lasts until its promise settles, and the
world takes no other message meanwhile. A turn can therefore consist of several **segments**, one per
time the world gets the lane: the first delivers the message, and later ones deliver each promise
settlement. The lane picks the next world by priority (drivers, then services, then apps, then the
sandbox) and then by arrival time (`pick()` in `nucleus/kernel.c:335-350`).

Every effect a segment has on the outside world is **deferred** and applied when the segment ends.
Effects include messages, channel posts, replies, and bus transfers. A segment that crashes is
discarded with all its effects (`discard_deferred()`, `kernel.c:123-130`). This is the rollback
property that the supervisor depends on.

### 3.4 Supervision

A world that throws, runs past its budget, or exceeds its heap is torn down. The supervisor drops its
handles, and restarts it after 100 ms, doubling up to 2 s. After five crashes in ten seconds it stays
stopped until a world with the `sys.admin` claim restarts it (`crash_at()`, `kernel.c:248-292`). Each
crash is published on the `worlds.status` channel and written to the UART as a one-line *fault
frame*:

```text
#OCT1 {"ev":"fault","t":3573.521,"world":"flaky","file":"system/flaky.js","handling":"boom","why":"boom, thrown on purpose (system/flaky.js:4:38)",...}
```

### 3.5 Handles

Hardware is reached through **handles**. A handle is an integer that the kernel checks on every use
(`handle_use()`, `nucleus/hw.c:43-54`). A world asks for one by claim (`hw.i2c("i2c0:0x1f")`,
`hw.spi("spi2")`, `dma.alloc(320, 320)`) and receives it only if its manifest entry lists that claim.
A handle can be narrowed (`fb.narrow("r")` makes a read-only child), sent inside a message, and
revoked. The compositor owns the framebuffer and gives the display driver a read-only child of it.

### 3.6 The screen pipeline

Apps never draw. After each of an app's turns the nucleus calls its `screen(state)` function. If the
returned tree changed, it is published on the `frames` channel (`run_segment()`, `kernel.c:399-410`).
The compositor (`js/system/compositor.js`) then:

1. lays out and paints the focused app's tree, plus the status and hint bars, into the *back* buffer of
   a 320 x 320 RGB565 framebuffer, using host calls `fb.fill/rect/line/text`;
2. calls `fb.commit()`. The nucleus compares the back buffer with the *front* buffer in 16-row bands,
   copies the changes to front, and returns the changed rectangles (`gfx_commit()`, `nucleus/gfx.c`);
3. asks the display driver to `flush` those rectangles. For each rectangle the display driver queues
   `CASET`, `RASET`, `RAMWR` and a pixel transfer from the front buffer. They run back to back on
   SPI2 once its turn ends (`js/drivers/display.js:27-43`).

```text
 app world            compositor world                 nucleus (C)            display world        bus
 ─────────            ────────────────                 ───────────            ─────────────        ───
 turn ends ──frames──▶ paint(tree) ──fb.fill/text──▶  back buffer
                       fb.commit() ───────────────▶  diff back vs front
                                   ◀──rects─────────  copy to front
                       ask("display","flush",rects) ─────────────────────────▶ for each rect:
                                                                                spi.cmd(CASET..)
                                                                                spi.cmd(RASET..)
                                                                                spi.cmd(RAMWR)
                                                                                spi.pixels(fb,..) ──▶ SPI2
                       ◀─────────────────────────────────── answer {px, ms} ◀── await all ◀──────── done
```

### 3.7 Time: the virtual clock

On Linux, time is virtual (`vtime_t`, microseconds). A segment's cost is calculated, not measured:

```text
cost = turn_base_us (40 µs)
     + steps × ns_per_step              (QuickJS interrupt-counter steps; one per loop back-edge or call)
     + K.seg_cost                       (host calls: pixels filled, glyphs drawn, JSON bytes, 1 µs per call)
```

`ns_per_step` is calibrated so that the 100,000-iteration loop of the earlier `0101` firmware's
`js bench` costs 133 ms, which is what the real ESP32-P4 measured (`vm_calibrate()`,
`nucleus/vm.c:742-749`). Bus transfers take the time their bits take on the wire (I2C at 10 kHz, 9
clocks per byte; SPI at 40 MHz plus 12 µs per 32 KiB DMA chunk). They are serialised per bus and
settle a promise when done (`nucleus/hw.c:101-205`). The host script runner advances the clock with
`kernel_run_until(t)` (`kernel.c:483-494`):

```text
loop:
  R  = the runnable world with the best (priority, arrival)
  tl = max(now, lane_free)            -- the lane is free again at lane_free
  te = time of the earliest event     -- deliveries, timer ticks, settlements, restarts
  if R and tl <= until and tl < te:   now = tl; run_segment(R)      -- lane_free = now + cost
  elif te <= until:                   now = max(now, te); handle(event)
  else: break
```

Because no part of this depends on the host's real speed, a script replays exactly. That is why
`make shots` reproduces the committed PNGs byte for byte. This was checked at the start of this ticket.

### 3.8 The source tree

```text
picocalc-os/
  nucleus/nucleus.h     the C contract: messages, worlds, events, handles, buses, the kernel API
  nucleus/kernel.c      619 lines: the event heap, the lane, deferred effects, asks, supervision, boot
  nucleus/vm.c          749 lines: a QuickJS runtime per world, the counting allocator, host calls __k/__ka
  nucleus/hw.c          243 lines: handles, DMA framebuffers, bus timing, the three bus back ends
  nucleus/gfx.c         159 lines: fill, rect, line, text (Terminus bitmap fonts), commit (diff)
  nucleus/util.c, png.c string buffers, file reading, a PNG writer
  sim/st7365p.c         the LCD controller model (sleep, DISPON, COLMOD, MADCTL, window, GRAM)
  sim/stm32kbd.c        the southbridge model (key FIFO, backlight, battery registers)
  host/main_host.c      the script runner: wait, key, type, capture, battery, crash, stats
  js/prelude.js         the world API, evaluated in every world first
  js/system.json        the manifest
  js/drivers/ js/system/ js/apps/
  third_party/quickjs/  QuickJS 2026-06-04 with two patches (finer interrupt counter, counter accessors)
```

## 4. Current-state analysis: what is simulation-only

Reading every C file shows which code depends on the host or the simulator. Each item below is
something the port must replace or put behind the seam.

| # | Where | What it does now | Why it cannot run as-is on the P4 |
|---|---|---|---|
| A | `hw.c:114-138` `run_i2c` | Calls `stm32_i2c()` (the simulator) and computes the end time from bit counts | Must perform a real `i2c_master` transaction, which takes real milliseconds |
| B | `hw.c:148-158` `run_spi_cmd` | Calls `st7365p_cmd/data` | Must toggle D/C and transmit on SPI2 |
| C | `hw.c:167-197` `run_spi_pixels` | Copies the front buffer into the panel model, byte-swapped to big-endian | Must DMA the pixels to the panel. The front buffer is in PSRAM and stored little-endian, so it needs a byte-swapping bounce buffer |
| D | `kernel.c:58-62` `kernel_now` | Virtual time: `vnow + 40 µs + steps × ns + seg_cost` | The device must use the real clock |
| E | `kernel.c:411-412` `run_segment` | Cost is computed, `lane_free = vnow + cost` | Cost must be measured |
| F | `vm.c:47-60` budget | The interrupt handler compares counted steps with `budget_us / ns_per_step` | Could stay as is, but the budget's purpose on the device is wall time (see decision 7.4) |
| G | `vm.c:12-44` allocator | `malloc` + `malloc_usable_size` (glibc) | ESP-IDF `malloc` puts small blocks in internal RAM (about 580 KB total). Thirteen worlds need several MB, so their heaps must come from PSRAM via `heap_caps_*` |
| H | `vm.c:616` | `JS_SetMaxStackSize(rt, 192 KB)` | Must be smaller than the kernel task's FreeRTOS stack, or a deep recursion corrupts memory instead of raising `RangeError` |
| I | `hw.c:92-93` `dmabuf_alloc` | `calloc` of two 200 KB buffers | Must come from PSRAM |
| J | `util.c:168-177` `read_file` | `fopen` of `js/prelude.js`, `js/system.json`, world sources | The device has no file system. The JS tree is embedded in the firmware |
| K | `kernel.c:501` | `K.uart = fopen(uart_path)` | The UART is the console. Use `stdout` |
| L | `host/main_host.c` | Script runner, PNG capture from the panel model | Replaced by `app_main`, the kernel task and a serial console |
| M | `quickjs.c:49893-49899` | `localtime_r` + `tm.tm_gmtoff` | newlib's `struct tm` has no `tm_gmtoff`. The `0101` port used the `_WIN32` branch under `ESP_PLATFORM`, which is a third QuickJS patch |
| N | `about.js:16` | Hard-codes "(simulated)" | Cosmetic. Read a `board` field from `sys.stats()` |

Everything else is portable as written. That covers the event heap, deferred effects, asks,
supervision, handles, `gfx.c`, the prelude and all the JavaScript. The device has 32-bit pointers, so
`mem_scale` is 1.0 there (`kernel.c:28`).

Two properties of the current code make the port safer than it first appears:

1. **Bus effects are already asynchronous.** A world never waits on a bus inside a segment. It gets a
   promise, and the kernel settles that promise later through an `E_SETTLE` event
   (`kernel_settle_at()`, `kernel.c:143-149`). On the device a transfer can therefore run on a separate
   FreeRTOS task, and the kernel only needs a thread-safe way to receive "transfer N finished at time t
   with result r".
2. **The front buffer is not written while the display driver reads it.** The compositor's `draw`
   handler is async and awaits the `flush` ask (`compositor.js:376-389`). The lane does not give a world
   a new message while its turn is in progress (`pick()` checks `!W->in_turn`, `kernel.c:343`). So the
   only writer of the front buffer, `fb.commit()` inside `draw`, cannot run while pixels are in flight.
   There is one exception: if a world is killed mid-transfer, the buffer could be freed. Section 6.3
   handles that with a reference pin.

## 5. Gap analysis

| Need on the device | Exists? | Gap |
|---|---|---|
| Compile nucleus + QuickJS with ESP-IDF | `0101` compiled upstream QuickJS natively | Use this repo's patched QuickJS, plus the `tm_gmtoff` patch and a `malloc_usable_size` declaration |
| Keyboard on I2C | `0099` `picocalc_keyboard.c` (transmit, 2 ms, receive at 10 kHz) | Issue it from a worker task and settle the world's promise |
| LCD on SPI2 at 40 MHz | `0099` LCD code (SPLL, 32 KiB transfers, polling + queued DMA) | Same, but driven by the JS display driver's commands, with RST pulsed once at board init |
| Real-time kernel loop | No | New: clock mode, idle wait, a completion queue from the bus workers |
| JS files on the device | No | New: build-time bundle of `js/` into a C table |
| Seeing the screen remotely | The host captures PNGs from the panel model | New: `shot` console command (RLE + base64 of the front buffer) and a host-side decoder |
| Driving the UI remotely | The host injects keys into the STM32 model | New: `key` console command that publishes on the `keys` channel |

## 6. Proposed architecture

### 6.1 The port seam

A new header section in `nucleus/nucleus.h` declares what a *port* (a build target) provides. The
nucleus calls only these functions for anything platform-specific.

```c
// ---- the port: what a build target provides (sim/ + host/ on Linux, port/esp32p4/ on the device) -------
// the clock: K.realtime selects real time (port_clock) over the virtual clock
vtime_t port_clock(void);                       // microseconds since boot (the device); unused when virtual
// world heaps and framebuffers
void *port_heap_malloc(size_t n);
void *port_heap_realloc(void *p, size_t n);
void port_heap_free(void *p);
size_t port_heap_usable(const void *p);
void *port_big_calloc(size_t n);                // framebuffers
void port_big_free(void *p);
size_t port_js_stack(void);                     // the JS stack limit for a world's runtime
// files: the JS tree (a directory on the host, a table compiled into the firmware on the device)
char *port_read_file(const char *path, size_t *len);
// the buses: each starts the transfer a deferred effect describes, at the time the issuing segment ended,
// and eventually settles d->promise through kernel_settle_at()
void bus_run_i2c(deferred_t *d, vtime_t at);
void bus_run_spi_cmd(deferred_t *d, vtime_t at);
void bus_run_spi_pixels(deferred_t *d, vtime_t at);
const char *port_board_name(void);
```

`hw.c` keeps the handle table, DMA buffers, accounting helpers (`bus_start`, `bus_finish`, which are
now exported) and the `hw_i2c/hw_spi_cmd/hw_spi_pixels` entry points. Those entry points now set
`d->run` to the port's `bus_run_*`. The three existing functions move verbatim into
`sim/bus_sim.c`. Moving them unchanged is what keeps the host build pixel-identical.

```text
                 ┌──────────────── nucleus (portable) ────────────────┐
 js/*.js ──▶ vm.c ──▶ kernel.c (lane, events, supervision) ──▶ hw.c (handles, accounting)
                 └───────┬───────────────┬───────────────┬────────────┘
                         │ port_clock    │ port_heap_*   │ bus_run_*  port_read_file
            ┌────────────┴───┐                 ┌─────────┴─────────────────────────┐
            │ Linux port     │                 │ ESP32-P4 port                      │
            │ sim/bus_sim.c  │                 │ port/esp32p4/main/bus_p4.c         │
            │ sim/st7365p.c  │                 │   i2c worker task  → i2c_master    │
            │ sim/stm32kbd.c │                 │   spi worker task  → spi_master+DMA│
            │ host/port_host.c (malloc, fopen) │ port/esp32p4/main/port_p4.c       │
            │ host/main_host.c (script runner) │   heap_caps PSRAM, esp_timer,     │
            │ virtual clock                    │   embedded js bundle              │
            └──────────────────────────────────┤ port/esp32p4/main/main_p4.c       │
                                               │   kernel task, console task       │
                                               └───────────────────────────────────┘
```

### 6.2 Real-time mode in the kernel

`kernel_t` gains `bool realtime`. Only three places in `kernel.c` change, and each keeps the virtual
branch unchanged:

```c
vtime_t kernel_now(void) {
  if (frozen_now >= 0) return frozen_now;
  if (K.realtime) return port_clock();
  ...virtual as before...
}

static void run_segment(world_t *W, bool is_settle) {
  if (K.realtime) K.vnow = port_clock();          // the segment starts now, not when it was due
  ...as before...
  vtime_t cost = K.realtime ? port_clock() - K.vnow
                            : PROFILE.turn_base_us + steps * ns_per_step + K.seg_cost;
  ...
}

vtime_t kernel_next_wake(void);   // new: when kernel_run_until next has work (now, an event's time, or VT_INF)
```

The device's kernel task turns `kernel_run_until()` into a real-time loop:

```c
for (;;) {
  drain(completion_queue);         // bus results  → kernel_settle_at(w, epoch, promise, ok, json, t_done)
  drain(console_queue);            // console lines → console_exec(line)
  kernel_run_until(port_clock());  // every due event, every runnable world, in the usual order
  vtime_t wake = kernel_next_wake();
  vtime_t dt = wake - port_clock();
  if (dt > 0) xQueueReceive(completion_queue, ..., ticks(min(dt, 50 ms)));   // sleep until work or a result
}
```

The completion queue is the only way the bus worker tasks talk to the kernel task. Nothing outside the
kernel task touches `K`, so the nucleus stays single-threaded and needs no locks.

### 6.3 The bus workers

Each bus gets a FreeRTOS task and a request queue. A request carries everything the transfer needs,
copied out of the deferred effect so that it does not depend on kernel memory:

```c
typedef struct {
  int kind;                    // REQ_I2C, REQ_SPI_CMD, REQ_SPI_PIXELS
  int w, epoch, promise;       // whom to settle
  int addr, hz;                // i2c
  uint8_t bytes[64]; int nbytes, nread; vtime_t gap_us;   // i2c write + read, spi command parameters
  int cmd;                     // spi command byte
  int buf; int x, y, wd, ht;   // spi pixels: a pinned framebuffer and the rectangle
} bus_req_t;

typedef struct { int w, epoch, promise, ok; char json[96]; vtime_t t0, t1; int bus; uint32_t bytes; int buf; } bus_done_t;
```

**I2C worker.** It keeps one `i2c_master_dev_handle_t` per address, created on first use at the
handle's frequency. For a request it transmits the write bytes, waits the gap (`vTaskDelay` at a
1 kHz tick), receives `nread` bytes, and posts the result as a JSON array, as the simulator does.
Because the worker handles one request at a time, the transmit–gap–receive sequence is atomic with
respect to other worlds' transfers. That is the property the keyboard and power drivers rely on
(`js/drivers/keyboard.js:13-16`).

**SPI worker.** One SPI device on SPI2: `SPI_CLK_SRC_SPLL`, mode 0, CS on GPIO7, maximum transfer
32 KiB, at the frequency the display driver asked for. A command request sets D/C low, sends the
command byte, sets D/C high and sends the parameters. A pixel request reads the pinned framebuffer's
front buffer row by row, byte-swaps into one of two 32 KiB internal DMA bounce buffers, and queues them
alternately with `spi_device_queue_trans`, so the swap of chunk n+1 overlaps the DMA of chunk n.

**Buffer pinning.** When `bus_run_spi_pixels` builds a request it increments the framebuffer's
reference count (`K.bufs[i].refs++`). The kernel task drops it when it processes the completion. If the
compositor and display die mid-transfer, the buffer outlives them until the DMA is done.

**Accounting.** The completion carries `t0` and `t1` (real start and end). The kernel task calls
`bus_finish(bus, t0, t1, bytes, !ok)`, so the System app's Buses tab shows real bus occupancy.

### 6.4 Memory on the device

| What | Where | Why |
|---|---|---|
| World heaps (13 × 256–768 KB limits) | PSRAM, `heap_caps_aligned_alloc(8, n, MALLOC_CAP_SPIRAM \| MALLOC_CAP_8BIT)` (8-aligned: see 15.2) | They do not fit in about 580 KB of internal RAM |
| Framebuffer back + front (2 × 200 KB) | PSRAM | Same |
| SPI bounce buffers (2 × 32 KiB) | Internal, `MALLOC_CAP_DMA` | GPSPI DMA reads internal memory without cache-coherency work |
| Kernel task stack (64 KB) | Internal | Speed. QuickJS's stack limit is set to 48 KB below the top |
| Kernel tables, messages, event heap | Default `malloc` | Small |

The world heap accounting stays the same. `port_heap_usable()` returns `heap_caps_get_allocated_size()`
in place of `malloc_usable_size()`, and the `+ 8` header estimate is kept.

### 6.5 The JavaScript bundle

At build time a CMake script globs `picocalc-os/js/**/*.js` and `*.json`. It writes `js_bundle.c`: a
table of `{ "drivers/display.js", bytes, length }` entries. On the device, `port_read_file("js/…")`
strips the root prefix and looks the path up in the table. The prelude, the manifest and the world
sources are all loaded through it, so `kernel_boot()` is unchanged. The files are the same bytes as the
host uses. That makes the claim "the JavaScript does not change" literally true.

### 6.6 The console

UART0 is shared between log output and a line-oriented console, which a small task reads. Lines are
posted to the kernel task and executed there, between `kernel_run_until` calls, so commands may touch
`K` freely:

| Command | Does |
|---|---|
| `stats` | `kernel_stats_print()`: every world, the lane and the buses |
| `worlds` / `handles` | The JSON the System app reads |
| `key NAME [down\|up\|hold]` | Publishes a key event on `keys` as the keyboard driver would (a press is `down` then `up` 60 ms later) |
| `type TEXT` | A key press per character |
| `crash WORLD` / `restart WORLD` | `kernel_fault` / `kernel_restart_world` |
| `shot` | Sends the compositor's front buffer: `#SHOT 320 320`, base64 lines of a 16-bit run-length encoding, then `#END` |
| `heap` | Internal and PSRAM free and largest block |
| `bench` | Re-runs the calibration loops on the real clock |

Every kernel log line keeps its `[   1234.567]` prefix, and fault frames keep their `#OCT1 ` prefix, so
a host program can tell them apart. `tools/p4cap.py` on the host resets the board via DTR/RTS, collects
the boot log, sends commands, and decodes `shot` output into a PNG with the same 2x scale as the host
captures. Section 9 uses it.

The decoded screenshot shows what the compositor *sent*, not the light the panel emits. The final check
is still a person looking at the glass.

### 6.7 Board init order

1. `app_main`: log the chip revision, PSRAM size and free heap.
2. Configure D/C and RST as outputs, then pulse RST (high 10 ms, low 30 ms, high 150 ms), as `0099`
   does. The JS driver's `SWRESET` then finds a panel out of hardware reset.
3. `spi_bus_initialize(SPI2_HOST, …, SPI_DMA_CH_AUTO)`, `max_transfer_sz = 32 KiB`. The device itself is
   added lazily at the first request, with the handle's frequency.
4. `i2c_new_master_bus(I2C_NUM_0, SDA 50, SCL 49, internal pull-ups, glitch filter 7)`.
5. Start the I2C worker, the SPI worker (both on core 0), the console task, and the kernel task on
   core 1 with a 64 KB internal stack. The kernel task runs `kernel_init` (prelude and calibration),
   `kernel_boot` (manifest), then the loop.

## 7. Decision records

### Decision 7.1: one seam, both builds

- **Context:** The device needs different buses, clock, allocator and file loading. A fork of the
  nucleus would drift, and the host build is the only deterministic test harness.
- **Options considered:** (a) copy the nucleus into the ESP-IDF project and edit it; (b) `#ifdef
  ESP_PLATFORM` throughout the nucleus; (c) a small port API implemented once per target.
- **Decision:** (c).
- **Rationale:** The nucleus already reaches the board through only three functions in `hw.c`, plus the
  clock, allocator and files. A named interface is small, and both builds compile the same `kernel.c`,
  `vm.c`, `hw.c` and `gfx.c`.
- **Consequences:** The host must still produce identical PNGs after the refactor (gate G1). Every
  future platform difference must go through `port_*`, not an `#ifdef` in the nucleus.
- **Status:** accepted.

### Decision 7.2: real time on the device, virtual time on the host

- **Context:** The virtual clock exists so the simulation predicts the device. On the device the truth
  is available.
- **Options considered:** (a) keep the virtual clock on the device, paced against the wall clock;
  (b) real time everywhere on the device.
- **Decision:** (b), selected by `K.realtime`.
- **Rationale:** With (a), costs would be predictions while the bus transfers really happen. The two
  clocks would drift apart, and timers would fire at wrong wall times. With (b), `now()`, timers,
  `Date`, budgets and statistics are all measurements, and comparing them with the simulation becomes
  an experiment.
- **Consequences:** The device is not deterministic, and scripts do not replay exactly there.
  `Math.random` stays seeded per world.
- **Status:** accepted.

### Decision 7.3: asynchronous buses on worker tasks

- **Context:** A full-screen flush is 204,800 bytes, about 41 ms at 40 MHz. A keyboard poll holds I2C
  for about 6 ms. In the simulation the lane keeps running while buses are busy.
- **Options considered:** (a) do the transfer synchronously inside `apply_deferred` on the kernel task;
  (b) worker tasks with a completion queue.
- **Decision:** (b).
- **Rationale:** (a) would stall every world for every transfer: 50 keyboard polls a second at 6 ms
  each, plus each flush, would take about a third of the lane. That contradicts the system's model,
  and it would make budgets meaningless (time spent in the kernel's bus code would be charged to no one).
- **Consequences:** Completion order across buses is real, not modelled. Ordering within one bus is
  preserved by the single worker per bus.
- **Status:** accepted.

### Decision 7.4: budgets enforced by the real clock on the device

- **Context:** The budget stops runaway code. Interrupt-counter steps measure JavaScript work, but not
  time spent in host calls (text drawing, JSON) or PSRAM stalls.
- **Options considered:** (a) keep the step budget with the calibrated ns/step; (b) a wall-clock
  deadline checked in the interrupt handler.
- **Decision:** (b) in real-time mode. The step counter still runs and is still reported.
- **Rationale:** The world author's contract is "your turn may take N ms". On the device milliseconds
  are measurable. The interrupt handler runs about every 1,000 steps (`JS_INTERRUPT_COUNTER_INIT`
  patch), and `esp_timer_get_time()` is cheap.
- **Consequences:** If the device is slower than the model, a world can now hit its budget where the
  simulation said it would not. The compositor's 80 ms paint is the prime suspect. That is a finding
  to report, not a reason to switch the check off. Budgets in `system.json` may need device-specific
  values, which section 10 measures.
- **Status:** accepted.

### Decision 7.5: embed the JS tree; no file system yet

- **Context:** The worlds' source must be on the device.
- **Options considered:** (a) a LittleFS/SPIFFS partition with an upload tool; (b) a C table generated
  at build time.
- **Decision:** (b) for this ticket.
- **Rationale:** No partition tooling, no second flash step, and the files can never be out of sync
  with the firmware. Updating JS over the serial link is a later feature that can sit behind the same
  `port_read_file()`.
- **Status:** accepted.

### Decision 7.6: screenshots over the UART

- **Context:** An agent driving the port cannot see the glass, and the panel cannot be read back. MISO
  is not connected.
- **Decision:** Send the front buffer with a 16-bit run-length encoding in base64. UI frames are mostly
  flat colour, so a 200 KB frame compresses to a few tens of KB, a few seconds at 115,200 baud.
- **Consequences:** This verifies the pipeline up to the SPI bus. Whether the glass shows it is
  confirmed by a person.
- **Status:** accepted.

## 8. Key flows in pseudocode

### 8.1 An I2C read, end to end (the keyboard poll)

```text
keyboard world, segment k (timer tick)
  dev.read(0x04, 1, 2)                           prelude → __ka("i2c", h, [0x04], 1, 2)
    host_ka → handle_use(h, I2C, W) → vm_new_promise → hw_i2c(): defer(d{run=bus_run_i2c})
  await → segment ends
kernel: apply_deferred(t_end) → bus_run_i2c(d, t_end)
    device:  req = {addr 0x1f, hz 10000, bytes [04], nread 1, gap 2ms, w, epoch, promise}
             xQueueSend(i2c_q, req)
    host:    stm32_i2c(...); settle at start + wire time        (unchanged)
i2c worker task (core 0)
    dev = device_for(0x1f, 10 kHz)
    i2c_master_transmit(dev, [04]); vTaskDelay(2 ms); i2c_master_receive(dev, rd, 1)
    xQueueSend(done_q, {ok, json "[n]", t0, t1, …})
kernel task
    drain(done_q): bus_finish(I2C0, t0, t1, …); kernel_settle_at(w, epoch, promise, ok, json, t1)
    kernel_run_until(now): E_SETTLE → W->settles → keyboard gets the lane → vm_settle → resolve([n])
```

If the world crashed in between, its epoch has moved on and `E_SETTLE` drops the result
(`handle_event`, `kernel.c:463-472`). The behaviour is the same as on the host.

### 8.2 A flush

```text
display world: for each rect: spi.cmd(CASET,..) spi.cmd(RASET,..) spi.cmd(RAMWR) spi.pixels(fb,..)
               await Promise.all(jobs)   → segment ends; 4 × n deferred effects in order
kernel: bus_run_spi_cmd × 3, bus_run_spi_pixels(d): K.bufs[buf].refs++; enqueue in that order
spi worker: CASET: DC=0 send 0x2a, DC=1 send 4 bytes   (polling transmit)
            RASET, RAMWR likewise
            pixels: for each 32 KiB chunk of the rect: swap rows into bounce[i]; queue_trans(bounce[i]);
                    wait the older one; i ^= 1
            post done (one per request)
kernel: settle each promise; for pixels also buf_unref(buf)
display world: Promise.all resolves → answers the compositor's ask with {px, ms}
```

### 8.3 Run-length screenshot encoding

```text
emit "#SHOT w h"
runs = []
for each pixel v in front (row-major):
  if runs and runs.last.v == v and runs.last.n < 65535: runs.last.n++
  else runs.push({n: 1, v})
bytes = for each run: n (u16 little-endian), v (u16 little-endian)
emit base64(bytes) in lines of 76 characters
emit "#END <crc32 of the raw pixels>"
```

The host decodes it, checks the CRC, converts RGB565 to RGB888, and writes a PNG at scale 2.

## 9. Implementation phases

| Phase | Work | Gate |
|---|---|---|
| P0 | Port seam: `port_*` API, `sim/bus_sim.c`, `host/port_host.c`, `K.realtime`, `kernel_next_wake`, QuickJS `ESP_PLATFORM` timezone patch, `board` in stats | **G1:** `make shots` and `make M32=1 shots` produce the committed PNGs unchanged (`git status out/` clean) |
| P1 | ESP-IDF project `port/esp32p4/`: CMake listing the nucleus and QuickJS sources, JS bundle generator, `sdkconfig.defaults` (UART console, 32 MB flash, PSRAM 200 MHz hex, FreeRTOS 1 kHz, 4 MB app partition), PSRAM allocator, kernel task, real clock | **G2:** the firmware builds, boots, logs calibration and "booting 13 worlds" |
| P2 | I2C worker and back end | **G3:** keyboard and power drivers run without I2C errors; `stats` shows I2C transfers; battery percentage published |
| P3 | SPI worker, D/C, RST, bounce buffers, buffer pinning | **G4:** the home screen appears on the glass; `shot` decodes to a picture matching `out/01-home.png` in layout |
| P4 | Console (`stats`, `key`, `type`, `shot`, `crash`, `restart`, `heap`, `bench`) and `tools/p4cap.py` | **G5:** a scripted tour (open System, REPL evaluates `1+2`, Faults crashes `flaky`, keyboard killed and restarted) works over serial |
| P5 | Measurements: calibration on the real clock, lane busy %, per-world cpu, flush ms, I2C share; budget adjustments if needed | **G6:** numbers recorded in the diary against the simulator's predictions |

## 10. Test strategy

- **Host regression (G1).** `make clean && make shots && git status --short out/`. Any changed PNG
  fails the refactor. Also `make M32=1 shots` and `make SAN=1 shots` (AddressSanitizer catches lifetime
  mistakes introduced by moving code).
- **Device boot.** Capture with `tools/p4cap.py`: reset by RTS with DTR deasserted, then read for
  N seconds. Expect ESP-IDF v5.4.2, chip revision v1.3, 32 MB PSRAM, the calibration line,
  "booting 13 worlds", and no `#OCT1` fault frames in the first 3 s.
- **Device buses.** `stats` after 10 s: the I2C transfer count grows about 100 per second
  (50 polls × 2 reads, when no key is pressed), with zero errors. The SPI byte count is at least one
  full frame (204,800 bytes) after boot.
- **Device screen.** `shot` → PNG, compared side by side with `out/01-home.png`. The clock text and
  battery level are expected to differ. Then a person confirms the glass.
- **Device interaction.** `key right`, `key enter` → the REPL opens. `type 1+2` and `key enter` → the
  `shot` shows `3`. Faults → "Throw in a service's handler" → a `#OCT1` frame for `flaky` appears on the
  UART, and `stats` shows `flaky` restarted.
- **Real keyboard.** A person presses keys. The Keys app (letter `k` on the home screen) lists them,
  and `stats` shows the keyboard world's events.
- **Calibration.** `bench` prints the 100k loop and fib(20) times on the real clock. The `0101` firmware
  measured 133 ms and 31 ms. With PSRAM heaps a slowdown is possible and is to be recorded.

## 11. Risks and open questions

1. **PSRAM speed.** World heaps in PSRAM may make JavaScript slower than the `0101` measurement (whose
   small allocations came from internal RAM). Budgets could then fire. Mitigation: measure. Drivers'
   heaps could later be placed in internal RAM by a manifest flag.
2. **The compositor's paint time.** It draws the whole screen in JavaScript on every change. On the
   host model a paint costs a few ms. On the device it is unknown until measured.
3. **Console sharing.** Logs and console input share UART0. A long `shot` delays log lines but does not
   lose them.
4. **Backlight register semantics on the real STM32.** The simulator writes REG_BKL with bit 7 and then
   reads it back. The real firmware's answer format must be checked (`power.js` uses the second byte).
5. **Keyboard wedges.** If the STM32 I2C slave wedges, the earlier investigation's safe recovery is to
   keep the bus quiet for more than 3 s and then recreate the master. The keyboard world's crash and
   backoff already produces short quiet periods. Automatic recovery is deferred.
6. **Stack depth.** A 48 KB JS stack limit is far below the host's 192 KB. Deep recursion in the REPL
   raises `RangeError` earlier on the device. That is a difference to note, not a bug.

## 12. Deferred work

- A second lane on core 0 for drivers, so a long app turn does not delay keyboard polling.
- Updating the JS over serial into a LittleFS partition, then restarting a world without reflashing.
- Wi-Fi via ESP-Hosted (the C6 on the Waveshare board), and an SD card.
- Backlight PWM and sleep/wake. The current backlight is the STM32's on/off register path.
- Capability checks on channel subscriptions (any world can `need` `keys`), as the README notes.

## 13. API reference

### 13.1 Kernel operations a world can call (via the prelude)

| JS | Host op | Claims / notes |
|---|---|---|
| `now()`, `Date`, `log`, `self` | `now`, `log`, `self` | virtual on host, real on device |
| `send(to, type, p)` | `send` | handles in `p` must be grantable |
| `publish(ch, p)` | `publish` | world must `provide` ch |
| `ask(to, type, p, {timeout})` | `__ka ask` | default timeout 2 s |
| `sleep(ms)` | `__ka sleep` | |
| `hw.i2c(claim, hz)` | `hw.i2c` | `i2c0:0xNN` claim |
| `hw.spi(claim, hz)` | `hw.spi` | `spi2` claim, ≤ 80 MHz |
| `dma.alloc(w, h)` | `dma.alloc` | `dma` claim, ≤ 640 × 640 |
| `h.read(reg, n, gap)`, `h.transfer(bytes, n, gap)`, `h.write(reg, v)` | `__ka i2c` | |
| `h.cmd(c, data)`, `h.pixels(fb, x, y, w, h)` | `__ka spi.cmd`, `spi.pixels` | fb needs read right |
| `fb.fill/rect/line/text/commit/invalidate` | `gfx.*` | fb needs write right |
| `h.narrow(r)`, `h.revoke()`, `h.release()` | `h.*` | |
| `sys.worlds/handles/stats()` | `sys.*` | `sys.read` |
| `sys.fault(name)`, `sys.restart(name)` | `sys.*` | `sys.admin` |

### 13.2 The port API

See section 6.1 for the declarations. Their contracts:

- `port_clock()` is monotonic, in microseconds, and is only called when `K.realtime`.
- `bus_run_*()` run on the kernel task, during `apply_deferred` or directly if no segment is current.
  They must not block for long, and must eventually call `kernel_settle_at()` on the kernel task, exactly
  once per request, with the request's `w`, `epoch` and `promise`. They own `d->bytes`: they free it or
  take it, and set it to NULL.
- `port_read_file()` returns a NUL-terminated `malloc`ed copy that the caller frees, or NULL.

### 13.3 Files to read, in order

1. `picocalc-os/README.md`, the design in the author's words.
2. `picocalc-os/nucleus/nucleus.h`, every structure.
3. `picocalc-os/nucleus/kernel.c`: `run_segment`, `kernel_run_until`, `crash_at`.
4. `picocalc-os/js/prelude.js`, then `js/drivers/keyboard.js` and `js/drivers/display.js`.
5. `picocalc-os/nucleus/hw.c` and `sim/bus_sim.c` for the host bus model, then
   `port/esp32p4/main/bus_p4.c` for the real one.
6. `picocalc-os/port/esp32p4/main/main_p4.c`: the kernel task loop and the console.

## 14. References

- `picocalc-os/README.md`: architecture, script language, findings of the simulator.
- `esp32-s3-m5/0099-esp32-p4-picocalc-display-keyboard`: verified pin map, SPLL SPI clock, keyboard
  transmit/2 ms/receive sequence, LCD RST timing.
- `esp32-s3-m5/0101-esp32-p4-native-quickjs`: QuickJS under ESP-IDF, `malloc_usable_size` shim,
  `tm_gmtoff` patch, 133 ms / 31 ms benchmark figures, 32 KiB stack lesson.
- go-go-parc, "ESP32-P4-WIFI6 as PicoCalc MCU – Deep Technical Dive": chip revision v1.3, console on
  CH343/UART0, one owner per serial port, reset-and-capture with pyserial.
- go-go-parc, "PicoCalc Keyboard Reset and I2C Recovery": never touch register 0x08; quiet-bus recovery.

## 15. Implementation status and findings (2026-10-24)

The port is implemented and runs on the device. This section records what was built, where it departs
from the plan above, and what the device measured.

### 15.1 Status by phase

| Phase | Gate | Result | Commits |
|---|---|---|---|
| P0 port seam | G1 host shots unchanged | passed (64-bit; the 32-bit build needs gcc-multilib, absent on the dev machine) | f136c3b, a9ff900 |
| P1 ESP-IDF project | G2 boots, calibrates, 13 worlds | passed | 64263b2 |
| P2 I2C worker | G3 keyboard and power drivers on the STM32 | passed: battery `{"pct":100,"charging":true}`, 0 I2C errors, 49.5 polls/s | 64263b2 |
| P3 SPI worker | G4 home screen on the glass | passed: the user saw the first frame on the glass (before the -O2 fix); after it, `shot` matches `out/01-home.png` in layout | 64263b2 |
| P4 console | G5 scripted tour | passed: REPL `1+2` → 3, sandbox loop stopped at 200 ms, flaky contained, display killed mid-flush and re-initialised | 64263b2, cf9f1e7 |
| P5 measurements | G6 numbers vs model | recorded below; no budget changes needed | — |

Physical key presses on the real keyboard are the only gate that needs a person. The driver path is
the same one that already reads the battery register correctly.

### 15.2 Departures from the design

- **World heaps are 8-aligned** (`heap_caps_aligned_alloc`, with realloc implemented as allocate + copy +
  free). QuickJS 2026-06-04 has its own arena allocator whose headers are `aligned(JS_MALLOC_ALIGN = 8)`.
  ESP-IDF's heap returns 4-aligned blocks: a probe showed `malloc(24) -> 0x48000a94`. glibc always
  returns 16-aligned blocks, so the host could not show this.
- **QuickJS is compiled with `-fwrapv -fno-strict-aliasing`** on both builds. At `-O2`, GCC 14.2 for
  RISC-V miscompiled QuickJS's 32-bit NaN-boxed values. The compositor's first paint crashed with a
  load access fault in `string_getc` (a JS string pointer read back as `0x9017be00`) on every boot.
  Both `-Og` and `-O2 -fno-strict-aliasing` run clean. The violating QuickJS code has not been
  identified.
- **`int32_t` locals for `JS_ToInt32`.** On RISC-V newlib, `int32_t` is `long`, so the nucleus' `int *`
  arguments were type errors there.
- **`shot` is encoded on its own task.** The kernel task copies the framebuffer, and a low-priority task
  encodes and prints it. Done on the kernel task, each shot stopped every world for about 2.5 s, and
  the keyboard fell from 49 to 33 polls/s during a tour.
- **The System app gained a cpu% column, and the compositor clamps right-aligned table cells.** Both
  came from a user report on the device: the turns counter grew past what short simulator scripts
  produce and painted over the next column.
- **`sys.stats()` gained `board` and `clock`**, so About describes the device truthfully.

### 15.3 Measured on the device vs the model

| Quantity | Model / simulator | Device |
|---|---|---|
| 100k-iteration loop | 133 ms (calibrated on 0101's build) | 115 ms at -O2 (calibration runtime), 124 ms in the sandbox world (PSRAM heap), 135 ms at -Og |
| fib(20) | 29.1 ms | 29.0 ms at -O2, 31.5 ms at -Og |
| world start | — | about 55 ms each; 13 worlds in about 0.8 s |
| first frame on glass | — | about 1.4 s after the kernel starts |
| keyboard poll rate | 50/s | 49.5/s idle, 48–49/s while typing, evaluating or sending shots |
| I2C occupancy | "about a third" | 26–28% |
| SPI efficiency | 40 MHz + 12 µs/chunk | 468,834 bytes in 120 ms of bus time (93.8 ms on the wire, about 78%) |
| lane busy | — | about 8% on the home screen, 18–23% with System open |
| compositor CPU | — | about 13 ms per turn on average, 8% of wall time with System open (its 500 ms refresh) |
| memory | — | 2,582 KB of JS heap across 13 worlds; 30.5 MB PSRAM and 193 KB internal free after boot |

The model was calibrated against an `-Og` build of QuickJS. At `-O2` the device is about 13% faster
than the simulator predicts. No world came near its budget in normal use.
