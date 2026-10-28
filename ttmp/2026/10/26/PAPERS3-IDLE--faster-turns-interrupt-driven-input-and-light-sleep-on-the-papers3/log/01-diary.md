---
Title: Diary
Ticket: PAPERS3-IDLE
Status: active
Topics:
    - papers3
    - esp32-s3
    - mquickjs
    - performance
    - power
DocType: log
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-26T23:57:49.531500875-04:00
WhatFor: ""
WhenToUse: ""
---

# Diary

<!-- Log entries in reverse chronological order (newest first) -->

## 2026-10-26 - Entry Title

<!-- Log entry content -->

## 2026-10-26 - Entry Title

<!-- Previous log entry -->

# Diary

## Goal

Make picocalc-os on the M5Stack PaperS3 cheap to run:

- no work when nothing happens;
- touch input driven by the GT911's interrupt line instead of polling;
- the ESP32-S3 in light sleep while idle;
- cheaper turns.

The guide is `design-doc/01-faster-turns-interrupt-driven-input-and-light-sleep-analysis-design-and-implementation-guide.md`.

## Step 1: Measurements on the device, the ticket and the guide

The PaperS3 had just run picocalc-os for the first time (PAPERS3-PORT). Its console showed an idle home
screen keeping the JavaScript lane 23% busy, mostly with a 20 ms touch poll. This step turned that into
a ticket. I read every part of the system the change touches:

- the kernel's timers, segments and rendering;
- the GPIO binding and the device's kernel task loop;
- M5GFX's GT911 handling;
- ESP-IDF 5.3.4's power-management options;
- mquickjs's bytecode API.

From that I wrote an intern guide with a phased plan, P0 (a profiler) through P6 (panel timing).

### Prompt Context

**User prompt (verbatim):** "Crate new docmgr ticket to make faster, and if possible to interrupt driven (does the language allow for that?) so we can save on power if the device is idle for example..."
**Follow-ups (verbatim, mid-step):** "Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable." and "ccommit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"
**Assistant interpretation:**

- A new ticket with an intern guide on making the PaperS3 port faster, interrupt-driven and able to
  sleep when idle, uploaded to reMarkable.
- Then implement it, committing as I go and keeping this diary.
- Answer whether JavaScript allows interrupt-driven code.

**Inferred user intent:** A tablet that lasts on battery and feels responsive, built within the OS's
world model, not around it.

### What I did

- Device measurements (firmware PAPERS3-PORT `c556a49` plus `flash.sh`), with
  `tools/s3cap.py --no-reset -c "1 stats" -c "12 stats"` over an 11 s idle window:
  - lane busy went from 16629.7 to 19185.1 ms, so 23%;
  - touch: 546 turns, 1598 ms;
  - compositor: 135 turns, 265 ms;
  - i2c1: 546 transfers.
- Boot log: `calibration on the real clock: the 100k loop took 415.5 ms (the model says 250), fib(20) 84.6 ms (the model says 68.4)`.
- Read the code paths:
  - `kernel.c` `run_segment`: every segment of a screen world calls `vm_render`;
  - `start_timers`, and `handle_event` `E_TICK`: timers are fixed, with no stop;
  - `vm_mqjs.c` `op_hw_gpio` and `op_gpio_get`: synchronous level reads only;
  - `main_s3.c` `kernel_task`: `if (wait > MS(50)) wait = MS(50)`;
  - `compositor.js`: `.every(100)` checks `waitFrame`, `.every(1000)` updates the clock and banners,
    and `focus()` already sends `focus` and `blur`;
  - all timers in the tree: `grep -rn "\.every(" js-papers3`.
- M5GFX for the PaperS3's GT911:
  - `M5GFX.cpp` sets `cfg.pin_int = GPIO_NUM_48`;
  - `Touch_GT911.cpp` makes INT an input with pull-up and reads data when `!gpio_in(pin_int)`, so
    INT is active low;
  - the report period is `5 + (reg 0x8056 & 0x0F)` ms.
- ESP-IDF 5.3.4 provides everything needed:
  - `esp_pm_config_t` has `light_sleep_enable`;
  - `gpio_wakeup_enable` and `esp_sleep_enable_gpio_wakeup` exist;
  - `CONFIG_USJ_NO_AUTO_LS_ON_CONNECTION` exists in `esp_driver_usb_serial_jtag/Kconfig`;
  - `CONFIG_FREERTOS_USE_TICKLESS_IDLE` exists, and `CONFIG_PM_ENABLE` is currently unset.
- mquickjs: `JS_PrepareBytecode`, `JS_PrepareBytecode64to32`, `JS_RelocateBytecode` and
  `JS_LoadBytecode` exist, so precompiled worlds are possible.
- Created the ticket (topics papers3, esp32-s3, mquickjs, performance, power; the last two added to
  the vocabulary), the guide, this diary and tasks for the guide plus P0–P6.

### Why

- The interrupt design keeps the OS's model: an interrupt becomes a message (decision 7.1). Running JS
  from an ISR is impossible, since the engine is single-threaded on core 1, and a new kind of
  preempting turn would undo the supervision model.
