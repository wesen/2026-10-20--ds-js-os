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

## Step 4: The PaperS3's worlds: drivers, refresh planner, paper compositor, apps (phases 2–3)

This step wrote the whole `js-papers3` tree in ES5 and made it work against the simulated board. That is
14 worlds:

- drivers: touch (GT911), clock (BM8563), power (ADC and charge pin), display (the refresh planner);
- system: compositor, sandbox, flaky;
- apps: launcher, system, repl, faults, touches, sketch, about.

Scripted tours in `scripts-papers3/` produce 22 captures in `out-papers3/`. Two consecutive runs are
byte-identical, and the SAN build matches pixel for pixel with no reports. Looking at the captures
found five real problems, all fixed before the commit: placeholder ghosts, a missing glyph, misleading
memory figures, a caught OOM that did not count, and a panel backlog. Commit `7f96c33`.

### Prompt Context

**User prompt (verbatim):** see Step 1 ("Adapt UI to the paper stuff (see for example pulp os which is an earlier iteration)").
**Assistant interpretation:** A touch-first, paper-style UI for the same OS, after PULP OS's design language.
**Inferred user intent:** The OS should feel native on an e-paper tablet, not like a ported calculator screen.
**Commit (code):** 7f96c33 — "picocalc-os: the PaperS3's worlds: touch, clock, power and display drivers, paper compositor, apps"

### What I did

- Drivers, each a world talking to its chip register by register:
  - `touch.js`: GT911 status, points, buffer handback, down/move/up publication.
  - `clock.js`: BM8563 BCD → epoch via the civil-days algorithm, then `sys.setClock`.
  - `power.js`: LiPo curve.
  - `display.js`: the planner; page, text, quick and ink intents; clean full after 32 partials, 16
    screens of area or 15 minutes.
- `compositor.js`:
  - Layout and drawing for 540×960, with text through `gfx.measure`/`gfx.wrap`.
  - Hit regions recorded while drawing. Gestures (tap < 300 ms and < 16 px, hold ≥ 600 ms, swipe
    ≥ 64 px with an off-axis ratio under ½).
  - Ink drags forwarded live.
  - Chrome: title in Liberation Sans Bold, a 4 px rule, Home/Back chips, hints. Crash banners in
    white-on-black.
  - New nodes: `button`, `tabs`, `keyboard`, `ink`.
- Apps:
  - System has tabs (Worlds, Handles, Buses, Display) and swipe paging.
  - The REPL has an on-screen QWERTY keyboard (lower, upper, two symbol layers).
  - Faults has four ways to break a world plus restart-from-the-list.
  - Touches draws a scaled trail. Sketch draws strokes with the fastest waveform and has a Clean button.
- The host runner gained `send WORLD TYPE JSON` (used for REPL text). `tools/contact_sheet.py` reviews
  many captures at once.

### Why

- Points from the driver, gestures in the compositor. The compositor is the only world that knows the
  hit regions, and the raw-points path stays inspectable (the Touches app), as the PicoCalc's Keys app
  did for keys.
- One waveform pass per present, over the union of the damage (see below).

### What worked

- First boot of all 14 worlds: no crash, 2.7% lane load.
- Final tour stats (16.3 s virtual):
  - the panel busy 6.3 s, 4 quality and 15 text updates, 782 ghosted pixels;
  - the faults run produced exactly 4 crashes (flaky throws, the sandbox loops, the sandbox runs out
    of memory, the display is killed), each with a banner and a restart.
- Determinism: `md5sum out-papers3/*.png` was the same across two `make BOARD=papers3 shots` runs. The
  SAN build over all four scripts: 0 reports, every PNG identical.

### What didn't work

Problems the captures showed, and their fixes:

1. **Placeholder ghost.**
   - Seen: a faint "starting repl…" under the REPL, and "PaperS3" behind its title. A world without
     `onStart` publishes no frame until its first message, so the clean "page" refresh showed the
     placeholder and the real frame came as a ghosting partial.
   - Fix: `focus()` holds the page refresh until the app's frame arrives, for at most 500 ms
     (`waitFrame`).
2. **Missing glyph.** `›` was not in the font set and rendered as `?`. Added `›‹` to `EXTRA`.
3. **Memory figures.**
   - Seen: "touches 94/96 KB" with nothing to do. mquickjs collects only when the arena fills, so
     `heap_free − heap_base` is mostly garbage.
   - Fix: patched the engine to record the live size after each compaction (`gc_live`, `gc_count`).
     The binding reports that and collects once after boot. Baseline worlds are now about 30 KB,
     the compositor 62–80 KB.
