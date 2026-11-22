---
Title: QuickJS front-end measurement diary
Ticket: PICOCALC-CANDELA-P4
Status: active
Topics:
    - picocalc
    - compiler
    - rendering
    - esp32-p4
    - performance
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Chronological record of measuring Candela's scene build, compile and pack in the PicoCalc's vendored QuickJS on the x86-64 host, in 64-bit and 32-bit builds
LastUpdated: 2026-11-21T23:24:42-05:00
WhatFor: "Reproduce or extend the QuickJS cost of Candela's front end; find the evidence behind each number in various/03-quickjs-front-end.json"
WhenToUse: "Before deciding which part of Candela's front end can run on the ESP32-P4 in QuickJS, or before re-running the measurement"
---

# QuickJS front-end measurement diary

This diary records one question, asked by the launching agent of ticket PICOCALC-CANDELA-P4: what does Candela's front end (running the scene program, compiling it to WGSL, and packing the Float32 scene buffers) cost when it runs in the same QuickJS that the PicoCalc's worlds use? Everything here runs on the x86-64 host. Nothing touches the device, ESP-IDF, `picocalc-os/`, or the RAY-PARITY ticket; Candela runs from a scratch copy and its source is not modified.

## Step 1: The brief, the inputs, and what the engine on the device looks like

The brief came from the parent agent, not from the user. Before writing a host program I read the existing ticket material, Candela's entry point, and the way the nucleus creates a QuickJS runtime on the ESP32-P4, so that the host runner would mirror the device's engine configuration rather than a generic `qjs`.

### Prompt Context

**Brief (from the parent agent, summarized; not a user prompt):** write a small C host runner that links the vendored QuickJS (`picocalc-os/third_party/quickjs`, version 2026-06-04 plus the three patches in its `PATCHES` file) into a build directory under the scratchpad; give it an ES module loader, a promise job loop, `console` and `performance.now()`, and a counting allocator (`JS_NewRuntime2` with custom `JSMallocFunctions`) for peak heap. Build it native 64-bit `-O2` and, if possible, 32-bit (`-m32`, as `make M32=1` does), because the device is 32-bit. Write a JS driver that loads the presets and, for B-01, R-01, F-01, A-01, L-03, W-02, G-01 (and K-01, X-02 if they work), measures `build` wall time (median of 3, cold or warm stated), one `compiled.pack({time:0})` and one pack at a later time, the generated WGSL size in bytes and lines, peak heap, and the time to load the Candela modules alone. Then, if time permits, all 105 presets, with every QuickJS-specific failure recorded verbatim. Shims in the driver are allowed if documented; Candela's source is not to be edited. Results go to `various/` as JSON plus a text summary, with QuickJS version, compiler flags, host CPU and exact commands. Constraints: no changes to `picocalc-os/compiler/`, `picocalc-os/tests/` or the RAY-PARITY ticket, no device, no ESP-IDF builds, no commits, no `git add`; deletes and kills only in checked Python scripts. Keep this diary.

**Addition from the parent agent, mid-task:** `compile()` calls `ggxTableWGSL()` (src/kernel.js), which recomputes `ggxAlbedoTable()` on every compile, about 2.1 million iterations with `sqrt`/`cos`/`sin` whose result is a constant. Time `ggxAlbedoTable()` alone in QuickJS and, if it dominates, also report build times with it memoized, stating the method.

### What I did

- Read `AGENTS.md`, the ticket's `reference/01-investigation-diary.md`, `scripts/01-census.mjs` (the Node census that builds all 105 presets in about 9.3 s) and `various/01-census.txt`, `various/02-tiers.txt`.
- Read Candela's `src/candela.js` (the module transform and `build`) and `src/diag.js` (`callSite`, the `FRAME` regex).
- Searched Candela's front-end sources for host globals: only `performance.now()` (candela.js). The hits for `process` and `self` are a material property and method parameters.
- Read how the nucleus builds a world's runtime (`picocalc-os/nucleus/vm.c`) and how the firmware compiles QuickJS (`picocalc-os/port/esp32p4/main/CMakeLists.txt`, `sdkconfig`).

### Why

- The runner should count memory the way a world is charged, and compile QuickJS the way the firmware does, so that the host numbers are about the same engine.

### What worked

