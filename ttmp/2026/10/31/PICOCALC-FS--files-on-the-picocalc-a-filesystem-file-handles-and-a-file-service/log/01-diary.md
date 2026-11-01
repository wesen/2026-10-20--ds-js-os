---
Title: Diary
Ticket: PICOCALC-FS
Status: active
Topics:
    - picocalc
    - esp32-p4
    - filesystem
    - handles
DocType: log
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of PICOCALC-FS: files, file handles and asynchronous file operations, on the host and on the ESP32-P4's flash."
LastUpdated: 2026-10-31T23:10:00-04:00
WhatFor: "Following how files came to picocalc-os and why each decision was made."
WhenToUse: "When resuming the ticket or reviewing one of its commits."
---

# Diary

## Goal

Give picocalc-os files: a filesystem on the PicoCalc, handles that grant access to one directory or one file,
and operations that respect the kernel's deferred-effect rule. The editor, file browser, agenda and app loader
tickets that follow all build on it.

## Step 1: The design and the guide

The first decision was where files live. The PicoCalc's SD slot is wired to the Pico socket's SPI0 pins, but
the P4 sits on a same-position adapter whose SD pins were never mapped (only keyboard and LCD were verified in
`esp32-s3-m5/0099`; the bring-up project lists "SD card (onboard SDMMC or PicoCalc SPI)" as a future phase). The
P4's flash has 11.8 MB unused below the 16 MB ESP-IDF can address. So files go on flash now, behind one root
path, and the SD card can be a second root later.

The second was the access model. The kernel already has handles with rights, narrowing, passing in messages
and revocation; a file handle that carries a path fits that model and makes "the browser hands the editor one
file" a direct use of existing machinery.

### Prompt Context

**User prompt (verbatim):** "Alright do all --- [pasted list: Productivity (what the keyboard is for) — Text editor
for plain text and Markdown, with search, sized for the 320×320 screen. It also becomes where the agent's notes
live: today they are capped at 8 notes and 3 KB in total. — File browser that opens a file in another app by
handing it a handle to that one file, not general file access. — Calculator with history and graphing. The
agent already has an arithmetic tool; a real one fits a device called PicoCalc. — Todo list and agenda. The P4
now gets the real time over Wi-Fi, so reminders are possible.] 000 System and Development. Create a new docmgr
ticket per chunk that makes sense, Create  a detailed analysis / design / implementation guide that is for a new
intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet
point sand pseudocode and diagrams and api references and file references. It should be very clear and
technical. Store in the ticket and the nupload to remarkable. And then implement the tickets, commit at
appropriate intervals, commit at appropriate intervals and keep a detailed diary as you work (using the diary
format from the skill) And write a detailed report after each ticket. Before starting, write a detailed report
about the work done on the picocalc-os"

**Later user messages (verbatim):** "i reset the keyboard, it should be good now ?"; "is it loop crashing now? it
says "power crashed" on boot now?"; "done".

**Assistant interpretation:** Five tickets (FS, EDIT, CALC, AGENDA, SYS), each with an intern guide uploaded
before implementation, commits, a diary and a report; an overview report first.

**Inferred user intent:** A PicoCalc that is useful as a pocket computer, documented well enough for others.

**Commit (docs):** the ticket and guide were uploaded before implementation; committed with this diary.

### What I did

- Wrote the overview report in the vault (`PROJ - picocalc-os - Project Overview - A JavaScript OS on Two
  Devices, With an Agent.md`, vault commit `cffccc9`).
- Read `nucleus/vm.c` (handles, `host_ka`, `vm_new_promise`, `check_grants`), `nucleus/hw.c`
  (`handle_child`, `handle_use`), `nucleus/kernel.c` (`apply_deferred`, `discard_deferred`), the P4 bus worker
  and kernel loop.
- Wrote the guide (11 sections) and uploaded it to `/ai/2026/10/31/PICOCALC-FS`.

### Why

- Asynchronous operations for reads as well as writes keep one model, and the SD card (slower) will not change it.
- A handle-based model lets access follow the user's action instead of a manifest edit.

### What worked

