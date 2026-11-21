---
Title: Reproduce the bounded-admission and checked-operation studies
Ticket: PICOCALC-NATIVE-WAVE
Status: active
DocType: reference
Intent: long-term
Topics: [picocalc, esp32-p4, performance, native]
---

# Reproduce bounds admission and operation lifetime

Run the commands from the repository root using Node.js 24 and ESP-IDF 5.4.2. Start with the smooth Chess build profile for the named frozen 3D source and the full Chess and Editor bundles. The two studies do not change the product compiler. Their staging scripts apply exact textual anchors and fail if the source layout changes.

```sh
P=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-NATIVE-WAVE--*')
BUILD=/tmp/native-wave-smooth-profile
OUT=/tmp/native-wave-artifacts
picocalc-os/port/esp32p4/build-smooth-chess.sh "$BUILD"

node "$P/scripts/01-bounds/02-heldout.mjs" \
  "$P/scripts/director/heldout" /tmp/native-wave-heldout.json "$OUT"

node "$P/scripts/01-bounds/03-host.mjs" \
  "$BUILD/esp-idf/main" "$BUILD/esp-idf/main/chess-painter-source.typed" \
  /tmp/native-wave-host.json "$OUT"
```

The inputs must match the source hashes in `various/01-bounds/host.json`. The app outputs in this file are native instruction extents before insertion into a fixed-size reactor. Fresh-context Node milliseconds describe the operator's host run and vary by machine. The numerical code extents, behavior cases and instruction counts reproduce exactly. `02-heldout.mjs` adapts the director oracle to each candidate compiler, preserving every original source byte, input, expected return, expected trap, and memory byte. It uses the preexisting PIE project interpreter, whose SLLI support is required for late lowering.

The supplementary semantic contract checks aliases and the destination check's ordering relative to an observable RHS call, plus deep operand-stack use and literal lengths through the maximum.

```sh
node "$P/scripts/02-semantics/12-lifetime-contract.mjs" /tmp/native-wave-contract.json
```

Rebuild the earlier guarded Editor compiler with its original reconstruction scripts. Use fresh directories for the earlier stages.

```sh
O=$(find ttmp/2026/11/19 -maxdepth 1 -type d -name 'PICOCALC-STREAMED-TYPED-OPS--*')
B=$(find ttmp/2026/11/19 -maxdepth 1 -type d -name 'PICOCALC-BOUNDED-INDEX--*')
python3 -B "$O/scripts/01-stage.py" /tmp/native-wave-original-ops
python3 -B "$B/scripts/01-stage.py" /tmp/native-wave-guarded /tmp/native-wave-original-ops
node "$P/scripts/01-bounds/06-prior-engine.mjs" \
  /tmp/native-wave-guarded /tmp/native-wave-older-editor.json
```

The normal device profile is the recovery image. The serial program checks the expected SHA before it opens the port and verifies the installed release before replacing the app. Coordinate physical ownership before invoking it. It runs only with a private experimental build tree on the same partition layout.

```sh
bash "$P/scripts/01-bounds/05-build-board.sh" \
  /tmp/mobile-painter-chess3d /tmp/native-wave-12-board "$OUT"
python3 -B "$P/scripts/01-bounds/08-verify-image.py" \
  /tmp/mobile-painter-chess3d/build/picocalc-os-p4.elf \
  /tmp/native-wave-12-board/build/picocalc-os-p4.bin "$OUT" \
  /tmp/native-wave-flash-code.json
python3 -B "$P/scripts/01-bounds/07-device.py" \
  /tmp/native-wave-12-board/build /tmp/chess-camera-release/build \
  /tmp/native-wave-12-physical
```

The board run records five rotating cold compile blocks for each of six compiler arms and each full app. Each call uses a fresh QuickJS compiler sandbox and the same normal reactor. It includes engine setup, source compilation and linking. The peak JS allocator reading is separate from the compiled binary size and total system heap. The output is the whole reactor buffer, whose fixed byte size is unchanged even if the generated text shrinks.

The direct native device run records eleven rotating blocks of 256 successful calls per endpoint per arm. Code resides in flash text at distinct addresses with the same alignment. The read input is static constant storage. The writable objects live on the pinned task's PSRAM stack. Timer deltas include the repeated call loop. The harness verifies complete output or unchanged buffers after each block. It does not execute trap cases on the device.


The original acquisition used a 280-second host deadline and returned 59 of 60 planned compile rows and all 165 native timings. Preserve the missing fifth Editor Selected result in the receipt. Use only the first four complete blocks for both apps. The revised runner keeps partial observations, lengthens the deadline, and emits a dedicated native correctness line immediately after the native samples. In short mode it runs one complete matched compile block per app for confirmation.

```sh
python3 -B "$P/scripts/01-bounds/07-device.py" \
  /tmp/native-wave-12-board-short/build /tmp/chess-camera-release/build \
  /tmp/native-wave-12-confirmation --short
python3 -B "$P/scripts/01-bounds/09-summarize-device.py" \
  /tmp/native-wave-12-confirmation/receipt.json /tmp/native-wave-12-confirm-summary.json
```
