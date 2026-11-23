# Measuring the compiler and the firmware

This guide explains how a change to the Typed compiler or the firmware is measured in this repository: which gates
run on the host, how a paired study runs on the ESP32-P4, and how the handheld is left on the playable firmware
afterwards. Every tool named here lives in `bench/`. Ticket scripts in `ttmp/` may call these tools with different
parameters; they do not copy them.

## Two kinds of evidence

A compiler change has to keep the programs it compiles correct, and it usually has to make them faster or smaller
without making the compiler too slow to run at boot. The repository separates the two questions.

- **Host gates** check behaviour and count work. They run on any machine in about a minute and need no device. A
  host gate either passes or fails; it does not measure time.
- **Board studies** measure time on the ESP32-P4. A study compares two or more compile modes in balanced orders over
  six blocks and reports paired medians and wins. Only a board study can say that a change is faster.

The reason for the split is that the host's instruction counts and the board's microseconds disagree often enough to
matter: a change that removes instructions can still lose on the board through cache or memory placement, and the
board is the target. Host gates are cheap enough to run on every change, so they catch the errors; board studies are
expensive, so they run on the changes that pass.

## Host gates

`bench/host/gates.sh [--options JSON]` runs three gates with one set of compile options:

| Gate | Tool | What passing means |
|---|---|---|
| Opening ray frame | `bench/host/ray-profile.mjs` | The compiled ray tracer's opening frame has the C-verified digest `430f0d50…` (`bench/reference/ray-opening.json`); the instruction count is printed |
| Chess engine oracle | `bench/host/chess-engine.mjs GCC EMU` | The compiled Chess engine agrees with chess 1.11.2 on 6,981 words over the reference positions (`bench/reference/chess/`) |
| 25 workflows | `bench/host/replays/run.sh` | Files, Agenda and Editor compile to WASM and RV32, link against the native-world SDK, and replay their recorded sessions on `rv32emu` |

```sh
bench/host/gates.sh --options '{"policy":"kernel"}'
# == ray profile      custom: 3,239,635 instructions, 11544 B image, output 430f0d501659 (reference)
# == Chess engine oracle   6981 words match; engine 118,361,847 instructions, 19892 B
# == replays          25/25 workflows passed
```

The options reach every compile through one mechanism. `--options` sets `TYPED_RV32_OPTIONS`, and
`bench/lib/compiler.mjs`, which loads the compiler for every bench script, makes that object the default of every
`typedRv32.compile` call, including the calls `typed-world.js` makes while linking a world. A key the caller passes
explicitly still wins. Earlier tickets changed the defaults by loading a patched copy of `typed-rv32.js`; that is
the copy this parameter replaces.

`bench/lib/toolchain.sh` finds the ESP-IDF RISC-V GCC (the newest `-dumpversion` under `~/.espressif`; the 2021 GCC
8.4 lacks the ISA syntax the replays use) and builds `bench/emu/build/rv32emu`. Set `P4_GCC` or `RV32EMU` to override
either. `make test-host OPTIONS=...` and `make test-replays` are the same commands through the root Makefile.

The compiler's own tests (`tests/compiler/`, run by `make test-node`) hold the pinned image digests of each policy.
A change that alters an image without meaning to fails there before any gate runs.

## A board study

A study is a JSON file in `bench/board/studies/`:

```json
{
 "what": "RAY-PARITY board run 15: reuseArgs against run 14's kernel without it.",
 "modes": [{"name": "control", "options": {"policy": "stock", "operandLocations": {"...": true}}},
           {"name": "candidate", "options": {"policy": "stock", "operandLocations": {"...": true, "reuseArgs": true}}}],
 "pins": {"control": "8eaa4060…", "candidate": "4323938e…"},
 "blocks": 6
}
```

Mode 0 is the control. A pin is the SHA-256 of the ray image a mode must compile to; it ties the study to images
whose rows are already known, so a study cannot time a different compiler by accident. `"internalWorkLast": true`
puts the last mode's Typed frame work buffer in internal RAM instead of PSRAM.

`make bench-board STUDY=bench/board/studies/NAME.json` runs the four steps:

1. `bench/board/stage.mjs STUDY OUT` compiles each mode's ray tracer and Chess evaluator, checks the pins and the
   frame fixtures against the WASM build, and writes the generated sources (`blobs.S`, `inputs.h`,
   `cold_inputs.h`, `manifest.json`).
