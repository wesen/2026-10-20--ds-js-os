---
Title: Device qualification diary for semantic Snake
Ticket: PICOCALC-SNAKE-INTEGRATION
Status: active
Topics:
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/20/PICOCALC-SNAKE-INTEGRATION--ship-semantic-snake-snapshots-and-changed-cell-painting-on-the-picocalc/scripts/device/02-build-snake.sh
      Note: Offline normal firmware and matched build reproduction
    - Path: repo://ttmp/2026/11/20/PICOCALC-SNAKE-INTEGRATION--ship-semantic-snake-snapshots-and-changed-cell-painting-on-the-picocalc/various/device/opus-provenance.json
      Note: External model provenance before empirical interpretation
ExternalSources: []
Summary: ""
LastUpdated: 0001-01-01T00:00:00Z
WhatFor: ""
WhenToUse: ""
---

# Device qualification diary for semantic Snake

## Step 1 — Establish the physical comparator and its clocks

The first job was to identify the existing playable image. The previous installation receipt names revision `ef0ff950` and app SHA-256 `f12e2f5d6e668ef7d61fa456b69b56bf9f1e976e929672e7df81ac33a2f03f83`. The physical app and partition-table digests matched those local artifacts. The normal launcher, Snake, compositor and panel driver remain in the workload.

### Prompt context