- Level-triggered interrupts, masked in the ISR and re-armed when the handling turn ends (decision
  7.2). The GT911 holds INT low until 0x814E is cleared, so an edge interrupt could miss a report.
- Profiler first (decision 7.4). Six plausible causes for 2–3 ms per segment, and none measured.

### What worked

- The answer to "does the language allow it?" is clean. Worlds are already event loops, and an
  interrupt is one more event source. Nothing in ES5 or mquickjs has to change; the work is in the
  kernel, the port and the simulator.

### What didn't work

- Nothing failed in this step. One measurement is known to be wrong and is flagged in the guide. The
  EPD worker's reported update times (1.8 ms for the last update) do not cover the waveform, because
  M5GFX's `display()` returns before the panel finishes. P6 fixes that with `waitDisplay()`.

### What I learned

- The biggest idle costs are not slow code but needless work:
  - a 20 ms poll whose answer is "nothing" 98% of the time;
  - a 100 ms check that matters for 500 ms after an app switch;
  - background apps re-rendering on their own timers.
- A turn costs milliseconds even when it does almost nothing. With the 100k loop at about 4 µs per
  iteration, the prelude's per-segment dispatch and Task code is a likely large share.

### What was tricky to build

- Keeping the simulator deterministic with interrupts. Today the GT911 model makes reports lazily, when
  read. An INT line means it must make them on its own schedule, on finger changes and every 10 ms
  while down, as kernel function events on the virtual clock (guide §6.1, Simulator).

### What warrants a second pair of eyes

- Whether a `sleep()` started inside a synchronous handler keeps that turn open (guide §6.2(a)). If it
  does, the compositor's one-shot waits need a detached-task helper. P1 checks it on the host before
  relying on it.
- The tickless-idle Kconfig comment ("not supported in SMP FreeRTOS yet") refers to the Amazon SMP
  variant. P4 must confirm that light sleep is actually entered.

### What should be done in the future

- P0 first: the profiler and a device baseline.

### Code review instructions

- Read guide §3 (orientation), §5 (analysis) and §6 (design). Check the measurements table in §4
  against `picocalc-os/out-s3/console-2.log`.

### Technical details

- Device port: `/dev/serial/by-id/usb-Espressif_USB_JTAG_serial_debug_unit_D0:CF:13:16:17:DC-if00`.
  Flash with `picocalc-os/port/esp32s3-papers3/flash.sh`; `idf.py flash` knocks the board off USB on
  this host.

## Step 2: P0, the profiler and the baseline

Added a cheap profiler to the device build and took a baseline on the PaperS3. A `callgrind` profile
of the host build attributed the cost inside a segment. The answer is clear: most idle work is
needless rather than slow. Touch polling and apps that nobody sees account for seven eighths of the
idle lane. The cost inside a segment is spread across the engine's allocation, collection, string
interning, concatenation and JSON, with no single hot spot.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** P0 of the guide: measure before changing anything.
**Inferred user intent:** Changes justified by numbers.
**Commit (code):** see the commit after this entry: "picocalc-os: prof"

### What I did

- `nucleus.h` and `kernel.c`. Per world, in real-time mode only, so host captures cannot change:
  - `prof_engine_us`: from segment start to before rendering;
  - `prof_render_us`: `vm_render`, its JSON and the frame comparison;
  - `prof_segments` and `prof_steps`.
  - Plus `W->gcs`, set in `vm_mqjs.c` `note_memory` from `JS_GetMemoryUsage`.
- `main_s3.c`:
  - kernel task wakeups and time blocked in `xQueueReceive`;
  - `prof` prints a window since boot or the last `prof reset`, per world: segments, segments/s,
    cpu, engine, render, other, ms/segment, steps/segment and collections.
- Device runs, logged in `picocalc-os/out-s3/prof-baseline.log` and `prof-baseline-2.log`:
  `./flash.sh`, then `s3cap.py --no-reset -c "8 prof reset" -c "18 prof"`. A second window was taken
  with the System app open.
- Host attribution:
  - `valgrind --tool=callgrind` of `papers3-host` with scripts `wait 1000` and `wait 11000`;
  - self-cost difference with `scripts/01-callgrind-idle-diff.py`, result in
    `various/callgrind-idle-10s.txt`.

### Why

- Decision 7.4 of the guide: six plausible causes for the per-segment cost, none measured.

### What worked

Baseline, idle home screen, 10 s:

```
prof over 10.0 s: the kernel task woke 974 times (97.1/s) and was blocked 74% of the time; worlds ran 2328 ms (23.2%)
  world        segs  segs/s    cpu ms  engine ms  render ms  other ms  ms/seg  steps/seg  gcs
  touch         996    99.3    1450.7     1420.3       15.3      15.1    1.46         68   26
  power           1     0.1       2.3        2.2        0.0       0.0    2.28         82    0
  display         2     0.2       6.7        6.6        0.0       0.0    3.35        150    0
  compositor    125    12.5     290.1      286.3        1.7       2.1    2.32        155    0
  launcher        2     0.2      35.4       28.7        6.7       0.0   17.70        191    1
  system         10     1.0     199.4      140.4       58.9       0.2   19.94        370    3
  faults         20     2.0     308.9      236.7       71.8       0.3   15.44        298   10
  about           2     0.2      34.8       28.2        6.6       0.0   17.41        186    1
```

