---
Title: 'Agenda: analysis, design and implementation guide'
Ticket: PICOCALC-AGENDA
Status: active
Topics:
    - picocalc
    - agenda
    - clock
    - ui
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/js/apps/agenda.js
      Note: the agenda
    - Path: repo://picocalc-os/nucleus/vm.c
      Note: clock ops
    - Path: repo://picocalc-os/tools/provision_agent.py
      Note: --tz
ExternalSources: []
Summary: 'A todo list and agenda for picocalc-os, kept in the plain-text file notes/todo.txt that the editor and the agent also use, with reminders shown as banners. It needs a real clock first: the kernel exposes the wall clock (unknown until SNTP sets it on the P4), the device gets a time zone, QuickJS''s local-time code on ESP-IDF is fixed for daylight saving time, and the compositor learns to show notifications from any world.'
LastUpdated: 2026-11-01T00:30:00-04:00
WhatFor: Onboarding to time on picocalc-os and to the agenda, and the plan PICOCALC-AGENDA follows.
WhenToUse: Before changing Date or the clock in the prelude, port_wall_ms, the compositor's banners, or js/apps/agenda.js.
---

# Agenda: analysis, design and implementation guide

## 1. What this ticket delivers

- **Real time.** Worlds can read the wall clock, know whether it is set, and format local time in a configured
  time zone. The status bar shows the real time once the P4 has it from the network, and `--:--` before.
- **Notifications.** Any world can ask the compositor to show a short banner; the banner names the world.
- **An agenda.** An app that lists the tasks in `notes/todo.txt` grouped by day (overdue, today, tomorrow, later,
  undated), adds and edits them with short date expressions (`@tue 14:30 !15m`), checks them off, opens the file in
  the editor, and shows a reminder banner when a task's time comes, whichever app is in front.

The ticket is half infrastructure. The reader should finish it knowing why `new Date()` printed 22 October 2026
on every boot, how SNTP time reaches JavaScript, why a time zone is a C-library setting and not a JavaScript one,
and the one-hour bug that daylight saving time would have caused on the device.

## 2. Time on picocalc-os today

### 2.1 Three clocks

| Clock | Where | What it is |
|---|---|---|
| Virtual time | `kernel_now()`, JS `now()` | microseconds (ms in JS) since boot on the kernel's clock: simulated on the host, real on the device. Durations, timers, budgets |
| The prelude's `Date` | `js/prelude.js` | `Date.UTC(2026, 9, 22, 9, 41)` plus `now()`: a fixed, made-up calendar time |
| The P4's system time | newlib `time()`, set by SNTP | real UTC once Wi-Fi is up; used only by TLS certificate checks (`clock_ready()` in `agent_p4.c`) |

The fixed boot time keeps host screenshots identical from run to run, which is why it exists. The cost is that
no world can know the date. The status bar formats the fake time with `getUTCHours`, so it reads `09:41` after
every boot, on the host and on the device.

### 2.2 What an agenda needs

An agenda needs the actual date and time, local to the user, and a way to tell "the time is unknown" from "it is
09:41". The design adds one primitive at the bottom and builds on it:

```text
port_wall_ms()        C, per port: epoch milliseconds, or -1 if the time is unknown
  -> "clock.wall"     kernel op
  -> clock.wall()     prelude: a number or null;  clock.set(): boolean;  clock.zone(): "EST5EDT,..."
  -> Date             new Date() and Date.now() use the wall clock when it is set
  -> local time       Date's local methods (getHours, ...) use the C library's TZ rules
```

### 2.3 Ports

| Port | `port_wall_ms()` |
|---|---|
| host | a start time plus virtual time. Default: the old fixed boot time, so existing screenshots do not change. `-w 2026-11-01T09:41` sets another start (in the time zone below), `-w now` the real time, `-w unset` makes it unknown |
| ESP32-P4 | `gettimeofday()` once `clock_ready()` (SNTP has set a time after 2025-01-01), else -1 |
| PaperS3 | -1 for now (its BM8563 real-time clock is a later step) |

### 2.4 Time zones

SNTP gives UTC; people read local time. The C library converts with the `TZ` environment variable, in POSIX form:
`EST5EDT,M3.2.0,M11.1.0` means "EST, 5 hours behind UTC; EDT in summer, from the second Sunday of March to the
first Sunday of November". QuickJS's `Date` asks the C library (`getTimezoneOffset` in `quickjs.c`) for the local
offset of each instant, so once `TZ` is set, `getHours()` is local and handles daylight saving time.

