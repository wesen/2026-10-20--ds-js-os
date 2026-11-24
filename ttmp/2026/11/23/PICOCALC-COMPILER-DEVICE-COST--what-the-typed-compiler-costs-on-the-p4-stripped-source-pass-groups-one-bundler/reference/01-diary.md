---
Title: Diary
Ticket: PICOCALC-COMPILER-DEVICE-COST
Status: active
Topics:
    - compiler
    - firmware
    - picocalc
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Investigation diary of PICOCALC-COMPILER-DEVICE-COST: QuickJS source stripping for the compiler bytecode, the P4-only pass-group slowdown, split in the core, one bundler."
LastUpdated: 2026-11-23T12:56:32.229488128-05:00
WhatFor: ""
WhenToUse: ""
---

# Diary

The work log of PICOCALC-COMPILER-DEVICE-COST, in the investigation format of the diary skill.

## Step 1: Reading the ticket and the evidence

The ticket asks four things of the Typed compiler on the ESP32-P4: strip QuickJS source text (and maybe all debug
information) from the compiler's bytecode, find the P4-only 15-96 ms boot-compile slowdown that PICOCALC-TYPED-PIPELINE
measured but never explained, move `split` into the core bundle so Files stops loading the loop group, and replace the
three bundlers with one. This step read the program design, the ticket design, the code and the earlier evidence, and
set up the diary before any change.

### Prompt Context
**User prompt (verbatim):** "TICKET: PICOCALC-COMPILER-DEVICE-COST — measure and reduce what the Typed compiler costs on the ESP32-P4: (1) set QuickJS source stripping (JS_SetStripInfo, never called today) where the compiler bytecode is produced, measuring JS_STRIP_SOURCE vs JS_STRIP_DEBUG; (2) find the cause of the P4-only 15–96 ms boot-compile slowdown from the lazily loaded RV32 pass groups and fix or explain it; (3) move `split` (and anything small `default` needs) into the core bundle so Files does not load the loop group; (4) one shared bundler for the three build scripts."
**Assistant interpretation:** instrument the P4 compile path first (device clock around each `eval_file` and the
compile phases), then make the four changes, each measured by a paired board study, with module bytes unchanged.
**Inferred user intent:** less compiler heap and boot time on the handheld, an explanation of an unexplained cost,
and one bundler instead of three.
**Commit (code):** none yet.

### What I did
- `git merge --ff-only main` (ce0bc30 -> 6e9c08c).
- Read AGENTS.md, the program design (`PICOCALC-TYPED-NEXT`), this ticket's design, `typed_p4.c`, `quickjs.h:969`,
  the three `build.mjs`, `rv32/policy.js`, `rv32/passes/{registry,loops-group,inline-group}.js`, and
  PICOCALC-TYPED-PIPELINE's diary Steps 3-5 and `various/02-board-run-2-hoisted/summary.txt`.

### Why
- The slowdown must be explained from device timings, not from the host: callgrind already showed equal instruction
  counts (Agenda 132.35 M vs 132.4 M).

### What worked
- The evidence is consistent and specific: the board run 2 deltas are identical in every block (Files +0.024 s x3,
  Chess +0.096 s x3), which points at a deterministic cost, not noise.

### What didn't work
- No failures in this step.

### What I learned
- `JS_SetStripInfo` is read per function at parse time (`quickjs.c:32873`: `fd->strip_debug`, `fd->strip_source` from
  `ctx->rt->strip_flags`), so it must be set on the runtime that parses a compiler source. In `typed_p4.c` that is
  whichever boot compile first evaluates the source (`eval_file`, `JS_Eval(... COMPILE_ONLY)`, then
  `JS_WriteObject`); every compile runtime is made in `p4_typed_compile`, so setting it there covers every producer.
- The slowdown is not only in compiles that load a group: Agenda and Editor run `interactive` and load no group, yet
  were +15 and +17-20 ms. The TYPED-PIPELINE control was the pre-module single bundle, so its candidate changed both
  the module structure (scope hoisting, the mixed-in FunctionCode prototype) and the lazy loading.
- `default` names `version` and `split`, both in the loops group; moving only `split` does not keep Files from loading
  the loops group unless `version` (16 KB of source) moves too, or the group is split again.
- "compile rejected" is printed only by `typed_p4.c:231`; no host test prints it.

### What was tricky to build
- N/A (reading only).

### What warrants a second pair of eyes
- Whether `version` belongs in the core: the ticket says "anything small `default` needs"; `version-loops.js` is
  16 KB of source, not small.

### What should be done in the future
- N/A.

### Code review instructions
- Start at `firmware/port/esp32p4/main/typed_p4.c` (`eval_file`, `rv32_load`, `p4_typed_compile`).

### Technical details
- Board run 2 of TYPED-PIPELINE (control main e219349, candidate 211383b; 3 blocks, peripherals on):
  Agenda +15 ms, Editor +17-20 ms, Files +24 ms, Chess +96 ms, Candela (first compile) +77-80 ms; peak -149, -157,
  +34, -122, +29 KB. Bytecode: rv32.js 474,091 B -> 260,813 + rv32-inline.js 44,824 + rv32-loops.js 195,486 B.

## Step 2: Instrumentation, the host's strip numbers, and what the design got wrong

The device clock now brackets every phase of a Typed compile on the P4, and a host tool measures what QuickJS keeps
of the compiler per strip mode. The host numbers are large: QuickJS keeps each function's source text, nested
functions keep overlapping slices of it, and the bytecode cache stores all of them. Reading the code also corrected
two premises of the ticket's design.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** instrument first, then change.
**Inferred user intent:** know where the device's time goes before changing anything.
**Commit (code):** 8c6a1ff — "feat(p4): time every Typed compile's phases (TYPEDCOMPILE line)"

### What I did
- `typed_p4.c`: a `compile_state` (the heap first, so the allocator's and the interrupt handler's opaque is
  unchanged) set as the context opaque, so `eval_file` (also called from `typedRv32Load` inside the compile) records
  per source: path, cached or parsed, `loadUs` (bytecode read, or text parse plus `JS_WriteObject`), `runUs` (the
  source's top level), `liveBytes` after it, and whether it ran inside the call. Also `beforeUs` (reading the app's
  source and reactor), `setupUs`, `callUs` (the linker entry: front end, back end, link) and `freeUs`
  (`JS_FreeContext` + `JS_FreeRuntime`). One `TYPEDCOMPILE {...}` line after the existing summary line, outside the
  timed region.
