---
Title: App loader analysis design and implementation guide
Ticket: PICOCALC-LOADER
Status: active
Topics:
    - picocalc
    - security
    - ui
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: picocalc-os/js/drivers/display.js
      Note: attach and flush requests, unchecked today
    - Path: picocalc-os/js/drivers/power.js
      Note: screen and backlight requests, unchecked today
    - Path: picocalc-os/js/system/compositor.js
      Note: open, draw and worlds.status; who may bring an app to the front
    - Path: picocalc-os/nucleus/kernel.c
      Note: add_world, crash_at, kernel_restart_world; where spawning and stopping go
    - Path: repo://picocalc-os/js/apps/loader.js
      Note: the Loader app
    - Path: repo://picocalc-os/nucleus/vm.c
      Note: sys.spawn and sys.stop
    - Path: repo://picocalc-os/tests/test_loader_native.py
      Note: native tests
ExternalSources: []
Summary: How to run JavaScript apps from the files partition (apps/*.js) as worlds with no claims, started by a Loader app, after closing the requests that a world without claims could still use against the system.
LastUpdated: 2026-11-01T01:30:00-04:00
WhatFor: The intern implementing PICOCALC-LOADER.
WhenToUse: Before adding runtime worlds, or a request handler that a user app could reach.
---

# App loader: analysis, design and implementation guide

Until now every world on the PicoCalc comes from the manifest, `js/system.json`, which is compiled into the
firmware on the P4. To add an app you rebuild and flash. This ticket lets the device run apps stored as files,
`apps/<name>.js` on the files partition, written in the editor, by the agent's successor tools, or copied over USB.
Such an app is untrusted code. The design gives it **no claims at all**, and most of the work is making sure that a
world with no claims really can do nothing harmful.

The reader should know worlds, claims, handles and channels (see the PICOCALC-SYS guide, section 1, for guarded
channels).

## 1. What a world without claims can do today

Kernel operations that need no claim:

| Operation | What a user app could do with it |
|---|---|
| `send`, `ask` to any world by name | ask any world's handlers to do things (section 2) |
| `publish` on a channel it provides | broadcast on any unguarded channel name (not `keys`, `frames`, `touch`) |
| `sleep`, `now`, `clock.*` reads, `log` | wait, read time, write log lines |
| `store` | keep up to its quota of JSON under its own name |
| render a screen | show a frame, which the compositor draws when the app is in front |

Everything else (`hw.*`, `fs`, `sys.*`, `agentNet`, `net.*`, `dma`) checks a claim and refuses. Guarded channels
refuse at start. So the attack surface is the set of **message handlers in system worlds** and what they do for an
arbitrary sender.

## 2. Requests a user app must not be able to make

Reading every `.on(...)` handler in `js/` that is not `key`, `focus` or `blur`:

| World | Request | Sender check today | Risk from a user app | Change |
|---|---|---|---|---|
| compositor | `open` | none | bring itself to the front while the user types a password into Settings; the next keys go to it | refuse from user worlds |
| compositor | `draw` | none | make the compositor repaint and flush in a loop | accept only from itself |
| power | `screen`, `backlight` | none | switch the screen off, set the backlight to 0 | accept only from the compositor |
| display | `attach`, `flush` | none | flush loops; `attach` needs a framebuffer handle it cannot get | accept only from the compositor |
| agent | `agent.*` | `msg.from === "chat"` | none | — |
| chat | `agent.state` | `msg.from === "agent"` | none | — |
| editor | `open` | needs a file handle | none: no claims, no handle | — |
| compositor | `notify` | any; prefixed with the sender's name | a banner, one at a time | — |
| sandbox | `eval` | any | runs code in another world without claims | — |
| keyboard, power | `stats` | any | reads counters | — |

The compositor's `open` is the important one. Settings asks for a password; if another app could take the front
between two keystrokes, it would receive the rest of the password. Only system worlds (the launcher, the loader,
files and the agenda, which open the editor) may bring an app forward.

How does a handler know that a sender is a user app? By name: every spawned world is named `u-<name>`, and the
kernel refuses to spawn any other name. A manifest world could also be called `u-…`, but the manifest is the
user's own configuration.

## 3. Spawning

### 3.1 The operations

```js
sys.spawn(name, source)   // claim sys.spawn → { world: "u-<name>" }; starts it, or restarts it with the new source
sys.stop(world)           // claim sys.spawn → true; only a user world; it stays stopped until spawned again
```

- `name` is 1 to 12 characters of `a-z`, `0-9` and `-`, so `u-<name>` fits the store's 15-character record names.
- `source` is the app's text, at most 64 KB (the file system's read limit). The loader reads the file with its own
  `fs:/apps` handle and passes the text; the kernel never opens files for this.
- A user world gets: no claims, 384 KB of heap, a 50 ms budget, an 8 KB store, the priority of an app.
- Its title is forced to its world name. The title is what the compositor's top bar shows; an app that could call
  itself "Settings" could draw a fake password prompt under that title.

### 3.2 In the kernel

```text
op sys.spawn(name, source):
  check claim, name rule, size
  defer:                                   (after the caller's segment, like sys.restart)
    W = world_by_name("u-" + name)
    if W and not W->user: refuse (cannot happen: names are reserved)
    if !W: if K.n_worlds == MAX_WORLDS: log "no room"; else W = new world (as add_world, user = true)
    replace W->source
    if W is running: teardown(W) without counting a crash; status RESTARTING; boot_ready
    if W is stopped: boot_ready (kernel_restart_world)
    if W is restarting: the pending restart boots the new source

op sys.stop(world):
  check claim; W must exist and be a user world
  defer: teardown(W); status STOPPED; fail its mailbox; publish worlds.status "stopped", crashes 0,
         why "stopped by <caller>"
```

`teardown` is the part of `crash_at` that disposes the VM, drops its handles, frees pending settles, clears the turn
and the frame, and bumps the epoch so that stale timers and replies are ignored. Factoring it out keeps one copy.

World ids are indexes into `K.worlds` and are referenced by handles, asks and timers, so a slot is never given to a
different world: spawning the same name again reuses its slot, a new name takes a new one. With 22 manifest worlds,
ten user apps fit per boot.

`kernel_worlds_json` gains `"user": true` for spawned worlds, and their `file` reads `apps/<name>.js`.

### 3.3 The prelude

`__init` warns when a world declares a name different from the manifest's. A user app written as
`app("hello")` runs as `u-hello`; that is not a mismatch.

## 4. The Loader app

`js/apps/loader.js`, claims `fs:/apps`, `sys.spawn`, `sys.read`; launcher key `u`.

```text
┌ Loader ─────────────────────────────────┐
│ hello.js        running     2.1 KB       │
│ clock.js        stopped                  │
│ broken.js       crashed: ReferenceError  │
│                                          │
│ apps/ on the device · 3 apps · 1 running │
└ ⏎ open F2 stop F3 edit F4 new F5 reload ─┘
```

- The list comes from `dir.list()` of `apps/`, `*.js` only; the state of each from `sys.worlds()`.
- ⏎ on a stopped app reads it and spawns it, then opens it; on a running one, opens it.
- F2 stops it. F5 reads the file again and spawns it (a reload after editing).
- F3 opens the file in the editor, as the agenda does: a narrowed `rw` handle, `ask("editor", "open")`, then
  `open` editor.
- F4 writes `apps/hello.js` from a template if it does not exist, so a device without a laptop can start.
- Autostart: on its start the loader spawns the apps named in `apps/autostart.txt`, one name per line.

The compositor shows a stopped user app's banner as "u-hello stopped: stopped by loader" without the crash count.

## 5. Plan

| Step | What | Check |
|---|---|---|
| L1 | sender checks: compositor `open` and `draw`, power `screen`/`backlight`, display `attach`/`flush` | Node tests in `compositor-auth.test.mjs`; shots unchanged |
| L2 | `sys.spawn`, `sys.stop`, `teardown`, `user` flag, forced title, prelude | native tests: spawn, respawn, stop, names, size, claims, title, no claims inside, `open` refused |
| L3 | Loader app, template, autostart, launcher entry, seed `fs-seed/apps/hello.js` | Node tests; shots |
| L4 | device run: new from template, start, open, edit, reload, stop; a user app that tries privileged things | captures, diary |

## 6. Files

- `picocalc-os/nucleus/kernel.c`, `nucleus.h`, `vm.c` — spawning, stopping, the ops
- `picocalc-os/js/prelude.js` — `sys.spawn`, `sys.stop`, the name check
- `picocalc-os/js/system/compositor.js`, `js/drivers/power.js`, `js/drivers/display.js` — sender checks
- `picocalc-os/js/apps/loader.js`, `js/apps/launcher.js`, `js/system.json`, `fs-seed/apps/`
- `picocalc-os/tests/test_loader_native.py`, `tests/compositor-auth.test.mjs`, `tests/sysapps.test.mjs`

## 7. As built and measured

The design held. Details the design left open:

- **Room is checked twice.** `sys.spawn` refuses at once when the table is full, but spawns are applied after the
  caller's segment, so several in one segment can pass that check together; the later ones then log
  "cannot start u-…: no room for another world (32 at most)". With 23 manifest worlds, nine user apps fit.
- **A respawn keeps the mailbox** of a running world, as a crash restart does; a stop fails it ("u-x was stopped by
  loader").
- **A stop publishes `stopped` with `crashes: 0`**, and the compositor then shows no banner; five crashes in ten
  seconds still show the red one.
- **`teardown(W, why)`** is the shared part of a crash, a respawn and a stop: it fails the ask the world was
  answering with `why`, disposes the VM, drops handles, settles, turn, frame and ticks, and bumps the epoch.
- **The Loader's states** come from the kernel's names: `idle`, `busy`, `waiting` → running; `restarting` with no
  error → starting, with one → crashed; `stopped` → stopped, with the error unless it was "stopped by …". A note
  ("Started u-hello.") gives way after four seconds, and the selected app's error takes the status line.
- The Files app now lists `apps/` at the root: the Loader's `hw.fs("fs:/apps")` creates it at boot.

### Tests

| Suite | Count | What |
|---|---|---|
| `tests/compositor-auth.test.mjs` | +2 | `open` from `u-…` refused, from system worlds accepted, `draw` only from itself; the drivers' `screen`, `backlight`, `attach`, `flush` only from the compositor |
| `tests/test_loader_native.py` (in `make test-sys`) | 4 | spawn, respawn in the same slot, stop, spawn again; seven privileged operations refused inside a user world; `keys` refused at start; names, size, claim, room |
| `tests/sysapps.test.mjs` | +3 | the Loader: states, start/open/stop/reload, the template under a free name, the editor hand-off, autostart |
| `make shots` | — | `scripts/loader.txt` → 95–99 |

### On the ESP32-P4

| What | Result |
|---|---|
| F4, ⏎ | `apps/hello.js` written in 331 ms; `u-hello` started (940 bytes), 202.7 KB of 384 |
| A hostile app typed in Files and the editor | `u-thief has no claim on fs:/`; three `open` requests for itself while Settings was in front; Settings stayed in front |
| `worlds` | both user worlds with `"claims":[]`, `"user":true`, their names as titles |
| F2, F5 | stopped "by loader"; reloaded, "Started 2 times" from its own store |

### Commits

`a150179` (L1 sender checks), `ba969ff` (L2 spawn and stop), `15718a7` (L3 Loader).
