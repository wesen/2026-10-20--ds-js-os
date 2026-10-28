---
Title: 'Faster turns, interrupt-driven input and light sleep: analysis, design and implementation guide'
Ticket: PAPERS3-IDLE
Status: active
Topics:
    - papers3
    - esp32-s3
    - mquickjs
    - performance
    - power
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: picocalc-os/nucleus/kernel.c
      Note: turns, segments, timers (E_TICK), the lane; where interrupts become messages
    - Path: picocalc-os/nucleus/vm_mqjs.c
      Note: the engine binding; hw.gpio, rendering, the per-segment cost
    - Path: picocalc-os/port/esp32s3-papers3/main/main_s3.c
      Note: the kernel task's wait loop (the 50 ms cap), console, power management setup
    - Path: picocalc-os/port/esp32s3-papers3/main/bus_s3.cpp
      Note: bus workers and the kernel queue; PM locks for the panel and I2C
    - Path: picocalc-os/js-papers3/drivers/touch.js
      Note: the GT911 driver, polled every 20 ms today
    - Path: picocalc-os/js-papers3/system/compositor.js
      Note: the 100 ms and 1 s timers; focus and blur
    - Path: picocalc-os/sim/papers3/gt911.c
      Note: the host's GT911 model, which must grow an INT line
ExternalSources: []
Summary: 'Why picocalc-os on the PaperS3 burns 23% of its lane doing nothing, how to make input interrupt-driven within the world model, how to let the ESP32-S3 light-sleep when idle, and how to make turns cheaper; phased plan with measurements.'
LastUpdated: 2026-10-27T00:10:00-04:00
WhatFor: 'Onboarding and implementation guide for the performance and power work on the PaperS3 port'
WhenToUse: 'Read before changing timers, the touch driver, the kernel task loop, power management or the engine binding on the PaperS3'
---

# Faster turns, interrupt-driven input and light sleep on the PaperS3

*An analysis, design and implementation guide for a new intern. It assumes you can read C and JavaScript
and have never seen picocalc-os. Read §3 even if you know ESP-IDF: the OS's own model of time and work is
what this ticket changes.*

## 1. Executive summary

picocalc-os runs on the M5Stack PaperS3 since 2026-10-26 (ticket PAPERS3-PORT). The first device
measurements show a system that is correct but busy. On an idle home screen, with nobody touching
anything, the single "lane" that runs JavaScript is **23% busy**:

- the touch driver polls the GT911 controller every 20 ms, and each poll costs about 2.9 ms;
- the compositor wakes ten times a second to check a condition that is almost never true;
- apps that are not on screen keep their timers running, and they re-render on every one of them;
- the kernel task never sleeps longer than 50 ms.

The board is a battery-powered e-paper tablet. Its display holds its image with no power at all, so
an idle PaperS3 could have its CPU asleep almost all the time. Today it never sleeps.

This ticket does three things, in this order:

1. **Stop doing work when nothing happens.** Timers run only while they are needed. Apps that are not
   on screen neither tick nor render. The kernel task blocks until something is due.
2. **Make input interrupt-driven.** The GT911 has an interrupt line (GPIO48). The kernel turns an edge
   on it into a message for the touch driver, so the driver runs only when there is a touch to read.
3. **Let the chip sleep.** Use ESP-IDF power management: dynamic frequency scaling, automatic light
   sleep, and GPIO wakeup from the touch line. Hold power-management locks while a turn runs, the
   panel refreshes or an I2C transfer is on the wire.

Alongside those, **make turns cheaper**. Measure where a turn's 2–3 ms go first, then act on the
biggest causes. The candidates:

- arenas in PSRAM;
- cache configuration;
- the number of segments per poll;
- re-rendering worlds that nobody sees;
- engine start-up (about 200 ms per world).

**Does the language allow interrupt-driven code?** Yes. JavaScript has no interrupts and no threads, and
it does not need them. Every world in this OS is already an event loop: a set of handlers the kernel
calls when a message, a timer tick or a finished I/O arrives, exactly as a browser calls a click
handler. An interrupt is one more event source. The work is on the C side: an interrupt service
routine queues a note, and the kernel delivers it as a message (§6.1). Handlers are not preempted, so
an interrupt's latency is bounded by the turn that is running when it fires. That is soft real-time,
and on an e-paper tablet whose fastest refresh takes about 100 ms, it is plenty.

## 2. Problem statement and scope

**Problem.** On the device, with the home screen idle (measured 2026-10-26, 11 s window):

| | turns | CPU | share of the lane | per turn |
|---|---|---|---|---|
| all worlds | 721 | 2,555 ms | 23% | |
| touch driver (`.every(20)`) | 546 | 1,598 ms | 14.5% | 2.9 ms |
| compositor (`.every(100)`, `.every(1000)`) | 135 | 265 ms | 2.4% | 2.0 ms |
| everything else (app timers) | 40 | 692 ms | 6% | |

The CPU is at 240 MHz throughout, and the kernel task wakes at least 20 times a second. The battery
drains as if the tablet were in use.

**In scope:**

- kernel timer control;
- GPIO interrupts as messages;
- the kernel task's wait;
- render only what is on screen;
- ESP-IDF power management and light sleep on the PaperS3;
- the touch driver on interrupts;
- the simulator's GT911 interrupt line;
- profiling instrumentation and turn-cost reductions;
- measuring the panel's refresh time correctly.

**Out of scope:**

- deep sleep. It loses RAM, and with it every world's state. It would be a reboot, and the GT911's
  INT pin (GPIO48) is not an RTC pin, so it cannot wake the chip from deep sleep anyway.
- the PicoCalc and P4 ports' power behaviour, beyond keeping them building and their captures
  byte-identical;
- Wi-Fi.

## 3. Orientation: the parts of the system you need

### 3.1 Worlds, messages and turns

