---
Title: Diary
Ticket: PICOCALC-AGENDA
Status: active
Topics:
    - picocalc
    - agenda
    - clock
    - ui
DocType: log
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/host/port_host.c
      Note: host wall clock
    - Path: repo://picocalc-os/js/apps/agenda.js
      Note: the agenda
    - Path: repo://picocalc-os/js/prelude.js
      Note: clock and Date
    - Path: repo://picocalc-os/js/system/compositor.js
      Note: status clock and notify
    - Path: repo://picocalc-os/port/esp32p4/main/store_p4.c
      Note: time zone setting
    - Path: repo://picocalc-os/tests/agenda.test.mjs
      Note: agenda tests
    - Path: repo://picocalc-os/tests/test_clock_native.py
      Note: clock tests
    - Path: repo://picocalc-os/third_party/quickjs/quickjs.c
      Note: getTimezoneOffset on ESP-IDF
ExternalSources: []
Summary: 'Chronological record of PICOCALC-AGENDA: the wall clock, time zones and a daylight-saving fix in QuickJS, notifications in the compositor, and an agenda kept in notes/todo.txt with reminders; host and ESP32-P4.'
LastUpdated: 2026-11-01T00:45:00-04:00
WhatFor: Following how real time and the agenda came to picocalc-os and why each decision was made.
WhenToUse: When resuming the ticket or reviewing one of its commits.
---

# Diary

## Goal

A todo list and agenda with reminders that use the network clock. That needed real time in JavaScript first:
until this ticket every world believed it was 22 October 2026, 09:41 UTC, plus the time since boot.

## Step 1: Research, a daylight-saving bug, and the guide

The status bar read 09:41 after every boot. The prelude's `Date` is `Date.UTC(2026, 9, 22, 9, 41) + now()`, kept so
host screenshots never change; the P4's SNTP time existed only for TLS. So the ticket starts below the app: a wall
clock the kernel exposes (unknown until set), a time zone, `Date` on top, and notifications for reminders.

Reading how QuickJS computes local time on ESP-IDF turned up a bug. An earlier port computes the offset as
`mktime(gmtime(t)) - mktime(localtime(t))` because newlib's `struct tm` has no `tm_gmtoff`; `gmtime` sets
`tm_isdst = 0`, so `mktime` reads the UTC fields as standard time and the result is an hour off while daylight
saving time is in effect. I confirmed it before designing around it, with a small C program (kept as
`scripts/tzoff.c`) under `TZ=EST5EDT,M3.2.0,M11.1.0` on glibc, whose `mktime` has the same semantics.

### Prompt Context

**User prompt (verbatim):** the ticket series prompt is recorded verbatim in the PICOCALC-FS diary, Step 1
("... Todo list and agenda. The P4 now gets the real time over Wi-Fi, so reminders are possible. ..."). This is
the fourth ticket of the series.

**Assistant interpretation:** An agenda with reminders on the real clock; guide first and uploaded, then code,
diary and report.

**Inferred user intent:** Reminders that come at the right local time on the device.

**Commit (docs):** the guide was uploaded before implementation (reMarkable, `/ai/2026/11/01/PICOCALC-AGENDA`,
"PICOCALC-AGENDA intern guide") and committed in `0470bed`.

### What I did

- Read `js/prelude.js` (`BOOT`, `VDate`), the compositor's `clockText`, `agent_p4.c` (SNTP, `clock_ready`), the
  NVS configuration (`agentcfg`), QuickJS's `getTimezoneOffset`, and the compositor's crash banners.
- `gcc scripts/tzoff.c && ./tzoff`:

```text
1782907200  local 2026-07-01 08:00 isdst=1  mktime way  300  fields way  240
1798545600  local 2026-12-29 07:00 isdst=0  mktime way  300  fields way  300
```

- Wrote and uploaded the guide: three clocks, the design (`port_wall_ms` up to `Date`), ports, zones, the DST bug
  and fix, notifications, the todo file and its format, date expressions, edits that re-read the file, reminders,
  the screen, plan A1–A6, tests, API and file references.

### Why

- The todo list is a plain file in `notes/` so the editor and the agent can use it with no new tool.
- `Date` keeps a made-up time while the clock is unknown, so formatting keeps working; acting on dates waits for
  `clock.set()`.

### What worked