See [the director's verbatim requests](01-director-implementation-and-integration-diary.md). I took responsibility for the physical build, baseline and candidate qualification. The user asked for an independent Opus High researcher, a detailed diary, and a newcomer-facing technical article. I commissioned an abstract measurement design and kept source, console output and measurements local.

### What I did

- Read the prior playable build and restore recipe, the earlier Snake renderer experiment, and the kernel's world, console, framebuffer capture and SPI accounting paths.
- Created a serial test guarded by the same file lock as earlier PicoCalc work. It verifies the app partition, uses standard launcher keys, measures six short active games, and takes CRC-verified screenshots in a separate parity pass.
- Kept cumulative world CPU and SPI bus accounting separate. `shot` copies the committed framebuffer from `K.bufs.front`, with no optical observation of the LCD. Its CRC checks the UART reconstruction. The comparison ignores the 22-pixel top status strip for game-state captures.
- Scoped the Opus commission to a source-free description and requested no tools, no MCP configuration and no session persistence. The first `--model opus --effort high` attempt resolved to `claude-opus-5-5` in Claude Code 2.1.328. The service returned `[reasoning_extraction]` and no report after a brief that requested a diary. I commissioned a public-facing measurement protocol and qualification log template as ordinary deliverables.

### What needed correction

The serial bridge can restart the board at port open. The first console version tried to qualify worlds while the system was starting. A subsequent run timed out on `hold` because its command had been sent before the UART console task could receive it. I set the serial control lines before open and drain boot output for 13 seconds before issuing commands. The next run exposed a separate check error. `restart snake` leaves `last_error: "restarted by an administrator"` after the app is healthy. The verifier permits that exact diagnostic for a world only after it has issued the restart itself and treats any later unexpected restart or fault as a failure.

### What I learned

In the preflight active-game windows, opening the app and immediately pressing `p` could race delivery of the focus messages. Five windows had 167–175 ms of Snake CPU and one had 581 ms, while the acknowledged key sequence was identical. The final recipe waits 300 ms for the launcher handoff, then enables autopilot and starts the 2.5-second interval. I kept the preflight separate and used the revised recipe on both arms.

### Review instructions

Start at [the physical runner](../scripts/device/01-normal-snake.py). Read its distinct phases for counter collection, stable framebuffer captures, and System smoke coverage. The old and new firmware use the same normal SPI2 driver.

## Step 2 — Build native candidates and add temporary measurement hooks

The final firmware comes from the committed source and an isolated archive of `cji/` and `picocalc-os/`. The two temporary images add identical timing hooks to the base and candidate. These hooks collect counts and sums in RAM between two console commands, with no per-frame UART text. The ordinary candidate contains no observer.

### What I did

- Enabled the peripheral drivers and the existing offline playable options for native Agenda, Files, Editor and Chess and for the development compiler. Built the two Snake and compositor sources as CJI native world modules, and recorded their source and module hashes.
- Added three clocks around the CJI Snake screen callback and JSON serialization. The native screen call carries those elapsed values to the observer in the private measurement image. For compositor draws, Snake-frame delivery and display flush completion, the observer uses existing kernel dispatch and turn boundaries. Physical SPI2 counters come from the ordinary driver path.
- Kept the temporary observation source out of the production source tree. The profiling fixture uses the same uninstrumented display driver and the same keyboard and launcher path.

### What needed correction

The local generated `sdkconfig.agent-elf` is an input of the normal playable recipe and is not tracked in the source archive. The initial `cp` from the archive failed with `cannot stat .../tree/picocalc-os/port/esp32p4/sdkconfig.agent-elf`. The builder now uses the same original checkout configuration as the normal recipe. The first native compositor compilation failed with `cji: error: Cannot read properties of null (reading 'includes')`. The director traced that to the typed-array `fill` colliding with dynamic framebuffer dispatch, changed the admission scratch to a bitset, and recompiled the native compositor.

The first incremental retry overlapped the earlier ESP-IDF job's development-compiler prerequisite. Both jobs used the same `stage1.slir.tmp`, and the retry reported `mv: cannot stat 'build/rv32/stage1/stage1.slir.tmp': No such file or directory`. I waited for both same-tree builds to exit and restarted from the committed revision. The separate profiling builds each use their own tree.

### What warrants a second pair of eyes

The three producer clocks increase the dispatch cost in both profiling images. The normal-arm world CPU counters have no such hooks. Also `displayFlushTurn` includes waiting across kernel and bus activity, while `display.cpu_ms` charges scheduled lane work and `spi2.busyMs` measures time occupied by bus transactions. These values overlap and should not be added as if they were three consecutive intervals.

### Review instructions

Read [the native build recipe](../scripts/device/02-build-snake.sh) and [the isolated observer staging script](../scripts/device/03-stage-observer.py). Firmware layout, source hash and module identity belong to the build receipts. Graphics parity belongs to the CRC-checked capture and exact RGB565 comparisons.

## Step 3 — Preserve the keyboard fault and stage a matched substitute

The corrected timed preflight exposed a second input issue. The PicoCalc's STM32 stopped acknowledging on the I2C bus. The serial console still acknowledged `key` immediately because the acknowledgement reports scheduling. Since the keyboard driver could no longer get its status register, those events did not reach Snake. The CRC-valid frame was the launcher and the qualification rejected the sequence.

### What I did

- Checked the bus logs for repeated `i2c_master_multi_buffer_transmit(1207): I2C transaction failed` and `I2C transaction unexpected nack detected`.
- Restored the previous known UART line setup and added physical I2C readiness and within-window error checks. The source already documents dependence on a full system power cycle if resetting the ESP32-P4 interrupts an STM32 transaction. A read-only device probe continued to receive NACKs. The director requested a full power cycle from the physical operator.
- Prepared a matched fallback build on each renderer. One temporary opt-in hook answers the keyboard status register using the existing injected-key queue. The FIFO, native keyboard publisher, keyboard sender check, normal launcher, Snake timer, compositor routes and SPI2 driver all keep running. The measurement receipts explicitly identify the input path.
- Verified that the normal firmware image is separate from these fixtures. Its source hashes match the workspace copies at the qualification revision, and its build attests both bundled native world images. [Build receipt](../various/device/production-build.json).

### What I learned

A CRC-valid screenshot by itself does not prove a test visited Snake. A serial acknowledgement confirms that scheduling accepted the operator command. The actual input witness is a resulting app frame or delivery through the driver route. The initial authenticated baseline contains a genuine GAME OVER and a growth screenshot. Its timing windows came from the earlier focus-race preflight and remain separate from the matched profiling comparison.

## Step 4 — Qualify the matched physical render comparison

Each temporary image completed six blocks on the ESP32-P4 with the keypad-status substitute active. The real driver and normal frame path ran in both. There were 26–27 distinct Snake publications per block.

### What worked

- The median per-post size fell from 551.44 bytes to 197.56. Screen construction fell from 1.529 ms to 0.146, JSON serialization from 3.131 ms to 1.014 and compositor draw dispatch from 18.612 ms to 7.773. All are medians of per-block means.
- The driver still transferred about 0.38 MB at the observation-window scale, with zero SPI2 errors and overlapping bus-byte ranges. The display flush turn measured 9.904 ms versus 10.398 ms. This kept the transport and lane CPU conclusions distinct.
- All five common app crops matched byte for byte. System drew its Worlds tab and returned through F1 with zero compositor restart delta and no new compositor or System error. The System check preserved the compositor's earlier intentional administrator-restart diagnostic.
- The shorter source-free Opus High commission succeeded in 15.6 seconds. The provider returned actual model `claude-opus-5-5`. I retained only the final protocol and sanitized provenance, and used its independent measurement endpoints. Its per-tick hardware and optical checks require different capture equipment, so I used the independent emulator per-tick comparison and committed-framebuffer checkpoints on the board. [Protocol](../various/device/opus-hardware-methods.txt) · [Provenance](../various/device/opus-provenance.json).

### Review instructions

[Physical summary](../various/device/profile-summary.json) records the block denominators and ranges. [The final candidate profile receipt](../various/device/profile-after.json) includes global world CPU, SPI2 counters and framebuffer digests. [Normal reproduction and interpretation](../analysis/02-snake-on-the-device.md) describe the difference between bytes sent and bytes painted.

## Step 5 — Install the ordinary playable build and verify read-back

After each temporary hardware image, the runner restored and verified the original app and partition table. I then flashed the ordinary candidate from commit `8715aaf`. Its 4,204,544-byte app read-back matched the artifact digest `c3d5d8ede739f5d4d21ad2b4981fbfd839cf20e2ab2a644ba1d330e6374446e3`. The unchanged partition table also verified. Startup accepted the expected native CJI Snake, compositor, keyboard and display files and the normal Typed compiled apps. I left that firmware installed. [Temporary restore witnesses](../various/device/temporary-restores.json) · [Final normal install](../various/device/production-installed.json).

The normal boot recorded 188 I2C0 transactions with 188 errors, and 66 SPI2 transactions with no errors. The keyboard world can remain resident and report a clear kernel `last_error` while its internal polling sees NACKs. I kept the normal installation qualification at boot and final digest verification. The matched physical profile pair supplies gameplay, timing and System evidence with the keypad-status substitute. The user's physical recovery step is a prerequisite for testing the final image with the real keypad controller.
