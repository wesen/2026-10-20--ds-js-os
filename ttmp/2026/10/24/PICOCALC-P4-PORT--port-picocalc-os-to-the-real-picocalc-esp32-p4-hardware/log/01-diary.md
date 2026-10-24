---
Title: Diary
Ticket: PICOCALC-P4-PORT
Status: active
Topics:
    - embedded
    - esp32-p4
    - picocalc
    - quickjs
    - porting
    - os
DocType: log
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/apps/sysmon.js
      Note: cpu% column and compact counters
    - Path: repo://picocalc-os/port/esp32p4/main/CMakeLists.txt
      Note: QuickJS flags that fixed the -O2 crash
ExternalSources: []
Summary: Chronological implementation diary for porting picocalc-os to the PicoCalc ESP32-P4.
LastUpdated: 2026-10-24T03:40:34.253302321-04:00
WhatFor: Reasoning, failures and evidence behind each step of the port.
WhenToUse: Resume work, review a commit, or trace why the port looks the way it does.
---

# Diary

Entries are chronological (oldest first). Task IDs refer to `tasks.md`.

## Step 1: Study picocalc-os and prior ESP32-P4 work; write the guide

The goal of this step was to understand picocalc-os well enough to port it, and to write that
understanding down for an intern. I read every C file of the nucleus, the simulator, the host runner,
the prelude and all JavaScript worlds. Then I read the earlier ESP32-P4 PicoCalc projects (0097, 0099,
0101) and the go-go-parc writeups the user pointed to. The result is the design doc
`design-doc/01-picocalc-os-on-the-esp32-p4-analysis-design-and-implementation-guide.md`, which was
uploaded to reMarkable.

The central finding is that the nucleus already touches the board in only a few places: three bus back
ends in `hw.c`, the virtual clock in `kernel.c`, the glibc allocator in `vm.c`, and `fopen`. Bus effects
are already asynchronous promises settled through events. A small port seam is therefore enough, and
the same nucleus can serve both builds.

### Prompt Context

**User prompt (verbatim):** "I plugged in my picocal esp32-p4, and I downloaded picocalc-os from the web where we tested it in an emulator. Study it, create a new docmgr to port it to the actual hardware, and Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.

Then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)"

Follow-up (verbatim, mid-step): "you can look for previous esp32-p4 work in /home/manuel/workspaces/2025-12-21/echo-base-documentation/esp32-s3-m5 and also in ~/code/wesen/go-go-golems/go-go-parc for writeups, if you want."

**Assistant interpretation:** Create a docmgr ticket and an intern-level design guide (uploaded to
reMarkable), then implement the port to the real ESP32-P4 PicoCalc with commits and a detailed
investigation-mode diary.

**Inferred user intent:** Get picocalc-os from emulator to working hardware, with documentation good
enough that someone new can maintain it.

### What I did

- Read `picocalc-os/README.md`, `Makefile`, `nucleus/*.c|h`, `sim/*.c`, `host/main_host.c`,
  `js/prelude.js`, `js/system.json`, all of `js/drivers`, `js/system`, `js/apps`.
- Confirmed the host build reproduces the committed screenshots:
  `make -j8 && make shots && git status --short` showed only `build/` and `out/uart.log` as untracked.
  Every `out/*.png` was byte-identical. (My first md5 comparison looked different only because the
  file names in the two listings had different path prefixes.)
- Hardware present: `/dev/ttyACM0` = `usb-1a86_USB_Single_Serial_5B61091051-if00` (CH343, the P4
  console, same id as the 0099 README), `/dev/ttyUSB0` = a CH340 (not the P4 console).
- ESP-IDF trees exist under `~/esp/`. `esp-idf-5.4.2` is the one earlier P4 projects used.
- Read `esp32-s3-m5/0099-*` (pins, SPLL SPI clock, keyboard sequence, RST timing), `0101-*` (QuickJS
  under ESP-IDF, 32 KiB stack lesson, 133/31 ms benchmark), `components/quickjs_native` (the
  `malloc_usable_size` shim, the `ESP_PLATFORM` timezone patch).
