---
Title: Diary
Ticket: PICOCALC-BOARD-HARNESS
Status: active
Topics:
    - picocalc
    - firmware
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://bench/board/device.py
      Note: the harness fixes
    - Path: repo://tests/board/fakeboard.py
      Note: fake console on a virtual clock
    - Path: repo://tests/board/test_device.py
      Note: fake-serial tests
    - Path: repo://ttmp/2026/11/23/PICOCALC-BOARD-HARNESS--board-harness-fixes-painter-wait-console-timeout-the-compositor-overrun/scripts/01-compositor-soak.py
      Note: the 30-minute soak (not yet run)
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-23T12:56:26.923339293-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

The chronological record of PICOCALC-BOARD-HARNESS: five defects in `bench/board/` found during PICOCALC-TYPED-FIRST,
their fixes and tests, and the investigation of the compositor's turn-budget overrun on the installed playable image.

## Step 1: Reading the harness and the evidence

I read the program's rules, the ticket's design, the board library (`bench/board/device.py`, `playable.py`,
`run.py`, `gallery.py`) and the evidence from TYPED-FIRST and AGENDA-TYPED-WORLD, then checked the claim behind
fix 2 with a fake serial port before changing anything. The claim did not hold for the code as it is: a command
already times out on time while unrelated lines stream in.

### Prompt Context

**User prompt (verbatim):** "TICKET: PICOCALC-BOARD-HARNESS — fix the board harness defects found during PICOCALC-TYPED-FIRST: (1) device.health with peripherals off-by-user must wait for the Chess painter like the "on" path; (2) device.Console.command must have an absolute deadline even while the gallery prints CGAL lines; (3) a health check after a "power cycle" with USB connected judges stale world errors — reset the board before settling or refuse to judge errors older than the settle; (4) investigate the compositor's "ran past its turn budget of 80 ms" restart: does it reproduce on a healthy board?; (5) record I2C transfer/error deltas over a 5 s window in every health record."

**Assistant interpretation:** Fix the board library's health check (painter wait, stale errors, bus deltas) and its
console deadline, with fake-serial tests run by `make test`; soak the installed playable image for 30 minutes to see
whether the compositor overrun reproduces.

**Inferred user intent:** Board work in the next program should not lose time to harness false alarms, and the
overrun seen after the keyboard wedge should be classified as real or as a consequence of the wedge.

**Commit (code):** none in this step.

### What I did

- `git merge --ff-only main` (main at `6e9c08c`).
- Read `device.py` (292 lines; unchanged since `d338f4a`, 2026-11-22 16:30), `playable.py`, `run.py`, `gallery.py`.
- Looked for the board library's tests: there are none. `make test` runs `test-node test-generated test-go
  test-native test-cji test-rv32`; the Python tests under `tests/native/` drive the host binary, not `bench/board`.
- Evidence:
  - TYPED-FIRST diary step 6: `RuntimeError: painter {'sources': 0, 'compiles': 0, 'installed': False, …}` with
    `--peripherals off-by-user`, passing on a rerun minutes later.
  - TYPED-FIRST step 13 and `various/16-health-0a227fc-after-powercycle/uart.log`: 33 `worlds` answers, nothing
    else; the compositor shows `"turns":45470, "restarts":1, "budget_ms":80, "last_error":"ran past its turn budget
    of 80 ms"`, keyboard `"turns":437115`. The `worlds` JSON carries no time for an error and no uptime.
  - AGENDA-TYPED-WORLD diary 02, line 252: "`device.hold` never returned while the Candela gallery printed `CGAL`
    records: `Console.line` checks its deadline only when no line is pending".
- Firmware facts the fixes rely on (`firmware/port/esp32p4/main/main_p4.c`, `firmware/nucleus/kernel_reports.c`,
  `kernel.c`, `kernel_supervision.c`):
  - `stats` prints `t = X ms` first: the kernel clock, i.e. the uptime.
  - `reboot` holds i2c0 between transactions (`bus_p4_hold(100)`), prints `i2c0 held; rebooting` and calls
    `esp_restart()`; it never prints `#OK reboot`.
  - A crash is logged on the UART as `[t] W crashed handling TYPE: why` (`crash_at`), so a captured overrun names
    the message type the compositor was handling. `trace on` logs every dispatched message (`W <- TYPE from X`).
  - No console command reports a world's longest turn; `worlds` gives turns, `cpu_ms`, `mbox_peak`, restarts and the
    last error.
- Probed `Console.command` as it is on main with a fake port that streams CGAL lines and never answers
  (`scratchpad/probe_console.py`, not kept): command("hold", timeout=1).

