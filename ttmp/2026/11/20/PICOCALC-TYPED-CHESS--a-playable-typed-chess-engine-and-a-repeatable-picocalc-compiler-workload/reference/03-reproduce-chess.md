---
Title: Reproducing the Chess rule, runtime and physical benchmarks
Ticket: PICOCALC-TYPED-CHESS
Status: active
Topics:
    - picocalc
    - performance
DocType: reference
Intent: long-term
---

# Reproducing the Chess rule, runtime and physical benchmarks

All commands run from the repository root. The production desktop Wasm reactor can be built with **make -C picocalc-os typed-world-reactor**. The production P4 reactor and full image are built with the opt-in **PICOCALC_TYPED_CHESS** flag, plus **PICOCALC_RV32_CHESS** to select the native target.

## Oracle and game UI on the host

Set the paths to ESP-IDF's RISC-V GCC, the CJI emulator, and the shared reactor ELF from a P4 build with typed RV32 Editor or Chess.

~~~bash
chess_scripts=$(dirname "$(git ls-files 'ttmp/2026/11/20/PICOCALC-TYPED-CHESS--*/scripts/11-run-board-chess.py')")
gcc=/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf-gcc
emu=$(printf '%s\n' ttmp/2026/11/17/PICOCALC-CJI--*/sources/cji/build/rv32/rv32emu)
reactor=/tmp/picocalc-chess-board-rv32/build/esp-idf/main/typed-world-reactor.elf

node "$chess_scripts/03-engine-oracle.mjs" "$gcc" "$emu"
node "$chess_scripts/07-chess-world-oracle.mjs" "$gcc" "$emu" "$reactor"
bash "$chess_scripts/13-measure-host.sh" "$reactor" /tmp/picocalc-chess-host-measurements.json

out=$(mktemp -d /tmp/picocalc-chess-host.XXXXXX)
node "$chess_scripts/05-prepare-chess.mjs" wasm "$out"
picocalc-os/build/picocalc-host -j "$out/js" -o "$out/out" -u "$out/out/uart.log" "$chess_scripts/06-chess-keys.txt"
cmp "$out/out/chess-initial.png" "$out/out/chess-reset.png"
~~~

The two oracle reports are exact and should reproduce for the same compiler and reactor. The timed samples will vary. The app timings begin at the linked Wasm event entry, and the setup and compilation measurements use fresh QuickJS contexts and process CPU time.

## Build the measurement image

This command copies tracked compiler, OS and CJI files to an isolated tree, adds a small kernel observer and builds the firmware. It takes time on a fresh CJI tool cache. The build contains all four typed worlds and uses the same measured Chess source as the uninstrumented build. The observer records the two retained frames in the production kernel and emits a single line at the end of the reply. To build the Wasm lane, pass **--target wasm** and choose a separate output directory.

~~~bash
python3 -B "$chess_scripts/10-stage-board-chess.py" \
  --output /tmp/picocalc-chess-board-rv32 \
  --idf-export /home/manuel/esp/esp-idf-5.4.2/export.sh --target rv32
~~~

The **image** subdirectory contains the application binary, the partition table, the SDK config, the manifest and a build receipt with the firmware, source, compiler scripts and reactor digests. The instrumented checkout stays in the same work directory. It can be inspected without modifying the shared source tree.

## Run and restore under the board lock

The board operator must already have the original 8 MiB app partition and its captured partition table. The script verifies those files and the build receipt before opening the port. It flashes only the app partition at 0x10000. It boots Chess, opens it through the launcher, plays e2–e4, and checks the exact response against the dual-target host oracle. After the timing window closes it captures the reply PNG with the UART CRC. In its cleanup, it flashes the original backup and confirms the factory world list.

~~~bash
flock /tmp/pico-lab2-wave/original/serial.lock \
  python3 -B "$chess_scripts/11-run-board-chess.py" \
    --image /tmp/picocalc-chess-board-rv32/image \
    --output /tmp/picocalc-chess-physical \
    --backup /tmp/picocalc-eg-wave/original \
    --esptool /home/manuel/.espressif/python_env/idf5.4_py3.11_env/bin/esptool.py
~~~

Add **--preflight** to validate the inputs without opening the serial port. The full run records the digest-checked backup, chosen image, compile latency, peak QuickJS heap, linked bytes, Chess reply, score, nodes, completed depth, segmentation, restored world list and capture checksum in **physical.json**. Each serial, flash and image capture log remains in the output directory. The move statistic uses the Chess key event and retained frame as its endpoints. It is not physical key-to-pixel latency.
