---
Title: Diary
Ticket: PICOCALC-FRAMES
Status: active
Topics:
    - picocalc
    - ui
    - os
DocType: log
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/kernel.c
      Note: retained posts and replay
    - Path: repo://picocalc-os/tests/test_sys_native.py
      Note: the tests
ExternalSources: []
Summary: Chronological record of diagnosing and fixing apps that stay blank after the compositor restarts.
LastUpdated: 2026-11-01T16:13:43.999733092-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Goal

Make every world that listens on a channel get the current state when it (re)starts, so that a restarted
compositor shows the apps and the battery level again instead of "starting calc…" and an empty battery glyph.

## Step 1: Diagnosis on the device, reproduction on the host, and the design

The user reported that opening Logs restarted the compositor and that Calc and Files took very long to start or
seemed to hang without ever being stopped. I captured the device's console while opening Logs and Calc, took a
screenshot, and found two separate problems: JavaScript running 2.8× slower than usual (filed as PICOCALC-SPEED),
which made the compositor overrun its budget and restart, and this one: after the compositor restarts, an app that
does not change its screen never sends its frame again, so the compositor shows its placeholder forever. The host
binary reproduces the second problem in every run with no slowdown needed.

I created this ticket, wrote the intern guide (design-doc/01), chose retained channel messages over three
alternatives, and uploaded the guide to the reMarkable.

### Prompt Context

**User prompt (verbatim):** "also it looks like the compositor restarts if i open logs, calc takes a shit ton of
time to start (right now) / seems to hang (but also doesn't exit if taking too long). same with files, i'm not sure
what is going on ..."

and, after my diagnosis:

**User prompt (verbatim):** "ok, make a ticket for 1. Create  a detailed analysis / design / implementation guide
that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose
paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very
clear and technical. Store in the ticket and the nupload to remarkable.

Also create a ticket for 2. Make a design doc too.

Then implement, commit at appropriate intervals and keep a detailed diary as you work (using the diary format from
the skill). Diary format is MANDATORY"

**Assistant interpretation:** "1" is my proposed fix for the lost frames (this ticket); "2" is the speed problem
(PICOCALC-SPEED, whose first task is to put the device back on fast firmware). Write a guide for this ticket and a
design doc for the other, upload them, then implement both with commits and an investigation-format diary.

**Inferred user intent:** The device should behave again (no blank apps, no compositor restarts), with the
reasoning written down so a newcomer can follow and review it.

### What I did

- Device (ELF test firmware, 2 h 10 min uptime): `tools/p4cap.py --no-reset` with `worlds`, `heap`, `stats`; then
  `bench`, `trace on`, `key f1`, `type l`, `key f1`, `type x`, `trace off`, `stats`; then `shot`.
- Host: `make` in `picocalc-os/` (nothing to rebuild), then the repro script below against the real `js/` tree.
- Read `nucleus/kernel.c` (`kernel_publish`, `run_segment`, `teardown`, `crash_at`, `handle_event`, `boot_world`),
  `js/system/compositor.js` (`frames`, `power`, `worlds.status` handlers, `paint`), `js/prelude.js` (`publish`,
  builder, `__render`), `js/drivers/power.js`, `nucleus/vm.c` (`op_publish`), `nucleus/vm_mqjs.c`
  (`op_sys_front`), `nucleus/native.c` (`NW_PUBLISH`), the test harness (`tests/test_fs_native.py` `Scenario`,
  `host/main_host.c` script commands).
- `docmgr ticket create-ticket --ticket PICOCALC-FRAMES ...`, `docmgr doc add` for the guide and this diary; six
  tasks.
- `remarquee upload bundle ... --name "PICOCALC-FRAMES Retained Channel Messages Guide" --remote-dir
  "/ai/2026/11/01/PICOCALC-FRAMES"`.

### Why

- Retained messages (design D in the guide) fix every state channel at once, keep the decision with the publisher,
  and cost no new memory for frames because the kernel already keeps `W->frame`. Clearing every frame when the
  compositor starts (A) leaves apps blank until they take a turn and does nothing for the battery; a redraw request
  (B) needs A anyway; persisting the compositor's copy (C) writes kilobytes to flash on every change.

### What worked

- The device trace shows the chain:

  ```
  [7808518.438] compositor <- open from launcher {"app":"logs"}
  [7808616.068] compositor crashed handling draw: ran past its turn budget of 80 ms
  [7809695.013] logs crashed handling every 500 ms: ran past its turn budget of 50 ms
  [7815058.246] compositor <- open from launcher {"app":"calc"}
  [7815128.148] calc <- focus from compositor
  ```

  and then no `compositor <- frames from calc` for the remaining 8 s of the capture. `stats`: calc 3 turns before
  and 4 after, idle, no error; files 3 turns. The screenshot: status bar "calc" (lowercase: the world's name, used
  when the compositor has no frame and so no title), empty battery glyph, clock "--:--" (no network time, unrelated),
  "starting calc…" in the middle.
- Host repro (`build/picocalc-host -j js -o out -f fs script.txt`):

  ```
  wait 1500 / key x / wait 800 / capture 01-calc-before.png / key f1 / wait 400 / crash compositor /
  wait 1500 / key x / wait 1500 / capture 02-calc-after-compositor-restart.png
  ```

  `02-calc-after-compositor-restart.png` is the device's screen again: "starting calc…" and an empty battery
  glyph. Deterministic, so the fix can be tested on the host.

### What didn't work

- My first answer about native UI said a native world could not reach the screen. A direct `send` of type `frames`
  to the compositor is accepted (it only checks `f.app === msg.from`), so that was wrong for message passing; I
  corrected it in the conversation. It does not change this ticket.

### What I learned

- `kernel_publish()` delivers a channel post as an ordinary `M_ON` message whose type is the channel name, so a
  handler cannot tell a post from a `send`.
- `K.front` is set only by the PaperS3's `sys.front` (`vm_mqjs.c`); on the PicoCalc every world with a screen
  renders after each turn and the dedup in `run_segment()` is the only thing that stops repeated frames.
- The channel inventory: `keys`, `worlds.status`, `touch`, `gestures`, `activity` are events; `frames`, `power`,
  `time` are state. Only the publisher knows which.

### What was tricky to build

- Nothing was built in this step. The subtle point of the design is ordering: the replay must be queued during the
  booting world's segment (before `K.cur = NULL`) so it joins the deferred effects, lands after the `start`
  message that `boot_world()` put at the head of the mailbox, and is discarded with everything else if the boot
  segment crashes.

### What warrants a second pair of eyes

- Retaining is opt-in per post. A publisher that mixes state and events on one channel cannot retain only the state;
  none does today.

### What should be done in the future

- Native worlds have no screen yet; when `nw_frame` exists, it should store into `W->frame` so retention applies.

### Code review instructions

- Read the guide, sections 5 to 9. Reproduce with the script above before and after the change.

### Technical details

- Evidence in this ticket: `various/01-device-open-logs-calc-trace.log` (the traced capture),
  `various/02-device-calc-after-compositor-restart.png` (the device screenshot),
  `various/03-host-calc-before.png` and `various/03-host-calc-after-compositor-restart.png` (the host repro),
  `scripts/01-repro-compositor-restart.txt` (the repro script). The ELF firmware's boot and benchmark captures
  are in PICOCALC-SPEED's `various/`.

## Step 2: Retained posts in the kernel, the APIs, the tests, and the device

I implemented the design of the guide: the kernel keeps a world's retained posts (and its frame, which it already
kept) and replays them to a world when it starts, for each channel it needs. The JavaScript `publish` takes
`{ retain: true }`, native worlds get `nw_publish_retained`, and the power drivers and the PaperS3 clock retain
their posts. The host repro now produces a capture after the compositor restart that is byte-identical to the one
before it, every host suite passes, and on the device a compositor killed from the console comes back with Calc, its
title and the battery level.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Implement the retained-post design, test it on the host and the device, commit.
**Inferred user intent:** No more blank apps after a compositor restart.
**Commit (code):** 0da00ca — "picocalc-os: retained channel posts, so a restarted compositor gets every frame and the
battery level back (PICOCALC-FRAMES)"

