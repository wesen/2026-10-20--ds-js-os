---
Title: Diary
Ticket: PAPERS3-OFF
Status: active
Topics:
    - papers3
    - esp32-s3
    - power
    - epaper
    - persistence
DocType: log
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of PAPERS3-OFF: the design research, then each implementation phase."
LastUpdated: 2026-10-28T20:07:21.540386349-04:00
WhatFor: "Following how power-off-when-idle was designed and built, and why."
WhenToUse: "When resuming the ticket or reviewing one of its commits."
---

# Diary

## Goal

Let picocalc-os on the M5Stack PaperS3 switch the board off after a period without use on battery and resume
at the same screen when the power button or the real-time clock starts it again:

- a per-world persistent store;
- a kernel power-off operation;
- RTC wake;
- a standby service with a suspend protocol;
- a resume that repaints only what changed.

The guide is `design-doc/01-power-off-when-idle-analysis-design-and-implementation-guide.md`.

## Step 1: Research and the guide

PAPERS3-IDLE had just closed, with the board in light sleep while idle. The next step in its list of
follow-ups was to switch the board off entirely. This step collected the hardware facts that decide what
the firmware can do and read every part of picocalc-os the change touches. From that I wrote the intern
guide, with a design in five pieces and phases P1 to P6.

The research found one fact that changes the plan. M5GFX's `init()` clears the panel and refreshes it
white at every boot, so a resume that keeps the old picture also has to change how the panel is started.

### Prompt Context

**User prompt (verbatim):** "Ok, do 1. and then 2. (new ticket, new design doc, then implement and commit + diary). --- when ready for 2: Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable. --- Diary format is MANDATORY from skill"

**Assistant interpretation:** Item 1 was the PAPERS3-IDLE wrap-up, finished before this ticket. Item 2 is
this ticket: create it, write an intern guide, upload the guide to reMarkable, then implement in phases with
commits and a diary in the investigation format.

**Inferred user intent:** A tablet that lasts weeks on a charge and resumes where it was, built in the same
evidence-backed, host-tested way as the earlier tickets.

**Commit (code):** none in this step (documentation only; see the commit that adds this ticket).

### What I did

- Created the ticket `PAPERS3-OFF` with the guide and this diary (`docmgr ticket create-ticket`,
  `docmgr doc add`).
- Read M5's reference code for the power path:
  - M5Unified `Power_Class.cpp`: `powerOff()` pulses GPIO44 five times and then deep-sleeps;
  - M5Unified `RTC8563_Class.cpp`: timer and alarm registers, `disableIRQ`;
  - M5PaperS3-UserDemo `sleepAndWakeupTest`: `setAlarmIRQ(16)` then `powerOff()`, so the RTC can start
    the board.
- Read M5GFX's panel start-up:
  - `LGFXBase.cpp:3621` `init_impl(use_reset, use_clear)`;
  - `Panel.hpp:88` `endWrite()`, which calls `display(0,0,0,0)` when auto-display is on;
  - `Panel_EPD.cpp:164` (auto-display on in the constructor) and `:553` (`display` flushes the modified
    range).
- Read the parts of picocalc-os the design touches:
  - `nucleus/kernel.c`: `defer`, `apply_deferred`, `discard_deferred`, `crash_at`, `kernel_init`,
    `kernel_boot`, `kernel_shutdown`;
  - `nucleus/nucleus.h`: the port API and `dmabuf_t`;
  - `nucleus/hw.c`: `dmabuf_alloc` and `NEVER_DRAWN`;
  - `nucleus/vm_mqjs.c`: the op tables, `op_clock_set`, `op_sys_front`;
  - `js-papers3/prelude.js`: the builder, `sys`;
  - the clock, power and display drivers, the compositor's start and focus code, and the repl, sketch
    and system apps;
  - `host/main_host.c` and `sim/papers3/{board.c,bm8563.c,papers3.h}`;
  - `port/esp32s3-papers3/{partitions.csv, main/port_s3.c, main/bus_s3.cpp}`.
- Wrote the guide: 14 sections, with mermaid diagrams for the power path, the architecture, the suspend
  and resume sequence and the simulated power states; pseudocode and C/JS sketches for every new
  operation; and a file table.
- Added tasks P1 to P6 (`docmgr task add`) and related six primary files to the guide.

### Why