- `scripts/01-qjs-bytecode.c`: host QuickJS (the vendored 2026-06-04), parse each compiler file with a strip mode,
  keep `JS_WriteObject`'s bytecode, then read it into a fresh runtime as every later compile does.
- Built the control image: `firmware/port/esp32p4/build.sh playable /tmp/picocalc-device-cost-control` (8c6a1ff,
  app `adbe8ed4…`, about 15 minutes from scratch).

### Why
- The slowdown has to be located on the device; the host's instruction counts were already equal.

### What worked
- Host, all seven compiler sources (tape, wasm, rv32 core, inline, loops, async, world):

| strip | bytecode total | realm after reading all | read peak | parse peak |
|---|---:|---:|---:|---:|
| none | 1,064,883 B | 1,138,560 B | 1,156,280 B | 1,374,504 B |
| `JS_STRIP_SOURCE` | 263,411 B | 684,288 B | 686,528 B | 808,008 B |
| `JS_STRIP_DEBUG` | 190,501 B | 578,728 B | 580,936 B | 735,224 B |

  Per file (none / source / debug): rv32.js 338,362 / 79,102 / 57,474; wasm.js 274,213 / 65,451 / 48,126;
  loops 197,809 / 50,504 / 33,882; async 166,117 / 41,707 / 30,887; inline 58,125 / 15,563 / 10,763.

### What didn't work
- First ticket scripts computed the repository root one level too shallow (`parents[5]` for a script file):
  `subprocess.CalledProcessError ... returned non-zero exit status 1`; fixed to `parents[6]` (file) and
  `parents[5]` (the scripts directory).

### What I learned
- **Compile runtimes never collect cycles.** This QuickJS has its own arena allocator over the embedder's
  functions, and only its default allocator maintains `malloc_state.malloc_size`; `typed_p4.c`'s `compile_malloc`
  does not, so `js_trigger_gc` (`quickjs.c:1804`, called only from object creation with `sizeof(JSObject)`) never
  sees the 256 KB threshold crossed. Reference counting frees everything acyclic; cycles live until
  `JS_FreeRuntime`. So the GC schedule cannot explain the slowdown (I had suspected device-specific block sizes
  shifting it).
- **Files no longer uses `default`.** Since PICOCALC-TYPED-FIRST it is a Typed world on `typed-world.js` with
  `"policy": "interactive"` (apps/typed/files/app.json) and loads no pass group. The one `default` compile on the
  playable image is Candela's scene (`apps/typed/candela/app.json` names no policy), the first compile of every
  boot. `default` needs `version` (16 KB of source, which imports `hoist.js`, 15 KB) and `split` (2.7 KB): moving
  only `split` into the core changes nothing, and moving `version` grows every boot compile's core.

### What was tricky to build
- Records survive `typedRv32Load` re-entering `eval_file` during the call: the record pointer comes from the context
  opaque, and `in_call` marks group loads so their time can be subtracted from `callUs`.

### What warrants a second pair of eyes
- The stack frame of `p4_typed_compile` grows by about 0.7 KB (12 records); the JS stack limit is set after it.

### What should be done in the future
- N/A here; see Refinements in the design.

### Code review instructions
- `git show 8c6a1ff -- firmware/port/esp32p4/main/typed_p4.c`.
- Host tool: build line in `scripts/01-qjs-bytecode.c`; `qjs-bytecode 2 tape.js typed-wasm.js ...` from
  `compiler/typed/`.

### Technical details
- `TYPEDCOMPILE {"app","beforeUs","setupUs","callUs","freeUs","evals":[{"path","bytecode":"cached|parsed","inCall",
  "loadUs","runUs","liveBytes"}]}`.

## Step 3: One bundler

The three `build.mjs` scripts became module lists over one shared bundler, `compiler/typed/bundle.mjs`, and every
generated bundle stayed byte-identical, headers included. The front end's and the async lowering's bundles are the
same layout as the RV32 bundles once each module's label is a parameter: a header, `(() => { "use strict";`, then
per module a blank line, `// LABEL` and the text.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** item (4): one shared bundler, the bundles unchanged.
**Inferred user intent:** one place to change how the compiler is bundled.
**Commit (code):** b2efc56 — "build(typed): one shared bundler for the three compiler builds"

### What I did
- `bundle.mjs`: `script({header, modules, head, tail})`, `concatenated(root, names, label)` (plain scripts in a given
  order), `hoisted(root, entries, {label, registry})` (the RV32 scope hoisting moved verbatim: `skip`, `constNames`,
  `parse`, `closure`, the crossing names), and `main(import.meta, outputs, sources)` (write, or `--check` with one
  message form).
- New `build.mjs` files written next to the old ones (`build.next.mjs`), compared on all five outputs, then moved by
  `scripts/03-one-bundler.py`, which refuses unless all five are identical.
- Docs: `compiler/typed/rv32/README.md`, `docs/typed-compiler.md`, and a stale path in
  `docs/typed-compiler-and-the-ray-tracer.md` (`compiler/rv32/build.mjs` -> `compiler/typed/rv32/build.mjs`).

### Why
- Keeping the per-module labels (`---- frontend/lexer.js`, `rv32/encoding/tape.js`) and headers exact keeps the
  bundles' line numbers, so the device's bytecode is unchanged too.

### What worked
- `typed-rv32.js`, `typed-rv32-inline.js`, `typed-rv32-loops.js`, `typed-wasm.js`, `typed-async.js`: identical.
  The three `--check` commands pass.

### What didn't work
- No failures; the frontend and async module texts already start without blank lines and end with one newline, so the
  hoisting bundler's normalization is a no-op for them (checked before relying on it).

### What I learned
- The README's claim that the bundler accepts `import {a, b as c}` was wrong; renamed imports are an error.

### What was tricky to build
- N/A.

### What warrants a second pair of eyes
- `main()` resolves the repository root from `bundle.mjs`'s own location for its messages.

### What should be done in the future
- The front end and the async lowering could become ES modules and use the hoisting path too; not needed now.

### Code review instructions
- `node compiler/typed/{rv32,frontend,async}/build.mjs --check`; `git show b2efc56`.

### Technical details
- Tests import `bundles()` (rv32) and `bundle()` (frontend, async) from the `build.mjs` files; both kept.

## Step 4: A kernel pass group, the strip choice, and a wedged keyboard

