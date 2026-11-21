---
Title: Qualifying a guarded ray row and positive divisors
Ticket: PICOCALC-TYPED-RAY
Status: complete
Topics: [picocalc, compiler, performance]
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "An intern guide to building and auditing the opt-in compiler variants."
LastUpdated: 2026-11-21
WhatFor: Compare source-equivalent ray-tracing code generators.
WhenToUse: Reproducing the compiler portion of the complete-frame study.
---

# Qualifying a guarded ray row and positive divisors

Start at the ordinary `typedRayFrame` export in `picocalc-os/worlds/raytrace/raytrace.typed`. It computes a 160×160 RGB565 frame after validating the viewport and poses. The six-argument display entry takes pixel and scratch buffers and four pose coordinates. The audit entry `typedRayRender` additionally accepts two 25,600-cell output buffers for depths and IDs. A zero stride in scratch cell zero selects width 160. All measurements in this lane use the 10,438-byte frozen source at SHA-256 `b0a7c02bbb8646a2b17c669c7c42fcb5d76ae4d666fe90f988ea2bb97f143e0f`.

## Reproduce the experiments

Use the repository root as the working directory. The scripts rely on Node, Python, the host C interpreter built by the CJI project, and the vendor ESP RISC-V toolchain with the xesppie extension. Avoid substituting a generic RISC-V assembler when evaluating the packet. The temporary JavaScript compilers have the stock `typedRv32.compile` interface and are self-contained.

```sh
ticket=ttmp/2026/11/20/PICOCALC-TYPED-RAY--compare-complete-typed-and-c-ray-tracers-on-the-picocalc
scripts=$ticket/scripts/compiler
sourcefile=picocalc-os/worlds/raytrace/raytrace.typed
prefix=/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf
out=$(mktemp -d)
make -C cji build/rv32/rv32emu
node "$scripts/positive-divisors.mjs" picocalc-os/compiler/typed-rv32.js "$out/div.js"
node "$scripts/edge-cases.mjs" "$out/edges.json"
python3 "$scripts/full-frame.py" "$sourcefile" "$prefix-gcc" cji/build/rv32/rv32emu "$out/scalar.json"
for arm in explicit inferred matched
do
    node "$scripts/make-row.mjs" "$prefix" "$sourcefile" "$arm" "$out/$arm.js"
done
node "$scripts/make-row.mjs" "$prefix" "$sourcefile" explicit "$out/spelled.js" rayRowS16x8Intrinsic
node "$scripts/qualify-row.mjs" "$prefix" "$sourcefile" "$out/explicit.js" "$out/inferred.js" "$out/matched.js" "$out/rows.json" "$out/spelled.js"
node "$scripts/packed-frames.mjs" "$prefix" "$sourcefile" "$out/explicit.js" "$out/matched.js" "$out/frames.json"
node "$scripts/lane-domain.mjs" "$out/domain.json"
node "$scripts/apply-cost.mjs" "$sourcefile" "$out/div.js" "$out/explicit.js" "$out/inferred.js" "$out/matched.js" "$out/cold.json"
```

The two complete-frame runners check full Wasm buffers. Stock and positive-divisor RV32 run as closed ELF images in the C emulator, which attributes retired instructions to function symbols. For the PIE and matched programs the other runner uses the independent register-level model from PICOCALC-TYPED-PIE. Vendor disassembly supplies the packet opcodes and register operands. The model increases its guest memory to 256 KiB to fit three output planes. The scalar and packed image generators also require streaming and buffered compilation to agree byte for byte.

## Review the lowering one obligation at a time

1. `positive-divisors.mjs` looks ahead one numeric IR opcode. `T6` is outside the operand stack homes. `pop(T5)` preserves a spilled dividend. Accept only a positive i32 divisor immediately preceding a division or remainder. An earlier expression retains its evaluation and traps.
2. `make-row.mjs` freezes the opcode template by SHA-256 at generation. At application time the compiler verifies full numeric IR equality, signature and local count. The name adds an explicit opt-in when requested. A renamed clone is acceptable to the inference arm. One altered constant must keep the ordinary body untouched.
3. `guarded-row.S` starts with preflight. Capacity must reach cell 1864 inclusive, there can be at most three objects, each center's y is at most 159, its radius at most 32 and unsigned y at most 159. All geometry reads during preflight are inside the required capacity. Transfer to fallback before the first output store to preserve partial writes in short buffers. The row kernel only reads the square table, root table and object descriptors. Its disjoint outputs occupy cells 1545–1704 and 1705–1864.
4. Effective vector addresses must be aligned for the 128-bit load/store, independently of buffer header alignment. Leading and trailing single cells use the same acceptance test as the packet body. Depth compares remain signed i32. Stored payloads retain the low halfword exactly as Typed does. Active objects are processed in original order to preserve the tie rule.
5. The matched template uses the same guards, clear loop, skips, packet peel, group/tail organization and stack spill area. Only its lane computation changes. It expands an eight-cell subtraction and stores its temporary results with scalar RV32 instructions. A better general scalar compiler might choose a different schedule. This controlled comparison evaluates the chosen pair.

For complete numeric evidence, inspect [per-function retirement](../various/compiler/full-frame.json), [the row matrix](../various/compiler/rows.json), [complete packed frames](../various/compiler/packed-frames.json) and [width enumeration](../various/compiler/lane-domain.json). The native board lane separately owns firmware loading, code placement, cold compilation and execution timing.

## Recalculate the physical comparison

After the independent device operator closes a trial, run `python3 "$scripts/physical-ablation.py" RUN/rows.json RUN/loads.json "$out/physical.json"`. The input contains nine programs, of which this lane compares 0 (stock), 1 (divisor), 4 (explicit), 5 (inferred) and 8 (matched). The script requires twelve fixtures, three repetitions, matching scene inputs, stride, three diagnostic checksums and plausible cycle-to-time ratios. For each key compare the time spent in the Typed arm for the same operation. Program loads occur at different times within rotated repetition blocks. Neither the 36 observations nor their min/max intervals constitute independent boards or confidence intervals. [Final paired evidence](../various/compiler/physical-ablation.json)
