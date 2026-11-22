---
Title: Investigation diary
Ticket: PICOCALC-CANDELA-WORLD
Status: active
Topics:
    - picocalc
    - esp32-p4
    - quickjs
    - rendering
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/candela_world.c
      Note: Bytecode loader and host object built in Step 3
    - Path: repo://picocalc-os/tools/candela-bc.c
      Note: Build-time bytecode compiler (Step 3)
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-WORLD--candela-s-javascript-front-end-as-a-quickjs-world-on-the-picocalc/scripts/04-compare.py
      Note: Digest comparison of world records against Node (Steps 4 and 6)
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-WORLD--candela-s-javascript-front-end-as-a-quickjs-world-on-the-picocalc/scripts/08-run-device.py
      Note: Device measurement run with restore (Step 6)
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-WORLD--candela-s-javascript-front-end-as-a-quickjs-world-on-the-picocalc/various/02-node-reference.json
      Note: Node reference digests (Step 2)
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-WORLD--candela-s-javascript-front-end-as-a-quickjs-world-on-the-picocalc/various/05-host-suite.cw.log
      Note: Host simulator suite records (Step 4)
ExternalSources: []
Summary: 'Chronological record of putting Candela''s front end into a QuickJS world on the PicoCalc: vendoring, the bytecode bundle, the module loader and host object, host-simulator validation, firmware integration and the device measurements.'
LastUpdated: 2026-11-22T01:10:00-05:00
WhatFor: Reproduce or review any step of PICOCALC-CANDELA-WORLD; find the evidence behind each number
WhenToUse: Before changing the Candela world, its bundle, its host functions or the renderer seam
---

# Investigation diary

## Step 1: The brief, the inputs, and how worlds load code today

The work started from a brief written by the launching agent, not by the user. I read the ticket stub, the parent ticket's design and QuickJS study, the nucleus (`vm.c`, `kernel.c`, `nucleus.h`, the prelude), the P4 port's `main_p4.c`, `port_p4.c`, `typed_p4.c` and `CMakeLists.txt`, and the sibling CPU-KERNEL branch, before writing anything. The worktree branch had been created 288 commits behind `main` and did not contain the 2026-11-21 tickets; I fast-forwarded it to `main` (`1fc0f1e`).

### Prompt Context

**Brief (from the launching agent, not a user prompt; summarized):** implement PICOCALC-CANDELA-WORLD: a QuickJS world that loads Candela's front end unchanged, runs a scene file, produces WGSL and packed buffers with digests equal to Node's, and hands them to the firmware renderer through host functions (interface defined and stubbed; the renderer is FIRST-LIGHT's, the kernel CPU-KERNEL's and the section bytecode SECTIONS'). Deliver the bytecode bundle (compiled at firmware build time, loaded as the prelude is), the shims (`atob`, memoised `ggxTableWGSL`), a scene loader that names scene files, a T0 subset check, the manifest entry (4 MB, turn budget, C stack, a boot-segment or worker pattern for long builds), the host functions and frame events, and device measurements (module load from bytecode; B-01 build, compile and pack; peak heap and C stack; all T0 presets within the limits with digests equal to Node's; a dynamic parameter re-pack within one 50 ms turn for B-01). Device rules: measurement image built from this worktree on the `build-smooth-chess.sh` configuration plus the world; flash only to measure; restore the playable firmware named in `/tmp/picocalc-current-playable.txt`; the serial lock for every serial or flash operation; stop on a keyboard I2C failure. Do not modify `picocalc-os/compiler/`, `picocalc-os/tests/`, or the CPU-KERNEL, SECTIONS, RAY-PARITY and COMPILE-BUDGET tickets. Keep this diary; commit on the branch without pushing; write and push a vault report once device measurements exist.

