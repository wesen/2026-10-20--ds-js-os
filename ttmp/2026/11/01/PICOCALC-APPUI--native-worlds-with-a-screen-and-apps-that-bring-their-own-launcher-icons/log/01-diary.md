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
