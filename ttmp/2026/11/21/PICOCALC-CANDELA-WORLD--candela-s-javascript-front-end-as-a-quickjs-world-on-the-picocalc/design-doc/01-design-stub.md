---
Title: Run Candela's unchanged JavaScript front end as a QuickJS world on the PicoCalc
Ticket: PICOCALC-CANDELA-WORLD
Status: active
Topics:
    - picocalc
    - esp32-p4
    - quickjs
    - rendering
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: firmware/nucleus/candela_render.h
      Note: The seam between the world and the firmware renderer (FIRST-LIGHT implements it)
    - Path: firmware/nucleus/candela_world.c
      Note: Bytecode module loader, the __candela host object, SHA-256, the renderer calls
    - Path: firmware/third_party/candela/PIN.json
      Note: The vendored Candela front end and T0 scenes, with their digests
    - Path: tools/gen/candela/candela-bc.c
      Note: Build-time compiler of the world's ES modules to QuickJS bytecode, GGX table evaluation
    - Path: apps/js/worlds/candela-world/runner.js
      Note: Build, subset check, pack, frame uniforms, parameters, renderer handoff
    - Path: apps/js/worlds/candela-world/shims.js
      Note: atob, performance, console, and the file-named Function
    - Path: apps/js/worlds/candela-world/subset.js
      Note: The T0 subset check, Candela-style E790 diagnostics
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-WORLD--candela-s-javascript-front-end-as-a-quickjs-world-on-the-picocalc/scripts/08-run-device.py
      Note: Measurement run with restore and peripherals option
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-WORLD--candela-s-javascript-front-end-as-a-quickjs-world-on-the-picocalc/various/device-04-final/summary.json
      Note: Section 9 numbers (final device run)
ExternalSources: []
Summary: 'As-built design of the Candela world: Candela''s 15 front-end modules compiled to QuickJS bytecode when the firmware is built and loaded through a module loader; shims for atob, performance, console and file-named Function; the GGX table evaluated at build time; a T0 subset check; a long-segment budget for builds; and render.start/update/stop host functions with a stub renderer and frame events.'
LastUpdated: 2026-11-22T02:00:00-05:00
WhatFor: How the Candela world is built, loaded and run, what each firmware change does, and what PICOCALC-CANDELA-FIRST-LIGHT must wire up
WhenToUse: Before changing the Candela world, its bundle, its host object or the renderer seam; before starting FIRST-LIGHT
---

# Run Candela's unchanged JavaScript front end as a QuickJS world on the PicoCalc

## 1. Goal and result

A Candela scene program is a JavaScript module written against Candela's own API. Running it means three steps: execute the module and its build-stage code, compile the resulting component tree into a WGSL program, and pack the scene into five float buffers. This ticket puts all three on the PicoCalc's ESP32-P4, in a QuickJS world, with Candela's sources unchanged, and hands the result to the firmware renderer through host functions. Animation time and parameters keep running in the world after the build.

The acceptance measurements are on the device (Section 9): module load time from bytecode, B-01's build, compile and pack times, peak heap and C stack, every T0 preset built within the world's limits with WGSL and packed-data digests equal to Node's, and a dynamic parameter change re-packed within one 50 ms turn.

All of them were met on the device (Section 9). Candela loads from bytecode in 175 ms; B-01 builds in 124-128 ms, compiles in 70-87 ms and packs in 6-22 ms; 27 of the 28 T0 presets build within 4 MB, a 4 s long segment and 56 KB of C stack (peak 1.78 MB and 23 KB), and 26 of those 27 have WGSL, packed-data, frame-uniform and section digests equal to Node's (D-02 calls `Math.random()`); M-12 runs a 100-million-step Monte Carlo test in its scene file and is stopped. A B-01 slider re-packs in a 14-15 ms segment.

## 2. What the world is made of

```mermaid
flowchart LR
  subgraph B["firmware build (build machine)"]
    V["third_party/candela<br/>15 modules, 28 T0 scenes, PIN.json"] --> BC["tools/candela-bc<br/>QuickJS 2026-06-04"]
    WJ["worlds/candela-world<br/>shims, runner, subset, frame, program,<br/>kernel-memo template, scenes"] --> BC
    BC --> Q["candela/front.qbc<br/>21 modules as bytecode, 30 texts"]
  end
  subgraph D["ESP32-P4, kernel task, core 1"]
    Q --> L["candela_world.c<br/>module loader (JS_ReadObject)"]
    L --> W["candela world: main.js<br/>world:runner.js + Candela"]
    W -->|"render.start / update / stop"| R["candela_render.h<br/>stub renderer (FIRST-LIGHT: real one)"]
    R -->|"candela.frame"| W
  end
```

