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
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of diagnosing and fixing apps that stay blank after the compositor restarts."
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