### What I did

- `nucleus/nucleus.h`: `RETAIN_MAX 4096`; in `world_t`, `char *retained[MAX_LIST]` (indexed like `provides[]`) and
  `retained_bytes`; `kernel_retain()` declared.
- `nucleus/kernel.c`: `provided()`, `kernel_retain()`, `drop_retained()`, `frame_message()` (now also used by the
  live frame post in `run_segment()`), `replay_retained()`; hooks in `run_segment()` (after a successful boot, next
  to `start_timers()`, before `K.cur = NULL`), `teardown()` and `kernel_reset()`.
- `nucleus/vm.c` and `nucleus/vm_mqjs.c` `op_publish`: a fourth argument `retain`; "a retained post cannot carry
  handles"; `kernel_retain()` before `kernel_publish()`.
- `nucleus/native.c` `NW_PUBLISH`: bit 0 of `c->i[0]` means retain. `sdk/nw_calls.inc`, `sdk/nw.h`:
  `nw_publish_retained()` (the same call with `a = 1`, so modules built before keep working).
- `js/prelude.js`, `js-papers3/prelude.js`: `publish(ch, payload, opts)`.
- `js/drivers/power.js` (both posts), `js-papers3/drivers/power.js`, `js-papers3/drivers/clock.js`: `{ retain: true }`.
- `natives/echo.c`: a `retain` message. Tests: `RetainTests` (five cases) and `CompositorRestartTests` in
  `tests/test_sys_native.py`; `test_a_retained_post_reaches_a_listener_that_starts_later` in
  `tests/test_native_worlds.py` (process and WebAssembly).