- Read go-go-parc: "ESP32-P4-WIFI6 as PicoCalc MCU" (chip v1.3, CH343 console, serial ownership,
  reset-and-capture via DTR/RTS) and "PicoCalc Keyboard Reset and I2C Recovery" (register 0x08 is
  dangerous; quiet-bus recovery).
- Created ticket `PICOCALC-P4-PORT`, vocabulary topics, the design doc and this diary. Uploaded the
  guide: `OK: uploaded PICOCALC-P4-PORT picocalc-os on ESP32-P4 guide.pdf -> /ai/2026/10/24/PICOCALC-P4-PORT`.

### Why

- A port seam rather than a fork (decision 7.1), because the host build is the only deterministic
  regression harness, and pixel-identical screenshots are a strong refactoring oracle.
- Real time on the device (7.2), and worker tasks for buses (7.3), because the simulator models the
  buses as running in parallel with the lane. Synchronous transfers on the kernel task would contradict
  that and would cost about a third of the lane in keyboard polling alone.

### What worked

- The determinism of the host build: `make shots` is a byte-exact gate.

### What didn't work

- N/A in this step.

### What I learned

- This repo's QuickJS lacks the `ESP_PLATFORM` branch for `getTimezoneOffset`
  (`third_party/quickjs/quickjs.c:49893-49899` uses `tm.tm_gmtoff`, which newlib lacks). A third patch
  is needed.
- QuickJS records `stack_top` at `JS_NewRuntime` and the limit is `stack_top - max_stack_size`, so
  the device's JS stack limit must be below the kernel task's stack size minus the depth at which
  runtimes are created.
- ESP-IDF's `malloc` with `CONFIG_SPIRAM_USE_MALLOC` puts allocations under 16 KB in internal RAM. A
  JS heap is mostly small blocks, so world heaps must use `heap_caps_malloc(..., MALLOC_CAP_SPIRAM)`
  explicitly, or they would exhaust internal RAM.

### What was tricky to build

- Nothing built yet. The subtle analysis point was proving that the front framebuffer is not written
  while a flush reads it. The compositor's `draw` handler is async and awaits the flush, and the lane
  never gives an in-turn world a new message (`pick()` checks `!W->in_turn`). The only remaining hazard
  is a world being killed mid-DMA, which reference-pinning the buffer covers.

### What warrants a second pair of eyes

- Decision 7.4 (wall-clock budgets on the device) can make worlds crash on the device that never
  crashed in the simulator. That is intended, but the budgets in `system.json` may need revisiting.

### What should be done in the future

- See the design doc section 12.

### Code review instructions

- Read the design doc sections 3 (orientation) and 6 (architecture).

### Technical details

- Pins: SDA 50, SCL 49, SCK 3, MOSI 2, CS 7, DC 24, RST 25; console UART0 37/38.
- Task IDs: xbul guide, d4pu P0, e8ng P1, 6j46 P2, zmq1 P3, iiv4 P4, hn6q P5.

## Step 2: P0, the port seam (host stays pixel-identical)

This step put everything platform-specific in the nucleus behind a named port API, so the ESP-IDF build
can compile the same `kernel.c`, `vm.c`, `hw.c` and `gfx.c`. The three bus back ends moved verbatim
from `nucleus/hw.c` to `sim/bus_sim.c`. The allocator, JS stack limit, file loading and clock now go
through `port_*` functions, which `host/port_host.c` implements for Linux. `K.realtime` adds the
real-clock mode (measured segment cost, wall-clock budgets, `kernel_next_wake()`).

The gate was `make shots` followed by a clean `git status out/`. It passed for the pure refactor. One
deliberate follow-up, `board` in `sys.stats()` for the About app, changed exactly one digit in
`out/03-sysmon.png`. I split it into its own commit, with the reason in the message.

