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

## Step 8: On battery: USB re-enumeration and the power latch

The first two unplug tests found two bugs in P4. Both are fixed, and the third test shows light sleep
working on battery: 18 sleeps and 24.5 s asleep in the 53 s between unplug and replug. The board then
reconnected the moment the cable went back in.

### Prompt Context

**User prompt (verbatim):** "I did, i m ucked about with it a bit", "sorry, i unplugged, then pressed power, then plugged back in. what should i do?", "ok", "plugged"
**Assistant interpretation:** The user ran the unplug tests on the bench and reported back after each.
**Inferred user intent:** See the idle board actually sleep on battery and come back on USB.

### What I did

- Test 1 (P4 as committed): after replug the host logged `device descriptor read/64, error -71`, `Device not
  responding to setup address`, then `unable to enumerate USB device`.
- Fix 1, `port_s3.c`: a `power_in` `NO_LIGHT_SLEEP` lock, held while external power is present.
  - The signal is the charger status pin, GPIO4, which is low while charging. The pin's interrupt watches
    for the opposite level each time.
  - While the pin is high, its low level is a light-sleep wake source, so plugging in wakes the chip.
  - First tried GPIO5, the USB-detect line in M5's PaperS3 demo (`hal.cpp`: `PIN_USB_DET GPIO_NUM_5 // 1:
    USB-IN`). It read 0 with USB in on this unit (new console command `gpio N`).
  - `s3_pm_init` moved after `port_s3_init`, which configures GPIO4 with its pull-up.
- Test 2: it re-enumerated at once on replug, but uptime was 31.7 s: the board had switched off on
  battery and booted from USB power.
- Fix 2, `bus_s3.cpp`: `gpio_sleep_sel_dis` for the power latch (GPIO44) and the panel's 15 pins.
  - `CONFIG_PM_SLP_DISABLE_GPIO` isolates every pin in light sleep. Setting it to `n` in
    `sdkconfig.defaults` had no effect: `CONFIG_ESP_SLEEP_GPIO_RESET_WORKAROUND` (default y on the S3)
    selects it.
  - That workaround exists because input pins can reset the S3 on an ESD pulse during light sleep, so it
    stays on and only these output pins are exempt.
- New console command `boot`: uptime and `esp_reset_reason()`.
- Test 3 (`out-s3/p4/battery-2.log`): unplugged at 17:15:49, replugged at 17:16:42; re-enumerated at once.

### Why

- Light sleep turns the USB Serial/JTAG pads off. IDF's `CONFIG_USJ_NO_AUTO_LS_ON_CONNECTION` lock is
  driven by SOF frames, which a host only sends after enumeration. A host plugged into a sleeping board
  sees the pull-up blink on each wake, but the chip is asleep again within 3 ms, so enumeration never
  completes.
- `s3.h` already said it: GPIO44 is "the power latch's off pulse: held low, or the board turns itself off".
  Isolated in sleep, it floats.

### What worked

- Test 3, `pm` (64.7 s since boot, about 11 of them on USB):
  - `SLEEP 40 M 24540523 37%`, `light_sleep_counts:18 light_sleep_reject_counts:0`;
  - the kernel held full speed 8% of the time;
  - the EPD locks 12% (boot refreshes and taps);
  - `power_in` count 1: it was taken again on replug.
- `./qemu.sh` still boots the conformance worlds (PM is off there; `boot` and `gpio` work).

### What didn't work

- GPIO5 as USB detect (see above).
- `CONFIG_PM_SLP_DISABLE_GPIO=n` in `sdkconfig.defaults` was overridden by a `select`.

### What I learned

- `pm` locks with profiling answer the questions a current meter would raise, short of the current itself.
  They show who keeps the chip awake and how long it sleeps.
- `gpio_wakeup_enable` already exempts its pin from sleep isolation (`gpio_hal_sleep_sel_dis`), so the
  touch and charger wake pins did not need it.

### What was tricky to build

- Telling the failures apart without a console on battery. Each test left only cumulative statistics
  since boot. The time since boot, compared with the host's USB log, told "was asleep and could not
  enumerate" (test 1) from "switched off" (test 2).

### What warrants a second pair of eyes

- Test 3's `boot` said `power-on` with an uptime that puts the boot at the unplug (17:15:49). That is
  either the user pressing the power button after unplugging, or a power dip on the switch from USB to
  battery. The user's answer: "it either was power dip or i accidentally pressed th ebutton, i tried
  unplugging a few times and it didn't reboot". Confirmed afterwards (`out-s3/p4/unplugs.log`): `up 330.8 s`
  through two more unplug and replug cycles, `power_in` taken 3 times, `light_sleep_counts:24`.
- With a full battery the charger stops and GPIO4 goes high even with USB in. A sleeping board then does
  not wake when plugged in; the power button is the fallback. A board that a host has already enumerated
  stays awake through IDF's lock.

### What should be done in the future

- An untouched idle window of several minutes on battery, for the sleep fraction at rest.
- A current measurement, if a USB meter is at hand.

### Code review instructions

- `port_s3.c`: `power_in_isr` and `s3_pm_init`.
- `bus_s3.cpp`: `KEEP[]`.
- `main_s3.c`: the `boot` and `gpio` commands.
- Validate:
  1. flash, then `s3cap.py --no-reset -s 5 -c "1 boot" -c "2 pm"`: `power_in` is active on USB;
  2. unplug for a minute, replug: the board re-enumerates;
  3. `boot` shows the uptime, and `pm` shows `light_sleep_counts` > 0.

### Technical details

- Host USB log: `journalctl -k | grep "usb 3-6"`.
- Logs: `out-s3/p4/usb-det.log` (GPIO5 = 0), `power-in.log`, `boot.log`, `battery.log` (test 2),
  `battery-2.log` (test 3).

## Step 9: P5 begins: where a System-app repaint goes, and faster glyphs

P5 is about making turns cheaper. The first target is the System app, which repaints once a second while
it is on screen. The profiler could not say what a compositor segment spends its time on, because time in
host calls counts as "engine". It now times every host operation, and the answer is clear. A repaint of
the System app costs the compositor 109 ms:

- 29 ms drawing text;
- 22 ms comparing the back and front framebuffers;
- 16 ms filling;
- about 37 ms in the interpreter and the collector.

Faster glyph drawing cut the text cost almost in half, to 94 ms per repaint. Fill and commit did not
move: they are bound by PSRAM bandwidth, not by their loops.

### Prompt Context

**User prompt (verbatim):** "what's next?", then "ok, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"
**Assistant interpretation:** Start P5 with the System app's repaint, the first item of the plan given in answer to "what's next?".
**Inferred user intent:** Faster, cheaper turns, measured on the device, with commits and this diary kept up to date.

### What I did

- `nucleus/vm_mqjs.c`:
  - `op_prof[]`, one entry per sync op (`SYNC_OPS`) and per async op (`sleep`, `ask`, `i2c`,
    `epd.update`);
  - `js_nucleus_k` and `js_nucleus_ka` add the time from entry, including the name lookup, to return;
  - real-time mode only, as with the other prof counters;
  - exported as `vm_op_prof` and `vm_op_prof_reset` (`nucleus.h`, `op_prof_t`).
- `main_s3.c`: `prof reset` clears the op times; `prof` lists the ops by total time.
- `nucleus/gfx.c`:
  - `gfx_fill` with 8-bit gray: `memset` per row, or one `memset` for full-width fills;
  - `blend` with 8-bit gray: `(v * 2185) >> 15` instead of `v / 15`, checked equal for every v in
    0..3825;
  - `glyph`:
    - a per-glyph ink box (`ink_boxes[FONT_COUNT][FONT_GLYPHS]`), computed the first time the glyph is
      drawn;
    - clipping done once per glyph instead of per pixel, and a row pointer.
  - `gfx_commit`: `equal()` compares words when both pointers and the length are word-aligned. It
    compares a whole 16-row band first, then row by row only in a band that differs.
- Measurement window: `s3cap.py --no-reset -s 32 -c "8 tap 111 276" -c "12 prof reset" -c "28 prof" -c "30 tap 104 907"`
  (System in front for 16 s). Logs: `out-s3/p5/system-baseline.log`, then `system-gfx.log`.

### Why

- The `prof` table from P0 put the System app's cost in the compositor, at about 34 ms per segment, but
  could not split it further. Host ops were the obvious unknown: the drawing primitives, the
  framebuffer diff, and the kernel queries.
- The glyph loop visited every pixel of a cell with two bounds checks and a nibble decode. Cells are
  sized to the font's largest glyph (31×25 for `s`), so most of each visit found nothing.

### What worked

- Baseline, System in front, 16 s (14 repaints):

  | world / op | before | after |
  |---|---|---|
  | compositor cpu | 1531.3 ms | 1315.2 ms |
  | `gfx.text` | 1232 calls, 406.8 ms (330 µs each) | 223.2 ms (181 µs each) |
  | `gfx.commit` | 14 calls, 21.8 ms each | 19.2 ms each |
  | `gfx.fill` | 482 calls, 231.2 ms | 236.6 ms |
  | `gfx.measure` | 1176 calls, 40 µs each | 36.5 µs each |
  | `sys.worlds` (System app) | 10.2 ms each | 10.5 ms each |
  | `sys.stats` | 2.5 ms each | 2.5 ms each |

- Per repaint, the compositor went from 109 ms to 94 ms.
- Host gates:
  - `make shots` (PicoCalc) and `make BOARD=papers3 shots`: `git status --short out out-papers3` is empty;
  - `make BOARD=papers3 SAN=1 shots`: no sanitizer report, and the captures are identical.

### What didn't work

- `memset` did not make fills faster on the device (491.9 µs per call against 479.6). The full-screen
  clear at the start of every paint writes 518 KB of PSRAM, which takes about 16 ms either way. That is
  roughly 32 MB/s: each cache line is read in before it is written, then written back.
- The word compare took commit only from 21.8 to 19.2 ms. Reading 2 × 518 KB is the cost.

### What I learned

- On this board, a full repaint is bound by PSRAM bandwidth. The clear, the redraw and the commit each
  touch the whole 518 KB framebuffer, and no inner-loop work changes that. The next gain has to come
  from touching less of it: repaint only what changed, and compare only rows that were drawn.
- `sys.worlds` costs 10 ms a call: the kernel's JSON for 14 worlds, and the app parsing it. That is the
  System app's own largest cost.

### What was tricky to build

- Keeping the glyph change pixel-exact. Only pixels with alpha 0 are skipped, as before, and the blend
  formula is exact over its whole input range. The captures confirm it: none changed.

### What warrants a second pair of eyes

- `ink_boxes` costs 5 bytes × FONT_COUNT × FONT_GLYPHS: 5.4 KB of internal RAM on the PaperS3. Glyph
  cells must stay under 256 pixels on each side for the `uint8_t` fields; the largest today is 93×79.
- The op timer includes the op-name lookup (`sarg` plus a linear `strcmp` over 45 names), which is part
  of the real cost of a call.

### What should be done in the future

- Retained painting in the compositor: redraw only the nodes whose content changed, and let the
  framebuffer record which rows were drawn so that commit compares only those.
- A cheaper `sys.worlds` for the System app.

### Code review instructions

- `nucleus/gfx.c` (`gfx_fill`, `blend`, `ink_box`, `glyph`, `equal`, `gfx_commit`); `nucleus/vm_mqjs.c`
  (`op_prof`, `js_nucleus_k`, `js_nucleus_ka`); `main_s3.c` `prof_print`.
- Validate:
  - `make shots && make BOARD=papers3 shots && git status --short out out-papers3` (empty);
  - on the device, the window above.

### Technical details

- Per repaint after this step: commit 19 ms, fill 17 ms (one full-screen clear plus 33 small fills),
  text 16 ms (88 calls), measure 3 ms, about 37 ms in the interpreter and the collector.

## Step 10: The caches

The new op timings showed host calls that do almost nothing costing tens of microseconds: `now` 73 µs,
`gfx.measure` 36 µs. That pointed at the caches, not at the code. The firmware ran with ESP-IDF's
defaults: a 16 KB instruction cache in front of flash, where all code runs, and a 32 KB data cache with
32-byte lines in front of PSRAM, where the arenas and framebuffers live. Four configurations measured on
the device settled it. A 32 KB instruction cache with 64-byte data lines took a System-app repaint from
94 ms to 58 ms, and the System screen's lane load from 11.2% to 7.1%. A 64 KB data cache added nothing.

### Prompt Context

**User prompt (verbatim):** see Step 9.
**Assistant interpretation:** Continue P5; the cache item in the guide's P5 list.
**Inferred user intent:** Faster turns, measured on the device.

### What I did

- Read the build's cache, flash and PSRAM settings:
  - `CONFIG_ESP32S3_INSTRUCTION_CACHE_16KB`, line 32 B;
  - `CONFIG_ESP32S3_DATA_CACHE_32KB`, line 32 B;
  - flash `dio` at 80 MHz; octal PSRAM at 80 MHz.
- Flash chip: `esptool.py flash_id` gives `Manufacturer: 46`, `Device: 4018`, 16 MB. M5's PaperS3 demo
  (`M5PaperS3-UserDemo/sdkconfig`) also runs DIO with the default caches.
- Built and flashed four cache configurations. Each ran the same window as Step 9 (System in front for
  16 s, about 14 repaints), plus `heap` and the boot calibration.
- Kept I 32 KB / D 32 KB with 64 B lines in `sdkconfig.defaults`.
- `sdkconfig.qemu` keeps the default caches.

### Why

- The interpreter, the binding and the drawing code together are much larger than 16 KB, and a turn
  alternates between them, so each host call refetched its path from flash. The framebuffer passes
  stream PSRAM, where a longer line means fewer transactions.

### What worked

| I-cache / D-cache (line) | compositor, 16 s | System app | lane | commit | text per call | internal free |
|---|---|---|---|---|---|---|
| 16 KB / 32 KB (32 B), before | 1315 ms | 379 ms | 11.2% | 19.2 ms | 181 µs | 87.5 KB |
| 16 KB / 64 KB (64 B) | 1081 ms | 354 ms | 9.6% | 14.3 ms | 174 µs | 49.9 KB |
| 32 KB / 32 KB (64 B), kept | 816 ms | 262 ms | 7.1% | 13.9 ms | 140 µs | 66.4 KB |
| 32 KB / 64 KB (64 B) | 845 ms | 245 ms | 7.2% | 14.0 ms | 134 µs | 34.3 KB |

- With the kept setting:
  - per-call overhead fell (`gfx.measure` 36.5 → 26.6 µs, `sys.worlds` 10.5 → 7.7 ms);
  - display driver 102 → 66 ms per 16 s;
  - idle on Home: `the kernel task woke 7 times (0.5/s) ... worlds ran 45 ms (0.3%)`;
  - the screenshot (`out-s3/p5/shot-1.png`) is correct.
- The 100k-loop calibration hardly moved, from 415.7 to 408.8 ms. A tight loop already fits in 16 KB.
- QEMU (`./qemu.sh 26`): after `sdkconfig.qemu` restored the default caches, the same `stats` table as
  before.

### What didn't work

- The first QEMU run with the new caches had 16 KB less internal RAM (307 KB against 323 KB free at
  boot), which is the only memory its arenas can use. Hence the QEMU override.

### What I learned

- On this chip, the instruction cache decides how much a host call costs, and the data-cache line size
  decides how fast the framebuffer passes are. The calibration loop measures neither, so it is a poor
  predictor of the OS's real speed.
- Each P5 change should be measured on the device: none of this is visible on the host or in QEMU.

### What was tricky to build

- Nothing in code. Each configuration needs `rm sdkconfig` before the build, because a generated
  sdkconfig overrides `sdkconfig.defaults`.

### What warrants a second pair of eyes

- Internal RAM free after boot is now 66 KB (largest block 31.7 KB). The workload's own internal
  allocations are made at boot (task stacks, queues, M5GFX's DMA line buffers), but a new driver that
  needs internal DMA memory should check this figure.
- QIO flash would speed instruction-cache misses further. It is untried: M5's own firmware uses DIO, and
  whether the board wires the flash's two extra data lines is unverified.

### What should be done in the future

- Retained painting in the compositor. Per repaint, the full clear (about 11 ms) and the full diff
  (14 ms) remain, plus about 25 ms in the interpreter.
- A cheaper `sys.worlds` (7.7 ms per call).

### Code review instructions

- `port/esp32s3-papers3/sdkconfig.defaults` (the cache block), `sdkconfig.qemu`.
- Validate: `rm sdkconfig && idf.py build && ./flash.sh`, then the Step 9 window. Expect the compositor
  near 820 ms per 16 s with System in front.

### Technical details

- Logs:
  - `out-s3/p5/system-cache.log` (32/64);
  - `system-cache-I16_D64.log`;
  - `system-cache-I32_D32.log`;
  - `cache-final.log` (the kept setting, with the idle window and `pm`).

## Step 11: Retained painting

The compositor used to repaint the whole 540×960 screen for every change: clear it, draw every node, then
compare all 518 KB with the front buffer. It now redraws only the nodes whose content changed, and the
framebuffer records which rows were written, so commit compares only those rows. On the device, a
System-app repaint went from 58 ms to 33 ms and the screen's lane load from 7.1% to 5.0%.

The rule was that a retained paint must produce exactly the pixels of a full paint. A host-only check
mode verifies it: after each retained paint it hashes the framebuffer, paints in full and compares. All
four tours and a stress script ran 119 checked retained paints with no difference.

### Prompt Context

**User prompt (verbatim):** see Step 9.
**Assistant interpretation:** Continue P5, with the next item from Step 10's list.
**Inferred user intent:** Faster turns, measured on the device, without changing what the screen shows.

### What I did

- C (`nucleus/gfx.c`, `nucleus.h`, `hw.c`, `vm.c`, `vm_mqjs.c`):
  - `dmabuf_t.dirty_y0/dirty_y1`. `touch()` widens the range in `gfx_fill`, `gfx_line` and `glyph`.
  - `gfx_commit` starts at the first dirty band, stops at the last, and resets the range.
  - `gfx_invalidate` (shared by both bindings) and allocation mark every row dirty.
  - `gfx_hash` (FNV-1a over back) and the `gfx.hash` op; the prelude gained `Handle.prototype.hash`.
- `js-papers3/system/compositor.js`:
  - `draw(fb, n, x, y, w, h, o, bg)` takes the node drawn in the same box last time:
    - `same(n, o)`: `keep`, i.e. replay its regions (and its ink area);
    - the same container or table, equal but for `kids`/`rows`: `redraw`;
    - otherwise clear `o._e` to `bg` and draw `fresh`.
  - Recorded on each node: `_b`, the box; `_r`, the regions; `_e`, the box plus a list's scroll bar or an
    ink pad's border, plus its children's `_e`; `_ink`.
  - `stack` and `row` compare every kid's box before drawing anything, and return false if one moved.
    The caller then clears the whole container and draws it fresh.
  - `drawTable(…, o, bg)`: the header is kept, and each changed row is cleared to `bg` and redrawn. It
    returns false if the shown range moved.
  - `paint(s, full)`:
    - the title bar (`topKey`: title, clock, battery) and the footer (`focus|hint`) are repainted only
      when their key changes;
    - the chip regions are always re-registered, after the body's, so `hit()` order is unchanged;
    - a full paint happens for a new focus, a banner (or the paint after one), an app without a tree,
      and `page` presents.
  - `paintcheck`: `{}` turns on the check, `{report: true}` logs the counts. `where` reports paints,
    retained paints and checks.
- Ticket scripts: `scripts/02-paintcheck.sh` runs every tour plus `scripts/02-paintcheck-stress.txt` (a
  check-only script) with the check on.

### Why

- Step 10 left a repaint at 58 ms: about 11 ms of full clear, 14 ms of full diff and 12 ms of text, each
  covering the whole screen. In the System app only a few cells, the graph and the lane percentage change
  each second.
- Clearing a changed node's box to the background behind it reproduces what a full paint has there:
  paper, or the nearest ancestor's `bg`, before the node draws.

### What worked

- Paint check (`02-paintcheck.sh`):
  - faults 3, ink 23, repl 12 and tour 7 retained paints, all equal to a full paint;
  - the stress script: 74 of 74 equal. It covers System for 12 s, picking a row (the error line appears
    and goes, which moves the layout), all four tabs, swipes, a crash banner, the Touches pad, Sketch
    strokes and a clock-minute update on Home.
- Device, System in front for 16 s (`out-s3/p5/system-retained.log`):

  | | Step 10 | now |
  |---|---|---|
  | compositor | 816 ms | 462 ms |
  | `gfx.text` calls | 1232 | 238 |
  | `gfx.fill` | 153 ms | 30 ms |
  | `gfx.commit` per call | 13.9 ms | 6.6 ms |
  | lane | 7.1% | 5.0% |

  Idle on Home: `worlds ran 42 ms (0.5%)` over 8 s. The device's System and Sketch screenshots
  (`out-s3/p5/retained/`, `retained-sketch/`) are correct.
- Captures:
  - PicoCalc: byte-identical;
  - PaperS3: deterministic over two runs and identical under `SAN=1`, with no sanitizer report.
  - Five changed, all through timing (see below).

### What didn't work

- The gate could not stay byte-identical. The simulator charges virtual time per glyph and per pixel
  filled, so drawing less makes the compositor's turns cheaper:
  - `03-system`: the turns and cpu columns (plus 1 KB in two worlds' arenas from the larger prelude);
  - `30/31/32-sketch-*`: the third stroke now ends at about (402, 681) instead of (395, 677). The
    script's swipe ends at (400, 680): the compositor handles ink events sooner;
  - `33-touches`: 171 points recorded instead of 168, for the same reason.
- That is why the correctness argument rests on the paint check, not on the captures.

### What I learned

- A retained painter needs a correctness oracle independent of its own logic. Comparing each retained
  paint with a full paint in the same run is cheap on the host and leaves nothing to inspect by eye.
- After this step the compositor's cost is mostly interpreter time: 1905 steps per segment, and about
  20 ms of each 33 ms repaint is not in host calls. Next come layout (`measure` runs again at every
  level of `stack`) and the comparisons.

### What was tricky to build

- Pixels outside a node's box: a list's scroll bar (8 px right of the rows) and an ink pad's 1 px
  border. Clearing only the box would leave the old ones. `_e` records how far a node's pixels reach,
  including its children's.
- Order of regions. `hit()` takes the last region drawn, so kept nodes replay their regions in tree
  order, and the footer's chips are registered after the body even when the footer is not redrawn.
- A container with a border and padding below 2 px: its children's boxes cover the border, so clearing
  a child would erase it. Such containers always redraw whole.

### What warrants a second pair of eyes

- Glyph ink left of the pen. A proportional glyph's cell starts `pad` px left of the pen, so a glyph
  could ink outside its node's box, and a retained clear would not remove it. The checks found no case,
  but `_e` does not account for it.
- `same()` walks whole subtrees each paint. For large trees (a long REPL history) its cost should be
  watched in `prof`.

### What should be done in the future

- Measure the compositor's interpreter time by function (`measure`/`stack`, `same`, `draw`).
- The System app's `sys.worlds`: 7.9 ms per call.

### Code review instructions

- `js-papers3/system/compositor.js`: the "retained painting" block (`same`, `keep`, `reach`, `finish`,
  `redraw`, `draw`, `fresh`), `stack`, `drawTable`, `paint`, and the `draw` handler.
- `nucleus/gfx.c`: `touch`, `gfx_commit`'s loop bounds, `gfx_invalidate`, `gfx_hash`.
- Validate:
  - `make shots` (PicoCalc unchanged); `make BOARD=papers3 shots` (deterministic);
  - `sh ../ttmp/.../scripts/02-paintcheck.sh` (every line "0 differed");
  - on the device, the Step 9 window.

### Technical details

- The check's extra full paints are counted in `paints`, so "74 of 166 paints retained" means 74
  retained, 74 check paints and 18 full paints.

## Step 12: Dirty bands and shorter world lists

Two smaller changes, both from a timing experiment on the device. A System repaint's 33 ms split into
19 ms in `paint`, 9 ms in commit, and 4.3 ms decoding the app's frame JSON. Commit was comparing more
rows than were drawn: a single min..max row range from the graph near the top to a table row near the
bottom spans most of the screen. Framebuffers now keep a bitmask of 16-row bands instead. And
`sys.worlds` returned every field of every world, where each app needs a few, so it now takes a field
list. With System in front the lane is now 4.5%.

### Prompt Context

**User prompt (verbatim):** see Step 9.
**Assistant interpretation:** Continue P5 with the items Step 11 left.
**Inferred user intent:** Faster turns, measured on the device.

### What I did

- Experiment, not committed. `now()` stamps around `paint`, `commit` and the frame decode, with averages
  logged every 14 paints. Device result:
  `PT paints 14 retained 11 paint 19.23 commit 9.33 frames 4.32 (18)`. The files were restored from
  copies afterwards.
- `dmabuf_t.dirty` is a `uint64_t` of 16-row bands. Bit 63 also covers the rows beyond 1024.
  - `touch()` sets a band range;
  - `gfx_commit` skips clean bands, then clears the mask;
  - allocation and `gfx_invalidate` set every bit.
- `kernel_worlds_json_fields(fields)`:
  - `fields` is a comma-separated key list, NULL or "" meaning all;
  - the keys come out in the old order, so the full output is unchanged;
  - `kernel_worlds_json()` calls it with NULL.
- `sys.worlds(fields)` in the prelude and the `sys.worlds` op. Callers ask for what they use:
  - System: name, state, turns, cpu_ms, mem_kb, limit_kb, last_error;
  - Faults: name, state, restarts, last_error;
  - the launcher and About: state, which they count.

### Why

- Commit cost is proportional to the rows compared. Bands match the granularity commit already used.
- `sys.worlds` cost 7.9 ms a call after Step 11, the System app's largest item: about 4 KB of JSON
  formatted with `printf` and parsed back into 14 objects of 15 fields each, most never read.

### What worked

- Device, System in front for 16 s (`out-s3/p5/system-bands.log`):

  | | Step 11 | now |
  |---|---|---|
  | `gfx.commit` per call | 6.6 ms | 4.9 ms |
  | `sys.worlds` per call | 7.9 ms | 5.5 ms |
  | compositor | 462 ms | 435 ms |
  | System app | 270 ms | 220 ms |
  | lane | 5.0% | 4.5% |

- Band mask alone: every capture on both boards byte-identical.
- The paint check is unchanged: 119 retained paints, 0 differed.
- With the field lists, PicoCalc is unchanged (its binding asks for all fields). On the PaperS3,
  `03-system.png` changed only in the KB column: launcher 38 → 36 KB, system 39 → 40 KB.

### What didn't work

- Nothing failed. The gains are smaller than in Steps 10 and 11: what remains is mostly interpreter
  time.

### What I learned

- After Steps 9–12 a System repaint costs the compositor about 31 ms, against 109 ms at the start of
  P5. Most of what is left runs in the interpreter: the compositor's layout and comparisons (about
  14 ms), decoding the frame (about 4 ms), and the app's own render and sampling.

### What was tricky to build

- `FIELD()` keeps the separator logic in one place. The output is byte-identical to the old function
  when every field is asked for; the PicoCalc captures check that through its System app.

### What warrants a second pair of eyes

- `wants()` matches whole keys between commas, so "state" does not match "states".

### What should be done in the future

- World start-up. Every world's first segment costs about 200 ms on the device, mostly compiling the
  prelude, so boot takes about 3 s and every crash restart pays the same. mquickjs can precompile
  bytecode (`JS_PrepareBytecode`, `JS_LoadBytecode`).

### Code review instructions

- `nucleus/gfx.c` (`touch`, the band loop in `gfx_commit`); `nucleus/kernel.c`
  (`kernel_worlds_json_fields`, `wants`); `nucleus/vm_mqjs.c` (`op_sys_worlds`); `js-papers3/prelude.js`;
  the four apps.
- Validate: `make shots` (unchanged), `make BOARD=papers3 shots`, `02-paintcheck.sh`, then the device
  window from Step 9.

## Step 13: The prelude compiled once (and an engine bug it exposed)

Every world used to parse the 341-line prelude when it started, which took 143 ms on the device: most of
a world's start, about 2 s of every boot, and the bulk of every crash restart. The binding now compiles
the prelude once to a bytecode image, and each world loads a copy instead of parsing. A world's restart
went from about 150–180 ms to 10–25 ms, and its live arena use dropped by about 23 KB on the device,
because the prelude's code no longer lives inside the arena.

It took two wrong turns to get there. One image shared by all worlds broke every world after the first.
Copies per world then broke property names as soon as the collector ran. The second problem is an
mquickjs bug, now patched (`PATCHES` item 4).

### Prompt Context

**User prompt (verbatim):** see Step 9.
**Assistant interpretation:** Continue P5, with world start-up from Step 12's list.
**Inferred user intent:** Faster turns and starts, measured on the device.

### What I did

- Timing experiment, not committed: `vm_create` logged the time of each start phase. Device result:

  ```text
  BOOT touch prelude 143.3 file 20.8 init 1.3 gc 6.0 ms
  BOOT compositor prelude 132.8 file 254.5 init 1.8 gc 14.0 ms
  BOOT launcher prelude 142.6 file 10.5 init 1.0 gc 7.3 ms
  ```

- `nucleus/vm_mqjs.c`:
  - `compile_prelude()` runs once, before the first world's context. In a 128 KB scratch arena:
    `JS_NewContext2(..., 1)` (compile mode), `JS_Parse` the prelude, `JS_PrepareBytecode`, then copy the
    header and code into `prelude_bc`. The image is not relocated.
  - `run_prelude(W)`, the first thing a new world does:
    1. copy the image into `W->vm->prelude`;
    2. `JS_RelocateBytecode` with the world's own context;
    3. `JS_LoadBytecode`, then `JS_Run`.
  - `vm_dispose` frees the copy. If compiling fails, worlds parse the source as before.
- `third_party/mquickjs/mquickjs.c`, `JS_GC2`: the sweep of the unique-string table keeps entries that
  point outside `[heap_base, stack_top)`. Recorded as item 4 in `PATCHES`.

### Why

- The timing table: the prelude is 75–95% of every world's start except the compositor's.
- The engine copies nothing when it loads bytecode. The image's functions are used in place, which is
  also why arena use drops.

### What worked

- Device:
  - `prof` over four restarts (`out-s3/p5/prelude-bc.log`): about 10–25 ms per world (about, faults,
    launcher, touch);
  - boot: `stats` at 1.34 s on the kernel clock reads `lane busy 843.8 ms` with every world up. Before,
    the start segments alone were about 3.5 s;
  - arena use (System screenshot `out-s3/p5/prelude-bc/shot-1.png`): drivers 10–13 KB (31–36 before),
    compositor 52 KB, apps 10–17 KB;
  - free PSRAM 3.83 MB against 4.25 MB: 14 image copies of about 30 KB each, while the arenas keep their
    configured sizes.
- Host:
  - conformance: 11 pong lines, with error locations in the world files (`test/ping.js:6:79`);
  - PicoCalc captures unchanged;
  - PaperS3 deterministic, and identical under `SAN=1` with no reports. Only `03-system.png` changed,
    in its KB column: every world about 22 KB lower;
  - `02-paintcheck.sh`: 0 differed.
- QEMU: compiles (with no PSRAM, so the 128 KB scratch matters) and runs the conformance sequence as in
  recent runs.

### What didn't work

1. **One image for all worlds.** The first world was fine; every later one failed:
   `pong crashed: ReferenceError: variable 'service' is not defined (test/pong.js:2:1)`.
   - Comparing the image with a copy taken after relocation:
     `DBG w2: image 44112 bytes, 3 differ from the relocated copy (first at 12928)`.
   - The changed word was the header of the string "driver": `2603…` became `3603…`, which is bit 4,
     `is_unique`. The first world had interned the image's own string and marked it unique in place.
     The next world then saw a "unique" string that was in none of its tables.
   - Fix: one copy per world, relocated by that world's context, from an unrelocated master. A
     relocated master cannot be copied, because relocation adds an offset to every pointer, including
     ones already swapped for stdlib atoms.
2. **Per-world copies broke property names after the first collection.**
   - The home screen stayed at "starting launcher…": the compositor's `frames` handler compared
     `f.app` with `s.focus`, and `f.app` was undefined.
   - Probe inside a handler:
     `keys: app; k0 === 'app': true; m['app']: launcher; ... fresh parse in handler .app: undefined`.
   - A temporary dump of the image's atom table: 223 entries, sorted, all unique, but no "app" or
     "driver".
   - Cause, in the engine:
     - such a name is interned into the context's RAM table as the image string itself;
     - that table holds weak references, and the collector does not mark strings outside the heap
       (`gc_mb_is_marked` reads the object's own mark bit), so the end-of-start collection dropped the
       entry;
     - the same name interned later became a second atom, and a property set under one could not be read
       under the other.
   - Fix: the sweep keeps entries outside the heap.
3. The first build used `TRUE`, which the binding does not define.
4. A first 512 KB compile scratch failed under QEMU, which has no PSRAM, and fell back to parsing.
   Probing on the 64-bit host: 64 KB works, 48 KB does not. The scratch is now 128 KB.

### What I learned

- mquickjs's bytecode path is built for one image per context (`mqjs -b`), and even there an image
  string can enter the RAM atom table. The collector bug would also hit upstream's single-context use as
  soon as a collection runs between interning such a name and using it again.
- Comparing an image byte for byte before and after use found the shared-image bug in one run. A
  probe that reads the same key three ways (`.app`, `['app']`, a key comparison) found the second.

### What was tricky to build

- Relocation needs a normal context: it swaps the image's copies of stdlib names for the stdlib's own
  atoms, which only a context with the stdlib's ROM table can do. Each world uses its own context,
  before anything is interned, as `JS_LoadBytecode` requires.

### What warrants a second pair of eyes

- The engine patch: an out-of-heap pointer in the RAM table now lives as long as the context. That is
  safe because each world's image copy is freed only in `vm_dispose`, after `JS_FreeContext`.
- Arena limits (`mem_kb`) were sized when the prelude's code was inside the arena. They could come down
  by about 20 KB each, which would more than return the PSRAM the copies take.

### What should be done in the future

- Lower the manifest's `mem_kb` limits to match the new live sizes, keeping room for transient use.
- The compositor's own file still takes 254 ms to parse at boot.

### Code review instructions

- `nucleus/vm_mqjs.c`: `compile_prelude`, `run_prelude`, `vm_create`, `vm_dispose`.
- `third_party/mquickjs/mquickjs.c`: the unique-string sweep in `JS_GC2`; `PATCHES` item 4.
- Validate:
  - `make BOARD=papers3 && ./build-papers3/papers3-host -j js-papers3 -m js-papers3/test/system.json -v -t 3000`
    (11 pong lines);
  - `make shots`, `make BOARD=papers3 shots`, `make BOARD=papers3 SAN=1 shots`, `02-paintcheck.sh`;
  - on the device: `s3cap.py --no-reset -c "5 prof reset" -c "6 restart about" -c "14 prof"`.

### Technical details

- Image size: 44,112 bytes on the 64-bit host, about 30 KB on the device.
