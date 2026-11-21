---
Title: Experimental design and implementation guide
Ticket: PICOCALC-COMPILER-INSPECT
Status: active
Topics:
    - picocalc
    - compiler
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-21T00:24:58.398694294-05:00
WhatFor: ""
WhenToUse: ""
---

# Experimental design and implementation guide


The frontend parses functions into a stream of operations. The Wasm path encodes a module containing local declarations and Wasm instructions. The native path consumes numeric operations, assigns temporary values to registers or frame slots, emits words and patches branch and call destinations after computing function sizes. A dump taken before that final step can show zero where the delivered image contains a jump. Observe the existing stages in place and read bytes from the finished artifacts.

    source -> frontend event (names, types, locations, operations)
                         |-> Wasm body -> offsets in final module
                         |-> RV32 lowering -> fixups -> offsets in native image
                                                          ^ join PC counts here

Use an optional, exact-function-filtered observer. When it is absent, streaming continues and the compiler releases each function as usual. Synthetic frame setup, teardown and compiler-generated source need explicit origin labels. Consecutive source operations may fuse; a mapping must allow a range of inputs to produce one range of instructions, including an empty range. Native image offsets and Wasm module offsets have distinct units from frontend cell indices. A profile must name the exact native image it executed. Reject a hash mismatch.

Compare observed and unobserved builds byte for byte, including imported calls, control flow, checked memory, leaf and framed functions. Compare syntax and backend error messages. Test readable and JSON Lines output through the CLI. Count the default ray frame, check its reference image and use the joined profile to identify the hottest source-associated stack access in the shadow routine.

## Follow one compilation

From the repository root, select a small leaf such as the color packer. Run the following commands with Node. The default selects both targets. The JSON Lines form emits one module header followed by one record per selected function, in each target's own order.

```sh
src=picocalc-os/worlds/raytrace/raytrace.typed
node picocalc-os/tools/typed-inspect.mjs "$src" --function typedRayPack
node picocalc-os/tools/typed-inspect.mjs "$src" --function typedRayPack --jsonl > /tmp/pack.jsonl
```

The module header carries the source digest, target, delivered byte count and image digest. The format identifier is `typed-inspect/1`. Each function record carries half-open byte ranges, a local table and target-specific operations. A Wasm body starts with declarations for extra locals. The first executable opcode follows that prefix. RV32 instead emits fixed-width little-endian instructions and can start by adjusting the stack pointer and saving its return address. The two compilers can emit different numbers of operations for one expression. Join records within the same target by their ordinal and range. Use the source and named locals to navigate across targets. The frontend guide explains how generated async helpers name their coordinate system.

## Native emission API and ownership

`typedRv32.compile(source, imports, maxSourceLength, options)` accepts the same observer contract as `typedWasm.compile(source, options)`. Set `options.inspect.function` to select one function by exact name and provide `options.inspect.emit(event)`. Leave the filter out to collect the entire compilation. Inspection allocates metadata on the observing path. Function selection limits retained observations. Measuring the cost of a normal build requires compiling with the observer disabled.

The native lowering selects a frameless or framed emitter. The latter can give a named local a slot at a fixed displacement from the stack pointer; an operand still live when a call executes can also occupy a slot. Both produce load and store instructions, but the optimization opportunities differ. The host disassembler identifies the register and displacement from the delivered word. It joins that address to the local table and the active call when the ordinary frame layout supports that inference. Synthetic regions from a replacement emitter retain a conservative label. Unrecognized encodings retain the original machine word.

```text
for each selected function:
    observe the real step's starting word index and input tape cursor
    run the normal step, including its own fusion and lookahead
    record both ending cursors
assemble every function and patch internal jumps
for each range:
    add the final function entry offset
    read the words from program.image
    annotate pending SDK imports from program.relocations
```

The lowering emits zero words for some control markers. An instruction selection rule can consume several inputs in one step. Function setup and teardown may consume no inputs. A specialized backend that builds a guarded fast body followed by the generic body can provide `inspectionSegments` with an offset, label and original input ranges. This names both copies of the same operation. For an opaque replacement the listing still exposes its machine words. Segment offsets count bytes relative to the function entry. The replayable implementation is in the scalar ticket's `scripts/compiler/inspection-segments.js`.

## Attach executed counts and compare two lowerings

A profile is a JSON object with `imageSha256` and sparse pairs in `counts`. Each pair is an aligned native image byte offset and its nonnegative execution count. Missing offsets have count zero. Each offset can appear once. A relocated live PC must first be converted to the same image coordinate system. A different digest is an error. The supplied capture uses the emulator's instruction fetch callback and verifies the default framebuffer checksum and total guest instructions. There is no on-device sampling or dynamic Wasm counter in this implementation.

```sh
bash ttmp/2026/11/21/PICOCALC-COMPILER-INSPECT*/scripts/02-replay-inspection.sh /tmp/ray-inspect
cat /tmp/ray-inspect/shadow-hot.txt
cat /tmp/ray-inspect/pack.diff.txt
```

The script runs the color packer in the context of an entire frame and compares the standard compiler with the earlier positive-literal division experiment. The differential command finds common operation boundaries so a fused constant and division are compared as a unit. It includes synthetic ranges with no corresponding source operation. When bodies differ at the frontend it directs the reader to each listing instead of inferring an alignment. Use `--buffered` to exercise the alternate frontend lifetime and `--target rv32 --imports sdk.json` to describe SDK signatures for native programs.

## Verification and extension

Run `make -C picocalc-os test-apps`. Tests exercise final module bytes, actual entry addresses, streaming and buffered compilation, relocations, source coordinates, generated helpers and preservation of error precedence. The pinned pre-inspection receipt covers five workloads. For a new opcode extend the actual frontend decoder, add a fixture that uses a wide operand, and compare against the bytes delivered by the ordinary compiler. For a new lowering rule verify the retired-count delta in an identical end-to-end workload. Absolute PC addresses change when earlier functions shrink.

Implementation entry points are `picocalc-os/compiler/typed-wasm.js` (function observation), `picocalc-os/compiler/typed-rv32.js` (step ranges and fixups), `picocalc-os/tools/typed-inspect.mjs` (filter, profile and diff) and `picocalc-os/tools/typed-inspect/rv32.mjs` (instruction decoding). The ticket's `various/director` directory contains short human-readable receipts.
