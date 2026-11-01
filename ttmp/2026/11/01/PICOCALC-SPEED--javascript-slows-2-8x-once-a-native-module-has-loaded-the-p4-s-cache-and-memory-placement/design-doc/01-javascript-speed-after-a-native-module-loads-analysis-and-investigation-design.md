---
Title: 'JavaScript speed after a native module loads: analysis and investigation design'
Ticket: PICOCALC-SPEED
Status: active
Topics:
    - picocalc
    - esp32-p4
    - performance
    - quickjs
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: picocalc-os/nucleus/vm.c
      Note: vm_calibrate and count_steps (the benchmark), w_malloc (world heaps through port_heap_malloc)
    - Path: picocalc-os/port/esp32p4/main/main_p4.c
      Note: the console (bench, heap, stats), the tasks and their cores
    - Path: picocalc-os/port/esp32p4/main/port_p4.c
      Note: port_heap_malloc and where world heaps are placed
    - Path: picocalc-os/port/esp32p4/sdkconfig.defaults
      Note: flash mode (DIO, 80 MHz), PSRAM (hex, 200 MHz), the cache configuration
ExternalSources: []
Summary: "On the ESP32-P4, JavaScript runs 2.8x slower once a native module has been loaded (and in some images without one). This document collects what is known, states the hypotheses, and designs the measurements and fixes."
LastUpdated: 2026-11-01T16:13:44.000000000-05:00
WhatFor: "Planning and recording the investigation of placement-dependent JavaScript speed on the P4."
WhenToUse: "Before changing the P4's cache, flash or PSRAM configuration, or where the kernel allocates JavaScript heaps."
---

# JavaScript speed after a native module loads: analysis and investigation design

On the PicoCalc's ESP32-P4 board, picocalc-os's JavaScript sometimes runs at its normal speed and sometimes about
2.8 times slower, and which one it is depends on things that should not matter: whether a native module has been
loaded, or a 16 KB change in a static buffer. When it is slow, everything built on JavaScript misses its budgets:
on 1 November 2026 the compositor overran its 80 ms turn drawing the Logs app and was restarted (which then exposed
the lost-frame bug fixed in PICOCALC-FRAMES), and the Logs app overran its own 50 ms tick.

This document explains the P4's memory system as far as the problem needs it, collects every measurement made so
far, states the hypotheses, and designs the instruments and experiments that tell them apart, followed by the
candidate fixes and their costs. The first task in the ticket is not an investigation at all: the device is
running test firmware that loads three machine-code modules at boot, which keeps it in the slow state; flashing the
normal firmware restores the speed while the cause is found.

## 0. Outcome (added after the investigation)

The investigation answered the question differently from every hypothesis below except half of H2. The diary has
the measurements; in short:

- **The cache counters refuted H1.** On the slow firmware the same program took 320 ms on the C library's heap and
  116 ms on a PSRAM-only heap, with the same L1 and L2 refill counts.
- **The cause is LP SRAM in the heap.** ESP-IDF adds 32 KB of LP SRAM ("RTC fast memory") to the heap as internal
  memory by default (`CONFIG_ESP_SYSTEM_ALLOW_RTC_FAST_MEM_AS_HEAP=y`). Blocks of 4 KB or less go to internal memory
  first and land there once the main SRAM runs short. A read and a write there take 994 ns, against 14 ns in internal
  SRAM or cached PSRAM, and the caches do not see those accesses. Which QuickJS blocks landed there depended on how
  full and fragmented internal SRAM was, which explains the module loads, the 16 KB `.bss` change and the
  pathological boot calibrations. The benchmark's runtime had 8 blocks (29 KB) there.
- **The fix is one configuration line** in `sdkconfig.defaults` (commit 4168b95). Every firmware now runs the
  benchmark at 113–116 ms and 30.5 ms, at boot and with all worlds running, with or without native modules.
- **Worlds were barely affected.** Their heaps are PSRAM only; their per-turn costs were within 5 % on fast and
  slow firmware. The compositor's restart in the original report came from load: the Logs app put every log line
  (up to 400) in each frame. It now sends only the visible window (26c5eb6).
- **The acceptance runs found a third problem**: spi_master copied every unaligned SPI transaction into a fresh
  internal block as large as the transaction (up to 32 KB), and a flush failed with `ESP_ERR_NO_MEM` when no such
  block was free. The transfers are now aligned (8ab3b51).