The loops group split in two, the production firmware strips all debug information from the compiler's bytecode,
and the first board session ended at the install's health check because the keyboard bus was NACKing (the
coordinator had found it wedged at about 13:10, before my install). The board was left on my bench image
`fa144453`; per the coordinator, board work is paused until the user power-cycles it.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** items (1) and (3), plus the first board session.
**Inferred user intent:** less compiler memory and time at boot.
**Commit (code):** c7fca6b — "feat(rv32): a kernel pass group, so a default compile loads only what default needs";
4239fde — "feat(p4): compile runtimes strip all debug information from the compiler's bytecode"; merge of main
529100a (PICOCALC-BOARD-HARNESS, no firmware change).

### What I did
- `passes/kernel-group.js` (conjunctions, sets, ranges, facts), `passes/loops-group.js` (version, hoist, induction,
  split), `registry.js` groups and `GROUPS.kernel`, `build.mjs` a fourth bundle. `scripts/06-kernel-group-loaders.py`
  added `typed-rv32-kernel.js` next to every loader's `typed-rv32-loops.js` (18 files, counts checked per file),
  including `typed-apps.cmake` (`typed/rv32-kernel.js`) and the trace REPL's module table (`typedRv32Kernel`).
  `typed-rv32.test.mjs` now checks that a lazy `default` compile asks for inline and loops only.
- `typed_p4.c`: `JS_SetStripInfo(rt, COMPILER_STRIP)` with `COMPILER_STRIP` = `JS_STRIP_DEBUG`.
- `scripts/08-qjs-diagnostics.c` + `08-diagnostics-driver.js`: 33 rejected compiles (the tests' negative cases:
  typed-f32, typed-bitwise, typed-rv32 option errors, async diagnostics) through bytecode written under each strip
  mode and read back, as on the device.
- Digests: `scripts/07-compare-digests.sh` with `scripts/digests/` (PICOCALC-RV32-REGISTERS's harness; its Files
  and Agenda units failed with `SyntaxError: 71:47: unknown type WorldState` since both became Typed worlds, so the
  copy uses their app lists).
- Built arms (playable): control `adbe8ed4` (8c6a1ff), split `52c607c0` (529100a), strip `5d90890a` (cd08aea),
  each kept under `/tmp/picocalc-device-cost-arm-*`.
- Board session 1: `04-typedcost-session.py --install` with the bench image `fa144453` (b2efc56 plus the
  experiment tree): written and verified at 13:16, then health failed.

### Why
- Strip mode: the host gives `JS_STRIP_DEBUG` another 73 KB less bytecode and about 105 KB less realm than
  `JS_STRIP_SOURCE`; it costs only `file:line` in stack traces through the compiler. The in-image session measures
  both on the device before the choice is final.

### What worked
- 84 of 84 digests identical to main (`IDENTICAL 84 of 84`).
- Host rejected-compile check: `messages identical: True`; stacks naming a compiler line: 33 / 33 / 0 for strip
  none / source / debug (first frame `at fail (typed-wasm.js:190:30)` against `at fail`).
- New bundle sizes on the host (bytecode none / source / debug): loops 112,112 / 27,563 / 18,619, kernel 88,362 /
  24,593 / 16,581 (the old loops group: 197,809 / 50,504 / 33,882).
- The failed install's boot still logged every compile (unstripped, old groups, instrumented): Candela (cold) parses
  tape 26 ms, wasm 212 ms, rv32 290 ms, inline 56 ms, loops 185 ms (780 ms of 2.54 s); Agenda loads in 72 ms and
  calls for 2.50 s; Chess loads in 85 ms plus 6.8 ms for the inline group inside its 4.02 s call; teardown 16-41 ms.

### What didn't work
- `make test` first stopped in test-generated: `compiler/typed/typed-rv32-kernel.js: listed in
  tools/file-length-exceptions.txt but not a tracked source file over 500 lines; remove the entry` (the new bundle
  was not yet tracked); `git add` fixed it. All node suites before it passed.
- Session 1: `ValueError: physical keyboard I2C0 did not qualify: {'busyMs': 4899.51, 'transfers': 284, 'bytes':
  1139, 'errors': 284} -> {'busyMs': 5118.55, 'transfers': 304, 'bytes': 1220, 'errors': 304}` — every transfer an
  error; no typedcost command ran.

### What I learned
- Chess's lazy group load is 6.8 ms on the device; TYPED-PIPELINE's +96 ms for Chess is not the group evaluation.

### What was tricky to build
- The experiment tree's strip knob must replace the production `JS_SetStripInfo` line, not precede it (updated in
  `02-experiment-tree.py` after 4239fde; the knob defaults to `COMPILER_STRIP`).

### What warrants a second pair of eyes
- Loaders list the group files by hand (18 files); a fifth group would need the same sweep.

### What should be done in the future
- Restore the playable image after the power cycle (the board is on `fa144453`).

### Code review instructions
- `git show c7fca6b --stat`; `bash scripts/07-compare-digests.sh BASE_TAR SCRATCH`;
  `qjs-diagnostics STRIP scripts/08-diagnostics-driver.js tape.js ...` from `compiler/typed/`.

### Technical details
- Board arms: `/tmp/picocalc-device-cost-arm-{control,split,strip}` (app, partition table, bootloader,
  picocalc-build.json).

## Step 5: Gates on the host, and a cache simulation while the board is paused

With the board paused, the host gates ran on the full branch, and callgrind's cache simulation tested the layout
hypothesis for the slowdown: the same compile, with the same instructions and the same image, misses the simulated
caches more or less depending only on which compiler bundles are in the realm, by 4 to 11 percent of the L2 data
misses, and not always in the same direction.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** host-side work while the coordinator's pause holds ("Pause all board work until I tell
you the user has power-cycled it; continue host-side work").
**Inferred user intent:** keep the evidence moving without the board.
**Commit (code):** db38a6b — "test(trace-repl): an old revision misses the kernel group bundle too"

