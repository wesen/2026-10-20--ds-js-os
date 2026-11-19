---
Title: Review evidence and reproduction for the independent compiler examination
Ticket: PICOCALC-COMPILER-THESIS
DocType: reference
Status: active
Topics: [picocalc, compilers, qualification]
---

# Examiner notes

## Decisions and their evidentiary scope

| Decision | Independent observation | Remaining scope |
|---|---|---|
| Retain the register lowering for the current typed frontend. | Native guest callees that destroy all argument and temporary registers preserved complete result streams across the 9×9 arity/depth matrix. | The driver handles import relocations directly. The authors exercise the production slot linker in their linked replays. Board timings and peak RAM are separate. |
| Keep the bounds work in research. | 760 additional cases preserved scalar results, trap messages, and complete post-execution memory. The event limit restored original bytes on a large function. | Correctness of metadata transfer for every possible source program remains a reasoning obligation. The event count excludes storage for the emitted trace. |
| Broader retention of scalar facts has insufficient evidence for inclusion. | The matched positive control changed, but the exact three corpus sites stayed fixed. More edges were inspected in Files and Editor. | Measurements cover 161 functions across three inputs. No independently profiled dynamic distribution or board cost estimate was obtained. |

## Review map

- In `picocalc-os/compiler/typed-rv32.js`, follow `pop`, `push`, `call`, and `end`. List all occupied depths immediately before and after a call with six live values. Review the remaining shared scratch registers separately from the canonical homes.
- In `scripts/bounds/emitter.mjs`, distinguish the metadata describing a member load from the code slice implementing the check. For a write, check when the compiler evaluates the index and when it evaluates the value.
- In `scripts/bounds/proof.mjs`, track the lowered guard through `condition`, `visit`, and `query`. For the effect variant, check both the instantaneous barrier and the backedge mutation summary. `changed` is a control for accidentally keeping a relation mentioning a reassigned scalar.

## Reproduction

Run in the repository root. The register script reads both pinned source snapshots from Git, cross-links temporary executable files and runs the emulator. The other scripts use the working tree's original emitter and the ticket research sources. The receipts identify source and tool digests. For shell glob arrays the commands below use Bash.

```bash
tickets=(ttmp/2026/11/19/PICOCALC-COMPILER-THESIS--*)
ticket=${tickets[0]}
gcc=/home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/riscv32-esp-elf/bin/riscv32-esp-elf-gcc
emulators=(ttmp/2026/11/17/PICOCALC-CJI--*/sources/cji/build/rv32/rv32emu)
node "$ticket/scripts/examiner/bounds.mjs"
node "$ticket/scripts/examiner/scalar-facts.mjs"
node "$ticket/scripts/examiner/registers.mjs" "$gcc" "${emulators[0]}"
```

`various/examiner/registers.json` provides a digest of 405 ordered output pairs from each ELF and the oracle. `various/examiner/bounds.json` records trap counts and the function fallback. `various/examiner/scalar-facts.json` gives expanded-source site IDs as function, line and source position, distinguishing two checks on the same line in Files. Site counts and inspected-edge counts describe different quantities. Both tests for `filesCompare` occupy expanded source line 37.

## Article review before revision

**Comprehension gaps.** The call example lists six saved operands but the reader has to infer what happens to the 14 produced for the outer call while evaluating its second argument. Add how many values survive the nested call. Define why a final ordered digest is supplementary to the return value and its finite width. The bounds result table's short labels obscure which control preserved the runtime reload. Name the two controls according to the order in the code.

**Technical checks.** Pin the decimal example to output read directly from the Wasm reference and verified on both ELFs. The hand calculation gave the pair `[-1900357695,-1244347106]` for depth six, arity two, inputs 3 and -5. The hardware evidence remains separate. A second run should reproduce the deterministic receipts. Distinguish the Wasm oracle's measured number of imported calls from the two emulators' matched outputs; no separate native call counter is present. Clarify the numerical result of the independent synthetic image comparison as 25.0% rounded.

**Source anchors.** The RISC-V ABI integer register table supports which registers the guest is free to overwrite. The WebAssembly execution semantics explain the difference between a current invocation's locals and linear memory stores. The single-page W3C spec exceeded the web tool's fetch limit. The primary WebAssembly instruction chapter provided the corresponding directly readable source.
