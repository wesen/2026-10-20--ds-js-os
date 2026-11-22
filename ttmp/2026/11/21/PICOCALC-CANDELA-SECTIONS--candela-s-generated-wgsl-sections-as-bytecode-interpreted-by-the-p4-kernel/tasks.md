# Tasks

## TODO
- [x] Design doc: the seam, the WGSL subset, translator, bytecode v1, verifier, interpreter and C interface <!-- t:f119 -->
- [x] Export every preset's sections (01-export-sections.mjs, 105/105) <!-- t:vz6f -->
- [x] Translator in QuickJS-compatible JS; 105/105 presets translate, no failure by construct <!-- t:2za5 -->
- [x] Bytecode v1, generated ISA header, C verifier and interpreter <!-- t:rn0s -->
- [x] Per-evaluation agreement over all 105 presets against the prototype C++ translation <!-- t:0igt -->
- [x] Verifier rejection and mutation tests under ASan/UBSan <!-- t:ctsm -->
- [x] Node, 64-bit and 32-bit QuickJS produce identical bytes for all 105 presets <!-- t:of0s -->
- [x] 64 spp frames of B-01, R-01, F-01, W-02: luminance and pixels compared <!-- t:r46j -->
- [x] RV32 instructions per sample, compiled against interpreted, path-traced and SDF presets separately <!-- t:jx0s -->
- [x] Side effects and evaluation order per CPU-KERNEL's manifest; order test and census <!-- t:snxa -->
- [x] CPU-KERNEL Sections adapter; per-pixel digests against the kernel's host build (20 presets x 2 arms) <!-- t:z42l -->
- [x] RV32 counts inside CPU-KERNEL's kernel, with and without -ffp-contract=off <!-- t:xt0v -->
- [x] Interpreter dispatch and copy optimizations measured <!-- t:agl9 -->
- [x] Investigation diary steps 1-11 <!-- t:70dw -->
- [x] Vault report <!-- t:rhua -->
- [ ] FIRST-LIGHT: build vm/ and ck/cdl_vm_sections.cpp into the firmware; time a board run <!-- t:7x0o -->
- [ ] Prepared (direct-threaded, pre-scaled) code form if SDF scenes need it <!-- t:41t9 -->
- [ ] Device-side translation time on the P4 (QuickJS); cache bytecode by WGSL hash <!-- t:ybkb -->