### What I did
- `GOWORK=/tmp/picocalc-device-cost-go.work make test` (a go.work in /tmp: this worktree plus
  `/home/manuel/code/wesen/go-go-golems/go-go-goja`, since go.mod's replace is relative to the main checkout).
- `make test-host` and `make test-host OPTIONS='{"policy":"kernel"}'`.
- `scripts/11-qjs-compile.c` (one warm compile after reading bytecode, `measured_compile` marked for callgrind's
  `--toggle-collect`), `11-compile-driver.js`, `12-cachesim.sh`: P4-like caches (I1 16 KB 4-way, D1 64 KB 4-way,
  L2 128 KB 8-way, 64 B lines), Agenda (`interactive`) and Chess (`balanced`) as world compiles, lazy (core, plus
  inline for Chess) against all (every group), strip none and debug. Results in `various/01-cachesim/collected.txt`.

### Why
- The device's own counters come from the in-image session; this is a host proxy for the mechanism, cheap to run
  while the board waits.

### What worked
- `make test`: exit 0 (134 node tests passing over the suites, test-generated, go, native, cji, rv32).
- `make test-host`: ray 4,888,369 instructions, 11964 B, `430f0d501659` (reference); Chess 6981 words, 128,152,624
  instructions, 21716 B; 25/25 workflows. Kernel: ray 3,239,635, 11544 B, `430f0d501659`; Chess 6981 words,
  118,361,847, 19892 B; 25/25.
- Cache simulation (instructions; L2 data misses read + write):

| compile | strip | lazy Ir | all Ir | lazy L2D miss | all L2D miss | all - lazy |
|---|---:|---:|---:|---:|---:|---:|
| Agenda | none | 546.30 M | 545.03 M | 600,710 | 574,932 | -4.3 % |
| Agenda | debug | 545.21 M | 546.37 M | 584,025 | 649,544 | +11.2 % |
| Chess | none | 656.37 M | 655.79 M | 634,895 | 606,777 | -4.4 % |
| Chess | debug | 655.45 M | 655.79 M | 676,836 | 639,718 | -5.5 % |

  Images identical in every arm (Agenda 66,252 B, Chess 37,848 B, same checksum).

### What didn't work
- `make test` failed once in test-go: `--- FAIL: TestCompilerRevisionsCoexistInOneSession ... 25cd108:
  {Missing:[... typed-rv32-inline.js typed-rv32-loops.js typed-rv32-kernel.js ...]}`: the trace REPL loads an old
  revision and counts the bundles it lacks, now 6; the test expected 5. Fixed in db38a6b.
- The first loop of callgrind runs printed `Collected : 0` and no result line for every run; run again one by one
  with the same flags they collected normally. I did not find why; `12-cachesim.sh` keeps each run's log.

### What I learned
- Identical compile work in a different realm changes the simulated L2 data misses by tens of thousands, in either
  direction. At a few hundred nanoseconds per PSRAM line fill on the P4, that is the order of TYPED-PIPELINE's
  15-96 ms.

### What was tricky to build
- Measuring only the compile: the bytecode is written in a first runtime and read in a second, as on the device,
  and only `measured_compile` (the driver's `JS_Eval`) is collected.

### What warrants a second pair of eyes
- A host allocator is not the P4's TLSF heap; the simulation shows that the effect exists and its size, not the
  device's numbers.

### What should be done in the future
- The in-image session (E2, E3) measures the same comparison with the P4's own cache counters.

### Code review instructions
- `bash scripts/12-cachesim.sh /tmp/qjs-compile OUT` after building `11-qjs-compile.c` (command in its header).

### Technical details
- Events: `Ir Dr Dw I1mr D1mr D1mw ILmr DLmr DLmw`.

## Step 6: The TYPED-PIPELINE pair on the host, arena churn, and arena parking

Simulating TYPED-PIPELINE's own control and candidate showed what the earlier callgrind hid: the candidate's compile
itself runs 1.1 % more instructions (Agenda), while its smaller bundle is cheaper to read, so the two cancelled in a
count of whole rounds. Counting the embedder's heap calls then exposed a cost that is cheap on the host and dear on
the P4: QuickJS returns a 4 KB arena the moment it empties and takes a new one when it needs it again, thousands of
times per compile, by an amount that moves with whatever else the realm holds. Each is a TLSF allocation in PSRAM on
the device. The compile now parks freed arenas and reuses them.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** item (2): find the cause of the slowdown, and fix it if it can be fixed.
**Inferred user intent:** a mechanism, not a shrug.
**Commit (code):** de8065d — "feat(p4): count a compile's calls to the port heap and the time inside them";
7682d93 — "feat(p4): a compile reuses QuickJS's freed arenas instead of returning them to the PSRAM heap"

### What I did
- `scripts/13-cachesim-pipeline.sh`: e219349 (control) and 211383b (candidate) extracted with `git archive`, the
  same simulated caches, Agenda (`interactive`, then reminder + entry, no imports) and Chess (`balanced`, a world).
- `scripts/14-cg-diff.py`: per-function self-cost differences between two callgrind outputs; call counts of the
  embedder functions from `callgrind_annotate --tree=caller`.
- `scripts/15-qjs-arenas.c`: a device-like allocator (it does not maintain `malloc_size`, so no cycle collection, as
  in `typed_p4.c`) counting mallocs, frees and reallocs during the compile only, with `PARK=1` the parking policy.
- `typed_p4.c`: `heap: {mallocs, frees, reallocs, reused, us}` in TYPEDCOMPILE (cycle counter around each port heap
  call); arena parking: requests of 3584..4096 bytes take 4096-byte blocks, up to 64 freed ones are parked and
  reused, parked blocks stay counted as live, the teardown frees them.
- Built the arm `cc6e0008` (7682d93: strip, kernel group, counters, parking) and the strip-source arm `d8071198`
  (3f883ef with `COMPILER_STRIP` = `JS_STRIP_SOURCE`, built dirty and reverted).

### Why
- Equal instruction totals with a device-only slowdown pointed at a cost that is cheap per instruction on the host
  and expensive on the P4: PSRAM misses, or calls into a heap that is cheap on glibc and not in ESP-IDF.

### What worked
- TYPED-PIPELINE pair, compile only (current QuickJS): Agenda 121.12 M -> 122.50 M instructions (+1.1 %), simulated
  L2 data misses 113,153 -> 119,369 (+5.5 %); Chess 629.70 M -> 632.09 M (+0.38 %), L2 data misses -0.5 %, L2
  instruction misses +4.9 %. Agenda's extra work: more objects and properties (`add_property` 8,647 -> 9,270 calls,
  `JS_CreateProperty` 9,249 -> 9,923), more JS calls (`JS_CallInternal` 69,373 -> 69,632), and 1,032 -> 1,679 new
  arenas (`js_malloc_new_arena`).
- Current code, arenas created during one compile (host, default allocator): Agenda 2,559 (lazy, unstripped), 2,132
  (all groups), 2,850 (lazy, stripped), 4,706 (all, stripped); Chess 4,110, 3,547, 4,033, 5,126.
- Device-like allocator, compile only:

| compile | strip | park | mallocs | frees | reallocs | reused | realm | peak |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Agenda | none | off | 3,708 | 3,688 | 1,456 | 0 | 905 KB | 2,477 KB |
| Agenda | none | on | 2,242 | 2,159 | 1,456 | 1,466 | 920 KB | 2,499 KB |
| Agenda | debug | off | 3,012 | 2,992 | 1,455 | 0 | 583 KB | 2,153 KB |
| Agenda | debug | on | 2,244 | 2,160 | 1,456 | 768 | 590 KB | 2,173 KB |
| Chess | none | off | 4,149 | 3,942 | 1,488 | 0 | 1,134 KB | 2,997 KB |
| Chess | none | on | 1,955 | 1,684 | 1,488 | 2,194 | 1,148 KB | 3,026 KB |
| Chess | debug | off | 3,266 | 3,053 | 1,488 | 0 | 679 KB | 2,559 KB |
| Chess | debug | on | 1,961 | 1,684 | 1,488 | 1,305 | 687 KB | 2,590 KB |

  Images identical in every run (Agenda 66,252 B, Chess 37,848 B). Stripping alone takes 324 KB (Agenda) and 438 KB
  (Chess) off the host's compile peak.

### What didn't work
- `14-cg-diff.py` first summed the annotated call-tree sections and matched names carrying call counts (`JS_CallInternal'2
  (69,632x)`), giving totals of 1.88 G; it now reads only the flat profile.
- A zsh loop passed three group files as one argument (`typed-rv32-inline.js typed-rv32-loops.js typed-rv32-kernel.js:
  No such file or directory`); the lazy rows above are unaffected, the all rows were not rerun.

### What I learned
- The earlier callgrind compared whole cached rounds: the candidate read 213 KB less bytecode and executed more in the
  compile, and the totals matched. On the P4 reading bytecode is sequential and cheap per instruction; the compile is
  pointer-chasing in PSRAM.
- Arena churn is chaotic: it depends on which size classes sit near an arena boundary when the compile starts, i.e.
  on everything the realm holds. That is why any change to the loaded bundles moves a compile's time by a fixed,
  reproducible amount in either direction.

### What was tricky to build
- Parking must not change the heap cap's meaning: parked blocks stay in `live`, a reused block does not count twice,
  and rounding arena requests up to 4096 bytes makes every parked block fit every arena request.

### What warrants a second pair of eyes
- `compile_free` parks any block whose usable size is 4096..4159, which includes a large block QuickJS asked for at
  that size; it is reused for an arena or a large block of at most 4096 bytes, which fits.

### What should be done in the future
- The device decides: TYPEDCOMPILE's heap counters on the P4, parking off and on in one image (E4), and the boot
  study arm.

### Code review instructions
- `git show 7682d93 -- firmware/port/esp32p4/main/typed_p4.c`; `scripts/15-qjs-arenas.c` build line in its header.

### Technical details
- QuickJS arena request: `sizeof(JSMallocArena)` (24 B on RV32) + n_blocks x block_size, n_blocks =
  (4096 - 24) / block_size, so 3608..4096 bytes for block sizes up to 512.

## Step 7: Merging TYPED-VALUES, and the gates again

Main gained PICOCALC-TYPED-VALUES (a large front-end and back-end change) while the board stayed paused. The merge
conflicted only in a generated bundle; regenerating every bundle with the shared bundler reproduced main's
`typed-wasm.js`, `typed-async.js` and `typed-rv32-inline.js` byte for byte, which also exercises the bundler on inputs
it was not written against. All host gates pass on the merged tree, and the final playable image is built.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** keep the branch mergeable and gated while the board is unavailable.
**Inferred user intent:** the coordinator merges in order; a stale branch costs them a conflict.
**Commit (code):** 3905072 — "Merge main (PICOCALC-TYPED-VALUES) into PICOCALC-COMPILER-DEVICE-COST"; 1dc2b51 (main's
program diary).

### What I did
- `git merge main` (514b8e8): `CONFLICT (content): Merge conflict in compiler/typed/typed-rv32-loops.js`. Resolved by
  running the three builds; `frontend/build.mjs` auto-merged main's two new modules (`frontend/values.js`,
  `frontend/arrays.js`) into my module list.
