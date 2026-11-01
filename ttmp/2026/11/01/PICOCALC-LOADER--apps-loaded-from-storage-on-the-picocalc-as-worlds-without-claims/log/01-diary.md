---
Title: Diary
Ticket: PICOCALC-LOADER
Status: active
Topics:
    - picocalc
    - security
    - ui
DocType: log
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/kernel.c
      Note: teardown, kernel_spawn, kernel_stop_world
    - Path: repo://picocalc-os/nucleus/vm.c
      Note: sys.spawn, sys.stop
    - Path: repo://picocalc-os/js/apps/loader.js
      Note: the Loader app
    - Path: repo://picocalc-os/js/system/compositor.js
      Note: open and draw sender checks
    - Path: repo://picocalc-os/js/drivers/power.js
      Note: screen and backlight sender checks
    - Path: repo://picocalc-os/js/drivers/display.js
      Note: attach and flush sender checks
    - Path: repo://picocalc-os/tests/test_loader_native.py
      Note: spawning through the host binary
ExternalSources: []
Summary: 'Chronological record of PICOCALC-LOADER: closing the requests a world without claims could make, sys.spawn and sys.stop, the Loader app, and a hostile app tried on the ESP32-P4.'
LastUpdated: 2026-11-01T01:20:00-04:00
WhatFor: Following how apps from storage came to picocalc-os and why each decision was made.
WhenToUse: When resuming the ticket or reviewing one of its commits.
---

# Diary

## Goal

The last item of the "System and Development" list: an app loader from storage. Apps are files in `apps/` on the
device, run as worlds with no claims.

## Step 1: Research and the guide

A world without claims can still send messages to any world, so the question was which system worlds would do
something harmful for any sender. I listed every `.on(...)` handler in `js/` other than `key`, `focus` and `blur`.
Four had no sender check and mattered: the compositor's `open` (a user app could take the front while someone types
a password into Settings) and `draw`, the power driver's `screen` and `backlight`, and the display driver's
`attach` and `flush`. The agent already accepts requests only from `chat`.

### Prompt Context

**User prompt (verbatim):** the ticket series prompt is recorded verbatim in the PICOCALC-FS diary, Step 1
("Alright do all --- ... 000 System and Development. ..."). This is the sixth and last ticket of the series; the
app loader was split from PICOCALC-SYS.

**Assistant interpretation:** Run apps from the files partition on the device, safely; guide first, then code,
diary and report.

**Inferred user intent:** Write and run small apps on the PicoCalc itself.

**Commit (docs):** the guide was uploaded before implementation (reMarkable, `/ai/2026/11/01/PICOCALC-LOADER`,
"PICOCALC-LOADER App Loader Guide").

### What I did

- Read `add_world`, `crash_at`, `kernel_restart_world`, `kernel_worlds_json`, `op_hw_fs` (it creates the
  directory), the compositor's `open`, `draw` and `worlds.status`, the drivers' handlers, the agent's `authorized`.
- Wrote the guide: what a claimless world can do, the request table, `sys.spawn`/`sys.stop`, the kernel changes,
  the Loader, the plan L1–L4.

### Why

- User worlds are recognised by name (`u-<name>`), which the kernel alone gives, so handlers need no new kernel
  facility.
- The kernel opens no file for a spawn: the loader reads it with its own `fs:/apps` handle.

### What worked

- The request audit was short: about twenty handlers, four worlds to change.

### What didn't work

- Nothing at this stage.

### What I learned

- `W->source` is used only when the VM is created, so a respawn can replace it at any time.
- World ids are indexes referenced by handles, asks and timers; a slot must never change hands.

### What was tricky to build

- Nothing yet.

### What warrants a second pair of eyes

- Guide section 2, the table of requests.

### What should be done in the future

- Nothing beyond the plan.

### Code review instructions

- Guide sections 2 and 3.

### Technical details

- The guide: `design-doc/01-app-loader-analysis-design-and-implementation-guide.md`.

## Step 2: Sender checks (L1)

The compositor's `open` refuses worlds named `u-…` and requires a string app name; `draw` is accepted only from the
compositor itself. The power driver's `screen` and `backlight` and the display driver's `attach` and `flush` are
accepted only from the compositor.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Close the requests first, before any untrusted code runs.

