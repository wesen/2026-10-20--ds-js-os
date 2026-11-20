---
Title: Combining predicate fusion and compact instruction output
Ticket: PICOCALC-RV32-COMBINED
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
Summary: Semantics, artifact identity and physical protocol for the combined streamed compiler trial.
LastUpdated: 2026-11-19T20:00:41.531534815-05:00
WhatFor: ""
WhenToUse: ""
---

# Combining predicate fusion and compact instruction output


## The decision

Can the streamed native compiler adopt both branch fusion and compact instruction storage, under the same time and memory limits as the shipping compiler? The individual experiments showed that fusion produces smaller applications and compact storage speeds Editor compilation. One cannot add those effects to obtain a combined result. With fewer instructions, compact has fewer words to allocate and serialize. This trial measures that interaction across the three native applications and tests the ordinary C-to-JavaScript integration boundary.

## What crosses each boundary

The firmware reads each typed application and its prebuilt reactor, a native runtime with a reserved executable slot. QuickJS executes the compiler. Its frontend type-checks one function at a time and hands its checked operations to the RV32 backend. The backend translates those operations, records offsets that depend on layout, and returns machine bytes and metadata. The app’s ordinary linker validates the interface, copies the reactor and writes the generated program into it. The returned ELF is the native loader’s input.

```text
typed source -> checked function -> instruction selection -> word storage
                                       |                      |
                                  stack predicate         JS arrays
                                  or fused branch         or 4 KiB slabs
                                       +----------+-----------+
                                                  |
                                     patch jumps and imports
                                                  |
                                      raw image -> linked ELF
```

**Fusion** changes the program the CPU executes. In an adjacent comparison and conditional, it can branch on the two original operands. The lowerer omits the Boolean temporary while preserving operand order, signedness and the long-jump fallback. A comparison used as a value still produces a Boolean.

**Compact output** changes how QuickJS holds the words. It appends to 1,024-word typed-array chunks. A branch or frame fixup addresses an instruction by its absolute word index. Raw assembly still produces a contiguous byte image for the existing linker. In the combined backend the fused instruction sequence changes subsequent positions; the compact backend must use those new positions consistently.

## The four configurations

| Name | Branch selection | Word storage | Required comparison |
| --- | --- | --- | --- |
| base | Production | Per-function JS arrays | Frozen control |
| branch | Fused | Per-function JS arrays | Behavior matches base |
| compact | Production | Typed chunks | Every ELF byte matches base |
| both | Fused | Typed chunks | Every ELF byte matches branch |

The source combination uses the original branch patch and the original compact transformation, in that order, against the same frozen backend. Verify the independent control source digests before running. Check full ELF bytes for Files, Agenda and Editor, raw output metadata and decoded guest behavior. Compiler source hashes, input digests and firmware identity belong in the receipt.

## Physical trial

Keep streaming on for every configuration. Use production app wrappers and limits. Embed only the additional backend scripts in a scratch firmware. The trial selector chooses the backend script evaluated by the normal `p4_typed_compile` entry, while the frontend, app linker, runtime creation, timer and allocator keep their production behavior. The benchmark calls the production Files compile and Editor compile functions and exposes a ticket-only wrapper for Agenda’s internal bundled-source compile.

```text
for each of two boots of one experimental firmware:
    for each balanced block:
        for each of the four backends in the block order:
            for each of Files, Agenda and Editor:
                call ordinary application compiler with a fresh QuickJS runtime
                record reported elapsed microseconds and live QuickJS peak
                check full ELF digest after timing
    select the combined backend for normal application loading
run the 64 KiB Editor replay and compare both captured frames
restore the saved factory application and check all three native worlds
```

For each application and block, calculate `both − branch − compact + base` separately for time and peak bytes. With this sign convention a positive number means the combined cost is higher than an additive estimate. Also report the practical comparison `both − base`. Summarize each boot independently. Compare small differences with block variability. Peak allocation is a maximum over the whole compile, so interacting lifetimes can prevent two local savings from adding up even when both changes work correctly.

## Reading the implementation

- `picocalc-os/compiler/typed-rv32.js` defines `FunctionCode.branch`, `compile` and `linkSlot`. Trace a predicate, an internal jump, and an imported call.
- `picocalc-os/port/esp32p4/main/typed_p4.c` owns the fresh QuickJS runtime, allocator, timer and returned module. Its reported peak excludes the caller’s C buffers.
- `files_p4.c`, `agenda_p4.c` and `editor_p4.c` in that directory select the source, reactor, compiler entry and budget used on the machine. Agenda concatenates reminder and entry sources with a newline.
- The branch and output tickets contain the original design, validation and adverse cases. `scripts/` in this ticket contains only the joint trial and reproduction procedure.

A candidate for production review must preserve its two artifact equivalences, execute the expected application behaviors, and fit each existing app budget. Record device results separately for all applications, including regressions on a smaller program.

## Reproduction

Use a new scratch directory and run from the project root. The explicit device backup and final restore operate on the factory application. The fresh ELF reactor inputs and packaged JS bundles come from the isolated IDF build. The esptool path in this example uses the installed IDF 5.4 environment.

```bash
day=ttmp/2026/11/19
ticket=$(find "$day" -maxdepth 1 -name 'PICOCALC-RV32-COMBINED--*')
previous=$(find "$day" -maxdepth 1 -name 'PICOCALC-COMPILER-THESIS--*')
scratch=$(mktemp -d /tmp/p4-combined.XXXXXXXX)
port=/dev/serial/by-id/usb-1a86_USB_Single_Serial_5B61091051-if00
flasher=/home/manuel/.espressif/python_env/idf5.4_py3.13_env/bin/esptool.py
bash "$previous/scripts/supervisor/p4-backup.sh" "$port" "$scratch/original" "$flasher"
bash "$ticket/scripts/03-build.sh" "$scratch" /home/manuel/esp/esp-idf-5.4.2/export.sh
bash "$ticket/scripts/04-host.sh" "$scratch" "$rv32_gcc" "$rv32_emulator"
python3 -B "$ticket/scripts/07-boundaries.py" "$scratch"
node "$ticket/scripts/05-oracle.mjs" "$scratch"
python3 -B "$ticket/scripts/06-board.py" "$scratch" "$port" "$flasher"
python3 -B "$ticket/scripts/08-summarize.py" "$scratch/physical.json"
```

Set `rv32_gcc` to the ESP GCC 14.2.0 (20260121) RISC-V binary, and `rv32_emulator` to the imported CJI `sources/cji/build/rv32/rv32emu` executable. The host workflow driver uses its neighboring support objects. The board receipt records each app, configuration, order, elapsed time, peak, returned length and SHA-256, along with the two native-world checks and restore outcome.

## Integration outcome

The joint trial passed the byte, metadata, diagnostics and behavior checks. Every one of the 96 measured builds succeeded with its existing app budget. Across two P4 boots the combined compiler saved 88–95 ms for Editor, 5–18 ms for Agenda and 3–5 ms for Files at the within-block medians. Editor’s peak fell by approximately 2.8 KB. Agenda and Files used about 18.5 KB and 19.3 KB more peak QuickJS memory respectively.

The [project report](../analysis/01-what-happens-when-two-native-compiler-optimizations-share-the-same-output.md) works through the interaction and recommended integration decision. The storage equivalence means the combined compiler returns the same native executable as fusion alone for these inputs. For a memory-first production decision, distinguish maximum peak over the entire catalog from the peak of each application. Those objectives lead to different tradeoffs.