4. **Caught OOM.**
   - Seen: "Exhaust the sandbox's arena" did not crash the sandbox. mquickjs's out-of-memory error is
     catchable, and the sandbox wraps eval in try/catch. On QuickJS the allocator flags OOM regardless.
   - Fix: patched `JS_ThrowOutOfMemory` to count (`JS_GetOutOfMemoryCount`). The binding marks the
     world OOM when the count moved. The sandbox then crashed with
     `ran out of memory (its limit is 128 KB)`.
5. **Panel backlog.**
   - Seen: tab taps took effect one or two screens late. The planner sent each damaged rectangle as its
     own update, and the worlds table changes in about five places a second at 300 ms each.
   - Fix: one update per present, the union widened to 8 px. The tour's panel busy time went from
     13.8 s to 6.3 s.
6. **Tab-switch ghosts.** Fixed with a `page` token on a frame's root: a change of token gets a
   clean refresh.
7. **The 100k-loop demo** ran past the sandbox's 200 ms budget: the papers3 estimate is 250 ms
   (`loop_ms`). The sandbox budget is now 400 ms.
8. **Scripting.** A Faults tap landed on the crash banner left by the previous button and dismissed it
   (correct behaviour); the script now waits for the banner to expire.

### What I learned

- On e-paper the cost model is per update, not per pixel. That inverts the PicoCalc's dirty-rectangle
  instinct of sending as little as possible.
- The ghost model makes the simulator honest about e-paper habits that a fast LCD forgives: presenting
  a placeholder, partial tab switches. Those show up in host captures before the device is involved.

### What was tricky to build

- The on-screen keyboard's hit regions. Rows of different key widths (shift, backspace, space,
  return) are centred, and every key records a region with a structured arg (`{ch}` or `{key}`), so
  the REPL's handler never deals in coordinates.
- Ink forwarding. A drag starting inside the ink node's last drawn rectangle (`inkArea`) is streamed
  to the app with clamped local coordinates, and never becomes a tap or swipe.

### What warrants a second pair of eyes

