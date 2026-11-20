# Reproduce the Snake rendering study

From the repository root run the following commands with Node, a C compiler, Python 3 and the shared PICOCALC-RENDER-LAB pixel oracle available. The full run writes three sets of uncompressed frames, about 145 MB, in the chosen output directory.

```sh
study=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-RENDER-SNAKE--*')
bash "$study/scripts/11-run.sh" /tmp/snake-rerun
```

The [project report](analysis/01-what-moves-when-a-snake-advances-one-cell.md) explains the measured comparisons. The [prospective design](design-doc/01-independent-prospective-design-for-snake.md) predates the [operator protocol](scripts/04-protocol.md). The [researcher's diary](reference/02-opus-researcher-investigation-diary.md) and [operator's diary](reference/01-operator-investigation-diary.md) record separate roles.

[Events](various/events.json), [per-frame lengths and original screen hashes](various/replay.json), [RGB565 hashes](various/pixels.json), [raw JS timing blocks](various/timings.json), [raw C timings](various/raster-trials.csv.gz), and the [summary](various/summary.json) are committed. The binary records and actual source/control/semantic frame sequences can be regenerated with `07-measure.mjs` alone. The C timing file concatenates 12 CSV runs with a header for each run. The [QuickJS capsule](various/device-capsule.js) contains the same semantic codec plus the original view and a fixed 12-state corpus. The director ran this capsule on the physical P4. The [timing blocks and native trace](various/physical-snake.json) include all 15 Snake codec trials. The [captured native screen](various/native-published-frame.json) is independent of the host input trace.

Run `scripts/15-host-quickjs.sh OUTPUT` from this ticket (using its path from the repository root) to reproduce the [64-bit QuickJS allocator observations](various/host-quickjs.json). It reuses the System study's allocator meter and this study's 12-state capsule.

The [motion figure](various/snake-motion-rgb565.png) magnifies the actual RGB565 crops and the mask of each proposed transfer rectangle. To regenerate it, run `python3 "$study/scripts/21-motion-figure.py" /tmp/snake-rerun /tmp/snake-motion-rgb565.png` after the main replay. The figure script requires Pillow and DejaVu Sans.

The held-out CJI screen can be checked independently with the following commands. The two raw RGB565 files should compare equal. The reproduction of the full on-device firmware session is maintained in the parent lab ticket.

```sh
node "$study/scripts/22-live-witness.mjs" "$study/various/native-published-frame.json" /tmp/snake-rerun
oracle=$(find ttmp/2026/11/20 -path '*PICOCALC-RENDER-LAB--*/scripts/04-screen-oracle.mjs')
for arm in native native-template; do
  node "$oracle" "/tmp/snake-rerun/$arm.ndjson" "/tmp/snake-rerun/$arm-pixels"
done
cmp /tmp/snake-rerun/native-pixels/00000.rgb565 /tmp/snake-rerun/native-template-pixels/00000.rgb565
```
