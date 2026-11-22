---
Title: How to emit PicoCalc native code into compact storage
Ticket: PICOCALC-RV32-OUTPUT
Status: active
Topics:
    - picocalc
    - esp32-p4
    - performance
    - native
    - quickjs
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://compiler/typed/typed-rv32.js
      Note: Production instruction word arrays and slot linker
    - Path: repo://compiler/typed/typed-world.js
      Note: World declarations and link entry
    - Path: repo://firmware/port/esp32p4/main/typed_p4.c
      Note: Firmware compiler allocator and argument and result copies
    - Path: repo://ttmp/2026/11/19/PICOCALC-RV32-OUTPUT--write-streamed-picocalc-rv32-output-into-compact-buffers/scripts/01-prepare.py
      Note: Reconstructs clean and profiled candidate variants
ExternalSources: []
Summary: Implementation and validation guide for compact and direct native output generated against production 6426798.
LastUpdated: 2026-11-19T19:31:35.491239112-05:00
WhatFor: Trace instruction output and make a measured change to output ownership.
WhenToUse: Before modifying native output storage, slot linking, or the PicoCalc compiler budget.
---

# How to emit PicoCalc native code into compact storage

PicoCalc can start Files, Agenda and Editor by compiling their typed JavaScript sources into RV32 machine code on the device. The compiler itself runs in a dedicated QuickJS runtime. Its working memory is important even though the compiled applications do their work in native code. Production revision `6426798` uses function streaming. The earlier published P4 baseline for this compiler was 2.452 s and 1,410,844 peak QuickJS bytes on Editor. This study isolates the representation and lifetime of the machine code the compiler writes. [Research index](../../PICOCALC-COMPILER-THESIS--cold-compilation-and-bounded-analyses-on-the-picocalc/reference/02-picocalc-compiler-research-index-and-open-directions.md)

## What function streaming releases

The typed frontend, in `picocalc-os/compiler/typed-wasm.js`, parses and validates one function at a time. For native compilation it places operation codes and immediate operands into a numeric array. For example, the frontend can represent reading local 0 as the cells `[0x20, 0]`. In the native backend, `FunctionCode.step` reads both cells and emits a load into an RV32 register. The operation array belongs to a function while the backend consumes it. Then `consume` clears `fn.code`, and the rest of source validation continues.

The native code has a different lifetime. Every RV32 instruction in this backend occupies a 32-bit word. At the same time that the frontend begins its next function, each previous function still owns a normal JavaScript array of machine words. Each function also keeps fixups. A fixup identifies a machine instruction position whose final value depends on an address that becomes available later. `FunctionCode.jump` emits a zero and records its position, destination and destination register. A per-function prologue has two placeholders that the backend fills after computing the frame size at the end of lowering. Prologue values and patch destinations therefore need random access into the output.

Consider an illustrative pair of functions. The first emits 12 words and the second jumps back to the first function's first word from its own sixth word. The first word of the second function is at global word offset 12. The jump is at offset 17 and its displacement is `4 * (0 - 17) = -68` bytes. A function-local branch in the second function can use the same arithmetic after giving both its instruction and target absolute word offsets. A call to an imported SDK routine uses a separate path. Its final branch displacement depends on the executable layout of the reactor and remains zero in the raw output.

## Where copies are allocated

| Stage | Production output storage | Other relevant allocations |
| --- | --- | --- |
| Source loading and runtime startup | None | Firmware-owned source and reactor files, QuickJS runtime, compiler scripts and globals |
| C argument preparation | None | JS source string and a full JS copy of the C reactor, wrapped in a typed view |
| Frontend and lowering | One resizable JS number array per function | Numeric input for the function being lowered, function descriptions and jump fixups |
| Native assembly | Exact contiguous byte image allocated before writing the first word | Previous words and fixups, source and reactor argument |
| Typed-world ABI validation | Contiguous raw image | Entry signatures and record layouts |
| Slot scan and linking | Linked ELF copied from the source reactor, plus a raw code image | Source reactor JS copy during linking, patched entry stubs and SDK calls |
| Return to C | Linked ELF from QuickJS plus a C-owned copy | Compiler runtime teardown, outside-allocator output allocation |