- **P4:** the zone is kept in NVS next to the network settings (namespace `agentcfg`, key `tz`), set with the
  console command `tz EST5EDT,M3.2.0,M11.1.0` or `tools/provision_agent.py --tz ...`, and applied at boot with
  `setenv("TZ", ...)` and `tzset()`. Without one the device runs on UTC.
- **Host:** the binary sets `TZ=UTC0` at start, so screenshots do not depend on the developer's zone; `-z ZONE`
  sets another.

### 2.5 A daylight-saving bug in QuickJS on ESP-IDF

newlib's `struct tm` has no `tm_gmtoff`, so an earlier port of QuickJS computes the offset on ESP-IDF as
`mktime(gmtime(t)) - mktime(localtime(t))`. `gmtime` sets `tm_isdst = 0`, and `mktime` then reads the UTC fields
as *standard* local time, so while daylight saving time is in effect the result is an hour off. A test program
(`scripts/tzoff.c` in this ticket) shows it with `TZ=EST5EDT,M3.2.0,M11.1.0`:

```text
1782907200  local 2026-07-01 08:00 isdst=1  mktime way  300  fields way  240     <- July: the mktime way says EST
1798545600  local 2026-12-29 07:00 isdst=0  mktime way  300  fields way  300
```

The fix computes the offset from the broken-down fields of `gmtime_r` and `localtime_r` (day of year, hour,
minute), with no `mktime`:

```c
struct tm g, l;
gmtime_r(&ti, &g); localtime_r(&ti, &l);
int days = l.tm_yday - g.tm_yday;
if (l.tm_year != g.tm_year) days = l.tm_year > g.tm_year ? 1 : -1;
res = -((days * 24 + l.tm_hour - g.tm_hour) * 60 + l.tm_min - g.tm_min);
```

### 2.6 `Date` in the prelude

```js
class VDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(wallOrBoot()); }
  static now() { return wallOrBoot(); }
}
wallOrBoot = () => clock.wall() ?? BOOT + now()
```

When the wall clock is unknown, `Date` keeps the old made-up time, so worlds that only format times keep working;
a world that must not act on a wrong date (the agenda) checks `clock.set()`. The status bar shows `--:--` while
the clock is unknown. Durations should use `now()`, which never jumps; `Date` jumps when SNTP sets the clock.

## 3. Notifications

The compositor already shows banners for crashes. A new message type lets any world ask for one:

```js
send("compositor", "notify", { text: "dentist at 14:30", sub: "in 15 minutes" })
```

| Rule | Why |
|---|---|
| The banner is prefixed with the sending world's name (`msg.from`) | A world cannot pretend to be another, or the system |
| Kernel messages and crash banners take precedence | Supervision information must not be hidden |
| At most 4 notifications wait; one per world | A runaway world cannot flood the screen |
| Shown for 8 s, then the next | A reminder is seen without blocking keys |
| Text clipped to 120 characters | Banners have three lines |

## 4. The todo file

### 4.1 Why a plain file

Tasks live in `notes/todo.txt`, the same folder as the agent's notes. The user can edit the file in the editor
(from Files, or with F6 in the agenda), and the agent can read it with `read_note` and change it with `save_note`
after approval, without any new tool. The file is the database; the agenda is a view of it.

### 4.2 Format

Markdown task lists, one task per line; anything else is kept as it is:

```text
# Todo
- [ ] dentist @2026-11-03 14:30 !15m
- [ ] call Anna @2026-11-02
- [x] charge the PicoCalc
- write the editor                      a plain list item is an open task without a date
Some free text the agenda leaves alone.
```

```text
task    := indent "- " ("[ ] " | "[x] " | "[X] ")? text
text    := words, with at most one due date and one reminder anywhere in it
due     := "@" YYYY "-" MM "-" DD (" " HH ":" MM)?
remind  := "!" N ("m" | "h" | "d")            how long before the due time; needs a time
```

Times are local to the device's time zone. A task with a time and no `!` is reminded at the time itself; a task
with only a date is not reminded.

### 4.3 Typing dates

When the user adds or edits a task, the agenda accepts short forms and writes the long form into the file:

