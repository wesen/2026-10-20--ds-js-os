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
RelatedFiles:
    - Path: repo://picocalc-os/port/esp32p4/main/perf_p4.c
      Note: the instrument
    - Path: repo://picocalc-os/port/esp32p4/sdkconfig.defaults
      Note: the fix
ExternalSources: []
Summary: Chronological record of the investigation of placement-dependent JavaScript speed on the ESP32-P4.
LastUpdated: 2026-11-01T16:13:44-05:00
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

## Step 2: Experiment 0, the normal firmware back on the device

I built the agent firmware (no ELF modules) with the PICOCALC-FRAMES fix and flashed it. With every world running,
the benchmark was back at normal speed: 118 ms and 31 ms at 18 s and at 58 s. The surprise was the boot
calibration of the same image: 1600 ms for the loop and 31 ms for fib(20), the pathological state PICOCALC-NATIVE
had seen once at boot, now in the normal firmware. So the fast and slow states are not "before and after a module
load" but something that moves with the image and with the moment.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Restore the device's speed first (task 4qtg), then investigate.
**Inferred user intent:** A usable device while the cause is found.

### What I did

- `idf.py -B build-agent ... build`; `tools/p4cap.py --no-reset -s 1 -c "0.2 hold"`; `idf.py ... flash`.
- `tools/p4cap.py -s 80 -c "20 bench" -c "60 bench" -c "63 heap" ...` (with the PICOCALC-FRAMES check in the same
  capture).

### Why

- The ELF test firmware kept the device slow; the normal firmware was the obvious first remedy and the baseline.

### What worked

```
[  1676.248] calibration on the real clock: the 100k loop took 1600.5 ms (the model says 133), fib(20) 31.4 ms ...
[ 18026.428] calibration on the real clock: the 100k loop took 118.2 ms (the model says 133), fib(20) 30.9 ms ...
[ 58049.697] calibration on the real clock: the 100k loop took 118.1 ms (the model says 133), fib(20) 31.0 ms ...
heap: internal 110275 free (largest 29696), psram 27268624 free (largest 26738688)
```

### What didn't work

- The boot calibration of this image is the 1600 ms state; nothing failed, but it shows the problem is not
  specific to native modules.

### What I learned

- The boot calibration's speed and the later speed are independent: this image is slow at boot and fast later, the
  ELF image the other way round.

### What was tricky to build

- Nothing new was built.

### What warrants a second pair of eyes

- N/A.

### What should be done in the future

- Measure inside the caches (step 3).

### Code review instructions

- `various/03-device-agent-firmware-boot-and-bench.log`.

### Technical details

- Firmware: build-agent at 0da00ca (retained posts), sdkconfig.agent unchanged.

## Step 3: The cache counters, and hypothesis H1 refuted

I wrote a `cachestat` console command (`port/esp32p4/main/perf_p4.c`): it runs one calibration program in a fresh
QuickJS runtime whose heap is the C library's (as the benchmark), internal SRAM only, or PSRAM only (as every
world's), and prints the time and the L1/L2 hit, miss, conflict and next-level counters of both cores. Run on the
agent firmware (fast) and on the ELF firmware (slow), it gave the decisive result of the investigation: on the ELF
firmware, the same program takes 320 ms on the default heap and 116 ms on the PSRAM heap, with practically identical
cache counters. The slowdown is not in the caches. It follows where the benchmark's memory is, and worlds, whose
heaps are PSRAM only, pay almost nothing of it: their per-turn costs are within 5 % on both firmwares.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Experiments 1–4 of the design doc.
**Inferred user intent:** Find the cause, not a workaround.
**Commit (code):** 6631809 — "picocalc-os P4: a cachestat console command, the cache's own counters around a
benchmark on a chosen heap, and memory speeds (PICOCALC-SPEED)"

### What I did

