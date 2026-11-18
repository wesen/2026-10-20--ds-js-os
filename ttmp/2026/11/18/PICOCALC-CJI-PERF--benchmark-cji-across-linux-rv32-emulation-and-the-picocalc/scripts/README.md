---
Title: Reproducing the compiler baseline
Ticket: PICOCALC-CJI-PERF
Status: active
Topics: [esp32-p4, native]
DocType: reference
Intent: long-term
---

# Reproducing the compiler baseline

Run the following from the repository root. Each command uses a separate process. Keep the build, source files and references fixed for the duration of the experiment. The output directory holds generated binaries, complete profiles, per-sample logs and JSON receipts.

```bash
scripts=(ttmp/2026/11/18/*CJI-PERF--*/scripts)
out=$(mktemp -d)
bash "$scripts/01-prepare.sh" "$out"
bash "$scripts/02-profile.sh" "$out" native files agenda
bash "$scripts/02-profile.sh" "$out" rv32 files agenda
python3 "$scripts/03-host-runs.py" "$out"
bash "$scripts/04-profile-guest-metrics.sh" "$out" files:8 agenda:8 agenda:10
python3 "$scripts/07-summarize.py" "$out" > "$out/report.json"
```

The summary includes only completed profiles whose SLIR matches the reference. Host timing sample counts exclude warm-ups. Inspect the count for each configuration when summarizing a directory still being populated. The AOT and RV32 profilers count different instruction sets.

For physical testing, source the ESP-IDF environment and run 08-build-board.sh to build the P4 firmware with native ELF support and the profiling probes enabled. Run 06-board-experiment.sh with an idle device, the output and build directories, the ESP-IDF esptool executable and cases such as files:8 agenda:8 agenda:10. It records the flash image and its ELF, uses the application partition, confirms a held keyboard bus, runs 05-board-runs.py, and captures a normal boot on exit. The checker compares the module digest to the port catalog. The workstation-specific as-run directory preserves the initial launch scripts and smoke input.

Earlier serial trials and one-time source edits are retained in the sibling PICOCALC-CJI-PORT ticket under scripts/2026-11-17-session and scripts/2026-11-18-session. Those scripts reference historical scratch paths and intermediate source revisions.

## Generated-world dispatch

Run `bash "$scripts/dispatch/build.sh" "$out"`, then `python3 "$scripts/dispatch/measure.py" "$out"`. The first builds a native x86-64 CJI world, a host harness linked with the project's QuickJS objects and an RV32 shared-unit world. The second alternates host engines, validates replies against a Python reference for every sample, and exercises the same messages through the emulator's NW event entry point. The tests operate on in-memory application state. The edit handler shares its task-line expression and toggle function with the shipped Agenda source, and measure.py checks those definitions for drift before running.

## Host profiling detail

Use 11-host-pass-times.sh for diagnostic per-pass timing. Use 12-host-instructions.sh for a symbolized but text-identical host executable and instruction-address Callgrind data. host-sampling/run.sh collects process-CPU instruction-pointer samples using that executable. The analysis keeps the raw timed samples separate from exact instruction counts. For source-level library and range counters use `node "$scripts/13-library-rounds.mjs" "$cji" agenda "$out/agenda.ref"`, where cji is the path to the CJI source directory. The Node diagnostic injects counters into the loaded source in memory and checks emitted bytes.

Use figures/capture-host.sh for the simulator image. Run figures/capture-device.sh with a private output directory after the physical experiment, using exclusive serial access. Inspect the decoded frames before publishing. figures/plot.py regenerates the figures from committed data. The editable diagrams are in figures/*.dot.