- With the System app open: compositor 1237 ms in 10 s (7.6 ms/segment, painting the System app every
  second). The lane is 35% busy.
- Where the idle lane goes:
  - touch: 62%;
  - the four off-screen apps' timers: 25%;
  - compositor: 12%.
- Host callgrind, 10 s of idle = 116.5 M instructions. Self costs:
  - `JS_Call` (interpreter) 14.5%;
  - GC functions (`gc_thread_block`, `gc_mark_flush`, `gc_compact_heap`, `gc_mark`, `gc_mark_all`)
    together about 11%, plus `get_mblock_size` 3.5%;
  - `js_string_compare` 8.8% (889,001 calls, from unique-string interning);
  - `string_buffer_concat_str` 8.6%;
  - `gfx.c:glyph` 4.8%;
  - JSON parse functions about 5%;
  - libc `printf` for kernel JSON about 4%.
- Inclusive: `op_sys_worlds` (39 calls) accounts for about 45 M instructions, about 39% of idle.
  Faults (every 500 ms) and System (every 1 s) ask the kernel for the whole world list as JSON and
  parse it, even when off screen.

### What didn't work

- `callgrind_annotate` output parsing. The first diff picked up the auto-annotation call lines
  (`=> ...`) and summed inclusive costs into a "1324 M" total, larger than the program. Fixed by
  parsing only the table under the `file:function` header (`--auto=no`).

### What I learned

- Steps are a poor measure of work in this engine. `POLL_INTERRUPT` decrements only on calls, `goto`
  and conditional branches. A touch segment has 68 steps, yet 1.42 ms of engine time: allocation,
  interning, JSON and collection dominate, not interpretation.
- The touch world collects garbage every ~38 segments (26 collections in 996 segments). Each poll
  allocates Task objects, closures and the decoded result.

### What was tricky to build

- Keeping the profiler out of the deterministic host path. The kernel adds to `prof_engine_us` and
  `prof_render_us` only when `K.realtime` is set. `prof_segments` and `prof_steps` are plain counters
  that change no output. The host captures stayed byte-identical.

### What warrants a second pair of eyes

- `prof_engine_us` includes everything from segment start to rendering: the engine, the binding's C,
  and `boot_world` for start segments. "Other" is the remainder of the segment's cost (the frame
  publish).

### What should be done in the future

- P1–P3 remove most of this work. P5's per-segment work should target allocation in
  `__dispatch`/`__settle`, interning, and JSON on settles, in that order.

### Code review instructions

- `kernel.c` `run_segment` (`t_render`, the `prof_*` lines), `main_s3.c` `prof_reset` and `prof_print`.
- Validate: `make BOARD=papers3 shots && git status --short out-papers3` (empty); on the device,
  `s3cap.py --no-reset -c "2 prof reset" -c "12 prof"`.

### Technical details

- The host profile run takes about 30 s under callgrind. The difference method cancels boot, but the
  host's idle is not identical to the device's, because virtual timing differs.

## Step 3: P1 and P2, no work when nothing happens

Off-screen apps no longer tick or render. The compositor no longer polls. Its page-refresh hold, its
banners and its clock are one-shot sleeps. Timers can be stopped and started, and the kernel task no
longer caps its sleep at 50 ms. On the device, the idle home screen went from 23.2% to 15.2% of the
lane, and all of what remains is the touch poll, which P3 removes. Ten host captures changed at
first. After one design correction, made because the captures showed it was needed, six changed, all
in counts and timings. They now refresh more cleanly than before.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** P1 and P2 of the guide.
**Inferred user intent:** Stop the needless idle work the P0 profile found.
**Commit (code):** see the commit after this entry: "timers that stop, rendering only what is on screen"

### What I did

- Kernel (`nucleus/kernel.c`, `nucleus.h`):
  - `timer_off[]` and `timer_gen[]` per world, plus a `b` field on events that carries a tick's
    generation;
  - `start_timer`, and `kernel_timer_set(W, i, on)`: stopping bumps the generation, so scheduled ticks
    die; starting schedules a tick one period from now;
  - `E_TICK` drops stopped or stale ticks;
  - `K.front` (0 means render everyone, as the PicoCalc does);
  - `run_segment` renders only the front world, or a world with no frame yet.
- Binding (`vm_mqjs.c`):
  - `read_meta` reads `paused`;
  - `timer.set` op;
  - `sys.front` op, allowed only to the world that needs `frames`, i.e. the compositor. It also clears
    the new front world's last frame, so its next turn republishes.