| Typed | Written (today Sunday 2026-11-01) |
|---|---|
| `@today`, `@tod` | `@2026-11-01` |
| `@tomorrow`, `@tom` | `@2026-11-02` |
| `@mon` ... `@sun` | the next such day after today: `@tue` → `@2026-11-03` |
| `@+3d`, `@+2w` | three days, two weeks from today |
| `@11-15` | this year, or next year if it has passed |
| `@2026-12-24` | as is |
| a time after the date: `14:30`, `9`, `2pm`, `9:15am` | ` 14:30`, ` 09:00`, ` 14:00`, ` 09:15` |
| `!15m`, `!2h`, `!1d` | as is |

### 4.4 Reading and writing without losing edits

The editor or the agent may change the file while the agenda shows it. So the agenda never writes from memory:

```text
change(task, edit):
  text = await file.read()                       the current file
  lines = text.split("\n")
  i = index of the line equal to task.line (the exact text the agenda showed)
  if none: reload, note "todo.txt changed; reloaded"; return
  lines[i] = edit(lines[i])  (or remove it, or append a new line)
  await file.write(lines.join("\n"))
  reload
```

The agenda re-reads the file when it comes to the front and after every write.

## 5. Reminders

```text
every 15 s (the agenda world runs in the background):
  if !clock.set(): return
  t = clock.wall()
  for each open task with a due time:
    at = due - lead
    key = at + "|" + title
    if at <= t and t - at < 2 h and key not in fired:
      notify("<title> at HH:MM" or "<title> now"); fired.add(key)
  keep fired (at most 200 keys, those younger than 2 days) in the store
```

- A reminder that came due while the device was off fires once at the next start if it is less than two hours
  old, marked "(missed)".
- Reminders wait while the clock is unknown; nothing fires on the made-up boot time.
- The file is re-read every few minutes in the background, so a task the agent added is reminded even if the user
  never opened the agenda.

## 6. The agenda screen

```text
┌ Agenda ─────────────────────── 82% 14:02 ┐
│ OVERDUE                                   │
│ · 09:00  standup                   Sat 31 │
│ TODAY · SUNDAY 1 NOVEMBER                 │
│ ·        buy milk                         │
│ · 14:30  dentist                  !15m    │
│ TOMORROW · MON 2 NOV                      │
│ ·        call Anna                        │
│ NO DATE                                   │
│ · charge the PicoCalc                     │
│ ✓ write the editor                        │
│ EST5EDT · 5 open · 1 done                 │
└ ⏎ done F2 new F3 edit F4 done F5 del F6 ed┘
```

- Headers are rows that the cursor skips. Within a day, tasks without a time come first, then by time; undated
  tasks keep the file's order.
- **Enter** toggles done; **F2** new task (a prompt; the status line shows the syntax); **F3** edit; **F4** shows or
  hides done tasks; **F5** deletes after a second F5; **F6** opens `todo.txt` in the editor, narrowing the notes
  handle to that file as Files does.
- Without a clock, the headers are absolute dates and there is no "overdue" or "today".

## 7. Implementation plan

| Step | Work | Check |
|---|---|---|
| A1 | `port_wall_ms` (host with `-w`, `-z`, `TZ=UTC0` by default; P4 with SNTP and a `tz` setting, console `tz`; PaperS3 stub); `clock.wall` and `clock.zone` ops; prelude `clock` and `Date`; the quickjs.c DST fix; compositor status bar | native test with `-w unset`, `-w`, `-z` |
| A2 | Compositor `notify`: queue, sender name, limits | a unit test of the compositor's handler |
| A3 | `js/apps/agenda.js` model: parse and write lines, date expressions, grouping | `tests/agenda.test.mjs` |
| A4 | The app: file I/O with re-read, keys, reminders, editor open; manifest (`fs:/notes`), launcher (`t`) | tests + `scripts/agenda.txt` captures, including a reminder banner |
| A5 | Device: set the zone, check the status bar after SNTP, a reminder two minutes ahead, reboot; `provision_agent.py --tz` | P4 captures |
| A6 | Diary, report, upload | — |

## 8. Tests

- **Native (host binary):** `clock.set()` is false with `-w unset` and the status bar shows `--:--`; with
  `-w 2026-07-01T12:00 -z EST5EDT,M3.2.0,M11.1.0`, `new Date().getHours()` is 12 and `getTimezoneOffset()` is 240.
