---
Title: Profiling CJI from the Linux host to the PicoCalc
Ticket: PICOCALC-CJI-PERF
Status: active
Topics:
    - performance
    - esp32-p4
    - native
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/port/esp32p4/compiler/tool.c
      Note: Physical frontend and assembler boundaries
    - Path: repo://picocalc-os/port/esp32p4/main/perf_p4.c
      Note: Hardware cache instrumentation
    - Path: repo://ttmp/2026/11/17/PICOCALC-CJI--cji-workspace-import-and-picocalc-integration-analysis/sources/cji/runtime/aot_main.c
      Note: Host AOT measurement driver
    - Path: repo://ttmp/2026/11/17/PICOCALC-CJI--cji-workspace-import-and-picocalc-integration-analysis/sources/cji/runtime/runtime.c
      Note: Collector metrics and relocation semantics
    - Path: repo://ttmp/2026/11/17/PICOCALC-CJI--cji-workspace-import-and-picocalc-integration-analysis/sources/cji/tools/rv32/emu.c
      Note: Guest instruction profiler
    - Path: repo://ttmp/2026/11/17/PICOCALC-CJI--cji-workspace-import-and-picocalc-integration-analysis/sources/cji/tools/rv32/fw/stage1_main.c
      Note: Guest timing boundary
ExternalSources: []
Summary: An intern guide to measuring CJI work and timing across Linux, RV32 and ESP32-P4.
LastUpdated: 2026-11-18T08:50:38.923586598-05:00
WhatFor: ""
WhenToUse: ""
---

# Profiling CJI from the Linux host to the PicoCalc

## The first experiment

Compile Files and Agenda with the same CJI frontend and an 8 MiB compacting heap. Verify the output. Find where the Linux binary spends its CPU cycles. Check whether the same functions account for substantial work in an RV32 instruction profile. Take one prediction to the physical PicoCalc.

These inputs make a useful pair because their reference outputs exist and their memory behavior is measurable. In the Linux ahead-of-time build verified for this guide, Agenda's peak live heap was only 13% larger than Files', yet Agenda triggered 5.3 times as many collections. Is Agenda slower because it repeatedly traverses live objects? Does a compiler pass also spend substantial time outside the collector? The current measurements allow both explanations. The first useful deliverable is a table that distinguishes them.

| Linux stage-1 observation, fixed 8 MiB | Files | Agenda |
|---|---:|---:|
| Collections | 80 | 424 |
| Peak live bytes at collection | 3,973,240 | 4,491,400 |
| Sum of live bytes over compacting collections | 151,459,216 | 1,434,574,696 |
| SLIR comparison with Node | Equal | Equal |

The port ticket also records a physical Files compile of 329,116 ms with 9,251,666 bytes peak job scratch. That elapsed interval includes loading and assembly. Use it as a whole-job reference. A frontend percentage needs a timer around the frontend itself.

## What actually executes

A *world* is a PicoCalc application or service running under the OS. Its source is JavaScript. CJI translates a supported subset to a textual intermediate representation called SLIR. The assembler, slas, turns that representation into machine code. On this project the final world is a RISC-V ELF module linked against the shared world prelude. The module and the compiler that produced it are two different programs with different inputs.

Stage 0 runs the compiler's JavaScript under Node. It can compile a world as an independent correctness reference. It can also compile the compiler itself into `stage1.slir`. Assembling that file ahead of time gives us a compiled frontend. The same intermediate program can be assembled for Linux x86-64 or for the board's 32-bit RISC-V instruction set. Shared algorithms and distinct machine code make host profiling useful.

```text
Compiler JS -- Node/bootstrap --> stage1.slir
                                    |
                  +-----------------+------------------+
                  |                                    |
             host assembler                       RV32 assembler
                  |                                    |
           Linux stage1-host                 RV32 stage-1 object
                  |                             /            \
                  |                    emulator harness    P4 tool ELF
                  |                             |              |
world.js ---------+-----------------------------+--------------+
       each frontend consumes the same bytes and emits world SLIR
                                                               |
                                              link prelude entry + slas
                                                               |
                                                         RV32 world ELF
```

