---
Title: Experimental design for the PicoCalc compiler studies
Ticket: PICOCALC-RV32-STUDIES
Status: complete
Topics:
    - picocalc
    - native
    - performance
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Experimental design, implementation map and reproduction procedure for the two physical native compiler studies.
LastUpdated: 2026-11-19T19:30:57.023314819-05:00
WhatFor: ""
WhenToUse: ""
---

# Experimental design for the PicoCalc compiler studies


## What the board does when it opens Editor

The PicoCalc stores the Editor policy as typed JavaScript source. QuickJS runs the compiler on the ESP32-P4. A successful compilation produces a complete ELF, the file format the native loader accepts. The CPU can then execute the Editor as RV32 instructions. Time spent translating the source, space occupied during translation, and time spent executing a command are three measurements with different start and end points.

```text
editor.typed  -> tokenizer and type checker -> one checked function body
                                                     |
                                             RV32 instruction selector
                                                     |
                                          instruction words and fixups
                                                     |
fixed reactor ELF -> validate slots/imports -> write relocated code -> loader
```

A *reactor* supplies the prebuilt runtime and reserves instruction space, including fixed entry points used to call the application. A *fixup* is a location whose offset becomes known after layout. Branch offsets within the generated code and calls into the reactor need the correct final addresses. Two ELFs of identical length may contain different amounts of application code because the reservation stays the same size.

## Two independent interventions

