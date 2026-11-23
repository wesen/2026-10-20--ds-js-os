---
Title: Diary
Ticket: PICOCALC-CANDELA-TYPED
Status: active
Topics:
    - compiler
    - rendering
    - esp32-p4
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Chronological record of PICOCALC-CANDELA-TYPED: the WGSL -> Typed generator for Candela's kernel and scene sections, the compiler gaps it met, host bit identity and image error against the C++ kernel, the device arm."
LastUpdated: 2026-11-23T00:03:37.314775468-05:00
WhatFor: "Reviewing what was built, measured and decided, with commands and commit hashes"
WhenToUse: "Before continuing the ticket or reviewing its commits"
---

# Diary

## Coordinator's instructions (verbatim excerpt)

> TICKET: PICOCALC-CANDELA-TYPED — write Candela's fixed kernel and its per-scene code in Typed, generated from
> Candela's WGSL/kernel.js by a generator next to the existing WGSL→C++ one, compiled to RV32 on the handheld; the
> renderer core (passes, accumulation, display pass, digests) in Typed; keep the C++ kernel as the benchmark arm.

Work plan given: verify the design and append Refinements; keep this diary; milestones (1) generator for the kernel and
B-01's sections, Wasm and RV32 bit-identical on B-01 at 4 passes on the host; (2) all 18 scenes: Wasm vs RV32 bit
identity and image error vs the C++ kernel within a bound fixed BEFORE measuring; (3) on the device: compile time and
heap, the gallery running the Typed arm (`gallery digest ID 4 psram typed|cpp`), digests equal to the host's Typed RV32
digests; (4) a paired board study, Typed vs C++, cycles per sample and seconds per pass; (5) the playable gallery draws
with the Typed arm by default when within the bound and the device digests match. Compiler gaps are worked around in
the generator where reasonable and recorded as tasks; small compiler fixes are allowed when gated by the 84-digest
harness and the tests. Gates: `make test`, `make test-host` (default and kernel), `bench/board/gallery.py` 18/18 on the
C++ arm; experiment images only through bench/board tools; restore from the main checkout; never write PLAYABLE.json.

## The image-error bound (fixed 2026-11-23, before any Typed-vs-C++ comparison was run)

The two arms are compared on the 4-pass accumulation, per pixel the mean colour m = acc.rgb / acc.a, over the
scene's w x h pixels and three channels:

- **E_rel = sum |m_typed - m_cpp| / sum |m_cpp|** (mean absolute error relative to the image's mean level).
- **Bound: E_rel <= 0.02 for every scene.** Also reported, not bounded: the fraction of pixels whose 4-pass
  accumulation is bit-identical, and the largest per-pixel relative difference.

Rationale: the Typed kernel mirrors the C++ kernel's CPU arm (same hashes, fast floor/sin/cos/exp, lazy selects,
evaluation order); the remaining numeric difference is libm (newlib's acosf, atan2f, logf, powf, tanf, asinf,
exp2f, log2f against compiler/typed/lib/math.typed, within a few ulp). Such a difference changes a path only where a
branch or a random decision flips; a flipped pixel differs by about the image's own noise (relative error of order 1
at 4 samples), so E_rel <= 0.02 allows at most about 2% of pixels to take another path, and a real lowering error
(a wrong sign, a missed component) biases most pixels and exceeds it by far.

## Step 1: A WGSL -> Typed generator for the kernel and the sections

The generator reads the same WGSL the C++ kernel is generated from (the fixed kernel of `kernel.mjs`'s
`fixedParts`, each scene's field and material code from `splitProgram`) and writes one Typed program for the kernel
and all 18 gallery scenes. Its WebAssembly and RV32 builds agree on every float of B-01's four passes, and its
images match the C++ kernel to a few ulp (seven scenes bit for bit). Two compiler changes were needed: frames
larger than sp's 12-bit offsets, and Wasm options for a 372 KB source and a larger memory.

### Prompt Context
**User prompt (verbatim):** see "Coordinator's instructions" above.
**Assistant interpretation:** Build the WGSL -> Typed generator next to the WGSL -> C++ one, reach host bit identity
of the Typed build's Wasm and RV32 forms on B-01 at 4 passes, then the 18 scenes against the C++ kernel.
**Inferred user intent:** Candela's kernel becomes Typed code compiled on the handheld; the C++ kernel is only the yardstick.
**Commit (code):** b3f788d — "compiler(typed): large frames through s0, and Wasm memory and source-limit options";
dd995e1 — "gen(candela): Candela's kernel and the gallery's sections in Typed, generated from its WGSL"

### What I did
- Read the design, `kernel.mjs`/`lib/wgsl2c.mjs` (regular-expression WGSL -> C++ relying on C++ operator
  overloading), `translator/parse.js` (the section subset: no loops), the kernel's WGSL (1,424 lines, 107 functions,
  9 structs; dumped with a scratch script), `cdl_math.h`/`cdl_overrides.inc`/`cdl_switches.h` and the gallery's
  switches in `cmake/candela.cmake`, the Typed front end (records, buffers, statements), the RV32 frame code.