2. `bench/board/build.sh OUT` builds the diagnostic app (`bench/board/app`): the firmware's C ray tracer, plain and
   bounds-checked C predicates, every mode's RV32 images, and QuickJS cold compiles of each mode.
3. `bench/board/run.py OUT CAPTURE` checks the playable firmware's health, writes the app, captures its output until
   `SIMDLAB END`, then rewrites and verifies the playable image and checks its health again.
4. `bench/board/rows.py CAPTURE OUT DEST` checks the row counts exactly (predicates 16·6·(3+m), frames 12·6·(1+m)·3,
   Chess 72, cold compiles 6·2·m per metric) and keeps `rows.json` and a receipt.

`bench/board/score.js` scores the rows in the trace REPL (`stats.paired` per block):

```sh
(echo 'globalThis.args = {board: "DEST"};'; cat bench/board/score.js) | trace-repl eval --addr ADDR --session SID
```

The arms inside the app run in Williams order, which balances each arm's position across blocks, so a drift in the
board's temperature or clock does not favour the arm that always runs first. The paired comparison then uses the
per-block difference, not two independent medians.

### What a reproduction looks like

The harness was qualified by repeating RAY-PARITY's board run 15 (`bench/board/studies/ray-parity-run15-reuse-args.json`):

| | RAY-PARITY run 15 | bench/board |
|---|---:|---:|
| C frame | 7,733 µs | 7,730.5 µs |
| control frame | 11,164.5 µs | 11,162.5 µs |
| candidate frame | 10,986 µs | 10,996.5 µs |
| paired saving, wins | 1.59 %, 6/6 | 1.49 %, 6/6 |

Differences of about 0.1 % between runs of the same images are the noise floor; a claimed improvement smaller than
that needs more blocks or a different workload.

## The device library and the playable firmware

`bench/board/device.py` is the only code that talks to the board. It holds the serial lock (one process owns the port
at a time), the firmware console, esptool calls, the firmware's `hold` before flashing, the wait for the boot-time
compiles (`settle`, up to 60 s), and the health check. Health has two modes: `peripherals="on"` requires every native
world healthy, the Chess painter installed and the I2C keyboard answering; `"off-by-user"` records the keyboard,
display and compositor without judging them, for when they are switched off on purpose.

`firmware/PLAYABLE.json` records the firmware the handheld is left on: profile, commit, the digests of the app,
partition table and bootloader, and the last health check. `bench/board/playable.py` keeps the files in
`~/.cache/picocalc/firmware/<app sha256>/`, so a restore does not depend on a build directory surviving.

```sh
make playable                 # build the playable profile at HEAD and store it
make install-playable         # flash it, settle, check health, rewrite PLAYABLE.json (then commit it)
make restore-playable         # reinstall what PLAYABLE.json records
python3 bench/board/run.py --probe DIR    # check store, board and health without flashing
```

`run.py` refuses to start a study unless the stored playable files match `PLAYABLE.json`, and every study ends by
restoring them.

## Firmware profiles

`firmware/port/esp32p4/build.sh PROFILE BUILD` builds `firmware/port/esp32p4/profiles/PROFILE.env`: `playable`,
`bench`, `candela-world`, `offline`, `agent` and `agent-elf`. A profile lists its Typed apps (`APPS`, each described
by `apps/typed/NAME/app.json`: sources, linker, policy, heap cap and deadline) and a few platform options. `bench` is
the playable firmware plus the console benchmarks of `bench/board/firmware` (`raybench`, `cachestat`, `typedray`,
`typedmat`, `candela bench`), which the playable image does not carry; a study that times them flashes a bench
build and restores the playable image afterwards. Every profile builds reproducibly: ESP-IDF's reproducible-build
option removes dates and times, and prefix maps remove the checkout's path from the firmware and from the
device-compiler tool, so one commit gives one app digest wherever it is built. `build.sh` writes
`BUILD/picocalc-build.json` with the profile, commit, apps, options and digests.

## See also

- `docs/typed-compiler-and-the-ray-tracer.md`: what the compiler optimizations are and how they were measured.
- `tools/trace-repl/doc/01-trace-repl-user-guide.md` (`trace-repl help trace-repl-user-guide`): the workbench that
  scores studies and queries compiler evidence.
- `bench/README.md`: the directory map.
