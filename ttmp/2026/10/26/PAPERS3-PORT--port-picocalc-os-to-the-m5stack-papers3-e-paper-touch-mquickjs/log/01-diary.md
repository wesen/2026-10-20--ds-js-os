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

## Step 2: The seams: engine, board, pixels (phase 0)

This step made the nucleus able to host a second engine and a second board without changing what the
PicoCalc build does. There were four commits, each gated by `make && make shots` leaving every
`out/*.png` byte-identical:

- `d2bb7f5`, the engine seam: `world_t` holds an opaque `struct vmw *`, and the manifest is parsed by
  the binding.
- `db0a452`, the board seam: buses are named by the port, and script commands, captures and the panel
  report go to the host board.
- `016f9a1`, pixels and fonts: `pixel_t`, plus proportional fonts with advance tables in `gfx.c`.
- A later move put the board name and buses into `sim/board.c`.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement phase 0 of the guide.
**Inferred user intent:** The port should not fork or regress the PicoCalc OS.
**Commit (code):** d2bb7f5, db0a452, 016f9a1 (and the board-fact move inside 4e67f09)

### What I did

- `nucleus/nucleus.h`:
  - Dropped `#include "quickjs.h"`, `pending_t`, and the `rt`/`ctx`/`pend`/`fn_*`/`unhandled` fields.
  - Added `struct vmw *vm`, `manifest_world_t`, `vm_read_manifest`, `vm_engine_name`.
  - Added `pixel_t` (RGB565, or `uint8_t` with `NUCLEUS_GRAY8`), `MAX_BUSES` with `n_buses`, and
    `port_bus_names()`.
  - Added handle types `H_EPD`, `H_ADC`, `H_GPIO`.
- `nucleus/vm.c`: the QuickJS state moved into `struct vmw`. It now parses the manifest; the code moved
  from `kernel.c:kernel_boot`, with an early return on a JSON error.
- `nucleus/kernel.c`: `alive()` and the render check test `W->vm`. `kernel_boot` calls
  `vm_read_manifest` with an `add_world` callback that sets the same defaults (budget 50 ms, 1 MB,
  priority −1) in the same order, so `K.seq` numbering is unchanged.
- `host/main_host.c` is generic now. `key`, `type`, `battery` and `panel` moved to `sim/board.c` behind
  `host/board.h` (`board_init`, `board_command`, `board_capture`, `board_report`).
- `nucleus/gfx.c`:
  - Pixels are `pixel_t`, with gray blending under `NUCLEUS_GRAY8`.
  - `font_def_t` gained `adv` and `pad`. NULL means monospace, so the PicoCalc's initializers are
    unchanged. `tools/gen_font.py` emits the new typedef.
  - New: `gfx_measure`, `gfx_wrap_json`, `gfx_fonts_json`.
- Checked the P4 device build: `idf.py build` in `port/esp32p4` (ESP-IDF 5.4.2) completed with exit
  code 0 after the engine seam.

### Why

- The manifest parse lives in the binding because each engine has its own JSON parser. Writing a
  C JSON parser would be a third.
- Buses are named by the board so that the PicoCalc's System app still lists exactly `i2c0` and
  `spi2`. A fixed enum of all buses would have changed its Buses tab and therefore the PNGs.

### What worked

- The screenshot gate caught nothing because nothing changed. It ran after each commit. The `SAN=1`
  build was byte-identical with no sanitizer reports.

### What didn't work

- `make M32=1`: `/usr/include/stdlib.h:26:10: fatal error: bits/libc-header-start.h: No such file or
  directory`. This machine has no 32-bit libc headers (gcc-multilib is not installed). That is an
  environment gap, not a regression. The M32 gate is deferred.
- My first scripted edit of `main_host.c` failed (`ValueError: substring not found`). The key branch
  starts with `else if`, not `} else if`. I rewrote the file whole instead.
- Text truncation regression, caught in review before running: my first `gfx_text` used `room = -1`
  to mean "do not cut". When `max_w` is narrower than one glyph, room goes negative and the text was
  drawn uncut. The old code drew just the ellipsis in that case. Fixed with an explicit `cut` flag.

### What I learned

- The PicoCalc build's object-file paths changed (`build/qjs/` → `build/eng/`); that is harmless, it
  just rebuilds.

### What was tricky to build

