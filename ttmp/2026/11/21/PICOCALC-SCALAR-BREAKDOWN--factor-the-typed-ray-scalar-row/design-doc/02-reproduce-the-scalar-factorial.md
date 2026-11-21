---
Title: Reproduce the scalar compiler factorial
Ticket: PICOCALC-SCALAR-BREAKDOWN
Status: complete
Topics: [picocalc, compiler, performance]
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Intern guide to application, inspection, counters and semantic qualification of the scalar factors."
LastUpdated: 2026-11-21
WhatFor: Understand and reproduce the scalar cost breakdown.
WhenToUse: Reviewing compiler transformations or designing a matched frame experiment.
---

# Reproduce the scalar compiler factorial

The experiment uses one unchanged 10,438-byte ray tracer. Both the native and Wasm compilers receive that source. Every candidate is a self-contained variant of the standard RV32 backend and uses the ordinary compiler API. The implementation lives under this ticket, separately from the default compiler. The device operator loads the corresponding five exact images using IDs 9–13 in the manifest.

## From source to the four comparable cells

Read `typedRayComputeRow` in the scalar renderer, then `FunctionCode.step` and `FunctionCode.lower` in the RV32 backend. Each complete frame calls the row function 160 times. At function emission, `make-backends.mjs` checks the signature, local count and all 318 numeric IR cells against the pinned template. Qualification performs a one-cell semantic mutation of the root-table offset and requires byte-identical ordinary code as the result.

Each admitted function body contains a common 25-word entry preflight, a fast copy and a complete 236-word stock fallback. The check-before-write ordering is essential. The physical factorial keeps two booleans independent in `row-pass.js`. The first removes three machine words from each of eleven checked addressing sites. The second places selected local homes in the six available volatile registers a2–a7, including direct borrowing by a binary consumer. The register policy consults a fixed map of six slots on this leaf function. There is no profiling cost or register allocator run while compiling the rest of the world. Even the fully checked/stack control goes through the common entry preflight. The separate default program measures that preflight's overhead.

The skip variant inserts an `if (row >= 0)` around numeric cells 166–303 of the original body. Its width and upper bound proof depends on the same admission check. Compare it only with the hoisted/register program. The earlier flattened hand-written matched scalar arm changes several other aspects of scheduling and address generation, so the remaining difference has a joint interpretation.

## Reproduction from the repository root

```sh
ticket=ttmp/2026/11/21/PICOCALC-SCALAR-BREAKDOWN--factor-the-typed-ray-scalar-row
scripts=$ticket/scripts/compiler
typed=picocalc-os/worlds/raytrace/raytrace.typed
out=$(mktemp -d)
gcc=/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf-gcc
git show b6cf97c:picocalc-os/compiler/typed-rv32.js > "$out/stock.js"
node "$scripts/make-backends.mjs" "$typed" "$out/stock.js" "$out/backend"
node "$scripts/qualify-rows.mjs" "$typed" "$out/backend" "$out/rows.json"
make -C cji build/rv32/rv32emu
python3 "$scripts/frames.py" "$typed" "$out/backend" "$gcc" cji/build/rv32/rv32emu "$out/frames.json"
node "$scripts/make-backends.mjs" "$typed" picocalc-os/compiler/typed-rv32.js "$out/inspect"
node "$scripts/inspect-receipt.mjs" "$typed" "$out/inspect" "$out/backend/manifest.json" "$out/inspection.json"
node picocalc-os/tools/typed-inspect.mjs "$typed" --target rv32 --function typedRayComputeRow --backend "$out/inspect/skip.js" --jsonl > "$out/skip.jsonl"
```

The trace ranges refer to final image bytes. The observer associates ordinary frontend IR cells with the new fast and retained fallback copies independently. Synthetic empty-row operations are anchored at original cells 166 and 304 with zero-length input spans, and are explicitly labelled. The unassociated byte ranges cover the entry preflight and ordinary prologues/epilogues. The host checks all bytes are covered in increasing order and the inspected image hashes match the independently compiled physical image manifests. The disassembly retains all eleven trap instructions in the fallback, even when the fast body has none. [Inspector receipt](../various/compiler/inspection.json)

For the held-out check, the starting evidence and prediction were committed at `9d43fba`. Replay it in this order to preserve the explanatory sequence.

```sh
node "$scripts/shadow-forecast.mjs" "$typed" "$out/forecast.json"
mkdir -p "$out/shadow"
node "$scripts/make-shadow.mjs" "$typed" "$out/stock.js" "$out/shadow/shadow.js"
printf '%s\n' '{"variants":{"shadow":{}}}' > "$out/shadow/manifest.json"
node "$scripts/shadow-edges.mjs" "$typed" "$out/shadow/shadow.js" "$out/shadow-edges.json"
python3 "$scripts/frames.py" "$typed" "$out/shadow" "$gcc" cji/build/rv32/rv32emu "$out/shadow-frames.json"
```

The scalar row profiler counts stack accesses by the actual instruction base register and checks by the branch-over-trap sequence. It counts horizontal work from real u16 loads whose effective addresses fall inside the three input tables. The full frame runner embeds unmodified machine image bytes in an ELF, preserves the original symbol order and uses the existing C emulator's profiler. The C reference independently renders both the complete diagnostic scene and each current portable phase. Each native process exports every checked payload and the wrapper verifies headers and canaries before returning.