- **The candidate fixes of section 6** (QIO flash, XIP from PSRAM, a larger L2, IRAM placement) were not needed and
  were not applied.

Acceptance (section 7): the benchmark is within 3 % of the boot calibration in both firmwares; two stress runs (full
log ring, nine app switches) had no overrun and no crash; internal SRAM free is 71–75 KB on the normal firmware and
56 KB on the ELF test firmware. That reading no longer includes the 30 KB of LP SRAM; main SRAM free did not change.

## 1. What is observed

The kernel's calibration benchmark (`vm_calibrate()` in `nucleus/vm.c`) runs two JavaScript programs in a fresh
QuickJS runtime and prints how long they took on the real clock. It runs once at boot, before any world starts, and
again whenever `bench` is typed on the serial console:

```js
(()=>{let s=0; for(let i=0;i<100000;i++) s+=i; return s;})()           // "the 100k loop": the sum outgrows 32 bits, so floats
(()=>{function fib(n){return n<2?n:fib(n-1)+fib(n-2)} return fib(20);})()  // fib(20): calls and small integers
```

The kernel's performance model (calibrated on this board in an earlier ticket) says 133 ms and 29.1 ms.

| Firmware and moment | 100k loop | fib(20) | Source |
|---|---|---|---|
| before native worlds (8ffc032), ~16 s after boot, all worlds running, 5 boots | 113 ms | 30.5 ms | PICOCALC-NATIVE diary, step 6 |
| N4 (WebAssembly), no module loaded | 118 ms | 30.7 ms | same |
| N4, after any module load, even one refused at the import check | 319 ms | 85 ms | same |
| N4 plus debug commands with a 16 KB static buffer, no module | 320 ms | 85 ms | same |
| the same without Wi-Fi (`build`) | 124 ms | 277 ms | same |
| N5 (ELF), the kernel's buffer for system calls allocated lazily in PSRAM: boot calibration | 1602–1604 ms | 31.4 ms | PICOCALC-NATIVE diary, step 7 |
| N5 (ELF), the buffer static (as committed): boot calibration, before any world | 113.3 ms | 30.9 ms | this ticket, 1 Nov |
| the same boot, 18 s and 33 s later (three ELF modules loaded at ~2 s) | 316.9, 316.8 ms | 86.3, 85.8 ms | this ticket, 1 Nov |
| the same firmware after 2 h 10 min, three runs | 316.2–316.7 ms | 85.7–86.0 ms | this ticket, 1 Nov |

Measurements made in PICOCALC-NATIVE that exclude simple explanations:

- A loop of register arithmetic (4M iterations, 44.6 ms; 1M with interrupts off, 11.1 ms) runs at the same speed
  in fast and slow images, so no task takes the CPU away from the kernel's core, and the core's clock did not
  change.
- 64K random reads from PSRAM take 33 ms in fast and slow images, so PSRAM itself is not slower.
- Starting the WebAssembly runtime without loading a module, and one floating-point operation, changed nothing.

Three properties of the data matter for the hypotheses:

1. **The slow state is bimodal and stable.** Within one boot, once slow, every run is within 0.2 % of 316 ms; it
   does not drift with uptime.
2. **Different programs slow down in different images.** The loop and fib(20) are both slow after a module load,
   but in one image only the loop is slow (1604 ms, 14×) and in another only fib is (277 ms, 9×).
3. **The trigger can be a runtime event or a link-time change**: loading a module, or adding 16 KB to `.bss`.

## 2. Background: the P4's memory system

A new engineer needs five facts about the ESP32-P4 to follow the hypotheses. The values are from this project's
`sdkconfig.agent` and `sdkconfig.agent-elf`.

