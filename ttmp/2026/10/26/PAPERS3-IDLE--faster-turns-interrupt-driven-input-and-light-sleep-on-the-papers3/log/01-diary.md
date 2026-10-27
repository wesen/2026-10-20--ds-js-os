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