- The experiment settled the bug in a minute and gave the guide a concrete trace.

### What didn't work

- My first `tzoff.c` comments mislabelled two of the instants (one I called 01:00 EDT is already the second 01:00,
  EST). The rows that matter, July and December, are right.

### What I learned

- The C library, not JavaScript, owns the time zone: QuickJS asks `localtime` for every instant, so `TZ` with
  rules gives correct local time on both sides of a DST change.

### What was tricky to build

- Nothing yet.

### What warrants a second pair of eyes

- The `_WIN32` branch of `getTimezoneOffset` keeps the `mktime` method; it does not matter here.

### What should be done in the future

- Nothing beyond the plan.

### Code review instructions

- Guide sections 2 and 5 first.

### Technical details

- `ttmp/2026/11/01/PICOCALC-AGENDA--.../scripts/tzoff.c`.

## Step 2: The wall clock, time zones and notifications (A1, A2)

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement A1–A2.

**Inferred user intent:** Real local time everywhere, and a way to tell the user something from the background.

**Commit (code):** `0470bed` — "picocalc-os: the wall clock, time zones and notifications (PICOCALC-AGENDA A1-A2)"

### What I did

- `nucleus.h`: `int64_t port_wall_ms(void)` (epoch ms or -1). `vm.c`: ops `clock.wall` (number or null) and
  `clock.zone` (`getenv("TZ")` or `UTC0`).
- Host: `host_wall(spec)` in `port_host.c` (default the old boot time, so captures do not change; ISO local time,
  `now`, `unset`); `main_host.c` options `-w` and `-z`, and `setenv("TZ", zone)` before anything else, `UTC0` by
  default.
- P4: `port_wall_ms` from `gettimeofday` once past 2025-01-01; `p4_tz_apply` and `p4_tz_console` in `store_p4.c`
  with the zone in NVS namespace `settings` (not `agentcfg`, which `net forget` erases); console `tz [ZONE]`.
- PaperS3: `port_wall_ms` returns -1.
- `quickjs.c`: on `ESP_PLATFORM`, the offset from `gmtime_r`/`localtime_r` fields (day of year, hour, minute).
- Prelude: `clock.{wall, set, zone}`; `Date` reads the wall clock and falls back to `BOOT + now()`.
- Compositor: `clockText` in local time, `--:--` while unknown; `notify` with a queue of four, one per world,
  prefixed with `msg.from`, behind crash banners (a crash puts an interrupted notification back at the front).
- `tests/test_clock_native.py` (4 tests, `make test-clock`) using `test_fs_native.py`'s scenario harness, which
  gained an `extra` argument list; a notify test in `compositor-auth.test.mjs`.

### Why

- Keeping the host's default at the old boot time in UTC means no existing capture changes because of the clock;
  a test that needs a date passes `-w` and `-z`.
- A separate NVS namespace for device settings is where the system ticket's settings app will write too.

### What worked

- `make test-clock`: 4 pass — default time and zone, `-w 2026-07-01T12:00 -z EST5EDT,...` gives local 12:00 with
  offset 240 and 300 in January, `-w unset` gives `clock.set() === false`, a bad `-w` exits 2.
- All other suites pass; `make shots` runs.

### What didn't work

- The first version of "a bad start is refused" expected an `AssertionError` from the scenario runner, but the
  binary exits before writing `uart.log`, so the runner raised
  `FileNotFoundError: ... build/fs-test-hdozxns4/out/uart.log`. The test now runs the binary directly and checks
  exit code 2 and the message.
- Seven captures changed (sysmon, REPL, About). I compared the regions: the REPL's virtual timestamp moved from
  16035.539 to 16035.544 and the JS heap total from 4,209 to 4,239 KB, both from the larger prelude. Expected.

### What I learned

- `vm` contexts expose no globals as properties of the context object (a lesson repeated from the calculator).

### What was tricky to build

- Deciding what `Date` does without a clock. Throwing would break every world that formats a time; returning 1970
  would show nonsense; keeping the made-up time and adding `clock.set()` keeps both kinds of world correct.

### What warrants a second pair of eyes

- Any world may send `notify`. The sender's name is always shown, the queue is bounded, and kernel status takes
  precedence, but a misbehaving world can still show one banner every eight seconds.

### What should be done in the future

- Read the PaperS3's BM8563 real-time clock in `port_wall_ms`.

