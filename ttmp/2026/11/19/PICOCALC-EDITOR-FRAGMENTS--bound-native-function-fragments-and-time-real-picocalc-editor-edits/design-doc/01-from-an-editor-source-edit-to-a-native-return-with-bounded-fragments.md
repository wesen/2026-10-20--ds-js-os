---
Title: From an Editor source edit to a native return with bounded fragments
Ticket: PICOCALC-EDITOR-FRAGMENTS
Status: active
Topics:
    - picocalc
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/worlds/editor/preview.typed
      Note: Runtime witness and edited helper
    - Path: repo://picocalc-os/compiler/typed-rv32.js
      Note: Reference native lowerer, linker and slot ABI
    - Path: repo://picocalc-os/compiler/typed-world.js
      Note: World entry and record contracts
    - Path: repo://picocalc-os/port/esp32p4/main/typed_p4.c
      Note: QuickJS allocator and device compilation wrapper
ExternalSources: []
Summary: Compare warm, partial and clean rebuilds of the full typed Editor from changed source through native return.
LastUpdated: 2026-11-19T22:00:36.679431254-05:00
WhatFor: ""
WhenToUse: ""
---

# From an Editor source edit to a native return with bounded fragments

When a programmer changes a function on the PicoCalc, most of the Editor's 120 functions keep the same source. A full build still reads and lowers all 120. The incremental compiler may instead reuse a fragment containing the RV32 words of one function and symbolic information about its calls. It must decide which fragments are valid and relocate each retained call against the final addresses. A correct answer is a complete ELF identical to a clean compile of the same source with the same reactor.

## Establish the reference

Use the same frozen production compiler as the earlier Files editing study (`40bcf850`) and the same compiler for the clean side of every comparison. Keep the staged backend experiment independent. The native SDK packs code into an existing ELF. In `picocalc-os/compiler/typed-rv32.js`, `linkSlot(program, runtime, entries)` validates ELF32 headers, finds the slot magic within an executable load segment and patches native entry stubs. In `typed-world.js`, `compileTypedWorldRv32(source, reactor)` also validates the event record and SDK signatures. On the P4, `editor_p4.c:p4_editor_compile` reads the concatenated Editor source and its reactor from the bundle. A hash of the source components in a different order would describe a different program. Read the generated `editor.typed` and `typed-world-reactor.elf` from the same ESP-IDF build used by the hardware.

### Session state and validity

The previous [incremental compiler](../../PICOCALC-FUNCTION-REBUILD--rebuild-changed-typed-native-functions-on-picocalc/scripts/02-incremental.js) scans declarations in source order. It compares function text, signatures of referenced functions, observed record layouts and record-name existence. Reuse requires agreement on every dependency. A whole-record layout fingerprint is conservative. Changing one offset can cause many functions to be lowered again, even if their resulting words remain identical. The previous [host examination](../../PICOCALC-LAB-REVIEW--independent-examination-of-the-picocalc-compiler-lab/scripts/05-rebuild.mjs) already covered the Editor. Here we add bounded retention and the physical edit-to-native-return measurement.

```text
warm session        current source edit
      |                       |
      v                       v
cache by function name --> check source + signature + layouts
                              |                      |
                        reuse fragment          compile body
                              +---------+------------+
                                        v
                              assign final offsets
                              patch all symbolic calls
                              link complete ELF
                              relocate into executable memory
                              call Editor preview function
```

A finite native-word budget bounds the payload of retained machine-code arrays across edits. A finite count bounds the number of accompanying fragment records. The QuickJS allocator separately measures the cost of source slices, maps, symbolic relocations, runtime, and ELF assembly. We will compare a finite budget generous enough for the module and a binding budget; we will also replay a zero-fragment session on the host. Exclude a second full cached ELF when whole-module exact hits are disabled. Admission is deterministic in declaration order. A missing fragment just uses the normal body compiler. This policy is deliberately simple enough to audit. Keep the method label, capacity, admitted/evicted counts, hit counts, retained word bytes, allocator high-water mark, complete ELF digest, and guest output for every accepted case.

```text
on successful link:
    remaining = native_word_byte_capacity
    retained = empty map
    for piece in declaration order:
        if retained.size < fragment_count_limit and piece.bytes <= remaining:
            retain piece with its dependencies and unresolved call targets
            remaining -= piece.bytes
    publish retained atomically
on compile or link rejection:
    continue using last successful revision
```

## Edits and semantic witnesses

1. Change the stride in the existing `editorPreviewSlot` calculation from 100 to 99. The native caller `editorPreviewFinish` writes a row header at a different buffer index.
2. Add a stride parameter and update the three call sites. Build an incompletely edited source on the host first and compare its diagnostic with clean compilation. The final signature and all callers must agree.
3. Exchange the existing `file` and `offered` fields in `WorldState`. This reproduces the previous 77-function change. Run an additional field-layout witness that exchanges `previewRows` and `previewUnits`. In that variant the measured caller reads and writes the moved fields, so stale code produces an observable wrong buffer or state.
4. Force eviction; rebuild after each edit and return to an earlier revision. A legitimately evicted function must be rebuilt. Verify the cap after every publication, including a failed transaction.

`picocalc-os/worlds/editor/preview.typed:editorPreviewFinish(rows, state, kind)` uses the actual application function, takes writable UTF-16 storage, updates three state fields and returns an integer. The experimental loader locates the function in its linked image using an independently computed clean compiler offset. Supply a correctly laid-out state with distinguishable row and unit values, invoke it, read the output cells and updated fields and compare with the expected operation. This endpoint exercises application code after each edit. Capture the end timestamp immediately on return. The ELF comparison verifies all functions beyond this endpoint.

## Clock and acceptance

In both clean and incremental lanes, load the compiler scripts and seed the previous source before timing. Start the one continuous timer when the new source is handed to the compiler. It includes validation, native lowering, final link, loader relocation and the native call. Count reset, source-fixture generation, binary hashing and console output outside the timer. Rotate lane order and sample multiple boots; record the absolute difference per matched block plus percentages. Give a separate cold reference where available. Resident memory before an edit and maximum during the edit describe different costs. Increased peak memory is an acceptable outcome if its latency benefit justifies the cost.

The Opus High design suggested comparing changed bodies with rebuilt bodies, symbolic relocation and measured eviction. We adopt those tests and the real 120-function application. Keep priority ranking of retained fragments as a future comparison to the declaration-order baseline. Large inputs can expose the worst case in which walks, relinking and misses exceed the cost of a clean compile. Report that outcome if observed.
