# PicoCalc OS: host build

A JavaScript operating system for a PicoCalc whose RP2040 has been replaced by an ESP32-P4, built here
for Linux against a simulated board, so it can run, be scripted and have its screen captured without
the hardware.

Every driver, the compositor and every app is a *world*: its own QuickJS runtime, heap limit and turn
budget. A small C nucleus runs them on a virtual clock, delivers their messages, hands out hardware as
*handles*, and supervises them. The keyboard, power and display drivers are JavaScript that talks to
the simulated STM32 and ST7365P register by register. The PNG captures come from the simulated panel's
memory, so they show what the glass would show.

```
make                      # build/picocalc-host
make shots                # run scripts/*.txt; captures go to out/
./build/picocalc-host -v scripts/tour.txt
./build/picocalc-host -   # read commands from stdin (handy for an agent driving it)
```

Needs gcc, zlib and nothing else. `make M32=1` builds a 32-bit binary, so worlds use the memory they
would on the ESP32-P4. `make SAN=1` builds with AddressSanitizer and UBSan. The three builds produce
identical pixels from the same script.

## Scripts

A script is a list of commands, one per line; `#` starts a comment.

| command | does |
|---|---|
| `wait MS` | run the system for MS virtual milliseconds |
| `key NAME [HOLD_MS]` | press and release a key: `enter`, `esc`, `up`, `f1`, `power`, `a`, … (held 300 ms or more, the STM32 also reports a hold) |
| `type TEXT` | type the text, a key every 90 ms |
| `capture [FILE [SCALE]]` | write the panel to `out/FILE` as a PNG (scale 2 by default) |
| `battery PCT [charging]` | set what the STM32 reports |
| `crash WORLD` | kill a world from outside |
| `stats` / `panel` | print the worlds, the lane and the buses / the panel controller's state |
| `print TEXT`, `quit` | |

Options: `-j DIR` (JS root, default `js`), `-m FILE` (manifest), `-o DIR` (captures, default `out`),
`-u FILE` (UART log, default `out/uart.log`), `-t MS` (run that long when there is no script),
`-v` (kernel log on stderr), `-vv` (and every message).

## What is in it

```
nucleus/            the C core (about 2,100 lines): kernel.c (lane, clock, messages, supervision), vm.c (one QuickJS
                    runtime per world, host calls, work counting), hw.c (handles, buses), gfx.c (fill, text, diff)
sim/                the board: st7365p.c (the panel controller and its memory), stm32kbd.c (keyboard, backlight,
                    battery at I2C 0x1F, after clockworkpi's firmware), board.c
host/main_host.c    the script runner and PNG capture
js/prelude.js       the API every world is written against (evaluated in each world first)
js/system.json      the manifest: which worlds run, their claims, budgets and heap limits
js/drivers/         keyboard.js, power.js, display.js
js/system/          compositor.js, sandbox.js, flaky.js
js/apps/            launcher, sysmon, repl, snake, faults, keys, about
scripts/            the scripts behind the captures
tools/gen_font.py   makes nucleus/font_data.h from Terminus Font
third_party/        QuickJS 2026-06-04 (MIT, two small patches: see PATCHES), font licence (OFL)
```

### The virtual clock

There is one lane of execution. A world runs when it has a message (or a settled promise) and the lane
is free; the lane takes runnable worlds by priority (drivers, then services, then apps, then the
sandbox) and then in order of arrival. A segment costs a fixed entry cost, plus the JavaScript work it
did, plus what its host calls did (pixels filled, glyphs drawn, bytes encoded).

JavaScript work is counted exactly with QuickJS's interrupt counter (one step per loop back-edge or
call). One step is calibrated to the ESP32-P4 using the `js bench` measurement from
`esp32-s3-m5/0101-esp32-p4-native-quickjs`: the 100,000-iteration loop there takes 133 ms on the device,
and here takes 200,002 steps, so a step is 665 virtual ns. As a check, the same model puts `fib(20)` at
29.1 ms; the device measured 31 ms. The REPL shows the loop taking 133 ms.

Bus transfers take the time their bits take on the wire (I2C at 10 kHz with 9 clocks a byte; SPI at
40 MHz plus 12 µs per 32 KiB DMA chunk), are serialised per bus, and settle a promise when done.

### Turns, effects and supervision

A turn is one message handled to completion; an `async` handler's turn lasts until its promise settles,
and the world takes no other message meanwhile. Messages, channel posts, replies and bus transfers a
segment issues are applied when the segment ends, so a segment that crashes has no effects.

A world that throws, runs past its turn budget or runs out of heap is torn down, its handles are
dropped, and it is restarted after 100 ms, doubling to at most 2 s. After five crashes in ten seconds
it stays stopped until a world with the `sys.admin` claim restarts it. Every change is published on
the `worlds.status` channel, and every crash is written to the UART as one line:

