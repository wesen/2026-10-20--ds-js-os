---
Title: From the Typed frontend to an ordinary PSRAM-loaded world
Ticket: PICOCALC-NATIVE-PROMOTION
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-rv32.js
      Note: Leaf policy and native checked code selection
    - Path: repo://compiler/typed/typed-wasm.js
      Note: Typed frontend and numeric emission
    - Path: repo://ttmp/2026/11/20/PICOCALC-NATIVE-PROMOTION--qualify-late-text-lowering-and-streaming-frameless-leaves-on-the-playable-picocalc/scripts/psram/main/bench.c
      Note: Timed PSRAM chess search and result contract
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-20T19:54:36.228680668-05:00
WhatFor: ""
WhenToUse: ""
---

# From the Typed frontend to an ordinary PSRAM-loaded world

Two compiler changes are ready for a release trial. The first gives the RV32 backend a way to recognize a checked text operation while selecting instructions. The second allows a small scalar function to return without constructing a stack frame. Both operate on one function at a time. Apps keep their existing source, the Wasm target supplies an independent comparison, and the firmware can still compile a game or a mobile painter from source on the device.

A release trial has two independent questions. Does the product still work when the user opens an app and edits a file or plays a move? Does the generated code actually execute faster in the memory used by the product? A pass on the first question is necessary to install a build. To answer the second, we time equal amounts of verified guest work.

## How source becomes executable

A *world* is an application with a lifecycle and an interface to the OS. The Chess source contains both the game and a writer that reconstructs a separate painter's source. The running game can publish that source. The painter service compiles it against a closed entry contract, and the compositor uses the resulting painter to render the board. This makes the game and the painter two consumers of the same compiler with different code budgets and imports.

```text
Typed source
    |
    +-- signature scan and type checking
            |
            +-- Wasm byte emitter --> Wasm module and reference executions
            |
            +-- numeric function emitter --> one checked, typed function's tape
                       |
                       +-- eligible scalar leaf --> register-only attempt
                       |                              | spill --> general lowering
                       +-- all other functions ----> general RV32 lowering
                                      |
                              code, calls, entry offsets
                                      |
                       link into executable slot in reactor ELF
                                      |
                           ESP-IDF relocates ELF into PSRAM
                                      |
                       OS calls typedWorldEvent / painter calls paintChess
```

The *tape* is an array of numbers. An operation occupies one cell and, when necessary, immediate operands occupy later cells. It is internal to the native compiler. The *reactor* is already-linked runtime code with reserved space for native instructions, entry stubs and import stubs. The ELF is the loadable module. PSRAM is the board's external RAM. A shorter instruction sequence creates space inside a reserved slot even when the containing ELF file has exactly the same length.

## Change one. Select instructions while the operation is recognizable

Take the Typed statement below. Both inputs can refer to the same buffer.

```javascript
out.setCharCodeAt(i, source.charCodeAt(j));
```

A text or buffer value points to a 32-bit count followed by 16-bit code units. For an index i the unit starts at base + 4 + 2*i. Checking the destination precedes evaluating the value to write. If the destination index is invalid and the value expression calls a function with side effects, that function must never be called. If the two buffers overlap, the input read must see the old unit. Measuring only the final destination after a successful call misses both kinds of error.

Previously the frontend expanded a checked address into individual loads, comparisons, control flow and arithmetic before the native emitter handled it. Once the meaning was spread across those operations, the straightforward native translation could generate a stack temporary and extra branches. The numeric emitter now retains the two local identifiers, for the receiver and evaluated position, in operation 0xf1. General RV32 lowering selects a load of the capacity, an unsigned conditional branch over a trap, and the scaled address arithmetic. A negative signed index becomes a large unsigned word. For a valid buffer it therefore takes the same trap path as an index at or beyond the end. The returned address excludes the four-byte header. The load or store that consumes it includes the header offset exactly once.

```text
position = evaluate index once
load position and receiver from their local slots
if unsigned(position) >= load_u32(receiver):
    trap before evaluating the write value
payload_base = receiver + (position << 1)
value = evaluate right-hand side
store_u16(payload_base + 4, value)
```

For a nonempty literal write, the frontend checks the starting index and the last unit before any mutation. Operation 0xf2 carries an already-checked address local and the index of a string in a function-local literal table. Lowering emits ordered halfword stores at known offsets. An empty literal returns zero after evaluating the position. The language limit is 1,022 UTF-16 units. Counting units matters for supplementary characters, which occupy two. Keep the endpoint, side-effect and full-memory checks when changing this path. The Wasm emitter continues to construct ordinary Wasm instructions. [Frontend methods](../../../../../../picocalc-os/compiler/typed-wasm.js) · [Native instruction selection](../../../../../../picocalc-os/compiler/typed-rv32.js)

