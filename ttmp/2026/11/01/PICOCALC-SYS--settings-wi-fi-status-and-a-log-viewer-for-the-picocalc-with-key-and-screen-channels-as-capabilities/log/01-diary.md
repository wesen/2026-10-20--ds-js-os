---
Title: Diary
Ticket: PICOCALC-SYS
Status: active
Topics:
    - picocalc
    - settings
    - security
    - ui
DocType: log
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/kernel.c
      Note: guarded channels, the log ring
    - Path: repo://picocalc-os/nucleus/vm.c
      Note: sys.log, net.*, clock.setzone
    - Path: repo://picocalc-os/host/net_host.c
      Note: the simulated Wi-Fi station
    - Path: repo://picocalc-os/port/esp32p4/main/agent_p4.c
      Note: scan, join and info on the network worker
    - Path: repo://picocalc-os/port/esp32p4/main/port_p4.c
      Note: the log lock and the ESP-IDF log hook
    - Path: repo://picocalc-os/js/apps/settings.js
      Note: Settings
    - Path: repo://picocalc-os/js/apps/logs.js
      Note: Logs
    - Path: repo://picocalc-os/js/apps/launcher.js
      Note: row scrolling
    - Path: repo://picocalc-os/tests/test_sys_native.py
      Note: channels, ring, network and zone through the host binary
    - Path: repo://picocalc-os/tests/sysapps.test.mjs
      Note: Settings, Logs and launcher in Node
ExternalSources: []
Summary: 'Chronological record of PICOCALC-SYS: key and screen channels as capabilities, a kernel log ring, Wi-Fi status, scan and join and the time zone as kernel ops, and the Settings and Logs apps; host and ESP32-P4.'
LastUpdated: 2026-11-01T01:05:00-04:00
WhatFor: Following how the system apps came to picocalc-os and why each decision was made.
WhenToUse: When resuming the ticket or reviewing one of its commits.
---

# Diary

## Goal

The fifth ticket of the series: the "System and Development" tools. Settings for Wi-Fi and the provider on the
device, the Wi-Fi status, a log viewer. The app loader from storage is split into its own ticket, PICOCALC-LOADER.

## Step 1: Research and the guide

Typing a Wi-Fi password on the device raised a question the earlier tickets had left open: who else sees the
keys? Reading `kernel_publish` (`nucleus/kernel.c:181`) answered it: every world whose own JavaScript declares
`.needs("keys")` receives every keystroke, and `.needs("frames")` gives every app's rendered screen. The compositor
only checks that `keys` come from the world named `keyboard`, with a comment saying channel subscriptions are not
capabilities yet. So the ticket starts by making them capabilities.

The rest of the research was the P4's network code (`agent_p4.c`): one worker task with notify bits, NVS
credentials under `agentcfg`, `wifi_apply`, five reconnect attempts, SNTP. Scanning is new; joining is
`net ssid` + `net password` + `net connect` from a different source.

### Prompt Context

**User prompt (verbatim):** the ticket series prompt is recorded verbatim in the PICOCALC-FS diary, Step 1
("Alright do all --- ... 000 System and Development. Create a new docmgr ticket per chunk that makes sense ...").
This is the fifth ticket of the series.

**Assistant interpretation:** Settings (Wi-Fi, provider, time zone), Wi-Fi status and a log viewer on the device;
the guide first, uploaded; then code, diary and report. The app loader is its own ticket.

**Inferred user intent:** Run the PicoCalc without a laptop: join a network, see what the device is doing.

**Commit (docs):** the guide was uploaded before implementation (reMarkable, `/ai/2026/11/01/PICOCALC-SYS`,
"PICOCALC-SYS System Apps Guide").

### What I did