### What I did
- `git merge --ff-only main` in the worktree (the 11/21 tickets and the current firmware were only on `main`).
- Extracted `~/Downloads/candela-workspace(1).zip` (SHA-256 `873b2dd4...df5d`, verified) into a new empty directory, `scratchpad/cw/candela-src`.
- Read `nucleus/vm.c`: worlds are QuickJS runtimes created in `vm_create` with a 600 ms boot segment; the prelude is compiled once at boot to bytecode (`build_prelude_cache`, `JS_WriteObject`) and read into each runtime with `JS_ReadObject` + `JS_EvalFunction` (only in `PICOCALC_TYPED_AGENDA` builds). The prelude deletes `__k`/`__ka` from the global object, so a world cannot reach host operations the prelude does not wrap.
- Read `port/esp32p4/main/main_p4.c`: the kernel task has an 80 KB internal stack; `port_js_stack()` gives every runtime 56 KB of it.
- Read the CPU-KERNEL branch (`worktree-agent-a8febfba2a530536c`, read only): its C interface is `cdl_buffers {U, O, LI, BV, SD}` of vec4 rows and `NS_bind`/`NS_render_span`; its `lib/candela.mjs` `splitProgram()` splits `compiled.shared` into fixed and generated parts.

### What I learned
- Typed worlds that compile for seconds (Chess 3.8 s) do it synchronously inside `port_read_file` at boot, on the kernel task, under a `p4_compile_limits` deadline. There is no worker that runs a world's own JavaScript.
- `kernel_now()` on the device is the real clock even inside a segment; on the host it is the virtual clock.
- Candela's front end needs only `performance.now()`, `console` (params.js) and `atob` (K-09) from its host.

### Technical details
- Ticket: `ttmp/2026/11/21/PICOCALC-CANDELA-WORLD--candela-s-javascript-front-end-as-a-quickjs-world-on-the-picocalc/`.
- Current playable firmware at the start: `/tmp/picocalc-playable-smooth-chess-676ae95/build`, app SHA-256 `b22a807d...f62c`.

## Step 2: Vendoring Candela, and a Node reference with the world's own modules

Candela's sources are downloaded data, and the firmware build must not depend on `~/Downloads`. I copied the 15 modules of `src/candela.js`'s import closure and the 28 T0 preset scenes into `picocalc-os/third_party/candela` with a pin, and wrote the world's pure modules so Node can run them too: the frame uniforms, the subset check and the program split. A Node reference then gave the digests the device must reproduce, and two cross-checks against Candela itself.

### What I did
- `scripts/01-vendor-candela.py ARCHIVE ROOT TIERS DEST`: checks the archive digest, computes the import closure from the import lines (15 modules, 329,461 bytes, as the parent study counted), copies T0 scenes by `id:` frontmatter, writes `PIN.json` (per-file SHA-256). `kernel.js` and `compile.js` match CPU-KERNEL's pin (`253d242d...`, `6f5926cc...`).
- `worlds/candela-world/frame.js`: `Viewport.frame()`'s uniform writes (rows 0-5, 20, 21, words 80-87, 96) for a fixed 160 x 160, pass counter 0.
- `worlds/candela-world/subset.js`: the census's feature extraction and `02-tiers.mjs`'s rules, with a location per feature (the shape's `comp.meta.loc`, the material's first shape, else the scene), diagnostics `E790` (Candela uses E700, E710, E720, E730).
- `worlds/candela-world/program.js`: CPU-KERNEL's `splitProgram()` and `fixedText()`.
- `scripts/02-node-reference.mjs` with `lib/resolve-hooks.mjs` (Node resolve hooks mapping `candela:X` and `world:X` as the device does).
- `worlds/candela-world/scenes/B-01p.js`: B-01 with its sphere roughness as a dynamic parameter (B-01 has none).

### What worked
- `node 02-node-reference.mjs --candela third_party/candela --world worlds/candela-world --out various/02-node-reference.json`: 28 T0 presets and B-01p build; every one is T0 by subset.js.
- `--archive` mode over the archive's presets: subset.js agrees with `02-tiers.json` on 94 of 94 presets checked (M-12, X-02 and the K presets skipped for time), and frame.js's U equals the U that Candela's own `Viewport.frame()` hands a recording backend on 94 of 94.

