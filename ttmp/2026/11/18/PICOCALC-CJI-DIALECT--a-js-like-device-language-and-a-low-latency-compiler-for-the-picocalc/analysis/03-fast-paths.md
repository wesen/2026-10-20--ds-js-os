---
Title: Fast paths from source to a PicoCalc world
Ticket: PICOCALC-CJI-DIALECT
Status: active
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/nucleus/native_wasm.c
      Note: Validated WebAssembly backend and event ABI
    - Path: repo://picocalc-os/nucleus/vm.c
      Note: World setup and QuickJS CPU accounting
    - Path: repo://picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c
      Note: P4 machine module loading and event budgets
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-DIALECT--a-js-like-device-language-and-a-low-latency-compiler-for-the-picocalc/scripts/fastpath/03-run-quickjs.py
      Note: Reproduces timing and replay for the complete manifest
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-DIALECT--a-js-like-device-language-and-a-low-latency-compiler-for-the-picocalc/scripts/fastpath/04-typed-wasm.js
      Note: Direct explicit-type WebAssembly emitter
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-DIALECT--a-js-like-device-language-and-a-low-latency-compiler-for-the-picocalc/various/fastpath/quickjs-host.json
      Note: Host timing and differential receipts
    - Path: repo://ttmp/2026/11/18/PICOCALC-CJI-DIALECT--a-js-like-device-language-and-a-low-latency-compiler-for-the-picocalc/various/fastpath/typed-wasm.json
      Note: Typed compositor output and semantics checks
ExternalSources:
    - https://bellard.org/quickjs/quickjs.html
    - https://www.lua.org/source/5.4/lcode.c.html
    - https://v8.dev/blog/sparkplug
    - https://webassembly.github.io/spec/core/appendix/algorithm.html
    - https://www.assemblyscript.org/concepts.html
Summary: Measurements of the existing QuickJS compile path and a comparison of interpreter and baseline native backends for a PicoCalc dialect.
LastUpdated: 2026-11-18T16:31:00-05:00
WhatFor: Choose a low-latency implementation that preserves the world boundary.
WhenToUse: Read when implementing or measuring an alternative to the CJI optimizer.
---

# Fast paths from source to a PicoCalc world

The fastest candidate for editing today's apps already ships. The ESP32-P4's QuickJS engine compiles the prelude and app to bytecode as part of `JS_Eval`. It can run that bytecode directly in the world's runtime, or serialize it for a later start with the same VM. Native code generation is a separate requirement. If the new language needs explicit fast numeric operations or a cheap, precise sandbox contract, implement a small dialect checker and target validated bytecode before adding a second native backend. Keep the QuickJS source path for existing worlds and existing JavaScript semantics.

## Where the time goes

At boot, the kernel reads the JSON manifest and keeps each world's source bytes or binary. The JS engine gives each world a separate runtime, context and heap limit. The engine installs `__k` and `__ka`, evaluates the prelude and world in that context, calls `__init`, reads metadata and retains dispatch and render functions. Receipts from a world can be settled later, so job queues, epoch/cancellation and restart behavior are part of the execution boundary. Altering the format inside the JS binding can preserve those contracts. [Kernel boot](../../../../../../picocalc-os/nucleus/kernel.c#L853) · [QuickJS boot and event binding](../../../../../../picocalc-os/nucleus/vm.c#L942).

A physical CJI build separately loads the compiler, compiles an app to SLIR, links it with shared-prelude references, assembles a RISC-V ELF and returns the ELF to the kernel's installation path. On the combined TRIE candidate, the Agenda and Files module jobs took 522.587 s and 206.321 s on the ESP32-P4. The frontend alone took 521.380 s and 205.457 s. Both jobs used an 8 MiB frontend arena. The gap between frontend and module timers bounds what replacing only the assembler could recover within those measurements. Neither timer measures how long Agenda's timer handler or Files' screen renders take after installation. [CJI tool entry](../../../../../../picocalc-os/port/esp32p4/compiler/tool.c) · [Physical timing and module qualification](../../PICOCALC-CJI-TRIE--avoid-redundant-range-state-writes-and-specialize-trie-node-copies/design-doc/01-persistent-range-states-and-statically-typed-array-copies.md).