- Probed the language with scratch programs: record fields of record type work, `const v = k.v; v.x = s` works,
  `k.buf.setF32(...)` and `k.buf.getF32(...)` do not (buffers and two-level assignment need a local), there is no
  `continue` and no ternary, a function body is statements up to its one top-level `return`.
- Wrote `tools/gen/candela/typed/`: `parse.mjs` (the kernel's WGSL subset, with `bitcast<T>` for the generator's
  own overrides), `values.mjs`, `lower.mjs` + `lower-calls.mjs` + `lower-statements.mjs` (the scalarizing lowering),
  `program.mjs` (overrides, signatures with frame overflow, needsK/touchesState/impure fixpoints, dispatchers,
  records, the arena layout, the glue entries), `host.mjs` (Wasm and RV32 over one memory image, the gallery's
  digests); `tools/gen/candela/kernel-typed.mjs`; `regenerate.mjs` writes and checks
  `apps/typed/candela-gallery/{types,kernel,scenes,glue}.typed, layout.json`.
- Ticket scripts: `01-cpp-ref.c` + `01-build-cpp-ref.py` (the C++ arm on x86-64, dumping frame-0 pixel outputs and
  the 4-pass accumulation per scene), `02-compare.mjs` (Typed Wasm/RV32 and the image error against the dumps).
- Compiler: `rv32/emit/function-code.js` (large-frame prologue/epilogue), `emit/stack.js` (`LARGE_BASE`, load/store
  switch to s0 above it, slot base), `emit/homes.js`, `encoding/registers.js` (`S0`); `wasm/module.js`
  (`maxSourceLength`, `memoryPages`); `tests/compiler/typed-rv32-large-frame.test.mjs`.

### Why
- WGSL, not the C++: the C++ is a textual product whose vector semantics live in C++ overloads; a typed lowering
  from WGSL sees every vector and struct.
- Mirroring the C++ CPU arm's math exactly (instead of math.typed's `sinf`/`expf`) makes the arms comparable bit for
  bit wherever libm is not involved, which turned the C++ build into a debugging oracle (below).
- One program for all scenes: one compile on the device for the whole gallery.

### What worked
- `node tools/gen/candela/regenerate.mjs --check`: 5 generated Typed files current.
- B-01, full program (18 scenes, 402,680-byte image, 299 ms host compile under `kernel`), all pixels of 4 passes,
  Wasm against RV32 on the reference interpreter: `"rv32Frame0":"952a91d9","rv32Acc":"03389cb1","rv32FloatsDiffer":0`
  (153 s on the interpreter).