The ELF reactor is the prelinked executable containing the SDK code and a reserved slot. The caller supplies a prelinked reactor and receives a separate linked ELF. `linkSlot` checks the executable program segment, magic, capacity, required entry stubs and import trampolines. It copies the reactor, patches its entry stubs, copies the raw code image and fills SDK call placeholders. The native world loader then validates and relocates the completed ELF. In `picocalc-os/port/esp32p4/main/typed_p4.c`, `JS_NewArrayBufferCopy` makes the incoming copy and `memcpy` makes the returned C copy before the compiler runtime is destroyed. The compiler allocator accounts for QuickJS objects, and both C-owned buffers belong to the native allocator. The realloc accounting reports the size charged after each allocator callback, so an internal overlap during realloc may be absent from the peak.

The instant of greatest live allocation can occur during lowering, assembly or linking. The words are ordinary JS values and their array backing storage can reserve more cells than it has filled. The raw image is exactly four bytes per instruction. During linking, JS holds both the input reactor and the output ELF, and C retains its original reactor. During result extraction, C also allocates the final module after releasing the JS argument values. Source inspection shows when storage can coexist. A phase-specific allocator measurement is needed to determine which overlap sets the actual peak.

## Compact storage and direct linking

The proposed output store holds a single sequence of fixed-size slabs. Each slab is a typed array of words with a byte view over the same buffer. Appending assigns an instruction a unique global word offset. Fixups and function entries use that coordinate space until conversion to bytes at the output boundary. A slab can be written and patched without relocating earlier slabs or reserving all output capacity up front. The final slab may be partially filled. Only initialized instruction bytes can be copied into an output.

The experiment has three modes. **Baseline** recovers the original JavaScript from revision `6426798`. **Compact** uses the slabs and copies them to the exact raw byte image before returning from native compilation. This tests storing words densely on the existing raw-image path. **Direct** uses the slabs and keeps them until slot linking, where the linker copies code into the final ELF view. It skips the contiguous raw image on that one entry path. It still retains a raw API for callers of `typedRv32.compile`. Both candidates produced the same output bytes for the published reactors.

Use 1,024 words per slab for the initial test. This gives 4,096 bytes of payload and at most 4,092 bytes of unused payload in the last slab. A single contiguous typed buffer with geometric growth would also store compact words. Its earlier contents would need to be copied whenever capacity grows, and the old and new allocations could overlap. Fixed-size slabs give a finite bound for unused capacity when testing long programs. A byte-order probe allows bulk copies of the typed storage on a little-endian engine, with explicit little-endian byte writes on a big-endian engine.

Writing instructions into the reactor during lowering is another possible design. Allocating a destination before discovering how much code fits would bring the full ELF into the lifetime of the frontend. Scanning the reactor before accepting the source would also report invalid reactor errors sooner. To change physical ownership of the C source reactor would require a separate lifetime contract for C callers and their allocator. Keep the slot scan and reactor-copy phase in its current position for this experiment.

## Implementation and invariants