- Read `kernel.c` (`kernel_publish`, `klog`, `boot_world`, the crash path), `vm.c` (`read_meta`, `op_publish`, the
  op table), `vm_mqjs.c` (the PaperS3 engine's `op_publish`), both manifests, the compositor's key and focus code,
  the launcher, `agent_p4.c`, `store_p4.c` and the host's `agent_host.c`.
- Wrote the guide: guarded channels, the log ring and its lock, the network ops and claims, the secret handling,
  the port interface, the P4 worker changes, the host simulation, the two apps, the launcher, the plan S1–S6.

### Why

- **The provider stays serial-only.** The key cannot be typed sensibly, and an endpoint set from the device could
  send the key to another server. The model is already chosen in the chat with `/model`; a second place would
  conflict with it. Settings shows the provider read-only.
- **A new claim for the log.** `sys.read` is held by the agent, which sends what it reads to a provider.

### What worked

- Every piece needed for joining existed on the worker; only scanning and the info record are new.

### What didn't work

- Nothing at this stage.

### What I learned

- `frames` is published by the kernel itself (`kernel_publish(W, "frames", ...)` after rendering), not through
  `op_publish`, so for frames only the receiving side can be checked.

### What was tricky to build

- Where to enforce the channel rule so that both engines get it: `boot_world` in `kernel.c` runs after either
  engine's `vm_create` has read the world's `needs` and `provides`.

### What warrants a second pair of eyes

- Section 3.3 of the guide, the path of the password.

### What should be done in the future

- Nothing beyond the plan.

### Code review instructions

- Guide sections 1 and 3.

### Technical details

- The guide: `design-doc/01-system-apps-analysis-design-and-implementation-guide.md`.

## Step 2: Guarded channels (S1)

A table in the kernel names three guarded channels and their claims: `keys` → `keys.raw`, `frames` →
`frames.read`, `touch` → `touch.raw`. A world that needs or provides one without the claim fails to start, with a
message that names the claim; `kernel_publish` and both engines' `op_publish` check again. The keyboard, compositor
and Keys app got `keys.raw`, the compositor `frames.read`; on the PaperS3 the touch driver, compositor and Touches
app got `touch.raw`. Trace lines for `key` and `keys` no longer print their payload.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Close the keystroke-listening hole before a password can be typed.

**Inferred user intent:** A password typed on the device reaches only the app it is typed into.

**Commit (code):** `a8b4989` — "keys, frames and touch are guarded channels; a world needs a claim to hear or
provide them (PICOCALC-SYS S1)"

### What I did

- `channel_claim`, `world_may_use`, `channels_allowed` in `kernel.c`; the check in `boot_world`, `kernel_publish`,
  `op_publish` (`vm.c`, `vm_mqjs.c`); manifests; the trace redaction; `tests/test_sys_native.py` (four tests) and a
  `test-sys` target.

### Why

- Failing the start, rather than silently dropping the subscription, puts the missing claim in a crash banner.
- Providers need the claim too, so no world can forge keystrokes; the compositor's sender check stays as a second
  line.

### What worked

- `make test-sys`: 4 tests OK. `make shots` and `make BOARD=papers3 shots`: no world lost a channel (no "takes the
  claim" in any log). Three System screenshots changed because they list the compositor's claims.

### What didn't work

- My first frames test expected a frame from an app with only a screen; the boot segment does not render, so it
  never published one:

```text
AssertionError: 'TEST frame app' not found in '[     0.000] booting 3 worlds ... peek crashed: the channel "frames" ...
```

  The app now ticks every 300 ms, and the listeners come first in the manifest.

### What I learned

- Worlds boot in manifest order; a listener later in the manifest misses publications made during earlier worlds'
  first turns.

### What was tricky to build

- Nothing.

### What warrants a second pair of eyes

- `channels_allowed` runs before `W->status = W_IDLE`; the crash path then treats it as a failed start, like a
  syntax error, and supervision stops the world after repeated failures.

### What should be done in the future

- Channel names other than the three are still open to any world; a world that publishes something private should
  use `send` to a named world.

### Code review instructions

- `nucleus/kernel.c`: `GUARDED` and `boot_world`; `tests/test_sys_native.py`, `ChannelTests`.

### Technical details

- `make test-sys`.

## Step 3: The log ring (S2)

`klog` printed to the serial port and nowhere else. The kernel now keeps the last 256 lines of at most 120 bytes,
numbered from 1; `sys.log(after)` returns up to 64 lines after a number, with the oldest number still kept, so a
reader sees what it missed. On the P4 an `esp_log_set_vprintf` hook adds ESP-IDF's lines as well, from whatever
task logs them, so the ring sits behind a port lock: a `portMUX` critical section on the ESP32 boards, nothing on
the host.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** A log viewer needs the device to keep its log.

**Inferred user intent:** See on the PicoCalc what it printed, without a laptop on the serial port.

**Commit (code):** `7961ced` — "a kernel log ring of the last 256 lines, read with sys.log (claim sys.log)"

### What I did

- `kernel_log_init`, `kernel_log_add` (strips colour codes, newlines; cuts on a UTF-8 boundary),
  `kernel_log_json`; `klog` adds each line; op `sys.log`; `sys.log` in the prelude.
- `port_log_lock`/`unlock` on host, P4 and S3; `p4_log_init` in `port_p4.c`, called first in `app_main`.
- Three tests: reading, paging and loss after wrapping, the claim.

### Why

- A critical section, not a spin flag: the `fs` worker (priority 4) shares core 1 with the kernel (priority 5); if
  the kernel preempted the worker while it held a flag, the kernel would spin forever.
- The hook passes `port_clock()`-based time, not `kernel_now()`, which reads kernel state without a lock.

### What worked

- 7 tests OK; the P4 firmware built (`Project build complete`).

### What didn't work

- My first truncation compared `text[n]` with the output index, which drifts once colour codes are skipped. I
  rewrote it to look at the next unread input byte before writing any test.

### What I learned

- `kernel_init` runs on the kernel task, after `app_main` has already logged the store and file system; the ring is
  therefore created by `p4_log_init` in `app_main` (`kernel_log_init` is idempotent).

### What was tricky to build

- Lines that arrive before the kernel's clock starts: the hook stamps them 0 rather than starting `port_clock()`
  itself, which would move the kernel's time origin.

### What warrants a second pair of eyes

- `kernel_log_json` copies up to 64 entries (9 KB) inside the critical section. That is about 100 µs from PSRAM;
  acceptable, but it is the longest time interrupts are off in this code.

### What should be done in the future

- `printf` output (the console's replies) does not reach the ring.

### Code review instructions

- `nucleus/kernel.c`, the log ring section; `port/esp32p4/main/port_p4.c`, the end.

### Technical details

- A screenshot changed by one digit: worlds' memory grew with the prelude.

## Step 4: Network administration and the zone (S3)

Four ops for Settings: `net.info` (claim `net.admin` or `sys.read`), `net.scan`/`net.scanresult` and `net.join`
(claim `net.admin`), and `clock.setzone` (claim `sys.clock`). The SSID, password and zone are validated in
`util.c`, shared by the ops and the ports. The op copies nothing it does not need: the password goes to the port
once and the op wipes its own copy with `secret_wipe`.

On the P4, scans and joins run on the existing network worker under two new notify bits. The scan starts the
station if necessary and waits for `WIFI_EVENT_SCAN_DONE` (not a blocking scan, which would stall the event task),
keeps one entry per name, strongest first. A join writes NVS with a new `config_write` that does not touch the
kernel task's `cfg_api`/`cfg_model`, wipes the slot, and calls `wifi_apply`. The events now also record the IP
address and a link state, and a give-up names the disconnect reason ("wrong password?", "network not found").

The host simulates three networks on the virtual clock, so the tests and screenshots are reproducible.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** The native half of Settings.

**Inferred user intent:** Join a network from the device.

**Commit (code):** `5c5c386` — "Wi-Fi status, scan and join, and the time zone, as kernel ops for Settings"

### What I did

- `nucleus/util.c`: `net_ssid_ok`, `net_password_ok`, `tz_valid`, `secret_wipe`; ops in `vm.c`; `net` and
  `clock.setZone` in the prelude.
- `host/net_host.c` (new); `agent_p4.c`: `link_info`, `scan`, `join_slot`, `scan_run`, `join_run`,
  `port_net_*`, an RSSI refresh every 10 s on the worker; `store_p4.c`: `port_tz_set`, used by the console `tz`.
- Four tests: scan, join wrong and right, an open network, all info keys; validation; claims; the zone.

### Why

- `refresh_configured` writes `cfg_api` and `cfg_model`, which the kernel task reads without a lock; the worker
  must not call it. `refresh_ready` updates only the atomic `configured`.
- The SSID and IP in `info` come from a RAM copy, not NVS, because Settings polls it every second.

### What worked

- 11 tests OK on the first run; the tests check that neither password appears in the UART log. The P4 firmware
  built cleanly.

### What didn't work

- `tzset` undeclared in `net_host.c` (a warning, `-Wimplicit-function-declaration`); added `<time.h>`.

### What I learned

- The P4's existing disconnect handler is reached by `wifi_apply`'s own `esp_wifi_disconnect` when switching
  networks; with a link state that now shows briefly as "failed" before "connecting".

### What was tricky to build

- Keeping the lock order trivial: everything new uses the one existing mutex, never nested.

### What warrants a second pair of eyes

- `scan_run` when the station is connecting: the IDF may refuse the scan (`ESP_ERR_WIFI_STATE`); the result is then
  `{"error": ...}` and the app says so, without retrying.
- The `#ifndef PICOCALC_AGENT_WIFI` stubs were not compiled in this step.

### What should be done in the future

- Forgetting a network from the device; hidden networks.

### Code review instructions

- `nucleus/vm.c` `op_net_join`; `port/esp32p4/main/agent_p4.c` `join_run`, `scan_run`, `port_net_join`.

### Technical details

- `make test-sys`.

## Step 5: The Settings and Logs apps, and the launcher (S4, S5)

Settings has a menu (Wi-Fi, time zone, provider), a Wi-Fi page that scans on the way in, a password page that draws
dots, a zone list with UTC offsets, and a read-only provider page. Logs reads the ring while in front, marks lost
lines, filters (all, problems, kernel, ESP-IDF), and holds still when scrolled back. The launcher shows three rows
of four and scrolls by rows; thirteen apps now.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** The apps on top of S1–S3.

**Inferred user intent:** Use them on the device.

**Commit (code):** `fe411b0` — "a Settings app: Wi-Fi state, scan and join, the time zone, the provider (S4)";
`c095d0c` — "a Logs app, and a launcher that scrolls by rows past twelve apps (S5)"

### What I did

- `js/apps/settings.js`, `js/apps/logs.js`, the launcher's `reveal` and title row; manifest entries (`settings`:
  `net.admin`, `sys.clock`; `logs`: `sys.log`); `scripts/settings.txt`, `scripts/logs.txt`;
  `tests/sysapps.test.mjs` (8 tests) in `make test-apps`.

### Why

- The password field takes characters only on `down`: the keyboard also sends `hold` for a long press, which the
  agenda accepts, but a doubled character in a password is invisible behind the dots.
- The field is cleared on Esc, after the join, and on blur.

### What worked

- All suites: `test-apps` (10 + 13 + 9 + 8), `test-sys` 11, `test-clock` 4, `test-fs` 9, `test-agent` (23 native,
  7 skipped live ones). `make shots` writes 80–86 and 90–93.

### What didn't work

- The first captures showed `?` for `▪` and `▮`: the font has `█ ░ • ▲ ▼ ✓` but not those, nor `ã` ("São Paulo").
  Signal bars are now `████`/`██░░`, and the zone is "Sao Paulo".
- The status line floated mid-screen: `text` ignores `grow` in `measure`; an empty `ui.col({ grow: 1 })` is the
  spacer.
- The zone list's right column showed `AEST-10AEDT`; it now shows `UTC+10 DST`, computed from the rule.
- Two test mistakes of mine: six backspaces leave "correct", not "correct "; and a Logs test built a UTC timestamp
  where Node uses the machine's zone.

### What I learned

- `list` scrolls itself to keep the selection visible; `lines` with `bottom: true` counts `scroll` in wrapped rows
  from the bottom, which is why the Logs view freezes the line set instead of adjusting the offset.

### What was tricky to build

- Holding the Logs view still: new lines would shift a bottom-anchored view, so while scrolled back it shows lines
  up to the number it had when scrolling began.

### What warrants a second pair of eyes

- `stInfo` decides a join's outcome by matching the SSID in `info`; joining the same network twice in a row reports
  the first state it sees.

### What should be done in the future

- Settings could show the device's free storage and memory; About covers part of it.

### Code review instructions

- `js/apps/settings.js` `stKey`; `tests/sysapps.test.mjs`.

### Technical details

- Captures: `out/80-settings.png` … `out/86-settings-provider.png`, `out/90-home-row4.png` … `out/93-logs-held.png`.

## Step 6: On the ESP32-P4 (S6)

The firmware with all five steps booted 21 worlds with no crash and no world refused a channel; `worlds` shows the
new claims (`keyboard: i2c0:0x1f keys.raw`, `compositor: dma keys.raw frames.read`, `settings: net.admin
sys.clock`, `logs: sys.log`). Settings scanned over ESP-Hosted, joined our own network with a wrong password on
purpose, and reported the failure; the provisioning tool then put the real password back from NetworkManager
without printing it. The zone page moved the device to Chicago and back to New York, saved both times. Logs showed
the kernel's and ESP-IDF's lines, including the six connection attempts of the failed join.

Two problems came up: Settings dropped the failing join after 20 s while the station was still retrying, and
`p4cap` could not decode a screenshot.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Check the apps where they matter, on the device, without exposing the Wi-Fi password.

**Inferred user intent:** Working settings on the real PicoCalc.

**Commit (code):** `cdbdabb` — "Settings follows a join until the station is up or gives up; p4cap decodes split
shot lines (S6)"

### What I did

- `p4cap --no-reset -c "0.2 hold"`, then `idf.py -B build-agent ... -p /dev/ttyACM0 build flash` (twice: before and
  after the fix).
- `net status`, `worlds`: Wi-Fi up, clock set, all 21 worlds idle or waiting.
- Settings → Wi-Fi: the scan filled the screen (ten rows and a scroll bar), strongest first, ours in the accent colour, signal bars from
  `█`/`░`. (The captures show neighbours' network names, so they stay out of the report.)
- Chose our network, typed `notthepassword` with the console's `type`: the field showed 14 dots. ⏎:
  `state=Wi-Fi reconnecting`, then after about 20 s `Wi-Fi gave up: wrong password? (reason 205)`.
- `tools/provision_agent.py --wifi-from-nm yolobolo --skip-token`: "ssid saved", "password saved", "connect
  queued"; 6 s later `wifi=up`.
- Logs: `1.9s booting 21 worlds from js/system.json`, `I (8453) esp_netif_handlers: sta ip: 192.168.0.88 ...`,
  `00:50:01 I (36025) rpc_req: Scan start Req`, and six `H_API: esp_wifi_remote_connect` lines from 00:50:49 to
  00:51:09.
- Zone: Chicago → status bar 23:58 (New York was 00:58 EDT), console `tz: CST6CDT,M3.2.0,M11.1.0`; New York →
  `tz: EST5EDT,M3.2.0,M11.1.0`.
- Keys: typed `ok`; the Keys app listed the down and up events. `stats`: 0 crashes, lane busy 13.0 %.

### Why

- The failure test used our own network so as not to try passwords on anyone else's; the real password then came
  back from the laptop's NetworkManager, which the provisioning tool reads with `nmcli -s` and never prints.

### What worked

- Scan, join, failure reasons, zone, the log ring with ESP-IDF's lines, and the channel claims, on the first
  flash.

### What didn't work

- **The join's time limit.** With a wrong password the C6 reported reason 205 (`CONNECTION_FAIL`, not
  `AUTH_FAIL`), after six attempts over about 20 s. Settings had given up on the join at 20 s and showed "Still
  trying yolobolo…" under a state row that already said the station had given up. Now a join is followed for up to
  90 s, with "Still trying" after 20, and the test covers it.
- **Screenshots.** `p4cap` raised:

```text
binascii.Error: Invalid base64-encoded string: number of data characters (61) cannot be 1 more than a multiple of 4
```

  I first assumed a log line had split a base64 line and changed `p4cap` to join fragments before decoding. The
  next capture said `BAD: 0 px`; dumping the raw stream showed the real cause: no `#END` line at all. The screen
  with the full network list run-length encodes poorly and takes more than 5 s at 115200 baud, so a 5 s capture window cut
  it off. Captures of busy screens now use `-s 12` or more. The fragment joining stays, as it is right for the
  split-line case too.
- **A lost capture.** The device capture of the password field was in a scratch folder that a later `rm -f` emptied
  before the safety check started refusing such removals; the host capture `82-settings-password.png` shows the
  same page.

### What I learned

- Over ESP-Hosted the wrong-password case surfaces as reason 205; "wrong password?" keeps its question mark.
- `kernel_now()`-stamped lines before SNTP show as seconds since boot; after it, the same app shows wall times, so a
  log read later still lines up with the status bar.

### What was tricky to build

- Testing a password path without ever handling the real password: the wrong one was typed, the real one went
  from NetworkManager to the device through the provisioning tool.

### What warrants a second pair of eyes

- `disconnect_reason` maps 2, 15, 202, 204 and 205 to "wrong password?"; 205 also covers other connection failures.

### What should be done in the future

- Joining with the real password typed on the device by the user, as a final check of the whole path.

### Code review instructions

- `js/apps/settings.js` `stInfo`; `tools/p4cap.py` shot parsing.

### Technical details

- Captures in the ticket: `captures/p4-02-logs-wifi-retries.png`, `p4-03-zone-chicago.png`, `p4-04-keys-raw.png`,
  and the host's `82`, `84`, `85`, `90`, `91`.

## Step 7: Documentation and delivery

The guide got a section 9, "As built and measured": the differences from the design, the tests, the device results
and the commits. The P4 firmware without Wi-Fi (`idf.py -B build build`) was built to compile the stubs that Step 4
left unchecked: `Project build complete`; so did the PaperS3 firmware, whose port gained the log lock. The guide and this diary went to the reMarkable as one bundle, and the
report went to the vault.

### Prompt Context

**User prompt (verbatim):** (see Step 1)

**Assistant interpretation:** Close the ticket the way the earlier four were closed.

**Inferred user intent:** A record a reader can follow later.

**Commit (docs):** this step's commit.

### What I did

- `remarquee upload bundle ... --name "PICOCALC-SYS Guide as built and Diary"` → `OK: uploaded ... ->
  /ai/2026/11/01/PICOCALC-SYS`.
- Vault: `Projects/2026/11/01/PROJ - picocalc-os - PICOCALC-SYS - Settings, Logs and Key Channels as
  Capabilities.md` with five images in `_assets/` (host captures, and the P4's Logs and zone; the scan captures show
  neighbours' network names and stay out).

### What warrants a second pair of eyes

- Nothing new.

### Code review instructions

- Guide section 9.
