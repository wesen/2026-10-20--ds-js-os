---
Title: Production integration of the typed compiler optimizations
Ticket: PICOCALC-COMPILER-INTEGRATION
Status: active
Topics:
    - picocalc
    - native
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-rv32.js
      Note: Native operand reader, instruction selector and linking
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Shared parser, function emitter, operand format and per-function callback
    - Path: repo://ttmp/2026/11/19/PICOCALC-COMPILER-INTEGRATION--integrate-qualified-compiler-optimizations-into-the-picocalc-toolchain/scripts/qualify-production.py
      Note: Physical production qualification and restoration
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T17:20:47.054105223-05:00
WhatFor: ""
WhenToUse: ""
---

# Production integration of the typed compiler optimizations

## From a source file to a running world

The PicoCalc compiles typed JavaScript on its ESP32-P4 when a world requests its compiled module. A *world* is an application or service that the OS can start and deliver messages to. A *reactor* is the prebuilt part of that world. It provides the runtime and space for the application's compiled functions. For example, the Files reactor calls a typed function to order two directory entries. In this guide **compile time** is time spent producing a module. **Application runtime** is time spent executing the instructions in that module.

For the native Editor, `picocalc-os/port/esp32p4/main/editor_p4.c` selects `compileTypedWorldRv32`. The firmware supplies the source and the target reactor to QuickJS. QuickJS executes the compiler, which is itself written in JavaScript. The result is an ELF containing RISC-V machine instructions; the loader can then start the application. The same shared source parser also serves applications compiled to WebAssembly. An optimization can improve compilation, improve the emitted instructions, or affect both in opposite directions.

## Where the change lives

The PicoCalc firmware loads `typed-wasm.js` first. It contains the lexer, record declarations, function declarations and function-body type checker. Both the Wasm and RV32 paths use these components. Wasm linking still needs to encode instructions and local declarations in WebAssembly binary format. RV32 lowering needs the values themselves. Passing an integer such as 130 directly eliminates a round trip through the bytes 0x82 and 0x01 for its signed constant operand.

```text
Typed source -> shared parser and type checker
                  |
                  +-> Wasm byte operands -> framed bodies -> Wasm module
                  |
                  +-> numeric operands -> buffered or streamed RV32 lowering
                                           -> patch call sites -> linked native ELF
```

## Native operand contract

`typedRv32.compile` selects numeric operations when calling `typedWasm.compileFunctions`. The mode applies once to an entire compilation. Every immediate occupies one number in the native function's intermediate operation array, including constants, call and local indices, memory alignment and offsets. Each function still has a parameter list, result type and local count. The default buffered compiler retains completed functions until it has checked all the source, so a type error in a later function retains its existing precedence over an earlier backend limit.

The shared frontend still exports the public standalone Wasm compiler and `linkWorld` for the firmware's Wasm worlds. Code generation for other targets goes through the same source-language checks. Native bodies omit the duplicate Wasm body array and length prefix. The world manifest, import ordering, reactor slot, and loader contract have no reason to change.

```text
compile source once using the selected operand format
for each checked function in definition order:
    record its signature and generated operations
for each native function:
    read one cell per opcode or immediate
    emit RV32 words, then resolve call addresses and imports
```

## Why a second execution order saves memory

An intermediate representation (IR) is the compiler's in-memory description of a program between reading source and producing the target instructions. Here a function's IR is an array of numeric operation and operand cells. The backend also produces a separate array of final RISC-V instruction words and a list of calls that will need addresses. Both take memory while they are reachable from a live JavaScript object.

In buffered mode the frontend checks all functions and retains their complete arrays of operations. The native backend starts lowering after parsing finishes. In streamed mode the frontend calls a consumer after each complete, validated function. Lowering converts that function's intermediate operations into machine words immediately. The callback clears the function's reference to the intermediate array. A function descriptor, its parameters, emitted native words and relocation information remain available for assembling and linking the whole program. QuickJS can reclaim the much larger intermediate array while compiling the next function.

```text
Three functions A, B and C

Buffered
    parse A -> parse B -> parse C -> lower A -> lower B -> lower C -> assemble
           A, B and C intermediate arrays overlap in memory

Streamed
    parse A -> lower A -> discard its intermediate array
    parse B -> lower B -> discard its intermediate array
    parse C -> lower C -> discard its intermediate array -> assemble
           native words and small descriptors accumulate across the source
```

Streaming operates at a function boundary. The entire source is still available to the lexer. The current function may be large, and native code for earlier functions stays live until assembly. Peak memory depends on the largest function and where it appears in the compilation order. A file containing one large function offers less opportunity to reclaim intermediate arrays between functions.

### Calls, addresses and diagnostics

The source checker accepts calls to imported functions or earlier declarations. It assigns each callable an index. The native emitter can therefore check argument types and emit a call before it knows the callee's final machine address. It records the call site and target. After lowering all functions the assembler assigns starting word offsets, patches relative jumps and hands import relocations to the linker. An entry offset in bytes is four times its starting word offset.

Error ordering is also part of the compiler interface. Suppose the first function uses nine parameters, which the native backend rejects, and a later function returns a Boolean where it declares an integer. Buffered execution reports the latter source type error first because it finishes source checking before native lowering. Streaming saves the first native error and continues checking source, so switching modes leaves that diagnostic stable.

```text
on each completed function:
    if there is no saved backend error:
        try to lower it and retain the resulting words and fixups
        if native lowering fails, retain that first error
    release the intermediate operation array
after the frontend has checked the last declaration:
    if a source error occurred, parsing already reported it
    if there is a saved backend error, report it
    otherwise assign addresses, patch calls, and link the reactor
```