- `perf_p4.c`: enable and clear `CACHE_L1_CACHE_ACS_CNT_CTRL_REG` / `CACHE_L2_CACHE_ACS_CNT_CTRL_REG` (bits for
  ibus0/1, dbus0/1), run the program between `port_clock()` reads, read all 36 counters before printing; a
  `JSMallocFunctions` whose blocks come from `malloc` or `heap_caps_malloc(n, caps)`; `start`/`show` for a window.
  Wired into `console_exec` (`main_p4.c`), `p4.h`, `main/CMakeLists.txt`.
- Built both firmwares; flashed each and ran `cachestat loop|fib default|psram|internal`, `bench`, `heap`,
  `cachestat start` … `show` over 10 s, `stats`.

### Why

- The counters distinguish code from data misses and L1 from L2: H1 predicted many more L2 instruction misses in
  the slow state.

### What worked

- ELF firmware, one boot, the same minute:

  | Program, heap | time | L1 ibus1 next-level reads | L2 ibus1 external reads | L1 dbus1 misses |
  |---|---|---|---|---|
  | loop, default | 319.9 ms | 2878 | 1041 | 113,423 |
  | loop, psram | 116.4 ms | 2732 | 1043 | 117,521 |
  | fib, default | 86.3 ms | 2657 | 982 | 109,385 |
  | fib, psram | 31.0 ms | 2623 | 993 | 120,890 |

- Agent firmware: loop 115.0 (default) and 112.8 ms (psram), fib 32.0 and 31.0 ms, with counters of the same size.
- Per-turn world costs over the first 53 s (cpu ms / turns), agent vs ELF: keyboard 0.715 vs 0.752, snake 2.610
  vs 2.701, sysmon 3.998 vs 4.000, logs 2.621 vs 2.597, keys 2.484 vs 2.442, about 1.928 vs 2.029.

### What didn't work

- The counters' "miss" is not "refill": L1 ibus1 shows 1.44 M misses but 3109 next-level reads during the loop.
  The ratio (about 465 per L1 refill, 690 per L2 external read) fits stall cycles while a refill is outstanding, so I
  compared "next rd" counts, which are refills.
- `cachestat loop internal` printed nothing useful in the slow state (the runtime did not fit in internal SRAM).

### What I learned

- H1 is wrong: the slow state has the same cache traffic. H2 is right in its first half: the benchmark's runtime on
  the C library's heap is slow and on PSRAM fast. Worlds use PSRAM only, so `bench` exaggerated what the worlds pay.
- The compositor's per-turn cost was higher on the ELF firmware (4.16 vs 2.17 ms) but its turns differ in content;
  that number needed a second look (step 5).

### What was tricky to build

- Reading the counters without counting the printing: all 36 are read into an array first, then printed.
- `bus_t` collided with the kernel's type of the same name; renamed `cbus_t`.

### What warrants a second pair of eyes

- The interpretation of "miss" as stall cycles is inferred from ratios, not documented by Espressif.

### What should be done in the future

- Find out what is slow about the internal part of the default heap (step 4).

### Code review instructions

- `port/esp32p4/main/perf_p4.c`; captures `various/04-cachestat-agent-fast.log` and
  `various/05-cachestat-elf-slow-default-vs-psram.log`.

### Technical details

- Counter registers: `soc/cache_reg.h`, ESP-IDF 5.4.2, offsets 0x180–0x20c (L1) and 0x300–0x34c (L2).

## Step 4: LP SRAM, 71 times slower, and out of the heap

