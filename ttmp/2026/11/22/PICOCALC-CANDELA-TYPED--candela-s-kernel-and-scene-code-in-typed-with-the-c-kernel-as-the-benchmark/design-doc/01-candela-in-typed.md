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

## Refinements (2026-11-23)

Decisions taken against the code, in the order the work met them (diary steps 1-3).

**The generator's input.** Not the C++ (`cdl_kernel.cpp` is itself generated by regular expressions that lean on C++
operator overloading), but the same WGSL: `kernel.mjs`'s `fixedParts(K)` and each scene's field and material code
from `splitProgram`. `tools/gen/candela/typed/parse.mjs` is a real parser for the kernel's subset (the section
translator's `parse.js` rejects loops, arrays and module state), and the lowering is typed: every expression has a WGSL
type, abstract integer literals take their context's type, and the generator fails on anything outside what it
lowers (unsigned comparison or division, `f32(u32)` of a value that may exceed 2^31, struct constructors).

**Vectors and structs.** A vector is its scalar components everywhere: locals `p__x, p__y, p__z`, three parameters,
record fields `P__x`. A vector result is the first component as the Typed result plus the others in the kernel
record's `r1..r3` (`ri1` for `vec2i`), read by the caller in the statements right after the call. A struct is a
record of its flattened fields. Typed records are references to memory the host provides and WGSL has no
recursion, so every function that needs struct storage gets one static frame record `F_<fn>` (a field of the kernel
record `K`) holding a reference to one struct record per struct local or temporary, its local arrays (buffers) and
its parameters beyond ilp32f's eight per class. A struct parameter is the caller's record (WGSL parameters are
immutable); a struct result is written into a record the caller passes (`q_ret`), or a temporary when the destination
is also an argument; a function whose every `return` names one local struct writes that local in `q_ret` directly.

**Typed gaps worked around in the generator** (each a task for the compiler): no `continue` (folded into the
following statements, or a one-shot inner loop with a break flag in tracePath); no ternary (if/else into temporaries;
lazy `select` puts each argument's statements in its branch); no `u32` (an `i32` with `>>>`, unsigned comparison and
division refused); no local records or arrays (static frames, buffers with `Math.bitsOf`/`fromBits` for `i32`
elements); assignment only to `local.field` (record references are bound to locals); `buffer` methods only on
locals (the five row buffers bound in each function's prologue); every function needs a result (`i32` 0) and exactly
one final top-level `return`.

**Math.** The C++ gallery arm's CPU substitutions, operation for operation: `floor`/`fract` through `i32` conversion,
the degree-9 `sin`/`cos`, the degree-6 `exp` (`cdl_math.h`), pcg3d `hash3`/`hash13` and voronoi's cell hash
(`cdl_overrides.inc`, written in WGSL with a `bitcast` extension), the 64 x 64 sky table and its builder. Where the
C++ calls newlib (`acos`, `atan2`, `log`, `pow`, `tan`, `asin`, `exp2`, `log2`), `compiler/typed/lib/math.typed`.
With `-ffp-contract=off` on the C++ side and no fused operations in Typed, a scene that calls none of the libm
functions renders bit for bit as the C++ arm does on x86-64; seven of the 18 do.

**One program for the gallery.** The kernel and all 18 scenes' sections are one Typed program (10,000 lines, 372 KB,
403 KB of RV32 under `kernel`); the five functions the kernel calls in scene code dispatch on `K.scene` through a
binary tree, and SPECTRAL_ON is `K.spectral` in the kernel (a constant in each scene's sections), so one compile serves
every scene and both colour modes. Per-scene programs would save the dispatch and the spectral branches at the price
of a compile per scene change.

**Where the generated Typed lives.** `apps/typed/candela-gallery/{types,kernel,scenes,glue}.typed` and `layout.json`,
committed, written by `regenerate.mjs` and compared by its `--check` (`make test-generated`); `kernel.typed` and
`scenes.typed` are file-length exceptions marked generated. The app's source is those files with
`compiler/typed/lib/math.typed` after the records.

**The host ABI.** Four entries, in slot order: `cdlLayout(out)` describes the arena (word count, pointer fields and
targets, buffer headers and capacities) as UTF-16 cells, `cdlInit(K)` fills the GGX table, `cdlSky(K)` builds the
sky table from the scene's rows, `cdlRenderSpan(K, out, y, x0, x1, frame)` writes 12 floats per pixel (`cdl_pixout`).
`K`'s first ten fields are fixed (`K_FIXED`): the five row buffers, the GGX and sky tables, scene, spectral, skyOn.

**Compiler changes this needed** (gated by the pinned digests and the host gates): frames larger than sp's 12-bit
offsets (s0 as a second base; tracePath and sampleLobe have about 600 locals after inlining), and the Wasm backend's
source limit and memory size as options.

**The gallery's arms.** The renderer core gets an optional `begin` hook and an absent interpreter (`vm_load` NULL);
`candela_typed_p4.c` compiles the app on the first use of the Typed arm (on a core-0 task with a 96 KB stack,
since QuickJS needs more than the gallery's 24 KB), relocates it, lays out the arena and binds it as `cgt_gallery`
and `cgts_gallery`. `candela_gallery_p4.c` keeps the C++ instances as the benchmark arm and chooses by
`gallery arm typed|cpp` and `gallery digest ID N VARIANT typed|cpp`.

**Caching.** Not done yet: the compile's device cost decides it (diary).