- One record per world rather than one NVS entry per key: NVS keys have a 15-character limit, and a
  quota is easier to enforce on one string.
- Store writes are deferred effects, so the kernel's existing rule (a faulted segment's effects are
  discarded) gives crash safety for free.
- Power-off is an asynchronous operation that can settle with `{ off: false }`: on USB the latch is
  bypassed, and GPIO4 cannot prove the board is on battery once the cell is full.
- The resume picture is the framebuffer's `front`, saved after the last present and used at most once.
  That makes "the glass equals `front`" true by construction, and a boot that did not follow a suspend
  falls back to the normal flashing boot.
- I reordered the phases from the plan in my earlier summary. The device facts (latch pulse, RTC wake,
  glass retention) need the user on battery, so they move to P6. P1 to P5 are built and tested on the
  host first.

### What worked

- The M5 sources answered every question about the power path that the schematic leaves open, except
  the open ones listed in guide section 12.
- The existing deferred-effect machinery fits the store without any new kernel concept.

### What didn't work

- My first `docmgr doc relate --doc ttmp/.../PAPERS3-OFF*/design-doc/01-*.md` failed: docmgr does not
  expand globs, and zsh passed the pattern through unexpanded inside the quoted variable:
  `Error: doc not found: "ttmp/2026/10/28/PAPERS3-OFF*/design-doc/01-*.md"`. Resolving the path with
  `ls` first fixed it.

### What I learned

- Every boot today flashes the panel twice: once in M5GFX's `init()` (a white quality refresh) and once
  for the display driver's "first frame" clean refresh. Turning auto-display off before `init()` removes
  the first one on every boot, not only on resume.
- The BM8563's INT stays asserted until the flag is cleared. If it also holds the power circuit on, a
  wake that is never acknowledged would make the next power-off fail, so the clock driver must clear the
  flags at start.
- `esp_reset_reason()` cannot tell a button start from an RTC start; only the RTC's TF/AF flags can.

### What was tricky to build

- The host simulation of a power cycle. The kernel has never been re-initialised inside one process.
  `K` holds world pointers, events, handles and framebuffers; the engine binding has statics
  (`wall_offset_ms`, the compiled prelude cache). The design adds `kernel_reset()` and an absolute board
  time so that the RTC and the glass survive while `K.vnow` starts again from 0. This is the riskiest
  piece of P2 and needs the sanitizer build.

### What warrants a second pair of eyes

- The ordering claim in guide section 8.3: `fb.persist()` is applied before the compositor's reply
  reaches standby, because deferred effects apply in order and the reply is made at the end of the turn.
  This should be checked against `finish_turn` when P4 is implemented.
- The claim that M5GFX's waveform tables depend only on the target level, so a partial update is correct
  whatever the glass showed (guide section 9.3). It comes from reading the LUT layout, not from a test.

### What should be done in the future

- P1: the persistent store.

### Code review instructions

- Read the guide from section 2 to section 11 in order. Check the register values in section 2.4 against
  the PCF8563 datasheet, and the boot-clear chain in section 3.6 against the three M5GFX files named there.

### Technical details

- Partition plan: `store, data, nvs, 0x610000, 1M` after the 6 MB factory app (16 MB flash).
- RTC timer: `0x0E = 0x82` (1 Hz) or `0x83` (1/60 Hz), `0x0F` count, `0x01 |= TIE`, TF bit 2, AF bit 3.
- M5Unified's PaperS3 power-off: GPIO44 high and low, 50 ms each, five times, then `esp_deep_sleep_start()`.

## Step 2: P1, the persistent store

This step gave every world a persistent record. A world reads it with `store.get` and writes it with
`store.set`. The write reaches the store only when the segment ends cleanly. The kernel side is two
host operations in the MicroQuickJS binding. The device keeps the records in NVS in a new 1 MB
partition; the host keeps them in memory, or in files with `-s DIR`. REPL, Sketch and System save on
a `"suspend"` message, which nothing sends yet (that is P4), and restore at start.

On the host, the test script shows the three properties the design asks for:

- a value survives a restart;
- a segment that throws after `store.set` writes nothing;
- a write over the quota is refused and leaves the record as it was.

On the device, the System app's tab and the REPL's record survived a reboot.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement phase P1 of the guide, commit it, and record it here.