- Swept the loaders again: main's new `tests/compiler/values-helpers.mjs` loaded the loops group but not the kernel
  group; added it.
- `make test`, the 84-digest harness against main 514b8e8, `make test-host` with both policies, and the final
  playable build `firmware/port/esp32p4/build.sh playable /tmp/picocalc-device-cost-control` (3905072, app
  `f40c4629…`, kept in `/tmp/picocalc-device-cost-arm-final`).

### Why
- The board arms of the study stay on the old base (adbe8ed4, 52c607c0, 5d90890a, cc6e0008): they differ from each
  other only by this ticket's changes, which is what a paired study needs. The final image is what the gates judge.

### What worked
- `typed-wasm.js`, `typed-async.js`, `typed-rv32-inline.js`: identical to main's; `typed-rv32.js` differs only in the
  registry's group names and `GROUPS`.
- `make test`: exit 0. Digests: `IDENTICAL 84 of 84` against main 514b8e8.
- `make test-host`: ray 4,888,369 instructions, 11964 B, `430f0d501659` (reference); Chess 6981 words, 128,152,624,
  21716 B; 25/25. Kernel: 3,239,635, 11544 B, `430f0d501659`; 6981 words, 118,361,847, 19892 B; 25/25.

### What didn't work
- The conflict above; no other failure.

### What I learned
- A module list is the only thing a frontend change touches in a `build.mjs` now, so git merges it cleanly.

### What was tricky to build
- N/A.

### What warrants a second pair of eyes
- Any loader added on main after this merge must list `typed-rv32-kernel.js` too; the kernel-policy tests fail loudly
  (`the RV32 pass conjunctions needs typed-rv32-kernel.js`) if one does not.

### What should be done in the future
- The board: the in-image session, the boot study, the final image's health and deadlines.

### Code review instructions
- `git show 3905072 --stat`; `bash scripts/07-compare-digests.sh BASE_TAR SCRATCH` with `git archive main compiler/typed`.

### Technical details
- Board images: control `adbe8ed4` (8c6a1ff), split `52c607c0` (529100a), strip `5d90890a` (cd08aea), strip-source
  `d8071198` (3f883ef, dirty), park `cc6e0008` (7682d93), bench experiment `27d4a946` (e17d025 + experiment tree),
  final `f40c4629` (3905072).

## Step 8: Waiting on the board, and what is ready for it

