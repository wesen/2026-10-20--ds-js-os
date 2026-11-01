---
Title: Diary
Ticket: PICOCALC-SPEED
Status: active
Topics:
    - picocalc
    - esp32-p4
    - performance
    - quickjs
DocType: log
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of the investigation of placement-dependent JavaScript speed on the ESP32-P4."
LastUpdated: 2026-11-01T16:13:44.000000000-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Goal

Find out why JavaScript on the ESP32-P4 runs about 2.8× slower once a native module has been loaded (and in some
images without one), get the device back to normal speed, and remove the cause or make the system insensitive to
it.

## Step 1: The slowdown on the device, and the design of the investigation

The user saw the compositor restart when opening Logs and apps taking long to start. A benchmark on the device
showed the JavaScript engine at 316 ms for the 100k loop and 86 ms for fib(20), against 113 ms and 31 ms at boot.
Rebooting and benchmarking again showed that the slowdown is not a matter of uptime: the boot calibration (before
any world starts) is fast, and 18 s later, with every world running and the three ELF test modules loaded, it is
slow, run after run. That is the same state PICOCALC-NATIVE measured in N4 after any module load and left open.

I created this ticket, wrote the design doc (background on the P4's caches, all measurements so far, four
hypotheses, the cache counters as the decisive instrument, experiments and candidate fixes) and uploaded it.

### Prompt Context

**User prompt (verbatim):** see PICOCALC-FRAMES diary, step 1 (the report and the request "Also create a ticket for
2. Make a design doc too. Then implement, …").

**Assistant interpretation:** "2" is the speed problem. Its first task is restoring the device's speed by flashing
the normal firmware (which my proposal listed as item 2), then the investigation and a fix.

**Inferred user intent:** The device should be fast again, and the cause should be understood rather than avoided.

### What I did

- `tools/p4cap.py --no-reset -s 14 -c "0.3 shot" -c "5 bench" -c "8 bench" -c "11 bench"` on the running device
  (ELF firmware, 2 h 10 min up).
- `tools/p4cap.py -s 50 -c "20 bench" -c "35 bench" -c "45 stats"`: a reset (the tool holds the keyboard's I2C bus
  first), the boot calibration, and two benchmarks after boot.
- Read the cache and memory configuration of `sdkconfig.agent` and `sdkconfig.agent-elf`, the ESP-IDF 5.4.2
  register header `components/soc/esp32p4/register/soc/cache_reg.h`, the Kconfig of `SPIRAM_XIP_FROM_PSRAM` and of
  the L2 size, and `vm_calibrate()` / `count_steps()` in `nucleus/vm.c`.
- `docmgr ticket create-ticket --ticket PICOCALC-SPEED ...`, the design doc, this diary, five tasks;
  `remarquee upload bundle ... --name "PICOCALC-SPEED JavaScript Speed Design" --remote-dir
  "/ai/2026/11/01/PICOCALC-SPEED"`.

### Why

- The PICOCALC-NATIVE experiments had excluded CPU contention and slow PSRAM but had no way to see inside the
  caches. The P4's per-bus hit and miss counters make the main hypothesis (L2 conflicts between flash-resident code
  and PSRAM-resident data) testable directly.

### What worked

- Running device, three benchmarks:

  ```
  calibration on the real clock: the 100k loop took 316.7 ms (the model says 133), fib(20) 85.7 ms (the model says 29.1)
  calibration on the real clock: the 100k loop took 316.7 ms (the model says 133), fib(20) 85.9 ms (the model says 29.1)
  calibration on the real clock: the 100k loop took 316.4 ms (the model says 133), fib(20) 86.0 ms (the model says 29.1)
  ```

- After a reset:

  ```
  [   185.289] calibration on the real clock: the 100k loop took 113.3 ms (the model says 133), fib(20) 30.9 ms (the model says 29.1)
  [  2196.460] nat-import crashed: it links to path_open, which picocalc-os does not give a module
  ...
  [ 18301.915] calibration on the real clock: the 100k loop took 316.9 ms (the model says 133), fib(20) 86.3 ms (the model says 29.1)
  [ 33295.497] calibration on the real clock: the 100k loop took 316.8 ms (the model says 133), fib(20) 85.8 ms (the model says 29.1)
  ```

- Configuration facts: flash DIO at 80 MHz; PSRAM hex at 200 MHz; L2 cache 128 KB with 64-byte lines;
  `SPIRAM_XIP_FROM_PSRAM` off (code runs from flash); `SPIRAM_MALLOC_ALWAYSINTERNAL=4096`; CPU 360 MHz.
- The cache counters exist for L1 and L2, per bus: `CACHE_L1_IBUS{0,1}_ACS_{HIT,MISS,CONFLICT,NXTLVL_RD}_CNT_REG`,
  `CACHE_L1_DBUS{0,1}_...`, `CACHE_L2_IBUS{0,1}_...`, `CACHE_L2_DBUS{0,1}_...`, enabled and cleared through
  `CACHE_L1_CACHE_ACS_CNT_CTRL_REG` (bits 0–1, 4–5 enable; 16–17, 20–21 clear) and
  `CACHE_L2_CACHE_ACS_CNT_CTRL_REG` (bits 8–9, 12–13 enable; 24–25, 28–29 clear).

### What didn't work

- No failures in this step.

### What I learned

- The benchmark's runtime uses QuickJS's default allocator, the C library's `malloc`, not `port_heap_malloc` as
  the worlds do: its small blocks go to internal SRAM first. So `bench` may not measure what worlds experience
  (hypothesis H2 in the design doc). The compositor's overrun on the device shows the worlds are slowed too, but by
  how much is not measured yet.
- In DIO mode at 80 MHz an L2 miss on code costs on the order of 1300 core cycles; that is large enough for a
  modest miss rate to triple the run time.

### What was tricky to build

- Nothing was built in this step.

### What warrants a second pair of eyes

- The design doc's latency estimate for a flash line (3.5–4 µs) is arithmetic from the bus width and clock, not a
  measurement.

### What should be done in the future

- Experiment 0: flash the normal firmware (with the PICOCALC-FRAMES fix) and benchmark at boot, 20 s and 60 s.

### Code review instructions

- Read design-doc/01, sections 1 to 5.

### Technical details

- Captures: `various/01-device-elf-boot-and-bench.log` (reset, boot calibration, two benchmarks, stats) and
  `various/02-device-elf-bench-after-2h.log` (three benchmarks on the long-running device).