**Instruction selection.** Consider a typed function that tests whether a signed integer is smaller than another. The intermediate representation (IR) computes a Boolean and a control instruction consumes it. When the next operation is an eligible branch, both inputs are already available. An RV32 branch can compare those registers itself. The candidate recognizes adjacent instructions during lowering. Preserve signedness, operand order, short-circuit side effects, and the existing long-jump sequence. Retain value-producing comparisons whenever another expression needs the Boolean. The RV32I base ISA defines these branch conditions and the allowed relative displacements. [RISC-V specification](https://docs.riscv.org/reference/isa/unpriv/rv32.html)

**Output storage.** The streamed frontend can release each checked body immediately after lowering it. The machine words for past functions still have to exist until addresses and relocations are known. The output experiment changes how the backend stores those words and when it materializes a contiguous image. It has two candidate arms. Compact holds words in typed chunks and still produces an intermediate image. Direct retains chunks and writes into the destination reactor for linked compilation. Public raw compilation still produces a contiguous image. A successful direct build should reproduce every final byte, including slot padding, metadata and call displacements.

```text
control     checked body -> JS word arrays -> packed image -> reactor copy
compact     checked body -> typed chunks   -> packed image -> reactor copy
direct      checked body -> typed chunks   -----------------> reactor copy
```

The three lines describe the linked path. The word “copy” denotes the returned owned buffer built from the reactor template. Callers must remain free to reuse the input reactor.

## Measurement contract

The clean control and three independent candidates compile identical Editor source against one IDF-built reactor, with four blocks in a balanced order. Each compile uses a fresh QuickJS runtime and the same heap limit and deadline. Digest the complete returned buffer outside the timed interval. Require identical output for both output candidates, and compare the intentionally different branch image against an independently built host digest. No cell combines branch and output changes. Branch-specific improvements in emitted bytes cannot establish an additive interaction with direct output.

```text
for trial order in four balanced rows:
    for compiler in trial order:
        create new compiler runtime
        run the normal native Editor compile entry
        record elapsed microseconds and maximum live allocator bytes
        compare SHA-256 of the returned ELF with the host oracle
repeat baseline and direct with phase recording enabled
time matched native Files function bodies on identical arguments
load the branch-built Editor and compare its preview with the reference
restore the saved factory application and check the native worlds
```

A separate instrumented runtime marks lowering, finalization, ABI validation, reactor validation and emission. Each change of phase settles elapsed time to the *previous* phase. Allocation events update the peak for the *current* phase. Starting a phase also records already-live allocations. A peak is the maximum absolute number of live QuickJS bytes observed while executing that phase. Peaks cannot be summed. Source and reactor buffers allocated outside QuickJS belong to a different accounting domain. The embedding API supports custom allocation through `JS_NewRuntime2`. [QuickJS memory handling](https://www.bellard.org/quickjs/quickjs.html#Memory-handling)

## Working with the APIs

| Entry or file | What to inspect |
| --- | --- |
| `picocalc-os/compiler/typed-wasm.js` | Tokenization, checking, function-body lifetime and compiler output consumed by either backend. |
| `picocalc-os/compiler/typed-rv32.js` | Register stack, instruction selection, symbolic branch patching, function placement and native image assembly. |
| `picocalc-os/compiler/typed-world.js` | `compileTypedWorldRv32(source, reactor, options)`, world ABI validation and linking. |
| `picocalc-os/port/esp32p4/main/typed_p4.c` | `p4_typed_compile` owns the runtime, allocator and copy from the returned JS typed array into a C-owned module. |
| `picocalc-os/worlds/files/files.typed` | Real `filesCompare` leaf function used for the physical execution test. |
| `scripts/stage.py`, `scripts/editor-trials.c`, `scripts/phase-hooks.c.inc` | Isolated build, scheduling, phase clocks and allocation maxima. |

For each output variant, test raw compilation, buffered and streamed inputs, real reactor linking and failure handling. For control flow, compare results, mutation and call order on signed extrema, empty branches, nested loops and deep expression stacks. The common examiner runs separate tests. An improvement in one native leaf operation describes only the executed inputs and code paths from that operation.

## Reproduce the physical trial

Run from the repository root with the IDF 5.4.2 installation, matching cross toolchain and attached P4. The previously qualified backup utility checks that the factory partition begins at 0x10000 and spans 8 MiB. The temporary directory must be new. Keep the full saved firmware local.

```bash
day=ttmp/2026/11/19
studies=$(find "$day" -maxdepth 1 -name 'PICOCALC-RV32-STUDIES--*')
thesis=$(find "$day" -maxdepth 1 -name 'PICOCALC-COMPILER-THESIS--*')
scratch=$(mktemp -d /tmp/p4-rv32-studies.XXXXXXXX)
port=/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00
flasher=/home/manuel/.espressif/python_env/idf5.4_py3.13_env/bin/esptool.py
bash "$thesis/scripts/supervisor/p4-backup.sh" "$port" "$scratch/original" "$flasher"
bash "$studies/scripts/build.sh" "$scratch" /home/manuel/esp/esp-idf-5.4.2/export.sh
python3 -B "$studies/scripts/board.py" "$scratch" "$port" "$flasher"
```

The driver verifies the core-1 leaf probe, cold builds, host hashes and physical preview. Its final section restores the original application and queries the native worlds. The final `study.json` should include 20 rows, 80 cycle pairs, the two decoded preview comparisons, and `verified_factory_restore: true`. For an already saved capture, add `--analyze /path/to/first-boot.log` to recheck the measures without interacting with the board. The two positional device arguments are unused in offline mode.

## Results to read alongside the code

The [supervisor report](../analysis/01-how-a-handheld-compiler-spends-time-and-memory.md) includes the worked example, physical results, attribution and decisions. The independent [examiner guide](../reference/examiner-guide.md) and [review](../reference/examiner-review.md) describe how to check the semantic, byte-equality and measurement claims. The [primary P4 receipt](../various/p4-first-boot.json) preserves the four clean blocks, the two marked pairs and all 80 native leaf timing pairs.

## Reading the two boots

The control and candidates were physically rebuilt in fresh QuickJS runtimes on two boots of the same firmware. The first and second runs gave 6.06% and 5.07% paired median cold-time savings for direct output. Compact saved 3.17% and 2.48%. Fusion saved 1.33% and 0.12%. The roughly 14% physical long-name comparison gain from fusion repeated. Use the two separate receipts when interpreting the variability. [First boot](../various/p4-first-boot.json) · [Replication](../various/p4-replicate.json)