**Inferred user intent:** A store the later phases can rely on for suspend and resume.

**Commit (code):** 379d27d — "picocalc-os: a persistent store, one JSON record per world (PAPERS3-OFF P1)"

### What I did

- `nucleus/vm_mqjs.c`:
  - `op_store_load` returns the record as a string, or `null`;
  - `op_store_save` checks the quota and defers `run_store_save`. If a write of the same world is already
    in the segment's deferred list, it replaces that write's text instead of adding another;
  - world names longer than 15 characters (NVS's key limit) have no store;
  - the manifest's `store_kb` is parsed.
- `nucleus/nucleus.h`:
  - `port_store_get` and `port_store_set`;
  - `world_t.store_limit`;
  - `manifest_world_t.has_store` and `store_kb`.
- `nucleus/kernel.c`: the default quota is 16 KB.
- `js-papers3/prelude.js`: `store.get/set/remove/all`. The record is loaded on first use, and values are
  copied in and out through JSON. If the quota check throws, the in-memory record is put back as it was.
- `host/port_host.c`: records in a list, or files under `-s DIR` (`host/main_host.c`, `host/board.h`).
- Device:
  - `partitions.csv`: `store, data, nvs, 0x610000, 1M`;
  - `main/port_s3.c`: `s3_store_init` (erases the partition when NVS reports an unusable format),
    `port_store_get`, `port_store_set` (`nvs_set_blob` + `nvs_commit`);
  - `main/CMakeLists.txt`: the `nvs_flash` requirement;
  - `main/main_s3.c`: console commands `reboot` and `store WORLD`.
- Apps: REPL (`hist`, the last 40 output lines, the line being edited), Sketch (`strokes`, quota 32 KB in
  `system.json`), System (`tab`).
- Test world `js-papers3/test/keep.js` with manifest `js-papers3/test/store.json` (quota 1 KB). Ticket
  script `scripts/01-store.sh` runs `01-store.txt` and diffs the kernel log against `01-store.expected`.

### Why

- The prelude keeps a parsed copy and sends the whole record on each `set`. The C side needs no JSON
  parser for this, and coalescing in C makes a loop of `set` calls cost one flash write.
- Copying values in and out means a world that changes an object after `store.set` does not change what
  `store.get` returns. Without the copy, the record in memory and the record in flash could differ.
- A separate partition: the store's size and its wear do not touch IDF's own `nvs`.

### What worked

- Host run of `01-store.txt` (excerpt of `01-store.expected`):

  ```text
  [   300.206] keep: start: {"a":{"x":1},"b":[1,2,3]}
  [ 11200.121] keep crashed handling put-throw: Error: thrown after store.set (test/keep.js:8:74)
  [ 11300.327] keep: start: {"a":{"x":1},"b":[1,2,3]}           <- "c" was never written
  [ 22202.417] keep: many: {"a":{"x":1},"b":[1,2,3],"n":99}
  [ 22207.552] keep: big: keep's store would be 2 KB; its limit is 1 KB
  [ 22207.575] keep: after big: {"a":{"x":1},"b":[1,2,3],"n":99}
  [ 22400.205] keep: start: {"a":{"x":1},"n":99}                 <- the remove of "b" persisted
  ```

- The sanitizer build (`make BOARD=papers3 SAN=1`) ran the same script with no reports.
- Device (`tools/s3cap.py`, log in the scratchpad as `store/dev1.log`):

  ```text
  I (29) boot:  3 store            WiFi data        01 02 00610000 00100000
  I (922) store: 2 of 32256 entries used
  store system: {"tab":2} (9 bytes)                  <- after "send system tab" and "send system suspend"
  ... reboot ...
  I (878) store: 12 of 32256 entries used
  store system: {"tab":2} (9 bytes)                  <- read back after the reboot
  ```

### What didn't work

- My first host script crashed `keep` three times within ten seconds. The kernel then stopped the world
  instead of restarting it, and the later messages vanished. That is the kernel's crash-loop rule, not a
  store bug. The final script spaces the crashes eleven seconds apart.
- The first device build ran with the wrong ESP-IDF. `. ~/esp/esp-idf/export.sh` activates IDF 5.1, while
  the project was configured with 5.3.4: "'.../idf5.1_py3.13_env/bin/python' is currently active in the
  environment while the project was configured with '.../idf5.3_py3.13_env/bin/python'". The right one is
  `. ~/esp/esp-idf-5.3.4/export.sh`.
- `send repl type 1+2` on the device console did not put text on the REPL's line. The console's `send`
  takes a JSON payload and the REPL's `type` handler expects `{text}`. The store test did not depend on it.

### What I learned

- An empty NVS partition already uses 2 entries; the store's two namespaces account for them.
- The capture gate changed in two images, `03-system.png` and `07-about.png`, and only in live counters:
  turn counts went up by one for the apps that now have `onStart`, and arena kilobytes changed slightly.
  I checked the changed regions side by side and re-baselined the two captures.

### What was tricky to build

- Coalescing has to work without a pointer from the world to its pending deferred write. The deferred
  list is freed by `discard_deferred` when a segment faults, so a stored pointer would dangle. Searching
  `K.defer_head` for `run_store_save` with the same world id avoids that. The list holds only one
  segment's effects, so the search is short.

### What warrants a second pair of eyes

- `run_store_save` writes on the kernel task at segment end. A large record (Sketch: up to about 15 KB)
  blocks the lane for the NVS write. That is fine at suspend; a world that saves on every touch would
  make the lane stutter. Nothing enforces "save rarely".

### What should be done in the future

- P2: the power-off operation and the simulated power cycle.

### Code review instructions

- Start with `op_store_save` and `run_store_save` in `nucleus/vm_mqjs.c`, then the `store` block in
  `js-papers3/prelude.js`, then `port_store_*` in `host/port_host.c` and `port/esp32s3-papers3/main/port_s3.c`.
- Validate: `ttmp/2026/10/28/PAPERS3-OFF--*/scripts/01-store.sh`; `make BOARD=papers3 shots` (only
  `03-system.png` and `07-about.png` differ from the parent commit, in counters).

### Technical details

- NVS: `nvs_flash_init_partition("store")`, `nvs_open_from_partition("store", "w"|"k", NVS_READWRITE, &h)`.
  Blobs via `nvs_get_blob(h, key, NULL, &n)` (size) and then the data; `nvs_erase_key` for an empty record.
- The record `{}` is stored as a removal (length 0).

## Step 3: P2, power-off and the simulated power cycle

This step added the operation that switches the board off, and a host simulator that can live through it.
`sys.powerOff()` is an asynchronous operation with the claim `sys.power`. Its effect runs after the
segment's other effects, so the segment's store writes reach the store first. On the device it pulses
GPIO44 as M5Unified does. If the board is still running afterwards, or the charger said external power
before the pulses, the promise settles with `{ off: false, why }`.

On the host the simulated board halts the kernel. The runner then frees everything with a new
`kernel_reset()` and lets the board's own time pass. The `power` script command boots the kernel again
from scratch, as a cold boot would. The store, the glass and the RTC belong to the board and stay.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement phase P2 of the guide, commit it, and record it here.

**Inferred user intent:** The power path, testable end to end without unplugging anything.

**Commit (code):** dec7a4e — "picocalc-os: sys.powerOff and a simulated power cycle (PAPERS3-OFF P2)"

### What I did

- `nucleus/vm_mqjs.c`:
  - async operation `poweroff` with claim `sys.power`, deferred to `run_poweroff`;
  - `run_poweroff` calls `port_power_off`, and if that returns nonzero settles the promise with
    `{"off":false,"why":...}`;
  - `vm_reset()` puts the wall clock back to `WALL_BOOT_MS` and clears the operation profile.
- `nucleus/nucleus.h`: `K.halted`, `kernel_reset`, `vm_reset`, `port_power_off`.
- `nucleus/kernel.c`:
  - `kernel_run_until` returns at once while `K.halted`;
  - `kernel_reset()` discards deferred effects, frees the events (with their messages and settles), every
    world (VM, mailbox, settles, source, frame, trace, turn texts) and the framebuffers, then clears `K`.
    It keeps the console log, the verbosity flags and the JS root.
- `nucleus/vm.c` (the PicoCalc's QuickJS binding): an empty `vm_reset`. The linker needs it, because
  `kernel.c` is shared between the two boards.
- `sim/papers3/board.c`:
  - `port_power_off` refuses while `battery N charging` or `battery N usb` (USB in, cell full); otherwise
    it sets `K.halted`;
  - board time is `sim_base_us + K.vnow`;
  - `board_off` (advances the base, resets the GT911 and the touch interrupt state), `board_pass`,
    `board_next_wake` (`VT_INF` until P3), `board_wake`.
  - `sim/papers3/bm8563.c` runs on board time; `sim/board.c` (the PicoCalc) has stubs.
- `host/main_host.c`:
  - `pass(us)` runs the kernel while the board is on and lets time pass while it is off (booting on an
    RTC wake once P3 provides one);
  - `check_halted()` after every command;
  - the `power` command;
  - while off, only `wait`, `run`, `capture`, `print`, `quit`, `power`, `panel` and `battery` act; the
    rest print "the board is off: X does nothing";
  - the runner's own timestamps use board time.
- Device (`port/esp32s3-papers3/main/port_s3.c`): `port_power_off`. It refuses if GPIO4 is low; otherwise
  it pulses GPIO44 high/low five times, 50 ms each, waits a second, and returns "still powered after the
  off pulses (USB?)". QEMU returns "no power latch under QEMU". `main_s3.c`: `boot` names reset reasons
  11 to 15 (USB, JTAG, efuse, power glitch, CPU lockup).
- Faults app: a fifth button, "Power off now", and the claim `sys.power` in `system.json`, for the
  battery tests in P6.
- Tests: `js-papers3/test/off.js` (counts its boots in the store), the manifest `test/power.json`, and
  `keep.js`'s `rude` handler (a world without the claim). Ticket script `scripts/02-power.sh`.

### Why

- `kernel_reset` plus a fresh `kernel_init` and `kernel_boot` in the same process, rather than
  re-executing the runner: a script can go through several power cycles, and captures and the console
  log continue in one run.
- A board time separate from `K.vnow`: the real BM8563 keeps counting while the board is off. The
  kernel's clock starts again from 0 at a cold boot, as the device's uptime does.
- `battery N usb`: GPIO4 high with USB in (cell full) is the case where only trying the latch tells. The
  simulator must be able to reach the "still powered" path, because the standby service has to recover
  from it.

### What worked

- `scripts/02-power.sh` (excerpt of the expected output, timestamps removed):

  ```text
  the board is off                       <- send off off, on battery
  the board is off: send does nothing
  the board is on (button)               <- power
  ...
  keep: rude: keep has no claim on sys.power
  off: boot 2
  keep: start: {"a":1}                   <- the store survived the power cycle
  the board stayed on: external power (charging)
  off: stayed on: external power (charging)
  the board stayed on: still powered after the off pulses (USB?)
  off: stayed on: still powered after the off pulses (USB?)
  ```

- The sanitizer build ran the script through three boots and two resets with no reports, including no
  leaks at exit.
- Device, on USB (`tools/s3cap.py`, `send faults act {"arg":4}`):

  ```text
  gpio 4: 0
  [  8166.875] switching the board off
  [  8167.470] the board stayed on: external power (charging)
  ```

- Capture gates: the PicoCalc's `make shots` is unchanged. In the PaperS3's, the six Faults captures
  changed (the new button) and `03-system.png` changed (counters). I looked at `20-faults.png` and
  re-baselined.

### What didn't work

- The first PicoCalc build failed to link:
  `kernel.c:649: undefined reference to 'vm_reset'`. The QuickJS binding needed the empty function.
- I first generated `02-power.expected` from inside `picocalc-os/` with a path relative to the
  repository root, so the runner printed `cannot open ttmp/.../02-power.txt` and the expected file was
  wrong. Absolute paths fixed it.
- The expected files compared timestamps, so adding a handler to `keep.js` moved `01-store`'s lines by
  1 µs (more source to parse) and broke its test. Both scripts now strip the `[ t ]` prefix before the
  diff. Order and content are what these tests check.

### What I learned

- Nothing in the kernel needed a "resume" concept: a cold boot with a store is enough.
- Only `vm_mqjs.c`'s wall-clock offset needed resetting among the binding's statics. The compiled
  prelude cache can stay because the prelude text is the same.

### What was tricky to build

- The interleaving of halting and time in `pass()`. `kernel_run_until` returns early with `K.vnow` at
  the moment of the halt. `board_off()` must fold that into the board's base before `kernel_reset()`
  sets `K.vnow` to 0. Otherwise the remaining wait would be computed from a clock that jumped back.

### What warrants a second pair of eyes

- `kernel_reset` against the full system (14 worlds, framebuffers, handles granted between worlds) is
  first exercised in P4. The test manifest has only two worlds and no framebuffer.
- On the device the pulse sequence has not run on battery yet (P6).

### What should be done in the future

- P3: the wake reason and the RTC timer in the clock driver, and the simulated BM8563's timer and INT.

### Code review instructions

- `run_poweroff` and the `poweroff` branch in `nucleus/vm_mqjs.c`; `kernel_reset` in `nucleus/kernel.c`;
  `pass`, `power_on` and `check_halted` in `host/main_host.c`; the power section of `sim/papers3/board.c`;
  `port_power_off` in `port_s3.c`.
- Validate: `scripts/01-store.sh`, `scripts/02-power.sh`, `make shots`, and `make BOARD=papers3 shots`
  (Faults and System captures differ from the parent).

### Technical details

- Host runner, after a halt: `board_off()` (`sim_base_us += K.vnow`, `gt911_init()`), then
  `kernel_reset()`, then `off = true`. On `power`: `board_wake("button")`, `kernel_init(js_root, NULL)`
  (keeps the open console log), `kernel_boot(manifest_path)`.

## Step 4: P3, RTC wake, and the interrupt that power-cycles a running board

This step taught the clock driver to say why the board started and to arm the BM8563's countdown timer.
The simulated BM8563 got the timer, its flag and its interrupt. The device test turned up a fact the
design had not expected. When the timer's interrupt goes active, the board power-cycles even while it is
running on USB. That makes a failed power-off with an armed timer dangerous; the standby service must
disarm it. It also makes the resume path testable on USB, which P5 will use.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement phase P3 of the guide, commit it, and record it here.

**Inferred user intent:** A board that can wake itself, with the wake reason visible to the system.

**Commit (code):** 855f0d2 — "picocalc-os: RTC wake in the clock driver and the simulated BM8563 (PAPERS3-OFF P3)"

### What I did

- `js-papers3/drivers/clock.js`:
  - `wakeReason()` at start: read 0x01; TF means "rtc", AF means "alarm", otherwise "button"; log
    "started by ..." with the register value when a flag was set; write 0x01 = 0 and 0x0E = 0;
  - `"wake"` returns `{ reason }`;
  - `"alarm"` takes `{ inSec }` or `{ inMin }`: 1 Hz (`0x82`) up to 255 s, else 1/60 Hz (`0x83`); then
    0x0F = count and 0x01 = TIE;
  - `"disarm"` writes 0x01 = 0 and 0x0E = 0;
  - `"stats"` gains `wake` and `armed`.
- `sim/papers3/bm8563.c`, rewritten around a register file:
  - control/status 2 (flags can only be cleared), the alarm registers (kept, never fire), timer control
    and count;
  - a countdown on board time that sets TF when it runs out and reloads when TF is cleared;
  - `bm8563_int`, `bm8563_next_int` (the next edge) and `bm8563_take_edge` (an edge latched during a
    run).
- `sim/papers3/board.c`: `board_next_wake` and `board_take_wake` from the RTC. `sim/board.c`: a stub.
- `host/main_host.c`, `pass()`:
  - while on, the kernel runs in 50 ms slices of board time; after each slice a latched RTC edge
    power-cycles the board ("the RTC's interrupt power-cycles the board", then `power_on("rtc")`);
  - while off, time jumps to the next edge and the board boots.
- `js-papers3/test/off.js` asks the clock why it started and logs the wall clock; `{inSec|inMin}` arms the
  timer first and deliberately leaves it armed if the board stays on. `test/power.json` gains the clock
  driver.
- Ticket script `scripts/03-rtc.sh`. `02-power.expected` was regenerated, because the manifest now has a
  clock.
- Guide: section 2.3 (the measured power-cycle), section 8.3 (disarm after a failed power-off),
  section 10.2 (seconds, and the first-tick behaviour of minutes), section 10.3 (edges and slices).

### Why

- Seconds as well as minutes: the device test showed that a one-minute timer fires within seconds,
  because the 1/60 Hz source ticks on the chip's own minute boundary. Tests need precise times, and
  short real-world wakes need them too.
- Slices in `pass()`: `send off off {"inSec":20}` arms the timer during the following `wait`. A
  `board_next_wake()` computed before the wait sees no timer, and after the run TF is already set, so
  there is no edge left to find. Latching the edge in the model and checking it every 50 ms catches it
  within 50 ms of when it happened.

### What worked

- Host, `scripts/03-rtc.sh` (runner output):

  ```text
  [   2001.0 ms] the board is off
  [  62000.0 ms] a minute later: still off
  [ 122000.5 ms] the board is on (rtc)
  [ 132000.0 ms] the board is off
  [ 732000.0 ms] ten minutes later: still off (the timer was stopped at boot)
  [ 732000.0 ms] the board is on (button)
  [ 754050.0 ms] the RTC's interrupt power-cycles the board        <- on USB, timer left armed
  [ 754050.0 ms] the board is on (rtc)
  ```

  with the kernel log saying `off: boot 2, started by rtc at 09:43` (two minutes after 09:41) and
  `clock: started by rtc (control 2: 0x5)`.
- Device, on USB, arming 15 s at t = 9 s (`tools/s3cap.py -c "9 send clock alarm {\"inSec\":15}"`), then
  reading the board again without a reset:

  ```text
  up 19.5 s; the last reset: USB (11)          <- before the timer ran out
  ...
  [  1204.718] clock: started by rtc (control 2: 0x5)
  up 28.9 s; the last reset: power-on (1)      <- the board power-cycled at about 24 s
  ```

- Capture gates: the PicoCalc's is unchanged. In the PaperS3's, `03-system.png` and
  `05-system-buses.png` changed: the clock's two extra I2C writes at boot appear in the bus counters.
  Re-baselined.

### What didn't work

- The first device run armed the timer with `{"inMin":1}` and sent `reboot` 67 s later. No output came
  after the `send`, and the `reboot` never answered. Reading the board again showed
  `clock: started by rtc (control 2: 0x5)` and `the last reset: power-on (1)` with an uptime that put the
  restart a few seconds after arming. The timer had fired almost at once (the first-tick behaviour
  above) and power-cycled the board. The console reader lost that boot's output, so the `reboot`
  command went nowhere.
- The first simulator version computed the wake time once per `wait`. It missed the timer armed during
  the wait, and the test's last section printed no power cycle. That led to the slices and the latched
  edge.
- `off.js` first armed only on `m.inMin`, so `{"inSec":20}` did nothing; it now passes the request through.

### What I learned

- The PaperS3's RTC interrupt does more than "switch the board on". On USB it causes a power-on reset
  of a running chip. Whatever circuit the interrupt drives, it reacts to the interrupt going active, and
  USB power does not mask it.
- `esp_reset_reason()` does distinguish this power-on reset from the console's USB reset (11) and from
  `esp_restart` (3), but not from a button start. The RTC's flags remain the only way to name the
  source.

### What was tricky to build

- The RTC model's notion of an edge. INT stays active until TF is cleared, and the real board reacted
  once, not continuously. The model therefore reports only transitions to active, latched with the time
  they happened. Enabling TIE while TF is already set also counts as a transition.

### What warrants a second pair of eyes

- The slices change how `kernel_run_until` is called during `wait`: many short calls instead of one long
  one. The capture gates are unchanged apart from counters, which is the evidence that scheduling is
  unaffected. A reviewer should still read `kernel_run_until`'s final `K.vnow = until` with slices in
  mind.
- Whether the power button pressed on a running board also power-cycles it is still unknown (guide
  section 12).

### What should be done in the future

- P4: the standby service, the activity channel, the suspend protocol (including `"disarm"` after a
  refused power-off) and the asleep screen.

### Code review instructions

- `js-papers3/drivers/clock.js` (`wakeReason`, `"alarm"`, `"disarm"`), `sim/papers3/bm8563.c`,
  `pass()` in `host/main_host.c`.
- Validate: `scripts/01-store.sh`, `scripts/02-power.sh`, `scripts/03-rtc.sh`, both `make shots` gates.

### Technical details

- BM8563 timer: `0x0E` = TE (bit 7) | TD (bits 1–0: 2 = 1 Hz, 3 = 1/60 Hz); `0x0F` = count; `0x01` bit 0
  TIE, bit 2 TF, bit 3 AF. The value read after the device's RTC wake was `0x05` = TF | TIE.