- README: the world API and the screen section.
- Device: `idf.py -B build-agent ... build`, `tools/p4cap.py --no-reset -s 1 -c "0.2 hold"`, `idf.py ... -p
  /dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00 flash`; then a capture with a reset: `bench` at 20 s
  and 60 s, `crash compositor` at 64 s, `key f1`, `type x`, `shot`, `stats`; then a second capture switching between
  Logs, Calc and Files with shots and `stats`.

### Why

- Replay is queued during the booting world's segment so it is part of that segment's deferred effects (section 9.6
  of the guide); placing it after `start_timers()` in the success branch means a failed start replays nothing.
- `retained[]` is indexed by the channel's position in `provides[]`: no search structure, no copies of names, and a
  world can only post on channels it provides.

### What worked

- Host repro: `cmp 01-calc-before.png 02-calc-after-compositor-restart.png` → identical (before the change the
  second showed "starting calc…").
- `python3 -m unittest tests.test_sys_native.RetainTests tests.test_sys_native.CompositorRestartTests -v`: 6 OK.
- Suites: test-native 27 OK (25 before, plus the retain case for both engines), test-sys 17 + 6 OK, test-fs 9 OK,
  test-clock 4 OK, test-agent 23 OK (7 skipped) plus the Node suites, test-apps 12 pass.
- `make shots`: seven PicoCalc captures changed, all in counters only (compared crops: compositor heap 370 → 366 KB,
  agent 314 → 311 KB, all worlds 5502 → 5499 KB, a REPL timestamp 16035.549 → 16035.55). The prelude grew by a few
  steps and bytes. `make BOARD=papers3` and its shots: no change.
- Device, agent firmware (no ELF modules):

  ```
  [ 61840.819] compositor crashed: killed from the console
  compositor  service  idle  196  614.21  334.2  768  1  killed from the console
  calc        app      idle    2  324.83  634.1 1024  0
  ```

  and the screenshot: "Calc" with its history, battery "100%". Calc took 2 turns (start, focus) and its render on
  focus equals its kept frame, so the frame on screen can only have come from the replay. Switching Logs → Calc →
  Files → Logs → Calc: no crash, no `ran past`, each app on screen.

### What didn't work

- My first frames test expected an `n=0` frame from an app without `onStart`:

  ```
  AssertionError: 0 != 1 : ... [   500.050] app: TEST app turn
  [   500.128] viewer: TEST frame app The App n=1 from app
  [   800.000] viewer crashed: killed from the host
  [   900.131] viewer: TEST frame app The App n=1 from app
  ```

  A world without `onStart` takes no start turn, and the kernel renders only after turns (`!booting`), so it shows
  nothing until its first message. The replay itself was right (n=1 twice, one app turn). I gave the test app an
  empty `onStart`.

### What I learned

- An app with a screen but no start handler has no frame until it gets a message. All system apps have timers or
  `onStart`, so this does not show on the device, but it is worth knowing when writing an app.
- On this firmware image the boot calibration is the pathological 1600 ms loop while the system later runs at
  118 ms; recorded in PICOCALC-SPEED.

### What was tricky to build

- Ordering against the start message. `boot_world()` puts `start` at the head of the mailbox with the boot time; the
  replayed posts are `E_DELIVER` events applied at `K.lane_free`, after it. The compositor therefore allocates its
  framebuffer and attaches the display before it handles the replayed frames, and a live frame published later still
  overwrites the replayed one because it arrives later.
- `kernel_retain()` runs before `kernel_publish()` in the bindings, so a post that is too big is refused as a whole
  (nothing delivered, nothing kept) instead of delivered but not kept.

### What warrants a second pair of eyes

- `replay_retained()` builds a frame post for every world with a frame (20 on the PicoCalc), a few kilobytes each,
  all delivered to the restarting compositor at once. Its mailbox peak on the device was 22 before this change; the
  compositor handles each in a short turn.
- The 4096-byte bound is per world and counts only retained posts; frames are bounded by what the kernel already
  kept.

### What should be done in the future

- Native frames (`nw_frame`) should store into `W->frame` so they are retained like JavaScript frames.

### Code review instructions

- `git show 0da00ca -- picocalc-os/nucleus/kernel.c` first, then `vm.c`, `native.c`, the tests.
- `cd picocalc-os && make && PICOCALC_TEST_BINARY=build/picocalc-host python3 -m unittest
  tests.test_sys_native.RetainTests tests.test_sys_native.CompositorRestartTests -v`
- The repro: `./build/picocalc-host -j js -o out -f fs ../ttmp/2026/11/01/PICOCALC-FRAMES*/scripts/01-repro-compositor-restart.txt`.

### Technical details

- Device evidence: `various/04-device-agent-firmware-compositor-crash.log`,
  `various/05-device-calc-after-compositor-crash-fixed.png`, `various/06-device-switching-logs-calc-files.log`,
  `various/07-device-{logs,calc,files}.png`.
- Contract: `publish(ch, payload, { retain: true })` throws "a retained post cannot carry handles" or "a world's
  retained posts are at most 4096 bytes"; `nw_publish_retained()` returns -1 with the same reasons through
  `nw_error()`.
