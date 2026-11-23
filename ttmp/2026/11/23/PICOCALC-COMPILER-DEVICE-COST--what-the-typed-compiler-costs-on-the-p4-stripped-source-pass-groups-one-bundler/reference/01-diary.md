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