The time that the counters did not see had to be spent on memory that does not go through the caches. The P4 has
one such memory in the heap by default: 32 KB of LP SRAM ("RTC fast memory", `CONFIG_ESP_SYSTEM_ALLOW_RTC_FAST_MEM_AS_HEAP=y`).
I added to `cachestat` a count of where the runtime's allocations land and a memory speed test. On the ELF
firmware, 8 of the benchmark runtime's 51 blocks (29,360 bytes) were in LP SRAM, and a read plus a write there took
993.7 ns against 14.0 ns in internal SRAM and in PSRAM. With LP SRAM out of the heap, every firmware runs the
benchmark at 113–116 ms and 30.5 ms, at boot and later, with or without modules.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Explain the H2 result and fix it.
**Inferred user intent:** Remove the cause.
**Commit (code):** 4168b95 — "picocalc-os P4: keep LP SRAM out of the heap; JavaScript ran 2.8x to 14x slower with
hot blocks there (PICOCALC-SPEED)"

### What I did

- `perf_p4.c`: `region_of()` (L2MEM `SOC_DRAM_LOW..HIGH`, LP `SOC_RTC_DRAM_LOW..HIGH`, TCM, PSRAM), counted in
  `b_malloc`/`b_realloc`; `cachestat mem`: 1 KB from `MALLOC_CAP_INTERNAL|MALLOC_CAP_DMA`, `MALLOC_CAP_RTCRAM` and
  `MALLOC_CAP_SPIRAM`, 1000 passes of read-add-write over 256 words each.
- `sdkconfig.defaults`: `CONFIG_ESP_SYSTEM_ALLOW_RTC_FAST_MEM_AS_HEAP=n` with a comment; the same line set in the
  untracked generated `sdkconfig`, `sdkconfig.agent`, `sdkconfig.agent-elf`, which do not take new defaults.
- Rebuilt and measured the ELF firmware, then the agent firmware.

### Why

- Accesses that bypass the caches are the only kind the counters cannot see, and the cache counters were identical.
- Removing LP SRAM from the heap costs 30 KB of memory that is 70 times slower than PSRAM, of which there are 27 MB
  free. Small blocks fall back to internal SRAM, then PSRAM.

### What worked

```
  L2MEM (internal, DMA-capable)  at 0x4ff99780: 256k reads and writes in 3.59 ms (14.0 ns each)
  LP SRAM (RTC fast memory)      at 0x50108364: 256k reads and writes in 254.38 ms (993.7 ns each)
  PSRAM                          at 0x48614b64: 256k reads and writes in 3.59 ms (14.0 ns each)
cachestat loop on the default heap: 320.9 ms; ...
  allocations by region (runtime, context and the run): L2MEM (internal) 13 (13600 bytes); LP SRAM 8 (29360 bytes); TCM 2 (6932 bytes); PSRAM 28 (103736 bytes);
```

After the change, ELF firmware (three modules loaded):

```
[   162.528] calibration on the real clock: the 100k loop took 116.4 ms (the model says 133), fib(20) 30.5 ms
[ 18021.021] calibration on the real clock: the 100k loop took 116.1 ms (the model says 133), fib(20) 30.8 ms
cachestat loop on the default heap: 116.1 ms; ... L2MEM (internal) 7 (12436 bytes); TCM 5 (6936 bytes); PSRAM 39 (134256 bytes);
[ 57990.474] calibration on the real clock: the 100k loop took 116.0 ms (the model says 133), fib(20) 30.7 ms
```

Agent firmware: boot 112.7 / 30.4 ms (was 1600.5 / 31.4), 18 s 113.0 / 30.5, 58 s 112.8 / 30.7.

### What didn't work

- ESP-IDF's own help for the option says LP SRAM "operates on APB clock and hence does not have much performance
  impact". On the P4 that is wrong by a factor of 70.

### What I learned

- Every row of the design doc's measurement table is explained: which hot QuickJS blocks (the 4 KB-or-smaller ones:
  atom and shape tables, the context's arrays) land in LP SRAM depends on how much internal SRAM is free and how it
  is fragmented when the runtime is made. A module load takes internal SRAM; a 16 KB `.bss` change shrinks it; at
  boot, the heap's order of regions decides. Different blocks there slow different programs (the loop 14×, fib 9×,
  both 2.8×).