| Part | Size and speed | What lives there |
|---|---|---|
| HP cores | 2 × RISC-V at 360 MHz | the kernel task is pinned to core 1; bus workers, console, Wi-Fi on core 0 |
| L1 instruction cache | per core, 64-byte lines | |
| L1 data cache | shared, 64-byte lines | |
| L2 cache | **128 KB**, 64-byte lines, shared by **flash** and **PSRAM** accesses | |
| internal SRAM (L2MEM) | 768 KB in all, minus the L2 cache | `.data`, `.bss`, task stacks (the kernel's 80 KB stack), small `malloc` (≤ 4096 bytes first, `CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL`) |
| flash | 32 MB, **DIO at 80 MHz** (two data lines) | all code (`.text`) and read-only data, executed in place through the caches |
| PSRAM | 32 MB, hex (16 lines) at 200 MHz | world heaps (`port_heap_malloc`), framebuffers, large `malloc`, ELF modules |
| mask ROM | | the soft-float helpers (`__adddf3`, …) the loop's float arithmetic calls |

The consequence is the hypothesis below: **QuickJS's interpreter executes from flash, through the same 128 KB L2
cache that holds the JavaScript heap's data from PSRAM.** A cache line of code evicted by heap data has to be read
again from flash. In DIO mode at 80 MHz a 64-byte line is 256 bus clocks of data plus the command and address,
about 3.5–4 µs, roughly 1300 core cycles; the same line from PSRAM takes a fraction of that. A program whose hot
code and hot data compete for the same cache sets pays that price on every iteration.

Whether they compete depends on addresses. A set-associative cache maps an address to a set by some of its middle
bits. The interpreter's hot code is at fixed flash addresses that change only when the image is relinked; heap
data is at addresses that depend on what was allocated before. That matches property 3: relinking moves the code,
and a module load moves later allocations.

## 3. Hypotheses

**H1. L2 conflicts between flash code and PSRAM data.** In the slow state, the interpreter's hot code lines are
evicted from the L2 by heap data (or by each other) and refetched from flash. Predicts: in the slow state, the L2
instruction-side miss count per benchmark run is much higher than in the fast state; the L1 counts are similar.

**H2. The benchmark's own placement.** `count_steps()` creates its runtime with QuickJS's default allocator, which
is the C library `malloc`: small blocks go to internal SRAM while it has room, others to PSRAM. If a module load
leaves less internal SRAM, the benchmark's data moves to PSRAM and only the benchmark slows. Predicts: a benchmark
whose runtime is forced into PSRAM is slow in every state, one forced into internal SRAM is fast in every state,
and world turns (which always use PSRAM through `port_heap_malloc`) cost the same in fast and slow states.
H2 does not explain the compositor's overruns, so it is probably not the whole story, but it decides whether
`bench` measures what the worlds experience.

**H3. A loader changes the cache or the MMU.** elf_loader writes back the cache after relocating; WAMR maps memory.
If either changed a cache mode or mapping, everything after would be slow. Predicts: the slow state starts exactly
at the load call, with no allocation in between; the cache configuration registers differ before and after.
The PICOCALC-NATIVE observation that a 16 KB `.bss` change alone produces the slow state argues against H3 as the
only cause.

**H4. CPU contention.** Excluded by the register loop measurement (section 1).

## 4. Instruments

### 4.1 Cache counters

The P4 has access counters per bus in both cache levels (`soc/cache_reg.h`, ESP-IDF 5.4.2):

| Register | Counts |
|---|---|
| `CACHE_L1_IBUS{0,1}_ACS_{HIT,MISS,CONFLICT,NXTLVL_RD}_CNT_REG` | L1 instruction cache of core 0 / core 1 |
| `CACHE_L1_DBUS{0,1}_ACS_{HIT,MISS,CONFLICT,NXTLVL_RD,NXTLVL_WR}_CNT_REG` | L1 data cache, core 0 / core 1 |
| `CACHE_L2_IBUS{0,1}_ACS_{HIT,MISS,CONFLICT,NXTLVL_RD}_CNT_REG` | L2, instruction-side requests |
| `CACHE_L2_DBUS{0,1}_ACS_{HIT,MISS,CONFLICT,NXTLVL_RD,NXTLVL_WR}_CNT_REG` | L2, data-side requests |

They are enabled and cleared through `CACHE_L1_CACHE_ACS_CNT_CTRL_REG` (enable bits 0–1 and 4–5, clear bits 16–17
and 20–21) and `CACHE_L2_CACHE_ACS_CNT_CTRL_REG` (enable bits 8–9 and 12–13, clear bits 24–25 and 28–29). A console
command `cachestat` will clear and enable them, run the benchmark, and print each counter for core 1 (the kernel's
core), so a fast and a slow run can be compared line by line.

```c
// pseudocode for the console command
REG_WRITE(L1_CTRL, ENA(ibus1, dbus1) | CLR(ibus1, dbus1));
REG_WRITE(L2_CTRL, ENA(ibus1, dbus1) | CLR(ibus1, dbus1));
vm_calibrate();                          // or one of the two programs
print hit/miss/conflict/nxtlvl for L1 ibus1, L1 dbus1, L2 ibus1, L2 dbus1
```

### 4.2 Placement probes

- `heap` (exists): internal and PSRAM free bytes and largest blocks.
- A benchmark variant whose runtime allocates through `port_heap_malloc` (PSRAM, like a world) and one through
  `heap_caps_malloc(MALLOC_CAP_INTERNAL)`, printed side by side (tests H2).

### 4.3 What the worlds pay

`stats` prints each world's turns and CPU milliseconds. Dividing gives a per-turn cost for worlds whose work is
regular: `snake` (a tick every 110 ms), `keyboard` (a poll every 20 ms), `launcher` and `sysmon` (timers). The same
firmware in fast and slow states, the same idle screen, the same minute: the ratio of per-turn costs is the
slowdown the user experiences.

## 5. Experiments

Each experiment is a device run with `tools/p4cap.py` (which holds the keyboard's I2C bus before any reset) and a
capture saved to the ticket's `various/` directory.

| # | Firmware | Action | Decides |
|---|---|---|---|
| 0 | `build-agent` (no ELF modules) with the PICOCALC-FRAMES fix | flash; `bench` at boot and at 20 s, 60 s | restores the device; is the normal firmware fast with all worlds running? |
| 1 | the same plus `cachestat` | counters at boot and later, fast state | the baseline |
| 2 | the ELF firmware plus `cachestat` | counters in the slow state | H1: which level and bus misses more |
| 3 | both | `stats` per-turn costs, idle launcher, 60 s | how much of the slowdown worlds pay |
| 4 | both | the benchmark in PSRAM and in internal SRAM | H2 |
| 5 | the ELF firmware, a module started from the console after boot | counters and `bench` before and after the load | H3: is the switch at the load |
| 6 | candidate fixes (section 6) | 0–3 again | which fix removes the slow state, at what cost |

## 6. Candidate fixes

| Fix | Mechanism | Cost and risk |
|---|---|---|
| **Flash in QIO mode** (`CONFIG_ESPTOOLPY_FLASHMODE_QIO`) | four data lines instead of two: an L2 miss on code costs about half | the flash chip must support QIO (read its JEDEC id first); a wrong setting stops the boot, recoverable through the ROM's download mode |
| **Execute in place from PSRAM** (`CONFIG_SPIRAM_XIP_FROM_PSRAM`) | the image is copied to PSRAM at boot; misses refill from PSRAM, several times faster than DIO flash | about 2.6 MB of PSRAM (of 32 MB). The PMP then marks PSRAM data non-executable, which breaks the ELF backend (PICOCALC-NATIVE relies on executing modules from PSRAM); the ELF build would need a separate executable region or would keep XIP off |
| **A larger L2** (`CONFIG_CACHE_L2_CACHE_256KB`) | twice the sets, fewer conflicts | 128 KB more of internal SRAM; the agent firmware has about 90 KB free, so internal allocations (Wi-Fi buffers) would have to move to PSRAM first |
| **Hot interpreter code in internal SRAM** (`IRAM_ATTR` on QuickJS's `JS_CallInternal` and helpers) | the hottest code bypasses the L2 entirely | `JS_CallInternal` alone is tens of kilobytes; internal SRAM is the scarce resource |
| **Keep the trigger away** | do not load native modules at boot; place module memory where it does not move later allocations | treats the symptom; does not explain the 16 KB `.bss` case |

The order of preference follows cost: QIO (a configuration line) and XIP from PSRAM (a configuration line and a
known conflict with the ELF backend) first, the larger L2 if the counters show capacity rather than mapping
conflicts, IRAM placement last.

## 7. Acceptance criteria

- With every world running, 20 s and 60 s after boot, `bench` is within 10 % of the boot calibration, in the
  normal firmware and after a native module has been loaded.
- The compositor's draw of the Logs app and the Logs app's tick stay within their budgets (no `ran past` in a
  five-minute capture while switching between apps).
- No regression in image size beyond what the chosen fix requires, and internal SRAM free at least 64 KB.

## 8. Open questions

- Do the P4's cache counters count accesses that hit internal SRAM, or only cacheable external memory? Experiment
  1 answers it.
- Does the slow state affect core 0 (Wi-Fi, buses) as well? The counters for bus 0 answer it.
- Is the ELF build worth keeping on the device at all before this is fixed? Until it is, the normal firmware is the
  one to run.