The P4 worker loads and relocates its private compiler, runs the frontend, links the generated text, assembles the module and hashes its bytes. During a compile-only check it frees the output after verification. Running that application later adds OS dispatch, runtime services and possibly rendering to the measurement. Keep a separate benchmark suite for that workload.

### Pick the instrument for the question

| Execution path | Direct measurement | Use it to answer |
|---|---|---|
| Node stage 0 | Reference SLIR bytes | Did a change alter frontend output? |
| Linux AOT stage 1 | Native samples, process CPU time, host instructions and repeated elapsed time | Which CJI functions or runtime routines deserve investigation? |
| RV32 stage 1 in the emulator | Guest instruction count and guest function ranking | Does the target instruction sequence also spend work there? |
| Physical P4 | Real phase durations, cache traffic and worker memory under the OS | Does the predicted improvement survive PSRAM, caches and scheduling? |

Host hardware counters describe x86. Running Linux perf on the emulator profiles the emulator implementation. For a guest function ranking, use the emulator's own profiler. Its optional synthetic clock assumes one guest instruction per cycle at 400 MHz. The inspected P4 configuration selects 360 MHz; real instructions can take different numbers of cycles. Use the board's clock to measure board time.

## Reproduce the native host baseline

The snippets use Bash from the repository root. Work products go in a new temporary directory; the compiler import owns its normal build prerequisites. You need Node, a C compiler and Make. For the target path you also need Clang with its RISC-V backend and LLVM's ELF linker. Initial bootstrapping can use several gigabytes and take minutes; the Makefile sets the Node heap for that step. Build once before measuring.

```bash
set -eu
ROOT=$PWD
CJI=$(realpath ttmp/2026/11/17/PICOCALC-CJI--*/sources/cji)
OUT=$(mktemp -d)
make -C "$CJI" slas build/rv32/stage1/stage1.slir
IR="$CJI/build/rv32/stage1/stage1.slir"

"$CJI/slas" -S -c "$OUT/stage1.o" "$IR"
cc -O2 -g -fno-omit-frame-pointer -no-pie -I"$CJI/runtime" \
   "$CJI/runtime/aot_main.c" "$CJI/runtime/runtime.c" \
   "$OUT/stage1.o" -lm -o "$OUT/stage1-host"
nm "$OUT/stage1-host" | grep -E ' (cji_main|rt_any_get)$'
```

Here `-S` disables an initial-state snapshot. The object exports `cji_main` and contains ELF function symbols for generated code. The small C entry point initializes the managed heap, calls that function and can print collector statistics. Link with `-no-pie` because the object uses absolute addresses. Debug information and frame pointers apply to the C translation units; generated functions may have symbols without source lines or reliable unwind information.

```bash
for world in files agenda; do
  src="$ROOT/picocalc-os/js/apps/$world.js"
  node "$CJI/cji.js" "$src" --world-unit --emit > "$OUT/$world.ref"
  "$OUT/stage1-host" -C -g -h 8388608 -H 8388608 -- \
    "$src" --world-unit > "$OUT/$world.slir" 2> "$OUT/$world.gc"
  cmp "$OUT/$world.ref" "$OUT/$world.slir"
  sha256sum "$src" "$OUT/$world.slir"
  cat "$OUT/$world.gc"
done
```

`-h` sets initial heap bytes, `-H` sets the cap, `-C` selects mark-compact, and `-g` requests statistics. Arguments after `--` belong to the compiled frontend. SLIR goes to stdout; instrumentation goes to stderr. The expected SLIR SHA-256 values for the tested checkout are below. Regenerate references deliberately after a source or compiler change.

