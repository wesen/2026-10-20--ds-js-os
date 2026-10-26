---
Title: Diary
Ticket: PAPERS3-PORT
Status: active
Topics:
    - embedded
    - esp32-s3
    - papers3
    - mquickjs
    - epaper
    - porting
    - os
DocType: log
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Chronological implementation diary for porting picocalc-os to the M5Stack PaperS3.
LastUpdated: 2026-10-26T19:33:08.982427781-04:00
WhatFor: Reasoning, failures and evidence behind each step of the PaperS3 port.
WhenToUse: Resume work, review a commit, or trace why the port looks the way it does.
---

# Diary

Entries are chronological (oldest first). Task IDs refer to `tasks.md`.

## Step 1: Study the OS, the PaperS3 prior art and mquickjs; write and publish the guide

This step was about understanding enough to design the port. I read the whole nucleus (`nucleus.h`,
`kernel.c`, `vm.c`, `hw.c`, `gfx.c`), the host runner and simulator, the prelude, the compositor and
the drivers, and the ESP32-P4 port. A survey agent read the PaperS3 projects in `esp32-s3-m5`
(0075–0114, the ESP-50/53/55/56/57 tickets and the go-go-parc notes). I built the vendored mquickjs on
the host and probed its dialect myself. The result is the design doc
`design-doc/01-picocalc-os-on-the-papers3-analysis-design-and-implementation-guide.md`. It was uploaded
to reMarkable and published as an artifact.

The central findings:

- The nucleus is engine-neutral except for `world_t`'s JS fields, the manifest parse, and `vm.c`. A
  seam is therefore cheap, and the PicoCalc screenshots can guard the refactor.
- mquickjs is strict ES5 with no Promise. The promise machinery has to live in the prelude, with C
  passing promise ids (decision 7.3).

### Prompt Context

**User prompt (verbatim):** "Create a new docmgr ticket to port this OS to the m5 s3paper and use microquickjs probably ? see @~/code/wesen/go-go-golems/esp32-s3-m5/ and previous project and all that. Adapt UI to the paper stuff (see for example pulp os which is an earlier iteration). 

Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable.


Then, implement, comcommit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill).

Device is attached. There might be an issue with flashing where it disappears from usb and all that, in that case, try to do your best without the device and then wait fro me to come back from running errands"

Follow-up (verbatim, mid-step): "commit and push. publish the design guide as artifact as well, besides md and remarkable, so I can track your progress, and update it as you get further into the project."

Follow-up (verbatim): "see you later!"

**Assistant interpretation:** Create ticket PAPERS3-PORT. Write an intern-level design guide, upload
it to reMarkable and publish it as an artifact that is kept up to date. Then implement the port
(mquickjs engine, paper UI after PULP OS) with commits and an investigation-mode diary. Work without
the device if it is unreachable.

**Inferred user intent:** The same OS on a second, very different board, with the documentation and
evidence trail the P4 port had. The user wants to follow progress remotely while away.

### What I did

- Confirmed the baseline: `make -j8 && make shots` in `picocalc-os/` left `git status` clean, so
  every `out/*.png` is byte-identical.
- Device check:
  - `lsusb` shows `303a:1001 Espressif USB JTAG/serial debug unit` (serial `D0:CF:13:16:17:DC`,
    the PaperS3 per 0114's README).
  - There is no `/dev/ttyACM*` and no `/dev/serial/by-id/`. `lsmod` shows `cdc_ether` but not
    `cdc_acm`; the module exists (`/lib/modules/6.8.0-147-generic/kernel/drivers/usb/class/cdc-acm.ko.zst`).
  - `sudo -n modprobe cdc_acm` failed with `sudo: a password is required`.
  - `/dev/bus/usb/003/006` is `crw-rw-r-- root root`, so OpenOCD or pyusb cannot open it either.
  - The device is blocked until the user is back (task bzw6).
- `git remote -v` printed nothing. The repository has **no remote**, so "push" cannot be done; commits
  are local.
- Built mquickjs on the host from `esp32-s3-m5/imports/esp32-mqjs-repl/mqjs-repl/components/mquickjs`
  (scratch dir): `gcc mqjs_stdlib.c mquickjs_build.c` → `./stdlib_gen > mqjs_stdlib.h`,
  `./stdlib_gen -a > mquickjs_atom.h`, then `mqjs`. Probed 60 language features (table in guide §3.4).
- Read 0114's `components/s3paper_m5/src/m5_backend.cpp` (M5GFX transaction: wait busy → setEpdMode →
  startWrite → pushImage rows → endWrite → wait busy) and ESP-55's `04-papers3-console-hold.py` (the
  reset sequence that avoids download mode).