### What worked

- The probe:

  ```
  period 0.005 burst 1: TimeoutError after 1.00 s
  period 0.0005 burst 1: TimeoutError after 1.00 s
  period 0.05 burst 50: TimeoutError after 1.03 s
  ```

### What didn't work

- AGENDA's explanation of the hang does not match the code. `Console.line` returns an already buffered line without
  checking the deadline, but it reads only when no complete line is buffered, and every read is preceded by a
  deadline check. A stream of lines cannot keep a command alive past its deadline. What hung in AGENDA's session is
  not recorded beyond that sentence.

### What I learned

- The real weaknesses of the console are narrower: a deadline that is not checked while buffered lines are consumed,
  and an exact-line match for `#OK CMD`, which fails if another task's partial output shares the line. Both are
  fixed in the next step, and the test covers the streaming case the ticket names.

### What was tricky to build

- Nothing yet.

### What warrants a second pair of eyes

- Whether AGENDA's hang had a cause outside `device.py` (another process holding the port, a blocking write).

### What should be done in the future

- N/A.

### Code review instructions

- `bench/board/device.py` `Console.line`, `Console.command`.

### Technical details

- `stats` first line: `t = %.1f ms, lane busy %.1f ms (%.1f%%), %llu turns, …` (`kernel_stats_print`).
- Bus line: `  bus %-5s busy %8.2f ms, %llu transfers, %llu bytes, %llu errors`.

## Step 2: Fixes 1, 2, 3 and 5 in the board library, tested against a fake console

I changed `bench/board/device.py` and `playable.py` for four of the five defects and added the board library's first
tests: a fake console on a virtual clock (`tests/board/fakeboard.py`) and 16 tests (`tests/board/test_device.py`),
run by a new `make test-board` inside `make test`. `make test` passed, and a mutation check showed that undoing
each fix fails at least one test. The decisions are in the design's "Refinements (2026-11-23)".

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Fixes 1, 2 and 5 with fake-serial tests (the coordinator asked to start with them and
commit early), and fix 3's mechanism, which the same tests cover.
**Inferred user intent:** Harness false alarms stop costing investigations.
**Commit (code):** `15f41e4` — "fix(board): painter wait with peripherals off, absolute console deadline, fresh-boot
health, 5 s bus window"

### What I did

- `device.py`:
  - `wait_painter(console, calls)`: one deadline loop (`PAINTER_S` = 30 s) for both peripheral modes. Off-by-user
    waits for installed and no rejects; on also waits for calls.
  - `Console.line` checks the deadline before every line. `Console.command` accepts `#OK CMD` at the end of a line.
    `Console(port, log, drain_s=13)` takes a device path or a port object; `Console.drain(seconds)`.
  - `Console.uptime_ms()` (the `t = X ms` line of `stats`, asked again while boot compiles keep the kernel busy),
    `Console.reboot()` (console `reboot`, waits for "rebooting", drains the boot), and `fresh_boot(console)`, the
    first step of `health`. It reboots a board up for more than `FRESH_S` = 120 s and records `"boot"`.
  - `Console.bus_window()`: `stats` twice, 5 s apart; `{"seconds", "deltas", "totals"}`; health keeps it as
    `"buses"`, and the "on" mode judges i2c0 on the deltas (transfers > 0, errors == 0). `input_ready` is gone.
- `playable.py`: `install --stored OUT --health-only` checks without flashing or recording, and `PLAYABLE.json`'s
  health summary gains `i2c0Window`.
- `Makefile`: `test-board` (`python3 -m unittest discover -s tests/board -p 'test_*.py'`), added to `test`.
- `docs/measuring.md`: the fresh-boot rule, the window, the new command.
- Mutation check (`scratchpad/mutate.py`, not kept): five edits to a copy of `device.py`, each run against the tests.
- `bash firmware/tools/wasm-toolchain.sh`, then `GOWORK=/tmp/picocalc-board-harness.go.work make test` (the GOWORK
  file points `go-go-goja` at `/home/manuel/code/wesen/go-go-golems/go-go-goja`; not committed).

### Why

- A virtual clock (the fake replaces `device.time`) makes deadlines exact and the suite fast (0.1 s for 16 tests),
  so the tests can assert "timed out after 2.0–2.1 s" without sleeping.
- The fake models wire time at 115200 baud. A CGAL record every 2 ms then builds a backlog, so a complete line is
  always waiting: the strongest form of the ticket's scenario.

### What worked

