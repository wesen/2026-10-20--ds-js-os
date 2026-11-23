# docs

Current guides. A guide here describes the repository as it is; the tickets in `ttmp/` are the work log, and a
ticket's copy of a guide is the record of what was known when it was written.

| Guide | What it explains |
|---|---|
| [measuring.md](measuring.md) | Host gates, paired board studies, the device library, `PLAYABLE.json` and firmware profiles |
| [typed-compiler-and-the-ray-tracer.md](typed-compiler-and-the-ray-tracer.md) | How the Typed compiler's RV32 backend closed the ray tracer's gap to C, one board-gated step at a time |
| [rv32-executors.md](rv32-executors.md) | The three RV32 executors (reference interpreter, Go machine, rv32emu), their roles, and the conformance suite with RV32F captured on the P4 |
| [candela-on-the-p4.md](candela-on-the-p4.md) | Candela's presets path-traced by the firmware and shown on the screen (the playable gallery) |
| [agent/picocalc-agent-implementation.md](agent/picocalc-agent-implementation.md) | The LLM agent over the onboard ESP32-C6 (hardware, transport, build and provisioning) |
| `compiler/typed/rv32/README.md` | The RV32 backend's modules, policies and option switches |
| `cmd/trace-repl/doc/` (`trace-repl help`) | The compiler-evidence workbench: user guide, 25 query examples, JS API, CLI and HTTP |

## Where things are

| Path | What it holds |
|---|---|
| `firmware/` | The operating system: nucleus, native-world SDK, natives, host simulator, ESP32-P4 and PaperS3 ports, vendored third-party code, `PLAYABLE.json` |
| `compiler/typed/` | The Typed compiler (WASM and RV32 backends) the firmware runs at boot; `rv32/` holds the sources of the generated `typed-rv32.js` |
| `compiler/cji/` | CJI, the whole-program-inference compiler; the firmware's device compiler is built from it |
| `apps/typed/` | Typed worlds (Agenda, Candela, Chess, Editor, Files, the ray tracer), each with its link adapter |
| `apps/js/` | The QuickJS roots (`picocalc`, `papers3`) and the QuickJS Candela worlds (`worlds/`) |
| `apps/tours/` | Scripted sessions for the host simulator; `make -C firmware shots` captures them |
| `bench/` | Measurement: host gates, the board harness, the emulator, reference data |
| `tests/compiler/` | The Typed compiler's tests, including its pinned image digests |
| `tools/gen/candela/` | The generators of `firmware/third_party/candela`'s generated files |
| `cmd/trace-repl`, `pkg/` | The trace REPL (Go and goja) |
| `ttmp/` | Tickets: designs, diaries, results; never imported by code outside `ttmp/` |
