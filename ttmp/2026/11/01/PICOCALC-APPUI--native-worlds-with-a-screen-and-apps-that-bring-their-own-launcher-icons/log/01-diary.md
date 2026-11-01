---
Title: Diary
Ticket: PICOCALC-APPUI
Status: active
Topics:
    - picocalc
    - ui
    - native
DocType: log
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of giving native worlds a screen and letting apps declare their own launcher icons."
LastUpdated: 2026-11-01T17:24:21.192464418-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

## Goal

Native worlds (WebAssembly, ELF modules, host processes) can show a screen and react to keys like JavaScript apps,
and every app declares its own title, icon, description and shortcut letter, so the launcher is built from the running
worlds and shows apps from storage too.

## Step 1: Ticket, code reading and the intern guide

The user asked, after the question "have we tackled wasm / elf and UI apps with icons?" was answered with "no", for
the full process. I created the ticket, read the parts of the system the feature touches, wrote the intern guide
with six decision records, and uploaded it to the reMarkable.

### Prompt Context

**User prompt (verbatim):** "Create a new ticket, intern guide, impementation with commits and diary, then vault
report. Look up neessary skills if you are feeling rusty."

**Assistant interpretation:** One ticket for native screens and app-declared icons (the two features I listed in
the previous answer), with the standard deliverables: a guide on the reMarkable, phased implementation with commits,
an investigation-format diary, and a vault report.

**Inferred user intent:** WebAssembly and ELF apps that look and behave like the built-in ones, and a launcher that
is not a hand-maintained list.

### What I did

- Reread the skill references `writing-style.md` and `deliverable-checklist.md` (decision-record format,
  orientation first, `docmgr doctor` at the end).
- Read: `nucleus/nucleus.h` (`eng_render`, `native_t`, call numbers), `nucleus/native.c` (`nat_create`,
  `nat_syscall`, payload checks), `nucleus/kernel.c` (`run_segment`, `boot_world`, `kernel_worlds_json_fields`),
  `nucleus/vm.c` (`read_meta`, `op_sys_json`), `sdk/nw_wire.h`, `sdk/nw_json.h`, `js/apps/launcher.js`,
  `js/system/compositor.js` (grid, `paint`), `tests/sysapps.test.mjs` (launcher test),
  `tests/compositor-auth.test.mjs`, `scripts/tour.txt`, every app's `.title()`.
- `docmgr ticket create-ticket --ticket PICOCALC-APPUI ...`; guide and diary; five tasks.
- `remarquee upload bundle ... --name "PICOCALC-APPUI Native Screens and App Icons Guide" --remote-dir
  "/ai/2026/11/01/PICOCALC-APPUI"` → `OK: uploaded`.

### Why

- The decisions with real alternatives (push vs pull rendering, where presentation lives, launcher order, how
  storage apps look, one call or four, where validation happens) are written as decision records so they can be
  reviewed before the code.

### What worked

- Every gap has a line of evidence: `eng_render` returns NULL for non-JS engines (`nucleus/nucleus.h:378`);
  `nat_create` sets `has_screen = false` (`nucleus/native.c:33`); the launcher's `APPS` list (`launcher.js:2`).
- The launcher's current order equals manifest order if `sysmon` moves after `loader`; every app's title equals its
  current launcher label (Agent, Files, …, System, …, About), so the data-driven launcher can draw exactly the same
  grid.

### What didn't work

- N/A in this step.

### What I learned

- `sdk/nw_wire.h` already uses `nw_frame_t` and `NW_FRAME_MAX` for transport frames, so the screen call is named
  `nw_screen`, which also matches JavaScript's `.screen()`.
- The compositor's test harness (`compositor-auth.test.mjs`) runs handlers without rendering, so the drawing guard
  needs a host end-to-end test.

### What was tricky to build

- N/A (no code yet).

### What warrants a second pair of eyes

- The decision to show apps from storage on the launcher at all; the guide's alternative was to hide them.

### What should be done in the future

- Phase 1.

### Code review instructions

- Read the guide, sections 2 to 7.

### Technical details

- Limits chosen: icon 1024 bytes, about 160 bytes, key one of a–z/0–9, a native tree plus hints 16 KB, hints 120
  bytes, at most 32 icon operations after sanitising.

## Step 2: Phase 1, the kernel and the native ABI