```text
Files   a18f279b25195a896b8fdc3fad85ec1467859abae5427721b03d7776c65d1baa
Agenda  06d73f7e6c872e37ea1c8d524c6fea9f2065296875b2e56c63f2d760c8c61baa
```

### Profile a known-good executable

Use one clean run to warm the host file cache. Then keep the input, output destination, CPU affinity if used, and compiler flags fixed. Run both worlds. Start with flat self samples to find hot symbols. Request call graphs in a second pass if the generated frames unwind correctly.

```bash
src="$ROOT/picocalc-os/js/apps/agenda.js"
args=(-C -h 8388608 -H 8388608 -- "$src" --world-unit)
perf stat -r 7 -e task-clock,cycles,instructions,branches,branch-misses \
  "$OUT/stage1-host" "${args[@]}" > /dev/null
perf record -e cycles:u -o "$OUT/agenda.perf" -- \
  "$OUT/stage1-host" "${args[@]}" > /dev/null
perf report --stdio -i "$OUT/agenda.perf"

# Software instruction attribution when hardware sampling is unavailable
valgrind --tool=callgrind --callgrind-out-file="$OUT/agenda.callgrind" \
  "$OUT/stage1-host" "${args[@]}" > /dev/null
callgrind_annotate "$OUT/agenda.callgrind" | head -80
```

These commands measure the host process, including runtime initialization and output formatting. A timer around `cji_main()` gives a narrower boundary. Callgrind can be slow; start with Files. Its instruction counts are useful for attribution, and timings collected under it include instrumentation overhead. This machine had perf installed and a kernel `perf_event_paranoid` setting of 4 at preparation time. If hardware events are unavailable, retain wall/process CPU measurements and use Callgrind. A missing or multiplexed counter belongs in the run record.

## Bridge the architectures with the RV32 emulator

The project supplies a firmware harness, `fw-stage1.elf`, that links the stage-1 RV32 object, runtime, small C library and host-call stubs. A host call implements services such as file access in the emulator. This harness runs the frontend and prints its output; the separate `fw-board.elf` harness covers more of the compile-and-assemble path. The device tool has its own loader, callbacks, allocator and build flags. Record which harness was used.

```bash
make -C "$CJI" rv32-stage1
B="$CJI/build/rv32"
printf 'let x = 2 + 2;\n' > "$OUT/smoke.js"
node "$CJI/cji.js" "$OUT/smoke.js" --world-unit --emit > "$OUT/smoke.ref"
RV32_PROFILE=1 "$B/rv32emu" "$B/fw-stage1.elf" -- \
  -C -g -h 8388608 -H 8388608 -- "$OUT/smoke.js" --world-unit \
  > "$OUT/smoke.rv32" 2> "$OUT/smoke.profile"
cmp "$OUT/smoke.ref" "$OUT/smoke.rv32"
head "$OUT/smoke.profile"
```

The first separator ends emulator options and module paths. The second ends firmware options. With the fixture above, the checked harness emitted reference-identical SLIR, reported one collection and counted 430,879,970 guest instructions across its measured interval. Even a tiny world exercises shared compilation machinery. That count is a smoke result for this build, not a universal per-statement cost. In this workspace `ld.lld` was available in the Rust toolchain's linker directory. If necessary, add the directory containing the executable to the build shell's PATH before running Make.

Repeat with Files and then Agenda, substituting their paths and comparing to the corresponding host SLIR. `RV32_PROFILE=1` reports the top guest symbols. Value 2 prints all symbols that ran. Check symbol coverage before concluding that a large “main” bucket corresponds to a single source function. Rank by share of total guest instructions. Look for the same *operation* across platforms even when inlining or register-width differences change the symbol names.

## Instrument only the missing measurements

The existing runtime exports `rt_collections`, `rt_live_max`, `rt_copied_bytes` and `rt_spill_bytes`. For compact collections, runtime.c adds `live * 8` to `rt_copied_bytes`, including survivors that stay in place. The slide loop calls `memmove` only when the destination differs. Consequently dividing that existing counter by elapsed time would mislabel survivor accounting as physical memory bandwidth.