### Prompt Context
**User prompt (verbatim):** see Step 1. Mid-step (verbatim): "ok hold on, are you compiling for the esp32p4? do you see it on serial even?"
**Assistant interpretation:** Do the refactor, but confirm the device is reachable before going further.
**Inferred user intent:** Make sure work is aimed at the real hardware, not only the emulator.
**Commit (code):** f136c3b "picocalc-os: port seam in the nucleus (bus back ends, clock, heaps, files)"; a9ff900 "picocalc-os: sys.stats() names the board; About shows it"

### What I did
- `nucleus/nucleus.h`: port API (`port_clock`, `port_heap_*`, `port_big_*`, `port_js_stack`,
  `port_read_file`, `port_board_name`, `bus_run_*`), plus `handle_find`, `dmabuf_unref`,
  `bus_start/bus_finish` exported, `K.realtime`, `W->seg_deadline`, `kernel_next_wake()`.
- `nucleus/kernel.c`: `kernel_now()` and `run_segment()` real-time branches; `kernel_next_wake()`;
  files via `port_read_file`.
- `nucleus/vm.c`: allocator via `port_heap_*`; `on_interrupt` checks `seg_deadline` in real time;
  `JS_SetMaxStackSize(port_js_stack())`; calibration also reports real milliseconds.
- QuickJS patch 3 (`ESP_PLATFORM` timezone path), recorded in `third_party/quickjs/PATCHES`.
- `tools/p4cap.py`: reset over DTR/RTS and capture the console.
- Answered the user by resetting the board and capturing: it was running the older 0102 visual-REPL
  firmware (`lcd init: ESP_OK actual_khz=40000`, `keyboard init: ESP_OK`).

### Why
- The bus functions moved verbatim, because moving code unchanged is what makes "pixel-identical" a
  meaningful proof that nothing changed.

### What worked
- `make shots && git status --short out/` was clean after the refactor.

### What didn't work
- Adding `board` to the stats JSON changed `out/03-sysmon.png`. A crop showed one world's cpu ms
  going from `1.3` to `1.4`. The cause: `op_sys_json` charges `strlen(json) × 25 ns`, so a bigger
  payload costs more modelled time. This is correct behaviour, so I committed it separately rather
  than weakening the gate.
- `make M32=1`: `fatal error: bits/libc-header-start.h: No such file or directory`. This machine has no
  32-bit glibc headers (gcc-multilib). It is an environment limitation, and the 32-bit check is not run.
