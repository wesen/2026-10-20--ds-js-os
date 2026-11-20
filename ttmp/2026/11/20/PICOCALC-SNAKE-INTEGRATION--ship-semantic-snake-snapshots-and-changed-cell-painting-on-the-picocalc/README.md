# Reproduce the integrated Snake study

Run these commands from the repository root with Node.js, Python 3, the production CJI emulator and its shared runtime. Build the host PicoCalc with `make -C picocalc-os`. `make -C cji slas rv32-nw-units` provides the native CJI prerequisites when the RV32 toolchain is installed. The simulator comparison uses Pillow. Creating the combined image also requires Matplotlib.

```bash
ticket=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-SNAKE-INTEGRATION--*')
python3 "$ticket/scripts/01-native-fixture.py"
make -C picocalc-os test-apps
node picocalc-os/tests/compositor-auth.test.mjs
work=$(mktemp -d /tmp/snake-panel.XXXXXX)
python3 "$ticket/scripts/02-simulate-game.py" "$work"
python3 "$ticket/scripts/03-panel-figure.py" "$work" "$work/panels.png"
```

The SDK check executes the new native Snake module in CJI's RV32 emulator, uses the previous widget command trace at e339b6a as its oracle, and checks the tracked updated golden. The ordinary system simulator runs both versions with the same virtual input. Five full images must agree, including going home after playing. The [recorded checksums](various/simulator.json) identify exactly the pixels compared.

The [host-replay article](analysis/03-snake-rendering-correctness.md) and [examiner diary](reference/03-replay-diary.md) give the native raster harness build and run commands and describe its two independent references. The earlier research scripts that directly read the sources in a checkout can be reproduced at e339b6a. The new replay deliberately retrieves that exact revision with Git.

The [device report](analysis/02-snake-on-the-device.md) and [board operator's diary](reference/02-device-diary.md) document the matched physical sessions, isolated observer builds, profile settings and health checks. Its [runner](scripts/device/01-normal-snake.py) takes the actual USB port, baseline build and test counts as explicit inputs. Only one process should operate the serial device at a time. The ordinary playable image is installed after instrumented measurements.

To reproduce the timing figure directly from committed board observations, use the two instrumented-arm receipts. Each circle is one window mean. To verify separate storage costs you also need both **ordinary** ESP-IDF build directories.

```bash
python3 "$ticket/scripts/06-plot-game-timings.py" "$ticket/various/device/profile-before.json" "$ticket/various/device/profile-after.json" "$work/physical-stages.png"
python3 "$ticket/scripts/05-world-footprint.py" /path/to/old/build /path/to/new/build
```