From 13:20 to 16:10 the board stayed paused (the keyboard's I2C bus NACKing until the user power-cycles it; main's
program diary at fd76795 still lists the power cycle as outstanding). Everything the board work needs is built and
scripted, so the remaining work is three board sessions and a restore. The board is still on my bench image
`fa144453` from session 1 (installed at 13:16, health failed on the keyboard): after the power cycle it boots that
image, not the playable one, until someone restores it.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** hand back with the board work ready to run, rather than idle without end.
**Inferred user intent:** the coordinator resumes this agent (its context intact) once the board is usable.
**Commit (code):** none (bookkeeping only).

### What I did
- Polled main's ref every 2.5 minutes for a coordinator update; none came.

### Why
- Board work is paused by the coordinator; nothing else in the ticket needs the board's absence.

### What worked
- N/A.

### What didn't work
- No board access since 13:16.

### What I learned
- N/A.

### What was tricky to build
- N/A.

### What warrants a second pair of eyes
- The board's current image is `fa144453` (an experiment bench image), not the playable one.

### What should be done in the future
1. In-image session (one install, about 18 minutes of compiles):
   `python3 scripts/04-typedcost-session.py --build /tmp/picocalc-device-cost-bench --out OUT1 --install
   scripts/05-session-1-plan.json`, then `python3 scripts/10-analyze-session.py OUT1`.
   The bench image in that build directory is `27d4a946` (e17d025 plus the experiment tree).
2. Boot study (12 installs, about 35 minutes; each install takes the lock on its own):
   `python3 scripts/09-boot-study.py --arm control=/tmp/picocalc-device-cost-arm-control --arm
   split=/tmp/picocalc-device-cost-arm-split --arm strip=/tmp/picocalc-device-cost-arm-strip --arm
   park=/tmp/picocalc-device-cost-arm-park --out OUT2 --blocks 3`.
3. The final image's gate: `device.install('/tmp/picocalc-device-cost-arm-final', OUT3, 'on')` (health with
   peripherals on), and the boot compiles' share of their deadlines from its log (`09-boot-study.py --summarize`
   reads one).
4. `cd /home/manuel/code/wesen/2026-10-20--ds-js-os && make restore-playable`, then confirm health.

### Code review instructions
- The arms: `/tmp/picocalc-device-cost-arm-{control,split,strip,stripsource,park,final}` (each with
  `picocalc-build.json`).

### Technical details
- Arm digests: control `adbe8ed4`, split `52c607c0`, strip `5d90890a`, strip-source `d8071198`, park `cc6e0008`,
  final `f40c4629`; bench `27d4a946`.

## Step 9: The CANDELA-KERNEL-CODEGEN merge, and every board image rebuilt on the merged base

The coordinator reported the power cycle (the board back on playable `54cfa09b`, main 209af25) and asked for main to
be merged first: CANDELA-KERNEL-CODEGEN added two kernel-only passes, `rows` and `coalesce`, to the loops group.
They belong in the kernel group. Because main's compiler changed under every arm, all board images were rebuilt
from the merge, so the study measures this ticket's changes on what will actually be merged.

### Prompt Context
**User prompt (verbatim):** see Step 1. Coordinator: "the user power-cycled the PicoCalc; the board is back on
playable 54cfa09b (main 209af25, health passed). Before your board work, merge main into your branch: it now has
PICOCALC-CANDELA-KERNEL-CODEGEN, which adds kernel-only passes `rows` and `coalesce` (compiler/typed/rv32/passes/)
— they belong in your typed-rv32-kernel.js group; regenerate bundles, rerun make test, the 84-digest harness and
both host gates. Rebuild your arms if their base matters for the study (state which base you used). Then run your
three board steps (in-image session, paired boot study, final image gate) and restore from the main checkout.
Other agents share the board through the lock — hold it per measurement block, not for the whole study."
**Assistant interpretation:** merge, move rows and coalesce to the kernel group, regate, rebuild the images on the
merge, and restructure the in-image session so the lock is held per block.
**Inferred user intent:** device numbers that describe the branch as it will merge, without monopolizing the board.
**Commit (code):** 54dfe3b — "Merge main (PICOCALC-CANDELA-KERNEL-CODEGEN) into PICOCALC-COMPILER-DEVICE-COST";
dcd9d3b — "docs(device-cost): arms on the merged base, a session in blocks with the lock per block"

### What I did
- `git merge main` (4e35068): conflicts in `loops-group.js`, `registry.js` and the two generated RV32 bundles. Kept
  this branch's loops group; `rows` and `coalesce` (with `floatingFunction`, `groupRowReads`, `coalesceCopies`)
  moved into `kernel-group.js`; registry groups `kernel`; regenerated the bundles; README group table updated.
- `scripts/16-gallery-digest.mjs`: the Candela gallery (which the 84-digest harness predates) under interactive,
  balanced, default and kernel, image + observed tapes + entries, main's bundles against this tree's.