QuickJS implements a parser that emits stack bytecode directly, with bytecode-local processing such as maximum stack computation and local/closure resolution. It spends no time inferring object layout or numerically proving across a whole program. The concrete fork is between evaluating the resulting function now and serializing it for later. `qjsc` similarly embeds serialized bytecode in C output that initializes or links the engine. Compiling that generated C produces a native launcher containing an interpreter and program data. [QuickJS bytecode and qjsc internals](https://bellard.org/quickjs/quickjs.html#Bytecode).

```text
Direct start                 JS_Eval(src) --> same QuickJS VM --> __init and world events
One-use checked start        JS_Eval(src, COMPILE_ONLY) --> JS_EvalFunction --> same VM
Trusted reusable artifact    COMPILE_ONLY --> JS_WriteObject --> bytes
                             app context --> JS_ReadObject --> JS_EvalFunction --> same VM
Dialect candidate            parse + local checks --> validated Wasm --> WAMR + world adapter
Optimized native             CJI frontend --> SLIR + prelude --> RV32 ELF --> native world ABI
```

## Host measurements on the existing catalog

The harness rebuilt the exact vendored QuickJS revision with the normal PicoCalc host flags (`-O2 -fwrapv -fno-strict-aliasing`). It measured `JS_Eval` with `JS_EVAL_TYPE_GLOBAL | JS_EVAL_FLAG_COMPILE_ONLY`, `JS_WriteObject` with `JS_WRITE_OBJ_BYTECODE` and `JS_ReadObject` with `JS_READ_OBJ_BYTECODE`. It copied the serialized bytes, freed the compiler and its context, and loaded in a new runtime. Every source returned the same bytes in one warm-up and 21 measured repetitions, and each result was accepted as a global function. These are fresh isolated contexts with the default intrinsics, no world globals and no top-level execution. Timers exclude creating/freeing contexts, copying bytes outside QuickJS, reading source from disk and evaluating bytecode. The phase peaks include the QuickJS context's baseline and the allocator's rounded usable allocation sizes plus eight bytes per allocation. [Probe and runner](../scripts/fastpath/) · [Host timing receipt](../various/fastpath/quickjs-host.json).

| Input | Source bytes | Bytecode bytes | Compile (µs) | Write (µs) | Read (µs) | Compile peak (KiB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Flaky | 349 | 590 | 15.05 | 2.20 | 1.53 | 164 |
| Files | 5,873 | 11,420 | 273.06 | 16.64 | 20.89 | 206 |
| Agenda | 16,326 | 31,951 | 769.15 | 37.27 | 50.22 | 273 |
| Compositor | 24,009 | 51,874 | 1,122.79 | 55.09 | 70.71 | 311 |
| Agent | 34,596 | 65,661 | 1,256.54 | 62.28 | 84.89 | 338 |
| Calc | 95,967 | 177,238 | 3,932.20 | 211.28 | 270.13 | 734 |
| Prelude | 15,646 | 44,544 | 958.99 | 44.17 | 59.20 | 318 |

Medians come from the observed host run on x86-64 with GCC 13.3 and the normal 64-bit host representation. The smallest and largest sources saw 15 µs and 3.93 ms of compile time. The 23 independently measured compile medians sum to 16.19 ms. This is an accounting sum, not measured total startup time. The compile and load contexts include about 150 KiB of tracked SDK/runtime allocations at baseline. The board has different pointer width, heap allocation, PSRAM and clock, and runs CJI with a different algorithm and artifact. The host samples show the classes of work the fast path performs and provide no cross-device speedup ratio.

The uncompressed debug-preserving output totals 540,509 bytes for 278,453 bytes of source. A second set of sizing-only trials used `JS_SetStripInfo`: stripping just source text yielded 285,046 bytes, and stripping all debug data yielded 219,676 bytes. Full debug is the tested replay behavior. Stripping source text can change user-observable source introspection such as `Function.prototype.toString`, and stripping all debug also loses source-aware fault reporting. Choose stripping policy before comparing sizes, and account for any retained source and firmware-flash budget separately.

All 22 worlds and the prelude were tested through the host nucleus, using the same build objects for the baseline and bytecode experiments. The experimental binary uses a linker wrapper around `JS_Eval` at the two boot calls. It accepts a compiled-in filename and exact source byte match, loads its compiled-in bytecode copy, checks the global-script tag, then evaluates it. It logs every substitution; every workflow must observe all 23 catalog entries. Existing simulation fixtures exercise the keyboard/display path, calculator expressions and plots, Agenda reminders, file creation and editor saves, Snake, logs, settings, sandbox `eval` and intentional faults. The baseline and bytecode tests receive the same filesystem seed, wall clock, timezone and virtual inputs. The ordinary REPL still evaluates typed source at runtime inside the JS engine.

The harness compares screenshots, changed filesystem and storage bytes, and the console/UART transcript. Console capture paths and measured world-heap fields are normalized. For the intentional sandbox allocation exhaustion, separately record its virtual timestamp and virtual CPU time, with a 0.02 ms comparison tolerance. These CPU values use measured JS interrupt-counter steps multiplied by the virtual profile cost, plus modeled syscall and other kernel charges. Physical mode uses elapsed time from `port_clock`. Host replay gives a regression oracle for behavior, heap use and virtual scheduling. Actual device execution time and responsiveness require physical runs with event and input latency instrumentation. [Virtual and real budget binding](../../../../../../picocalc-os/nucleus/vm.c#L50) · [Kernel segment accounting](../../../../../../picocalc-os/nucleus/kernel.c#L727).

Ten workflows passed. The harness checked 59 PNG captures. Fifty-eight matched byte for byte, and About's screenshot changed only the pixels showing the aggregate heap count (34 × 16 pixels in the 640 × 640 capture). At the boot stats snapshot, Calc used 545.8 simulated KB with source versus 509.2 KB with bytecode. Agenda used 280.8 versus 263.9 KB. Both variants hit the same sandbox out-of-memory path in the Faults fixture. The virtual timestamp differed by 0.001 ms and sandbox cumulative virtual CPU by 0.01 ms. App-visible files and persistent store bytes matched in every fixture. [Paired replay digests and measurements](../various/fastpath/quickjs-host.json).

The source-only load and serialized load reach the same interpreter. Retaining bytecode can save compilation before a repeated start, and permits syntax verification before touching the running world. It provides no new arithmetic representation or release-code tier. If the edited source is used immediately once, compare a direct start against compile-only plus `JS_EvalFunction` in the prospective runtime, avoiding serialization and re-reading unless needed. A portable artifact is a distinct goal from a cold-start optimization. Boxed JavaScript operators, GC, the prelude, JSON, kernel work and peripheral time still affect interactive app workloads.

## Choosing a baseline for the dialect

| Route | Device compile work | Runtime implications | Candidate role |
| --- | --- | --- | --- |
| QuickJS source or private bytecode | Parse once per world start, or do one parse/write and a read per later start. Existing VM and JS API. | Full JS behavior, existing capacities and per-turn limits. Cached QuickJS bytecode needs a trusted producer and exact engine identity. | Keep the current catalog/editor fast. Use source or the private trusted artifact according to measured restart needs. |
| Dialect transpiled to ordinary JS | A small syntax/type pass and explicit operator/helper lowering before QuickJS parsing. Reuse embedded runtime and world binding. | Helpers can cost more per primitive operation. Ordinary JS typed-array indexing, F64 coercions and exceptions remain in the resulting VM unless behavior is explicitly lowered. | Prototype dialect behavior and diagnostics with unchanged world programs as regression counterparts. Evaluate direct syntactic lowering before committing to a second runtime. |
| Dialect emitting structured, typed Wasm | Parse, resolve lexical names, check local types/exports, emit structured blocks and a binary module. The existing WAMR loader validates/rewrites. | I32 can be unboxed, event ABI and string/container runtime require work. Interpreter dispatch, WAMR I/O and F64 costs still matter. Already supports per-world linear-memory and metering boundaries. | First portable backend worth comparing for typed modules that benefit from arithmetic and explicit memory. Start with a typed leaf world and maintain an application API that can grow. |
| Custom compact dialect bytecode | Bounded table lookups and per-function emission, plus a verifier of stack/branch/local/helper types. | Need to build interpreter, value representation, GC or deterministic ownership, host capability bridge and debugging. Enables operations tailored to the device and smaller encoding if Wasm costs dominate. | Defer until measurements show what WAMR cannot provide. |
| Direct baseline RV32 | Emit a few instruction templates per checked op, patch local branches and calls, write relocation metadata and publish executable memory. Avoid wide data-flow proof and text assembly. | Removes the interpreter dispatch overhead for emitted operations. Frame spills, boxed helpers, imports and software double can dominate. Current P4 ELF path runs trusted code on the kernel task, and budgets are checked at return. | Trusted ROM/system bundles or hot leaf kernels after semantics and budgets work in a safe backend. |
| Host typed AOT | Host compiles typed code to Wasm or RV32 through AssemblyScript, C/LLVM or the existing native tools. Device only validates/instantiates or loads. | Backend can optimize local arithmetic and layout, with a new language, target ABI and runtime. WAMR AOT is disabled in our build. | Build production code and reference fixtures off-device. This route leaves edit/compile on the device to a separate small compiler. |

Lua's parser hands expression descriptors to its register-bytecode code generator and backpatches jumps, a working example of compiling scoped functions without a whole-program graph. Lua's language/library and binary chunks would require their own embedding and app port. MicroQuickJS supplies a second reference point already in the repository on PaperS3. Its largely ES5 subset, different GC, UTF-8 string model, target-specific bytecode and separate nucleus binding make it a memory tradeoff to measure with comparable ports. Neither lowers a typed PicoCalc numeric contract automatically. [Lua parser](https://www.lua.org/source/5.4/lparser.c.html) · [Lua code generation](https://www.lua.org/source/5.4/lcode.c.html) · [MicroQuickJS language and bytecode](https://github.com/bellard/mquickjs) · [PaperS3 engine binding](../../../../../../picocalc-os/nucleus/vm_mqjs.c).

The V8 Sparkplug design shows how an already checked bytecode stream can drive fixed machine-code emission templates over a frame matching the interpreter. PicoCalc can use that structure if a typed VM backend gives a stable instruction set. V8's results do not predict RV32 gains. Keep source spans and trap maps while avoiding text SLIR and general register allocation in the latency-critical path. Match the collector and use explicit runtime helpers for checked array access, allocation, boxing and syscalls. Emit poll points at back edges, recursive entry and budget-sensitive calls. Validate code only for a deliberately small backend and remember the P4 executable-memory boundary permits system-level effects when it runs raw RISC-V. [V8 Sparkplug architecture](https://v8.dev/blog/sparkplug) · [P4 ELF loader](../../../../../../picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c#L175).

AssemblyScript demonstrates language-level types tied to Wasm's I32/F32/F64 types. The default compiler and GC/runtime make it a reasonable host comparison, while PicoCalc needs its own event and capability bindings. AssemblyScript docs describe compatibility limitations with TypeScript and feature flags for runtime and GC. Compile a compatibility sample to ordinary Wasm with the supported instruction subset, verify its actual imports/exports, and run through the PicoCalc bridge before judging the route on calculator or compositor performance. [AssemblyScript language concepts](https://www.assemblyscript.org/concepts.html) · [Compiler options and runtime](https://www.assemblyscript.org/compiler.html).

## A direct typed emitter tested on compositor code

The prototype implements explicit `i32` and `bool` function signatures and typed constants, precedence and grouping, early `if (...) return`, short-circuit logical operators and signed arithmetic. It uses tokens and per-function output buffers. The precedence parser emits operands as it recognizes them and returns the operand/result type to the parent expression. `&&` and `||` emit a structured Wasm `if` with only the needed branch evaluated. `Math.min` and `Math.max` are fixed builtins over two I32 arguments, each evaluated once into a temporary local. The emitted functions use Wasm locals and basic numeric instructions. There is no AST, control-flow graph, numerical proof pass, text assembly, host import, or embedded compiler/GC in this module. Exported `bool` is represented as an I32 word. The host adapter checks that incoming bools are actually bools and integers fit signed I32 before invoking the raw Wasm function. [Direct emitter](../scripts/fastpath/04-typed-wasm.js) · [Typed compositor function](../scripts/fastpath/scroll.typed).

The real `scrollStart` body takes a selection index, count and row visibility, and clamps the first displayed item. The test removes signature annotations and verifies that the result is byte-identical to the source function extracted from `compositor.js`. The typed compiler produced an import-free, 118-byte Wasm module. The Node/V8 WebAssembly engine validated it and matched the unmodified JS function on **667,780 inputs**. That includes `count` 0–140, `visible` 1–64 and `sel` −1 through `count+2`, plus four I32 boundary cases. The lower bound of one visible row follows both compositor callers. The finite test grid exercises both early exits, both clamp edges and interior scroll positions. The result covers this leaf's tested domain and says nothing about draw paths, files, GC or world startup budgets. [Compositor callers](../../../../../../picocalc-os/js/system/compositor.js#L237) · [Runnable differential](../scripts/fastpath/05-check-typed-wasm.mjs) · [Results and exact Wasm bytes](../various/fastpath/typed-wasm.json).

| Operation | JavaScript | Prototype |
| --- | --- | --- |
| `2147483647 + 1` | 2147483648 | −2147483648 |
| `2147483647 * 2` | 4294967294 | −2 |
| `-7 / 2` | −3.5 | −3 |
| `7 / 0` | Infinity | Trap |
| `-2147483648 / -1` | 2147483648 | Trap |
| `scrollStart(3, 10, -2147483648)` | 1073741827 | 0 after wrap |
| `scrollStart("5", 10, 3)` | 4 | Boundary rejects numeric string |
| Conditions combining I32 and bool | JavaScript truthiness/coercion | Static type error |

Tests also checked that `false &&` and `true ||` do not evaluate the division-by-zero branch, and that the compiler type-checks both arms. The contradictory scroll input has signed I32 arguments but is outside both real UI callers' visibility contract, so a migration still needs explicit domain checks where user or wire data becomes typed. A production dialect has to decide whether unchecked wrap is appropriate, whether division should trap in a world or return a typed error, and how to carry source locations across engine boundaries. This experiment uses raw Wasm arithmetic with an import-free harness. An actual Wasm world requires a runtime adapter, world ABI exports, its own memory/call conventions and event tests. The experiment uses Node only for host execution and verification. The compiler itself is a dependency-free global script also suited to QuickJS.

## An implementation boundary the kernel can enforce

Start with a function grammar that makes local typing bounded. Use explicit signatures for functions, import calls and return values. Resolve identifiers using a scope stack and assign each local a declared type and slot. Parse expression precedence, check each operator when its operands are known, and require typed branch results at the control merge. Reject unsupported forms with source spans. Emit immediates, local loads/stores, branches and checked calls into per-function buffers. Collect literal bytes and function metadata in bounded sections, and patch lengths and resolved destinations after a function. A small signature/declaration pass permits forward calls and mutual recursion with no numeric propagation across call graphs. Keep source, token/nesting, local/frame, artifact and code-size limits separate.

```text
check_and_emit(source, interface):
    signatures = collect_declarations(source, interface)
    for each function in source:
        frame = bind_declared_locals(function, signatures)
        code = emit_checked_operations(function, frame)
        attach_source_spans_and_budget_limits(code)
    return linked_sections(signatures, code, literal_data)

install(candidate, world):
    parse_bounded_header_and_sections(candidate)
    validate_imports_and_function_bodies(candidate, versioned_world_api)
    boot_in_candidate_world(candidate, world.capabilities)
    commit_artifact_after_successful_boot()
```

For a custom VM, check all section lengths, entry tags, function/table/local indexes, stack types and maximum height, memory limits and import signatures before running. With unstructured jumps, verify targets are instruction boundaries and every merge has a consistent stack shape. With structured blocks, validate each instruction using a value and control stack as Wasm does. In both cases separately enforce memory and execution budgets at runtime, including operations that can do work inside a helper. WAMR's existing PicoCalc backend limits linear memory, whitelists linked imports, checks user memory for host calls and meters Wasm instructions. Audit its format, adapter and runtime allocation accounting with the actual app sizes alongside those constraints. [WebAssembly validation algorithm](https://webassembly.github.io/spec/core/appendix/algorithm.html) · [PicoCalc WAMR binding and import table](../../../../../../picocalc-os/nucleus/native_wasm.c).

The JS world contract and native world contract use different calling conventions. QuickJS calls the installed prelude's `__init`, `__dispatch` and `__render`; a Wasm build provides `nw_wasm_init`, `nw_wasm_buffer` and `nw_wasm_event` and talks through `nw.call`/`nw.error`. Handle lifetimes and pending asks already belong to the kernel. Provide a typed bridge to existing public operations and retain request/reply, JSON data, render publication and settle semantics across it. Machine-code worlds on the P4 use an ELF32 little-endian RISC-V `ilp32f` PIC module, and `app_main` fills the `NW_ELF_ABI` table of callbacks. The ELF loader's table, size and symbol checks do not sandbox its machine instructions or prevent a non-polling infinite loop on the kernel task. FAT-spawned legacy text and validated wasm are supported through the existing `sys.spawn` path. [World API](../../../../../../picocalc-os/sdk/nw.h) · [ELF ABI](../../../../../../picocalc-os/sdk/nw_elf.h) · [Storage spawn](../../../../../../picocalc-os/nucleus/kernel.c#L566).

The cost of emulating broad JS behavior moves into the runtime when the optimizer is removed. Keep `f64` where calendar timestamps, calculator functions and JSON boundaries need its behavior. Use typed I32 for bounded indexes and counters where the chosen dialect defines wrapping, checked overflow or explicit conversions. A backend must implement truncation and exceptional cases prescribed by the dialect. The P4 build targets the single-precision RISC-V F extension and `ilp32f`, so native double arithmetic can still lower to helpers. Measure arithmetic and app turns separately. Replacing a computation loop can save many dispatches without moving JSON/model allocation, string layout or bus I/O, so require whole-world tests for Agenda reminders, Files/Editor I/O, Calc plotting and compositor painting. [P4 compiler flags](../../../../../../picocalc-os/port/esp32p4/main/CMakeLists.txt#L61) · [Device timing model](../../../../../../picocalc-os/nucleus/kernel.c#L39).

## Boot, ownership and versioning

Keep each QuickJS `JSValue` within its creating runtime and manage it using QuickJS's ownership rules. `JS_EvalFunction` consumes the bytecode value. `JS_WriteObject`'s buffer belongs to its allocator; copy it to tracked storage before freeing that runtime. The default `JS_ReadObject` load used here copies/relocates bytecode, allowing the serialized buffer to be released once load returns. If experimenting with `JS_READ_OBJ_ROM_DATA`, the reader can borrow opcode data, so keep the buffer alive until all resulting functions are gone. The reader falls back to copying where atom numbers need relocation. A prelude artifact saves parsing; evaluation still creates per-world live state. An executable, immutable artifact can be used by multiple worlds while each keeps its own capability state. [QuickJS C API](../../../../../../picocalc-os/third_party/quickjs/quickjs.h#L1018) · [Reader, atoms and ownership](../../../../../../picocalc-os/third_party/quickjs/quickjs.c#L40256).

Only load QuickJS binary objects from the firmware's trusted build pipeline or a trusted compiler result tied to its source, engine build and compiler options. QuickJS documents no security validation before execution, and the internal `BC_VERSION` check only identifies a serialization format. The desktop and P4 differ in pointer width, host allocator and build configuration, so validate exact same-engine cross builds before assuming artifact portability. A private cache record can include the full runtime/build identity, relevant ABI/prelude and options, source digest, artifact digest and size. Use the source snapshot when a cache misses or is damaged, and publish only after a candidate boots. Store a record outside the writable app directory and keep source of record. An ordinary checksum stored beside a user-supplied bytecode file does not establish its origin. A custom verifier or the Wasm path has a different trust contract. [QuickJS script-evaluation documentation](https://bellard.org/quickjs/quickjs.html#Script-evaluation) · [Existing CJI install transaction](../../../17/PICOCALC-CJI-PORT--ship-compiled-picocalc-worlds-with-a-shared-prelude-and-port-os-workflows/design-doc/02-compiling-worlds-on-the-picocalc-phases-4-through-6.md).

A warm artifact can still fail at world boot if prelude ABI, memory limit, claims or setup changed. Keep the world runtime private to its owner, with explicit phase handoff: capture immutable source under the kernel's control, compile in a fresh runtime on the worker if timing requires it, return owned bytes, then create the user's kernel-owned runtime and activate under its existing limits. No worker should run bound kernel/world callbacks. If direct on-lane compile fits the measured latency budget, avoid extra copies and task lifecycle work. Treat larger trusted boot-only bundles and arbitrary user files as separate configurations. For WAMR, the backend retains its own copy of the Wasm file until unload. ELF publication needs the current cache-coherency, relocation and alignment path. [QuickJS world setup](../../../../../../picocalc-os/nucleus/vm.c#L942) · [WAMR module lifetime](../../../../../../picocalc-os/nucleus/native_wasm.c#L30).

## Physical acceptance

Stock serial commands `bench` and `cachestat loop|fib` time hardcoded JavaScript workloads. They combine parse and execution. `cji check` measures CJI module production for bundled source. `restart` changes world state and fails to isolate timing phases. A small diagnostic firmware can time load, compile, write, read, boot and one run independently with the board's microsecond clock, using the world PSRAM allocator. Repeat the largest sources and the prelude, confirm source and output hashes, inspect failed syntax without executing it, and measure input delay while building. Use the same event fixtures and capability paths for the code that runs after boot. Choose the smallest change that meets both edit-to-ready and event budgets, then use those measurements to decide whether Wasm or native specialization is worth the runtime work. [P4 serial console](../../../../../../picocalc-os/port/esp32p4/main/main_p4.c#L128) · [QuickJS diagnostic implementation](../../../../../../picocalc-os/port/esp32p4/main/perf_p4.c#L101).