- Keeping monospace `gfx_text` exactly equivalent. The old code drew `fit = max_w/cw − 1` characters
  and then an ellipsis. The new code draws while `x + advance ≤ max_w − advance(…)`, which is the same
  count for constant advances. Spaces are skipped as glyph index 0, as before.

### What warrants a second pair of eyes

- `vm_dispose` now frees the pending-promise array, where it used to keep it across restarts. It is
  reallocated on demand. Behaviour is the same and the shots are identical.

### What should be done in the future

- Install gcc-multilib (or use a container) to restore the `M32=1` gate.

### Code review instructions

- `git show d2bb7f5 db0a452 016f9a1`.
- Validate: `cd picocalc-os && make && make shots && git status --short out` should print nothing.
  Also run `make SAN=1`.

### Technical details

- Bus order contract: `port_bus_names()` returns `{"i2c0","spi2"}` on the PicoCalc (host and P4), so
  `BUS_I2C0 = 0` and `BUS_SPI2 = 1` still hold. The PaperS3 returns `{"i2c1","epd0"}`.

## Step 3: MicroQuickJS under the nucleus (phase 1, with the PaperS3 simulator)

This step brought up the second engine and the simulated PaperS3 hardware. Upstream mquickjs at
`84d793e` is vendored in `third_party/mquickjs` with four documented patches.

- `nucleus/vm_mqjs.c` implements the engine interface.
- `js-papers3/prelude.js` implements the world API in ES5, with an 80-line Task.
- `sim/papers3/` models the GT911, the BM8563 and the e-paper glass.

A conformance manifest (`js-papers3/test/`) produced exactly the expected supervision log on the first
run after one link bug. Commit `4e67f09`.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Phase 1 of the guide (and the simulator half of phase 2).
**Inferred user intent:** Worlds that behave the same on the new engine.
**Commit (code):** 4e67f09 — "picocalc-os: MicroQuickJS engine binding, ES5 prelude with Tasks, PaperS3 simulator"

### What I did

- Vendored from `~/code/others/mquickjs` (git `84d793e`).
- Patches, recorded in `third_party/mquickjs/PATCHES`:
  - `JS_INTERRUPT_COUNTER_INIT` 10000 → 1000;
  - `JS_GetContextOpaque`, `JS_GetInterruptCounter`, `JS_GetInterruptCounterInit`, `JS_GetMemoryUsage`;
  - a `CONFIG_NUCLEUS` hook in `mqjs_stdlib.c` that replaces print/console/performance/gc/load/timers
    with `__k` and `__ka`, plus the generator entry `nucleus_stdlib.c`.
- Makefile `BOARD=papers3`:
  - It builds `$(GEN)/stdlib-gen` with the host compiler and writes `mqjs_stdlib.h` and
    `mquickjs_atom.h` into the build directory (with `-m32` when `M32=1`).
  - It compiles with `-DBOARD_PAPERS3 -DNUCLEUS_GRAY8 -DNUCLEUS_FONT_HEADER='"font_paper.h"'`.
- `vm_mqjs.c`:
  - One arena per world (`mem_limit × mem_scale`).
  - Interrupt handler and step counting identical to `vm.c`.
  - The engine log is captured to format errors.
  - `call_global` pushes args last-first, then the function and `this`.
  - Structured results go to JS as JSON (`JS_Parse(…, JS_EVAL_JSON)`).
  - Host ops for i2c on any named bus, epd, adc, gpio, `gfx.measure`/`gfx.wrap`, `clock.set`
    (`sys.clock` claim, feeds `Date.now`) and `err.where`.
- `tools/gen_paper_font.py` writes `nucleus/font_paper.h`:
  - Charis SIL 20/26/26-bold, Liberation Sans Bold 36/64, DejaVu Sans Mono 20/16.
  - 4-bit alpha, per-glyph advances, DejaVu Sans fallback for missing symbols.
  - Cells sized to the set's ink.
- `sim/papers3`: `gt911.c`, `bm8563.c`, `epd.c` (glass, ghosts, per-mode busy times), `bus.c`, and
  `board.c` (tap, hold, swipe, battery, ADC/GPIO).

### Why

- C never holds a JS value (decision 7.3, and the moving GC). Even `handle_info` comes back as JSON.
  It costs a parse, but it removes every `JSGCRef` subtlety from the op table.
