---
Title: Diary
Ticket: PICOCALC-COMPILE-CACHE
Status: active
Topics:
    - firmware
    - picocalc
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Implementation diary of the compiled-module cache for Typed boot worlds and the Candela Typed arm."
LastUpdated: 2026-11-23T12:56:29.543395289-05:00
WhatFor: "What was built, measured and decided, with exact commands, failures and commits."
WhenToUse: "Resuming or reviewing PICOCALC-COMPILE-CACHE."
---

# Diary

## Step 1: Reading the design against the code

The design (`design-doc/01-a-compiled-image-cache-for-boot-worlds.md`) puts a content-addressed cache in
`p4_typed_app_compile`. I read every path a Typed compile takes on the P4 to check where the cache can sit, what a
compile's output depends on, and what the FAT partition allows. The design holds, with four corrections that change
the implementation: the cache's file I/O cannot run on most of the tasks that compile, the FAT writes must leave the
boot's critical path, the partition is too small for N = 2 without a byte budget, and the compile depends on one C
input the design does not list.

### Prompt Context
**User prompt (verbatim):** "TICKET: PICOCALC-COMPILE-CACHE — a content-addressed cache of compiled Typed modules on
the P4's FAT partition, so boot worlds (and the Typed Candela arm) compile once per firmware/source instead of at
every boot; then put the Typed Candela arm in the playable gallery and, if the evidence supports it, make it the
default arm."
**Assistant interpretation:** Implement milestones 1–4 of the ticket's design in a worktree (host model, device cache
for boot worlds with cold/warm measurements, the Candela Typed arm through the cache in the playable profile, the
default-arm decision), under the program's board and process rules, committing on the branch.
**Inferred user intent:** Boot without recompiling unchanged Typed code, and make the Typed Candela kernel usable as the
gallery's everyday arm, so the handheld runs Typed by default and C stays the benchmark.

### What I did
- `git merge --ff-only main` (6e9c08c).
- Read `firmware/port/esp32p4/main/typed_p4.c` (`p4_typed_compile`, `eval_file`, `rv32_load`, `p4_typed_app_compile`,
  `p4_typed_world_read`, `p4_typed_console`), `port_p4.c` (`p4_bundle_read`, `port_read_file`), `fs_p4.c`,
  `nucleus/fs.c` (`fs_path_ok`, listing), `nucleus/kernel_supervision.c` (`add_world`, the fallback), `main_p4.c`
  (boot order, console), `typed_apps.py`, `cmake/typed-apps.cmake`, `bundle_js.cmake`, the seven `apps/typed/*/app.json`,
  `candela_typed_p4.c`, `candela_gallery_p4.c`, `candela_p4.c`, `typed_ray_p4.c`, `mobile_painter_p4.c`,
  `painter_service.c`, `bench/board/{device,playable,run,gallery}.py`, the partition table and the playable sdkconfig.
- Read the evidence: AGENDA-TYPED-WORLD `reference/02` Step 7 and `scripts/02-boot-capture.py` (first frames from the
  kernel trace, 3 resets per image), CANDELA-TYPED diary Steps 3–4 (85 s, 16.3 MB, 787,712-byte module).

### Why
- The cache must be placed where every compile passes, and its key must cover everything the module depends on, or a
  hit returns a stale module that no check notices.

### What worked
- `p4_typed_app_compile` is the single funnel: boot worlds (`p4_typed_world_read`), the Chess painter
  (`mobile_painter_compile`, kind `screen-message`), the Candela scene variants (`candela_p4.c install`), the ray
  tracer (`typed_ray_p4.c install`), the gallery's Typed program (`candela_typed_p4.c compile_task`) and
  `typed WORLD build|baseline`. A cache there serves all of them.
- `/files` is mounted in `app_main` before the kernel task starts, so the boot compiles can use it.
- A hidden directory is private to the firmware: `fs_path_ok` rejects any path segment starting with `.` and the
  listing skips such names, so no world can read, list or corrupt `/files/.cache/`.
- FAT has long names (`CONFIG_FATFS_LFN_HEAP`, 255) and 4,096-byte sectors; `max_files = 4`.
- Module sizes (CANDELA-TYPED dev5): every module is its reactor with the slot filled, so its size is the reactor's:
  Agenda, Editor, Files 243,644 B; Chess 276,412; painter 33,840; Candela scene 66,816; ray tracer 66,816; the
  gallery program 787,712. One firmware's set is about 1.96 MB.

### What didn't work
- No failures in this step.

### What I learned
- **File I/O needs an internal-RAM stack.** A FAT read or write ends in `esp_flash_read/write`, which disables the
  caches; ESP-IDF asserts (`esp_task_stack_is_sane_cache_disabled`) when the calling task's stack is in PSRAM, as
  CANDELA-TYPED Step 3 found for `esp_elf` relocation. The painter's build worker (80 KB PSRAM stack), the gallery's
  compile task (96 KB PSRAM) and the gallery worker (24 KB PSRAM) all compile. So the cache cannot simply call
  `fopen` inside `p4_typed_app_compile`: it must run its I/O on a task with an internal stack.
- **A FAT write is not cheap and parks the other core.** With wear levelling each 4 KB write erases and programs a
  sector (tens of ms), and ESP-IDF stops the other CPU meanwhile (`fs_p4.c`'s header). Writing 1.3 MB of boot modules
  synchronously would add seconds to a cold boot, and the painter (compiling in the kernel's idle time at priority 2
  on core 1, 72 % of its 8 s deadline) must not be slowed by it.
- **N = 2 does not fit by itself.** 2 × 1.96 MB is half of the 7.8 MB partition, which also holds the user's files.
- **One C input.** `typed_lex_index.c` is a native tokenizer the front end calls (`typed_lex_index_install`); its
  output shapes the compile, but it is firmware C, not a bundle.
- The compile reads only bundled sources at boot (`p4_typed_world_read` passes `text = NULL`); an edited Agenda source
  is compiled only by `typed agenda build`, so a boot never depends on a user file.

### What was tricky to build
- Nothing built yet; the constraint that shapes the build is the stack rule above combined with priorities: a read
  requested by a low-priority PSRAM-stack task must not wait behind a long write, and a write must never preempt the
  painter's compile.

### What warrants a second pair of eyes
- That `typed/` holds every bundle `typedRv32Load` can evaluate: `rv32_load` maps `typed-X` to `typed/X` and refuses
  anything else, so the set of bundles under `typed/` is a superset of what any compile can load, whatever its policy.

### What should be done in the future
- N/A (decisions recorded in the design's Refinements).

### Code review instructions
- Start with the design's "Refinements (2026-11-23)" section, then `typed_p4.c` `p4_typed_app_compile`.

### Technical details
- Partition `files`: offset 0x830000, size 0x7D0000 (8,192,000 B). App slot 8 MiB.
- Boot compiles on 6c7e2ca0 (CANDELA-TYPED dev5): Chess 4.19 s / 6 s, painter 5.75 s / 8 s, Editor 3.42 s / 6 s,
  Agenda 2.65 s / 4 s, Files 1.45 s / 3 s, Candela 2.54 s / 8 s.