## Change two. Decide when a leaf can use the calling convention directly

Consider a helper that returns x + 1. A caller has already placed x in argument register a0 and its return address in ra. If the helper makes no calls, writes no locals and has enough temporary registers, it can read a0 directly, form the result, place it in a0 and return through ra. The general emitter allocates a stack frame, stores arguments and ra, and restores state at the common exit. Those instructions are worthwhile for a function that needs the storage. In a frequently called scalar helper they add work on every invocation.

Eligibility has concrete limits. The function must have at most eight i32 or bool parameters, zero extra locals and no more than 128 numeric tape cells. An allowlist identifies acceptable instructions and their immediate widths. A call, loop, mutation or unfamiliar instruction takes general lowering. Arguments remain in their ABI registers. Up to five operand temporaries use the emitter's register stack. A spill request abandons the tentative leaf and lowers the whole function using the general backend. Lowering errors other than this private fallback propagate to the caller. Reading a0 after temporary arithmetic is an important test, especially for signed division overflow checks.

```text
for each completed function:
    if within size, local and signature limits and all operations are eligible:
        try to emit to private register-only output
        if completed without a spill:
            retain that output
        otherwise:
            generate ordinary framed output from the same tape
    otherwise:
        generate ordinary framed output
    release this function's literal table
link completed functions and patch calls
```

This decision requires no interprocedural analysis. It leaves caller and callee independent for linking, keeps recursion and complex functions on their existing path, and introduces no option authors must set. The compiler still retains lowered code for final layout and relocation. The streaming saving concerns the lifetime of frontend tapes. [Native entry and leaf lowering](../../../../../../picocalc-os/compiler/typed-rv32.js) · [World linking API](../../../../../../picocalc-os/compiler/typed-world.js)

## Interfaces and implementation sequence

| Interface or file | What to inspect |
|---|---|
| FunctionEmitter / NumericFunctionEmitter in typed-wasm.js | Shared type checks and evaluation order, target-specific representation of checked operations. |
| typedRv32.compile(source, imports, maxSourceLength, options) | Default streaming callback, per-function lowering and final relocation records. Options may request buffered lowering for comparison. |
| typedRv32.linkSlot(program, runtime, entries) | Patches a copy of the runtime template and accounts for header, jump stubs and the instruction region. |
| compileTypedWorldRv32(source, reactor, options) in typed-world.js | Production linker used to build the actual app ELF. |
| p4_typed_compile in port/esp32p4/main/typed_p4.c | Runs the compiler in QuickJS and reports compile microseconds, peak accounted JS heap and linked module bytes. |
| esp_elf_relocate and the mobile painter loader | Resolves the image in executable memory. The fixed-work experiment checks the actual loaded segment and entry addresses. |

1. Reproduce the host oracle before touching hardware. Include index -1, index equal to capacity, a partially fitting literal, an aliased read and write, and a failing destination with a side-effecting RHS. Compare the full memory after success and after an expected trap. Execute both streamed and buffered RV32, compare linked Wasm to the prior release and include a program held out from optimization design.
2. Reuse the ordinary build profile. The ticket's release builder takes a committed revision and a new directory. The attestation script reconstructs the painter source byte for byte, verifies the usable slot and entry jumps, identifies both compiler scripts in the firmware, and checks the partition digest. Save the small receipt with the ticket and the bootable binary outside Git. [Release scripts](../scripts/release)
3. Run cold boots with independent restarts, then play a deterministic move and check the rendered board and hint. Use an exclusively owned scratch file to test Editor open, edit, save and reopen. Measure the compiler's own interval separately from end-to-end UI observations. [Ordinary device collector](../scripts/device)
4. For attribution, build both full Chess ELFs against the same template, locate the two search entry points inside the executable segment, then load each using the ESP-IDF loader. Time search start through completion in slices. Alternate arm order, rotate positions, reset board/state before the clock, and compare move, score, depth, nodes, slice count and root position. Verify the ordinary firmware before testing and after restoration. [PSRAM trial](../scripts/psram)

## Reading the results

A clean compile includes work in the compiler. The search time measures work in its output. Whole-world CPU also includes event handling. Display completion includes the scheduler, rendering, and the time between observations. An improvement in one interval need not appear in proportion in another. Report the unit and denominator of every percentage. For elapsed time use 100 × (control − candidate) / control.

The release gate is evidence of behavior on the ordinary image, an attributable compiler build and a recoverable device. Fixed-work timing establishes whether to invest further in this approach. The next host comparison can try a narrower slot using actual high-water marks across the catalog. This promotion keeps the original slot reservations, which allows the newly measured free space to be assessed separately. [Qualification report](../analysis/01-promoting-two-native-compiler-changes-to-the-playable-picocalc.md)