- Against the C++ arm (x86-64), all 18 scenes within the bound (Step 2's table).
- Gates for b3f788d: `make test` exit 0 (pinned image digests unchanged); `make test-host`: ray `430f0d501659`, Chess
  6,981 words, 25/25; `make test-host OPTIONS='{"policy":"kernel"}'`: ray 3,239,635 instructions `430f0d501659`,
  Chess 6,981, 25/25.

### What didn't work
- `typedRv32.compile` under `kernel`: `RV32 function frame exceeds the instruction range` (sampleLobe: 389 locals
  after `inline`, 607 after `split`); `stock` and `interactive` compiled. Fixed in the compiler (large frames).
- `typedWasm.compile(source)`: `input limit exceeded` (64 KiB default) and a one-page memory; added options.
- First comparison with the C++ arm, B-01: `"eRel":0.3541`, 0.1% identical pixels, every escaped ray the same
  colour. Cause: `q_floor`'s range test was `x > 2.1e9 && x < 2.1e9` (a missing minus), so floor returned x,
  breaking sin, cos and the sky. After the fix: `"eRel":7.849e-8`.
- Then five scenes outside the bound (V-03 0.033, V-04 0.064, X-03 0.71, R-04 0.197, G-03 0.41). Traced X-03
  pixel (37,12) with a printf copy of the C++ kernel: the second bounce hits object 0 (an fbm-displaced SDF) in
  C++ and misses it in Typed; `noise3` differed (0.0198 vs 0.0307). Cause: `gnoise` has nine f32 parameters, so
  `o` goes through its frame, and in `mix(gnoise(.., o1), gnoise(.., o2), t)` both frame stores were emitted
  before either call ran. Fix: a call whose arguments went through the callee's frame is bound to a local at once.
  After it every scene is within the bound.
- Probe errors on the way: `unknown local continue`; `unknown member buffer.getF32` (`k.buf.getF32`); `expected =`
  on `k.buf.setF32` (two-level assignment).

### What I learned
- Typed's f32 rules (round-to-nearest everywhere, no contraction, min/max returning the non-NaN operand, saturating
  conversion) are exactly the C++ arm's under `-ffp-contract=off` on RV32, so whole scenes agree bit for bit.
- The inline pass's f32 rule ("f32 callees anywhere") multiplies locals in a 600-line function; the frame limit was
  the first wall, not compile time.
- The host compile is cheap (299 ms for 372 KB of source under `kernel`); Wasm renders B-01's four passes in 120 ms.

### What was tricky to build
- Evaluation order. WGSL evaluates left to right; the lowering keeps pure expressions as text and binds to locals,
  at the point of evaluation, every call with an effect on module state, every read of a module variable, every call
  returning a vector or struct, and (after the gnoise bug) every call with frame arguments.
