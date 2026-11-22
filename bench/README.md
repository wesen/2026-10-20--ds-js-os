# bench

Measurement infrastructure: the gates every compiler or firmware change runs, on the host and on the ESP32-P4.
Everything here was promoted out of ticket scripts (PICOCALC-REPO-LAYOUT); a ticket script may call these tools,
and a difference between two uses is a parameter, not a copy.

| Path | What it is |
| --- | --- |
| `host/gates.sh [--options JSON]` | The three host gates with one set of compile options: ray frame, Chess oracle, 24 replays |
| `host/ray-profile.mjs` | Opening ray frame under named policies or options; must reproduce `reference/ray-opening.json` |
| `host/chess-engine.mjs GCC EMU` | Chess engine oracle: 6,981 words against chess 1.11.2, plus executed instructions |
| `host/replays/run.sh [--options JSON]` | The 24 host workflows (Files, Agenda, Editor; WASM and RV32 on rv32emu) |
| `emu/` | `rv32emu`, plus cji's freestanding C runtime built for it (`compiler/cji/tools/rv32/fw/`); `make -C bench/emu` |
| `board/` | The ESP32-P4 harness and the device library (flash, health, restore, install) |
| `reference/` | Fixtures and expected digests: opening frame, frame fixtures, Chess positions |
| `lib/` | `repo.mjs` (repository paths), `compiler.mjs` (loads the compiler; applies `TYPED_RV32_OPTIONS`), `toolchain.sh` |

Compile options reach every gate the same way: `--options '{"policy":"kernel"}'` sets `TYPED_RV32_OPTIONS`, and
`lib/compiler.mjs` makes it the default of every `typedRv32.compile` call, including those `typed-world.js` makes.

Scripts name repository files by repository-relative paths (`firmware/compiler/...`) and run from the repository
root, so a directory move is one rewrite of the path prefix.