### What I learned
- In Node, Candela reports user errors two lines late: `new Function` puts two header lines before the body (the probe measures 2), and `runFiles` adds two more (`"use strict";`, `return (async () => {`) that nothing subtracts. A throw on line 4 is reported at line 6 (`node loc.mjs`, Step 4).
- Unbundled, any Candela-generated location from inside `src/scene.js` resolves to `scene.js:56` or `scene.js:114`: `diag.js`'s FRAME regex keeps only a frame's base name, and Candela's own `scene.js` frame comes first.

### Code review instructions
- `python3 -I scripts/01-vendor-candela.py "~/Downloads/candela-workspace(1).zip" EXTRACTED/candela ../PICOCALC-CANDELA-P4--*/various/02-tiers.json picocalc-os/third_party/candela`
- `node scripts/02-node-reference.mjs --candela picocalc-os/third_party/candela --world picocalc-os/worlds/candela-world --out OUT.json`

## Step 3: The bundle, the loader and the host object

The bundle is built on the build machine by `tools/candela-bc`, a C program linked with the same `third_party/quickjs`. The world's runtime reads it through a module loader in `nucleus/candela_world.c`. The first `candela-bc` run failed, because QuickJS resolves a module's imports while compiling it.

### What I did
- `tools/candela-bc.c`: `--list worlds/candela-world/bundle.list ROOT`; entries `module`, `memo`, `text`, `text-dir`, `ggx`. `ggx` evaluates `kernel.js` once and keeps the JSON of `ggxAlbedoTable()` and `ggxTableWGSL()`; `memo` substitutes them into `worlds/candela-world/kernel-memo.js`. Output "CQB1": magic, QuickJS version string, entries (kind, name, bytes). `JS_SetStripInfo(rt, JS_STRIP_SOURCE)`: function source text stripped, line tables kept.
- `nucleus/candela_world.c`: bundle parser; `cw_normalize` (absolute `scheme:name`, `./x.js` relative within a scheme; `candela:kernel.js` from anywhere but the memo resolves to `world:kernel-memo.js`); `cw_load` (`JS_ReadObject(..., JS_READ_OBJ_BYTECODE)`, time and bytes counted); `__candela` with `now`, `steps`, `mem`, `resetPeak`, `gc`, `longSegment`, `loaderStats`, `stackPaint`/`stackUsed`, `sha256` (FIPS 180-4 in C), `utf8Length`, `text`/`list`, `evalScript`, `report` (a deferred `CW {json}` console line) and `render.{start,update,stop,status}`.
- `nucleus/candela_render.h` (the seam) and `nucleus/candela_render_stub.c`.
- Nucleus: manifest `long_ms` and `stack_kb`; `vm_long_segment()`; `world_t.mem_peak`; the install hook after the prelude in `vm_create` and the dispose hook in `vm_dispose`.
- `worlds/candela-world/shims.js`: `atob` (WHATWG forgiving-base64), `performance`, `console`, and a `Function` that compiles bodies ending in `//# sourceURL=NAME` through `evalScript` with that file name.

### What didn't work
- First `candela-bc` run:
  ```
  candela-bc: candela:candela.js: ReferenceError: could not load module 'diag.js'
  ```
  `__JS_EvalInternal` calls `js_resolve_module()` even with `JS_EVAL_FLAG_COMPILE_ONLY` ("Could add a flag to avoid resolution if necessary"). Fixed by queueing all sources first and compiling through a module loader with the device's names, so each module is compiled once, when first imported.