Add two measurements first: total time in collection and payload bytes passed to the slide loop's `memmove`. One small accumulator owned by the current frontend invocation suffices. Use a monotonic host clock and the device job's existing microsecond clock callback. Initially time the whole collection; subdivide into mark, rewrite and slide only if that result changes the engineering decision. Accumulate in memory and emit one summary before releasing the frontend heap.

```text
frontend_start = now_us()
reset run-local collector counters
execute compiled frontend on immutable input
frontend_us = now_us() - frontend_start
emit one summary alongside the existing terminal receipt

inside rt_collect:
    t0 = now_us()
    run the selected collector
    gc_us += now_us() - t0

inside compact_collect's existing move branch:
    if source_address differs from destination_address:
        moved_bytes += object_word_count * 8
        perform the existing move
```

Use 64-bit totals. Keep timer callbacks outside inner object loops. Count bytes along the existing move branch without changing layout, tracing rules or collection decisions. Snapshot cumulative runtime globals at the beginning and end if an embedding reuses a runtime. For an error exit, label the row partial; the device tool can unwind through its failure path. Benchmark a build with counters disabled against one with counters enabled on the same input to quantify probe overhead.

### Measurement boundaries and a common record

```text
P4 whole-job clock
| load + relocate | frontend              | link | assemble | hash + cleanup |
                  | allocation + compiler |
                         [GC]   [GC]
                         nested in frontend
```

The existing `cji: progress` messages identify worker phases. The frontend phase includes setup and output handling in the tool wrapper. The reported `allocs` counts calls into the job allocator; many JavaScript objects fit inside a single managed heap allocation. For matched frontend measurements, put both timers directly around `cji_main()`. The RV32 harness's existing instruction count also includes initialization and stdout flushing; bracket the same call with `_hc_steps()` for a narrower comparison. Preserve both the whole-job receipt and the phase measurements.

Use one tabular row per run plus the raw output files. A JSON-lines file and a small reader suffice. The following fields are the proposed contract; units are part of the names.

| Group | Fields and meaning |
|---|---|
| Identity | Suite, world, input SHA-256, compiler revision, target, executable or firmware digest, toolchain/version, run ordinal |
| Configuration | Collector, initial and maximum heap bytes, actual reserved bytes on P4, core/frequency, cache condition, logging mode |
| Boundary | Name of measured interval, elapsed microseconds, process CPU microseconds where available |
| Work | Collection count, live peak, sum of live bytes, bytes moved, GC microseconds; guest instructions or host cycles with explicit provenance |
| Result | Exit status, SLIR digest or RV32 module digest, validation result, path to raw stats/profile |

Represent unavailable fields as null. Zero is a measurement. Host process RSS includes code, libraries and the OS memory model; P4 scratch peak counts the private job allocation list; frontend live bytes count surviving managed objects. Keep these as separate columns. For each valid run compute GC fraction as GC microseconds divided by frontend microseconds. Whole-frontend time already includes the GC interval.

## Validate on the physical board

Use the existing port ticket's serial checker from the repository root when the board is available for the experiment. It selects bundled sources, bypasses the install cache, checks the input hash, and separates JSON output from serial progress. Compare the returned module hash with the independent host RV32 module for that same source, compiler and shared export list. A host x86 executable and a P4 ELF have different target encodings.

```bash
CHECK=$(echo ttmp/2026/11/17/PICOCALC-CJI-PORT--*/scripts/07-check-bundled-catalog.py)
python3 "$CHECK" --timeout 7200 files > "$OUT/files.board.jsonl" \
  2> "$OUT/files.board.log"
python3 "$CHECK" --timeout 7200 agenda > "$OUT/agenda.board.jsonl" \
  2> "$OUT/agenda.board.log"
```

