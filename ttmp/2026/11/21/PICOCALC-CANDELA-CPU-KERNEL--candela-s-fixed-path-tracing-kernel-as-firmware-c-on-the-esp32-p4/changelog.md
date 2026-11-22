# Changelog

## 2026-11-21

- Initial workspace created

## 2026-11-22

Device acceptance complete. B-01 6,832 cycles per sample with every CPU substitution (14,976 with WGSL semantics); CPI 1.28-1.72; fdiv.s/fsqrt.s 19 cycles; 64 spp device frames equal to the host build's to floating-point rounding after translation rule 5 (WGSL's left-to-right evaluation of calls with side effects); layout noise about 2% between images.

### Related Files

- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a8febfba2a530536c/ttmp/2026/11/21/PICOCALC-CANDELA-CPU-KERNEL--candela-s-fixed-path-tracing-kernel-as-firmware-c-on-the-esp32-p4/analysis/01-what-candela-s-fixed-kernel-costs-on-the-esp32-p4-measured.md — Device results
- /home/manuel/code/wesen/2026-10-20--ds-js-os/.claude/worktrees/agent-a8febfba2a530536c/ttmp/2026/11/21/PICOCALC-CANDELA-CPU-KERNEL--candela-s-fixed-path-tracing-kernel-as-firmware-c-on-the-esp32-p4/scripts/lib/wgsl2c.mjs — Rule 5, evaluation order