| Part | File | Role |
|---|---|---|
| Vendored front end | `picocalc-os/third_party/candela/src/*.js`, `PIN.json` | `src/candela.js` and its 14 imports, byte for byte from `candela-workspace(1).zip` (SHA-256 `873b2dd4...df5d`); `kernel.js` and `compile.js` equal CPU-KERNEL's pin |
| Vendored scenes | `third_party/candela/presets/*.js` | the 28 T0 preset scene files |
| Bundle list | `worlds/candela-world/bundle.list` | what goes into the bundle, under which module names |
| Bytecode compiler | `tools/candela-bc.c` | runs on the build machine; writes `front.qbc` |
| Host side | `nucleus/candela_world.c`, `.h` | the loader and the `__candela` host object |
| Renderer seam | `nucleus/candela_render.h`, `candela_render_stub.c` | the interface FIRST-LIGHT implements; a stub today |
| World script | `worlds/candela-world/main.js` | the app, its messages and screen |
| World modules | `shims.js`, `runner.js`, `subset.js`, `frame.js`, `program.js`, `kernel-memo.js` | Section 4 |
| Manifest entry | `worlds/candela-world/manifest.json` | Section 6 |

## 3. The bundle: bytecode compiled when the firmware is built

### Why bytecode

Compiling Candela's 329 KB of source takes 15 ms in host QuickJS, about 0.5-1 s on the device by the study's ratios. QuickJS's `JS_WriteObject` serialises a compiled module; `JS_ReadObject` restores it in another runtime without parsing. The prelude cache in `nucleus/vm.c` already does this for one script, but it compiles on the device at boot. Candela's modules are compiled once on the build machine instead.

QuickJS bytecode depends on the QuickJS version and the byte order. It does not depend on the word size: atoms are written as strings, constants as 64-bit doubles, and the reader converts the atom indices. `tools/candela-bc` links the same `third_party/quickjs` as the firmware (version 2026-06-04 and its three patches) and runs on the x86-64 build machine; both machines are little-endian. The bundle starts with the QuickJS version string, which `candela_world.c` checks, and `JS_ReadObject` checks QuickJS's own `BC_VERSION`.

### How it is built

`candela-bc OUT --list worlds/candela-world/bundle.list picocalc-os/` reads the list and:

1. evaluates `third_party/candela/src/kernel.js` (it imports nothing) and calls `ggxAlbedoTable()` and `ggxTableWGSL()` once (2.5 s on the build machine);
2. queues every module source, and the memo template with the two results substituted for its tokens;
3. compiles each queued module with `JS_Eval(..., JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY)` through a module loader with the device's names. QuickJS resolves a module's imports while it compiles it (`js_resolve_module` in `__JS_EvalInternal`), so compiling `candela:candela.js` compiles its imports, each once;
4. writes each module with `JS_WriteObject(..., JS_WRITE_OBJ_BYTECODE)`, function source text stripped (`JS_SetStripInfo(rt, JS_STRIP_SOURCE)`), line tables kept;
5. adds the texts: `pin` (PIN.json), `preset:<file>` (the T0 scenes), `scene:<file>` (the world's scenes).

The output format "CQB1" is a magic, the 16-byte version string, an entry count, and per entry a kind (1 module, 2 text), a name and the bytes. 21 modules and 30 texts, 500,684 bytes of data, 470,244 of them bytecode.

### Module names, and why they contain no slash

Candela's modules are named `candela:<file>` and the world's `world:<file>`. A relative import (`./diag.js`) resolves within its importer's namespace. Candela's diagnostics find the user's line with `diag.js`'s FRAME regex, which strips a frame's directory and compares the base name with the user's files. With a name such as `candela/src/scene.js`, Candela's own `scene.js` frame would match the user's `scene.js` first, which is what happens in Node (Section 5). A name with a colon and no slash does not match the regex at all, so Candela's frames are skipped.

## 4. The world's modules

### Shims (`world:shims.js`, evaluated first)

`world:runner.js` imports `world:shims.js` before any Candela module, and ES module evaluation is post-order in import order, so the shims are installed before `candela.js` runs its boot-time probe of `new Function`.

| Shim | Why |
|---|---|
| `atob` | K-09 decodes base64 mesh data; WHATWG forgiving-base64, decoding to a binary string in 8,192-byte chunks |
| `performance.now()` | `build()` times itself; the host's real clock in milliseconds |
| `console` | `params.js` reports listener errors with `console.error`; mapped to the world's `log` |
| `Function` | Section 5 |
| `__candela` | taken off the global object and exported as `host`, so scene code cannot reach the renderer |

### The memoised GGX table (`world:kernel-memo.js`)

`ggxTableWGSL()` recomputes a constant 256-entry table by Monte Carlo on every compile: 26.7 million QuickJS steps, minutes on the device. The memo module is

```js
export * from 'candela:kernel.js';
import { ggxAlbedoTable as computeAlbedoTable } from 'candela:kernel.js';
const TABLE = /* 256 numbers, written by candela-bc */;
const WGSL = /* the WGSL text, written by candela-bc */;
export function ggxAlbedoTable(N = 16, S = 512) { return N === 16 && S === 512 ? TABLE.slice() : computeAlbedoTable(N, S); }
export function ggxTableWGSL() { return WGSL; }
```

A local export takes precedence over `export *`, so these two names replace kernel.js's and every other name passes through. The module loader resolves every import of `candela:kernel.js`, except the memo module's own, to `world:kernel-memo.js`. No Candela file is changed. The WGSL digests of Section 9 show the memoised program equals Node's, where Candela computes the table itself.

### The scene runner (`world:runner.js`)

`buildScene(id, files, o)` is the world's version of Candela's workbench `Host.build()` plus `Viewport.load()`:

1. `host.longSegment()` (Section 6), `paramStore.reset()` unless a static parameter is being rebuilt;
2. Candela's `build(files)`: runs the scene files and compiles the scene;
3. the subset check; a scene above T0 is refused with E790 diagnostics;
4. the first `pack({ time: 0 })`, then digests of the WGSL and the six arrays, computed in C;
5. with `measure`: three `pack({ time: 2.5 })` (median) and one separate `compile()` of the built scene;
6. the frame uniforms at 160 x 160 (`world:frame.js`) and the split of the program (`world:program.js`);
7. `host.render.start(program, buffers, options)`.

`setParam(id, value)` moves a slider as Candela's `Host.onParam` does: a dynamic parameter re-packs (`repack(time)`: `pack`, frame uniforms, `render.update`), a static one rebuilds with the slider values kept. `repack(time)` also serves animation time (`compiled.animation(t)` poses). No T0 preset has an animation or behaviours; the path is the same as for a parameter.

A re-pack runs in an ordinary turn unless the scene's last pack took more than `PACK_LONG_MS` = 25 ms, half the manifest's 50 ms budget; then `repack()` asks for a long segment first and reports `long: true`. The device measurements forced this rule: pack cost on the P4 ranges from 6.2 ms (B-01) to 377 ms (L-05), and M-03's slider used 49.1-49.7 ms of a 50 ms turn before the rule existed (Section 9). The first pack in a fresh runtime is slower than later ones, so the forecast errs towards a long segment.

### Frame uniforms (`world:frame.js`)

`pack()` leaves U's rows 0-5, 20, 21 and words 80-87 and 96 to Candela's viewport, which fills them before each dispatch: the frame size and sample counter, the camera (`compile.js` `cameraUniforms`), the integrator's depth and Russian-roulette settings, the spectral white balance and the seed. `frameUniforms()` writes them exactly as `Viewport.frame()` does for a fixed size, with the pass counter at 0. In Node, its U equals the U that Candela's own `Viewport.frame()` hands a recording backend for 94 of 94 presets checked (`scripts/02-node-reference.mjs --archive`). `postOptions()` collects what the display pass needs (tone map, denoise, exposure mode and EV).

### The program split (`world:program.js`)

CPU-KERNEL's `splitProgram()` at the same pin: it checks every boundary of `head + PRELUDE + SPECTRAL + ggxTableWGSL() + sdfCode + hfCode + densCode + CORE + metalAt + matCode + PATH` and returns the field section (`sdfCode + hfCode + densCode`) and the material section (`matCode` without `hitAlbedo` and `hitEmission`). `fixedText()` is the fixed WGSL in program order; its SHA-256 (`8925739795c7...`, 62,419 bytes) identifies the kernel a program was compiled against.

## 5. File-named scene compilation

Candela runs every scene file through `new Function('__req', ..., '"use strict";\nreturn (async () => {\n' + body + '\n})();\n//# sourceURL=' + path)`. QuickJS ignores `//# sourceURL=` and names the function `<input>`, so `callSite()` could never find a user frame. The world's `Function` (in `world:shims.js`) passes ordinary calls to QuickJS's constructor; for a body that ends in `//# sourceURL=NAME`, it builds the same source QuickJS's constructor would and compiles it with `__candela.evalScript(source, NAME)` (`JS_Eval` with that file name). Its `prototype` is the original `Function.prototype`, so `instanceof Function` still holds.

The layout fixes a second problem, one Candela has in V8 too. `candela.js` measures the lines `new Function` puts before a body with a probe (2 in V8 and QuickJS), but `runFiles` adds two more lines (`"use strict";`, `return (async () => {`) that the measurement does not cover. In Node a throw on line 4 of `scene.js` is reported at line 6. The world's `Function` lays out ordinary bodies with the two standard header lines, so the probe still measures 2, and joins `runFiles`' two prefix lines onto the header's second line, so line L of a scene file is source line L + 2 and Candela reports line L.

| Probe (`scripts/06-diag-probes.json`) | World | Node, unbundled |
|---|---|---|
| `throw` on line 4 | E000 at scene.js:4 | E000 at scene.js:6 |
| misspelt method on line 4 | E104 at scene.js:4 | E104 at scene.js:56 (Candela's own scene.js) |
| a torus on line 5 | E790 at scene.js:5 | E790 at scene.js:114 (same subset.js; the shape's location is Candela's frame) |
| a surface field on line 5 | E790 at scene.js:5 | E790 at scene.js:114 |
| a syntax error on line 2 | E001 at scene.js:1 | E001 at scene.js:1 |

Syntax errors stay at line 1 in both engines: `syntaxLoc()` locates them by trial parsing and matches V8's error wording.

## 6. Turns, the long segment, memory and stack

A world's turn has a budget (`budget_ms`, 50 ms by default); a world that runs past it is torn down. The boot segment has 600 ms. A Candela build cannot be split across turns: `build()` is `async`, but it only awaits promises that are already settled, so the whole build runs in the job queue of one segment. Estimates for T0 builds on the device run to about 0.8 s, more with the measurement extras.

Two patterns were considered.

- **A worker.** Run long builds on another FreeRTOS task, so the lane stays free. A QuickJS runtime can move between threads (`JS_UpdateStackTop`), but the world's runtime would then run JavaScript that makes host calls into the kernel (`K`) from a task that does not own it, and the kernel would have to keep the world's messages, settles, timers and teardown away from it meanwhile. That is a kernel change of its own.
- **A long segment.** The boot pattern, on request: a world whose manifest declares `long_ms` may ask that the segment it is running in be bounded by `long_ms` instead of `budget_ms`, counted from the segment's start. Ordinary turns keep the 50 ms budget, so a parameter re-pack that took longer would still be stopped. While a long segment runs it holds the lane, as a boot segment or a Typed boot compile does.

The world uses the long segment (`vm_long_segment()` in `vm.c`, `__candela.longSegment()`), for module loading and for builds. An overrun is reported as "ran past its long segment budget of 4000 ms". The worker is the follow-up for builds longer than a fraction of a second, which T0 does not have except M-12 (Section 9).

### The manifest entry

```json
{ "name": "candela", "file": "candela/world.js", "claims": ["candela", "fs:/candela"],
  "budget_ms": 50, "long_ms": 4000, "mem_kb": 4096, "stack_kb": 56 }
```

| Field | Value | Why |
|---|---|---|
| `claims` | `candela`, `fs:/candela` | `candela` installs the loader and host object (`vm_create`); `fs:/candela` lets the world build scene files from storage |
| `budget_ms` | 50 | ordinary turns: parameters, time, status, frame events |
| `long_ms` | 4000 | the longest build segment; T0 builds take up to about 1 s on the device (Section 9) |
| `mem_kb` | 4096 | Candela loaded is about 1.35 MB (64-bit host) and builds peak 0.3 MB above that; the study found 1 MB too small and 2 MB enough |
| `stack_kb` | 56 | the QuickJS C stack limit; at most the port's `port_js_stack()`, which is 56 KB of the kernel task's 80 KB on the P4 |

`long_ms` and `stack_kb` are new manifest fields (`manifest_world_t`, `world_t`, `vm_read_manifest`, `add_world`). `stack_kb` can only lower a world's limit below the port's; raising it would need a larger kernel task stack, which T0 does not need (Section 9).

## 7. The host object

`__candela`, installed by `candela_world_install()` after the prelude in `vm_create` for a world with the `candela` claim:

| Function | Returns / does |
|---|---|
| `now()` | the real clock, ms (`port_clock()`) |
| `segmentMs()` | time since the current segment started, ms (virtual on the host) |
| `steps()` | QuickJS interrupt-counter steps since the runtime was made |
| `mem()`, `resetPeak()` | `{ used, peak, limit }` as the world is charged (`world_t.mem_used`, the new `mem_peak`) |
| `gc()` | `JS_RunGC` |
| `longSegment()` | Section 6 |
| `loaderStats()` | modules read, bytecode bytes, time in `JS_ReadObject` |
| `stackPaint()`, `stackUsed()` | C stack high-water mark: paint the free stack below the call with 0xA5, later the lowest changed byte, as bytes below the runtime's stack top |
| `sha256(stringOrTypedArray)` | hex digest (UTF-8 for strings), in C |
| `utf8Length(s)` | UTF-8 bytes of a string |
| `text(name)`, `list(prefix)` | the bundle's texts |
| `evalScript(source, file)` | `JS_Eval` with that file name (Section 5) |
| `report(value)` | prints `CW <json>` on the console when the segment ends (a deferred effect) |
| `render.start(program, buffers, options)` | Section 8 |
| `render.update(buffers, options)` | Section 8 |
| `render.stop()`, `render.status()` | Section 8 |

## 8. The renderer seam (`nucleus/candela_render.h`)

The world calls three functions; the renderer calls one back.

```js
host.render.start(program, buffers, options) -> { gen, bytes }
  program = { sceneId, fixedKernel /* SHA-256 of fixedText() */, spectral, integrator,
              fieldCode, matCode /* the generated WGSL sections */, sections /* SECTIONS bytecode or null */, wgsl }
  buffers = { U, O, LI, BV, SDs, SDd /* Float32Array, whole vec4 rows; U has the frame uniforms */, dynBase }
  options = { width, height, post: { tonemap, denoise, exposure, ev, physicalEV, ... } }
host.render.update(buffers, { reset: true }) -> { gen, bytes }   // after every pack: parameters, time
host.render.stop()
// the renderer, after each pass:   message "candela.frame" { gen, pass, spp, us } to the world
```

In C the world's side copies the arrays into one block (`cr_scene_t`: generation, frame size, `dyn_base`, rows and offsets of the six arrays, the floats) and the program into another (`cr_program_t`: scene id, fixed-kernel digest, spectral flag, integrator, post settings, the two section texts, the SECTIONS bytecode). Both are handed over as deferred effects when the segment ends, so a segment that crashes starts nothing. The port implements

```c
int  port_candela_start(int world, cr_program_t *program, cr_scene_t *scene, char *why, size_t n);
int  port_candela_update(int world, cr_scene_t *scene, char *why, size_t n);
void port_candela_stop(int world);
char *port_candela_status_json(void);
void candela_world_frame(int world, uint32_t gen, uint32_t pass, uint32_t spp, vtime_t pass_us);  // nucleus, for the renderer
```

The stub (`candela_render_stub.c`) checks the scene (magic, uniforms and objects present, U[0..1] equal the frame size), refuses a spectral program, a non-path integrator or a missing fixed-kernel digest, keeps one program and one scene, and reports four passes 500 ms apart per generation without drawing. An update restarts the count, as a reset of accumulation would. `render.status()` returns its counters.

### What PICOCALC-CANDELA-FIRST-LIGHT must wire up

1. Replace `candela_render_stub.c` with a renderer behind the same five functions; keep them on the kernel task and run passes on a worker task (core 1, low priority, as the painter service does), posting `candela_world_frame` through `p4_kq` back to the kernel task.
2. Bind: `SD` = `SDs` at row 0 and `SDd` at row `dyn_base` (as `render.js` `uploadSD` does), then CPU-KERNEL's `cdl_buffers { U, O, LI, BV, SD }` and `NS_bind(&b, sections, sky)`.
3. Refuse a program whose `fixed_kernel_sha256` differs from the kernel the firmware was generated from: CPU-KERNEL's generator should emit the SHA-256 of the same `fixedText()` (`program.js`), `8925739795c775a2910c0096eb59dac235bd35719b5255539019b41cde12942d` at the pin.
4. Own U[2] (the pass counter: 0 for the first sample of an accumulation, then spp + 1, as `Viewport.frame()` writes it) and the per-frame seed; everything else in U arrives filled.
5. Sections: until SECTIONS' translator runs in the world, `program.sections` is null and the field and material sections arrive as WGSL text (`field_wgsl`, `mat_wgsl`). When the translator lands, the world fills `program.sections` with its bytecode (the C side already copies a typed array there) and the kernel's dispatch table is bound to the interpreter.
6. Exposure metering for `post.exposure == "auto"` (Candela's viewport meters by reading back pixels), tone mapping and the display at 160 x 160 upscaled to 320 x 320.
7. A screen: today the world's screen is a status panel; FIRST-LIGHT decides how the image reaches the compositor (a native slot or a framebuffer handle).

## 9. Device measurements

Measured on the PicoCalc's ESP32-P4 (360 MHz, QuickJS world on the kernel task) with the measurement image built from commit `c0bd0f3` (`build-smooth-chess.sh BUILD -D PICOCALC_CANDELA_WORLD=ON`, app SHA-256 `63a87a165d1b25281ada60e85cd560eee3d4d37e8d1b09472d9a97bf08f9e5e5`), run `various/device-04-final` (`scripts/08-run-device.py --plan full`, summarised by `scripts/10-summarize-device.py` into `summary.json`). Earlier runs (`device-01-smoke`, `device-02-full`, `device-03-params`) agree to within a few percent; `device-02-full` used the image before the two fixes of the diary's Step 7. The playable firmware (`b22a807d...`) was written and verified after every run.

### Acceptance

| Measurement | Result |
|---|---|
| Module load from bytecode, fresh runtime (3 runs) | 175.3-175.5 ms, of which `JS_ReadObject` 47.8-48.0 ms; 21 modules, 470,349 bytes |
| Heap after load | 1,107,372-1,107,392 bytes (peak during load 1,112,492) |
| B-01 build, fresh runtime (3) / warm (3) | 123.8-126.6 ms / 124.4-128.0 ms |
| B-01 `compile()` alone, fresh / warm | 85.5-87.1 ms / 69.6-71.1 ms |
| B-01 first pack, fresh / warm; `pack({time: 2.5})` | 21.9 ms / 6.3-6.5 ms; 4.5-4.8 ms |
| B-01 heap peak during a build | 1,399,084 bytes (+291,692 over the loaded runtime) |
| C stack during a build / a pack | B-01 20,668 / 9,296 bytes; all T0 at most 23,392 (C-02) / 12,800 bytes; limit 56 KB |
| T0 presets built within the limits | 27 of 28 (M-12 stopped by the 4 s long segment) |
| Digests equal to Node (WGSL, 6 arrays at t = 0 and t = 2.5, frame uniforms, sections, fixed kernel) | 26 of 27 built presets and B-01p; D-02 differs in `O` and `BV` only |
| Highest heap peak, all T0 | 1,777,440 bytes (R-07), 43% of 4 MB |
| Longest build | R-07, 1,103 ms |
| B-01 dynamic parameter (B-01p roughness, 5 moves) | pack 6.9-7.2 ms; whole segment 14.0-15.4 ms, an ordinary 50 ms turn |

### Per scene

| Scene | Build ms | Compile ms | First pack ms | Peak heap | Digests |
|---|---|---|---|---|---|
| A-03 | 138.5 | 54.5 | 7.3 | 1,574,692 | equal |
| B-01 | 126.5 | 68.6 | 6.2 | 1,569,840 | equal |
| B-03 | 205.9 | 102.5 | 64.8 | 1,586,144 | equal |
| B-04 | 177.1 | 97.0 | 7.4 | 1,617,736 | equal |
| B-05 | 203.7 | 125.6 | 9.5 | 1,603,064 | equal |
| C-02 | 787.9 | 132.4 | 167.3 | 1,695,780 | equal |
| C-03 | 313.8 | 125.8 | 62.2 | 1,748,900 | equal |
| C-04 | 250.5 | 141.2 | 10.0 | 1,711,808 | equal |
| D-01 | 178.8 | 93.0 | 101.0 | 1,660,760 | equal |
| D-02 | 289.8 | 171.3 | 12.7 | 1,641,452 | O, BV differ (`Math.random`) |
| E-03 | 204.6 | 94.9 | 64.2 | 1,646,476 | equal |
| E-04 | 174.4 | 54.3 | 21.0 | 1,654,084 | equal |
| G-06 | 205.2 | 103.9 | 41.6 | 1,658,644 | equal |
| L-01 | 151.2 | 71.0 | 116.9 | 1,650,504 | equal |
| L-02 | 191.5 | 98.7 | 9.6 | 1,655,676 | equal |
| L-03 | 179.4 | 95.3 | 7.0 | 1,653,992 | equal |
| L-04 | 202.6 | 96.2 | 18.3 | 1,652,336 | equal |
| L-05 | 208.2 | 54.1 | 377.1 | 1,653,412 | equal |
| L-06 | 263.0 | 149.0 | 111.4 | 1,665,836 | equal |
| L-07 | 217.3 | 122.8 | 10.4 | 1,658,236 | equal |
| L-08 | 158.2 | 73.9 | 46.8 | 1,648,540 | equal |
| M-01 | 579.5 | 384.0 | 29.9 | 1,701,268 | equal |
| M-02 | 214.5 | 71.7 | 19.3 | 1,711,564 | equal |
| M-03 | 186.0 | 53.4 | 38.4 | 1,673,780 | equal |
| M-09 | 133.1 | 51.1 | 40.7 | 1,657,796 | equal |
| M-12 | stopped at 4,000 ms | | | | not built |
| R-01 | 196.7 | 112.5 | 64.4 | 1,408,480 | equal |
| R-07 | 1,103.5 | 732.0 | 88.7 | 1,777,440 | equal |
| B-01p | 131.7 | 68.9 | 6.5 | 1,737,016 | equal |

The scenes ran one after another in one runtime (after M-12's restart, a fresh one), so the peak heap includes what earlier builds left for the collector. Build time includes running the scene file and `compile()`; the compile column is a second, separate `compile()` of the same scene.

### Parameters, time and rebuilds

| Change | Pack ms | Segment ms | Segment kind |
|---|---|---|---|
| B-01p roughness (5) | 6.9-7.2 | 14.0-15.4 | ordinary |
| L-03 sun elevation (3) | 7.2-7.4 | 14.3-15.6 | ordinary |
| D-02 gloss (2) | 13.2-13.3 | 21.7-21.9 | ordinary |
| M-03 floor IOR (3) | 38.6-38.9 | 49.0-49.1 | long (last pack > 25 ms) |
| M-09 roughness along (3) | 40.7-40.8 | 47.7-49.2 | long |
| L-05 animation time (2) | 270.2-270.3 | 280.5-281.1 | long |
| E-03 depth (static: rebuild) | | 427.9 total | long |

Ten B-01 rebuilds in one runtime: 124.8-126.7 ms each; heap after each 1,538,176 bytes, then 1,523,064-1,523,088, no growth. The world's heap is in PSRAM; internal RAM free went from 93,335 to 87,727 bytes over the whole run (before `run_report` freed its record, the full run ended at 36,871).

### Diagnostics

The five probes of `scripts/06-diag-probes.json` give on the device exactly what the host simulator gives (Section 5): E000 at scene.js:4, E104 at scene.js:4, E790 at scene.js:5 twice, E001 at scene.js:1.

### Device health

The playable app was health-checked before each run, and the measurement image after flashing and after its plan; the keyboard's I2C counters showed no errors in all of these. During the final restore the user switched the PicoCalc's keyboard and display off on purpose: the restored app's I2C transfers all failed (11,087 of 11,087), so `after.json` was recorded with `scripts/12-after-health.py --peripherals off-by-user`: app `b22a807d...` verified in flash, the native Files, Editor, Agenda, Chess and Snake worlds running without restarts, the painter compiled once without rejects, keyboard and display "off by user".

## 10. Firmware changes and how to build the measurement image

| Change | File | Default firmware affected? |
|---|---|---|
| `long_ms`, `stack_kb` manifest fields; `world_t.long_budget_us`, `js_stack`, `mem_peak`, `seg_long` | `nucleus/nucleus.h`, `kernel.c`, `vm.c` | no: compiled only with `PICOCALC_CANDELA_WORLD` |
| `vm_long_segment()` | `nucleus/vm.c` | no: compiled only with the flag |
| the overrun message names a long segment | `nucleus/kernel.c` | no: compiled only with the flag |
| Candela loader and host object hooks in `vm_create`/`vm_dispose` | `nucleus/vm.c` | compiled only with `PICOCALC_CANDELA_WORLD` |
| `candela_world.c`, `candela_render.h`, `candela_render_stub.c` | `nucleus/` | compiled only with the flag |
| `PICOCALC_CANDELA_WORLD` option, bundle and manifest entry | `port/esp32p4/CMakeLists.txt`, `main/CMakeLists.txt` | OFF by default |
| `send WORLD TYPE [JSON]` console command | `port/esp32p4/main/main_p4.c` | only with the flag |
| `build-smooth-chess.sh BUILD [-D ...]` | `port/esp32p4/build-smooth-chess.sh` | without extra arguments it builds the same image |
| `make CANDELA=1 candela` host build | `picocalc-os/Makefile`, `tools/candela-stage.py` | separate build directory |

Without the flag, `nucleus/vm.c` and `nucleus/kernel.c` preprocess to exactly the text of `main` at `1fc0f1e`, with the host's defaults and with the playable build's guards (`PICOCALC_TYPED_AGENDA`, `_CHESS`, `_EDITOR`, `_FILES`, `PICOCALC_MOBILE_PAINTER`, `NUCLEUS_WASM`); `nucleus.h` is gated the same way, `main_p4.c`'s command and the CMake block are under the flag, and `build-smooth-chess.sh` without extra arguments runs the same `idf.py` command. With the flag, the same files preprocess to the measured commit's statements (`c0bd0f3`), split differently across lines. (The nucleus changes were gated after the device runs, in `HEAD`.)

Measurement image:

```bash
source ~/esp/esp-idf-5.4.2/export.sh
picocalc-os/port/esp32p4/build-smooth-chess.sh BUILD -D PICOCALC_CANDELA_WORLD=ON
```

Host simulator:

```bash
cd picocalc-os && make CANDELA=1 candela
./build-candela/picocalc-host -j build-candela/candela-js SCRIPT    # scripts/03-host-smoke.txt, 05-host-suite.txt
```

## 11. Risks and open questions

- Builds hold the lane for up to `long_ms`. A worker that runs a world's JavaScript off the kernel task would free it; it needs kernel support (Section 6).
- D-02 calls `Math.random()` while building; the prelude seeds `Math.random` per world, so D-02's packed objects and BVH differ from Node's (WGSL equal). Candela warns about it (W501).
- M-12 runs a Monte Carlo furnace test in its scene file (100 million steps); it cannot finish in a long segment of 4 s and is not a device scene.
- The C stack figure includes up to one interrupt context frame below the deepest JavaScript frame (the RISC-V port saves context on the task stack).
- Pack cost is scene-dependent on the device (6 to 377 ms) and grows with objects and lights. Heavy scenes re-pack in long segments (Section 4), which hold the lane; an interactive slider on L-05 would update about three times a second. Candela's `pack()` recomputes light normalisation and the BVH on every call; a cache keyed by the parameters a light or object actually depends on would make most re-packs cheap, but it is a change to Candela.
- The renderer seam is exercised only by the stub. The real renderer will take more than the stub's microseconds per update, and runs on another core; FIRST-LIGHT has to keep `render.update` from blocking the kernel task.
