# Changelog

## 2026-11-21

- Initial workspace created

## 2026-11-21

Census and tiers of all 105 presets; Candela's own WGSL kernel translated to C++ and counted on RV32IMAFC (6,100-11,300 instructions per sample on ordinary presets); five numeric models on kernel fragments (f32 on the FPU wins); fast math, cycle model (B-01 28,500-41,000 samples/s per core, estimated) and entry-call counts; analysis and design docs; follow-up tickets PICOCALC-CANDELA-CPU-KERNEL, -SECTIONS, -WORLD, -FIRST-LIGHT and PICOCALC-TYPED-F32.

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/analysis/01-how-candela-turns-a-scene-program-into-pixels.md — Candela end to end with the measured cost model
- /home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/design-doc/01-a-candela-subset-for-the-esp32-p4.md — Decisions with evidence

## 2026-11-21

Folded the QuickJS study's final numbers into the design (B-01 build about 67-88 ms on the device once the GGX table is memoised); committed the study; published the vault report (go-go-parc bf2902a).
