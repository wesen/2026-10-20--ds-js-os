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