- The device facts that the runner mirrors:
  - Compiler flags for QuickJS in the firmware: `CONFIG_COMPILER_OPTIMIZATION_PERF=y` (that is `-O2`), plus `-fwrapv -fno-strict-aliasing` per file, and `CONFIG_VERSION="2026-06-04"`.
  - A world's allocator (`vm.c` `w_malloc`) charges `port_heap_usable(p) + 8` per block, the same as QuickJS's own default accounting (`MALLOC_OVERHEAD` 8 on Linux).
  - A world's default memory limit is 1 MB (`nucleus/kernel.c:949`, `mem_limit = ... : 1024 * 1024`); its QuickJS C stack limit on the P4 is 56 KB (`port/esp32p4/main/port_p4.c:45`, `port_js_stack`).
  - The interrupt counter (patch 1 and 2) counts loop back-edges and calls; `vm_calibrate()` sets the virtual cost of one step from a 100,000-iteration loop measured at 133 ms on the device, and checks it with fib(20), measured at 31 ms there.

### What didn't work

- `gcc -m32` cannot link on this host:
  ```
  /usr/bin/ld: cannot find Scrt1.o: No such file or directory
  /usr/bin/ld: cannot find crti.o: No such file or directory
  /usr/bin/ld: cannot find -lm: No such file or directory
  /usr/bin/ld: cannot find -lgcc: No such file or directory
  ```
  `libc6-dev-i386` / `gcc-multilib` are not installed. The 32-bit runtime libraries are (`/usr/lib32/libc.so.6`, `libm.so.6`, `libgcc_s.so.1`, `/lib/ld-linux.so.2`, from `lib32gcc-s1` and friends). Step 2 works around it.

### What I learned

- Candela's front end needs almost nothing from a host: `performance.now()` only. One preset (K-09) needs `atob` (Step 5).

### What was tricky

- Nothing yet.

### What warrants a second pair of eyes

- Whether the host's glibc `malloc_usable_size` rounding is a fair stand-in for the device's `port_heap_usable` (TLSF in ESP-IDF). The runner therefore reports requested bytes as well (allocator-independent).

### Technical details

- Candela copy (writable, used for every run): `/tmp/claude-1000/-home-manuel-code-wesen-2026-10-20--ds-js-os/8cb22ffd-b9b3-49d6-975e-44f61fbbbf0b/scratchpad/candela-run`.
- Host: `11th Gen Intel(R) Core(TM) i7-1165G7 @ 2.80GHz`, 4 cores / 8 threads, governor `powersave`, turbo on; gcc 13.3.0 (Ubuntu 24.04); Node v24.18.0.

## Step 2: A host runner for the vendored QuickJS, in 64-bit and 32-bit

The runner is one C file plus a shell build script. It runs one ES module (the driver) and exposes a `host` object for clocks, files and memory counters. The 64-bit build needed nothing special; the 32-bit build needed two missing pieces of the i386 C runtime, supplied by the build script itself.

### What I did

