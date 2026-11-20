# Reproducing the PicoCalc PSIX specialization study

The [research index](index.md) links the completed reports. Start with the host checks. The two physical measurements and chart are already archived and can be analyzed without touching a device.

## Recompute the physical result

From the repository root in Bash, select the ticket and run the summarizer. It uses Python 3 and Matplotlib. It checks the exact block counts, cache tallies, frame counts and board restoration assertions before writing `various/physical-summary.json` and `various/psix-staging-p4.png`. Individual samples and the original candidate and playable hashes live in the two physical receipts. Timing rows count successful calls. Firmware compared every byte against the frozen reference after stopping the timer.

```bash
ticket=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-PSIX-STAGING--*')
python3 "$ticket/scripts/04-results.py"
node "$ticket/scripts/review/07-derive-typed-record.mjs" > /tmp/psix-records.json
diff "$ticket/scripts/review/08-derive-results.json" /tmp/psix-records.json
```

## Run the independent controls

- The [static encoder guide](design-doc/02-static-emitter.md) builds the Chess Wasm reactor and executes 47 actual game inputs and 74 synthetic cases through generic JS, generic C, Wasm and CJI's RV32 emulator. It names the required compiler, emulator and cJSON paths.
- The [review program](scripts/review/01-binding-boundary.mjs) demonstrates how string reordering and numeric-width changes alter canonical bytes. The [independent cross-check](scripts/review/03-cross-review.mjs) extends the cases. The scalar record derivation above reads the original Chess and Agenda declarations.
- The [observed-shape reproduction](scripts/runtime/README.md) gives the Node, host QuickJS, cache retention, holdout and device-capsule commands. Compare like workloads and include training when the application would pay it.
- The [static team diary](reference/02-static-diary.md) gives the exact C compiler commands for the two-entry cache, including malformed inputs, numeric-width changes, canonical byte comparison and the legal rook selection trace.

## Run the physical follow-up

Use the matching ESP-IDF 5.4.2 setup and toolchain. The original qualified build includes an application image and matching partition table. By default the runner expects that directory at `/tmp/p4-system-fix-final/build` and verifies the running firmware before touching its application slot. A different copy of the same build can be supplied with `--original`. The normal USB device is `/dev/ttyACM0`; it can be overridden with `--port`. The runner replaces the application slot temporarily and verifies restoration. It takes an exclusive serial lock during the experiment and requires healthy System, compositor, Chess, Snake and Editor. Use a fresh scratch directory. The interactive display configuration matters for comparisons.

```bash
lab=$(find ttmp/2026/11/20 -maxdepth 1 -type d -name 'PICOCALC-RENDER-LAB--*')
work=$(mktemp -d /tmp/psix-board.XXXXXX)
make -C picocalc-os typed-world-reactor
python3 "$ticket/scripts/board/prepare.py" "$work"
bash "$lab/scripts/09-build-board.sh" "$work"
python3 "$ticket/scripts/board/run.py" "$work/build" "$work/measurement" --followup
```

The isolated source comes from the recorded playable revision, and preparation checks the two compiler files against the working tree. Fixtures and the host reference ELF are generated before building the research firmware. The original three-writer window used the experiment at project commit `d8f9810` with the same runner and no follow-up flag. The later build adds the relocated GCC table, an independently loadable instance of the prebuilt generated writer, a guarded copy-and-patch implementation and the two rook streams. A rerun writes its own receipt into the scratch directory. Archive a fresh run independently to preserve the published samples.

## Where the answers live

The [director report](analysis/01-compiling-the-screen-writer-on-a-handheld.md) identifies the measurement endpoints, block ordering, byte invariants, scope of automatic derivation and decision for a production trial. The [director diary](reference/01-director-investigation-and-reading-diary.md) records failures as well as successful runs. The [publication receipt](various/publication.txt) records the vault revision and two reMarkable deliveries.