1. Add the compact output store inside a generated variant of `picocalc-os/compiler/typed-rv32.js`. Replace each function's word array with a shared store and record its starting offset at construction. Append and patch in words. A new compile invocation creates a new store.
2. Run source validation and lowering in their existing order. A streaming lowering error remains deferred until the source has been read. Keep jump range checks in the existing assembly pass so a later source or lowering failure takes precedence. Keep fixup order by walking the same functions and their fixups in source order.
3. During assembly, insert byte offsets into `entries` and produce SDK relocations in the same order. Compute the signed jump displacement from the difference between absolute word addresses. Use little-endian output in both modes and remove unused capacity from any returned image.
4. In direct mode, preserve the raw result of `typedRv32.compile` and add a compiler entry used by `compileTypedWorldRv32`, `compileFilesRv32` and `compileAgendaRv32`. Validate that result's world signatures and records. Check reactor headers, slot capacity and stubs before allocating and patching the output. Copy the initialized bytes of each slab into that result, then apply the SDK import relocations. Treat the input reactor, including a view into a larger buffer, as read-only.
5. Exercise both streaming and buffered input in equivalence checks. Compile fixtures that cross slab boundaries, exercise stack spills, local branches, backward calls, SDK imports and signed instruction words. Verify rejection of recursion, a forward reference and malformed input. Use byte comparisons for raw code and full ELFs alongside structural checks for signatures, layouts, entries and relocations. Include a case where multiple errors are possible. Record the diagnostic class and message. Different allocation order can also shift the point at which a compile exhausts a configured heap.

## Measurement plan

Run fresh Linux processes with the exact vendored QuickJS source and the production C compiler entry, pairing modes on each input reactor and source. Retain alternating or balanced order for time and capture exact ELF hashes. Use a separate profile lane to mark front-end parsing, each function's lowering, fixup and raw materialization, ABI validation, slot validation and final output. A callback moves the allocator's current phase. Store live bytes at each phase entry and exit, the maximum charged bytes observed in the phase, and the sum of its separate elapsed intervals. The whole compile includes C startup and output ownership changes outside those JS phases. Measure authoritative cold time and global peak using clean variants. Estimate the direction and distribution of host changes before using board trials for the device conclusion.

Use the board operator's balanced schedule and common fixture bytes for baseline and both candidate modes. If the result leaves insufficient available heap in a later stage, follow allocations at phase transitions before discussing a larger design. If compact wins and direct contributes little, the independent ablation permits recommending the smaller patch. Retain promotion as a separate decision after measurements.

## What worked on Linux

The six blocks of cold vendored QuickJS processes used the same reactor and source bytes in all modes. Exact ELF bytes matched on every run. The Node oracle also compared raw images, function metadata, 145 Editor import relocations and the machine addresses encoded by entry stubs. A generated fixture crossed slab boundaries, decoded its own back edge and earlier-function call, and checked a reactor slot of exactly the required capacity. Giant and malformed fixtures checked jump, lowering and frontend diagnostic order. [Identity receipt](../various/identity.json)

| App | Baseline peak | Compact peak | Direct peak | Baseline / compact / direct time |
| --- | ---: | ---: | ---: | ---: |
| Files | 422,152 B | 423,464 B | 424,616 B | 6.405 / 6.416 / 6.464 ms |
| Agenda | 715,808 B | 674,216 B | 674,672 B | 18.400 / 18.371 / 18.321 ms |
| Editor | 1,920,216 B | 1,632,152 B | 1,651,264 B | 69.486 / 66.650 / 66.949 ms |

The separate host phase runs put baseline Editor's maximum in assembly, at 1,919,200 B. Compact reduces that phase to 1,571,088 B, and direct to 1,487,904 B. Their overall peaks arise later, at the final copy of the reactor. Compact materializes 87,544 code bytes for Editor, releases the slabs, and enters slot output with 1,390,888 B already live. Direct enters with 1,414,056 B, including the slab storage needed for the copy. With 4,096-byte slabs, Editor retains 90,112 B of slab payload plus per-slab objects. The profile measures the net occupancy at each boundary. Its differences also include compiler-script objects and collector behavior. [Clean host receipt](../various/host-clean.json) · [Profiled host receipt](../various/host-profile.json)

Native assembly reaches a lower peak of live bytes. The resulting whole-compile benefit depends on the next largest phase. An instruction count is a useful predictor of storage inside the compiler. A compiler heap limit must cover the maximum of all phases. QuickJS uses differently shaped values on this x86-64 Linux host and the 32-bit P4. The host timing also covers glibc allocation and file reads. Its magnitudes should stay attached to that environment.