- Rebuilt the bench image on the merge (`02-experiment-tree.py apply`, bench profile, revert): `b648cf40`.
- `scripts/17-boot-arms.py build-all`: the boot study's ladder from 54dfe3b, each arm one change more:
  control (main 4e35068's `typed-rv32.js` and `typed-rv32-loops.js`, a stub kernel bundle nothing loads, no strip,
  no parking) `51394227`; group (this tree's bundles) `96880a94`; strip (+`JS_STRIP_DEBUG`) `7d44fbf5`; final
  (+arena parking, the commit as is) `5fec9195`.
- `05-session-plan.py` now writes blocks (`05-session-2-plan.json`, 7 blocks, 155 commands), each setting its own
  strip and park knobs and filling the cache first; `04-typedcost-session.py` holds the lock per block and installs
  the experiment image again if another agent replaced it. E2 (lazy against all) runs without parking, as
  TYPED-PIPELINE measured it, and again with parking (E2p).

### Why
- The old arms were on the pre-TYPED-VALUES base; the compiler bundles have grown since (value records, rows,
  coalesce), and the slowdown hypothesis depends on what the realm holds, so the old base would measure a
  different realm.

### What worked
- Gallery: identical image, tapes and entries under all four policies (kernel: 434,996 bytes, 2,519 observed tapes).
- `make test`: exit 0 (154 node tests, test-generated, go, native, cji). Digests: `IDENTICAL 84 of 84` against main
  4e35068.
- `make test-host`: ray 4,888,369, 11964 B, `430f0d501659`; Chess 6981 words, 128,152,624, 21716 B; 25/25.
  Kernel: 3,239,635, 11544 B, `430f0d501659`; 6981 words, 118,361,847, 19892 B; 25/25.

### What didn't work
- The worktree guard refuses shell loops and `source`; the builds run through `17-boot-arms.py build-all` and a
  scratch `idf-build.sh`.

### What I learned
- The first in-image session waited behind CANDELA-KERNEL-CODEGEN's device run for the lock, as intended.

### What was tricky to build
- E3 (heap padding) and E2 used to inherit their strip mode and cache from the block before; as independent
  blocks they now set strip and park on their first command and warm the groups they measure.

### What warrants a second pair of eyes
- The control arm takes main's generated bundles verbatim rather than regenerating them; `typed-rv32.js` differs
  from this tree's only in the registry's group names and `GROUPS` (21 lines).

### What should be done in the future
- N/A (the board work follows in the next step).

### Code review instructions
- `git show 54dfe3b -- compiler/typed/rv32/passes`; `node scripts/16-gallery-digest.mjs FILES...` with each tree.
- `python3 scripts/17-boot-arms.py apply control` then `revert`.

### Technical details
- Arms: `/tmp/picocalc-device-cost-arm2-{control,group,strip,final}`; bench `/tmp/picocalc-device-cost-bench`
  (`b648cf40`). All built at 54dfe3b (recorded dirty: the ticket's scripts were uncommitted at the time; the
  control, group and strip arms are dirty by construction).

## Step 10: The in-image session on 54dfe3b, and what the pass-group slowdown is

The in-image session ran on the bench image `b648cf40` (54dfe3b: TYPED-VALUES, CANDELA-KERNEL-CODEGEN and this
ticket, without COMPILE-CACHE, so no compile collects cycles). Strip mode, lazy against eager groups with and without
arena parking, and heap padding. The answer to the slowdown: the time of a compile on the P4 depends on where its heap
lands. The same compile repeats within a few milliseconds, but anything that moves its allocations (which bundles
the realm holds, parking, a 1 KB block held in front of it) moves it by up to about 2 percent, in either direction.

### Prompt Context
**User prompt (verbatim):** see Step 1 and Step 9.
**Assistant interpretation:** run the in-image session with the lock per block; explain the slowdown from it.
**Inferred user intent:** a device-measured cause, not a host simulation.
**Commit (code):** 5e0af78, 20a4b23 (scripts only)

### What I did
- Session 2 (`/tmp/picocalc-device-cost-session2`) stopped: between the install and block E1a another agent installed
  its image twice, and the old loop would have given up after three installs. `04-typedcost-session.py` now installs
  under the block's own lock (the steps of `device.install`), and `--per-lock 2` runs two blocks per hold. Stopped
  the old run with TaskStop while it was waiting for the lock (checked in `/proc/locks`).
- Session 3: E1a. Session 4: E1b, E2, E2p and E3, two blocks per lock. E2b and E4 were left for the new base (Step
  11), because main now collects cycles during a compile. Tables: `various/02-session-54dfe3b/tables.txt`, rows next
  to it.

### Why
- Four other agents' sessions shared the board (CANDELA-KERNEL-CODEGEN, COMPILE-CACHE, BOARD-HARNESS); a lock hold
  of one or two blocks kept each wait to one queue position.

### What worked
- E1 (strip, parking on, two orders): JS_STRIP_DEBUG against none, per app, cold / warm:
  Agenda 3,365 -> 3,204 / 2,733 -> 2,693 ms, peak 2,511 -> 2,105 / 2,454 -> 2,057 KB;
  Files 2,092 -> 1,928 / 1,475 -> 1,454 ms; Editor 4,114 -> 3,900 / 3,364 -> 3,337 ms;
  Chess 5,110 -> 4,894 / 4,302 -> 4,250 ms, peak 3,225 -> 2,682 / 3,147 -> 2,634 KB;
  Candela 2,509 -> 2,303 / 1,750 -> 1,717 ms, peak 1,811 -> 1,333 / 1,770 -> 1,286 KB.
  The saving is in the load (Agenda warm 84 -> 58 ms, cold 683 -> 520 ms) and the realm (893 -> 479 KB); the call is
  unchanged within noise. JS_STRIP_SOURCE sits between: against it, JS_STRIP_DEBUG saves another 60-110 ms cold,
  0-25 ms warm and 50-90 KB of peak. Module bytes and CRCs identical in every mode.
- E2 (unstripped, no parking: TYPED-PIPELINE's condition), lazy minus all, warm, six compiles each:
  Agenda -47 ms, Chess +34 ms, Candela -9 ms. Within a condition the six compiles agree to a few ms (Chess lazy
  4,317-4,352, all 4,302-4,313).
- E2p (the same with parking): Agenda -38, Chess -48, Candela -7 ms. Chess changes sign.
- E3 (Agenda and Chess, unstripped, lazy, no parking; a PSRAM block of 0, 1, 3, 8, 64 or 1024 KB held across the
  compile): identical heap calls, totals from 2,719 to 2,766 ms for Agenda and 4,304 to 4,325 ms for Chess.

### What didn't work
- `typedcost` rows of session 2: none (the block never ran).

### What I learned
- The P4-only slowdown of TYPED-PIPELINE (15-96 ms) is a placement effect, not a cost of lazy loading: lazy loading
  saves about 19 ms of bytecode reading per compile and adds the group's evaluation inside the call (Chess 7 ms,
  Candela 17 ms); everything else is the compile running 1-2 percent faster or slower depending on where its
  allocations land. In every condition the core-1 L1 instruction misses move with the time (E2 Chess +13 k misses
  with +50 ms of call; E2p -9 k with -32 ms; E3 Agenda 261 k at 2,719 ms, 275 k at 2,766 ms), so the mechanism is
  cache conflicts that depend on addresses. On the host, callgrind's cache simulation showed the same kind of
  variation (Step 5).
- Parking does not remove the effect, it moves it: with parking the lazy groups are faster in all three apps.

### What was tricky to build
- Telling a lock waiter from a holder before stopping a session: `/proc/locks` lists the holder first and the
  waiters after `->`.

### What warrants a second pair of eyes
- One image, one session: the E3 range is the size of the effect for two apps, not a distribution.

### What should be done in the future
- A study of compile speed on the P4 needs several heap placements per arm (E3's padding), or it measures placement.

### Code review instructions
- `python3 scripts/10-analyze-session.py various/02-session-54dfe3b/session3 various/02-session-54dfe3b/session4`.

### Technical details
- Bench image `b648cf40` (54dfe3b + experiment tree). E1 n=2 per cell (two orders), E2/E2p n=6, E3 n=2 per pad.

## Step 11: Main's optimistic merge, the split heap file, a console fix, and the session on the merged base

The coordinator merged this branch and PICOCALC-COMPILE-CACHE into main (ebfe8fb) while the study ran. Two things
changed under the measurements: compiles now collect cycles (the cache ticket made the allocator report
malloc_size, the same gap Step 3 found), and the merged typed_p4.c was 602 lines. I reviewed the resolution, merged
main, split the file, rebuilt every image on the result, and reran the parts of the in-image session that a
collector can change (strip, production lazy against eager, parking). The first boots on the new base found a bug of
mine: the TYPEDCOMPILE line was printed in pieces, and another task's console reply landed inside it.

### Prompt Context
**User prompt (verbatim):** see Step 1. Coordinator: "to speed things up I merged your branch (and
PICOCALC-COMPILE-CACHE) into main optimistically (ebfe8fb); host gates and make test pass, the playable profile
builds. Your board work continues as planned; land any fix as new commits on your branch after merging main. Two
things in the merge you should know: 1. typed_p4.c conflicted with COMPILE-CACHE's allocator. I kept both:
account(JSMallocState*, ...) now sets malloc_size/malloc_count (the cache ticket found compiles never collected
cycles, the same thing you found); its PSRAM reserve (psram_spare, over_limit/no_psram counters) stays; your arena
parking, heap timing and TYPEDCOMPILE stay; parked arenas are freed after JS_FreeRuntime with `heap->live -=`. Please
review that resolution (git show ebfe8fb -- firmware/port/esp32p4/main/typed_p4.c). Note it changes what your arms
measure: GC now runs during compiles on main, so state which base each study arm uses. 2. The merged typed_p4.c is
602 lines; tools/file-length-exceptions.txt lists it with your ticket as owner. Split the compile heap and
TYPEDCOMPILE into their own file on your branch. Do not leave the board on a non-playable image; restore from the
main checkout."
**Assistant interpretation:** review the resolution, merge main, split the file, measure on the merged base, fix
what the board shows.
**Inferred user intent:** the merged main is what ships; the numbers must describe it.
**Commit (code):** fba4811 (merge main), f1ecb93 — "refactor(p4): the compile heap and the TYPEDCOMPILE record in
their own file"; 91aeb52 — "fix(p4): the TYPEDCOMPILE line goes to the console in one write"

### What I did
- Reviewed ebfe8fb's typed_p4.c: correct. A parked block stays in `live` and so in `malloc_size` (at most 256 KB
  more before the collector's threshold); a reused block skips the cap check because it is already counted; the
  teardown subtracts the parked blocks after JS_FreeRuntime, when no runtime reads `malloc_size` any more; realloc
  of a block that came from the park is an ordinary heap block.
- Stopped session 4 (waiting for the lock) before E2b and E4, which now run on the new base.
- `git merge main` (ebbade8): clean. `scripts/18-split-compile-heap.py`: `typed_compile_heap.{h,c}` (allocator,
  PSRAM reserve, parking, counters, interrupt handler, refusal and TYPEDCOMPILE lines, moved verbatim), typed_p4.c
  602 -> 457 lines, the exception removed, the new files in the component's sources and in the module cache's key
  (`typed_native_files`), the P4 README and the compiler guide updated. 02 and 17 follow the moved code.
- New bench image `a796e3ea` (f1ecb93 + experiment tree); session 5: E1a, E1b, E2b, E4, two blocks per lock.
- Arms on 20a4b23 (f1ecb93 plus scripts), `/tmp/picocalc-device-cost-arm3-*`: control `aaf5f761` (7a503c0's RV32
  bundles, no strip, no parking), group `0bd11a0a`, strip `41fcbca8`, final `8746adbe`. 09 now empties the module
  cache (`typed cache clear`) before each install, so every boot compiles, and reports any cache hit.
- Boot study block 0: two of four health checks failed with `StopIteration()` in `device.painter()`. The UART log
  shows the painter's `{"sources":...}` record and its `#OK painter` inside the chess/painter TYPEDCOMPILE line.
  Fixed in 91aeb52 (one buffer, one `write()`); gate image `1aa25fbf` (91aeb52, clean).
- `make test` (154/154 node tests, exit 0), `make test-host` both policies: unchanged (ray `430f0d501659`, 4,888,369 /
  3,239,635; Chess 6981 words; 25/25).

### Why
- The cache would serve a later block's boot from the first block's compile (same key), which measures a read, not
  a compile.

### What worked
- New base E1 (strip, parking on, two orders), JS_STRIP_DEBUG against none, cold / warm ms and warm peak KB:
  Agenda 3,402 -> 3,266 / 2,779 -> 2,735, 2,397 -> 2,057; Files 2,146 -> 1,972 / 1,505 -> 1,478;
  Editor 4,206 -> 3,985 / 3,450 -> 3,380, 2,966 -> 2,368; Chess 5,192 -> 4,993 / 4,377 -> 4,365, 2,928 -> 2,488;
  Candela 2,568 -> 2,357 / 1,791 -> 1,764, 1,673 -> 1,217. Against JS_STRIP_SOURCE, DEBUG saves 21-111 ms cold,
  0-37 ms warm, 50-120 KB. Same modules and CRCs.
- E2b (production): lazy minus all, Agenda -23 ms, Chess -13 ms (n=4 each).
- E4 (strip 2, warm, three pairs per app), parking on minus off: Agenda -20, Files -1, Editor -21, Chess -23,
  Candela -6 ms; heap calls -33 to -38 percent (Chess 4,252 -> 2,625); peak +10 to +22 KB.

### What didn't work
- The TYPEDCOMPILE line as several printf calls (fixed).

### What I learned
- On ESP-IDF a long line from several printf calls is not one console transfer; another task's reply can split it.
- With the collector on, the compile peaks barely move (Agenda warm 2,454 -> 2,397 KB unstripped): little of a
  compile's garbage is cyclic.

### What was tricky to build
- Making the boot study measure compiles on a firmware with a compiled-module cache.

### What warrants a second pair of eyes
- Parking's gain (about 20 ms, half a percent) is the size of the placement effect of Step 10; it is consistent over
  four of five apps and two bases, which is why it stays.

### What should be done in the future
- N/A

### Code review instructions
- `git show f1ecb93 91aeb52`; `python3 scripts/10-analyze-session.py various/03-session-f1ecb93`.

### Technical details
- Session 5 rows and tables: `various/03-session-f1ecb93/`.
