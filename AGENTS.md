# PicoCalc OS and its compilers

This repository holds an operating system for the PicoCalc handheld (an ESP32-P4 in place of the Pico), the two
compilers that turn its applications into RV32 machine code on the handheld itself, the applications, and the
measurement infrastructure that decides which compiler work is worth keeping. `ttmp/` is the work log: tickets with
designs, diaries and results. Nothing outside `ttmp/` imports, globs or copies ticket code.

## The goal

Build an operating system whose code is Typed, compiled to RV32 on the handheld, in order to learn how to compile code
efficiently for RISC-V. When you decide where something is implemented:

1. **Typed first.** Applications, services and compute kernels (rendering, Candela, Chess) are written in Typed.
2. **QuickJS only as a fallback**, for code Typed cannot express yet. A boot app keeps a JavaScript version that runs
   when its compile fails or misses its deadline.
3. **C only if it cannot be avoided:** the nucleus and ports under the worlds, hardware access, the reactors' fixed
   runtime, vendored engines. Or **as a benchmark:** the C ray tracer and Candela's generated C++ kernel are the
   yardsticks Typed is measured against, not the implementations to keep.

A feature Typed lacks (floats, bitwise operators, arrays) is a compiler task, not a reason to write C. Code now in C
that could be Typed (Candela's kernel and scene sections, the app policy in the Agenda and Files reactors) is a
migration target. Earlier designs that chose C for speed or convenience, such as PICOCALC-CANDELA-P4's
"Why C and not Typed f32", predate this rule.

## Where things are

| Path | What it holds |
|---|---|
| `firmware/` | Nucleus, native-world SDK, natives, host simulator, ESP32-P4 and PaperS3 ports, `third_party/`, `PLAYABLE.json` |
| `compiler/typed/` | The Typed compiler the firmware runs at boot ([guide](docs/typed-compiler.md); `tape.js` defines its IR, `rv32/` holds the sources of `typed-rv32.js`) |
| `compiler/cji/` | CJI, whole-program inference and numeric range analysis; start with its [pass list](compiler/cji/src/pipeline.js) |
| `apps/typed/`, `apps/js/`, `apps/tours/` | Typed worlds with their link adapters; QuickJS roots and worlds; simulator tours |
| `bench/` | Host gates, the board study harness, `rv32emu`, reference data ([guide](docs/measuring.md)) |
| `tests/compiler/` | The Typed compiler's tests and pinned image digests |
| `tools/gen/candela/` | Generators of `firmware/third_party/candela`'s generated files |
| `cmd/trace-repl`, `pkg/` | The compiler-evidence workbench (Go and goja) |
| `docs/` | Current guides ([index](docs/README.md)) |

## Build, test, measure

```sh
make test                                   # Node, generated files, Go, the host binary's Python tests, cji
make test-host OPTIONS='{"policy":"kernel"}'  # ray frame, Chess oracle, 24 replays with one set of compile options
make -C firmware shots                      # host simulator tours -> firmware/out/
make firmware PROFILE=playable              # ESP-IDF v5.4.2; profiles in firmware/port/esp32p4/profiles/
make bench-board STUDY=bench/board/studies/NAME.json   # a paired study on the ESP32-P4, restoring the playable image
```

A compiler change runs the host gates; a claim that it is faster needs a board study ([measuring](docs/measuring.md)).
Every firmware profile builds reproducibly: one commit gives one app digest.

## Handheld firmware

Leave the latest playable firmware installed on the PicoCalc for everyday use. `firmware/PLAYABLE.json` records it,
and its files are stored by digest under `~/.cache/picocalc/firmware/`.

```sh
make playable && make install-playable      # build, flash, settle, health-check, rewrite PLAYABLE.json; commit it
make restore-playable                       # after an experiment image: reinstall what PLAYABLE.json records
python3 bench/board/run.py --probe DIR      # check store, board and health without flashing
```

Use `PERIPHERALS=off-by-user` when the keyboard and display are switched off on purpose. Only one process may use the
serial port at a time; `bench/board/device.py` holds the lock for every board operation.

## Research and reports

- The [compiler research index](ttmp/2026/11/19/PICOCALC-COMPILER-THESIS--cold-compilation-and-bounded-analyses-on-the-picocalc/reference/02-picocalc-compiler-research-index-and-open-directions.md) maps the native roadmap to experiments, production changes and open questions.
- The [four-study](ttmp/2026/11/19/PICOCALC-COMPILER-LAB--measure-cold-compilation-and-test-bounded-compiler-designs-on-the-handheld/analysis/01-which-compiler-work-pays-for-itself-on-a-handheld.md) and [eight-study](ttmp/2026/11/19/PICOCALC-COMPILER-LAB2--eight-experiments-in-compiler-construction-on-the-picocalc/analysis/01-what-a-compiler-can-afford-on-the-picocalc.md) supervisor reports give cold compilation, edit-to-native-return timings and generated-code measurements.
- The [independent RV32 studies](ttmp/2026/11/19/PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/index.md) and the [combined integration trial](ttmp/2026/11/19/PICOCALC-RV32-COMBINED--qualify-branch-fusion-with-compact-output-in-the-streamed-picocalc-compiler/analysis/01-what-happens-when-two-native-compiler-optimizations-share-the-same-output.md) measure branch lowering and native output allocation; the [integration guide](ttmp/2026/11/19/PICOCALC-COMPILER-INTEGRATION--integrate-qualified-compiler-optimizations-into-the-picocalc-toolchain/design-doc/01-production-integration-of-the-typed-compiler-optimizations.md) describes the compiler entry points.
- The [playable firmware qualification](ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc/analysis/01-promoting-two-native-compiler-changes-to-the-playable-picocalc.md) follows two compiler changes through complete Chess and Editor ELFs on the device.
- [How the Typed compiler reaches C on the ray tracer](docs/typed-compiler-and-the-ray-tracer.md) and [Candela on the P4](docs/candela-on-the-p4.md) are the current guides to the two largest workloads.
- The trace REPL: [CLI and session protocol](cmd/trace-repl/README.md), [user guide](cmd/trace-repl/doc/01-trace-repl-user-guide.md) (`trace-repl help trace-repl-user-guide`; 25 runnable scripts in `trace-repl help trace-repl-query-examples`).
- [Reorganizing the repository](ttmp/2026/11/21/PICOCALC-REPO-LAYOUT--give-every-piece-of-code-one-home-and-keep-ttmp-as-the-work-log/design-doc/01-reorganizing-the-repository-a-design-for-one-home-per-concern.md) explains this layout and why.

## Active tickets

See [ttmp/ACTIVE.md](ttmp/ACTIVE.md) for the tickets still open and what each is waiting on.