I added the two system calls and the kernel side of presentation. A native world now calls `nw_screen(tree, hints)`
and the kernel's existing render step posts its tree after the event, like a JavaScript world's; it declares its
title, icon, description and letter with `nw_title`, `nw_icon`, `nw_about`, `nw_key`, one system call underneath.
JavaScript worlds declare the same with `.icon`, `.about`, `.key`, and `sys.worlds(fields)` reports them when they
are asked for. The echo test native exercises every call and refusal; the native suite went from 27 to 31 tests,
all passing on both engines.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Phase 1 of the guide.
**Inferred user intent:** A native app can show a screen.
**Commit (code):** 374e71d — "picocalc-os: native worlds get a screen (nw_screen) and every app declares what it
shows on the launcher (PICOCALC-APPUI)"

### What I did

- `nucleus/nucleus.h`: `ICON_MAX` 1024, `ABOUT_MAX` 160; `world_t` gains `char *icon`, `about[160]`, `key[2]`;
  `NW_SCREEN`, `NW_PRESENT` appended before `NW_CALLS`; `NW_SCREEN_MAX` 16384, `NW_HINTS_MAX` 120; `native_t`
  gains `char *screen`; `nat_render()`; `eng_render()` calls it for native engines; `kernel_present()` declared.
- `sdk/nw_wire.h`: `NW_CALL_SCREEN`, `NW_CALL_PRESENT` (the existing `_Static_assert` on `NW_CALL_COUNT == NW_CALLS`
  keeps the two lists aligned).
- `nucleus/kernel.c`: `kernel_present()` (title 1–31 bytes of plain text, icon a JSON array up to 1024 bytes,
  about up to 159 bytes, key one of a–z/0–9); `boot_world()` clears the fields before the engine starts;
  `kernel_reset()` frees the icon; `kernel_worlds_json_fields()` writes `icon`, `about`, `key` only when the field
  list names them.
- `nucleus/native.c`: `text_ok()` (bounded UTF-8, no control characters); `NW_SCREEN` (a strict-JSON object, hints
  as text, 16 KB in all; stored as `{"tree":…,"hints":"…"}`, `has_screen = true`); `NW_PRESENT` (init only; the icon
  through `payload_ok`, the others through `text_ok`; then `kernel_present`); `nat_render()`; `nat_dispose()` frees
  the screen.
- `nucleus/vm.c`: `read_meta()` passes `icon` (via `JS_JSONStringify`), `about`, `key` to `kernel_present()` and
  fails the start with its reason; `op_sys_worlds()` takes an optional field list. `js/prelude.js`: the builder's
  `icon`, `about`, `key`; `__init()` returns them; `sys.worlds(fields)`.
- `sdk/nw.h`, `sdk/nw_calls.inc`: `nw_screen`, `nw_title`, `nw_icon`, `nw_about`, `nw_key`. New `sdk/nw_ui.h`.
- `natives/echo.c`: presentation in `nw_init`, messages `screen` and `screen-bad`. Two tests in
  `tests/test_native_worlds.py` (each runs for the process and the WebAssembly engine).

### Why

- Storing the tree and letting the render step pick it up gives native screens deduplication, retention (PICOCALC-FRAMES)
  and kernel naming without new code paths.
- The icon and description are opt-in fields of `sys.worlds` so the System app's frequent polling does not carry them.

### What worked

- `make test-native`: `Ran 31 tests … OK`. The frame the viewer received:
  `{"app":"echo","title":"Echo","frame":{"tree":{"t":"col","kids":[{"t":"text","s":"hello"}]},"hints":"echo hints"}}`.
- `sys.worlds('name,kind,title,icon,about,key')` for echo:
  `{"name":"echo","kind":"service","title":"Echo","icon":[["rect",2,2,36,26],["text",14,8,"E","m","accent"]],"about":"Answers the tests.","key":""}`;
  the default report has none of the three keys.
- test-sys 17 + 6, test-fs 9, test-clock 4, test-apps 10 + 27 + 9 + 12: all pass.

### What didn't work

