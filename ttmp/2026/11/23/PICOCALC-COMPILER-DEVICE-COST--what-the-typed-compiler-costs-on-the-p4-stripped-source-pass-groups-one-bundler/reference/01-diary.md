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