## Public entry points and configuration

| Interface | Purpose |
| --- | --- |
| `typedWasm.compileFunctions(source, functionBase, imported, maxSourceLength, numericOperands, onFunction)` | Type-checks the program and invokes the optional consumer after each accepted function declaration. The compiler’s ordinary Wasm writer uses encoded operations. |
| `typedRv32.compile(source, imports, maxSourceLength, options)` | Always uses numeric operands. `options.streamFunctions` selects per-function lowering. Omitting it uses buffered lowering. |
| `compileFilesRv32(source, reactor, options)`, `compileAgendaRv32(...)`, `compileTypedWorldRv32(...)` | Application-level compile-and-link entry points. Each forwards the optional native setting. |
| `typedRv32.linkSlot(program, reactor, entries)` | Places the native instructions in the reserved executable slot and applies relocations. The linked ELF can retain the same size even when the compiler's working set changes. |
| `PICOCALC_RV32_STREAM_FUNCTIONS` | ESP-IDF build configuration. The default is OFF. ON passes the streaming option when compiling a native typed world and records a mode marker before its compile receipt. |

A host can select the mode per compile. The handheld selects it at firmware build time for native typed worlds. No application source or manifest edit is required. In the existing configured IDF build add `-D PICOCALC_RV32_STREAM_FUNCTIONS=ON` to select streaming. The ticket's `scripts/build-production.sh` builds either setting with the same application, device and compiler configuration.

```javascript
const ordinary = compileFilesRv32(source, reactor);
const economical = compileFilesRv32(source, reactor, {streamFunctions: true});
// Both Uint8Arrays contain the same linked ELF when the inputs are identical.
```

## Reading the implementation

| File under `picocalc-os/` | Where to start |
| --- | --- |
| `compiler/typed-wasm.js` | `FunctionEmitter`, `NumericFunctionEmitter` and `compileFunctions`; operand format and the callback boundary |
| `compiler/typed-rv32.js` | `FunctionCode.cell`, `FunctionCode.step`, `compile` and `linkSlot`; native instruction selection, body lifetime and relocation |
| `compiler/typed-world.js` | Generic world linker entry point used by Editor |
| `worlds/files/compile.js` and `worlds/agenda/compile.js` | App-specific required entries and native wrapper APIs |
| `port/esp32p4/main/typed_p4.c` | `p4_typed_compile`; selects the JS entry, supplies its options and prints elapsed time, peak live compiler allocation and module bytes |
| `port/esp32p4/CMakeLists.txt` and `port/esp32p4/main/CMakeLists.txt` | Configuration switch and the C compilation unit that consumes it |

## How to tell whether the integration works

1. Compile applications with the pinned previous compiler and the production version in separate JavaScript runtimes. Compare the full native image, signatures, entry offsets, relocations, record layouts, complete linked ELF and complete Wasm binary as applicable.
2. Include signed extrema, constants across consecutive LEB lengths, local and function indices above 127, and multi-byte memory offsets. Exercise malformed source and the public standalone and world linker paths.
3. Run the real Editor compiler entry on the P4. Use the production shared frontend in firmware and compare the linked result against the host on the *same* reactor. The earlier research prototype removed unused Wasm writer code entirely; the integrated file still has to serve Wasm users, so its measured time and peak can differ from the experiment.

## Existing experimental reports

The source and receipts are in the sibling PICOCALC-COMPILER-THESIS ticket. Its representation report explains operation encoding in detail. Its physical Editor report measures the change on the ESP32-P4. The independent cold-compilation report examines streaming lifetimes, function order and peak memory. The separate bounds study remains available as a research result. The negative-results report records limits on each conclusion. Production measurements belong in this ticket so readers can distinguish experimental results from the code that was merged.

## Reproducing the measurements

Use one checkout and identical sources, reactor binaries, SDK configuration and board. Save firmware images and raw serial logs to a scratch directory. Keep compact JSON measurements with the ticket. The final physical report is in `various/production-report.md` and raw sample values are in `various/production-p4.json`.

1. Run `node scripts/check-numeric.mjs REACTOR_DIR 4452064` with the ticket script path from the repository root. This compares the native representation change to its predecessor, including indexes above 127. Run `node scripts/check-streaming.mjs REACTOR_DIR 2317696` to compare buffered and streamed execution against the pinned control.
2. In an initialized ESP-IDF project, use `bash scripts/build-production.sh IDF_EXPORT SDKCONFIG BUILD_DIR buffered BUFFERED_DIR`, then repeat with `streamed STREAMED_DIR`. These ticket commands are run from the repository root using the full ticket script path. In the second build only the native streaming selection changes.
3. For a board with its app partition backed up, run `python3 scripts/qualify-production.py --help`. The runner verifies the partition table and that both images embed the JS sources from the specified Git revision. It boots each mode four times and requires Files, Agenda and Editor to compile and register with the native engine. Every streamed compilation must explicitly identify itself on the serial console.
4. The runner exercises a 64 KiB Markdown document in the streamed Editor, checks framebuffer captures and restores the original app partition. Read the final restoration flag as well as the measurements. The firmware's peak counts live bytes billed by the QuickJS compile allocator. This measurement excludes independent allocations such as the final C copy of the result.

The native operand report in go-go-parc is *Numeric Operands on the Physical ESP32-P4*. The streaming report is *Function Representations and Streaming*. The independent host article *Measuring Compiler Costs* examines function order and peak memory. The direct text-bounds experiment has a separate article and a pinned candidate at `e082ec3`. Commit `3785155` removes it from the production compiler. These are separate experimental controls for future research.