- `fast` mode thresholds at 128. The muted gray (#555) becomes black, and faint/line grays (#999,
  #bbb) disappear. The "quick" intent is only used for the clock and battery, which are black.
- The compositor's arena (448 KB) is far above its measured live size (80 KB). Transient memory during
  paint is unmeasured, so it was left generous until the device measures.

### What should be done in the future

- Phase 4/5 on the device: the touch orientation (`MAP` in `touch.js`), real waveform timings, and
  arena and budget tuning.

### Code review instructions

- Read `js-papers3/system/compositor.js` (`paint`, `gesture`, `tap`, `focus`) and
  `js-papers3/drivers/display.js` (`present`).
- Validate: `make BOARD=papers3 shots` reproduces the committed `out-papers3/*.png` byte for byte, and
  `out-papers3/contact-sheet.png` shows them all.

### Technical details

- Tap coordinates used by the scripts:
  - tiles: System (111,276), REPL (269,276), Sketch (427,276), Faults (111,442), Touches (269,442),
    About (427,442);
  - chips: Home (105,908), Back (251,908);
  - REPL return key (428,808).
- Live arena use at the end of the tour: drivers 31–36 KB, compositor 74 KB, system 50 KB.

## Step 5: The ESP32-S3 firmware (phase 4): builds, device still unreachable

This step wrote `port/esp32s3-papers3`, the ESP-IDF project that runs the same nucleus and the same
`js-papers3` tree on the PaperS3, and `tools/s3cap.py` to talk to it. It builds with IDF 5.3.4 after one
API rename: 1.6 MB of firmware, 74% of the 6 MB app partition free. It has not run yet. The board
enumerates on USB (`303a:1001`), but this host has no `cdc_acm` driver loaded, so there is no
`/dev/ttyACM0`, and loading it needs sudo. Commit `78bba9a`.

### Prompt Context

**User prompt (verbatim):** see Step 1 ("Device is attached. There might be an issue with flashing where it disappears from usb and all that, in that case, try to do your best without the device and then wait fro me to come back from running errands").
**Assistant interpretation:** Get the firmware as far as possible without the device and leave a precise list of what flashing needs.
**Inferred user intent:** Come back to firmware that is ready to flash, plus one command to unblock it.
**Commit (code):** 78bba9a — "picocalc-os: ESP32-S3 port for the M5Stack PaperS3 (builds; not yet run on the device)"

### What I did

- `main/CMakeLists.txt`:
  - compiles the nucleus with `vm_mqjs.c`, `BOARD_PAPERS3`, `NUCLEUS_GRAY8` and `font_paper.h`;
  - generates mquickjs's ROM stdlib on the host;
  - bundles `js-papers3` with the P4 port's `bundle_js.cmake`.
- `port_s3.c`: PSRAM arenas (`heap_caps_malloc(..., MALLOC_CAP_SPIRAM)`), the battery ADC (oneshot,
  channel 2 on GPIO3, curve-fit calibration, ×2 divider), gpio reads.
- `bus_s3.cpp`, one FreeRTOS worker per bus. Results queue back to the kernel task (`s3_kq`), which
  settles the promise.
  - `i2c1` uses M5GFX's `lgfx::i2c` (port 1, SDA 41, SCL 42), so M5GFX and the OS do not fight over
    ESP-IDF's old and new I2C drivers.
  - `epd0` is an `LGFX_Device` with `Bus_EPD` + `Panel_EPD`, configured as M5GFX configures the PaperS3:
    data pins 6, 14, 7, 12, 9, 11, 8, 10; pwr 46; spv 17; ckv 18; sph 13; oe 45; le 15; cl 16;
    960×540 memory, `offset_rotation` 3. There is no touch driver and no autodetect. The rotation is
    picked at runtime so that `width() == 540`.
  - The worker does: wait idle → `setEpdMode` → `pushImage` the rectangle's gray rows from the pinned
    front buffer → `display(x,y,w,h)` → wait idle. It reports `{ms}`, as the simulator does.
- `main_s3.c`:
  - The kernel task is pinned to core 1 with a 32 KB stack. Boot logs the chip, PSRAM and heap.
  - The console runs on USB Serial/JTAG, with these commands: `stats`, `worlds`, `handles`, `heap`,
    `tap X Y`, `hold X Y MS`, `swipe ...` (injected on the `touch` topic, as the simulator does),
    `send`, `clean`, `crash`, `restart`, `shot`, `bench`, `trace`, `help`.
  - `shot` prints `#SHOT 540 960 g8`, base64 3-byte RLE records (count lo, count hi, gray), and
    `#END crc32 runs`.
- `sdkconfig.defaults`: S3, 16 MB flash, octal PSRAM at 80 MHz, console on USB Serial/JTAG, 1 kHz tick,
  -O2, idle-task WDT off on core 1 (the kernel task can be busy for a whole turn).
- `tools/s3cap.py`:
  - opens the port once, then resets into the app through the held descriptor (RTS pulse with DTR
    low);
  - reopens the port if it re-enumerates;
  - sends timed `-c "SECONDS CMD"` lines and decodes `#SHOT` blocks to PNG with a CRC check.

### Why

- M5GFX for the panel (decision 7.7): the ED047TC1's waveform tables and the parallel bus timing are
  the hard part of this board, and M5GFX already gets them right on this exact board.
- M5GFX's I2C for the I2C bus: one implementation on the wire. IDF 5.3 refuses to link the legacy and
  the new `i2c_master` driver together.
- The stdlib generator is built for the host and asked for 32-bit tables (`-m32` is the generator's
  own flag, not gcc's), so the build needs no 32-bit libc on the host.

### What worked

- `idf.py set-target esp32s3 && idf.py build` with IDF 5.3.4 after the fix below:
  `picocalc-os-papers3.bin binary size 0x18d410 bytes. Smallest app partition is 0x600000 bytes. 0x472bf0 bytes (74%) free.`
- No compiler warnings in our sources (upstream mquickjs is built with `-w`, as on the host).

### What didn't work

- The first build failed in `main_s3.c`:
  `error: implicit declaration of function 'esp_vfs_usb_serial_jtag_use_driver'; did you mean 'esp_vfs_dev_usb_serial_jtag_register'?`
  In 5.3 the call lives in the driver component: `usb_serial_jtag_vfs_use_driver()` from
  `driver/usb_serial_jtag_vfs.h`. The old name survives only as a deprecated declaration in
  `esp_vfs_dev.h`.
- Device access (unchanged since Step 2):
  - `ls /dev/ttyACM*` matches nothing;
  - `lsmod` shows `cdc_ether` but no `cdc_acm`;
  - `sudo -n modprobe cdc_acm` asks for a password;
  - `/dev/bus/usb/003/006` is `root:root 0664`, so esptool's USB-JTAG path and OpenOCD cannot open
    it either.
- Nothing is flashed.

### What I learned

- In IDF 5.3, the USB Serial/JTAG VFS and driver calls moved to `esp_driver_usb_serial_jtag` with new
  names. The PRIV_REQUIRES name `esp_driver_usb_serial_jtag` is valid in 5.3.

### What was tricky to build

- Keeping the framebuffer valid during a slow update. A world can release its framebuffer handle while
  a 300 ms waveform pass still reads it. `bus_run_epd` takes a reference on the buffer (`b->refs++`),
  and the kernel task drops it when the worker's result arrives (`dmabuf_unref` in `bus_s3_done`), so
  the pixels outlive every handle.

### What warrants a second pair of eyes

- `pushImage(..., (const lgfx::grayscale_t *)...)` assumes M5GFX reads our 8-bit gray (0 black … 255
  white) as its `grayscale_t`. If the panel shows inverted or banded grays, this is the first place to
  look.
- The rotation loop picks the first rotation with `width() == 540`. That is either portrait or
  upside-down portrait. The touch `MAP` in `touch.js` must agree; the Touches app will show it.
- The I2C worker uses `vTaskDelay` for the gap between a write and a read (GT911 needs none). With a
  1 kHz tick that is at least 1 ms.

### What should be done in the future

- Once `cdc_acm` is loaded:
  - `idf.py -p /dev/serial/by-id/usb-Espressif_USB_JTAG_serial_debug_unit_D0:CF:13:16:17:DC-if00 flash`;
  - `python3 tools/s3cap.py -s 30 -c "8 stats" -c "10 shot" --shot-dir out-s3`;
  - check the touch orientation with the Touches app;
  - then phase 5 (timings, arena sizes, `loop_ms`/`mem_scale` calibration from `bench`).

### Code review instructions

- Read `port/esp32s3-papers3/main/bus_s3.cpp` (`epd_worker`, `bus_run_epd`, `bus_s3_done`) and
  `main_s3.c` (`kernel_task`, `console_task`, `cmd_shot`).
- Validate:
  `cd picocalc-os/port/esp32s3-papers3 && . ~/esp/esp-idf-5.3.4/export.sh && idf.py set-target esp32s3 && idf.py build`.

### Technical details

- Unblock the device: `sudo modprobe cdc_acm`. After that the port is
  `/dev/serial/by-id/usb-Espressif_USB_JTAG_serial_debug_unit_D0:CF:13:16:17:DC-if00`.

## Step 6: The firmware in QEMU while the device is unreachable

With the board still unreachable, I ran the firmware itself in Espressif's QEMU (esp_develop 9.0.0, machine
`esp32s3`). It was the closest thing to the device available: the real kernel, binding and mquickjs on a
32-bit Xtensa core with FreeRTOS and a real clock. After two QEMU limits were worked around, the engine's
conformance worlds run clean and behave as on the host.

On the way it found a genuine bug: the binding's temporary contexts used unchecked `malloc`s. It also
found a QEMU-only fault that looked like heap corruption, and it took several experiments to rule that
out as a firmware bug. Commit `d925eb4`.

### Prompt Context

**User prompt (verbatim):** see Step 1 ("try to do your best without the device and then wait fro me to come back").
**Assistant interpretation:** Use the waiting time to catch, before the first flash, the faults that only show on the target.
**Inferred user intent:** The first flash should find hardware problems, not engine or port bugs.
**Commit (code):** d925eb4 — "picocalc-os: run the PaperS3 firmware in QEMU; fix unchecked temporary contexts in the mquickjs binding"

### What I did

- `sdkconfig.qemu` overlay plus an `S3_QEMU` define (`idf.py -B build-qemu -DS3_QEMU=1 ...`):
  - console on UART0;
  - no PSRAM, and no RTC fast memory as heap;
  - comprehensive heap poisoning;
  - panel stub busy for the simulator's durations (450/300/120/60 ms);
  - I2C devices answer zeros, and the battery reads 1950 mV at the ADC;
  - boots `js/test/qemu.json` (the conformance worlds in 36–40 KB arenas) instead of the system;
  - checks heap integrity after every `kernel_run_until` and traces turns.
- `qemu.sh`:
  - builds and merges a 16 MB image;
  - starts QEMU on a Unix socket with `wait=on`, and bridges it to a pty with socat, so `s3cap.py` holds
    the port before boot and no output is lost;
  - forwards `-c "T CMD"` arguments.
- `heap` console command: an integrity check before walking, and the kernel task's stack high-water
  mark.
- `nucleus/vm_mqjs.c`: the temporary contexts (manifest reader, calibration) come from
  `port_heap_malloc` and are checked; the calibration uses 64 KB.

### Why

- `make M32=1` cannot build on this host (no 32-bit libc), so until now nothing had run mquickjs with
  32-bit pointers.
- QEMU also exercises the parts the host replaces: the FreeRTOS tasks and queues, the real-time kernel
  loop (`K.realtime`), the console, and the per-bus workers' result path.

### What worked

- `./qemu.sh 34 -c "28 stats"`: pong's whole conformance sequence runs. In order:
  - `ping replied {pong: 42, asked: 1}`, `sleep order 10,20,30`, `slow replied late by 25`;
  - `no handler`, then `bad rejected: ping crashed: bad on purpose`;
  - `timeout: no reply from mute within 50 ms`, `all [{pong: 2, asked: 1}, undefined, 7]`,
    `seq 30,20,10`;
  - `Date.now true, clock 09:41, engine MicroQuickJS 84d793e0`;
  - `a task failed and nothing handled it`, then `five ticks`.

  Hog overruns its 30 ms turn budget. Supervision stops a world after five crashes in ten seconds.
- `stats` on Xtensa reads ping 30.7 KB, pong 33.4 KB, glut 30.2 KB, mute 30.1 KB. The host's figures
  divided by `mem_scale` 1.7 are 29–33 KB.
- The kernel task's stack had 7108 of 12288 bytes never used, so about 5 KB is in use.
- Host gates after the binding change: PicoCalc `make shots` and PaperS3 `make BOARD=papers3 shots`
  are both byte-identical. The device build (`idf.py build`) still configures octal PSRAM, the USB
  console and the RTC heap.

### What didn't work

1. **Octal PSRAM.** `E (335) octal_psram: PSRAM chip is not connected, or wrong PSRAM line mode`.
   Quad mode with `-m 2M/4M/8M` fails too:
   `E (195) quad_psram: PSRAM ID read error: 0x00000000`. Anything above 4M is refused with
   `RAM size larger than 4 MB not supported`. This QEMU does not model S3 PSRAM, so the QEMU build has
   none.
2. **Calibration crash.** `Guru Meditation Error: Core 1 panic'ed (StoreProhibited)` with
   `JS_NewContext2 (mquickjs.c:3558) ← count_steps (vm_mqjs.c:786) ← vm_calibrate ← kernel_init`.
   `count_steps` did `malloc(256 KB)` without checking it. Internal RAM had no such block, and
   `JS_NewContext` memsets the start of the arena. The manifest reader had the same pattern. Fixed;
   on the device these would have gone to PSRAM through `SPIRAM_USE_MALLOC`, which hid the bug.
3. **The heap walk fault that was not corruption.**
   - Seen: `heap` faulted with `LoadProhibited` in `tlsf_walk_pool ← multi_heap_get_info_impl ←
     heap_caps_get_largest_free_block`, then in `tlsf_check` once integrity checks were on.
     Poisoning reported no bad canary.
   - Checkpoints showed the heap intact through all of `app_main` on core 0, and failing at the first
     check in the kernel task on core 1, before any JS ran.
   - With the kernel task on core 0, the checks stayed clean for the whole run.
   - A peek task printed the same words from both cores. `0x3FCF0000` read the same from both, but
     at `0x600FE000` (RTC fast memory, the last registered heap) core 0 read `3fca0e98 00001e6c ...`
     and core 1 read zeros.
   - The faulting registers held the end of the previous region (A15 = `0x3fcf7ffc`), so the walk
     had moved on to the RTC heap.
   - Conclusion: QEMU models RTC fast memory as core 0 only, as on the original ESP32. The S3's
     cores both reach it. `CONFIG_ESP_SYSTEM_ALLOW_RTC_FAST_MEM_AS_HEAP=n` in `sdkconfig.qemu` only.
4. **Internal RAM is tight.** The conformance manifest's 272 KB of arenas did not fit beside the port.
   The smaller `qemu.json` (36/40/36/36/35 KB) plus a 12 KB kernel stack and a 24-slot result queue
   (QEMU only) let every world run, though not all at once. 34 KB is below the floor: the prelude alone
   does not fit.
5. **Two smaller setup snags.** QEMU's `-serial pty` drops output until a reader opens the pty, which
   lost the boot log; fixed with the socket and socat. A Unix socket path in the scratchpad was 115
   bytes, over the 108 limit; `qemu.sh` uses a fresh `/tmp` directory.
6. **Glut's out-of-memory path did not run.** It only exhausts its arena when `now() < 100` ms, and
   QEMU starts it at about 450 ms. The device's Faults app ("Exhaust the sandbox's arena") covers that
   path.

### What I learned

- A heap fault that poisoning does not flag, and that shows up on one core only, is worth testing for
  memory visibility before hunting a writer. Comparing one word read from each core settled it in one
  run.
- `SPIRAM_USE_MALLOC` can hide missing NULL checks. A big `malloc` that always succeeds on the device
  fails as soon as the same code runs with less memory.
- QEMU's timing is not the chip's: "the 100k loop took 110–129 ms" against a modelled 250 ms says
  nothing about the S3. `loop_ms` calibration needs the device.

### What was tricky to build

- Getting all the output. QEMU must not start before someone reads its serial port, and the reader
  must hold the port for the whole run without modem ioctls. The `wait=on` socket, the socat pty and
  `s3cap.py --no-reset` give that in one script.

### What warrants a second pair of eyes

- `S3_QEMU` blocks in the port. Each is small and commented, but it is a second configuration to keep
  compiling. `qemu.sh` rebuilds it from scratch whenever a defaults file changes.
- The per-step integrity check costs time on every kernel loop. It is compiled only into the QEMU
  variant.

### What should be done in the future

- On the device: the start budget (600 ms) and the turn budgets need the real speed. QEMU's
  "ran past its start budget" crashes are emulation slowness.
- Keep `qemu.sh` in the routine before each flash.

### Code review instructions

- Read `port/esp32s3-papers3/qemu.sh`, `sdkconfig.qemu`, the `S3_QEMU` blocks in `main_s3.c`,
  `bus_s3.cpp` and `port_s3.c`, and `nucleus/vm_mqjs.c` (`vm_read_manifest`, `count_steps`).
- Validate:
  `cd picocalc-os/port/esp32s3-papers3 && . ~/esp/esp-idf-5.3.4/export.sh && ./qemu.sh 34 -c "28 stats"`.
  Expect pong's lines as above, and a `stats` table with ping, pong and glut idle.

### Technical details

- QEMU binary: `~/.espressif/tools/qemu-xtensa/esp_develop_9.0.0_20240606/qemu/bin/qemu-system-xtensa`.
- Heap at `app_main` under QEMU: 331808 bytes free, largest block 270324, in regions `3FCA0720`
  (291 KiB), `3FCE9710` (21 KiB) and `3FCF0000` (32 KiB).

## Step 7: Pushed, and the updated guide delivered (milestone)

The repository had no remote when Step 2 checked (`git remote -v` printed nothing). By now it has one:
`origin git@github.com:wesen/2026-10-20--ds-js-os.git`, which `main` tracks. Following the user's "commit
and push", `main` was pushed: `ea2cb9a..eda77af main -> main`.

- **Validation before the push:**
  - PicoCalc `make shots` and PaperS3 `make BOARD=papers3 shots`: byte-identical;
  - `make BOARD=papers3 SAN=1 shots`: no reports, captures identical;
  - device `idf.py build` and `./qemu.sh`: clean.
- **Delivered:**
  - guide artifact v5 (https://claude.ai/artifact/XAQDfRBhT24JDpy1s24rLv);
  - reMarkable `OK: uploaded PAPERS3-PORT guide and diary after P4 build.pdf -> /ai/2026/10/26/PAPERS3-PORT`,
    a new name, with the first upload left untouched.
- **Still blocked:** flashing. There is no `/dev/ttyACM*` until `sudo modprobe cdc_acm`.