- `continue` folding: `if (c) { A; continue; } rest` becomes `if (c) { A } else { rest }`; when both branches of a
  statement fall through into a continuation the fold would duplicate it, so that loop (tracePath's) becomes
  `let brk = false; while (true) { body; break; } if (brk) break;` inside its `for`, with `continue` as the inner
  `break` and `break` as `brk = true; break;`.
- The single scene dispatcher: with one scene the leaf `return` is top-level and Typed refuses a second `return`.

### What warrants a second pair of eyes
- The large-frame form (`function-code.js` lower()): the prologue order (sub sp; save ra, s0, saved; s0 = sp + 2032)
  and that nothing reads an sp slot at 2032 or more except through load/store.
- Struct aliasing rules in `declareStruct`/`userCall` (immutable let aliases; a destination that is also an
  argument goes through a temporary; the NRVO local is `q_ret`).

### What should be done in the future
- Compiler tasks: `continue`; a conditional expression; `u32`; local records and arrays; buffers as record-field
  receivers; f32 analyses (ranges/value sets skip f32 functions).

### Code review instructions
- Start at `tools/gen/candela/typed/program.mjs` `generateTypedProgram`, then `lower.mjs` (values, expressions),
  `lower-calls.mjs`, `lower-statements.mjs`.
- `node tools/gen/candela/regenerate.mjs --check`; `node --test tests/compiler/typed-rv32-large-frame.test.mjs`;
  `python3 -I ttmp/.../scripts/01-build-cpp-ref.py /tmp/w 4 /tmp/w/out && node ttmp/.../scripts/02-compare.mjs /tmp/w/out 4`.

### Technical details
- K's fixed fields: `bU bO bL bB bS etab sky scene spectral skyOn r1 r2 r3 ri1`, then the globals (`rngS gTime gLam
  gTau gTri gBary__x gBary__y`), `pix`, one `f_<fn>` per framed function. Arena for the gallery program: see layout.json.

## Step 2: All 18 scenes on the host

All 18 scenes are within the bound against the C++ arm, and 7 of them are bit-identical to it. Wasm against RV32 on
the reference interpreter takes 2 to 8 minutes per scene: every pixel of 4 passes, every float compared.

### Prompt Context
**User prompt (verbatim):** see "Coordinator's instructions" above (milestone 2).
**Assistant interpretation:** Bit identity Wasm vs RV32 on all scenes, image error vs C++ under the bound fixed beforehand.
**Inferred user intent:** The Typed arm is a faithful kernel, not an approximation.
**Commit (code):** dd995e1 (the generator and the comparison scripts).

### What I did
- `python3 -I scripts/01-build-cpp-ref.py /tmp/candela-typed-cppref 4 /tmp/candela-typed-cppref/out` (C++ arm,
  x86-64, `-ffp-contract=off`), then `node scripts/02-compare.mjs /tmp/candela-typed-cppref/out 4 --rv32 all --policy
  kernel --json /tmp/candela-typed-runs/rv32-all.jsonl`.

### What worked
- Image error, Typed (Wasm) against C++, 4 passes, bound E_rel <= 0.02:

  | scene | E_rel | scene | E_rel | scene | E_rel |
  |---|---|---|---|---|---|
  | B-01 | 7.8e-8 | F-01 | 4.9e-8 | V-03 | 3.4e-5 |
  | R-01 | 0 (identical) | V-02 | 8.2e-10 | V-04 | 1.2e-7 |
  | L-03 | 5.2e-8 | G-02 | 0 (identical) | R-08 | 2.5e-8 |
  | G-01 | 2.4e-8 | X-04 | 0 (identical) | X-03 | 0 (identical) |
  | E-02 | 0 (identical) | S-02 | 0 (identical) | R-04 | 4.3e-4 |
  | W-02 | 0 (identical) | R-05 | 3.7e-10 | G-03 | 2.0e-4 |

- Wasm against RV32 (`kernel`), every float of every pixel output: identical on B-01, R-01, L-03, G-01, E-02,
  W-02 and F-01 (frame0 and acc digests equal, `rv32FloatsDiffer` 0). The run continues on the rest.

### What didn't work
- Nothing new after Step 1's two fixes.

### What I learned
- The scenes that differ from the C++ arm are exactly those that call a libm function the C++ takes from newlib
  (atan2, acos, pow, log ...); the error stays in ulp unless a path flips (R-04 and G-03, at about 1e-4).

### What warrants a second pair of eyes
- That the bound was fixed before measuring: see the bound section above (written before 02-compare.mjs first ran).

### What should be done in the future
- Let the RV32 run finish: `node scripts/02-compare.mjs CPPDIR 4 --rv32 all` (about 1 h 15 min).

### Code review instructions
- `scripts/02-compare.mjs` (the E_rel computation in `imageError`).

### Technical details
- Accumulation digests (Typed): B-01 03389cb1, R-01 2ac5b8e1, L-03 c0519f24, G-01 4f2687d5, E-02 6edba2ef, W-02
  865eba2b, F-01 89ae4615, V-02 3f4c9748, G-02 81a65012, X-04 a0aafa50, S-02 a4d9bc0b, R-05 cae0fb77, V-03 2716306a,
  V-04 09e15ac2, R-08 12245ce3, X-03 4f975e1b, R-04 7d26976a, G-03 74757b03.

## Step 3: The Typed arm on the device (stopped by the board)

The firmware half of the Typed arm is written and builds: an optional `begin` hook in the renderer core, the
compile/relocate/arena code in `candela_typed_p4.c`, arm selection on the console, and host reference digests
through the same renderer core. The first device run compiled the 372 KB program on the handheld in 85.9 s, then
the ELF relocation panicked. I wrote a fix, but before it could run on the board the keyboard controller stopped
answering, which fails every install's health check, playable's included.

### Prompt Context
**User prompt (verbatim):** see "Coordinator's instructions" above (milestone 3).
**Assistant interpretation:** Compile and run the Typed arm on the P4, measure compile time and heap, digests equal to host.
**Inferred user intent:** The handheld renders the gallery from Typed it compiled itself.
**Commit (code):** see the commit after dd995e1 ("firmware(gallery): the Typed arm ...").

### What I did
- `firmware/nucleus/candela_gallery.{h,c}`: `cg_instance.begin(d, b, err, n)`; with `vm_load` NULL the core skips the
  section interpreter.
- `firmware/port/esp32p4/main/candela_typed_p4.c` (`cgt_gallery`, `cgts_gallery`), `candela_typed_slot.{c,S}` (a
  768 KB code slot, four entries), `apps/typed/candela-gallery/{app.json,link.js}`.
- `candela_gallery_p4.c`: arms `cpp` and `typed`; `gallery arm [typed|cpp]`, `gallery digest ID N VARIANT
  [typed|cpp]`; records carry `arm` and the digest's `beginMs` (compile included on first use).
- Host reference: `scripts/03-typed-dump.mjs` (all pixel outputs from the Wasm build) and `scripts/03-typed-ref.{c,py}`
  (replays them through `nucleus/candela_gallery.c` with the gallery's scene table, so `disp` includes the core's
  meter and tone map) -> `bench/reference/candela-gallery/typed-4-passes.jsonl`; `bench/board/gallery.py --arm`.
- Profile `candela-typed` (playable + `candela-gallery`); playable is unchanged.
- Device run 1 (`scripts/04-device.py /tmp/candela-typed-dev1 --install /tmp/candela-typed-fw`; image 9952b4c2, with
  the app in the playable profile at that point): install and health OK. Boot compiles: Chess 4,189,844 us (70% of
  6,000 ms), Chess painter 5,682,591 us (71% of 8,000), Editor 3.43 s, Agenda 2.65 s, Files 1.45 s, Candela 2.54 s.
- `gallery digest B-01 4 psram typed`: `candela-gallery compile source=bundle status=ok us=85888402
  peak_js_bytes=16272600 module_bytes=787712`.

### What didn't work
- During the compile: `E (117070) task_wdt: CPU 0: cgt-compile` every 5 s (the compile task at priority 1 starved
  IDLE0; now priority 0).
- After it: `assert failed: spi_flash_disable_interrupts_caches_and_other_cpu cache_utils.c:152
  (esp_task_stack_is_sane_cache_disabled())`, reboot. esp_elf's relocation disables the caches, which is illegal
  from the compile task's PSRAM stack. Fix: the relocation runs on a second task with a 6 KB internal stack (image
  2647c67b), not yet run on the device.
- Device run 2 (`/tmp/candela-typed-dev2`): `ValueError: physical keyboard I2C0 did not qualify: {... 'transfers':
  292, 'bytes': 1171, 'errors': 292} -> {... 'transfers': 313, ... 'errors': 313}`, UART `E (20563) i2c.master: I2C
  transaction unexpected nack detected`, `keyboard: i2c: i2c0 0x1f: ESP_ERR_INVALID_STATE`.
- `make restore-playable` from the main checkout: flash written and `verify OK (digest matched)`, health the same
  ValueError. So the keyboard controller, not the image: it most likely wedged in the transaction the panic cut
  off. An ESP32 reset does not reset it; it needs a power cycle.
- I did not rerun the experiment with `--peripherals off-by-user`: the keyboard is not switched off on purpose, and
  that would skip the health judgement the rules require.

### What I learned
- The device compile of the whole gallery program is 85.9 s and 16.3 MB of QuickJS heap (heapBytes was 16 MiB:
  raised to 20 MiB). Against the ray tracer's 2.0 s for 13 KB, that is roughly linear in source size. A compile per
  boot is not acceptable for a default arm, so milestone 5 needs a cache.
- The C++ arm ran unchanged on the image (B-01 at 0.887 s per pass, 12,449 cycles per sample).

### What was tricky to build
- Three constraints at once in candela_typed_p4.c: QuickJS needs a big stack (PSRAM), esp_elf needs an internal stack,
  and the watchdog needs IDLE0 to run during an 86 s compile.

### What warrants a second pair of eyes
- `load()` in `candela_typed_p4.c`, the arena layout from `cdlLayout`'s cells (pointer fields get absolute
  addresses; buffer headers get capacities).

### What should be done in the future
- After a power cycle: `python3 -I scripts/04-device.py OUT --install BUILD "gallery pause" "gallery digest B-01 4 psram
  typed"`, then `python3 bench/board/gallery.py OUT --arm typed` and `--arm cpp`, then restore playable.

### Code review instructions
- `firmware/port/esp32p4/main/candela_typed_p4.c`, `candela_gallery_p4.c` (`instance_of`, `C_ARM`), `bench/board/gallery.py`.
- Build: `source ~/esp/esp-idf-5.4.2/export.sh && firmware/port/esp32p4/build.sh candela-typed /tmp/candela-typed-fw`.

### Technical details
- Host Typed digests (frame0/acc/disp): `bench/reference/candela-gallery/typed-4-passes.jsonl`, e.g. B-01
  952a91d9 / 03389cb1 / 23d7885f.