## What happened on the PicoCalc

One firmware image ran all three clean output modes plus a separate branch-lowering experiment. Four balanced blocks gave each lane every position. Each timed call created a fresh compiler runtime and compiled the same bundled Editor. The baseline, compact and direct output modes returned identical 240,452-byte ELFs with the same digest as the Linux runs. [Board samples and run configuration](../../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-first-boot.json)

| Editor on the P4 | Time | Peak QuickJS allocation | Time saved within matched blocks |
| --- | ---: | ---: | ---: |
| Baseline | 2,483.993 ms | 1,410,878 B | — |
| Compact | 2,392.127 ms | 1,403,150 B | 78.949 ms |
| Direct | 2,335.968 ms | 1,414,092 B | 150.658 ms |

The first two numeric columns are lane medians. The last is the median of the four within-block differences. Both candidates finished before the baseline within each matched block. The direct lane's median was 148.025 ms below the baseline. The compact lane saved 7,728 B at the median and the direct lane added 3,214 B.

Two additional baseline and two direct profiles give the timing and allocation locations. Baseline assembly took 149.792 ms and reached 1,415,086 B. Direct assembly took 45.147 ms and reached 1,208,626 B. After that reduction, the direct linker still had to allocate the full ELF while its input reactor and instruction slabs remained live. Its slot-output phase reached 1,414,468 B. Baseline slot output was already near the maximum at 1,394,058 B. The earlier JS working set was smaller, the final linking overlap set a similar whole-compile maximum, and writing the words took less time.

A second boot repeated all four balanced comparisons. The median was 2,463.365 ms for baseline, 2,397.349 ms for compact and 2,330.993 ms for direct. The paired median savings were 60.978 ms and 124.544 ms. Both modes finished before the baseline in all four blocks. Peaks remained 1,410,872 B, 1,403,148 B and 1,414,090 B. Its two direct profiles again moved high water to slot output and saved roughly 104 ms in assembly. [Replicated board series](../../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-replicate.json) · [Derived summary of both boots](../various/board-summary.json)

The difference in device assembly time motivates the direct candidate as a cold-latency change. Compact provides a smaller implementation boundary and modest memory savings in this Editor. Set device heap budgets from the device's own maximum across phases. The Linux build gives an independent measurement of the same algorithms on a different engine representation and allocator.

## Repeat the comparison

Set `REACTORS` to the ESP-IDF `build/esp-idf/main` directory containing `files-reactor.elf`, `agenda-reactor.elf` and `typed-world-reactor.elf`. The full-ELF digest depends on the reactor bytes. If the toolchain produces a different reactor, compare all candidates using those same new bytes.

```sh
ticket=ttmp/2026/11/19/PICOCALC-RV32-OUTPUT--write-streamed-picocalc-rv32-output-into-compact-buffers
python3 "$ticket/scripts/05-cold.py" --reactors "$REACTORS" --work /tmp/rv32-output-clean
node "$ticket/scripts/02-identity.mjs" \
  /tmp/rv32-output-clean/inputs /tmp/rv32-output-clean/baseline \
  /tmp/rv32-output-clean/compact /tmp/rv32-output-clean/direct
python3 "$ticket/scripts/05-cold.py" --reactors "$REACTORS" --work /tmp/rv32-output-profile --profile
```

For an existing firmware harness, run `scripts/01-prepare.py --mode direct --out PATH` to generate the compiler and workload code for a lane. The `--profile` version requires the host to provide `globalThis.outputPhase(n)`. The argument identifies the phase entered. Frontend 0 and lowering 1 alternate for streamed functions. Assembly 2, world ABI validation 3, reactor slot validation 4, output 5, and JS return 6 follow once each on a successful world compile. The caller can time script loading, preparation of JS arguments, result extraction, and runtime teardown around these markers.