- The existing grant rule ("a handle can be passed on if it carries the grant right, or by the world that
  narrowed it") gives exactly the needed property: the browser can hand the editor a file the editor cannot
  pass on.

### What didn't work

- Nothing in this step.

### What I learned

- The offline P4 build already had only 193 KB internal RAM free (P4-PORT report), so the agent guide's
  "320 KB at boot" was mostly the OS itself; corrected in PICOCALC-AGENT (`295ae95`).

### What was tricky to build

- Nothing yet.

### What warrants a second pair of eyes

- Guide §3: the decision to defer the SD card.

### What should be done in the future

- Map the adapter's SD pins and mount the card as a second root.

### Code review instructions

- Read the guide §4–§6.

### Technical details

- Partition plan: `files, data, fat, 0x430000, 0xBD0000`.

## Step 2: Files on the host (F1–F3)

The nucleus gained a POSIX file layer, an `H_FS` handle type and an asynchronous `fs` operation, the prelude
gained file methods on `Handle`, and the host gained a root directory. Nine native tests cover claims, paths,
rights, narrowing, passing and revoking, crash safety, sizes, UTF-8, recovery of an interrupted write and
epochs; all pass, also under AddressSanitizer with leak detection and UndefinedBehaviorSanitizer halting.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement F1–F3 of the guide.

**Inferred user intent:** A filesystem the next tickets can rely on.

**Commit (code):** e16fa7d — "picocalc-os: files, file handles and asynchronous file operations (PICOCALC-FS F1-F3)"

### What I did

- `nucleus/fs.c`: `fs_path_ok`, `fs_join`, `fs_kind`, `fs_mkdirs`, `fs_execute` (list, stat, read, write,
  append, mkdir, remove, rename, info), temp-file writes with recovery, `fs_job_free`.
- `nucleus/nucleus.h`: `fs_job_t`, `FS_*` limits, `H_FS`, `handle_t.path/file`, `deferred_t.job`, the port
  contract, `utf8_valid` (moved from the agent code to `util.c`), `handle_type_name`.
- `nucleus/vm.c`: `op_hw_fs`, `op_fs_at`, `ka_fs` with the `FS_OPS` table of rights and rules, `run_fs`;
  `handle_info` names every type and shows an fs handle's path.
- `nucleus/kernel.c`: `discard_deferred` frees a dropped job.
- `js/prelude.js`: `hw.fs`; `at`, `list`, `stat`, `append`, `mkdir`, `remove`, `rename`, `info`; `read`/`write`
  dispatch on the handle type.
- Host: `host_fs_root`, `port_fs_submit` (2 ms + 1 µs a byte), `port_fs_info` (statvfs), `-f DIR`.
- `fs-seed/`, `make shots` copies it per script, `make test-fs`, `tests/test_fs_native.py`.

### Why

- One POSIX implementation for both roots keeps the device and the host from drifting.

### What worked

- `make test-fs`: "Ran 9 tests ... OK"; the same under `make SAN=1` with `UBSAN_OPTIONS=halt_on_error=1` and
  `ASAN_OPTIONS=detect_leaks=1`.
- `make test-agent` unchanged; PAPERS3-OFF 01–05 PASS; PaperS3 captures unchanged.

### What didn't work

- The first `make shots` changed ten captures: `flaky crashed: ran out of memory (its limit is 256 KB)` at boot.
  The prelude's new methods cost about 4 KB per world on the 64-bit host (total 3,268 → 3,338 KB); flaky had
  the only 256 KB limit. Raised to 320 KB like the other small worlds; then only System and About differed
  (their memory figures).

### What I learned

- The prelude is compiled per world on the QuickJS build, so every line in it is paid fifteen times.

### What was tricky to build

- `read` and `write` already existed on `Handle` for I2C; they dispatch on `this.type`.
- A write must fail cleanly on FAT, which cannot rename over an existing name: the layer writes `.w-name`,
  removes the old file and renames, and recovers a leftover `.w-name` on the next read or list.

### What warrants a second pair of eyes

- `fs.at` and `hw.fs` do synchronous I/O on the kernel thread (`stat`, `mkdir`); they are short, but on the
  device they share FATFS with the worker task (FATFS's own lock serialises them).
- `fs_path_ok` allows bytes ≥ 0x80 (UTF-8 names); FAT stores them as long names.

### What should be done in the future

- Compile the QuickJS prelude to bytecode once, as the PaperS3 build does.

### Code review instructions

- Start with `ka_fs` and `FS_OPS` in `nucleus/vm.c`, then `fs_execute` in `nucleus/fs.c`.
- Validate: `cd picocalc-os && make -j8 && make test-fs && make SAN=1 && PICOCALC_TEST_BINARY=build-san/picocalc-host python3 tests/test_fs_native.py`.

### Technical details

- Results are JSON values; errors are JSON strings with `ok = 0`, which reject the promise.

## Step 3: Files on the P4, and the keyboard controller that stopped answering (F4)

The `files` partition mounts on the device: 11,956 KB, first mount (with format) 773 ms, later mounts 3 ms.
`df` and `ls` work on the console, all fifteen worlds run, and the agent's records survived because earlier
partitions kept their offsets.

The hardware test also turned a "one-off" from the agent ticket into a reproducible fault. A reset of the P4
alone can leave the PicoCalc's STM32 keyboard and power controller not acknowledging its I2C address until the
whole device is power-cycled. My first theory (the STM32 holding SDA low; fix with a bus recovery) was wrong:
SDA was never low. The working fix is to stop keyboard-bus traffic between transactions before any reset.

### Prompt Context

**User prompt (verbatim):** see Step 1; during this step "i reset the keyboard, it should be good now ?", "is it
loop crashing now? it says "power crashed" on boot now?", "done".

**Assistant interpretation:** Bring the filesystem up on the device; find out why the keyboard keeps dying.

**Inferred user intent:** A device that survives being reset and flashed.

**Commit (code):** 6f12990 — "picocalc-os p4: files on flash; the keyboard controller is no longer wedged by resets (PICOCALC-FS F4)"

### What I did

- `port/esp32p4/partitions.csv`: `files` partition; `sdkconfig.defaults`: `CONFIG_FATFS_LFN_HEAP=y`,
  `CONFIG_FATFS_MAX_LFN=255`; CMake: `fs.c`, `fs_p4.c`, `fatfs wear_levelling vfs`.
- `fs_p4.c`: `esp_vfs_fat_spiflash_mount_rw_wl`, an `fs` worker task, `p4_fs_done`, console `ls`/`cat`/`df`;
  `kmsg_t.fs`; the kernel loop dispatches finished jobs.
- PaperS3: `fs.c` in its build and stubs with no root.
- Keyboard bus: tried `i2c_recover()` (nine clocks and a STOP) — removed; added `bus_p4_hold()`, console
  `hold` and `reboot`, `p4cap.py` sends `hold` before pulling reset; `power.js` survives I2C errors.

### Why

- The keyboard fault makes the device unusable until someone power-cycles it; it had to be fixed before any
  further device testing.

### What worked

- Mount and console: `/files: 11956 KB, 11956 KB free (mounted in 773 ms)`, then `(mounted in 3 ms)`.
- Ten resets with `hold` first: every one `i2c0=[466 bytes, 0 errors]`.

### What didn't work

- After a plain reset: `E (3728) i2c.master: I2C transaction unexpected nack detected`, then
  `bus i2c0 busy 17163.11 ms, 1086 transfers, 4349 bytes, 1086 errors` and
  `power driver stopped ... 4 i2c0 0x1f: ESP_ERR_INVALID_STATE (drivers/power.js:30:32)`.
- With the bus recovery flashed, ten plain resets: resets 1–4 clean, from reset 5 on `nacks=68 ... 31 errors`;
  the recovery's own "SDA was held low" warning never appeared, so SDA was released and the STM32 was not
  acknowledging. The user power-cycled the keyboard twice.
- The first S3 build attempt did not run: `export.sh` for IDF 5.3.4 returned non-zero in a shell where the 5.4.2
  environment was loaded, and the `&&` chain stopped; run separately, it built.

### What I learned

- The STM32F103's I2C slave gets stuck by an interrupted transaction in a way only its own reset clears; the P4
  cannot clear it from the bus. Not interrupting it is the only fix available to the P4.
- `idf.py flash` resets through RTS too: before flashing, send `hold` (`tools/p4cap.py --no-reset -s 1 -c "0.2 hold"`).

### What was tricky to build

- Proving which fault it was: the recovery logs whether SDA was low, and that log's absence ruled the theory out.

### What warrants a second pair of eyes

- `bus_p4_hold` suspends the i2c worker forever; only a reboot follows. A `hold` without a reboot leaves the
  keyboard dead (by design, for flashing).
- Evidence for the fix: 1 wedge in 5 plain resets against 0 in 10 held resets.

### What should be done in the future

- World-level file operations on the device are first exercised by the Files app (PICOCALC-EDIT).
- A flash script that sends `hold` before `idf.py flash`.

### Code review instructions

- `git show 6f12990 -- picocalc-os/port/esp32p4/main/fs_p4.c picocalc-os/port/esp32p4/main/bus_p4.c`.
- Device: flash (send `hold` first), then `df`, `ls`.

### Technical details

- Partition table on the device: `4 files Unknown data 01 81 00430000 00bd0000`.
- App size with files: 0x22cc20 (46% of 4 MB free).