- Prelude:
  - `.every(ms, fn, { paused: true })`;
  - `timers.start(i)` and `timers.stop(i)`;
  - `sys.front(name)`;
  - `__init` returns `paused`.
- Compositor:
  - `holdPage` (a detached `sleep(500)` with an identity check), `showBanner` (a sleep until expiry),
    `armClock` (a sleep to just after the next minute, re-armed on `time`), `updateClock`;
  - removed `.every(100)` and `.every(1000)`;
  - `focus()` calls `sys.front` and always waits for the app's fresh frame;
  - `onStart` names the launcher as front and sends it `focus`.
- Apps: launcher, system, faults and about declare their timer `paused`, start it on `focus` and stop
  it on `blur`.
- Power driver: samples every 60 s instead of every 10 s.
- `main_s3.c`: the kernel task blocks until `kernel_next_wake()`, or forever (`portMAX_DELAY`) when
  nothing is scheduled.

### Why

- P0 showed 25% of the idle lane in off-screen apps' timers and renders, and 12% in compositor ticks.
- The guide's open question about detached sleeps resolved itself. `__dispatch` makes a turn
  asynchronous only when the handler returns a thenable. A sleep the handler drops settles later in a
  segment of its own. `E_SETTLE` accepts it whenever the world is `W_IDLE`, which also covers worlds
  waiting in an async turn: "waiting" is derived from `in_turn`.

### What worked

- Device, idle home screen, 10 s (`out-s3/prof-p1p2.log`):
  `worlds ran 1523 ms (15.2%)`; touch 1004 segments, 1487 ms; launcher 2 segments; compositor,
  system, faults and about 0 segments (before: 125, 10, 20 and 2).
- System app open: compositor 30 segments, 1014 ms. That is 34 ms per paint of the System table, once
  a second: a P5 target.
- Banners: `crash flaky` shows the crash banner, then "flaky is running again", and both expire on
  their own (`out-s3/p1p2/shot-1.png`, `shot-2.png`). The launcher counts the crash while on screen.
- Host:
  - PicoCalc `make shots` unchanged;
  - PaperS3 deterministic across two runs;
  - conformance manifest: 11 pong lines as before;
  - `SAN=1`: 0 reports, identical captures.
- The tour script's panel busy time went from 6150 to 5550 ms. `03-system` shows the compositor at
  22 turns where it had 105.

### What didn't work

