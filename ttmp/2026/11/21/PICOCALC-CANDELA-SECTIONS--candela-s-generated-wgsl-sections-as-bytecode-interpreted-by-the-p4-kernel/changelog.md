# Changelog

## 2026-11-21

- Initial workspace created

## 2026-11-22 - Translator, bytecode v1, verifier, interpreter, CPU-KERNEL adapter, agreement and cost

Translator (105/105 presets, identical bytes in Node and QuickJS), bytecode v1 with a C verifier and interpreter, side-effect ordering per CPU-KERNEL's manifest, and the Sections adapter. Agreement: per evaluation bit-exact over all presets except 2 last-bit material evaluations; 64 spp frames identical; 40/40 kernel renderings pixel-identical; RV32 digests equal without contraction. Cost in the firmware kernel: path-traced +2.9-7.8%, E-02 +29.6%, SDF x1.55-2.81 (commits 4065078, 1e1d89f, b6d771a and the final commit).

### Related Files

- repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/design-doc/01-design-stub.md — design and results
- repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/reference/01-investigation-diary.md — steps 1-11

## 2026-11-22 - Vault report pushed

PROJECT REPORT - PicoCalc Candela - Scene Code as Verified Bytecode in the Fixed Kernel - A Technical Deep Dive, with two figures, committed alone in go-go-parc as 861fda5 and pushed (acdfcaf..861fda5).