- `make SAN=1 shots` changes `03/04/06-sysmon` and `41-about`. A worktree of the untouched commit
  showed the same four changes, so this predates the work (ASan's allocator reports other usable sizes,
  and those screens show memory). UBSan's only report is upstream QuickJS: `quickjs.c:36335: left shift
  of 168 by 24 places`, a benign opcode-mask macro.

### What I learned
- The host's determinism makes the seam safe to build, but only if each change that is visible to JS
  goes into its own commit.

### What was tricky to build
- Keeping `run_*` byte-identical while renaming them: `find()` became `handle_find()`, and the moved
  code needed `wire_us()` with it.

### What warrants a second pair of eyes
- `kernel_next_wake()` calls `pick()`, which is O(worlds). That is fine for 13 worlds.

### What should be done in the future
- Run `make M32=1 shots` on a machine with gcc-multilib.

### Code review instructions
- `git show f136c3b -- nucleus/` and `sim/bus_sim.c`. Validate with `make clean && make && make shots && git status out/`.

## Step 3: P1–P3, the ESP-IDF project, first boot and the -O2 crash

This step wrote `port/esp32p4/` and brought picocalc-os up on the real board. The kernel task runs the
nucleus on the real clock. One FreeRTOS worker per bus does the I2C and SPI transfers and hands the
results back through one queue, and a UART console operates the device. After two build fixes the
firmware booted all 13 worlds, read the battery from the real STM32, and painted "starting launcher…"
on the panel. Then it crashed and rebooted in a loop at about 1.47 s. The cause was QuickJS compiled
at `-O2` without `-fno-strict-aliasing` for 32-bit RISC-V. With that flag the system runs, the
launcher is on the glass, and injected keys move the selection.

### Prompt Context
**User prompt (verbatim):** see Step 1. Mid-step (verbatim): "i see display "starting launcher" and then it turns dark, in a loop"
**Assistant interpretation:** The user is watching the glass. Our first frame appears, then a reset loop.
**Inferred user intent:** Get past the crash loop.
**Commit (code):** 64263b2 "picocalc-os: ESP32-P4 port (port/esp32p4): real clock, bus workers, console"

### What I did
- `port/esp32p4/`: `CMakeLists.txt`, `sdkconfig.defaults` (UART0 console, 32 MB flash, hex PSRAM at
  200 MHz, `FREERTOS_HZ=1000`, `-O2`, no CPU1 idle watchdog, eh-frame backtraces),
  `partitions.csv` (4 MB app).
- `main/CMakeLists.txt` compiles `../../../nucleus/*.c` and `third_party/quickjs` directly.
  `bundle_js.cmake` turns `js/**/*.js|json` into `js_bundle.c` at build time
  (`add_custom_command` after `idf_component_register`, then `target_sources`).
- `main/port_p4.c`: `esp_timer` clock, PSRAM heaps, bundle lookup. `main/bus_p4.c`: I2C and SPI workers,
  framebuffer pinning (`refs++` until the DMA is done), 2 × 32 KiB internal bounce buffers.
  `main/main_p4.c`: `app_main`, the kernel task loop, the console.
- Flashed with `idf.py -p /dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00 flash`
  (later `app-flash`).

### Why
- Workers per bus, not synchronous transfers, for the reasons in design decision 7.3. The first boot
  showed keyboard polls landing every 20.0 ms exactly while other worlds ran.

### What worked
- First boot log: `calibration on the real clock: the 100k loop took 114.3 ms (the model says 133),
  fib(20) 28.9 ms (the model says 29.1)`, then `booting 13 worlds`. Each world's start took about 55 ms.
- `spi2: panel device at 40000000 Hz requested, 40000 kHz actual`.
- The power driver published `{"pct":100,"charging":true,"backlight":32,"screen":true}` from the real STM32.
- After the fix: `shot` decoded with a matching CRC to a launcher screen identical in layout to
  `out/01-home.png`. `key right` moved the selection to REPL in the next shot.
  `heap: internal 193103 free, psram 30500496 free`.

### What didn't work
1. Build: `nucleus/kernel.c:536:34: error: passing argument 2 of 'JS_ToInt32' from incompatible pointer
   type`. Also `vm.c:141,143,591`. On RISC-V newlib, `int32_t` is `long`. Fixed in the nucleus with
   `int32_t` locals (portable, and the host gate is still clean).
2. Build: the same error class inside QuickJS (`quickjs.c:7581 get_sleb128`, `47338 JS_ToInt32`, ...).
   GCC 14 makes it an error, and `-w` does not override that. Fixed with
   `-Wno-error=incompatible-pointer-types` on QuickJS only, as 0101 did.
3. Runtime, every boot:
   `Guru Meditation Error: Core 1 panic'ed (Load access fault)`, `MEPC 0x40017e06`, `MTVAL 0x90175220`,
   `A0 0x90175214`. Backtrace: `string_getc` ← `js_string_iterator_next` ← `js_array_from` ←
   `js_array_every` (QuickJS's shared forEach/map/every) ← ... ← `vm_dispatch` ← `run_segment` ←
   `kernel_task`. The compositor's `len = (s) => Array.from(s).length` was iterating a string whose
   pointer was garbage. The same `A0` appeared in every run.
   - Hypothesis A, missing `-fwrapv` (upstream's Makefile sets it): added it. The crash remained.
   - The trace showed the last line before the panic as a keyboard tick, but the UART driver's TX ring
     is lost when the panic handler takes the UART, so the real last segment was not visible. The
     stack (forEach → len → Array.from) points at the compositor's paint.
   - Hypothesis B, heap alignment. QuickJS 2026-06-04 has its own arena allocator, with headers and
     blocks `aligned(JS_MALLOC_ALIGN = 8)`. A boot probe showed ESP-IDF's PSRAM heap returns 4-aligned
     blocks: `malloc(24) -> 0x48000a94 (mod 8 = 4)`. glibc always gives 16. I fixed it with
     `heap_caps_aligned_alloc(8, …)` and an aligned realloc. It was a real precondition violation, but
     the crash remained (`MTVAL 0x9017be0c`).
   - Hypothesis C, optimization. QuickJS at `-Og`: no crash for 10 s, and the calibration became
     134.9 ms / 31.5 ms, matching 0101's 133 / 31. QuickJS at `-O2 -fno-strict-aliasing`: no crash,
     115.7 ms / 29.0 ms. **Root cause: a strict-aliasing violation in QuickJS's 32-bit NaN-boxing path
     that GCC 14.2 for RISC-V exploits at `-O2`.** x86-64 builds don't use NaN-boxing, which is why the
     host never showed it.
4. The first console command after a reset arrived as `unknown command �stats`, a stray byte from the
   reset. `p4cap.py` now sends a newline first.

### What I learned
- The simulator's 133 ms calibration matches an `-Og` QuickJS build. At `-O2` the device is about 13%
  faster than the model.
- On the P4, the panic handler drops whatever is still in the UART driver's TX ring. The last log line
  before a panic is not necessarily the last thing that happened.

### What was tricky to build
- Ordering in the IDF component CMake: `add_custom_command` is not allowed in early-expansion script
  mode, so the bundle is generated after `idf_component_register` and attached with `target_sources`.
- Deadlock freedom between the kernel and the workers. The kernel blocks on a worker's request queue
  when it is full, and a worker blocks on `p4_kq` when that is full. `p4_kq` is sized to hold every
  request the bus queues can hold (64 + 256 + 64), so a worker never blocks while the kernel waits on it.

### What warrants a second pair of eyes
- `-fno-strict-aliasing` is a mitigation; the violating QuickJS code is not identified. A minimal
  reproduction (32-bit RISC-V, `-O2`, `Array.from` over a string parsed from JSON) would be worth
  sending upstream.
- `bus_run_spi_pixels` keeps `b->front` in the request. That is safe only because of the `refs++` pin,
  and because the compositor does not commit while a flush is in flight (design doc section 4).

### What should be done in the future
- Fix the sysmon overflow the user reported (next step).
- Measure the lane, compositor paint and flush times (P5).

### Code review instructions
- Start at `port/esp32p4/main/main_p4.c:kernel_task`, then `bus_p4.c` (`bus_run_*`, the workers,
  `bus_p4_done`).
- Build: `cd picocalc-os/port/esp32p4 && source ~/esp/esp-idf-5.4.2/export.sh && idf.py build`.
  Flash: `idf.py -p /dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00 flash`.
  Check: `python3 tools/p4cap.py -s 20 -c "5 stats" -c "6 shot" --shot-dir /tmp/shots`.

### Technical details
- Image size: 1,191,211 bytes. DIRAM used 140,413 of 576,464.
- Boot: worlds start at about 55 ms each. The first full frame (204,800 bytes) flushes at about 1.37 s
  after kernel start.

## Step 4: User questions on CPU and the keyboard; System app fixes; a tool that stalled the OS

With the system running, the user looked at the System app on the glass and asked four questions:
whether the keyboard is interrupt-driven, what the main graph shows, how to see CPU per process, and
why the turns counter overwrites the cpu column. The answers led to two UI fixes and a cpu% column.
While verifying them, a scripted tour showed the keyboard polling only 33 times a second. That turned
out to be my own screenshot command blocking the kernel task, so it was moved to its own task.

### Prompt Context
**User prompt (verbatim):** "is keyboard interrupt driven? is the main graph cpu use? how do I see cpu use by process? Also when turns counter overloads it overwrites the cpu / ms or so"
**Assistant interpretation:** Explain the polling and the graph, then fix the column overflow and make
per-world CPU use visible.
**Inferred user intent:** Understand where time goes on the real device, and have the monitor stay readable on a long-running device.
**Commit (code):** 4158c36 "System app: cpu% per world; counters that never overflow their column"; cf9f1e7 "p4: shots no longer stop the kernel; …"; 91971f4 "About: say whether the clock is real or virtual"; 9c992a4 "README: the device build, …"

### What I did
- Answers. The keyboard is polled every 20 ms over I2C (write the status register, 2 ms, read), as in
  `picocalc_keyboard.c`; there is no interrupt line in this design. The graph is "lane busy": the share of
  wall time the single lane spent in segments, sampled every 500 ms. That is the JS system's CPU use on
  core 1. Per world there was only the cumulative `cpu ms`.
- Overflow cause: in `js/apps/sysmon.js`, `turns` and `cpu ms` were flex columns of about 42 px.
  `drawTable` in `js/system/compositor.js` right-aligned with `tx = cx + ws - 4 - tw`, which goes left of
  the column once the text is wider than the column.
- Fixes: the compositor clamps `tx` to the column and cuts with an ellipsis. sysmon formats counters in
  at most 5 characters (`short()`, checked at the boundaries: 9999.6 → `10.0k`, 99960 → `100k`,
  999600 → `1.0M`). A `cpu%` column shows each world's cpu-ms delta over the wall-ms delta between
  samples, and a "cpu" row in the detail panel shows the same for the selected world.
- Tour over serial (REPL, Faults, Buses) with four shots. Then the keyboard measurements, then
  `shot_task`.
- `sys.stats()` gained `clock`, and About shows "real; budgets in wall time" on the device. The budget
  message no longer says "virtual ms" on the real clock.

### Why
- The clamp in the compositor fixes every table, not only sysmon's; compact formatting makes sysmon's
  values fit anyway.

### What worked
- Device System screen: compositor 8.3%, keyboard 3.4%, sysmon 3.1%, lane 18%.
- Tour: `1+2` → `3`. The 100k loop gave `4999950000 (124 ms)`. The sandbox loop was stopped:
  `#OCT1 {... "world":"sandbox", ... "why":"ran past its turn budget of 200 virtual ms" ...}` (wording
  since fixed). flaky threw and was restarted. The display was killed during a flush
  (`display crashed handling flush: killed by faults`), restarted 100 ms later, re-ran its panel
  init, and the screen came back. That exercised the framebuffer pin in `bus_run_spi_pixels`.
- Keyboard rate: idle 49.5/s and 49.8/s, typing 49/s, while the REPL evaluates 49/s. With the new shot
  task, 48/s across four shots.

### What didn't work
- First column layout: the header `cpu ms` itself was cut to `cpu …`, because the flex columns were 36 px.
  The widths were rebalanced (world 72, state 62, KB 32, rst 22, so the flex columns are 40).
- In the tour: `keyboard 1154 turns` in 34.7 s, about 33/s. Typing alone did not reproduce it (49/s).
  The cause was `shot()` running on the kernel task: about 25 KB of base64 at 115,200 baud is about
  2.5 s per shot, with no world running meanwhile. Four shots account for about 550 missing polls.

### What I learned
- Debug tooling that shares the kernel task changes the measurements it is meant to make.

### What was tricky to build
- Sharing stdout between the shot task and kernel logs: lines from different tasks can interleave
  between a shot's lines. Each base64 line is one `printf`, and the decoder accepts only lines matching
  `^[A-Za-z0-9+/]+=*$` between `#SHOT` and `#END`. The CRC catches anything that still slips through.

### What warrants a second pair of eyes
- `cpu%` uses deltas of `cpu_ms`, which resets when a world restarts. The code shows `·` when the value
  goes backwards.

### What should be done in the future
- Physical keyboard confirmation by a person (the Keys app shows `events` from the STM32).

### Code review instructions
- `git show 4158c36 -- js/` and `git show cf9f1e7 -- port/esp32p4/main/main_p4.c`.
- Device: `python3 tools/p4cap.py -s 26 -c "5 key m" -c "7 shot" -c "21 stats" --shot-dir /tmp/shots`.

### Technical details
- Measurements are in design doc section 15.3.