- Wrote `scripts/quickjs/candela-qjs.c`:
  - Counting allocator through `JS_NewRuntime2`: each block carries a 16-byte header with its requested size, so the runner reports both `req` (bytes QuickJS asked for) and `acct` (usable size + 8, as a world is charged). Peaks of both; `host.resetPeak()` opens a new window. `js_malloc_usable_size` returns the usable size minus the header, so QuickJS sees ordinary usable sizes.
  - Module loader via `JS_SetModuleLoaderFunc(rt, NULL, load_module, NULL)` (QuickJS's default name normalizer resolves `./x.js` against the importing module's path); sources are compiled with `JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY`.
  - Job loop: `JS_ExecutePendingJob` until empty; then the top-level module promise is checked with `JS_PromiseState`.
  - Globals: `console.log/info/warn/error`, `performance.now()` (CLOCK_MONOTONIC), `host` (`now`, `cpu`, `steps`, `readFile`, `writeFile`, `listDir`, `isDir`, `mem`, `resetPeak`, `gc`, `memUsage` = `JS_ComputeMemoryUsage`, `loader`, `evalScript`, `args`, `runtime`).
  - Options: `-s STACK_KB` (`JS_SetMaxStackSize`), `-m LIMIT_KB` (a limit on accounted bytes, like a world's), `--memo-ggx` (Step 4).
- Wrote `scripts/quickjs/build.sh` and `scripts/quickjs/crt-i386.S`.
  - QuickJS flags, both widths: `-O2 -fwrapv -fno-strict-aliasing -w -D_GNU_SOURCE -DCONFIG_VERSION="2026-06-04"`.
  - 32-bit: `-m32 -msse2 -mfpmath=sse -fno-pie -fno-stack-protector -isystem OUT/qjs32/inc -isystem /usr/include/x86_64-linux-gnu`, an empty `OUT/qjs32/inc/gnu/stubs-32.h`, a minimal `_start` (`crt-i386.S`, glibc's `sysdeps/i386/start.S` for glibc >= 2.34) and a link by path: `gcc -m32 -no-pie -nostdlib crt-i386.o *.o /usr/lib32/libm.so.6 /usr/lib32/libc.so.6 /usr/lib32/libgcc_s.so.1 -Wl,-dynamic-linker,/lib/ld-linux.so.2`.

### Why

- A runner of my own (rather than upstream `qjs`) lets the allocator count exactly what a world is charged, and adds the step counter the nucleus uses.
- The 32-bit build matters for memory: on a 32-bit target QuickJS NaN-boxes `JSValue` into 8 bytes (16 on x86-64) and pointers are 4 bytes, which is the device's layout (RV32).

### What worked

- Both binaries run a smoke test (BigInt, `await`, `new Function` with an async body):
  - 64-bit: `pointerBytes 8, jsValueBytes 16`, an empty runtime plus context is 153,016 requested bytes.
  - 32-bit: `pointerBytes 4, jsValueBytes 8`, 146,252 bytes.
- `file` reports `ELF 32-bit LSB executable, Intel 80386 ... interpreter /lib/ld-linux.so.2`.

### What didn't work

- First 32-bit compile: `/usr/include/stdlib.h:26:10: fatal error: bits/libc-header-start.h: No such file or directory`. With `-m32`, gcc searches the i386 multiarch include directory, which is absent. glibc's x86 `bits/` headers in `/usr/include/x86_64-linux-gnu` serve both word sizes, so the script adds that directory after the stub directory; `gnu/stubs.h` then includes the empty `gnu/stubs-32.h`.
- In zsh, a flag string in `$F` is not word-split (`gcc: error: unrecognized command-line option '-m32 -fno-pie ...'`); every build goes through `sh build.sh`.
- The first 32-bit build used i386's default x87 floating point. It produced different packed scene data from the 64-bit build for D-02 (and slowed float-heavy code about 2x). RV32 soft-float doubles are IEEE-exact, so the final build uses `-msse2 -mfpmath=sse`; with it, C-01, K-01 and X-02 pack identically in 32-bit and 64-bit (`packdiff.py`: "identical"). The x87 binaries (`scratchpad/qjs-build`) are kept only as evidence; all reported numbers come from `scratchpad/qjs-build-v2`.

### What I learned

- An empty QuickJS context costs about 150 KB in either width; the width matters for what the program allocates, not for the empty runtime.

### What was tricky

- The 32-bit link without dev packages: `libc_nonshared.a` is missing, so anything it supplies must be avoided. `-fno-stack-protector` avoids `__stack_chk_fail_local`; nothing in QuickJS or the runner calls `atexit`.

### What warrants a second pair of eyes

- `crt-i386.S` is hand-written; it passes NULL init/fini, which is what glibc >= 2.34 expects. The runner has no constructors, so this is enough here, but it is not a general replacement for crt1.o.

### Technical details

- Build: `sh scripts/quickjs/build.sh /home/manuel/code/wesen/2026-10-20--ds-js-os $S/qjs-build-v2 both` (S = the scratchpad). QuickJS objects are rebuilt only when older than their sources.

## Step 3: Loading Candela's modules, and a loader timing that counted twice

The driver (`scripts/quickjs/driver.mjs`) runs unchanged under the QuickJS runner and under Node (where it builds a small `host` stand-in from `node:fs`), so both engines run the same protocol and produce comparable hashes. Its first mode, `load`, imports `src/candela.js` and nothing else.

### What I did

- `driver.mjs` modes: `load`, `ggx`, `build ID RUNS`, `all [IDS]`, `dump ID OUT.json`. Every record is a line `@@{json}`. The preset loader is the census's (frontmatter `id`, `scene.js`, `lib/*` from the preset's folder).
- Ran `candela-qjs driver.mjs CANDELA load`.

### What worked

- Candela loads: 15 modules, 329,461 bytes of source. In 64-bit QuickJS the import took about 27 ms, of which about 26 ms was reading and compiling module sources; the heap after import is 1,563,401 requested bytes (1.40 MB in 32-bit).

### What didn't work

- The first loader total was 51.9 ms while the whole process took 28 ms. Tracing each call showed why: QuickJS calls the module loader re-entrantly. Compiling `candela.js` (`JS_Eval ... COMPILE_ONLY`) loads its imports from inside that call, so `candela.js` "took" 29.8 ms that included every other module. The runner now counts the total only for outermost calls and gives each module its own time (inclusive minus children).

### What I learned

- Per-module compile time is roughly proportional to source size; `compile.js`, `scene.js` and `fx.js` are about 5-6 ms each in 64-bit QuickJS.
- After import, `JS_ComputeMemoryUsage` attributes 560 KB to function objects (bytecode 144 KB, pc2line debug tables 65 KB) and 240 KB to 3,248 atoms. Candela loaded is already larger than a world's default 1 MB limit.

### What warrants a second pair of eyes

- `importMs` (measured in JS around `await import()`) and `loader.ms` (measured in C) overlap: the loader time is part of the import time, and the remainder is module evaluation.

## Step 4: The first build, the GGX table, and a loaded host

The first build of B-01 in 64-bit QuickJS took 3,485 ms cold and 2,550 ms warm, against 68 ms in Node. The parent agent's addition pointed at the cause before I went looking: the table behind `ggxTableWGSL()`.

### What I did

- `ggx` mode: after `load`, time `ggxAlbedoTable()` and `ggxTableWGSL()` three times each.
- Added `--memo-ggx` to the runner: when the loader reads `.../src/kernel.js` it replaces, in memory, `export function ggxTableWGSL() {\n  const t = ggxAlbedoTable();` with a version that keeps the first result (`let __ggxMemo = null; ... const t = __ggxMemo || (__ggxMemo = ggxAlbedoTable());`). It fails if the pattern is not found exactly once. The file on disk is not changed. With the memo, the driver computes the table once right after import (`memoPrewarm`), so no measured build includes it.
- Kept the subtraction method as the second estimate: build without the memo minus the table's median time.
- Added CPU time (`CLOCK_PROCESS_CPUTIME_ID`) and the interrupt-counter step count (`steps = interrupts * 1000 + 1000 - counter`, the nucleus's formula) to every timed section.

### Why

- `compile.js:539` calls `ggxTableWGSL()` once per compile, and nothing else in a build calls it, so the memo removes exactly one table per build and nothing else. The WGSL hash with the memo equals the hash without it (B-01: `7f9c2bd8` both ways), so the generated program is unchanged.
- The host was heavily loaded during this work (load average 4.5 rising to 15 on 8 threads; other processes were compiling with `cc1`/`cc1plus`; cores at about 2.1 GHz). Wall times of the same table varied from 2.5 s to 14.7 s. CPU time removes descheduling but not frequency scaling or SMT sharing; the step count is exact.

### What worked

- The table is the same in both engines (256 entries, hash of the 4-decimal values `61d93033` in Node and QuickJS). It is 26,738,461 steps in QuickJS in both widths. Its own peak heap is small (about 9 KB in 64-bit, 2.6 KB in 32-bit): the arrays allocated per iteration die at once by reference counting.
- With the memo, B-01's builds take 4-15 ms instead of seconds: the table is more than 99% of B-01's build.

### What didn't work

- `perf stat` is not available to this user (`/proc/sys/kernel/perf_event_paranoid` is 4); I did not change it.

### What I learned

- In QuickJS a table step costs about 105 ns on this host, against about 18 ns for a step of the nucleus's 100k calibration loop: steps are not a uniform unit of work, and a device estimate from steps alone would underestimate float-heavy code.

### What warrants a second pair of eyes

- The memo is an in-memory change to one function of Candela's source, made by the runner's loader. It is not the "driver-side shim that replaces nothing" that was suggested, because ES module bindings cannot be replaced from outside. It is opt-in, documented, and checked (identical WGSL hashes); the subtraction method is reported next to it.

## Step 5: All 105 presets, and the one host API QuickJS lacks

### What I did

- `candela-qjs --memo-ggx driver.mjs CANDELA all`, then the same in Node (`node --expose-gc driver.mjs CANDELA all`), and compared WGSL hashes, diagnostics and packed arrays.

### What worked

- 104 of 105 presets built in QuickJS on the first try; with an `atob` global, all 105 do.
- The generated WGSL is byte-identical between Node and QuickJS for every preset (FNV-1a hash of `compiled.shared`).
- Diagnostics are identical: 28 in total, the same codes, the same locations.

### What didn't work

- K-09 (lockstitch) failed in QuickJS:
  ```
  ReferenceError: 'atob' is not defined
      at bytes (<input>:29:32)
      at <anonymous> (<input>:39:62)
      at anonymous (<input>:4:1)
      at evalModule (.../candela-run/src/candela.js:80:13)
  ```
  The preset decodes 1.15 MB of base64 mesh data (`lib/lockstitch-data.js`) with `atob` when its module body runs. QuickJS has no `atob`. The runner now provides a native `atob` (WHATWG forgiving-base64 to a binary string); it agrees with Node on 12 test strings, including the three that must throw. This is the only Candela-facing shim.

### What I learned

- The slow presets in QuickJS are not slow compilers:
  - M-12 (multiscatter) runs `test.furnace()` twice in its scene code, a CPU Monte Carlo furnace test from `src/test.js`: about 24 s and 100 M steps in 64-bit QuickJS, with a peak near 120 MB.
  - X-02 (10,001 spheres) builds in about 0.6 s but each `pack()` takes about 4 s, because `pack()` rebuilds the BVH (`buildBVH`, sorting by centroid) on every call.
  - K-01, K-02, K-07, K-04 (meshes, HDRIs) take 1-5 s and peak at 50-76 MB.

### What warrants a second pair of eyes

- Peak heap in `all` mode is measured per preset after a GC, but in a runtime that has built the earlier presets. The per-preset numbers in the summary come from `build` mode (a fresh runtime per process).

## Step 6: What QuickJS changes in Candela's output and diagnostics

### What I did

- Built a scene with a misspelt method (`s.materail(...)`) and a scene with a syntax error in the middle, in both engines (`scratchpad/qjs-probe/loc.mjs`, `loc2.mjs`).
- Added `dump` mode and `scripts/quickjs/packdiff.py` to compare packed Float32 arrays element by element (count, largest absolute difference, largest difference in float32 ulps).

### What worked

- Packed data: Node and QuickJS differ only in last bits for most presets that differ at all (for example K-01: 48 of 4,499,280 `SDs` values, largest difference 6e-8 absolute; L-09: 2e-16 against -2e-16). Two presets differ visibly:
  - C-01: objects 3 and 4 swap places in the BVH order. Their centroids tie along the split axis up to last-bit differences in `Math` functions between V8 and glibc's libm, so each engine sorts them differently. Both BVHs are valid.
  - D-02 calls `Math.random()` in a build lambda (Candela itself warns W501), so it differs between any two runs.

### What didn't work, or works differently in QuickJS

- QuickJS ignores `//# sourceURL=`: a frame in a `new Function` body prints as `at <anonymous> (<input>:9:9)`, where V8 prints `at eval (scene.js:9:10)`. `diag.js`'s `FRAME` regex needs a `.js` file name, so in QuickJS `callSite()` can never find a user frame. For the same reason `candela.js`'s boot-time probe of the `new Function` line offset finds nothing and keeps its default (`lineOffset.n` = 2).
- In this unbundled setup the effect is hidden: both engines first match Candela's own `src/scene.js` frame (same base name as the user's `scene.js`) and report the same wrong location (`{"file":"scene.js","line":56,...}` for a mistake on line 5). Bundled, as Candela ships, V8 would give the user's line and QuickJS none.
- Syntax-error text differs (`Unexpected token ';'` in V8, `unexpected token in expression: ';'` in QuickJS). `syntaxLoc()` matches V8's wording; in this test it returned line 1 in both engines, so it is not a QuickJS-only loss here.
- QuickJS's rejection tracker fires for promises that are rejected before a handler is attached a job later; Candela's async module bodies do this whenever a scene throws. The runner prints these as "rejection without a handler yet" and fails only if one is still unhandled at exit.

### What warrants a second pair of eyes

- A fix for the missing locations would belong in the host (compile user files with a file name, for example a host `compileFunction(src, name)`) or in `callSite` (accept `<input>` frames). Neither is applied here.

## Step 7: Stack and memory limits as a world would see them

A world on the ESP32-P4 runs QuickJS with a 56 KB C stack limit and, by default, a 1 MB memory limit. The runner can impose both (`-s 56`, `-m 1024`), and I added a direct measurement of the C stack each build uses.

### What I did

- `run.py --phases stack,limit,all` with the v2 runners (raw file `scratchpad/qjs-raw/raw-A.jsonl`): every measured preset built once with `-s 56 --memo-ggx` in both widths; `load` with `-m 1024` and `-m 2048`; B-01 with `-m 4096 --memo-ggx`; then `all` in both widths and in Node.
- Added a stack high-water mark to the runner (v3, `scratchpad/qjs-build-v3`): `host.stackPaint()` fills 2 MB of free stack below the caller with `0xA5`, `host.stackUsed()` finds the deepest changed byte and returns its distance from `main()`'s frame (`__builtin_frame_address(0)`), which is about where QuickJS measures its own limit from (the stack top recorded by `JS_NewRuntime`). The driver paints before each build and each first pack. `stackBaseline` (paint, then read at once) is the depth at which the driver itself runs: 4,160 bytes in 64-bit, 3,304 in 32-bit.

### What worked

- With `-s 56`, all ten presets build in 32-bit QuickJS. In 64-bit, K-09 fails:
  ```
  InternalError: stack overflow
      at fl (.../src/fx.js:293:46)
      at lit (.../src/fx.js:294:37)
      at ref (.../src/fx.js:301:27)
      at <anonymous> (.../src/fx.js:312:39)
      at map (native)
      at code (.../src/fx.js:312:25)
  ```
  `Gen.ref` and `Gen.code` (the WGSL generator) recurse once per level of the expression graph, so the stack a build needs grows with the depth of the deepest material or field expression.
- B-01's build reaches 26,696 bytes of C stack in 64-bit and 19,956 bytes in 32-bit; its first `pack()` reaches 12,588 and 9,032 bytes.
- Memory limit: with `-m 1024` (a world's default), importing Candela fails, `module rejected: InternalError: out of memory`; with `-m 2048` it loads; B-01 builds within `-m 4096`.
- All 105 presets build in both widths once `atob` exists; WGSL and diagnostics are identical to Node's for all 105.

### What didn't work

- I edited `driver.mjs` to call `H.stackPaint()` while the first batch was still running against the v2 runner, which has no such function. The driver now calls it only if present (`stackPaint = () => { if (H.stackPaint) H.stackPaint(); }`). The process that was running at the time (`all`, 32-bit) had started before the edit and finished normally (rc 0, 105 rows).

### What I learned

- 32-bit frames are smaller (B-01: 75% of the 64-bit depth), so the 64-bit host overstates the stack a build needs on RV32. How RV32 frames at `-O2` compare with i386 frames is not settled here.

### What warrants a second pair of eyes

- The stack figure is from the host's glibc and gcc; newlib on the device and RISC-V register-rich frames will differ. Treat it as an estimate of margin, not a device value.

## Step 8: The timing campaign

With the runner, driver and checks in place, one sequential batch measured everything that depends on time, on the v3 runners. Processes ran one after another, never in parallel, and every record carries the host's load average before and after.

### What I did

- `python3 -I scripts/quickjs/run.py --build-dir $S/qjs-build-v3 --candela $S/candela-run --out $S/qjs-raw/raw-B.jsonl --phases load,ggx,build,memo,node,all`:
  - `load`: 5 fresh processes per engine (64-bit, 32-bit, Node).
  - `ggx`: 2 processes per QuickJS width, 3 repetitions each of `ggxAlbedoTable()`, `ggxTableWGSL()` and the nucleus's two calibration programs; 1 Node process.
  - `build` (Candela as shipped: each build recomputes the table): for B-01, R-01, F-01, A-01, L-03, W-02, G-01, K-01, X-02, 3 fresh processes per width, 2 builds each (cold, warm).
  - `memo` (`--memo-ggx`, the table computed once before the first build): the same presets plus K-09, 3 processes per width, 4 builds each (1 cold, 3 warm).
  - `node`: the same 10 presets, 3 Node processes, 4 builds each.
  - `all`: every preset once per engine (QuickJS with the memo), now with stack high-water marks.
- `python3 -I scripts/quickjs/summarize.py various/03-quickjs-front-end.json various/03-quickjs-front-end.txt raw-B.jsonl raw-A.jsonl:stack,limit` (the 56 KB and memory-limit results come from the first batch; every other figure from the second).

### Why

- Cold is what a handheld pays when the user opens a scene: the first build in a fresh runtime. Warm shows what is cached across builds in one runtime (K-01 caches about 31.6 M steps of its first build).
- The memo phase answers the parent's question directly; the shipped phase plus `ggx` gives the subtraction estimate; the step counts give an exact version of the subtraction (`coldStepsMinusTable` = shipped build steps minus `ggxTableWGSL()` steps).

### What worked

- The load average stayed between about 2 and 6 during this batch, far below the 15 of the earlier probes.
- Step counts are identical across processes and widths. B-01 as shipped is 26,746,217 steps cold; `ggxTableWGSL()` is 26,738,978; so the build without the table is 7,239 steps, 0.03% of the shipped build.

### What was tricky

- Wall and CPU times of the shipped builds still vary by about 30% between processes of the same preset (B-01 64-bit: 1,536-2,405 ms CPU). That spread is the table's, under frequency scaling on a shared laptop; the memo builds and the step counts are the steadier numbers.


## Step 9: Results, and what they mean for a handheld

The timing batch finished with no failed process. `summarize.py` wrote `various/03-quickjs-front-end.json` and `various/03-quickjs-front-end.txt`; the raw records are in `various/03-quickjs-front-end-raw-{A,B,C}.jsonl.gz` (raw-C holds a second stack-limit check, added after the `all` sweep found deeper presets than the first ten).

### What worked

- Module load, median of 5 fresh processes: 15.8 ms (64-bit) / 16.1 ms (32-bit), of which compiling the 15 modules is 15.2 / 15.4 ms; Node takes 15.2 ms. The heap after import is 1,538 KB / 1,368 KB requested (1,545 / 1,375 KB as a world is charged).
- GGX table: 1,476 ms (64-bit) / 3,680 ms (32-bit) of CPU, 26,738,461 steps, in both widths; Node 143 ms.
- Per preset, CPU ms, cold median of 3 processes (64-bit / 32-bit):

| id | shipped cold | memo cold | memo warm | Node shipped | pack0 | packT | WGSL bytes / lines | peak KB | build KB | kept KB | C stack KB |
|---|---|---|---|---|---|---|---|---|---|---|---|
| B-01 | 1,570 / 3,826 | 1.92 / 2.02 | 1.78 / 2.01 | 141 | 0.23 / 0.34 | 0.09 / 0.11 | 64,426 / 1,468 | 1,847 / 1,650 | 283 / 261 | 174 / 154 | 26 / 19 |
| R-01 | 1,674 / 3,752 | 3.28 / 3.24 | 2.92 / 3.19 | 143 | 0.65 / 1.11 | 0.50 / 0.81 | 65,380 / 1,495 | 1,879 / 1,663 | 303 / 273 | 207 / 183 | 26 / 19 |
| F-01 | 1,724 / 3,633 | 2.94 / 3.22 | 2.58 / 2.96 | 137 | 0.23 / 0.39 | 0.11 / 0.14 | 66,125 / 1,511 | 1,875 / 1,671 | 311 / 281 | 205 / 173 | 47 / 33 |
| A-01 | 1,580 / 4,209 | 2.00 / 2.48 | 1.90 / 2.18 | 136 | 0.12 / 0.16 | 0.09 / 0.12 | 65,701 / 1,504 | 1,874 / 1,665 | 310 / 279 | 192 / 175 | 28 / 21 |
| L-03 | 1,923 / 3,465 | 2.57 / 2.71 | 2.36 / 2.66 | 137 | 0.23 / 0.35 | 0.10 / 0.13 | 65,206 / 1,487 | 1,873 / 1,663 | 305 / 273 | 188 / 166 | 26 / 20 |
| W-02 | 2,520 / 5,464 | 5.98 / 6.82 | 5.80 / 6.49 | 152 | 0.88 / 1.41 | 0.77 / 1.19 | 73,808 / 1,673 | 1,984 / 1,746 | 407 / 351 | 292 / 248 | 53 / 37 |
| G-01 | 2,356 / 4,933 | 5.84 / 6.50 | 5.69 / 6.40 | 147 | 0.50 / 0.77 | 0.36 / 0.52 | 68,366 / 1,563 | 1,905 / 1,697 | 340 / 302 | 246 / 214 | 27 / 20 |
| K-01 | 6,290 / 12,552 | 2,811 / 4,047 | 488 / 739 | 592 | 0.73 / 0.92 | 0.69 / 0.87 | 78,244 / 1,811 | 49,421 / 44,950 | 47,851 / 43,555 | 42,811 / 42,697 | 43 / 30 |
| X-02 | 2,504 / 4,198 | 366 / 339 | 345 / 336 | 227 | 2,423 / 2,828 | 2,318 / 2,854 | 64,964 / 1,480 | 15,357 / 9,869 | 13,781 / 8,471 | 25,265 / 16,021 | 44 / 30 |
| K-09 | not run | 3,457 / 6,561 | 1,566 / 2,676 | 1,216 | 1.78 / 2.63 | 1.65 / 2.71 | 88,811 / 2,078 | 59,161 / 54,634 | 55,325 / 50,973 | 51,701 / 50,841 | 58 / 41 |

  "shipped" is Candela unchanged; "memo" is `--memo-ggx`; pack0/packT are wall ms of the first `pack({time:0})` and the median `pack({time:2.5})`; peak includes Candela's loaded modules; "build" is above the heap at the start of the build; "kept" is what is still alive after the build and its five packs; C stack is the high-water mark from `main()`'s frame.
- The memo and the step arithmetic agree: B-01 shipped minus `ggxTableWGSL()` is 7,239 steps; B-01 with the memo is 7,762 steps; the 523-step difference is the memoized `ggxTableWGSL()` still formatting its 256 values (`t.map(v => v.toFixed(4))`).
- All 105 presets, one process each, table memoized: 105/105 build in both widths (26.2 s total in 64-bit, 33.6 s in 32-bit; median 3.5 / 4.2 ms per preset). Node builds all 105 as shipped in 13.3 s.
- 56 KB stack (`-s 56`): in 32-bit, 14 of the 15 presets tried build, and S-04 overflows (`stack overflow` at `code (src/fx.js:312:25)` / `ref (src/fx.js:305:27)`); in 64-bit, K-09, S-04, X-04 and E-02 overflow. The full sweep's high-water marks: 32-bit maximum 69 KB (S-04), then X-04 54 KB, E-02 52 KB; 64-bit maximum 95 KB.

### What didn't work

- The subtraction method in CPU time (shipped build minus the table's median) is dominated by noise: it gives 94-146 ms for B-01 and -47.5 ms for F-01, because the spread of the table's own time (about 30%) is larger than everything else in a simple build. The step subtraction and the memo are the numbers to use.

### What I learned

- For simple scenes the front end is cheap in QuickJS once the constant table is out of the way: 2-7 ms per build and under 1.5 ms per pack on the host, in about 260-410 KB of working heap above Candela's own 1.37 MB (32-bit).
- The table is not cheap anywhere on a handheld. For scale only: the nucleus calibrates the device at 133 ms for its 100k loop and 31 ms for fib(20); here, in 32-bit QuickJS, they take 3.04 and 0.93 ms of CPU (ratios 44x and 33x). By those ratios the table would take about 2-2.7 minutes on the P4, and B-01 with the table precomputed about 70-90 ms. The table is double-precision arithmetic and the P4's FPU is single-precision only (`-march=rv32imafc ... -mabi=ilp32f` in the firmware notes), so it is likely to scale worse than both ratios. A device front end should ship the 256 table values as a constant.
- What else costs, once the table is gone, is scene content rather than compilation: K-01 (meshes, a 1024 x 512 HDRI) and K-09 (a 1.15 MB base64 mesh) need tens of MB of heap and keep 40-50 MB alive; X-02's 10,001 spheres make every `pack()` rebuild a BVH in 2.3-2.9 s; M-12 runs a CPU furnace test in its scene code for 13-15 s.
- 32-bit QuickJS on i386 is about 2.5 times slower than 64-bit on the float-heavy table even with SSE2, and only 0-20% slower on the simple builds. i386 has 8 registers and must move NaN-boxed 64-bit values in halves; RV32 has 32 registers, so this ratio is not a device prediction.

### What warrants a second pair of eyes

- The stack figures: S-04 needs 69 KB on i386 and X-04/E-02 come within 3 KB of 56 KB. Whether RV32 frames at `-O2` are larger or smaller than i386's decides whether more presets overflow on the device. The recursion is in Candela's WGSL generator (`Gen.ref`/`Gen.code`), one level per level of the expression graph.
- Times were taken on a shared laptop (powersave governor, turbo on, load average 2-6 during the final batch, up to 15 during the earlier probes). The step counts are exact; CPU times are good to perhaps 20-30%.

### What should be done in the future

- Measure the same driver on the device (a QuickJS world with a raised memory limit), at least `load`, `ggx` and B-01 with the memo, to replace the "for scale" ratios with a measurement.
- Decide the device memory budget: Candela's modules alone exceed a world's default 1 MB, before any scene.

### Code review instructions

- Start with `scripts/quickjs/candela-qjs.c` (allocator, loader, `atob`, `--memo-ggx`, stack painting), then `scripts/quickjs/driver.mjs` (modes and what each record contains), then `scripts/quickjs/summarize.py` (definitions at the top).
- Reproduce: `sh scripts/quickjs/build.sh <repo> <out> both`, then `python3 -I scripts/quickjs/run.py --build-dir <out> --candela <candela-copy> --out raw.jsonl`, then `python3 -I scripts/quickjs/summarize.py out.json out.txt raw.jsonl`.

### Technical details

- Runners: `$S/qjs-build-v3/qjs64/candela-qjs`, `$S/qjs-build-v3/qjs32/candela-qjs` (S = `/tmp/claude-1000/-home-manuel-code-wesen-2026-10-20--ds-js-os/8cb22ffd-b9b3-49d6-975e-44f61fbbbf0b/scratchpad`). Raw records: `$S/qjs-raw/raw-A.jsonl`, `raw-B.jsonl`, `raw-C.jsonl` (gzipped copies in `various/`).
- Summary command as run: `QJS_BUILD_DIR=$S/qjs-build-v3 python3 -I scripts/quickjs/summarize.py various/03-quickjs-front-end.json various/03-quickjs-front-end.txt $S/qjs-raw/raw-B.jsonl $S/qjs-raw/raw-A.jsonl:stack,limit $S/qjs-raw/raw-C.jsonl:stack`.