```
#OCT1 {"ev":"fault","t":3573.521,"world":"flaky","file":"system/flaky.js","handling":"boom","why":"boom, thrown on purpose (system/flaky.js:4:38)","crashes":1,"mem_kb":183,"limit_kb":256,"detail":"    at <anonymous> (system/flaky.js:4:38)\n    at <anonymous> (prelude.js:130:17)\n"}
```

That is the hook for a fault handler on the host side of the USB serial line: it can read these frames
and answer on the same line, with no networking on the device.

### Hardware as handles

A world asks for a device by claim (`hw.i2c("i2c0:0x1f")`, `hw.spi("spi2")`, `dma.alloc(320, 320)`) and
gets it only if the manifest gives it that claim. A handle can be narrowed (`fb.narrow("r")`), sent
inside a message (the receiver is given it on delivery) and revoked by the world that narrowed it. The
kernel checks the holder and the rights on every use. The compositor owns the framebuffer and gives the
display driver a read-only view of it; the Handles tab of the System app shows this.

### The screen

Apps never draw. An app's `screen(state)` returns a tree of ui nodes (`col`, `row`, `text`, `list`,
`table`, `lines`, `grid`, `kv`, `bar`, `spark`, `canvas`, `input`, `box`); after each of its turns, if
the tree changed, it is published on the `frames` channel. The compositor lays out the focused app's
tree with the status and hint bars into the back buffer, the nucleus compares it with the front buffer
and returns the changed rectangles, and the compositor asks the display driver to send them: `CASET`,
`RASET`, `RAMWR` and the pixels, queued together so they run back to back on SPI2. The display driver
is `picocalc_lcd.c` rewritten in JavaScript, with the same init sequence and the same 40 MHz clock.

Text uses bitmap fonts at 6x12, 8x16 (regular and bold), 10x20 bold and 16x32 bold, taken from
Terminus Font with six symbols drawn on the pixel grid (`tools/gen_font.py`).

## The world API

```js
app("snake")                         // or driver(...), service(...)
  .title("Snake")
  .state({ score: 0 })               // the world's state, kept until it restarts
  .needs("keys")                     // channels it receives;  .provides("frames") channels it posts on
  .onStart((s) => ...)
  .on("key", (s, payload, msg) => ...)        // return a value to answer an ask; async is fine
  .every(110, (s) => ...)                     // timers coalesce: a busy world gets one tick, not a backlog
  .screen((s) => ui.col(ui.text(`score ${s.score}`), ...))
  .hints("←→↑↓ steer");
```

Inside a world: `send(to, type, payload)`, `ask(to, type, payload, {timeout})`, `publish(channel,
payload)`, `sleep(ms)`, `now()`, `log(...)`, `hw.i2c/spi`, `dma.alloc`, `sys.worlds/handles/stats`,
`sys.fault/restart`; handles have `read(reg, n, gapMs)`, `transfer(bytes, nread, gapMs)`, `write`,
`cmd`, `pixels`, `fill`, `text`, `commit`, `narrow`, `revoke`, `release`. `Math.random` is seeded per
world and `Date` reads the virtual clock, so a script replays exactly.

## What the simulator caught

- **Two drivers racing on one chip.** The STM32 prepares its answer when a register number is written
  and hands it over on the next read. The keyboard and power drivers both talk to it; with the write
  and the read as separate transfers (as `picocalc_keyboard.c` does, with a 2 ms wait between them), the
  power driver's battery answer was read by the keyboard driver as a key press ("R", state 11). Reads
  are now one transaction that holds the bus for write, 2 ms, read (`dev.read(reg, n, 2)`).
- **Messages for a dead driver.** Flushes queued for a display driver that had been killed reached
  its restarted instance before the compositor had re-attached the framebuffer. The driver now skips
  them, and the compositor resends the whole screen.
- **The keyboard costs a third of the I2C bus.** Polling every 20 ms at 10 kHz, each status read takes
  about 6 ms of bus time. The Buses tab shows it.
- **One lane means one hog at a time.** While the sandbox spins for its 200 ms budget nothing else runs;
  with priorities, the screen at least shows "evaluating…" before it starts.

## From here to the device

The nucleus is written against the board through `hw.c` and `sim/`. On the ESP32-P4, `run_i2c` and the
SPI functions call ESP-IDF's `i2c_master` and `spi_master` drivers (with DMA from PSRAM framebuffers),
the kernel loop runs in a FreeRTOS task with the real clock in place of the virtual one (budgets still
enforced by the step counter), world heaps come from PSRAM, and the UART fault frames go out on the
CH343 console. The JavaScript does not change.

Not done here: a second lane for the P4's second core, capability checks on channel subscriptions (any
world can `need` the `keys` channel), storage, Wi-Fi, and backlight levels between off and on in
captures.

## Licences

QuickJS is MIT (third_party/quickjs/LICENSE). The fonts in `nucleus/font_data.h` are a modified subset
of Terminus Font by Dimitar Toshkov Zhekov, under the SIL Open Font License 1.1
(third_party/fonts/OFL.txt).