- `make test`: exit 0 (Node, generated, Go, native, cji, rv32, board).
- `make test-board`: `Ran 16 tests in 0.123s  OK`.
- Mutations, each caught:

  ```
  painter checked once with peripherals off: caught by ERROR: test_off_by_user_waits_for_the_painter
  deadline checked only without a buffered line: caught by FAIL: test_buffered_lines_do_not_outlive_the_deadline
  #OK matched only as a whole line: caught by ERROR: test_ok_after_another_tasks_partial_line
  no reboot of a long uptime: caught by ERROR: test_a_long_uptime_is_rebooted_before_judging; FAIL: test_a_firmware_that_does_not_reboot; FAIL: test_an_error_of_the_fresh_boot_is_judged
  keyboard not judged on the window: caught by FAIL: test_on_fails_a_nacking_keyboard
  ```

### What didn't work

- A heredoc that ran a Python rewrite and then `grep` in one shell call was refused by the worktree guard ("this
  command is too complex to verify that it stays inside the worktree"). I made the same edits with the Edit tool.

### What I learned

- The kernel clock is already on the console (`stats`), so the harness can tell a fresh boot from an old one without
  firmware changes; error times are not available anywhere.

### What was tricky to build

- The fake's output queue. Command answers and the CGAL stream share one wire, so stream records due before a command
  arrives must be queued first (`_produce` runs at the start of `write`), and a `read` with nothing due advances the
  virtual clock to the next due byte or by the read timeout, whichever is first. Otherwise deadlines in the tests
  would measure the fake, not the library.

### What warrants a second pair of eyes

- `fresh_boot` runs for every health check, including `run_app`'s check before a study. A study on a board that has
  been up for more than 2 minutes now starts with a reboot (about 20–30 s).
- `command` accepting `#OK CMD` at a line's end: a printed line ending in that text would end the command early.
  Nothing in the firmware prints such a line.

### What should be done in the future

- N/A for this step; the board gates follow.

### Code review instructions

- `bench/board/device.py`: `Console.line`, `Console.command`, `Console.uptime_ms`, `Console.reboot`,
  `Console.bus_window`, `wait_painter`, `fresh_boot`, `health`.
- `tests/board/fakeboard.py` (`FakeBoard._command`, `read`), `tests/board/test_device.py`.
- `make test-board`.

### Technical details

- Health record (on): `{"peripherals", "boot": {"uptimeMs", "rebooted"[, "uptimeBeforeMs"]}, "worlds", "painter",
  "buses": {"seconds", "deltas": {"i2c0": {...}, "spi2": {...}}, "totals": {...}}, "restartingAfterSettle"}`.

## Step 3: The install gate fails on a NACKing keyboard; board work stopped

The install gate reinstalled the recorded playable image (`507a7064…`, the one main's `PLAYABLE.json` records) with
the worktree's harness and peripherals on. The write and the verify passed, and the new health steps ran in order
(fresh boot, settle, native worlds, painter wait). The bus window then failed: every i2c0 transfer of the boot was a
NACK. Under the program's rule for a NACKing keyboard I stopped board work: no soak, no `--health-only` gate. I also
added the firmware hold before an install's esptool reset, which the install path lacked.

### Prompt Context

**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Run the install gate with peripherals on, then the 30-minute soak and the
`--health-only` gate.
**Inferred user intent:** The fixes are proven on the real board.
**Commit (code):** `ff2a33c` — "fix(board): hold the firmware before an install's esptool reset"

### What I did

- `python3 bench/board/playable.py install --stored ttmp/…/various/01-install-stored-507a7064 --peripherals on`,
  13:08:43–13:10:51 EST. `PLAYABLE.json` is not written by the `--stored` form.
- Read the UART log (`various/01-install-stored-507a7064/uart.log`).
- A read-only check two minutes later, under the lock (`scratchpad/bus_check.py`: `uptime_ms`, `bus_window`,
  `worlds`; no reset, no keys), logged to `various/02-bus-check-after-install.log`.
- `device.quiesce(port, log)`: `hold` before `write_app` in `install`, best effort. The record says
  `heldBeforeFlash`. Two tests in `InstallHold`; `make test-board`: 18 tests OK.

### What worked

- `install-verify.log`: `-- verify OK (digest matched)` for the app and the partition table, then `Hard resetting
  via RTS pin...`.
- Fresh boot: the first `stats` printed `t = 0.0 ms, lane busy 0.0 ms (0.0%), 0 turns` (the kernel clock had not
  started yet), so the check did not reboot.
- The painter wait: nine `painter` answers before `{"sources":1,"compiles":1,"installed":true,…,"calls":1,
  "rejects":0,"compile_us":5594279,…}`.

### What didn't work

- The install gate:

  ```
  ValueError: physical keyboard I2C0 did not qualify over 5.26 s: {'transfers': 248, 'bytes': 993, 'errors': 248, 'busyMs': 3178.91}
  ```

  - The UART log shows NACKs from the boot's first keyboard transfer:

    ```
    E (20695) i2c.master: I2C transaction unexpected nack detected
    [ 18200.506] keyboard: i2c: i2c0 0x1f: ESP_ERR_INVALID_STATE
    [ 18204.149] power: i2c: i2c0 0x1f: ESP_ERR_INVALID_STATE
    ```

  - Two minutes later (uptime 171,771 ms): i2c0 +247 transfers and +247 errors in 5.28 s, busy 4,540 ms of the
    window. Totals since boot: 7,522 transfers, 7,522 errors. The keyboard world is idle-waiting, with no restarts
    and no error.
  - This is the pattern of a wedged or switched-off keyboard controller (TYPED-FIRST steps 4, 5 and 12). No panic
    appears in my log. I cannot tell whether the keyboard was already NACKing before this install, because install
    has no check before it flashes. Last known good: TYPED-FIRST step 14's install of the same image.
- Not done, by the rule: the 30-minute soak (fix 4) and the `--health-only` gate (fix 3 on the board).

### What I learned

- `install()` reset the board through esptool without `hold`. `run_app` holds before its `verify_flash`, but
  `install` (and therefore `restore-playable`) did not. An ESP32-only reset in the middle of a keyboard transfer is
  the suspected cause of the wedges. `ff2a33c` holds first. Whether this install's unheld reset caused this wedge is
  unknown.
- With the keyboard NACKing, i2c0 is busy for 86 % of the time (4,540 of 5,280 ms). That is relevant to fix 4: the
  compositor overrun in TYPED-FIRST step 13 followed hours of exactly this.
- The kernel clock reads 0 until the kernel's first segment. `fresh_boot` treats that as fresh, which is correct.

### What was tricky to build

- N/A (no new mechanism beyond `quiesce`).

### What warrants a second pair of eyes

- `quiesce` costs up to 1 s of drain plus a 16 s timeout when the image on the board has no console (a study app).
  `run_app`'s restore path does not call it; the study app does not drive the keyboard.

### What should be done in the future

- After a person power-cycles the PicoCalc (the keyboard needs a reset by hand, not an ESP32 reset): rerun the install
  gate, run `scripts/01-compositor-soak.py` for 30 minutes, then the `--health-only` gate (it will reboot the board,
  which by then has been up for more than 120 s).
- Optional, if the coordinator agrees: a soak during a NACK storm like this one would test the other half of fix 4's
  question (does the overrun need the storm?).

### Code review instructions

- `bench/board/device.py` `quiesce`, `install`; `tests/board/test_device.py` `InstallHold`.
- Evidence: `various/01-install-stored-507a7064/{uart.log,install-write.log,install-verify.log}`,
  `various/02-bus-check-after-install.log`.

### Technical details

- The soak script is ready and was dry-run against the fake board on the virtual clock (5 virtual minutes, 3 rounds,
  summary written): `scripts/01-compositor-soak.py OUT --minutes 30 --round 120 --gap 6`.

## Step 4: After the power cycle, the install gate passes; the first soak meets another agent's bootloader

The user power-cycled the PicoCalc, and the coordinator merged this branch into main. The coordinator also fixed
`playable.py restore`, whose parser lacks `--health-only`, and installed playable `54cfa09b`. I fast-forwarded to
main `d66fb5f`. The install gate then passed with peripherals on, showing the hold, the fresh boot, the painter wait
and the bus window. The first soak attempt found the board silent: another agent had left it in its ROM bootloader.
I restored playable from the main checkout and made the soak tolerate the board changing hands between rounds.

### Prompt Context

**User prompt (verbatim):** see Step 1. Coordinator message (verbatim): "Coordinator: the user power-cycled the
PicoCalc. Your branch is merged into main (plus my fix 2f…: `playable.py restore` crashed on args.health_only — the
restore parser lacks the flag; main now uses getattr). main's restore-playable passed with your hold-before-flash
and the 5 s bus window (253 transfers, 0 errors). main's PLAYABLE.json now records 54cfa09b (209af25). Merge main into
your worktree, then run: (1) the install gate (`playable.py install --stored OUT --peripherals on`), (2) the
30-minute compositor soak with short lock acquisitions, (3) the `--health-only` gate showing the reboot. Other agents
share the board — hold the lock only per operation. Keep your diary, commit, restore from the main checkout at the
end, stop all background shells, and report compactly."
**Assistant interpretation:** The three board gates, in order.
**Inferred user intent:** The fixes are proven on the real board, and fix 4 gets its answer.
**Commit (code):** pending; the soak script change is committed with this step's documents.

### What I did

- `git merge --ff-only main` → `d66fb5f`.
- Install gate: `python3 bench/board/playable.py install --stored …/various/03-install-stored-54cfa09b --peripherals
  on`, 17:08:20–17:10:31 EST, exit 0.
- Soak attempt 1 (`various/04-compositor-soak-54cfa09b`, 17:10): it waited about 3 minutes for the lock, then
  `key f1` got no byte in 5 s (`TimeoutError: key f1: []`).
- A read-only check at 17:13:51 (`stats`, 15 s deadline, asked twice): no byte either.
- Looked for the cause. `/tmp/picocalc-compile-cache-board1/00-flash-.log` (COMPILE-CACHE) ends at 17:11:56 with
  `Wrote 6747248 bytes … Hash of data verified. Leaving... Staying in bootloader.`, after flashing app `a85b0943…`.
  Its next step's log (`01-boot-cold1-45-hold.log`) is empty, and no board process was running anymore. The board sat
  in its ROM bootloader with no lock held.
- `cd /home/manuel/code/wesen/2026-10-20--ds-js-os && make restore-playable`, 17:15:04–17:17:30: healthy, i2c0 window
  +577 transfers, 0 errors.
- The soak script now starts a round only on a board that answers and has not been reset since the last round.
  Otherwise it holds the board (`device.quiesce`) and runs `verify_flash` against the playable image main's
  `PLAYABLE.json` records, which resets it, then settles.
  - If the verify fails (another agent's image), it resets the board back into that image, waits a minute and tries
    again, giving up after ten tries.
  - The summary splits samples into boots.
  - Dry run on the fake board: OK.
- Soak attempt 2 started at 17:19:17 (`various/05-compositor-soak-54cfa09b`). It was still waiting for the lock at
  17:23, behind three other board sessions (`lsof` on the lock: CANDELA-KERNEL-CODEGEN `08-device.py`,
  COMPILER-DEVICE-COST `04-typedcost-session.py` holding it, COMPILE-CACHE `01-boots.py`).
  - Its first round would have trusted whatever image was on the board, so I stopped it with TaskStop.
  - I removed its empty directory with `scripts/02-remove-empty-soak-dir.py` (dry run, then `--apply`; it asserts
    the only file is an empty `samples.jsonl`).
- The script now checks the image (hold, `verify_flash`, settle) on the first round and after any reset or silence,
  but only when no other process has the lock file open (`others_active`, a scan of `/proc/*/fd`). An agent between
  two operations of its session may have its own image on the board. Otherwise it waits 30 s. Attempt 3
  (`various/06-compositor-soak-54cfa09b`) started at about 17:27.

### What worked

- The install gate record (`various/03-install-stored-54cfa09b/after.json`):
  - `heldBeforeFlash: true` (`i2c0 held between transactions; reboot or flash now`)
  - `boot {'uptimeMs': 0.0, 'rebooted': False}`, `restartingAfterSettle []`
  - painter `compiles 1, installed, calls 1, rejects 0, compile_us 5650602` after 39 polls
  - window 5.24 s: i2c0 +253 transfers, 0 errors, busy 1,533.92 ms; spi2 +44 transfers, 0 errors.

### What didn't work

- Soak attempt 1, exactly:

  ```
  File ".../bench/board/device.py", line 96, in line
    raise TimeoutError(self.pending[-100:])
  TimeoutError: b''
  ...
  TimeoutError: key f1: []
  ```

  - The cause was outside this ticket. A board left in the bootloader (`--after no_reset`) between another agent's
    lock acquisitions answers nothing.

### What I learned

- The lock serializes operations but not sessions. A board can change images or be left in the bootloader between
  two of another agent's operations. A long observation on "the installed image" has to check, at every round, that
  it is still the same boot of the same image.

### What warrants a second pair of eyes

- `verify_playable` resets a board running another agent's image when nobody holds the lock. The script then
  restarts that image, so the board is not left in the bootloader. An agent that keeps a board state across lock
  releases would still see a reset.

### What should be done in the future

- Agents that flash with `--after no_reset` should hold the lock until their image runs (or until they restore).

### Code review instructions

- `scripts/01-compositor-soak.py`: `board_ready`, `verify_playable`, `segments`.

### Technical details

- `various/04-compositor-soak-54cfa09b/` holds attempt 1's empty `uart-00.log` and `samples.jsonl` as its evidence.