### Code review instructions

- `nucleus/vm.c` (`op_clock_wall`), `host/port_host.c` (`host_wall`), `port/esp32p4/main/store_p4.c` (`p4_tz_*`),
  `third_party/quickjs/quickjs.c` (`getTimezoneOffset`), `js/prelude.js` (`clock`, `VDate`),
  `js/system/compositor.js` (`nextNote`, `notify`). `make test-clock`.

### Technical details

```text
port_wall_ms() -> "clock.wall" -> clock.wall() / clock.set() -> Date -> getHours() via QuickJS -> localtime(TZ)
```

## Step 3: The agenda (A3, A4)

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement A3–A4.

**Inferred user intent:** A todo list worth keeping on the device.

**Commit (code):** `dc0dfa8` — "picocalc-os: an agenda with reminders, kept in notes/todo.txt (PICOCALC-AGENDA A3-A4)"

### What I did

- `js/apps/agenda.js`: `agParse` (Markdown task lines; a plain `- item` is an open task; invalid dates are ignored),
  `agToggled` (ticks a line without rewriting the rest), day arithmetic through UTC midnight, `agExpand` (short
  dates and times written out; one date per task; "not a time" for `25:00`), `agGroups`, file access with
  `agChange` (re-read, find the line by its text, edit, write), `agRemind` (once per time and title, fired keys in
  the store, late ones within two hours, none without a clock), and the app: keys, prompt, two-step delete, F4 for
  done tasks, F6 to open `todo.txt` in the editor with a narrowed handle.
- The 15-second tick also re-reads the file every 5 minutes and regroups when the date changes or the clock gets
  set.
- Manifest `agenda` with claim `fs:/notes`; launcher key `t`; `tests/agenda.test.mjs` (9) in `make test-apps`;
  `scripts/agenda.txt` with captures 70–74.

### Why

- Ticking a line edits only its box, so whatever else the user wrote on that line stays as it was.
- Finding a task by its exact line text, not its index, is what makes concurrent edits by the editor or the agent
  safe: a line that changed is not found, and the agenda reloads instead of overwriting.

### What worked

- `make test-apps`: editor 10, calculator 13, agenda 9. The reminder test runs in New York time and puts a task at
  14:30 on 1 November, after the end of daylight saving time: 19:30 UTC, reminded at 19:15 UTC.
- The host script shows a reminder banner over the calculator: "agenda: dentist at 09:44 / in 2m".

### What didn't work

- Three agenda tests failed at first with "Values have same structure but are not reference-equal": the row list
  was mapped from a VM array, so the result had the VM's `Array.prototype`. Fixed with `plain()`.
- One test pressed Backspace 9 times where 10 were needed to remove " 14:00 !15m"; the edit became "19am", which
  the new time check rightly refused ("not a time: 19am").
- The first host capture of the reminder showed none: the banner fired on the tick at about 61 s and lasts 8 s,
  and the capture was at 72 s. The script captures at about 65 s now.
- Captures also showed a date next year without its year ("WED 20 OCT" for 2027), the hints cut off, the long
  date-syntax line cut off, and the raw `UTC0` in the status line. Fixed: the year is shown when it differs, F4 is
  labelled "all", the syntax line is shorter, and only the zone's name part is shown.

### What I learned

- Weekday words mean the next such day after today ("@sun" on a Sunday is a week later); that is what people
  usually mean when they type a weekday.

### What was tricky to build

- Appending a line to a file that ends with a newline without producing an empty line in between, and without
  adding a newline to a file whose last line had none: the append path drops a final empty element before pushing
  and adds the newline back.

### What warrants a second pair of eyes

- Two identical task lines are treated as one for edits (the first is changed).
- A reminder's identity is its time and title; renaming a task re-arms its reminder.

### What should be done in the future

- Repeating tasks (`*weekly`), and a snooze.

### Code review instructions

- `js/apps/agenda.js` from `agParse`, `agExpand`, `agChange`, `agRemind`; `tests/agenda.test.mjs`.

### Technical details

```text
"dentist @tue 2pm !15m"  --agExpand(today = 2026-11-01)-->  "- [ ] dentist @2026-11-03 14:00 !15m"
reminder at new Date(2026, 10, 3, 14, 0) - 15 min   (local, in the device's zone)
```