- Created the ticket, vocabulary topics (`papers3`, `esp32-s3`, `mquickjs`, `epaper`), the guide, this
  diary and the tasks.
- Delivery:
  - `remarquee upload bundle … --remote-dir /ai/2026/10/26/PAPERS3-PORT` →
    `OK: uploaded PAPERS3-PORT picocalc-os on PaperS3 guide.pdf -> /ai/2026/10/26/PAPERS3-PORT`.
  - Artifact: `scripts/01-render-guide-artifact.py various/guide-artifact.html` (pandoc plus a shell
    with a phase-progress strip parsed from §15), published at
    https://claude.ai/artifact/XAQDfRBhT24JDpy1s24rLv.

### Why

- mquickjs over QuickJS (decision 7.2). Arenas are exact heap limits and contexts are created in
  0.6 ms. PULP proved the engine on this board. The UI is new code regardless, so the ES5 cost falls
  mostly on new code.
- One nucleus with seams (7.1), because the PicoCalc screenshots are a byte-exact oracle and a fork
  would let fixes diverge.
- Refresh policy in the JS display driver (7.5), because "drivers are JavaScript" is the OS's thesis
  and the display driver sees every update.

### What worked

- The host mquickjs build and the probe loop. Every claim in the dialect table is from an actual run.

### What didn't work

- `sudo -n modprobe cdc_acm`: `sudo: a password is required`.
- The first stdlib generator run printed `Too many properties, consider increasing ATOM_ALIGN` three
  times (64-bit host build of the stock stdlib). The resulting `mqjs` worked; I will revisit this when
  generating the papers3 stdlib.
- A broad `find / -name mquickjs` and the Terminus font search timed out at 120 s and went to the
  background. Terminus is not installed now (`/usr/share/fonts/X11/misc` has no `ter-*`, and there is
  no `pcf2bdf`), which is one reason the paper fonts come from TTFs.

### What I learned

- mquickjs details that shape the design:
  - JSON ignores both the replacer and the reviver, so handle markers must be walked by hand.
  - `e.stack` is `""`.
  - `new Date(...)` throws `only Date.now() is supported`.
  - Object-literal getters parse but do nothing (PULP's margin bug).
  - Array holes throw on write.
  - Assigning an undeclared global throws.
- C functions are bound at stdlib-generation time (a host tool). They are not added at runtime as
  QuickJS's `JS_NewCFunction` allows, so the nucleus's two host functions must be in the generated
  table.
- `JS_SetInterruptHandler` is per context and polled every `JS_INTERRUPT_COUNTER_INIT` (10000)
  back-edges or calls, the same scheme as QuickJS. The QuickJS patches (counter 1000, getters) carry
  over.
- The PaperS3 console has two traps: download-mode latching on open, and lost output with no reader
  (guide §3.3).

### What was tricky to build

- Nothing built yet. The subtle analysis point was the promise model without Promise. Keeping the
  callbacks in a JS-side table keyed by kernel promise ids means C never holds a JS value across the
  moving GC. A crashed world's callbacks then vanish with its arena, matching how `vm_dispose` drops
  pending promises today.

### What warrants a second pair of eyes

- Decision 7.2's cost. Every existing JS file is ES2020 and none can be reused verbatim on the
  PaperS3.
- The EPD timings in the simulator are placeholders (guide §6.10) until the device measures them.

### What should be done in the future

- Load `cdc_acm` (user), then phase 4 on the device.

### Code review instructions

- Read the guide's §6 and §7. No code yet.

### Technical details

- mquickjs vendored copy: `esp32-s3-m5/imports/esp32-mqjs-repl/mqjs-repl/components/mquickjs` (upstream
  `bellard/mquickjs` at about `84d793e0`).
- PaperS3 serial id: `usb-Espressif_USB_JTAG_serial_debug_unit_D0:CF:13:16:17:DC-if00`.