**Inferred user intent:** Apps from storage cannot interfere with the system.

**Commit (code):** `a150179` — "only system worlds bring an app to the front; only the compositor drives the panel
(L1)"

### What I did

- The checks; two tests in `tests/compositor-auth.test.mjs`, one loading the drivers' real callbacks in a VM.

### Why

- `attach` without a framebuffer would have released the panel's current one: any world could have blanked the
  display for good.

### What worked

- `compositor-auth.test.mjs`: 7 pass. Four screenshots changed by one digit of memory.

### What didn't work

- My first test expected only `blur` and `focus` after `open`; `focus` also queues a `draw`. And a deep equality
  across VM realms failed ("same structure but not reference-equal"); the values go through JSON now.

### What I learned

- Nothing new.

### What was tricky to build

- Nothing.

### What warrants a second pair of eyes

- A system world that is not the launcher, loader, files, agenda or chat may still send `open`; the rule is "not a
  user app", not a list.

### What should be done in the future

- Nothing.

### Code review instructions

- `js/system/compositor.js` `open`, `draw`; `js/drivers/*.js`.

### Technical details

- `node tests/compositor-auth.test.mjs`.

## Step 3: sys.spawn and sys.stop (L2)

`sys.spawn(name, source)` (claim `sys.spawn`) starts a world `u-<name>` with no claims, 384 KB, 50 ms, an 8 KB
store and its world name as its title. Spawning the same name again keeps the slot and boots the new source;
`sys.stop` stops a user world until it is spawned again. The teardown that `crash_at` did inline is now a function
used by crashes, respawns and stops.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** The kernel half.

**Inferred user intent:** Apps from storage behave like other worlds, minus every privilege.

**Commit (code):** `ba969ff` — "sys.spawn and sys.stop run apps from storage as worlds u-<name> without claims (L2)"

### What I did

- `kernel.c`: `teardown`, `kernel_spawn`, `kernel_stop_world`, the forced title in `boot_world`, `user` and `file`
  in the worlds JSON. `vm.c`: `op_sys_spawn`, `op_sys_stop` as deferred effects. Prelude: `sys.spawn`, `sys.stop`,
  no "declares itself" warning for `u-` names. Compositor: no crash banner for a stop with no crashes.
- `tests/test_loader_native.py` (4 tests), part of `make test-sys`.

### Why

- The forced title: an app that could call itself "Settings" could draw a fake password prompt under that title.
- Names are at most 12 characters so that `u-<name>` fits NVS's 15-character keys for the world's store.

### What worked

- All four tests passed on the first run: spawn, respawn in the same slot, an ask refused by a missing handler,
  stop, a refused ask to a stopped world, spawn again; seven privileged operations refused inside a user world;
  a user world needing `keys` refused at start; names, sizes, claims, room.

### What didn't work

- Nothing.

### What I learned

- Room is checked when the operation is called and again when it is applied; spawns in one segment can pass the
  first check together, so the second logs "cannot start u-a30: no room for another world (32 at most)".

### What was tricky to build

- A respawn of a world whose restart is already scheduled: the new epoch makes the old restart event stale, and
  `boot_ready` boots the new source at once.

### What warrants a second pair of eyes

- `kernel_spawn` leaves the mailbox of a running world in place across a respawn, as a crash restart does.

### What should be done in the future

- Deleting a user world's store record when its app is deleted.

### Code review instructions

- `nucleus/kernel.c`, "apps from storage"; `tests/test_loader_native.py`.

### Technical details

- `make test-sys`: 11 + 4.

## Step 4: The Loader app (L3)

Loader (claims `fs:/apps`, `sys.spawn`, `sys.read`; key `u`) lists `apps/*.js` with each world's state. ⏎ starts
and opens, F2 stops, F3 edits (a narrowed handle to the editor), F4 writes a template app, F5 reloads; names in
`apps/autostart.txt` start at boot.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** The app on top of L2.

**Inferred user intent:** Manage apps on the device.

**Commit (code):** `15718a7` — "a Loader app for apps/*.js: start, open, stop, edit, reload, new from a template,
autostart (L3)"

### What I did

- `js/apps/loader.js`, manifest and launcher entries, `scripts/loader.txt` (captures 95–99), three tests in
  `tests/sysapps.test.mjs`.

### Why