### What was tricky to build
- Module names. `diag.js`'s FRAME regex strips every directory, so `candela/src/scene.js` would collide with the user's `scene.js` exactly as in Node. Names of the form `candela:scene.js` contain no `/`; the regex cannot match them at all, so Candela's own frames are skipped and the user's frame is found.
- Line numbers. The world's `Function` lays out ordinary bodies as V8 and QuickJS do (two header lines: Candela's boot probe still measures 2), but joins `runFiles`' two prefix lines onto the header's second line, so `scene.js` line L is source line L + 2 and Candela reports L.
- Module values are reference-counted in this QuickJS: `JS_ReadObject` returns a module value with two references (the context's list and the value); the loader frees the value, as quickjs-libc does after `JS_Eval`.
- Deferred effects: `render.start`/`update` and `report` are deferred, so a segment that crashes starts nothing and reports nothing. `discard_deferred()` frees `d->bytes` and `d->json` with `free()`, so the scene and the program are each one malloc'd block.

## Step 4: The whole world in the host simulator

`make CANDELA=1 candela` builds `build-candela/picocalc-host` with the world and stages `build-candela/candela-js` (a copy of `js/`, the bundle, the world script, the manifest with the world appended). It worked end to end on its first run.

### What I did
- `scripts/03-host-smoke.txt` (load, B-01 measured, status, B-01p and a parameter move), `scripts/05-host-suite.txt` (every reference scene, measured), `scripts/04-compare.py`, `scripts/06-diag-probes.py` + `07-diag-node.mjs` (five scenes with a mistake on a known line).

### What worked
- Load in the 64-bit simulator: 21 modules, 470,244 bytes of bytecode, 2.5 ms, of which `JS_ReadObject` 1.2 ms; heap after load 1,348,048 bytes (the study's source-loaded runtime: about 1.57 MB in 64-bit).
- `04-compare.py various/02-node-reference.json suite1.log`: 27 of 28 built scenes equal to Node on all 15 digests (WGSL, pack at t = 0 and t = 2.5, frame uniforms, sections) and the fixed-kernel digest `8925739795c7...`.
- Diagnostic probes, world against Node: throw on line 4 `E000@scene.js:4` (Node `:6`); misspelt method on line 4 `E104@scene.js:4` (Node `:56`); a torus on line 5 `E790@scene.js:5` (Node, same subset.js, `:114`); a surface field on line 5 `E790@scene.js:5`; a syntax error `E001@scene.js:1` in both.

### What didn't work
- D-02: `pack0.O` and `pack0.BV` differ from Node (WGSL equal). D-02 calls `Math.random()` in a build lambda (Candela warns W501); the prelude seeds `Math.random` per world, so it differs from any other run by design.
- M-12 is not built: `candela crashed handling build: ran past its long segment budget of 4000 virtual ms`. Its scene runs a Monte Carlo furnace test (100 M steps). Expected; the world restarts and the next build proceeds.

### What should be done in the future
- `syntaxLoc()` matches V8's syntax-error wording; QuickJS's differs, so syntax errors are located at line 1 in both engines here.

## Step 5: Firmware integration behind PICOCALC_CANDELA_WORLD

The world goes into the playable firmware's configuration (`build-smooth-chess.sh`) only when `-D PICOCALC_CANDELA_WORLD=ON` is passed. The script now forwards extra arguments to `idf.py` after its own; with none, the `idf.py` command line is the same as before.

### What I did
- `port/esp32p4/CMakeLists.txt`: `option(PICOCALC_CANDELA_WORLD ... OFF)`.
- `port/esp32p4/main/CMakeLists.txt`, after the Chess block (so the world is appended after Chess, before the Editor/Files/Agenda manifests are written from `typed_manifest`): build `candela-bc` with the build machine's C compiler from the same `third_party/quickjs` sources (version from `third_party/quickjs/VERSION`, as the firmware's `CONFIG_VERSION`), run it over `bundle.list`, add `candela/front.qbc` and `candela/world.js` to `BUNDLE_EXTRA`, and append `worlds/candela-world/manifest.json` to `typed_manifest` at index `string(JSON LENGTH)`. The option requires `PICOCALC_TYPED_CHESS`.
- `main_p4.c`: console command `send WORLD TYPE [JSON]` (under the flag), delivering a message as `picocalc-host` scripts do. Console commands already run on the kernel task (`p4_kq`), so `defer_deliver` is called from the task that owns the kernel.
- `build-smooth-chess.sh BUILD [-D OPTION=VALUE ...]`.
- `scripts/08-run-device.py`: the measurement run (Section "Device rules" of the brief): reads `/tmp/picocalc-current-playable.txt` when it starts, takes the serial lock with `board_common.acquire()`, health-checks the playable image, holds I2C, writes and verifies the measurement app, health-checks it, sends the plan's `send candela ...` lines and waits for each step's record, then in `finally` writes, verifies and health-checks the playable app.

### What I learned
- The generated agenda manifest (`build/esp-idf/main/system.typed-agenda.json`) lists 25 worlds, the last `{"name":"candela","file":"candela/world.js","long_ms":4000,"mem_kb":4096,"stack_kb":56,...}`.
- World heap on the P4 comes from PSRAM (`port_heap_malloc`: `heap_caps_aligned_alloc(..., MALLOC_CAP_SPIRAM)`), so `CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL=4096` does not put QuickJS's small allocations in internal RAM.
- The bundle read by `port_read_file` (500 KB) is kept for the life of the firmware and is not charged to the world.

### What didn't work
- First firmware build (`build-smooth-chess.sh BUILD -D PICOCALC_CANDELA_WORLD=ON`), `-Werror=format` on RV32, where `uint32_t` is `long unsigned int`:
  ```
  nucleus/candela_render_stub.c:85:85: error: format '%u' expects argument of type 'unsigned int', but argument 6 has type 'uint32_t' {aka 'long unsigned int'}
  nucleus/candela_world.c:436:36: error: format '%u' expects argument of type 'unsigned int', but argument 4 has type 'uint32_t' {aka 'long unsigned int'}
  ```
  Fixed with `(unsigned)` casts; the second build succeeded. App `picocalc-os-p4.bin` 5,172,240 bytes, SHA-256 `14e3b1da6e27bc4d8499c16a2b758827fa891bfe518f020fbecaa51018eb41a2`; partition table `72721dc3...` (the supported layout). The playable app is 4,626,128 bytes; the difference is the bundle, the world script and the world's C.
- Running `./build/picocalc-host scripts/tour.txt` to check the default host build rewrote the tracked screenshots in `picocalc-os/out/`; restored them with `git checkout -- picocalc-os/out/`.

## Step 6: The world on the ESP32-P4

The first device run was a smoke plan: one load, B-01 cold and three times warm, B-01p with five slider moves. It worked on the first attempt. The run waited seven minutes for the serial lock (PICOCALC-SIMD-LAB's `02-run-board.py` held it), then wrote, verified and health-checked the measurement image, ran the plan, and restored and health-checked the playable app.

### What I did
- `python3 scripts/08-run-device.py --image fw1/build --reference various/02-node-reference.json --probes scripts/06-diag-probes.json --out various/device-01-smoke --plan smoke`
- `python3 -I scripts/10-summarize-device.py various/device-01-smoke various/02-node-reference.json`

### What worked
- Module load in a fresh runtime: 175.9 ms, of which `JS_ReadObject` 47.9 ms; 21 modules, 470,209 bytes of bytecode; heap 229,684 -> 1,107,272 bytes (32-bit; the host's 64-bit figure is 1,348,048).
- B-01: build 124.7 ms cold, 123.7-124.6 ms warm; a separate `compile()` 85.3 ms cold, 69.1-69.7 ms warm; first pack 21.8 ms cold, 6.2 ms warm; `pack({time: 2.5})` 4.4-5.1 ms. C stack 20,668 bytes during the build, 9,220 during a pack (limit 56 KB). Heap peak 1,398,964 bytes cold (+291,692 over the loaded runtime). The WGSL digest `3cd66c92...` equals Node's.
- B-01p slider (dynamic roughness), five moves: pack 6.9-7.0 ms, pack + frame uniforms + `render.update` 8.6-8.7 ms, the whole segment 14.0-14.9 ms of the 50 ms turn.
- Restored: app `b22a807d...` verified, health check passed, keyboard I2C 291 transfers, 0 errors.

### What I learned
- The first pack in a fresh runtime costs 3.5 times a later one (3,086 against 785 steps): QuickJS builds shapes and inline caches the first time `pack()`'s code runs.

## Step 7: The full plan, a re-pack that almost missed its turn, and a leak

The full plan (three fresh runtimes, all 28 T0 presets plus B-01p measured, parameters on four scenes, a static rebuild, ten rebuilds, the five diagnostic probes) ran without a timeout, and the device was restored and healthy. It answered the acceptance questions, and it showed two things the host could not: re-pack cost varies by a factor of 60 between T0 scenes, and the world leaked every record it printed.

### What I did
- `08-run-device.py ... --out various/device-02-full --plan full`; `10-summarize-device.py various/device-02-full various/02-node-reference.json --out various/device-02-full/summary.json`.
- Profiled `pack()` in Node (`--cpu-prof`, scratch scripts, not kept) and tabulated device pack time against steps and object counts.
- `runner.js`: `repack()` asks for a long segment when the scene's last pack took more than `PACK_LONG_MS` = 25 ms (half the manifest's 50 ms turn), and reports `long`.
- `candela_world.c` `run_report`: free the record's JSON.
- `08-run-device.py --plan params` (`various/device-03-params`) to check the policy with the old report code.
- `make CANDELA=1 SAN=1 candela`, then scripts 03, 05, 06, 09 and 11 under AddressSanitizer and UBSan: no reports.

### What worked
- Module load in three fresh runtimes: 176.7, 175.6, 175.2 ms (`JS_ReadObject` 48.0-48.2 ms); heap 1,107,260-1,107,272 bytes after load.
- B-01 cold in three fresh runtimes: build 124.5-125.9 ms, compile 85.7-86.1 ms, first pack 21.9 ms. Warm: build 122.3-126.0 ms, compile 69.1-69.7 ms, pack 6.2-6.3 ms.
- Suite: 28 of 29 reference scenes built; 27 equal to Node on all 15 digests and the fixed-kernel digest; D-02 differs in `O` and `BV` only (as on the host). Longest build R-07 1,097 ms; heap peak 1,773,260 bytes (R-07); C stack at most 23,392 bytes (C-02) during a build and 12,800 during a pack.
- M-12: `ran past its long segment budget of 4000 ms`, the world restarted, and R-01 built next.
- Ten B-01 rebuilds in one runtime: 124.5-125.7 ms each; heap after each 1,534,004, then 1,518,892-1,518,896 bytes, no growth.
- Probes on the device: `E000@scene.js:4`, `E104@scene.js:4`, `E790@scene.js:5` (torus), `E790@scene.js:5` (surface field), `E001@scene.js:1`, the same as the host.
- E-03's static `depth` parameter: a rebuild of 421.7 ms in a long segment.

### What didn't work
- M-03's dynamic `n` re-packed in an ordinary turn with 49.1-49.7 ms of the 50 ms used (pack 38.8-39.1 ms). It did not overrun, but only by a few hundred microseconds.
- Internal RAM free at the end of the runs: smoke 75,687 bytes, full 36,871 bytes (`end-heap.txt`). `run_report` printed `d->json` and never freed it; `apply_deferred` frees only the effect (`free(d)`), and every run function in `kernel.c`/`vm.c` frees or passes on its own fields. Records are 0.3-3 KB, under `CONFIG_SPIRAM_MALLOC_ALWAYSINTERNAL=4096`, so they came from internal RAM first.

### What I learned
- Pack cost on the P4, by scene (first pack in a warm runtime): B-01 6.2 ms, L-03 7.0, D-02 12.7, E-04 20.8, M-03 38.2, M-09 40.7, L-01 118, C-02 173, L-05 379 ms. It follows the object count (BVH build, one inverse matrix per object) and the lights (L-05 has seven). In Node, M-09's pack is only 3.4 times B-01's; on the device it is 6.6 times.
- With the policy (`device-03-params`): B-01p 13.6-15.3 ms and D-02 21.8-22.2 ms per segment, ordinary turns; M-03 48.4-48.8 ms and M-09 48.7-49.4 ms, long segments; an L-05 time change 280.7-282.3 ms, long segment. Without the policy L-05 would have been torn down.

### What warrants a second pair of eyes
- `PACK_LONG_MS` uses the scene's last pack time as the forecast for the next. The first pack in a fresh runtime is up to 3.5 times slower than later ones (B-01: 21.9 against 6.2 ms), so the forecast errs towards long segments, never towards an overrun, for the scenes measured.

### Code review instructions
- `picocalc-os/worlds/candela-world/runner.js` `repack()`; `picocalc-os/nucleus/candela_world.c` `run_report()`.
- `python3 -I scripts/10-summarize-device.py various/device-02-full various/02-node-reference.json`

## Step 8: The final run, and the keyboard switched off mid-restore

The final run used the image built from `c0bd0f3` (both fixes), app SHA-256 `63a87a165d1b25281ada60e85cd560eee3d4d37e8d1b09472d9a97bf08f9e5e5`, with the parameter-policy steps folded into the full plan and the heap read before and after. Every step answered. The design document's Section 9 reports this run.

### What I did
- `PYTHONDONTWRITEBYTECODE=1 python3 scripts/08-run-device.py --image fw1/build ... --out various/device-04-final --plan full`
- `python3 -I scripts/10-summarize-device.py various/device-04-final various/02-node-reference.json --out various/device-04-final/summary.json`
- Removed the `__pycache__` directories my first device run had left under three 2026-11-20 tickets' `scripts/device/` (a checked script in the scratchpad; they were untracked and held only `.pyc` files).

### What worked
- Load 175.3-175.5 ms; B-01 build 123.8-128.0 ms; suite as before (27 of 28 built, 26 + B-01p equal, D-02 random, M-12 stopped).
- Re-pack policy on the device: B-01p, L-03 and D-02 in ordinary turns (14.0-21.9 ms segments); M-03, M-09 and L-05 in long segments (47.7-49.2 ms, 280.5-281.1 ms).
- Internal RAM free 93,335 bytes before the plan, 87,727 after (with the leak, the full run had ended at 36,871).

### What didn't work
- The run's last health check, on the restored playable app, raised:
  ```
  ValueError: physical keyboard I2C0 did not qualify: {'busyMs': 3878.76, 'transfers': 230, 'bytes': 923, 'errors': 230} -> {'busyMs': 5011.94, 'transfers': 254, 'bytes': 1020, 'errors': 254}
  ```
  The restore itself had completed: `restore-verify.log` shows `verify OK (digest matched)` for the app (4,626,128 bytes at 0x10000) and the partition table. The measurement image's own checks just before (`candidate-after.json`) had 743 transfers and 0 errors.
- The coordinator then reported that the user had switched the PicoCalc's display and keyboard off on purpose, and that keyboard I2C and display failures are now expected and are to be recorded as "off by user", not debugged.

### What I did about it
- `scripts/lib/board_health.py`: `board_health(console, "off-by-user")` skips the keyboard probe, records keyboard, display and compositor without judging them, and still requires the other native worlds and the painter to be healthy. `08-run-device.py --peripherals off-by-user` uses it.
- `scripts/12-after-health.py --out various/device-04-final/after.json --peripherals off-by-user` (under the lock, no flashing): app `b22a807d...`; Snake, Files, Editor, Agenda and Chess native, idle, no restarts; painter compiled once, no rejects; I2C 11,087 transfers, 11,087 errors; keyboard and display "off by user".

## Step 9: The vault report

A milestone entry. The deep-dive report went to the vault as `Projects/2026/11/22/PROJECT REPORT - PicoCalc Candela - Candela's Unchanged Front End as a QuickJS World on the ESP32-P4 - A Technical Deep Dive.md`, staged alone and pushed to `go-go-golems/go-go-parc` `main` as `63ea311` (first push accepted). Its numbers are the final run's (`various/device-04-final/summary.json`) and the host suite's.