In the P4 tool, `compiler_entry` runs the frontend, inserts the shared prelude call and invokes `slas_main` for an RV32 module. The host reference uses the shared unit export list and `slas-rv32 --module --extern`. For board builds that publish progress, retain the first sample for each phase and the terminal receipt. A heartbeat with an unchanged allocation count can occur during a long pass. Neither the sample count nor the last heartbeat establishes completion. An interrupted serial run has a missing result until a full matching receipt is obtained.

For target hardware attribution, reuse the P4 cache-counter implementation in `perf_p4.c`. Its console `cachestat start/show` measures a broad window. For the experiment, snapshot per-core counters immediately around the selected phase and print afterwards. Stage 1 runs on the worker's core 0; world dispatch runs on the kernel's core 1. Record background load because other tasks on that core also affect the counters. Report misses per operation or per unit of work alongside miss percentage. Short cycle-counter deltas can be useful; on this configuration a 32-bit counter at 360 MHz wraps in about 11.9 seconds. Use a monotonic microsecond timer for minute-scale phases.

## Run the experiment and interpret disagreement

Start with a single changed variable. Keep the source, shared prelude, stage-1 revision, spill mode and collector fixed. Compare an 8 MiB heap with a 10 MiB heap for Agenda. The normal board policy depends on reservation success and source size. A controlled board A/B requires an explicit experimental setting or two identified firmware builds and verification of the actual reservation in each receipt.

1. Run the reference and hash it. Run the host configurations in alternating order after warm-up. Retain seven independent process measurements per configuration. Report median and range and keep slow samples.
2. Run the emulator on at least the baseline and the candidate. Compare guest instructions, collection counts and the SLIR digest. Keep a sampling profile separate from the timing run.
3. Before using the board, write a prediction, for example “10 MiB will reduce Agenda collection count and GC time enough to reduce frontend time.” State the memory cost and the evidence that would falsify the prediction.
4. Run the two board configurations under comparable operating conditions, alternating if practical. Repeat enough times to expose run-to-run variation and report the actual sample count. Compare successful runs and retain allocation refusals separately. Free PSRAM, the largest free block and loaded worlds can affect whether a reservation succeeds.
5. Accept a performance change only after identity checks pass. Report relative change within each platform. Check whether the gain justifies the extra memory needed on a shared device.

| If you observe | Next discriminating measurement |
|---|---|
| Fewer collections and fewer guest instructions, but flat P4 time | Inspect data-cache misses and time outside GC. A larger working set can offset saved work. |
| Faster native host with stable guest counts | Inspect native symbol samples and generated code. The gain may depend on x86 instructions or host library calls. |
| More GC on one platform with identical source | Check actual heap and collector mode, initialization, runtime revision, instrumentation boundaries and output equality. |
| Equivalent frontend times but slower whole P4 job | Examine relocation, prelude linking, assembly and overlapping buffers. |
| Different output digests | Inspect the first intermediate artifact that differs. Suspend the speed comparison until the outputs agree. |

## A second suite for the generated applications

Once the compiler experiment is reproducible, reuse the same record format with `suite=world-dispatch`. A world benchmark preloads the module and the QuickJS version of the same program. A harness sends deterministic messages with a fixed seed and verifies application state after the batch. A lightweight native C loop can provide a reference for arithmetic. Keep UI rendering, storage, Wi-Fi and serial printing outside the timed region unless one is the stated subject of the benchmark.

Start with integer mixing, then array traversal across several working-set sizes, then a deterministic Agenda edit sequence. Warm each engine once. Alternate execution order for 20–30 short batches. Record elapsed time per operation and the final checksum. For a host-native world harness, supply the same kernel API results and message order on each run; the RV32 shared-unit harness can exercise target modules against a fake kernel. On the handheld, bracket engine dispatch. The existing kernel accounts separately for engine and rendering intervals, while a world's total `cpu_ms` includes elapsed turn time. A changed checksum, different event count or budget overrun invalidates a pair.