- The state names come from the kernel: `idle`, `busy`, `waiting` mean running; `restarting` without an error is a
  world about to start, with one a crash.

### What worked

- All suites: `test-apps` (… + 11 in `sysapps`), `test-sys` 15, `test-clock` 4, `test-fs` 9, `test-agent`.

### What didn't work

- The first crash capture showed an empty loader: the list was there, under a crash banner that the crash loop kept
  renewing. The script now captures seven seconds after the reload, when the app has stopped after five crashes.
- The launcher test counted thirteen apps; the Loader is the fourteenth.
- "Started 1 times" in the template.

### What I learned

- The Files app now lists `apps/` at the root, because the Loader's `hw.fs("fs:/apps")` creates it at boot.

### What was tricky to build

- Notes that outlive what they describe: "Started u-hello." stayed under an app that had crashed. A note now gives
  way after four seconds, and the selected app's error takes its place.

### What warrants a second pair of eyes

- `ldStart` holds the loader's turn open while it reads the file and waits 300 ms.

### What should be done in the future

- Deleting an app from the Loader (Files can).

### Code review instructions

- `js/apps/loader.js` `ldKey`.

### Technical details

- Captures `out/95-loader-empty.png` … `out/99-loader-crashed.png`.

## Step 5: On the ESP32-P4 (L4)

Everything worked on the device on the first flash, including a hostile app typed in on the PicoCalc itself.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Show the loader and its limits on the device.

**Inferred user intent:** Apps from storage on the real PicoCalc, and confidence that they stay in their box.

**Commit (code):** none; no fix was needed.

### What I did

- Held the bus, built and flashed `build-agent`.
- Loader → F4 → ⏎: `fs: op 3 on apps/hello.js took 331 ms`, `starting u-hello from storage (940 bytes)`; the app's
  screen with its clock; `stats`: 0 crashes; `u-hello` at 202.7 KB of 384.
- Files → `apps/` → F2 `thief.js` → typed (console `type`, 255 characters):

```js
app("thief").state({ n: 0 }).every(3000, (s) => { if (s.n++ < 3) { send("compositor", "open", { app: "u-thief" }); log("tried to take the front"); } }).onStart(() => { try { hw.fs("fs:/"); } catch (e) { log(e.message); } }).screen(() => ui.text("thief"));
```

  F2 in the editor: "Saved 255 bytes."
- Loader → `thief.js` → ⏎, then F1 → Settings. The UART:

```text
[103958.668] starting u-thief from storage (255 bytes)
[104053.756] u-thief: u-thief has no claim on fs:/
[107024.896] u-thief: tried to take the front
[110022.179] u-thief: tried to take the front
[113022.978] u-thief: tried to take the front
```

  A capture ten seconds later still showed Settings.
- Loader → F2 on `thief.js`: `u-thief was stopped by loader`; `worlds` shows both user worlds with
  `"claims":[]`, `"user":true`, their names as titles, `u-thief` `stopped`, `last_error` "stopped by loader".
- F5 on `hello.js`, ⏎: "Started 2 times" — the world's store survived the restart.

### Why

- The hostile app was typed on the device, not copied, to exercise the whole path a user would take.

### What worked

- Everything listed above.

### What didn't work

- Nothing.

### What I learned

- A write of a new file on the P4 takes 330–410 ms (the `fs` worker's log), as in the editor ticket.

### What was tricky to build

- Nothing.

### What warrants a second pair of eyes

- `apps/hello.js` and `apps/thief.js` remain on the device; `thief.js` is stopped and not in an autostart list.

### What should be done in the future

- Nothing for this ticket.

### Code review instructions

- The captures.

### Technical details

- Captures in the ticket: `captures/p4-01-hello-from-storage.png` … `p4-05-hello-reloaded.png`, and the host's 97
  and 99.

## Step 6: Documentation and delivery

The guide got a section 7, "As built and measured". The guide and this diary went to the reMarkable as one bundle;
the report went to the vault.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Close the ticket as the others were closed.

**Inferred user intent:** A record to come back to.

**Commit (docs):** this step's commit.

### What I did

- Upload, vault note `PROJ - picocalc-os - PICOCALC-LOADER - Apps from Storage, Without Claims.md`, ticket closed.

### What warrants a second pair of eyes

- Nothing new.

### Code review instructions

- Guide section 7.
