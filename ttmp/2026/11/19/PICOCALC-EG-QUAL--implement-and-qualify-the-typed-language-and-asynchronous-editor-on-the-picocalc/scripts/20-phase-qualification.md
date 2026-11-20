# Native Editor compiler phases on the PicoCalc

The phase build measures the interval reported by the existing native Editor compile log. The caller starts that clock before reading the application and reactor from the firmware bundle. The measurement ends after freeing the compiler's QuickJS context and runtime. The interval excludes loading the resulting Editor world and executing its generated program.

The phase recorder uses `port_clock()`, which reads the ESP32-P4 monotonic timer in microseconds. It adds each interval to the previous phase at a transition. C records input, runtime setup, bundle reads, each compiler script evaluation, argument setup, copy and teardown. JavaScript calls the recorder at the main rewrite and code generation boundaries. The native backend opens one phase while lowering a function and then returns to frontend emission. There is no marker per token, per source instruction or inside the inner native instruction loop. Streaming emits 121 functions pre-G and 119 in G4. The host check counted 122 and 120 emission entries because the frontend resumes before it checks the final call graph.

C prints the phase arrays after capturing the same finish time that it uses for the stock compile line. This keeps trace formatting and UART output outside the measured interval. Instrumentation still costs time when it calls the hook. Compare each phase-probed total with its uninstrumented observer image before treating the measured differences as production timing effects. Script evaluation includes QuickJS parsing, evaluation and freeing the temporary script values. The bundle-read phase accounts for compiler script input. The initial input phase accounts for the application source and reactor that the caller supplies. User-perceived boot and workflow timing have wider boundaries.

## Build both lanes

Run from the repository root with the existing matched native observer build caches. Each invocation stages a small overlay and restores the measured source files even if the build fails. It preserves the lane's fixed-wall-clock and search-observer changes. The new output directories retain the marked source, build log, image and manifest.

```sh
ticket=$(find ttmp/2026/11/19 -maxdepth 1 -name 'PICOCALC-EG-QUAL--*')
wave=/tmp/picocalc-eg-wave
idf=/home/manuel/esp/esp-idf-5.4.2/export.sh
python3 "$ticket/scripts/20-phase-qualification.py" pre-g "$wave/phase-pre-g" \
  --lane "$wave/pre-g" --idf-export "$idf"
python3 "$ticket/scripts/20-phase-qualification.py" g4 "$wave/phase-g4" \
  --lane "$wave/candidate-final" --idf-export "$idf"
```

The commands use `1357545` and `2e4fee1`. Pass only the variant and a new output directory to stage the exact source overlay without building. The builder hashes the reactor, verifies that the instrumented compiler scripts occur in the packaged image, and compares the manifests, config and partition table to the matched uninstrumented observer.

| Lane | Native measurement image SHA-256 |
| --- | --- |
| Pre-G | `62883b6cad288a872bd68ce32b28f20763bd537be8022a93b70d3b4a3a5126d5` |
| G4 | `dde4b0f6912db72f3ef8d6682d3db17fa225760745e339983bb47d37baddef79` |

The host check invokes `compileTypedWorldRv32` once per compiler and compares every linked byte. It also checks that each ordinary emission interval has a matching native lowering or is the final return from lowering. The build and host parity receipts are under [various/compiler-phases](../various/compiler-phases/).

## Reconcile the board records

Capture complete boot logs from the paired phase-probed native images. For each recorded compile keep the existing `editor compile source=bundle status=ok ...` line and the following `eg_compile_phase_v1 {...}` line. The raw `phase_us` and `visits` arrays use the manifest's phase order. Give the summary script one or more matched boot logs for each lane.

```sh
python3 "$ticket/scripts/20-summarize-phases.py" --last-per-log \
  --pre-g-manifest "$wave/phase-pre-g/manifest.json" --pre-g-logs "$wave"/phase-cold/phase-pre-g/boot-[123].log \
  --g4-manifest "$wave/phase-g4/manifest.json" --g4-logs "$wave"/phase-cold/phase-g4/boot-[123].log
```

The parser checks the raw integral phase sum against the exact compile total per sample. It cross-checks the non-instrumented manifests and reactor digests across the two builds, and checks the expected streaming and rewrite visits. The group mean deltas add to the mean total change. Per-phase medians describe the individual phase distributions, and the total's median is calculated from the untouched sample totals.
