---
Title: Reproducing physical device measurements
Ticket: PICOCALC-CJI-DIALECT
Status: active
Topics: [picocalc]
DocType: reference
Intent: long-term
---
# Reproducing the board measurements

Run commands from the repository root. The P4 scripts target the project's headless profiling build for the attached PicoCalc. Each flash replaces only the application partition. An ordinary image directory with its matching ELF, CMake cache and generated system manifest is required for the restoration smoke check. Preserve it before building any candidate. A machine attached to the serial port must run only one series at a time.

```bash
n=$(dirname "$(dirname "$(dirname "$(find ttmp -path '*CJI-DIALECT*/scripts/board/run-qjs.py' -print -quit)")")")
board=picocalc-os/port/esp32p4
out=/tmp/cji-dialect-reproduce
mkdir -p "$out"
python3 "$n/scripts/board/build-qjs-probe.py" "$board/build-elf" "$out/qjs-image"
bash "$n/scripts/board/qjs-series.sh" "$out/quickjs" "$out/qjs-image" /tmp/nov18-headless-ab/control
python3 "$n/scripts/board/summarize-qjs.py" "$out/quickjs/probe/qjs.jsonl"
```

For the native candidate, generate stage-1 SLIR with the local policy following the numeric diary. The variant builder compares a relinked original compiler to the current build before changing the input object. It restores the build directory to the ordinary configuration before exiting. The native hardware series checks the known Flaky hash at boot and checks the expected new Agenda and Files hashes independently.

```bash
bash "$n/scripts/board/build-native.sh" "$out/native-image" /tmp/cji-dialect-numeric-local-r1/stage1.slir
bash "$n/scripts/board/native-series.sh" "$out/native" "$out/native-image" /tmp/nov18-headless-ab/control
python3 "$n/scripts/board/verify-native.py" "$out/native"
```

The typed diagnostic embeds the **text** of the emitter and input. The actual parse, type check, Wasm binary generation, WAMR load and function calls occur on the P4. A second host build verifies the emitted module's length and SHA-256. The production WAMR translation unit supplies its ordinary runtime initialization. This fixture invokes a leaf export directly and measures its execution without world registration.

```bash
python3 "$n/scripts/board/build-qjs-probe.py" "$board/build-elf" "$out/typed-image" \
  --typed "$n/scripts/fastpath/04-typed-wasm.js" "$n/scripts/fastpath/scroll.typed"
bash "$n/scripts/board/typed-series.sh" "$out/typed" "$out/typed-image" /tmp/nov18-headless-ab/control
python3 "$n/scripts/board/verify-typed.py" "$out/typed/typed-uart.log"
```

`pack-receipts.py SERIES IMAGE CONTROL NAME DEST` records both firmware identities, compressed flash/boot messages and the restored control's verified Flaky compile. `native-*.log.gz` contains the filter used by the port team's catalog checker. The unfiltered QuickJS calibration turns include a priming cycle that the checked three trials exclude. Source reads, hashing, console transport and behavior witnesses lie outside the registration timer. For the simulator screenshot, rerun the fast-path script with a persistent work directory and compare `replay/agenda/{source,bytecode}/out/72-agenda-tasks.png` against the hash in the workflow receipt.