picocalc-os is an operating system of **worlds**. A world is one JavaScript program with its own heap
(an **arena**, a fixed block of memory), its own state, and a mailbox. Worlds never share memory. They
talk by sending messages (`send`, `ask`, `publish`). A world is declared with a builder in its file:

```js
driver("touch")                 // kind: driver, service, app or world
  .state({ polls: 0, down: {} }) // initial state, kept across turns
  .onStart(function (s) { ... }) // runs once when the world starts
  .every(20, function (s) { ... })   // a timer: runs every 20 ms
  .on("stats", function (s, m) { ... });   // a message handler
```

The kernel (`nucleus/kernel.c`) runs worlds one at a time on a single **lane**. One run of a handler
is a **turn**. A turn may be synchronous (the handler returns a value) or asynchronous (it returns a
`Task`, the prelude's promise). An asynchronous turn is split into **segments**. The first segment runs
the handler up to its first wait. Each later segment runs when an awaited operation **settles**: an
I/O result, a reply, or a `sleep` expiring.

```
            mailbox            lane (one at a time)
 message ─► [m3][m2][m1] ─► run_segment(W)  ── JS handler runs to completion or to its first wait
 tick    ─►                       │
 settle  ─► [s1] ────────────────►│ (settles are picked before new messages)
                                  ▼
                       cost charged to W, budget checked, frame re-rendered if W has a screen
```

Key facts for this ticket:

- **A turn is never preempted.** If a world runs for 40 ms, nothing else runs for those 40 ms. A
  per-world **budget** (`budget_ms`, default 50 ms; 600 ms while starting) turns a runaway handler
  into a crash instead of a hang.
- **Every segment of a world with a screen re-renders it.** `run_segment` calls `vm_render(W)`, which
  runs the world's `screen` function, serialises the frame to JSON and compares it with the last one.
  If it changed, the frame is published on the `frames` topic for the compositor. The work happens
  even for apps that are not on screen.
- **Crashes are supervised.** A crashed world restarts with backoff, and five crashes in ten seconds
  stop it.

Files: `nucleus/kernel.c` (`run_segment`, `pick`, `handle_event`, `kernel_run_until`),
`js-papers3/prelude.js` (`Task`, `__dispatch`, `__settle`, the builder).

### 3.2 Time: the virtual clock and the real one

The kernel keeps time in microseconds (`vtime_t`). It has two modes:

- **On the host (simulator), time is virtual.** `kernel_run_until(t)` runs every event and segment due
  before `t`. A segment's cost is *modelled* from the engine's step count and a per-board profile, so
  runs are deterministic: the same script produces the same PNG captures, byte for byte.
- **On the device, time is real** (`K.realtime = true`). `K.vnow` follows `port_clock()` (the ESP timer
  since boot), and a segment costs what it took.

The device's main loop lives in the port, in the kernel task (`main_s3.c`):

```c
for (;;) {
  drain s3_kq: console lines, finished bus transfers      // other tasks talk to the kernel only via s3_kq
  kernel_run_until(port_clock());                         // run everything that is due
  wait = kernel_next_wake() - port_clock();               // when the next timer, settle or lane slot is due
  if (wait > 50 ms) wait = 50 ms;                         // ← never sleeps longer than 50 ms
  xQueueReceive(s3_kq, &m, wait);                         // block on the queue, or time out
}
```

`kernel_next_wake()` already says exactly when the next thing is due. The 50 ms cap only adds empty
wakeups. It is the first thing to remove (§6.3).

### 3.3 Timers

`.every(ms, fn)` declares a timer. When the world starts, the kernel schedules an `E_TICK` event for each
timer (`start_timers`). When the event fires, the kernel puts an `M_TICK` message in the world's
mailbox and schedules the next tick. If the previous tick has not been handled yet, the new one is
dropped instead of piling up (`tick_queued`). Timers have no off switch: they tick from start until the
world stops, whether or not the app is on screen.

The timers in the tree today, all of which run all the time:

| World | Period | What it does | Needed when |
|---|---|---|---|
| touch | 20 ms | poll the GT911 status register | always, until interrupts replace it |
| compositor | 100 ms | check whether a held page refresh timed out (`waitFrame`) | only for 500 ms after an app switch |
| compositor | 1 s | update the clock text; expire banners | clock: once a minute; banners: when one is shown |
| system | 1 s | sample kernel stats; refresh the Display tab | only while the System app is on screen |
| faults | 500 ms | refresh the world list | only while Faults is on screen |
| launcher | 5 s | count running worlds | only while the launcher is on screen |
| about | 5 s | gather engine and uptime figures | only while About is on screen |
| power | 10 s | sample the battery ADC and charge pin | always, but once a minute is enough |
| clock | 60 s | read the BM8563 RTC | always (rarely) |

Apps already receive `focus` and `blur` messages from the compositor whenever they come to the front
or leave it (`compositor.js` `focus()`), so they know when they are visible. They just have no way to
stop a timer.

### 3.4 Asynchronous I/O: handles, buses and settles

A world reaches hardware through **handles**, capabilities the kernel grants against the world's
manifest **claims** (`"i2c1:0x5d"`, `"gpio:4"`, `"epd0"`, `"adc1:2"`). On the device, an I2C read goes:

```
touch.js                 s.dev.read16(0x814E, 1)                       → returns a Task
prelude.js               k("i2c.read16", ...) → kernelTask(promise id)
vm_mqjs.c / hw.c         op_i2c_* → deferred_t on the lane            (the turn's segment ends here)
kernel.c                 apply_deferred → bus_run_i2c(d)               (port)
bus_s3.cpp               req_t → q_i2c ──► i2c worker task (core 0) → lgfx::i2c transaction
bus_s3.cpp               kmsg_t {ok, json "[128]"} → s3_kq
main_s3.c (kernel task)  bus_s3_done(m) → kernel_settle_at(w, promise, ok, json)
kernel.c                 E_SETTLE → the world's settle queue → run_segment(W, settle)
prelude.js               __settle(id, ok, json) → the Task resolves → touch.js's .then runs
```

One touch poll is therefore **two segments**: the tick that starts the read, and the settle that
handles the status byte. Each segment pays the fixed costs of entering the engine, the prelude's
dispatch and Task machinery, and JSON for the result.

GPIO today is synchronous and read-only: `hw.gpio("gpio:4").get()` returns the pin's level
(`op_gpio_get` → `port_gpio_get`). There is no way to be told when a pin changes.

### 3.5 The device's tasks

```
core 1  kernel task   (prio 5, 32 KB stack)  worlds, the lane, rendering; blocks on s3_kq
core 0  bus_i2c1      (prio 6)               GT911 + BM8563 transfers via lgfx::i2c, one at a time
core 0  bus_epd0      (prio 4)               M5GFX Panel_EPD: setEpdMode, pushImage, display()
core 0  console       (prio 3)               USB Serial/JTAG lines → s3_kq
core 0  shot          (prio 2)               framebuffer → RLE → base64 on the console
        s3_kq         one queue into the kernel task; anything that wakes the kernel posts here
```

The single queue matters for this ticket: an interrupt service routine can post to it with
`xQueueSendFromISR`, and that is all the kernel task needs to wake.

### 3.6 Touch today

`js-papers3/drivers/touch.js` reads the GT911 (I2C 0x5D, 16-bit register addresses) every 20 ms:

```
every 20 ms:
  status = read16(0x814E, 1)            // bit 7: a report is ready; bits 0..3: number of points
  if !(status & 0x80): done             // nothing new (the usual case: 98% of polls)
  points = read16(0x814F, 8 * n)        // 8 bytes per finger
  write16(0x814E, [0])                  // hand the buffer back to the controller
  publish "touch" {id, x, y, phase: down|move|up}
```

The GT911 also drives an interrupt line, **INT on GPIO48** (M5GFX configures the PaperS3's GT911 with
`pin_int = GPIO_NUM_48`). M5GFX treats it as active low: the pin is an input with pull-up, and a low
level means a report is waiting (`Touch_GT911::getTouchRaw`: `if (!gpio_in(pin_int)) read...`). While
a finger is down, the controller makes a report every 5 + (register 0x8056 & 0x0F) ms, and holds it until
the host writes 0 to 0x814E.

### 3.7 The ESP32-S3's power machinery, in brief

- **Dynamic frequency scaling (DFS).** With `CONFIG_PM_ENABLE`, `esp_pm_configure()` sets a maximum and
  minimum CPU frequency. With no locks held, the CPU drops to the minimum.
- **Automatic light sleep.** With `light_sleep_enable = true` and FreeRTOS tickless idle
  (`CONFIG_FREERTOS_USE_TICKLESS_IDLE`), the chip enters light sleep whenever every task is blocked and
  no lock forbids it. Light sleep keeps RAM, PSRAM contents and CPU state, and stops the clocks. It
  ends at the next FreeRTOS timeout or at a configured wakeup source.
- **PM locks** (`esp_pm_lock_create/acquire/release`). `ESP_PM_CPU_FREQ_MAX` keeps the CPU at full
  speed, `ESP_PM_APB_FREQ_MAX` keeps peripheral clocks stable (I2C timing), and `ESP_PM_NO_LIGHT_SLEEP`
  forbids sleeping. Drivers take them while hardware is busy.
- **GPIO wakeup from light sleep** works on any GPIO: `gpio_wakeup_enable(48, GPIO_INTR_LOW_LEVEL)` plus
  `esp_sleep_enable_gpio_wakeup()`. Unlike deep sleep, it does not need an RTC pin.
- **USB Serial/JTAG and light sleep.** The S3's USB Serial/JTAG does not survive light sleep. IDF 5.3
  has `CONFIG_USJ_NO_AUTO_LS_ON_CONNECTION`: while a host is connected, a lock keeps the chip awake.
  On the bench the console works, and on battery the chip sleeps.
- **E-paper costs nothing to keep.** The ED047TC1 holds its image unpowered. Only updates cost energy:
  the panel's high-voltage supply (`pin_pwr` 46) is on during a waveform pass.

*Order of magnitude, from the ESP32-S3 datasheet and not yet measured on this board:* tens of mA
active at 240 MHz against well under 1 mA in light sleep. Measuring the board's real figures is a
deliverable of this ticket (§9, P4).

## 4. Measurements so far

Taken on the PaperS3 on 2026-10-26, firmware at PAPERS3-PORT `c556a49` plus `flash.sh`. All figures
come from the console's `stats`, `heap` and boot log, read with `tools/s3cap.py`.

| Measurement | Value | Note |
|---|---|---|
| Boot: 14 worlds started | about 3 s | each world start (prelude + file + `__init`) 180–260 ms of lane |
| Calibration: 100k-iteration loop | 415.5 ms | the profile assumed 250 ms (`loop_ms`); mquickjs is 1.66× slower than estimated |
| Calibration: fib(20) | 84.6 ms | |
| Idle lane load (home screen) | 23% (2,555 ms in 11 s) | |
| Touch poll turn (tick + settle) | 2.9 ms | 50 per second |
| Compositor turn, idle | 2.0 ms average | 12 per second |
| I2C transfer, 1-byte status read | 0.76 ms average on the bus | 3432 transfers, 2607 ms busy |
| Panel update | *not measured correctly yet* | M5GFX's `display()` returns before the waveform ends; the last update "took" 1.8 ms |
| Free memory after boot | internal 122 KB, PSRAM 4.25 MB | |
| Kernel task stack | about 4 KB used of 32 KB | `heap` reports 28,628 bytes never used |

What is not known yet, and is measured first (P0):

- how a turn's time splits between the engine, the prelude, JSON, rendering and the kernel;
- how often the kernel task wakes per second;
- how much faster mquickjs runs with its arena in internal RAM than in PSRAM;
- the board's current draw, awake and idle.

## 5. Analysis

### 5.1 Where the idle work comes from

Per second, idle, on the home screen:

| Source | Wakeups/s | Lane ms/s | Avoidable? |
|---|---|---|---|
| touch poll | 50 | 145 | yes: interrupt-driven (§6.1) |
| compositor `waitFrame` check | 10 | about 20 | yes: a one-shot `sleep` when it is armed (§6.2) |
| compositor clock and banner tick | 1 | about 2 | mostly: wake on the minute and at banner expiry |
| launcher, system, faults, about timers | 3.5 | about 60 (with re-renders) | yes: tick only while on screen (§6.2) |
| power | 0.1 | under 1 | keep; once a minute |
| clock | 0.017 | under 1 | keep |
| kernel task 50 ms cap | 20 | small CPU, but no sleep | yes (§6.3) |

After the changes, an idle PaperS3 should wake about twice a minute: once for the clock's minute change
(the compositor redraws the time) and once for the battery sample. Between wakeups it sleeps.

### 5.2 Why a turn costs 2–3 ms

A poll turn does very little JavaScript: a few property reads, one `read16`, one comparison. Yet it costs
2.9 ms. The rest is fixed overhead per segment, and every one of the following is a candidate until
measured:

1. **Arenas live in PSRAM.** Every world's heap is in octal PSRAM at 80 MHz behind a 32 KB data cache.
   mquickjs is an interpreter that walks objects, so its speed is bound by memory. Internal SRAM is
   several times faster on a cache miss.
2. **Cache configuration.** The S3 defaults to a 32 KB data cache with 32-byte lines. 64 KB with 64-byte
   lines is the usual setting for PSRAM-heavy workloads.
3. **The prelude's machinery.** Each segment enters `__dispatch` or `__settle`. Those create or
   resolve `Task` objects, run callbacks, and check for unhandled rejections. That is all JavaScript
   on a slow interpreter.
4. **JSON.** Results and messages cross the C/JS boundary as JSON text (`"[128]"`), parsed on every
   settle.
5. **Rendering.** Every segment of a screen world runs its `screen` function and stringifies the frame
   (§3.1). The touch driver has no screen, but the apps' timer turns pay for it.
6. **Kernel bookkeeping.** Mailbox, settle queue, heap of events, budget checks. This is C and should
   be small.

Calibration says the interpreter runs the 100k loop at about 4 µs per iteration (415 ms for 100,000
iterations of `s += i`). A segment that runs a few hundred such operations through the prelude's
dispatch and Task code is then already about a millisecond of pure JS, so item 3 is a likely large
share. The P0 profiler settles it.

### 5.3 Why boot takes 3 seconds

Each world start parses and runs the prelude (about 300 lines), then the world's file, then `__init`.
That is 14 parses of the same prelude. mquickjs can precompile to bytecode (`JS_PrepareBytecode` on
the host, `JS_LoadBytecode` + `JS_RelocateBytecode` on the target, and `JS_PrepareBytecode64to32` for
a 32-bit target from a 64-bit host). Running from bytecode skips parsing on every start and restart.
Bytecode loaded with `JS_LoadBytecode` is used in place for as long as the context lives. It costs RAM
for the relocated copy but saves arena space, because no parse trees or compiled functions sit in the
heap. This is a P5 investigation, not a commitment.

## 6. Design

### 6.1 Interrupt-driven input: a GPIO edge becomes a message

**The idea.** A world asks for interrupts on a pin it has claimed. The port installs an interrupt
handler. When the pin goes active, the ISR masks the pin's interrupt and posts a note to the kernel's
queue. The kernel delivers an `irq` message to the world. The pin stays masked until the world's turn
for that message has finished (including its asynchronous part), and then it is re-armed. If the line
is still active at that point, the next `irq` follows at once. That is the "interrupt masked while
handled" discipline of a level-triggered interrupt. No edge is lost, and a stuck line cannot flood the
mailbox.

**JS API** (new; the prelude's `Handle` gains one method):

```js
var int = hw.gpio("gpio:48");          // the claim must be in the manifest, as today
int.watch("low");                      // "low" | "high" | "falling" | "rising"; arms the interrupt
// ... the world receives messages of type "irq": { pin: 48, t: <kernel time, ms> }
.on("irq", function (s, m) { ... })    // a normal handler; may return a Task
int.unwatch();                         // stops interrupts from this pin
```

Semantics, precisely:

- At most one `irq` message per handle is pending at a time (like `tick_queued`).
- The pin is re-armed when the turn that handled the `irq` ends: when its Task settles, or when the
  world crashes and restarts (a restart drops all handles, so the new instance must `watch` again).
- `watch` on a level ("low"/"high") is the recommended mode for devices that hold their line until
  serviced, like the GT911. The edge modes are for buttons.

**Kernel** (`nucleus/kernel.c`, `nucleus/nucleus.h`):

```c
// a new message kind, delivered like any other
enum { M_ON, M_TICK, M_IRQ, ... };

// called by the port from the kernel task (never from the ISR), when s3_kq yields an irq note
void kernel_irq(int handle_id, vtime_t t) {
  handle_t *h = handle_find(handle_id);
  if (!h || !h->watching || h->irq_pending) return;
  h->irq_pending = true;
  msg_t *m = new_msg(M_IRQ, "irq", json("{\"pin\":%d,\"t\":%.3f}", h->addr, t / 1000.0), -1);
  m->irq_handle = handle_id;
  defer_deliver(h->owner, m);
}
// in finish_turn / crash: if the finished turn was an M_IRQ, re-arm
if (W->turn_irq_handle >= 0) { h->irq_pending = false; port_gpio_arm(h->addr, h->irq_mode); }
```

**Port API** (new, in `nucleus.h`; each port implements it, and the host's simulator too):

```c
int  port_gpio_watch(int pin, int mode, int handle_id);   // install the ISR, arm; 0 if OK
void port_gpio_arm(int pin, int mode);                     // re-enable after a handled irq
void port_gpio_unwatch(int pin);
```

**Device implementation** (`port_s3.c`):

```c
static void IRAM_ATTR gpio_isr(void *arg) {
  int pin = (int)arg;
  gpio_intr_disable(pin);                                  // masked until the kernel re-arms it
  kmsg_t m = { .irq_handle = handle_of_pin[pin], .t0 = esp_timer_get_time() };
  BaseType_t woken = pdFALSE;
  xQueueSendFromISR(s3_kq, &m, &woken);
  portYIELD_FROM_ISR(woken);
}
int port_gpio_watch(int pin, int mode, int h) {
  gpio_config(&(gpio_config_t){ .pin_bit_mask = 1ULL << pin, .mode = GPIO_MODE_INPUT,
                                .pull_up_en = 1, .intr_type = intr_of(mode) });
  gpio_install_isr_service(0);                             // once
  gpio_isr_handler_add(pin, gpio_isr, (void *)pin);
  gpio_wakeup_enable(pin, level_of(mode));                 // also wakes the chip from light sleep (§6.4)
  return 0;
}
```

`kmsg_t` grows an `irq_handle` field. The kernel task's queue loop calls `kernel_irq` for such notes.
`kmsg_t` is copied by value into the queue, which is safe from an ISR.

**Simulator** (`sim/papers3/gt911.c`, `sim/papers3/board.c`, `host/port_host.c`). The GT911 model
gets an INT line: low while a report is ready and not handed back. Today the model makes reports
lazily, when it is read. With interrupts it must make them on its own: when a finger goes down, moves
or lifts, and every 10 ms while one is down. It schedules a kernel function event (`schedule_fn`) at
that virtual time, which calls `kernel_irq` if the pin is watched and armed. Captures stay
deterministic, because everything still runs on the virtual clock.

**The touch driver, interrupt-driven:**

```js
driver("touch")
  .provides("touch")
  .state({ reports: 0, irqs: 0, errors: 0, down: {} })
  .onStart(function (s) {
    s.dev = hw.i2c("i2c1:0x5d", 400000);
    s.int = hw.gpio("gpio:48");
    return s.dev.read16(REG_ID, 4).then(function (b) {
      s.product = "GT" + String.fromCharCode(b[0], b[1], b[2]);
      return s.dev.write16(REG_STATUS, [0]);              // drop any stale report
    }).then(function () { s.int.watch("low"); });
  })
  .on("irq", function (s) {
    s.irqs++;
    // one transfer: the status byte and up to five points (1 + 40 bytes), instead of two
    return s.dev.read16(REG_STATUS, 41).then(function (b) {
      if (!(b[0] & 0x80)) return;                          // spurious, or already handed back
      report(s, b.slice(1), b[0] & 15);
      return s.dev.write16(REG_STATUS, [0]);              // INT goes high; re-armed when this turn ends
    });
  })
  .every(5000, function (s) { ... })                       // safety net: catch a report whose edge was missed
```

Cost model: idle, zero turns (plus one safety tick every 5 s). With a finger down, one turn per report,
two I2C transfers instead of three. That is 100–200 turns/s during a drag, which bounds the latency
at a report period (5–15 ms) plus whatever turn is running.

**Manifest.** The touch driver's entry gains the claim `"gpio:48"` in `js-papers3/system.json`.

### 6.2 Timers only when they are needed

Two mechanisms, smallest first.

**(a) One-shot waits instead of polling timers.** The compositor's 100 ms `waitFrame` check becomes a
`sleep` started when the wait is armed:

```js
function holdPageRefresh(s, app) {
  var token = ++s.waitToken;
  s.waitFrame = { app: app };
  sleep(500).then(function () {                    // runs as a settle segment of this world
    if (s.waitToken === token && s.waitFrame) { s.waitFrame = null; dirty(s, "page"); }
  });
}
```

Banner expiry works the same way: `sleep(until - now())` when a banner is shown. The 1 s clock tick
becomes a tick aligned to the next minute boundary: `sleep(60000 - now() % 60000)`, then re-armed.

*Check before relying on it:* a `sleep` started inside a synchronous handler must not keep that turn
open. If the prelude makes the turn wait for every Task it created, the wait must be detached (a
`spawn`-like helper in the prelude). P1 verifies this on the host first.

**(b) Timers that can be paused.** A kernel call stops or starts a declared timer by index:

```js
.every(1000, refresh)                     // timer 0
.on("focus", function (s) { timers.start(0); refresh(s); })
.on("blur",  function () { timers.stop(0); })
```

Kernel side: `W->every_on[i]`. `E_TICK` handling skips stopped timers but keeps the chain going.
Simpler still, `timers.stop` cancels the chain and `timers.start` schedules a fresh first tick
`every_ms` from now. Timers declared with `{ paused: true }` start stopped. Apps use focus and blur.
Drivers keep their timers running.

**(c) Render only the front world.** The compositor already knows which app is in front. It tells the
kernel through a new `sys.front(name)` (allowed only to the world that provides `"frames"`). The kernel
renders after a segment only if `W` is the front world or has never published a frame. Background
apps then cost nothing between messages, and the frames they publish when they return to the front
are fresh, because `focus` makes them render.

### 6.3 A kernel task that can sleep

```c
for (;;) {
  hold(PM_BUSY);                                       // full speed while worlds run (§6.4)
  drain s3_kq;
  kernel_run_until(port_clock());
  vtime_t next = kernel_next_wake();                   // VT_INF if nothing is scheduled
  release(PM_BUSY);
  TickType_t wait = next == VT_INF ? portMAX_DELAY : ticks_until(next);
  if (xQueueReceive(s3_kq, &m, wait)) handle(m);       // an irq, a console line or a bus result wakes it
}
```

No cap. When nothing is scheduled and no interrupt arrives, the task blocks forever and the idle task
lets the chip sleep. Correctness depends on everything that can create work posting to `s3_kq`, and
the inventory is short:

- bus workers (already do);
- the console task (already does);
- the GPIO ISR (new);
- the shot task (it does not create kernel work).

### 6.4 Power management

**Configuration** (`sdkconfig.defaults`):

```
CONFIG_PM_ENABLE=y
CONFIG_FREERTOS_USE_TICKLESS_IDLE=y
CONFIG_FREERTOS_IDLE_TIME_BEFORE_SLEEP=3
CONFIG_USJ_NO_AUTO_LS_ON_CONNECTION=y      # console on the bench keeps the chip awake
CONFIG_PM_PROFILING=y                      # during development: time spent in each mode
```

**Start-up** (`main_s3.c`):

```c
esp_pm_config_t pm = { .max_freq_mhz = 240, .min_freq_mhz = 40, .light_sleep_enable = true };
ESP_ERROR_CHECK(esp_pm_configure(&pm));
esp_sleep_enable_gpio_wakeup();            // touch INT (GPIO48), armed by port_gpio_watch
```

**Locks**, each held exactly while its hardware or work is active:

| Lock | Type | Held by | Why |
|---|---|---|---|
| `pm_kernel` | `ESP_PM_CPU_FREQ_MAX` | kernel task, from wake to block | turns run at 240 MHz, so budgets and calibration stay meaningful |
| `pm_epd` | `ESP_PM_NO_LIGHT_SLEEP` + `CPU_FREQ_MAX` | EPD worker, for a whole update | the waveform is timed by the CPU and the LCD peripheral |
| `pm_i2c` | `ESP_PM_APB_FREQ_MAX` | I2C worker, per transfer | I2C clock is derived from APB |
| (IDF) | `NO_LIGHT_SLEEP` | USB Serial/JTAG while connected | the console |

**An idle minute, after this ticket:**

```
t=0      the touch INT is armed; every world's mailbox is empty; next timer: clock text at t=60 s
         kernel task blocks (portMAX_DELAY or 60 s) → idle task → light sleep
t=23.4s  finger down → GPIO48 low → chip wakes → ISR → s3_kq → kernel task: irq → touch driver turn
         → publish "touch" → compositor gesture → app → frame → display present → EPD worker (lock held)
t=24.1s  panel update done; locks released; every task blocked → light sleep
t=60s    timer: the compositor redraws the clock → "quick" panel update → sleep
```

**What can break, and what to watch for:**

- the panel waveform running at the wrong speed if the EPD worker's lock is missing;
- I2C errors after DFS if `pm_i2c` is missing;
- USB console drops when not connected through a host (expected);
- the RTC driver's clock reading drifting across sleeps. The kernel's clock is `esp_timer`, which
  tickless idle keeps correct.

### 6.5 Faster turns

**Measure first (P0).** Add a cost breakdown to the realtime kernel. These counters are cheap
(`esp_timer_get_time` at boundaries) and compiled into the device build:

```
per world:   engine_us   (time inside JS_Call / vm_dispatch / vm_settle)
             render_us   (vm_render, JSON and strcmp)
             segments
kernel:      wakeups, idle_us (time blocked in xQueueReceive), kernel_us (the rest)
```

A `prof` console command prints them and `prof reset` zeroes them. The host build keeps the virtual
cost model, and the counters there are zero, so captures are unaffected.

**Experiments, then changes** (each one measured with `prof` and `bench` before and after):

1. **Arena placement.** Put the touch driver's and compositor's arenas in internal RAM. Internal RAM
   has about 120 KB free, and the compositor's live size is 83 KB, so its arena limit (448 KB) has to
   shrink. Compare `bench` with an internal arena against a PSRAM one, then decide per world. A
   manifest field `"fast": true` asks for internal RAM, with PSRAM as the fallback when it does not
   fit.
2. **Cache.** `CONFIG_ESP32S3_DATA_CACHE_64KB=y` and `CONFIG_ESP32S3_DATA_CACHE_LINE_64B=y`. Measure
   `bench`, a touch turn and a compositor paint.
3. **Fewer segments.** The touch read in one transfer (§6.1). The display driver's present already does
   one update per present.
4. **Prelude fast path.** Profile `__dispatch` and `__settle` with the step counter, and find the
   allocations per segment. Candidates: reuse the arguments array, skip unhandled-rejection
   bookkeeping when no Task was created, avoid `Array.prototype` helpers in hot paths.
5. **JSON on settles.** Small results (a byte array of up to 64 bytes) could cross as a JS array built
   directly in C (`JS_NewArray` + `JS_SetPropertyUint32`) instead of JSON text.
6. **Bytecode for starts** (§5.3). An investigation with a go/no-go based on boot time and arena use.

### 6.6 Measuring the panel

M5GFX's `Panel_EPD` queues an update to its own task and returns, so `displayBusy()` right after
`display()` does not cover the waveform. The EPD worker should wait with `waitDisplay()`, the
documented call that blocks until the panel is idle, and report that time as the update's `ms`. The
display driver's `busyMs` and the System app's Display tab then show real figures, and the
simulator's mode durations (450/300/120/60 ms) can be checked against the glass.

## 7. Decision records

### Decision 7.1: interrupts as messages, not callbacks

- **Context.** A world could be given a C-level callback for an interrupt, or a message.
- **Options.** (a) Run JS in the ISR: impossible, because the engine is not reentrant and runs on
  another core. (b) A dedicated "interrupt turn" kind with preemption. (c) A message.
- **Decision.** (c), a message of type `irq`.
- **Rationale.** It reuses everything: mailbox, budgets, crash supervision, tracing. A message is also
  what the simulator can produce deterministically.
- **Consequences.** Latency is bounded by the running turn, not by hardware. Fine for touch and
  buttons. Not for anything that needs microseconds, which belongs in a C driver.

### Decision 7.2: level-triggered with masking, re-armed when the turn ends

- **Context.** The GT911 holds INT low until 0x814E is cleared. An edge interrupt can be missed if the
  line never goes high between reports.
- **Decision.** A level interrupt, masked in the ISR, re-armed by the kernel after the world's turn
  for it has ended.
- **Consequences.** No lost reports, no interrupt storm. A driver that forgets to service its device
  gets one `irq` per turn instead of a flood. A 5 s safety timer in the touch driver covers the
  improbable case of a lost wakeup.

### Decision 7.3: light sleep, not deep sleep

- **Context.** Deep sleep saves more, but it resets the CPU and loses RAM.
- **Decision.** Automatic light sleep through ESP-IDF power management.
- **Rationale.** Every world's state survives, wake-up takes about a millisecond, and the touch line
  can wake the chip. GPIO48 is not an RTC GPIO, so deep sleep could not wake on touch anyway.

### Decision 7.4: measure before optimising turns

- **Context.** Six plausible causes for 2–3 ms per segment (§5.2).
- **Decision.** Build the profiler first (P0), and take turn-cost work in the order the profile
  dictates.

## 8. Key flows

### 8.1 A tap, interrupt-driven

```
GT911            INT↓ (report ready)
port_s3.c ISR    gpio_intr_disable(48); xQueueSendFromISR(s3_kq, {irq_handle})
kernel task      wakes (from light sleep if it was asleep); kernel_irq → M_IRQ to touch
touch            turn: read16(0x814E, 41) ──► i2c worker ──► settle ──► report → publish "touch" down
                 write16(0x814E, 0) ──► settle ──► turn ends ──► kernel re-arms GPIO48
compositor       "touch" down/up → tap → hit(x, y) → send(app, msg)
app              handler → state change → frame
compositor       paint → present ──► display driver ──► EPD worker (pm_epd held) ──► waitDisplay
everyone         blocked → idle → light sleep
```

### 8.2 The kernel's sleep decision

```
after kernel_run_until(now):
  next = kernel_next_wake()      // min(lane free & a world runnable, earliest event)
  release pm_kernel
  block on s3_kq until next      // portMAX_DELAY when next is VT_INF
  → FreeRTOS idle → esp_pm decides: no locks held → light sleep until the earliest timeout or GPIO
```

## 9. Implementation phases

| Phase | What | Validation |
|---|---|---|
| P0 | Profiler: per-world engine and render time, kernel wakeups and idle time, `prof` console command. Baseline on the device. | host captures byte-identical; `prof` on the device |
| P1 | Remove idle work without new kernel features: compositor `waitFrame` and banners via `sleep`, minute-aligned clock, power every 60 s, no 50 ms cap in the kernel task. | host captures (re-baseline only where timing-visible text changes, and review each); device `prof`: wakeups/s, idle % |
| P2 | Timer control (`timers.stop/start`, `paused`) and render-only-front (`sys.front`). Apps stop timers on blur. | host captures; conformance worlds; device idle load |
| P3 | GPIO interrupts as messages: kernel `M_IRQ`, port API, device ISR, simulator GT911 INT line; touch driver on `irq`; manifest claim. | host scripts (tour, ink, touches) with the INT model; device: Touches app, corner taps, drag smoothness, zero idle touch turns |
| P4 | Power management: PM config, locks, GPIO wakeup, USJ setting; `CONFIG_PM_PROFILING`; current measured with a USB meter, awake and idle. | device: time in light sleep, current draw, nothing broken (panel, I2C, console on the bench) |
| P5 | Faster turns: arena placement, cache, prelude fast path, settle without JSON; bytecode investigation. | `bench`, `prof` before and after each change; host captures |
| P6 | Panel timing measured with `waitDisplay`. | display driver `busyMs` against the simulator's model |

Each phase ends with a commit, a diary entry, and the device measurements behind it.

## 10. Test strategy

- **Host oracles.** `make && make shots` (PicoCalc) and `make BOARD=papers3 shots` must keep producing
  the committed PNGs. Where a change is meant to alter timing visible in a capture, re-baseline those
  captures in their own commit. Examples: the Touches app prints "tap … in 80 ms", and the system tab
  shows turn counts. Look at each changed PNG, and list them in the commit message.
- **Conformance worlds** (`js-papers3/test/`): extend with an `irq` world. A simulated pin that toggles,
  checks for one message per arm, re-arm after an async turn, and no delivery after `unwatch` or a
  restart.
- **Sanitizers.** `make BOARD=papers3 SAN=1 shots` after kernel changes.
- **QEMU** (`port/esp32s3-papers3/qemu.sh`) after kernel and port changes. QEMU has GPIO but no GT911,
  so interrupts are tested by a QEMU-only console command that injects an irq note into `s3_kq`.
- **Device**, through `tools/s3cap.py`:
  - `prof` and `stats` idle for 30 s: lane load, wakeups/s;
  - Touches app: corner taps and a drag;
  - Sketch: ink smoothness;
  - `heap`;
  - current draw with a USB power meter (needs the user).

## 11. Risks and open questions

- **GT911 INT mode.** The PaperS3's GT911 is configured active-low by its firmware config (M5GFX reads
  low as "ready"). If it turns out to pulse instead of holding, the level mode still works but may give
  one spurious `irq` per report. Rewriting the GT911's config block (with its checksum) is a last resort.
- **The INT pin at reset.** The GT911 samples INT during its reset to pick its I2C address. Our driver
  never resets the GT911, so it must not drive GPIO48. It only reads it.
- **Light sleep and the panel.** If an update starts while the chip is entering sleep, the waveform
  breaks. `pm_epd` must be taken before the first bus write.
- **Tickless idle with SMP FreeRTOS.** IDF's Kconfig notes tickless idle is "not supported in SMP
  FreeRTOS yet". IDF's default FreeRTOS on the S3 is the IDF dual-core variant, where it is supported.
  Verify that the option takes effect and that light sleep is entered (`esp_pm_dump_locks`, PM
  profiling).
- **Budgets at lower clock.** If a turn ever runs without `pm_kernel` held, it runs slower and may hit
  its budget. The lock is taken before the first world runs after every wake.
- **Determinism.** Every simulator change must keep the virtual clock the only source of time.

## 12. API reference

### 12.1 New world API (prelude)

| Call | Meaning |
|---|---|
| `h.watch(mode)` | arm interrupts on a GPIO handle; `mode` is `"low"`, `"high"`, `"falling"` or `"rising"` |
| `h.unwatch()` | stop interrupts from that handle |
| `.on("irq", fn)` | handler for `{ pin, t }`; the pin is re-armed when the turn ends |
| `timers.stop(i)` / `timers.start(i)` | stop or restart the world's i-th declared timer |
| `.every(ms, fn, { paused: true })` | a timer that starts stopped |
| `sys.front(name)` | the compositor names the world on screen (frames provider only) |

### 12.2 New port API (C)

| Function | Meaning |
|---|---|
| `int port_gpio_watch(int pin, int mode, int handle_id)` | install and arm the pin's interrupt and its light-sleep wakeup |
| `void port_gpio_arm(int pin, int mode)` | re-enable after a handled irq |
| `void port_gpio_unwatch(int pin)` | remove |
| `void kernel_irq(int handle_id, vtime_t t)` | kernel entry, called on the kernel task (device) or a scheduled function (host) |

### 12.3 Console additions (device)

| Command | Meaning |
|---|---|
| `prof` / `prof reset` | per-world engine and render time, kernel wakeups, idle time |
| `pm` | PM locks and time in each power mode (`esp_pm_dump_locks`) |
| `irq H` | QEMU only: inject an irq note for handle H |

## 13. Files to read, in order

1. `picocalc-os/js-papers3/drivers/touch.js`: the driver to convert.
2. `picocalc-os/js-papers3/prelude.js`: `Handle`, `Task`, `__dispatch`, `__settle`, the builder.
3. `picocalc-os/nucleus/kernel.c`: `run_segment`, `start_timers`, `handle_event` (`E_TICK`),
   `finish_turn`, `crash`, `kernel_run_until`, `kernel_next_wake`.
4. `picocalc-os/nucleus/vm_mqjs.c`: `op_hw_gpio`, `op_gpio_get`, `vm_render`, `vm_dispatch`,
   `vm_settle`.
5. `picocalc-os/port/esp32s3-papers3/main/main_s3.c`: `kernel_task`, `console_exec`, `app_main`.
6. `picocalc-os/port/esp32s3-papers3/main/bus_s3.cpp`: the workers, `s3_kq`, `bus_s3_done`.
7. `picocalc-os/port/esp32s3-papers3/main/s3.h`: `kmsg_t`, pins.
8. `picocalc-os/sim/papers3/gt911.c` and `board.c`: the simulated controller and the host's touch
   input.
9. `picocalc-os/js-papers3/system/compositor.js`: `focus`, the timers, `dirty`, `paint`.
10. ESP-IDF 5.3.4: `components/esp_pm/include/esp_pm.h`, `components/esp_hw_support/include/esp_sleep.h`,
    `components/esp_driver_gpio/include/driver/gpio.h`, `components/esp_driver_usb_serial_jtag/Kconfig`.
11. M5GFX: `src/lgfx/v1/touch/Touch_GT911.cpp` (INT handling), `src/M5GFX.cpp` (the PaperS3 setup).

## 14. References

- PAPERS3-PORT ticket: the port this builds on, its guide (§6, the architecture) and diary steps 4–7.
- ESP-IDF Programming Guide, Power Management and Sleep Modes (v5.3).
- GT911 programming guide (Goodix): registers 0x8040 (command), 0x804D (INT mode), 0x8056 (refresh
  rate), 0x814E (status), 0x814F (points).
- mquickjs `mquickjs.h`: the bytecode API (`JS_PrepareBytecode`, `JS_LoadBytecode`,
  `JS_RelocateBytecode`).

## 15. Status

| Phase | Status | Commit | Notes |
|---|---|---|---|
| Guide | written | a58dc65 | this document; reMarkable `/ai/2026/10/27/PAPERS3-IDLE` |
| P0 | done | f4f6d2d | `prof` console command; baseline: idle lane 23%, 62% of it the touch poll, 25% off-screen app timers |
| P1 | done | 6ce54c4 | compositor waits are one-shot sleeps; minute-aligned clock; power every 60 s; no 50 ms kernel cap |
| P2 | done | 6ce54c4 | `timers.stop/start`, `{ paused: true }`; `sys.front` renders only the world on screen (the check is `world_needs(W, "frames")`); focus always waits for the fresh frame. Idle lane 15.2% |
| P3 | done | a33628d, 50c673a | GPIO interrupts as `irq` messages; touch on GT911 INT (GPIO48) with a 40 ms lift check; verified with real touches. Idle lane 0.4%, kernel task 0.2–0.5 wakeups/s |
| P4 | done | bed309e, 064bbab | PM on: 240/40 MHz, light sleep, tickless idle; locks for kernel (CPU), EPD update (CPU + no sleep), I2C (APB); touch INT and the charger pin wake the chip; the power latch and panel pins keep their levels in sleep. On battery: 18 light sleeps, 24.5 s asleep in 53 s; reconnects on plug-in. A long untouched window and a current measurement remain |
| P5 | in progress | 137387a, f9ce3e9, 58f23ac, e39d113, 5a8e692 | per-op `prof`; glyph ink boxes; 32 KB I-cache and 64 B D-lines; retained painting with a host paint check; dirty bands; `sys.worlds(fields)`; the prelude compiled once to bytecode (plus an mquickjs atom fix). System repaint 109 → 31 ms, System screen lane 11.2% → 4.5%, world restart 150–180 → 10–25 ms, arena use −23 KB per world |
| P6 | done | bed309e | the EPD worker waits for `waitDisplay()`; `bus epd0` reports about 0.9–1.1 s per update |
