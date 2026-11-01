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