- First pass: 10 captures changed, and `33-touches.png` had lost a faint Z in the stroke pad.
  - That Z was an e-paper ghost. Before, the compositor presented the Touches app's cached frame,
    rendered in the background while the Sketch strokes were still among its last six, then
    corrected it with a partial update.
  - With rendering limited to the front world, cached frames become stale. The old shortcut ("if
    we have a tree, page-refresh at once") would now present stale frames as a rule.
  - Fix: `focus()` always holds the page refresh for the fresh frame, and `sys.front` clears the
    world's last frame so its focus turn republishes.
  - After that, 20, 22, 23 and 33 were byte-identical to before again. 03, 05, 06, 07, 21 and 25
    differ only in counts, timings, and the absence of an old ghost under the System list.
- `JS_ToBool` does not exist in mquickjs (`implicit declaration`, then a link error). The prelude
  passes a boolean, so the op compares with `JS_TRUE`.
- `sys.front` was first restricted to the world that *provides* `frames`, but no world does: the
  kernel publishes frames for the apps, and the compositor *needs* them. Changed to `world_needs`.

### What I learned

- Rendering only what is on screen and presenting cached frames do not mix. Whoever stops background
  rendering must make the foreground's first frame fresh.

### What was tricky to build

- Stopping a timer whose next tick is already in the event heap. The kernel does not search the heap.
  Each tick carries the timer's generation, and stale ones are dropped when they fire. Restarting
  starts a new chain.

### What warrants a second pair of eyes

- `armClock` takes `Date.now() % 60000`. If the RTC jumps backwards by more than the remaining
  interval, the next wake is at most a minute late. The `time` re-arm covers clock-driver updates.
- An `M_TICK` already in the mailbox when its timer stops is still delivered once.

### What should be done in the future

- P3: the touch poll is now the whole idle load (14.9% of the lane, 100 segments/s).

### Code review instructions

- `kernel.c`: `start_timer`, `kernel_timer_set`, `E_TICK`, the render condition in `run_segment`.
  `vm_mqjs.c`: `op_timer_set`, `op_sys_front`, `read_meta`. `compositor.js`: `focus`, `holdPage`,
  `showBanner`, `armClock`.
- Validate: `make shots && git status --short out` (empty); `make BOARD=papers3 shots` reproduces the
  committed `out-papers3`; on the device, `s3cap.py --no-reset -c "2 prof reset" -c "12 prof"`.

### Technical details

- Changed captures in this commit: `out-papers3/03-system.png`, `05-system-buses.png`,
  `06-system-display.png`, `07-about.png`, `21-faults-throw.png`, `25-display-back.png`.

## Step 4: P3, touch on the GT911's interrupt line

A pin interrupt is now a message. The kernel delivers `irq` to the world that holds the pin's handle,
masks the pin until that turn ends, and re-arms it then. The device port has an ISR that posts to
the kernel task's queue. The simulator's GT911 model got an INT line and its own 10 ms report
schedule. The touch driver reads only when INT says there is something to read. On the PaperS3, the
idle home screen now costs 0.4% of the lane, and the kernel task wakes 0.5 times a second instead of
97. A bug in the first version re-ran the driver's `onStart` on every interrupt until the handle table
ran out. The host captures showed it at once.

### Prompt Context

**User prompt (verbatim):** see Step 1 ("if possible to interrupt driven (does the language allow for that?)").
**Assistant interpretation:** P3 of the guide, the interrupt path end to end.
**Inferred user intent:** Input that costs nothing until someone touches the screen.
**Commit (code):** see the commit after this entry: "touch on the GT911's interrupt line"

### What I did

- `nucleus.h`:
  - `M_IRQ`, and `msg_t.irq` (the handle);
  - `handle_t.irq_mode` / `irq_pending`, and `IRQ_LOW/HIGH/FALLING/RISING`;
  - `world_t.turn_irq`;
  - `kernel_irq`, `hw_gpio_watch`/`unwatch`;
  - port API `port_gpio_watch/arm/unwatch`.
- `kernel.c`:
  - `kernel_irq` delivers `irq {pin, t}` to the handle's minter, at most one at a time;
  - `run_segment` records `turn_irq`;
  - `finish_turn` re-arms the pin.
- `hw.c`: `hw_gpio_watch/unwatch`. `handle_release` unwatches, so a crash or restart drops the
  interrupt with the world's handles.
- `vm_mqjs.c`:
  - `gpio.watch` / `gpio.unwatch` ops;
  - `vm_dispatch` passes `M_IRQ` to JS as an ordinary message (see "What didn't work").
- Prelude: `Handle.prototype.watch(mode)` / `unwatch()`.
- Device (`port_s3.c`, `s3.h`, `main_s3.c`):
  - the GPIO ISR service with `flags 0` (not IRAM);
  - `gpio_isr` masks the pin and posts `kmsg_t { irq }` to `s3_kq`;
  - `port_gpio_watch` configures the pin (pull-up for low and falling) and adds the handler;
  - `port_gpio_arm` calls `gpio_intr_enable`;
  - the kernel task's `kmsg_handle` calls `kernel_irq`.
- Simulator (`sim/papers3/gt911.c`, `board.c`, `papers3.h`):
  - `gt911_int(t)`: INT is low while a report waits;
  - `gt911_active()`: a finger is down or a lift is unreported;
  - a finger event or a 10 ms tick (`schedule_fn`, only while active) checks INT and calls
    `kernel_irq` when armed;
  - `port_gpio_get(48)` reads the line.
- PicoCalc sim and P4 port: `port_gpio_watch` returns -1; the others are no-ops.
- `drivers/touch.js`:
  - `watch("low")` on `gpio:48`, with `.on("irq")` reading status plus five points in one 41-byte
    transfer;
  - a 40 ms lift check while a finger is down;
  - a paused 20 ms poll used only if `watch` throws;
  - stats report the mode.
- `system.json`: touch claims `gpio:48`.

### Why

- Decisions 7.1 and 7.2 of the guide: a message, level-triggered with masking. M5GFX treats the
  PaperS3's GT911 INT as "low while a report waits", which makes level the right mode.
- The 40 ms lift check guards against the GT911 pulsing INT instead of holding it. A missed final
  report would otherwise leave a finger "down" for good. It runs only while a finger is down.

### What worked

- Device (`out-s3/prof-p3.log`):
  - boot log `gpio: GPIO[48]| InputEn: 1| ... Pullup: 1| ... Intr:4` (low level);
  - `handles` lists `{"id":2,"type":"gpio","claim":"gpio:48",...,"holders":["touch"]}`;
  - idle, 10 s:
    `prof over 10.0 s: the kernel task woke 5 times (0.5/s) and was blocked 100% of the time; worlds ran 35 ms (0.4%)`.
    Only the launcher's 5 s timer ran; touch had 0 segments.
- Host tour: 93 I2C transfers, against 842 for P2 and 581 before it. Touch turns in the System
  capture fell from 332 to 81. Total turns at the About screen fell from 829 to 243.
- Gates:
  - PicoCalc `make shots` unchanged;
  - PaperS3 deterministic over two runs;
  - conformance 11 lines;
  - `SAN=1` clean with identical captures;
  - S3 and P4 firmware build.

### What didn't work

- First host run: `touch crashed handling irq: Error: out of handles (native)`, with the stack at
  `hw.gpio` in `touch.js`'s `onStart`. The uart log showed `touch: touch controller GT911` every
  10 ms.
  - Cause: `__dispatch` picks `def.on[type]` for kind 0, a timer for kind 1, and otherwise
    `def.start`. `M_IRQ` is 3, so every interrupt re-ran `onStart`, which made new handles until
    `MAX_HANDLES` (128) ran out.
  - Fix: `vm_dispatch` passes `M_IRQ` as `M_ON`. To the world, an interrupt is a message of type
    `irq`.

### What I learned

- The simulated controller now reports every 10 ms while a finger is down, as the real one does. Its
  reports are read promptly instead of at the next 20 ms poll. The ink script's reports went from 66
  to 140, and Touches records 168 points instead of 97, so strokes are sampled twice as finely.

### What was tricky to build

- Keeping the simulator idle. The GT911 model's 10 ms tick chain must stop when no finger is down and
  no lift is unreported (`gt911_active`). Otherwise the virtual clock would carry an event every
  10 ms forever.

### What warrants a second pair of eyes

- `gpio_isr` builds a `kmsg_t` (about 240 bytes) on the interrupt stack and calls
  `gpio_intr_disable`, a flash function. Both are fine because the ISR service is not IRAM-only and
  the firmware never writes flash at run time. Revisit if either changes.
- What a real GT911 does with INT (held or pulsed) is unverified until fingers touch the panel. The
  lift check covers the pulsed case.

### What should be done in the future

- A real touch test on the device (Touches app, corners, a drag), then P4 (light sleep), which can
  now pay off: the kernel task is blocked 100% of the time.
- The charger pin (GPIO4) could also be watched instead of sampled.

### Code review instructions

- `kernel.c`: `kernel_irq`, `finish_turn`, `run_segment` (`turn_irq`). `hw.c`: `hw_gpio_watch`,
  `handle_release`. `port_s3.c`: `gpio_isr`, `port_gpio_watch`. `sim/papers3/board.c`: `int_check`,
  `touch_tick`, `finger`. `drivers/touch.js`.
- Validate: `make BOARD=papers3 shots` reproduces `out-papers3`; on the device,
  `s3cap.py --no-reset -c "2 prof reset" -c "12 prof"` should show no touch segments while idle.

### Technical details

- Re-baselined captures: `03-system`, `04-system-handles` (the `gpio:48` handle), `05-system-buses`,
  `07-about`, `30/31/32-sketch-*` (finer strokes), `33-touches` (168 points).

## Step 5: A two-minute window for real touches (milestone)

A 120 s capture with the Touches app on screen got no real touches; nobody touched the panel during
the window. The interrupt path with real fingers therefore remains unverified. The window did give a
longer idle measurement (`out-s3/touch-test/console.log`):

```
prof over 113.0 s: the kernel task woke 21 times (0.2/s) and was blocked 100% of the time; worlds ran 227 ms (0.2%)
  clock 4 segments, power 2, display 6, compositor 13 (the minute clock redraws and their panel updates)
```

- **Next:** repeat with someone at the panel (Touches app: corners, a drag), then P4.

## Step 6: Real touches on the interrupt line

Someone at the panel touched the Touches app. Every touch arrived through the GT911's interrupt line,
the coordinates match the screen with no transform, and the driver used no CPU outside the touches.
Two apparent problems in the screenshots were not input bugs. The "missing" lift was the newest event
hidden below the event list, and the absent gestures came from touches inside the app's ink pad, which
by design never become gestures. The list now keeps the newest seven events.

### Prompt Context

**User prompt (verbatim):** "ok", then "good" (after touching the panel), then "y was good i touched that smaller screen i think"
**Assistant interpretation:** The user touched the Touches app during the capture window; they touched the corners of the drawn pad, not of the screen.
**Inferred user intent:** Confirm that real touch input works with the interrupt-driven driver.
**Commit (code):** see the commit after this entry: "touches: keep the newest seven events"

### What I did

- A 100 s capture window (`out-s3/touch-test-2/`) with the Touches app cleared (`send touches back`),
  screenshots at 30, 60 and 95 s, and a `prof` at the end.
- A 10 s idle `prof` afterwards, to rule out a stuck finger keeping the 40 ms lift check alive.
- Read the compositor's `gesture()`: a touch that starts inside `inkArea` is forwarded as ink and
  returns before gesture recognition.
- `apps/touches.js`: keep 7 events (the lines that fit) instead of 8. Re-baselined `33-touches.png`,
  which now ends with `up #0 at 270, 300` where the old one hid it.

### Why

- The screenshots ended with `down #0 at 255, 376` and showed "gesture -". Either could have been a
  missed lift report or a wrong transform; both had to be ruled out before calling the interrupt path
  good.

### What worked

- Over 94 s with touches (`prof`):
  - touch: 1084 segments, 2516 ms, 2.32 ms/segment, 136 steps/segment, 47 collections;
  - Touches app: 74 segments (render 298.6 ms);
  - compositor: 120 segments, 14.8 ms each (ink forwarding and paints);
  - lane 5.2% over the whole window, which includes idle stretches.
- Idle afterwards: `the kernel task woke 1 times (0.1/s) ... worlds ran 0 ms (0.0%)`. No stuck finger.
- Mapping. Measured from the scaled pad:
  - dots at about (65–486, 202–466): the drawn box (x 40–500, y 176–476) with about 20 px inset;
  - a hold near the box's centre (`255, 376`);
  - a left-to-right drag at y ≈ 345.

  The user confirmed that y was right. `MAP` stays the identity.

### What didn't work

- My first reading of the screenshots: corners squeezed into a band, and a missing `up`. Both were
  artefacts:
  - the user had touched the pad's corners;
  - the eighth event did not fit in the list.

### What I learned

- The Touches app is a poor orientation test on its own. Its pad swallows gestures, and its corners
  are not the screen's. A home-screen tile tap is the unambiguous check.
- Real touches cost more than idle polls did per segment: 2.32 ms against 1.46 ms. The 41-byte read is
  decoded and the five points are sliced. There are far fewer of them, and none while nobody touches.

### What was tricky to build

- Nothing new. The diagnosis needed the compositor's ink rule and the app's line budget.

### What warrants a second pair of eyes

- Whether the GT911 holds INT or pulses it is still not settled. Either way works: the lift check
  covers pulses, and no stuck finger was seen.

### What should be done in the future

- P4: light sleep. The kernel task is blocked 100% of the time when idle.

### Code review instructions

- `js-papers3/apps/touches.js` (the event limit). Validate with `make BOARD=papers3 shots`, which
  reproduces `out-papers3/33-touches.png`.

### Technical details

- Touch window commands:
  `s3cap.py --no-reset -s 100 -c "1 send touches back" -c "2 prof reset" -c "30 shot" -c "60 shot" -c "95 shot" -c "96 prof"`.

## Step 7: P4 and P6, power management and real panel times

The firmware now runs under ESP-IDF power management. The CPU drops to 40 MHz when no lock is held, and
light sleep is allowed whenever every task waits. The kernel task holds a CPU lock only while worlds run.
The EPD worker holds full speed and no sleep for one whole panel update. The I2C worker holds the APB
clock during a transfer. The touch line is also a light-sleep wake source. The EPD worker now waits for
the waveform to finish (`waitDisplay`), so `stats` and `bus epd0` report the panel's real time (about
915 ms per full refresh) instead of the time to queue the update. That was P6.