- "Internal free" now reads about 30 KB less (75 KB on the agent firmware, 56 KB on the ELF one) because LP SRAM is
  no longer counted; main internal SRAM is as free as before.

### What was tricky to build

- The generated sdkconfig files are untracked and do not pick up new defaults for keys they already have, so the
  tracked fix (`sdkconfig.defaults`) needed the local files edited too. A fresh checkout gets it from the defaults.

### What warrants a second pair of eyes

- Anything in the firmware that relied on those 30 KB of internal memory now competes for main SRAM. The display's
  SPI path did (step 5).

### What should be done in the future

- None for the speed itself.

### Code review instructions

- `git show 4168b95`; captures `various/06-cachestat-elf-regions-and-memory-speed.log`,
  `various/07-elf-without-lp-heap.log`, `various/08-agent-without-lp-heap.log`.

### Technical details

- LP SRAM heap region: `SOC_RTC_DRAM_LOW` 0x50108000 to `SOC_RTC_DRAM_HIGH` 0x50110000; about 30 KB of it was free
  for the heap.

## Step 5: The acceptance runs: a Logs app that overran, and a display flush that ran out of memory

The acceptance criteria include no overruns while switching apps. The user's original report came after two hours,
when the kernel's 256-line log ring was full, so I filled it (`trace on` for 12 s) before switching. Two more
problems showed. First, the Logs app overran its 50 ms budget every time it was opened: it put every line it keeps
(up to 400) into each frame, which the compositor parsed and word-wrapped on every draw. That is also the likeliest
reason the compositor overran on the device in the original report. Second, the display driver crashed once with
`spi2: ESP_ERR_NO_MEM`: spi_master copies any transaction that is not cache-line aligned into a new internal block
as large as the transaction, up to 32 KB, and internal SRAM had no block that large. I fixed both; two rounds of
the stress test then ran with no crash and no overrun.

### Prompt Context

**User prompt (verbatim):** see Step 1, and the original report quoted in PICOCALC-FRAMES step 1.
**Assistant interpretation:** Meet the acceptance criteria, under the conditions of the original report.
**Inferred user intent:** Opening Logs, Calc and Files should just work.
**Commit (code):** 26c5eb6 — "picocalc-os: the Logs app sends only the lines that can be on screen
(PICOCALC-SPEED)"; 8ab3b51 — "picocalc-os P4: SPI transfers that never need spi_master's copy, so a flush cannot
fail for want of a large DMA block (PICOCALC-SPEED)"; 3edc6b4 — README.

### What I did

- Stress capture: `trace on` at 15 s, `trace off` at 27 s, then F1 / l / F1 / x / F1 / d / F1 / l / F1 / m, `stats`.
- `js/apps/logs.js` `lgScreen()`: `shown.slice(Math.max(0, shown.length - s.scroll - LG_WINDOW))` with
  `LG_WINDOW = 32`; `tests/sysapps.test.mjs`: the frame holds 32 lines, Home brings the "lines are gone" marker
  back.
- `port/esp32p4/main/bus_p4.c`: `spi_send()` uses `SPI_TRANS_USE_TXDATA` for up to 4 bytes; bounce buffers and
  `small` from `heap_caps_aligned_alloc(dma_align, ...)` with `dma_align` from `esp_cache_get_alignment(MALLOC_CAP_DMA)`
  (what spi_master checks); `spi_pixels()` sends each chunk as its aligned part and a tail shorter than a line, with
  per-buffer transaction counts (`queue_size` 4). `esp_mm` added to main's `PRIV_REQUIRES` for the private header.
- Rebuilt, flashed, ran the stress capture with two bursts.

### Why

- The Logs frame: the compositor's `drawLines()` wraps every item before showing about 20 rows, and the frame's
  JSON is parsed in full; sending only the visible window makes both independent of the ring.