- **Unit (`tests/agenda.test.mjs`):** line parsing and writing round-trips; every date expression on a fixed
  "today", including month and year ends; grouping and order; reminders firing once, missed reminders, nothing
  without a clock; edits applied to the current file contents and refused when the line is gone.
- **Compositor:** a notification is shown with the sender's name, queued behind a crash banner, and limited per
  world.
- **Host script:** the agenda with seed tasks, a new task, a reminder banner over another app.
- **Device:** the zone and SNTP time on the status bar; a reminder two minutes ahead.

## 9. API reference

```js
clock.wall()      -> epoch ms | null     // null until the time is known
clock.set()       -> boolean
clock.zone()      -> "UTC0" | "EST5EDT,M3.2.0,M11.1.0" | ...
new Date(), Date.now()                   // the wall clock when set, else the old fixed boot time
send("compositor", "notify", { text, sub? })

// agenda.js, internal
agParse(line)                -> null | { done, title, date: "YYYY-MM-DD" | null, time: "HH:MM" | null, lead: minutes | null }
agFormat(task)               -> "- [ ] title @YYYY-MM-DD HH:MM !15m"
agExpand(input, today)       -> the input with short date forms written out, or an error
agGroups(tasks, today)       -> [{ header, items }]
agDue(task)                  -> epoch ms of due - lead, in the device's zone
```

## 10. File reference

| File | Role |
|---|---|
| `picocalc-os/nucleus/nucleus.h`, `nucleus/vm.c` | `port_wall_ms`, `port_tz`; ops `clock.wall`, `clock.zone` |
| `picocalc-os/host/port_host.c`, `host/main_host.c` | host wall clock, `-w`, `-z`, `TZ=UTC0` |
| `picocalc-os/port/esp32p4/main/port_p4.c`, `main_p4.c`, `agent_p4.c` | wall clock from SNTP, the `tz` setting and console command |
| `picocalc-os/port/papers3/...` | stub |
| `picocalc-os/third_party/quickjs/quickjs.c` | `getTimezoneOffset` on ESP-IDF |
| `picocalc-os/js/prelude.js` | `clock`, `Date` |
| `picocalc-os/js/system/compositor.js` | status-bar clock, `notify` |
| `picocalc-os/js/apps/agenda.js` | new: the agenda |
| `picocalc-os/js/system.json`, `js/apps/launcher.js` | the `agenda` world (claim `fs:/notes`), key `t` |
| `picocalc-os/tools/provision_agent.py` | `--tz` |
| `picocalc-os/tests/agenda.test.mjs`, `tests/test_clock_native.py`, `scripts/agenda.txt` | tests and captures |

## 11. As built and measured

Commits: `0470bed` (A1–A2), `dc0dfa8` (A3–A4), `a5c90cf` (A5).

### Differences from the plan

| Topic | Planned | Built |
|---|---|---|
| Time-zone storage on the P4 | next to the network settings | NVS namespace `settings`, key `tz`: `net forget` erases the network namespace and must not take the zone with it |
| Provisioning | `--tz` | `--tz ZONE` or `--tz host` (the POSIX footer of `/etc/localtime`), and `--skip-token` to change settings without the API key |
| Date input | as in 4.3 | as in 4.3; a word after the date that looks like a time but is not one (`25:00`, `19am`) is an error, not part of the title |
| Grouping | — | regrouped when the date changes or the clock becomes set; a date in another year shows the year |
| Tests | as in section 8 | `make test-clock` (4), `tests/agenda.test.mjs` (9, in `make test-apps`), a notify test in `compositor-auth.test.mjs`, `scripts/agenda.txt` (captures 70–74) |

### Measured on the device (ESP32-P4)

| What | Result |
|---|---|
| Status bar before SNTP | `--:--` |
| After SNTP, no zone | 04:16 (UTC) |
| After `tz EST5EDT,M3.2.0,M11.1.0` | 00:17 |
| `getTimezoneOffset()` in July / December / now | 240 / 300 / 240 (`GMT-0400`) |
| A task at 00:20 with `!1m` | banner "agenda: pick up parcel at 00:20 / in 1m" at about 00:19:10, over the calculator |
| After a software reboot | the time is kept (`clock=set` with Wi-Fi down); the reminder did not fire again |
| PaperS3 build | compiles with the `port_wall_ms` stub |
