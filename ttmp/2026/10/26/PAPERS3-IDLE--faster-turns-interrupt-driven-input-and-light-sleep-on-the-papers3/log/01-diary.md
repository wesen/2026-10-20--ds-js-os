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
