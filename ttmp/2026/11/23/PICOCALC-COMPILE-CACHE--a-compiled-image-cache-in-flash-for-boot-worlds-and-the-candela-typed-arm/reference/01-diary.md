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

## Step 2: Milestone 1, the portable core and its host test

The cache's key, entry format, store and eviction are one portable C file, `typed_cache.c`, that the P4 build and a
host driver both compile. A Python test drives it on the host and checks the key against an independent model, so
the format is pinned before any board time is spent. 20 tests pass, also under AddressSanitizer and UBSan.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Milestone 1: a host test of the key function and the file format, torn and corrupt files.
**Inferred user intent:** Prove the cache cannot serve a wrong module before it runs on the device.
**Commit (code):** a3cbffc — "feat(compile-cache): the cache's portable core and its host test"

### What I did
- `firmware/port/esp32p4/main/typed_cache.{h,c}`: SHA-256 (mbedTLS on the P4, a portable implementation on the host),
  `tc_key` over framed items, the 160-byte header (`tc_header_encode/decode`), `tc_read`, the three-step store
  (`tc_prepare`, `tc_write_tmp`, `tc_commit`), `tc_exists`, `tc_list`, `tc_clear`.
- `tests/native/typed_cache_host.c` (a command-line driver: `sha256`, `key`, `store`, `tmp`, `read`, `list`,
  `clear`) and `tests/native/test_typed_cache.py`; `firmware/Makefile test-typed-cache`, run by `make test-native`.
- `make -s -C firmware test-typed-cache`; then the same test against a build with
  `-fsanitize=address,undefined` (`ASAN_OPTIONS=detect_leaks=0`: the driver itself does not free its inputs).

### Why
- One implementation for host and device: a Python model of the format alone would not test the code that runs.
- The key is a hash of framed items (tag, NUL, length, bytes), so no two input lists can produce the same preimage
  (`test_framing_keeps_adjacent_items_apart`).

### What worked
- 20 tests: the driver's SHA-256 equals hashlib's at block boundaries; the key equals the Python model; each of 17
  input changes (source, reactor, linker, front end, tape, a lazily loaded pass group, another pass group, a compiler
  module, a new bundle under `typed/`, the module list, the back end, an outside back end's bytes, the entry, the
  policy, no policy, an empty policy name, the native compiler code) gives a distinct key; renamed or unrelated files
  do not; round trip; absent entry; a flipped module byte, flipped header bytes (magic, format, header check), a
  file cut at 0, 10, 159, 160 and 5159 bytes, and a valid entry under another key's name are each a corrupt miss
  that deletes the file; a store cut before its rename leaves no entry and the next store removes the `.tmp`; a store
  replaces an entry of the same key; two entries per app and label; another label or app does not evict; the budget
  evicts oldest first; the free-space reserve; a store that cannot fit is refused before anything is deleted.

### What didn't work
- `make -s -C firmware test-typed-cache` first failed `test_the_reserve_keeps_free_space_for_the_user`:
  `AssertionError: False is not true : stored 3`. My test expected a refusal with an evictable entry present; the
  code evicted it and stored. The real defect it exposed: a store that could never fit evicted entries before
  refusing. `tc_prepare` now checks first whether the entry fits in an empty cache (budget, free space plus every
  evictable entry) and refuses without deleting anything; the test now covers both refusals.
- The first sanitizer run reported `LeakSanitizer: detected memory leaks ... in slurp ../tests/native/typed_cache_host.c:24`
  (the driver's own buffers, freed at exit); with leak detection off the core is clean.
- `gcc -m32` is not installed here (`bits/libc-header-start.h: No such file`), so there is no 32-bit host run; the P4
  build compiles the same file for RV32.

### What I learned
- FAT allocates whole 4 KB sectors, so the budget counts entries rounded up to 4 KB.

### What was tricky to build
- Eviction order: invalid files are garbage and always removed; the per-label limit comes next; the byte budget and
  the free-space reserve last, oldest sequence number first, never the entry being replaced (whose old file stays
  until the rename, so its space is not counted as freed).

### What warrants a second pair of eyes
- `tc_prepare` in `typed_cache.c`: the accounting of `freed`, `total` and `need` across the three eviction passes.

### What should be done in the future
- N/A

### Code review instructions
- `firmware/port/esp32p4/main/typed_cache.h` (format comment), `typed_cache.c`, `tests/native/test_typed_cache.py`.
- `make -s -C firmware test-typed-cache`.

### Technical details
- Key preimage: `"PCTC-key\0"`, u32 format, then items `native`, (`bundle`, `digest`) per `typed/` bundle in path
  order, `module`..., `backend`, [`backend-digest`], `linker`, `entry`, `reactor`, `source`, `policy` or
  `default-policy`.
