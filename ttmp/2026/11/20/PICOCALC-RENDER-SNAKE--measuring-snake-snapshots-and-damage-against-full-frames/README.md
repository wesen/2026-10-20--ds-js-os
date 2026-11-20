# Reproduce the Snake rendering study

From the repository root run the following commands with Node, a C compiler, Python 3 and the shared PICOCALC-RENDER-LAB pixel oracle available. The full run writes three sets of uncompressed frames, about 145 MB, in the chosen output directory.

```sh
study=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-RENDER-SNAKE--*')
bash "$study/scripts/11-run.sh" /tmp/snake-rerun
```

The [project report](analysis/01-what-moves-when-a-snake-advances-one-cell.md) explains the measured comparisons. The [prospective design](design-doc/01-independent-prospective-design-for-snake.md) predates the [operator protocol](scripts/04-protocol.md). The [researcher's diary](reference/02-opus-researcher-investigation-diary.md) and [operator's diary](reference/01-operator-investigation-diary.md) record separate roles.

[Events](various/events.json), [per-frame lengths and original screen hashes](various/replay.json), [RGB565 hashes](various/pixels.json), [raw JS timing blocks](various/timings.json), [raw C timings](various/raster-trials.csv.gz), and the [summary](various/summary.json) are committed. The binary records and actual source/control/semantic frame sequences can be regenerated with `07-measure.mjs` alone. The C timing file concatenates 12 CSV runs with a header for each run. The [QuickJS capsule](various/device-capsule.js) contains the same semantic codec plus the original view and a fixed 12-state corpus. The director owns its physical execution.
