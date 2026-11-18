---
Title: What the CJI workspace brings to PicoCalc
Ticket: PICOCALC-CJI
Status: active
Topics:
    - picocalc
    - esp32-p4
    - native
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/port/esp32p4/optional/native_elf/native_elf_p4.c
      Note: Hardware loader
    - Path: repo://picocalc-os/port/esp32p4/partitions.csv
      Note: Firmware capacity
    - Path: repo://picocalc-os/sdk/nw.h
      Note: World events and system calls
    - Path: repo://picocalc-os/sdk/nw_elf.h
      Note: Module ABI
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-17T19:41:42.35262638-05:00
WhatFor: ""
WhenToUse: ""
---

# What the CJI workspace brings to PicoCalc

CJI is the compiler developed in *Compiling JavaScript, Incrementally*. The archive contains a standalone compiler repository with Git history (main at 908c42bae94e1cfaa7b55a03b51c3750604bc3a8), a book manuscript including chapters 11–35, a C runtime, the SLJIT-based assembler, executable test cases and engineering records. Its README describes an earlier point in the book. Chapters 24, 30 and 35 explain the PicoCalc work.

## One world, from source to the kernel

PicoCalc normally gives a JavaScript world its own QuickJS runtime. CJI takes a supported subset of that same source language, lowers it through intermediate representations to SLIR, then assembles machine code. The compiled world's runtime translates operations such as publishing, requesting a timer and replying to a message into native-world calls. The nucleus still owns scheduling, capabilities and message delivery. This lets an individual compiled app or driver coexist with interpreted worlds.

On Linux the compiled world runs as a native child process. On P4 the intended artifact is an RV32 ELF shared object. The board loader and module exchange function tables through app_main. The CJI design puts the common runtime and glue in firmware, so emitting a world does not require compiling C for each app. Matching the module format alone is insufficient for deployment because the firmware must also supply the runtime exports the module references.

## What the archive demonstrates

| Evidence inside the ZIP | Reported outcome |
| --- | --- |
| book/chapters/ch24.md | Six compiled worlds ran inside the Linux PicoCalc simulator, including snake and the keyboard and power drivers. Of 72 screenshots, 61 matched QuickJS byte for byte. The chapter attributes the remaining differences to clock accounting and crash text. |
| book/cji/ttmp/CJI-4-worlds-on-the-board/various/gates-t13.txt | Four worlds ran together against an emulated RV32 kernel interface. A memory-exhaustion fixture crashed its own world while the others continued. |
| book/chapters/ch35.md | A self-hosted compiler running in emulated firmware compiled flaky, snake, toplog, topstate and about. The harness compared intermediate code, module bytes and kernel calls with the host results. |

## What it would take on this device

Host-side compilation and compilation on the handheld are separate milestones. The first needs the CJI runtime linked into a compatible P4 firmware and a compiled module exercised through the project's optional native ELF loader on hardware. The second also needs space for the compiler and working memory for compilation. Chapter 35 reports 4.19 MB of compiler code and about 8.5 MB peak live allocation during a compile. The checked-in P4 partition table gives the entire factory application 4 MiB. The archive leaves compiler placement open. Its instruction counts come from RV32 emulation, so elapsed compile time and memory headroom alongside the live OS still require device measurements.

The evidence supports a selective ahead-of-time compilation path for PicoCalc and a more ambitious on-device toolchain prototype. Neither full JavaScript compatibility nor a speedup on the physical handheld is established by the example worlds. This analysis inspected source, chapter results and saved logs. No compiler gates or hardware runs were repeated.
