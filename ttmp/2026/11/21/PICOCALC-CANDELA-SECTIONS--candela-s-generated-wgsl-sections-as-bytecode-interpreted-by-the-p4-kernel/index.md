---
Title: Candela's generated WGSL sections as bytecode interpreted by the P4 kernel
Ticket: PICOCALC-CANDELA-SECTIONS
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - compiler
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/03-agree.py
      Note: Per-evaluation agreement against the prototype translation
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/08-kernel-digest.py
      Note: Per-pixel digests and RV32 counts inside CPU-KERNEL's kernel
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/ck/cdl_vm_sections.cpp
      Note: The bytecode as a CPU-KERNEL Sections table, layout asserts, math exports
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/translator/index.js
      Note: Translator entry points (translateSections, translateProgram); Program.hasEffects
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/translator/isa.js
      Note: The single opcode table, kernel functions with section-API and side-effect flags
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/translator/lower.js
      Note: 'Lowering: types, inlining, folding, CSE, retargeting, CHOOSE/LOBE/SWITCH'
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/vm/cdl_vm.c
      Note: Verifier and interpreter (C99, label-table dispatch)
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/scripts/vm/cdl_vm.h
      Note: The C interface for FIRST-LIGHT
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/various/08-kernel-digests-host.jsonl
      Note: 40 pixel-identical renderings
    - Path: repo://ttmp/2026/11/21/PICOCALC-CANDELA-SECTIONS--candela-s-generated-wgsl-sections-as-bytecode-interpreted-by-the-p4-kernel/various/11-cost-kernel.txt
      Note: RV32 instructions per sample in the firmware kernel
ExternalSources: []
Summary: An on-device JavaScript translator from Candela's per-scene WGSL sections to a verified register bytecode, a C verifier and interpreter behind the kernel's five dispatch functions, and the CPU-KERNEL adapter; bit-exact over all 105 presets and pixel-identical inside the firmware kernel, with measured RV32 cost.
LastUpdated: 2026-11-22T02:30:00-05:00
WhatFor: Entry point to the section translator, bytecode, verifier, interpreter, kernel adapter and their evidence
WhenToUse: Before wiring scene code into the firmware kernel (PICOCALC-CANDELA-FIRST-LIGHT) or changing the translator or bytecode
---

# Candela's generated WGSL sections as bytecode interpreted by the P4 kernel

## Overview

Gives the firmware kernel each scene's materials and fields without compiling native code on the device. Parent design: PICOCALC-CANDELA-P4.

- Design and results: `design-doc/01-design-stub.md` (Sections 1-12 the design, Section 13 the measured results, Section 12 what FIRST-LIGHT needs)
- Investigation diary: `reference/01-investigation-diary.md` (Steps 1-11)
- Evidence: `various/` (translation summary, 4 spp agreement, verifier test, QuickJS engines, luminance, RV32 counts, kernel digests, order test, effects census, cost tables and figures)
- Code: `scripts/translator/` (translator), `scripts/vm/` (C interface, verifier, interpreter), `scripts/ck/` (CPU-KERNEL `Sections` adapter), `scripts/harness/`, numbered drivers `scripts/01-*` to `scripts/12-*`
- Parent ticket: `ttmp/2026/11/21/PICOCALC-CANDELA-P4--run-a-subset-of-candela-on-the-esp32-p4/`; kernel ticket: `ttmp/2026/11/21/PICOCALC-CANDELA-CPU-KERNEL--candela-s-fixed-path-tracing-kernel-as-firmware-c-on-the-esp32-p4/`
- Vault report: `Projects/2026/11/22/PROJECT REPORT - PicoCalc Candela - Scene Code as Verified Bytecode in the Fixed Kernel - A Technical Deep Dive.md` in go-go-parc

Status: implemented and measured on the host.
- 105/105 presets translate, with identical bytes in Node and QuickJS.
- Per-evaluation agreement over all presets: 2 of 2,016,847 material evaluations differ in the last bit; every field evaluation is bit-identical.
- Inside CPU-KERNEL's kernel, 40 of 40 renderings are pixel-identical.
- RV32 cost in the firmware kernel: path-traced presets +2.9-7.8% instructions per sample, SDF presets x1.55-2.81.
- Not yet done: a device run, which belongs to FIRST-LIGHT.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- picocalc
- esp32-p4
- rendering
- compiler

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