What could not be measured here is light sleep itself. While a host holds the USB console open, the
USB-serial driver keeps a `NO_LIGHT_SLEEP` lock (95–97% of the time in every dump). With sleep blocked,
the FreeRTOS tick cannot be suppressed, so each core takes about 1000 ticks a second and climbs back to
240 MHz for each. On battery this lock goes away.

### Prompt Context

**User prompt (verbatim):** "continue", then "try again" (after the first flash attempt dropped the board off USB)
**Assistant interpretation:** Go on with P4 (light sleep), and retry the flash now that the board is back.
**Inferred user intent:** Make the idle device use as little power as the hardware allows, and verify it on the device.

### What I did

- `sdkconfig.defaults`: `CONFIG_PM_ENABLE`, `CONFIG_FREERTOS_USE_TICKLESS_IDLE` (sleep after 3 idle ticks),
  `CONFIG_USJ_NO_AUTO_LS_ON_CONNECTION` (stay awake while a host is on the console, so the console survives),
  `CONFIG_PM_PROFILING` (time in each mode for `pm`). `sdkconfig.qemu` turns PM off.
- `port_s3.c`:
  - `s3_pm_init` configures 240/40 MHz with light sleep and creates the locks:
    - kernel: `CPU_FREQ_MAX`;
    - epd: `CPU_FREQ_MAX` and `NO_LIGHT_SLEEP`;
    - i2c: `APB_FREQ_MAX`.

    It then calls `esp_sleep_enable_gpio_wakeup()`.
  - `s3_pm_hold/release`.
  - `port_gpio_watch` adds `gpio_wakeup_enable` at the pin's active level; `port_gpio_unwatch` removes it.