## Step 4: On the ESP32-P4 (A5)

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** A5: zone, status bar, a real reminder, a reboot; the provisioning tool's `--tz`.

**Inferred user intent:** The reminder has to arrive on the real device at the real local time.

**Commit (code):** `a5c90cf` — "picocalc-os: provision the time zone; device check of clock, zone and reminders (PICOCALC-AGENDA A5)"

### What I did

- `tools/provision_agent.py`: `--tz ZONE` or `--tz host` (the POSIX footer of `/etc/localtime`, here
  `EST5EDT,M3.2.0,M11.1.0`), `--skip-token`, and an acknowledgement check that is not specific to `net`.
- Held the bus and flashed. The first build failed:
  `store_p4.c:32:53: error: suggest parentheses around '&&' within '||' [-Werror=parentheses]` (the logic was
  right; the parentheses are now explicit). The second build flashed.
- After a reboot: `--:--` at 3.5 s, `net: ... wifi=down clock=unset` at 6 s; after SNTP the status bar read 04:16,
  the real UTC time.
- `provision_agent.py --skip-wifi --skip-token --tz host` → `tz: EST5EDT,M3.2.0,M11.1.0 (saved)`; the status bar
  read 00:17.
- In the REPL: `[new Date(2026,6,1,12).getTimezoneOffset(), new Date(2026,11,1,12).getTimezoneOffset(), new Date().toString()]`
  → `[240, 300, "Sun Nov 01 2026 00:17:09 GMT-0400"]`.
- At 00:17:35 I added "pick up parcel @today 0:20 !1m" and switched to the calculator; shots every 4 s from 00:19:00
  caught "agenda: pick up parcel at 00:20 / in 1m" at about 00:19:12 and 00:19:16.
- Rebooted; seven shots from 14 s to 38 s after boot showed no banner (the reminder was still inside its two-hour
  late window, so only the stored fired key kept it from repeating); the agenda still listed the task.
- The PaperS3 firmware builds with its stub (IDF 5.3.4).

### Why

- `--tz host` takes the laptop's rules, so the device's local time and the laptop's agree, including the change
  coming at 2:00 tonight.

### What worked

- Everything above. After the software reboot `net status` showed `clock=set` while Wi-Fi was still down: the
  system time survives `esp_restart`.

### What didn't work

- The 22.5 s screenshot of the first run did not finish before the capture ended; I took it again.

### What I learned

- The P4 keeps its time across a software reboot, so the status bar shows the time at once; only a power cycle
  needs SNTP again.

### What was tricky to build

- Catching an 8-second banner with screenshots that take about 2.5 s each: shots every 4 s across the 15-second
  window after the reminder time.

### What warrants a second pair of eyes

- The change at 2:00 on 1 November had not happened during these measurements (they ended around 00:30 EDT); the
  device was checked on offsets on both sides of it, not across the change itself.

### What should be done in the future

- A settings app to change the zone on the device (the system ticket).

### Code review instructions

- `tools/provision_agent.py` (`host_tz`, `--tz`); the captures in `captures/`.

### Technical details

- Captures: `p4-01-boot-clock-unset.png`, `p4-02-bar-utc-after-sntp.png`, `p4-03-repl-offsets.png`,
  `p4-04-agenda-task.png`, `p4-05-reminder-over-calc.png`, `p4-06-after-reboot-no-repeat.png`,
  `host-74-reminder.png`.

## Step 5: Documentation and delivery (A6)

### Prompt Context

**User prompt (verbatim):** see Step 1 ("write a detailed report after each ticket").

**Assistant interpretation:** Close the ticket.

**Inferred user intent:** A record others can continue from.

**Commit (docs):** recorded in the ticket's changelog.

### What I did

- Guide section 11, "As built and measured"; this diary; changelog; related files; upload of the guide and diary;
  the vault report `PROJ - picocalc-os - PICOCALC-AGENDA - Real Time and an Agenda on the PicoCalc.md`.

### Why

- The guide was written before the code.

### What worked

- See the changelog.

### What didn't work

- Nothing.

### What I learned

- Nothing new.

### What was tricky to build

- Nothing.

### What warrants a second pair of eyes

- None.

### What should be done in the future

- Next ticket: PICOCALC-SYS.

### Code review instructions

- Read the report, then the guide's section 11.

### Technical details

- None.