- The first run of the refusal test:

  ```
  AssertionError: 'echo: TEST screen-big err a screen is at most 16384 bytes' not found in '...
  [   100.941] echo: TEST screen-big err a screen is a tree of ui nodes, a JSON object
  ```

  My echo case copied 18 bytes of the 17-byte prefix `{"t":"text","s":"`, so the large tree had a NUL inside and
  was refused as not JSON before its size was checked. Copying 17 bytes made it the valid, too large tree it was meant
  to be.

### What I learned

- clangd reported `No member named 'icon' in 'struct world'` right after the header change; the compiler did not.
  The editor's index was stale; the build is the check.

### What was tricky to build

- The order of checks in `NW_SCREEN`: JSON validity first, then the hints, then the size, so each refusal names the
  actual problem. The test caught the case where a malformed large tree reported the first.
- `read_meta()` returned nothing useful before; it now returns -1 with `W->last_error` set, and its caller marks the
  start failed, so an app with a bad icon crashes at start with the reason ("an icon is a JSON array …").

### What warrants a second pair of eyes

- `kernel_present("icon")` checks only that the value starts with `[` and fits: the value is already strict JSON
  (JavaScript's `JSON.stringify`, or `payload_ok` for a native world). What the operations draw is checked by the
  launcher (Phase 3).

### What should be done in the future

- Phase 2: the fourteen apps declare their icons.

### Code review instructions

- `git show 374e71d -- picocalc-os/nucleus/native.c picocalc-os/nucleus/kernel.c`, then `make natives wasm &&
  make test-native`.

### Technical details

- Wire compatibility: the two new numbers follow `NW_CALL_TIMER`; modules built before use none of them.

## Step 3: Phase 2, the fourteen apps declare their icons

Each of the fourteen apps now declares its letter, description and icon after its title, with the values the
launcher's `APPS` table had, copied verbatim, so that Phase 3 can delete the table and the home screen stays the same
pixel for pixel. `sysmon` moved after `loader` in `js/system.json`, which makes manifest order equal to the
launcher's hand-made order. The launcher itself was not touched yet.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Phase 2 of the guide.
**Inferred user intent:** Apps, not the launcher, own their presentation.
**Commit (code):** 4e17af2 — "picocalc-os: every app declares its launcher icon, description and letter
(PICOCALC-APPUI)"

### What I did

- A Node script inserted `.key(...)`, `.about(...)`, `.icon([...])` after `.title(...)` in `js/apps/{chat, files,
  editor, calc, agenda, settings, logs, loader, sysmon, repl, snake, faults, keys, about}.js`, the icon wrapped at
  about 118 columns.
- `js/system.json`: the `sysmon` line moved after `loader`.
- The fake builders in `tests/{chat-ui, calc, agenda, editor, sysapps}.test.mjs` accept `key`, `about`, `icon`.

### Why

- Copying the table's values exactly keeps Phase 3 testable by screenshots: if the new launcher is right, the home
  screen captures do not change by a byte.

### What worked

- After the builder fix: test-apps 10 + 27 + 9 + 12, chat-ui 13, test-sys 17 + 6, test-native 31, test-fs 9,
  test-clock 4, all passing.
- `make shots`: only `03-sysmon`, `04-sysmon-sel`, `06-sysmon-buses` and `41-about` changed, and only in heap numbers.
  The worlds' order on the System screen is unchanged in the rows captured (keyboard … chat come before the move).
  The total on the About screen went from 5499 KB to 5584 KB of JavaScript heap (22 worlds), about 6 KB per app for
  the icon literals and their bytecode.

### What didn't work

- `make test-apps` first failed in every test with `TypeError: app(...).title(...).key is not a function`: the
  test files run the apps against fake builders that only had the old methods.
- I tried releasing the icon from the prelude once `__init()` had returned it (`def.icon = undefined`; the kernel
  keeps its own copy). The total went to 5601 KB, not down: the figure is the allocator's live bytes and moves by a
  few KB between runs for unrelated reasons, and the icon's bytecode stays anyway. I reverted it.

### What I learned

- A world's heap figure (`mem_used`, `nucleus/vm.c:36`) counts live blocks with their allocator overhead; the rows
  of worlds whose code did not change moved by up to 7 KB between the two runs, so single-world differences under
  about 10 KB are not evidence of anything.

### What was tricky to build

- Nothing; the risk was in keeping the strings identical, which the unchanged launcher screenshots in Phase 3 check.

### What warrants a second pair of eyes

- The descriptions are now in the apps; they still describe what the old table said, including Settings' "the
  agent's provider".

### What should be done in the future

- Phase 3: the launcher from `sys.worlds`.

### Code review instructions

- `git show 4e17af2 --stat`, then any one app: `git show 4e17af2 -- picocalc-os/js/apps/calc.js`.

### Technical details

- The letters: chat c, files d, editor e, calc x, agenda t, settings g, logs l, loader u, sysmon m, repl r, snake s,
  faults f, keys k, about a.

## Step 4: Phase 3, the launcher from the worlds, and a compositor that survives a broken tree

The launcher no longer has a list of apps. It asks the kernel for the worlds with their declared presentation and
shows every app: system apps in manifest order with their letters, then apps from storage, labelled by their world
name, marked in the corner, without a letter, described as "From storage: …". Every icon goes through a sanitiser;
the compositor draws app trees inside `try`/`catch`. The home screen captures are byte-identical to before, which is
the regression test this phase was planned around. A first version made the launcher seven times as expensive per
poll; measuring it led to splitting the poll from the full read.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Phase 3 of the guide.
**Inferred user intent:** An app that declares itself appears on the home screen without anyone editing a list,
and a hostile or broken one cannot spoil the home screen or the compositor.
**Commit (code):** caa81ce — "picocalc-os: the launcher lists the running apps as they declare themselves
(PICOCALC-APPUI)"

### What I did

- `js/apps/launcher.js`: `APPS` removed. `lnRefresh()` reads `sys.worlds("name,kind,title,state,user,icon,about,key")`
  and builds `s.apps`: kind `app`, not the launcher, not a stopped storage app; a letter only for a system app and
  only the first claim on it; `mark` for storage apps; the selection follows the selected app by name. `lnOps()`
  sanitises an icon (operations `fill`/`rect`/`line`/`text`; numbers finite, rounded, clamped to the 40×30 box, and
  a rectangle's size to what is left of it; colours from the palette or `#rrggbb`; fonts `s m mb l xl`; text of 1–3
  characters; at most 32 operations); with nothing left the tile shows the name's first letter. `lnPoll()` runs every
  2 s with `sys.worlds("name,kind,state,user")` and calls `lnRefresh()` only when the list of shown names changed;
  `start` and `focus` call `lnRefresh()`. The tiles sent to the compositor leave out `app` and `about`.
- `js/system/compositor.js`: a grid item's `mark` draws an 8-pixel triangle in the tile's top right corner (accent,
  or white on the selected tile); icon text gets `maxw = 40 - x`; `paint()` draws the focused app's tree in
  `try`/`catch` and on an exception clears the body and writes "<title>'s screen could not be drawn" and the
  exception's message.
- `tests/sysapps.test.mjs`: the launcher test now runs on fake worlds (the fake returns only the fields asked for),
  plus three tests: storage apps (mark, no letter, description, hidden when stopped, selection after one stops),
  sanitising (clamping, unknown colour/font/operation, long text, 32 operations, two broken icons, a duplicate
  letter), and no apps at all. The poll is checked not to ask for icons.
- `tests/test_sys_native.py`: `LauncherTests`, the whole system plus an app `broken` (`key("b")`, an icon, a screen
  `{t: "grid", items: null}`): `b` opens it, the compositor does not crash, and Calc opens afterwards.

### Why

- The poll/refresh split: an app declares its icon only when it starts, so the icons can only change when the set
  of worlds changes or a world restarts; the home screen is read again whenever it comes to the front anyway.
- Clamping instead of rejecting an operation keeps a slightly wrong icon recognisable; rejecting the whole icon
  would replace it with a letter for one bad number.

### What worked

- `make shots`: `01-home`, `02-home-repl`, `90-home-row4` unchanged byte for byte; `03-sysmon`, `04-sysmon-sel` and
  `41-about` changed only in heap and lane-time numbers (the compositor 363 → 365 KB, the total 5584 → 5633 KB).
  `make BOARD=papers3 shots`: no change.
- All suites: test-apps 10 + 27 + 9 + 15 (the last is sysapps), chat-ui 13, test-sys 18 (with the new one), test-native 31,
  test-fs 9, test-clock 4, test-agent 23 (7 skipped).
- A manual capture with the `broken` app and a JavaScript app in `apps/hello.js` started by the Loader (title
  "Settings", key "g", an out-of-box fill): the launcher shows "16 apps", `u-hello` with the mark and no letter,
  "From storage: Says hello.", its fill clamped to a bar; pressing `g` opens the real Settings; opening Broken shows
  "Broken's screen could not be drawn / cannot read property 'forEach' of null".

### What didn't work

- My first launcher read everything every 2 s. The shot runs print a world table; the launcher's row, old against
  new:

  ```
  t = 1200 ms   old: turns 1  cpu 0.42 ms  237.5 KB      new: turns 1  cpu  2.76 ms  271.2 KB
  t = 20510 ms  old: turns 13 cpu 4.35 ms  237.5 KB      new: turns 13 cpu 30.04 ms  288.3 KB
  ```

  About 2.3 ms per refresh against 0.31. After the split, the poll costs 0.27 ms per turn (5.00 − 2.82 over 8 turns)
  and only a full read costs 2.4 ms.
- Two test mistakes: after pressing `e` the selection is on the Editor, so one `left` went to Files, not to the
  storage app; and `assert.deepEqual` (strict) refuses arrays made in the VM's realm, so they go through `plain()`.
- The end-to-end test's app first had `mem_kb: 256` and crashed at start: "ran out of memory (its limit is 256 KB)";
  an empty world needs about 210 KB. 320 KB, like the smallest apps.

### What I learned

Measured with a two-`stats` script (`wait 1200 / stats / wait 4000 / stats`) on copies of `js/` with one change
each, the launcher's row (cpu ms at the first stats / heap):

| Variant | CPU | Heap |
|---|---|---|
| old launcher (the `APPS` table) | 0.42 | 237.5 |
| old launcher without the icons | 0.38 | 227.2 |
| old launcher plus the unused `lnOps` code | 0.42 | 242.5 |
| new | 2.82 | 268.6 |
| new, keeping no icons | 2.79 | 251.6 |
| new, not sanitising (the parsed icons kept) | 0.65 | 255.0 |
| new, sanitising but keeping the parsed icons | 3.12 | 254.9 |
| new, the sanitised icons re-parsed | 3.13 | 278.9 |
| new, `lnOps` with plain loops | 3.12 | 268.6 |

- Sanitising costs about 2.2 ms per full read on the virtual clock, in native calls (`isFinite`, `round`, `min`,
  `max`, `push` for about 1700 numbers), not in closures: the plain-loop version was no cheaper, so the clearer
  version stayed.
- Function code costs heap: the 25 lines of `lnOps` alone are 5 KB, and the old table's icons were 10.3 KB.
- Keeping freshly built arrays costs 13–24 KB more than keeping the arrays `JSON.parse` built, for the same values. I
  did not find why without instrumenting QuickJS's allocator; the launcher's 268.6 KB is 70 % of its 384 KB limit.

### What was tricky to build

- The XL font is 32 pixels high and the REPL icon draws `>` at y = 6, so a compositor rule "text must fit in the 30
  rows" would have erased it. The width is bounded (`maxw`); a tall glyph can reach below its box, where the next
  row's tiles paint their own backgrounds over it.
- An empty app list: `% n` with n = 0, and `s.apps[s.sel]` undefined in the screen; both guarded.

### What warrants a second pair of eyes

- `lnPoll()` compares names only. A storage app reloaded by the Loader (stop and spawn in one turn) keeps its name;
  the launcher sees its new icon when it next comes to the front, which it must, since the Loader is in front while
  reloading.
- The guard in `paint()` catches exceptions from `draw()` only; it does not log, so a broken screen is visible on the
  screen and nowhere else.

### What should be done in the future

- Phase 4: the native demo app, and the device.

### Code review instructions

- `git show caa81ce -- picocalc-os/js/apps/launcher.js picocalc-os/js/system/compositor.js`.
- `node --test picocalc-os/tests/sysapps.test.mjs`; `python3 -m unittest tests.test_sys_native.LauncherTests` in
  `picocalc-os/`; `make shots` and `git status out/` (no launcher capture may change).

### Technical details

- The mark: `for (i = 0; i < 8; i++) fb.fill(cx + cw - 8 + i, cy + i, 8 - i, 1, colour)`.
- The order of storage apps is their world ids, which is the order they were started.