## Source map and handoff

Paths starting with `runtime/`, `tools/` and `build/` below are relative to the CJI import selected by `CJI` in the setup. P4 compiler paths are relative to `picocalc-os/port/esp32p4/`.

| Read here | Interface or responsibility |
|---|---|
| CJI `Makefile`, `cji.js` | Build dependencies, stage-1 bootstrap, stage-0 world-unit reference |
| CJI `runtime/aot_main.c`, `runtime/slas.c` | Native executable entry point, heap arguments, object writer and ELF symbols |
| CJI `runtime/runtime.h`, `runtime/runtime.c` | Counter declarations, `rt_initialize`, `rt_collect`, survivor accounting and actual move branch |
| CJI `tools/rv32/fw/stage1_main.c`, `tools/rv32/emu.c` | RV32 CLI, guest step count, host calls, symbol attribution |
| CJI `tools/rv32/fw/board_main.c`, `tools/link-units.mjs` | Full emulated board harness and host prelude linkage |
| P4 `compiler/compiler_job.h`, `compiler/tool.c` | Clock and allocation callbacks, compiler phases, frontend entry and assembly |
| P4 `compiler/install.c`, `main/perf_p4.c` | Worker lifetime, digest receipt, progress, per-core cache registers |
| `picocalc-os/nucleus/kernel.c` | World dispatch, render boundary and cumulative world time |
| Port ticket `various/device-catalog-results.json` | Historical world attempts, firmware identities and reference ELF digests |

The first implementation milestone is a native host report for Files and Agenda, one RV32 profile with named hotspots, and one falsifiable hardware prediction. The second adds matched GC boundaries and the physical A/B result. Keep benchmark artifacts in a per-run directory and promote only a small reproducible summary and validated receipts to the ticket. The design needs no dashboard or resident profiling service.

## Running the implemented probes

The [script index](../scripts/README.md) gives the entry points for the Linux and guest runs. Every run begins by generating stage-0 SLIR for the same source file. Stage 1 must emit that exact byte sequence. On the board, verification goes one step further and compares the final linked module to the independent host RV32 assembler output.

A regular P4 build exposes phase progress through the serial console and the kernel log. For an existing job, send `cji status`. A heartbeat reports the source digest prefix, current phase, elapsed milliseconds, allocation-call count and current scratch bytes. Allocation count can increase while scratch stays flat as temporary buffers are released and reused. Neither value measures lines compiled or predicts a completion percentage. Use the terminal receipt with the full source and module digests to identify the result.

```text
stage 0 JS ──► expected world SLIR
                     ▲ compare bytes
Linux AOT / RV32 ────┘

P4 serial command ─► worker ─► relocate ─► frontend ─► link ─► assemble ─► hash
                                              │                             │
                                    elapsed and GC counters         compare host ELF
```

A benchmark firmware built with `PICOCALC_COMPILER_PROFILE=ON` also accepts `cji profile 8 apps/agenda.js` and `cji profile 10 apps/agenda.js`. Both benchmark cases reserve one contiguous frontend heap before relocation. The loader uses that block to decompress its private compiler image, then the frontend reuses it. The ordinary Files and Agenda check path first tries its 8 MiB reservation after relocation. The observer records the reservation actually obtained. The frontend timer brackets the stage-1 call. A nested accumulator times completed collections. The worker prints the metrics after the call returns. A failed frontend can still report partial counters. Require a complete sample and a matching module before comparing durations.

