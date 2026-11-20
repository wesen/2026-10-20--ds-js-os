# Reproduce the indexed binary screen experiment

Run from the repository root with Node.js, Python 3, gzip and a C compiler. The scripts use the vendored QuickJS engine, the production compositor drawing functions, and the shared RGB565 raster driver. The fixture manifest preserves the exact hashes of the selected inputs. The original System trace is in its own study. The other three traces are compressed copies of the fixed experiment inputs.

```sh
ticket=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-RENDER-BINARY--*')
system=$(find ttmp/2026/11/20 -path '*/PICOCALC-RENDER-SYSTEM--*/various/sysmon-generic.ndjson')
work=$(mktemp -d /tmp/psix-reproduce.XXXXXXXX)

for app in chess snake editor; do
    gzip -dc "$ticket/various/traces/$app.ndjson.gz" > "$work/$app.ndjson"
done
fixtures=("$system" "$work/chess.ndjson" "$work/snake.ndjson" "$work/editor.ndjson")
"$ticket/scripts/05-build-capsule.sh" "$work/binary.js" "${fixtures[@]}"
node "$ticket/scripts/07-verify.mjs" "$work/binary.js" "$work/verify" "${fixtures[@]}"
python3 "$ticket/scripts/08-host-evidence.py" "$work/binary.js" "$work/verify" "$work/host-evidence.json"
```

The verifier compares logical trees and actual draw commands, exports the exact selected wire specimens under `verify/`, exercises admission conformance and runs a seeded mutation test. The evidence script sends each arm's commands through separate executions of the production raster, compares every RGB565 byte and uses the QuickJS host allocator meter. Timing and allocator observations will vary with the host build. The fixture IDs, hashes, bytes and raster pixels are deterministic on the frozen source.

Physical replay requires the supervising lab's temporary board build and serial session. The P4 capsule accepts runs such as `renderlab binary chess-B 1`. Bitmap output on the physical panel is outside that calibration. The shared board session scripts rotate the fixed arms across seven blocks and restore the playable image. The raw receipts can be summarized on any host. [Board session scripts](../PICOCALC-RENDER-LAB--measure-bounded-screen-readers-and-semantic-views-across-picocalc-applications/scripts/14-board-session.py).

```sh
python3 "$ticket/scripts/10-device-summary.py" "$work/device.json" \
    "$ticket/various/host-verification.json" \
    "$ticket/various/device-js-and-native-reader.json" \
    "$ticket/various/device-native-route.json"
```

The native reader and the matched native sender provide independent trials sharing the frozen wire format. Their build instructions and timings are in [the native reader evidence appendix](reference/04-native-reader-evidence.md) and [the native producer subgroup's files](scripts/producer/01-reproduce.md).