- `main_s3.c`:
  - the kernel loop holds `PM_KERNEL` from the moment it wakes until just before it blocks;
  - the `pm` console command (`esp_pm_dump_locks`);
  - `s3_pm_init()` first in `app_main`.
- `bus_s3.cpp`: the I2C worker holds `PM_I2C` around a transfer. The EPD worker holds `PM_EPD` from the
  push to `waitDisplay()`, which replaces the old `wait_idle()` after `display()`.
- `CMakeLists.txt`: `esp_pm`.
- The first flash failed (`Could not configure port: (5, 'Input/output error')`) and the board left USB.
  After the power button it came back. `flash.sh` then wrote all three images and booted the app.

### Why

- After P3 the kernel task was blocked 99–100% of the time, but the chip still ran at 240 MHz throughout.
  The idle work is gone, so the remaining cost is the clock and the chip staying awake.
- The EPD waveform is timed by the CPU in M5GFX's own task (`Panel_EPD::task_update`, which scans every
  line per frame through the i80 bus). A frequency change or sleep in the middle of it would distort the
  waveform, hence one lock for the whole update. Waiting in the worker is what makes that lock exact. It
  also gives real panel times (P6).

### What worked

- Boot, panel, touch and I2C are unchanged under PM. Tapping the System tile opened it, and the screenshot is correct.
- `stats` (after one boot and one tap): `bus epd0 busy 8722.87 ms, 8 transfers`. That is about 1.1 s per
  update, against a few ms before, when only the queueing was timed.
