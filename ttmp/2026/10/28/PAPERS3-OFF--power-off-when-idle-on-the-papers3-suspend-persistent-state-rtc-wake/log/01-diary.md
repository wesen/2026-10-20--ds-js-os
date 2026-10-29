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