- `err.where` exists because `e.stack` is empty in JS while the engine keeps the backtrace internally
  (`JS_PrintValueF(…, JS_DUMP_LONG)` prints it).

### What worked

- Conformance run (`papers3-host -j js-papers3 -m js-papers3/test/system.json -v -t 3000`):

```
[    33.194] hog crashed handling start: ran past its turn budget of 30 virtual ms
[    34.746] glut crashed handling start: ran out of memory (its limit is 48 KB)
[    35.429] pong: ping replied {pong: 42, asked: 1}
[    40.765] pong: sleep order 10,20,30
[    60.891] pong: slow replied late by 25
[    61.121] pong: no handler: ping has no handler for "nothing"
[    66.497] ping crashed handling bad: bad on purpose
[    66.597] pong: bad rejected: ping crashed: bad on purpose
[   116.818] pong: timeout: no reply from mute within 50 ms
[   165.993] glut: glut started again with 0 items
[   167.096] pong: all [{pong: 2, asked: 1}, undefined, 7]
[   173.952] pong: seq 30,20,10
[   173.991] pong: Date.now true, clock 09:41, engine MicroQuickJS 84d793e0
[   174.082] pong: a task failed and nothing handled it: nobody listens
[  1663.682] hog crashed 5 times in ten seconds; it stays stopped
```

- After `err.where`, the messages carry locations: `bad on purpose (test/ping.js:6:79)`.
- `make BOARD=papers3 SAN=1` with the same manifest produced no ASan or UBSan report.
- Calibration counts the same 200,001 steps for the 100k loop as QuickJS does.

### What didn't work

- First run: `timeout: the monitored command dumped core`. gdb showed `op_seed (… W=0x5582f7d0 …)`, a
  pointer truncated to 32 bits. Upstream mquickjs has `JS_SetContextOpaque` but no getter. I added
  one, but `vm_mqjs.o` had been compiled against an implicit `int JS_GetContextOpaque()` (warning:
  `implicit declaration of function ‘JS_GetContextOpaque’`), and the Makefile did not list
  `mquickjs.h` as a dependency, so the object was not rebuilt. Fixed the dependency list.
- The stdlib generator prints `Too many properties, consider increasing ATOM_ALIGN` three times on
  the 64-bit host. It caps a property hash table at `64/JSW` buckets (8 on the host, 16 with `-m32`).
  That is a speed cap, not a correctness problem, and stderr is discarded in the Makefile rule.

### What I learned

- Upstream API details:
  - `JS_Eval` always runs its result, so JSON goes through `JS_Parse` with `JS_EVAL_JSON` directly.
  - The interrupt exception is uncatchable (`current_exception_is_uncatchable = TRUE` at
    `mquickjs.c:5062`), so `try { for(;;); } catch {}` cannot dodge a budget.
- An OOM'd world restarts with a fresh arena: global state (`big`) is gone, as in QuickJS.

### What was tricky to build

- Argument pushing under a moving GC. `call_global` creates each string just before pushing it, so
  every earlier value is already on the engine's stack, which the collector updates. The function is
  looked up after the arguments are pushed.
- `read_list` re-reads the array from the rooted `meta` on every iteration, because converting an
  element could in principle move it.

### What warrants a second pair of eyes

- `mem_scale` 1.7 for 64-bit `JSValue`s is an estimate. The device run must measure it (phase 5).
- `JS_ToCStringLen` returns a pointer into a movable string. Every caller copies it before the next
  allocation; please check that no allocation sits between those two lines.

### What should be done in the future

- Phase 2/3: the paper compositor, drivers and apps.

### Code review instructions

- Start at `nucleus/vm_mqjs.c` (`call_global`, `vm_create`, `js_nucleus_ka`), then
  `js-papers3/prelude.js` (Task, `__settle`, `__dispatch`).
- Validate: `make BOARD=papers3 && ./build-papers3/papers3-host -j js-papers3 -m js-papers3/test/system.json -v -t 3000`.

### Technical details

- mquickjs `JS_Call` usage: `JS_StackCheck(ctx, n+2); push arg[n-1] … arg[0]; push func; push this; JS_Call(ctx, n)`.
- Font cells (w×h, pad): s 31×25, m 41×33, mb 41×33, l 53×45, xl 93×79, mono 15×25, monos 12×21; `font_paper.h` 2.4 MB of C text.