| Field | How to interpret it |
|---|---|
| `frontend_us` | Elapsed time around stage 1. The P4 worker can be preempted during this interval. |
| `gc_us` | Elapsed time inside completed collections during the measured frontend interval. Divide by frontend time for a GC fraction. |
| `collections`, `live_peak_bytes` | Collection count and maximum live heap observed at collection points. |
| `survivor_bytes` | Cumulative live bytes encountered by collections. The same surviving object can contribute repeatedly. |
| `slide_bytes` | Bytes passed to the compact collector's actual moving operation. Objects already at their destination contribute zero. |
| `elapsed_ms`, `scratch_peak` | Entire device job and peak job-accounted allocation. These include buffers used outside the frontend interval. |

The initial Linux Files profile counted 20,174,143,435 x86 instructions with Callgrind. Its three largest named functions were `whole_bits` (8.15%), `rt_any_index` (5.88%) and `rt_any_eq` (5.33%). They implement number classification, dynamic indexing and equality in CJI’s runtime. The cost is spread across many operations. This result alone gives no estimate of cycles spent in those functions on the P4.

### Linux timing baseline

On the Core i7-1165G7 host, each of the six configurations ran once to warm up and seven more times for measurement. The runner pinned itself to logical CPU 2 and reversed configuration order on successive rounds. Other profiling jobs ran concurrently. Each of the 48 outputs matched its stage-0 reference. Times below are medians in seconds. Ranges and binary identities are in the [machine-readable baseline](../various/compiler-baseline.json).

| World and heap | Plain process | Instrumented process | Instrumented frontend | Inside GC | Collections | Bytes actually slid |
|---|---:|---:|---:|---:|---:|---:|
| Files, 8 MiB | 2.778 | 3.516 | 3.514 | 0.160 | 80 | 47,127,400 |
| Agenda, 8 MiB | 19.087 | 25.558 | 25.556 | 1.858 | 424 | 211,914,816 |
| Agenda, 10 MiB | 19.932 | 23.481 | 23.479 | 1.254 | 297 | 172,771,688 |

The larger Agenda heap reduces collection count by 30% and bytes slid by 18%. In the instrumented binary the median frontend time fell 8.1%. In the plain binary the median process time rose 4.4%. The measured process took 18–34% longer than its plain counterpart across these configurations, with wide overlapping run ranges and concurrent host load. Treat these as baseline observations. They establish an effect on collector work but do not justify raising the production heap. A timing-based change needs the physical measurement.

### Generated-world measurements on Linux and RV32

A small service provides three work handlers and a separate state query. Each test first warms the service, sends 24 measured messages and verifies every reply to the state query against an independent calculation. Host measurements use the project's QuickJS objects and JS prelude alongside the x86-64 compiled CJI world, alternating which engine goes first. The host clock brackets the QuickJS dispatch call or the compiled world's event entry. Querying state, checking the reply and printing results happen afterward. RV32 loads the shared-unit ELF into the emulated test firmware, then counts guest instructions for the same message. See the [dispatch sources](../scripts/dispatch) and [distribution and artifact hashes](../various/world-dispatch-baseline.json).

| Payload per message | QuickJS host median (µs) | CJI host median (µs) | CJI guest instructions (median) | Expected checksum |
|---|---:|---:|---:|---:|
| 1,024 xorshift iterations, seed 17 | 44.38 | 10.14 | 174,937 | 2,114,935,371 |
| Initialize 16 elements and traverse eight times | 7.90 | 2.19 | 67,955 | 15,552 |
| Initialize 128 elements and traverse eight times | 43.61 | 9.17 | 434,324 | 128,512 |
| Initialize 512 elements and traverse eight times | 157.57 | 30.23 | 1,689,162 | 522,240 |
| Toggle 24 Agenda task lines and checksum their text | 22.60 | 48.40 | 1,550,080 | 1,418,922,918 |

The CJI host world wins the arithmetic and array cases. QuickJS wins the Agenda string-and-regexp case on this host. The edit fixture uses the shipped task-line expression and toggle function. It excludes filesystem I/O, drawing, reminders and the rest of the Agenda application. Guest instruction totals quantify the RV32 work and cannot tell us which engine responds faster on the physical screen.
