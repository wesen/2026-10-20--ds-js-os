---
Title: Candela in Typed
Ticket: PICOCALC-CANDELA-TYPED
Status: active
Topics:
    - compiler
    - rendering
    - esp32-p4
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Write Candela's fixed kernel and its per-scene code in Typed, generated from Candela's WGSL, compiled to RV32 on the handheld; keep the C++ kernel as the benchmark."
LastUpdated: 2026-11-22T19:30:07.354607977-05:00
WhatFor: ""
WhenToUse: ""
---

# Candela in Typed

## Where Candela is now

- Candela's front end (scene programs) runs unchanged in a QuickJS world (`apps/js/worlds/candela-world`); it stays JavaScript: scene programs are the user-facing language.
- The fixed kernel is C++ generated from Candela's `kernel.js`/WGSL by `tools/gen/candela` into `firmware/third_party/candela/kernel/cdl_kernel.cpp` (1,544 lines; 116 functions; structs, `vec3`, `sqrt` ×38, `sin` ×24, `cos` ×23, `floor` ×22, `exp` ×15, `atan2` ×11, `acos`, `log`, `pow`; a PCG hash `pcgH`).
- Per-scene sections are translated to register bytecode and interpreted in C (`firmware/third_party/candela/vm`); signed-distance-field scenes cost 1.55–2.81× path-traced ones.
- The gallery's renderer core (`firmware/nucleus/candela_gallery.c`) does passes, accumulation, the display pass and digests; the worker (`firmware/port/esp32p4/main/candela_gallery_p4.c`) runs on core 1 below the kernel task. 18 scenes match `bench/reference/candela-gallery/rv32-4-passes.jsonl` (`bench/board/gallery.py`).

## Design

1. **A WGSL → Typed generator** next to the WGSL → C++ one in `tools/gen/candela/` (the translator in `tools/gen/candela/translator/`). `vec3` and structs are scalarized into `f32` locals and record fields; functions become Typed functions (no recursion: WGSL has none either); the math calls go to the Typed math library (PICOCALC-TYPED-F32); `pcgH` uses the bitwise operators (PICOCALC-TYPED-BITWISE).
2. **Scene sections in Typed.** The same generator emits each scene's sections as Typed functions, compiled on the handheld when the scene is built, replacing interpretation.
3. **The renderer core in Typed:** passes, accumulation, the display pass (three `log2f` per pixel today) and digests. The C worker that schedules it on core 1 stays (C only where unavoidable).
4. **Compile cost.** The kernel is about six times the size of the Typed ray tracer, which compiles in 2.02 s under `kernel`. Measure the on-device compile; cache the compiled kernel image in flash keyed by its source digest and policy if needed (that is NATIVE-NEXT's module cache, scope B; do the minimum here).
5. **Reference and comparisons.** The oracle is Typed's own WebAssembly build (bit-identical to RV32). Against the C++ kernel, report per scene: image error (PSNR or max error over the 4-pass accumulation), cycles per sample and seconds per pass on the board, in a paired study. The C++ kernel stays in the firmware as the benchmark arm (selectable in the gallery's console, e.g. `gallery digest ID 4 psram typed|cpp`).
6. **Gallery.** Once the Typed path agrees with its own Wasm build and its image error is within a stated bound, the playable gallery draws with it by default; the coordinator installs that firmware.

## Gates

- Wasm vs RV32 bit identity for all 18 scenes at 4 passes; image error vs C++ within a bound fixed before measuring; board timings paired against the C++ arm; boot and health checks of the playable image with the Typed gallery.

## Rules every ticket follows

- **The goal (AGENTS.md).** Typed first, QuickJS only as a fallback, C only when unavoidable or as a benchmark. A missing Typed feature is compiler work.
- **No backwards compatibility.** Change any interface; tests and pins are tools, not promises.
- **Gates.** A change states its gate before it is made and records the result in the diary:
  - `make test` (Node, generated files, Go, the host binary's Python tests, cji);
  - `make test-host` and `make test-host OPTIONS='{"policy":"kernel"}'` (ray digest `430f0d50…`, Chess oracle 6,981 words, 24/24 replays);
  - *byte identity*: `tests/compiler` pins the image digest of each policy; a refactor that claims "no output change" must leave every pinned digest and every replay image unchanged;
  - *board*: a timing claim needs a paired study (`make bench-board STUDY=…`, `docs/measuring.md`).
- **The handheld.** One board, one serial lock (`bench/board/device.py`). A ticket may flash experiment images only through `bench/board` tools and must leave the playable image installed (`make restore-playable`). Only the program's coordinator installs a new playable firmware and rewrites `firmware/PLAYABLE.json`. The keyboard and display may be switched off by the user (`PERIPHERALS=off-by-user`); never debug them.
- **Generated files.** Edit `compiler/typed/rv32/*.js`, never `typed-rv32.js`; run `node compiler/typed/rv32/build.mjs`.
- **Moves and deletes** go through checked Python scripts in the ticket's `scripts/` (dry run, asserted counts), never shell one-liners.
- **Diary.** Each ticket keeps `reference/01-diary.md` in the investigation format (Prompt Context, What I did, Why, What worked, What didn't work with exact errors, What I learned, What was tricky, What warrants a second pair of eyes, Future work, Code review instructions, Technical details), one step per milestone, with commit hashes.
- **Commits** are focused, at validated boundaries, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