- The SPI copy: spi_master checks `(ptr | len) & (alignment - 1)` (`spi_master.c:1156`) and allocates
  `heap_caps_aligned_alloc(alignment, len, MALLOC_CAP_DMA)` when it fails. Making the transactions aligned removes
  the dependency on a large free block instead of hoping one stays free.

### What worked

- Before the Logs change (full ring, fast firmware):

  ```
  [ 97926.490] logs crashed handling focus: ran past its turn budget of 50 ms
  [122882.279] logs crashed handling focus: ran past its turn budget of 50 ms
  ```

- After it: no overrun; logs 12.1 ms per turn on average with the full ring.
- After both changes, two bursts and nine app switches:

  ```
  heap: internal 74975 free (largest 31744), psram 27271792 free (largest 26738688)
  heap: internal 71459 free (largest 31744), psram 26953116 free (largest 26738688)
  [ 93116.717] calibration on the real clock: the 100k loop took 113.2 ms (the model says 133), fib(20) 30.8 ms
  compositor  turns 348  per turn 9.611 ms  rst 0
  display     turns  58  per turn 10.593 ms rst 0
  logs        turns 194  per turn 14.985 ms rst 0
  ```

  No `crashed`, no `ran past`, no `NO_MEM` in 1914 traced deliveries.
- Host: `make test-apps` 10 + 27 + 9 + 12 pass; `make shots` unchanged.

### What didn't work

- The display crash, before the SPI change:

  ```
  [ 28743.244] display crashed handling flush: spi2: ESP_ERR_NO_MEM (drivers/display.js:43:22)
  ```

- My first build of the SPI change failed: `bus_p4.c:14:10: fatal error: esp_private/esp_cache_private.h: No such
  file or directory` (esp_mm was not a requirement of main). My command chain had already sent `hold`, which
  suspends the I2C worker for good, so the keyboard was stopped until the flash that followed the fixed build reset
  the board. No transaction was cut.
- The first version of the Logs test expected the timestamp of line 452 as "45.2s"; the fake ring stamps line n at
  n × 10 ms, so it is "4.5s".

### What I learned

- After PICOCALC-FRAMES, a compositor restart no longer blanks apps, but the cause of the original restart was
  load, not only speed: a full log ring made the Logs frame tens of kilobytes.
- Keeping LP SRAM out of the heap moved about 30 KB of small blocks into main SRAM; the display's SPI path had been
  relying, without anyone knowing, on a 32 KB block being free.

### What was tricky to build

- The SPI queue bookkeeping: results come back in queue order and the two bounce buffers alternate, so before
  refilling a buffer the worker collects results until only the other buffer's transactions are outstanding
  (`while (inflight > n_t[cur ^ 1])`). A chunk with a tail is two transactions from one buffer; `queue_size` went
  from 2 to 4.

### What warrants a second pair of eyes

- The panel itself: `shot` reads the framebuffer, not the glass, so the split transfers were checked for errors and
  crashes but not by looking at the screen. The split is the same kind as the existing 32 KB chunks (consecutive
  transactions inside one RAMWR), so the pixels should be unchanged.
- `esp_private/esp_cache_private.h` is a private ESP-IDF header; it is what spi_master itself uses for the alignment.

### What should be done in the future

- `drawLines()` could wrap only the items it shows; every other app already slices its lines.

### Code review instructions

- `git show 26c5eb6 8ab3b51`; captures `various/09-full-log-ring-logs-overrun.log`,
  `various/10-logs-window-display-no-mem.log`, `various/11-stress-all-fixes.log`.

### Technical details

- `dma_align` is whatever `esp_cache_get_alignment(MALLOC_CAP_DMA)` returns, the value spi_master compares against;
  by the configuration (`CONFIG_CACHE_L1_CACHE_LINE_SIZE=64`) it should be 64, but I did not print it. CHUNK (32768)
  is a multiple of any cache line, so only a rectangle's last chunk has a tail, and the driver copies at most one
  line for it.
