# Reproduce the PSIX runtime shape study

From the repository root, use Node.js, Python 3, bash, a C compiler and the vendored QuickJS sources. The archive stores input digests, frozen split positions, all per-block timing samples, observed plan counts, and per-frame byte equality counts.

```sh
study=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-PSIX-STAGING--*')
runtime="$study/scripts/runtime"
work=$(mktemp -d /tmp/psix-shapes.XXXXXXXX)
node "$runtime/03-run.mjs" node "$work/node-host.json"
"$runtime/04-build-quickjs.sh" "$work/quickjs"
node "$runtime/03-run.mjs" quickjs "$work/quickjs.js"
"$work/quickjs" "$work/quickjs.js" runtime > "$work/quickjs-meter.json"
jq '.result' "$work/quickjs-meter.json" > "$work/quickjs-host.json"
for mode in resident resident-generic resident-released; do
    node "$runtime/03-run.mjs" "$mode" "$work/$mode.js"
    "$work/quickjs" "$work/$mode.js" runtime > "$work/$mode.json"
done
```

The original codec source is copied into each generated JS capsule. The harness adds an export for three pure existing helpers and leaves the body of `encode` intact. The C helper from the System replay study uses an allocation meter and a monotonic clock. The build extends its output to report live bytes after a GC. The shell starts the QuickJS executable directly so subprocess timing and behavior are easy to reproduce.

`complete` covers all 427 original corpus frames in application order. Each per-stream validation compares every complete candidate buffer with the original writer. The FNV-1a hash records the concatenated original bytes as a compact cross-engine check. It has no role in the guard. `counts` records timed-phase transitions, and peak ledgers include prior setup state in the prefix arm. The `trials` section shows seven one-pass stream times per arm with rotated order after an untimed block. It also reports per-run setup timing. Offline training is profiled separately, once before the timed blocks. `profiles` gives diagnostic stage timings from a separate pass with a timer around each stage. For matched hit and miss subsets it also times the original writer on the same input. Use the primary stream medians for arm comparisons.

`resident` and `resident-generic` run the same System tape and keep the final encoder object alive across a GC. Preloaded fixtures and capsule code are included in the pre-trial meter baseline. The release control runs the same adaptive sequence and keeps the outcome counters while releasing the actual encoder before collection. The allocator receipts distinguish resident increments from transient high water. The synthetic shape controls are built in the harness, separate from the original application traces.

## Optional ES2020 board capsule

The physical runner must supply a global monotonic microsecond timer named `stageMicros`. This generator extracts selected real rows from the already frozen host prefix and holdout. The Keys test reuses the System training prefix and has no Keys training data.

```sh
node "$runtime/05-build-board.mjs" "$work/adaptive.raw.js"
esbuild "$work/adaptive.raw.js" --minify --target=es2020 --format=iife --outfile="$work/adaptive.js"
```

The ground-truth manifest is emitted next to the raw source. The physical runner loaded the 77,269-byte raw source. The optional minified capsule generated with esbuild 0.25.0 was also smoke-tested on host QuickJS. The API is `stageAdaptiveRun(spec, repetitions = 1)`. The modes are `generic-system`, `trained-system`, `online-system`, and `warm-system`, with equivalent `-keys` modes. `verify-system` and `verify-keys` compare every byte against the original writer and return a receipt. The small board sequence has nine System updates and six Keys updates. Its timings use per-encode microsecond windows and compute the digest outside them. One repetition keeps the cold run cold at each invocation. Repeat invocations within a block to sample variance.


Summarize the saved physical replay and check that every receipt agrees with the independently generated fixture manifest.

```sh
python3 "$runtime/07-summarize-board.py" "$study/various/physical.json"     "$runtime/results/board-capsule.json" "$work/physical-summary.json"
```