- Home screen, 37 s idle: `the kernel task woke 13 times (0.4/s) and was blocked 99% of the time; worlds ran 223 ms (0.6%)`.
- `pm` difference over 40 s of idle on the Home screen:

  | lock / mode | time | share | count |
  |---|---|---|---|
  | kernel CPU_FREQ_MAX | 0.33 s | 0.8% | 25 |
  | epd (both) | 0.62 s | 1.6% | 2 (the minute clock) |
  | i80_bus_lcd (M5GFX) | 0.35 s | 0.9% | 11880 |
  | usb_serial_jtag NO_LIGHT_SLEEP | 33.6 s | 84% | (the host's console) |
  | rtos1 CPU_FREQ_MAX | 11.8 s | 29.5% | 32660 (816/s) |
  | rtos0 CPU_FREQ_MAX | 4.9 s | 12.3% | 55726 (1393/s) |
  | mode CPU_MAX | 9.9 s | 24.8% | |

- Host gates: `make shots` and `make BOARD=papers3 shots` leave `out/` and `out-papers3/` unchanged.
  `./qemu.sh 30` builds without PM, boots the conformance worlds as before, and answers `pm` with
  "unknown command".

### What didn't work

- With USB connected, light sleep happened only 3–5 times in about 220 s. Those were most likely at boot,
  before the host opened the port. The `rtos0/rtos1` counts are the 1 kHz tick: with sleep blocked, tickless
  idle has nothing to skip to. Each tick takes the core to 240 MHz for about 360 µs, which costs more than
  all the worlds together. This is a property of the measurement setup, not of the firmware, but it means
  the battery case is still unmeasured.
- The first `prof reset` of the run was lost because the console was not yet attached. That profile
  covered boot instead, which explains the 200 ms first segments in `out-s3/p4/console.log`.

### What I learned

- `pm` (`esp_pm_dump_locks`) with profiling is the best idle instrument here. It shows who holds the chip
  awake, not just whether the kernel task is blocked.
- M5GFX's EPD task blocks on its queue between updates (`xQueueReceive(..., portMAX_DELAY)` when nothing
  remains). It is not a source of idle wakeups.
- `waitDisplay()` polls with `vTaskDelay(1)`. The EPD worker therefore wakes once per tick during an
  update, which is harmless because the update holds the CPU anyway.

### What was tricky to build

- The lock boundaries. The kernel loop has two places where it goes back without blocking (a due timer,
  or more messages). The lock must be released before the blocking `xQueueReceive` on every path, or the
  chip never sleeps. A forgotten release would show in `pm` as `kernel` near 100%, and it shows 0.8%.
- The QEMU build: PM must be off (QEMU does not model light sleep), and the `pm` command is compiled out
  with it.

### What warrants a second pair of eyes

- `gpio_wakeup_enable` sets the pin's interrupt type to the wake level. For a level watch (`IRQ_LOW`, the
  touch line) that is the same type. For an edge watch it would turn the interrupt into a level one. No
  edge watch exists yet. When one does, `port_gpio_watch` should only enable the wakeup just before sleep,
  or the ISR should handle the level.
- If the GT911 held INT low while a finger rests (rather than pulsing it), light sleep would wake again and
  again during a long press. That costs power only during touches.

### What should be done in the future

- Measure on battery:
  1. unplug USB on the Home screen and wait a few minutes;
  2. plug it back in and read `pm` (cumulative): `SLEEP` time and `light_sleep_counts` should then dominate.

  A USB power meter between charger and device would give the current directly.
- P5: faster turns. The System app's repaint is about 34 ms (250 ms render over 38 segments in the idle
  window, as it repaints once a second while in front).

### Code review instructions

- `port/esp32s3-papers3/main/port_s3.c` (`s3_pm_init`, the wakeup lines in `port_gpio_watch/unwatch`).
- `main_s3.c`, `kernel_task`: hold and release.
- `bus_s3.cpp`: the hold around each I2C transfer and EPD update.
- Validate:
  - `./flash.sh`, then `s3cap.py --no-reset -s 44 -c "2 pm" -c "42 pm"` on the Home screen. Compare the dumps:
    `kernel` and `epd` stay at a few percent.
  - `./qemu.sh 30` boots.

### Technical details

- Captures: `out-s3/p4/console.log` (boot, tap System, `pm`), `idle.log` (System in front: it repaints
  every second, so EPD 49%), `idle-home.log`, `idle-delta.log`.
- System app in front (38 s): display 62 segments, compositor 102 (31.97 ms each), system 38 (render
  250 ms). One panel update a second, which keeps the EPD lock held about half the time.
- `heap` after P4: `internal 87543 free (largest 31744), psram 3733896 free`; the kernel task's stack has
  28616 bytes never used.
