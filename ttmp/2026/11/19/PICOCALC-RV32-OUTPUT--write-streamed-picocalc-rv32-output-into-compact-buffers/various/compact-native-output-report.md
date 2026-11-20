---
title: "Compact native output and peak allocation on the PicoCalc"
aliases: ["PicoCalc compiler compact output study"]
tags: [project-report, compiler, picocalc, performance, quickjs]
status: complete
type: project-report
created: 2026-11-19
repo: /home/manuel/code/wesen/2026-10-20--ds-js-os
ticket: PICOCALC-RV32-OUTPUT
---

# Compact native output and peak allocation on the PicoCalc

The typed compiler can build the Editor's native executable on the PicoCalc while it starts. This study changed where the compiler holds its emitted instructions and how it transfers them to the executable. The same source and reactor produced identical linked ELF files in three output modes. On PicoCalc, direct output cut the cold Editor compile by about 5–6% across the two board series. The allocator peak shifted to ELF linking and stayed close to 1.41 MB.

## The working set that survives function streaming

The compiler runs as JavaScript inside a dedicated QuickJS runtime. For each source function it produces numeric operations, then translates them to RV32 instructions. Production at revision `6426798` streams the operations. The native back end lowers a function as the frontend finishes parsing it, then releases the function's operation array. Each generated machine word survives until assembly at the end of native compilation. It lives in an ordinary JavaScript array owned by its function. The source string, prelinked reactor, compiler scripts, jump fixups and function declarations occupy the same runtime.

In the baseline, an instruction array contains values such as `0x00100073` for an RV32 breakpoint. It can also contain a zero waiting for a fixup. An internal `jal` instruction embeds a signed displacement relative to its own address. At a global word offset of 17, a jump to word 0 needs a displacement of −68 bytes. A fixup records the destination and the instruction to change. The baseline patches this instruction in its function array and then serializes all the words into an exact contiguous byte array. Calls that target SDK functions remain zero in this raw image. Their destination addresses depend on the reactor layout.

The reactor is an ELF executable built in advance with a reserved code slot and SDK routines. The linker validates the reactor, copies it to a second typed array, writes stubs that jump from each required entry to its generated address, copies the code image and replaces those remaining SDK placeholders. The Editor's raw machine code occupies 87,544 B. Its complete linked ELF occupies 240,452 B because the reactor includes SDK code and spare slot capacity. The incoming reactor bytes and outgoing ELF coexist in QuickJS during linking. The firmware C caller also owns the bytes from which it makes the JS reactor copy and copies the final result out to a C buffer. Those two C buffers belong to the native allocator outside the custom QuickJS accounting.

```text
source functions → numeric operations → native code + fixups
                                            ↓
                          baseline and compact: raw byte image
                                            ↓
reactor in C → reactor in JS → copy reactor, write code and SDK jumps
                                            ↓
                                  linked ELF in JS → ELF in C
```

## Change the storage and hold the executable constant

The compact and direct variants write 32-bit words into shared 4,096-byte slabs, one slab per 1,024 words. One monotonically increasing word cursor gives the starting address of each function and the place a patch belongs. The output store can write the last slot of one slab and the first slot of the next without allocating a bigger copy of the existing buffer. A little-endian byte view over each slab provides fast copies on both measured machines. The explicit serialization fallback writes each word in little-endian order.

An absolute word position also simplifies fixup math. The same subtraction computes the displacement for a branch within the current function or a call to a previous one. An import retains its separate index into the reactor's trampoline table. The original assembly traversal still applies the checks, so a bad late source declaration takes precedence over an out-of-range machine jump. A program of 23,500 division assignments generated an out-of-range backward call. Adding a bad return afterward still produced the frontend error. Removing it restored the jump error. Together these cases test when the compiler makes the error visible.

Compact copies the initialized bytes of the slabs into a contiguous raw image so the existing slot linker can consume it. Direct supplies the slabs to the slot linker after the same world ABI validation and writes them straight into the final ELF. Both versions support the byte-array raw API and both preserve the reactor input. Files, Agenda and Editor matched the baseline in raw machine bytes, records, signatures, entries and relocation arrays. A byte-level oracle checked every one of the Editor's 145 SDK call displacements and its two entry stubs. It also exercised an exact-fit slot, a slot one word too short, buffered and streamed input, and a reactor view with a nonzero offset. Vendored QuickJS produced the same full ELF according to the clean host runs, separating implementation identity from any one test engine. [Source ticket and identity receipt](/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-RV32-OUTPUT--write-streamed-picocalc-rv32-output-into-compact-buffers/various/identity.json)

## The maximum can move

A cold host process created a fresh runtime, loaded the compiler, copied the source and reactor into JS, compiled and returned the ELF to C. All three variants used the production C entry and the same compiled reactor bytes per world. Six blocks gave each lane an equal number of positions in the schedule. These median times and the allocator high water are observations of Linux with the vendored engine.

| App | Baseline time / peak | Compact time / peak | Direct time / peak |
| --- | ---: | ---: | ---: |
| Files | 6.405 ms / 422,152 B | 6.416 ms / 423,464 B | 6.464 ms / 424,616 B |
| Agenda | 18.400 ms / 715,808 B | 18.371 ms / 674,216 B | 18.321 ms / 674,672 B |
| Editor | 69.486 ms / 1,920,216 B | 66.650 ms / 1,632,152 B | 66.949 ms / 1,651,264 B |

A second set of processes installed synchronous phase markers. The C callback records time and current allocation between markers and updates a maximum on each allocator event. Frontend and lowering repeat once per emitted function. Assembly includes the internal jump patches and any raw-image copy. Link output includes the allocation of the final ELF, writing its machine words and patching its remaining SDK calls. The surrounding C stages account for loading scripts, preparing arguments, extracting the result and destroying the runtime. The clean and profiled configurations use separate runs because the callback itself changes runtime behavior.

| Editor phase on Linux | Baseline peak | Compact peak | Direct peak |
| --- | ---: | ---: | ---: |
| Frontend | 1,805,056 B | 1,461,048 B | 1,465,360 B |
| Lowering | 1,818,888 B | 1,474,880 B | 1,479,192 B |
| Assembly | **1,919,200 B** | 1,571,088 B | 1,487,904 B |
| Slot output | 1,635,504 B | **1,632,536 B** | **1,655,704 B** |

The direct variant lowers assembly further but its slabs remain live during ELF linking. The initialized 87,544 code bytes occupy 22 slabs totaling 90,112 B of payload. Each slab needs its own buffer and typed-array objects. Compact has one exact-size raw image and can release the slabs earlier. The two variants also differ in the JS compiler code QuickJS had to load, so the phase measurements describe the sum of effects. At linker output entry, direct had 23,168 B more live than compact. Its clean full-compilation peak was 19,112 B higher.

Phase timing varied on the shared host. The Editor assembly medians in the separate profile were 2.095, 0.633 and 0.589 ms in baseline, compact and direct. Slot output was about 0.12 ms in all three modes. The host clean total time estimates are separate from these profile measurements. Optimizing assembly can be observable even when file loading, parsing and lowering dominate the end-to-end timer.

## On the P4, the earlier peak falls and the linker still needs its buffers

A firmware image contained all the output modes and a separate branch-lowering lane. Within one boot, four blocks placed each clean mode in each schedule position exactly once. Every sample created a fresh QuickJS runtime and compiled the same bundled Editor. The timer included runtime setup and handoff. The three output lanes produced the same 240,452-byte ELF as the full host comparison.

| Editor on PicoCalc, first series | Median time | Median allocator peak | Median within-block time saved |
| --- | ---: | ---: | ---: |
| Baseline | 2,483.993 ms | 1,410,878 B | — |
| Compact | 2,392.127 ms | 1,403,150 B | 78.949 ms |
| Direct | 2,335.968 ms | 1,414,092 B | 150.658 ms |

The output changes won all four matched time comparisons. Comparing lane medians gives a 3.7% reduction for compact and a 6.0% reduction for direct. The latter's peak was 3,214 B higher. The compact path's peak was only 7,728 B lower. On the P4, the whole compile had about the same allocator ceiling in all three modes. [Balanced device observations](/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-first-boot.json)

A second boot repeated the experiment. Its lane medians were 2,463.365 ms, 2,397.349 ms and 2,330.993 ms. Compact saved 60.978 ms and direct saved 124.544 ms at the paired medians, with faster time in all four blocks for each. The peak bytes repeated to within six bytes per lane, and the two additional phase profiles per configuration located the maxima in the same phases. [Replicated observations](/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-replicate.json)

The two baseline and two direct profiles in that firmware supplied the reason. On the P4, assembly peaked at 1,415,086 B with the baseline and at 1,208,626 B with direct. The baseline's slot-output phase was already close to its assembly peak. As a result, lowering the earlier phase by about 206 kB replaced the whole-compile maximum with the linking maximum.

| Editor phase on PicoCalc | Baseline time / peak | Direct time / peak |
| --- | ---: | ---: |
| Frontend | 1,431.472 ms / 1,311,490 B | 1,380.737 ms / 1,192,582 B |
| Lowering | 688.080 ms / 1,316,466 B | 693.572 ms / 1,197,558 B |
| Assembly | 149.792 ms / 1,415,086 B | 45.147 ms / 1,208,626 B |
| Slot output | 13.228 ms / 1,394,058 B | 14.408 ms / 1,414,468 B |

The direct series spent about 105 ms less in assembly. That phase includes the compact fixup path and the absence of a raw copy. The board profile measured baseline and direct, so those two savings have a combined phase estimate. The phase trace also records a lower frontend time with direct. A finer profiler would be needed to attribute the frontend effect to a particular function or allocator event. The markers bracket phases and report allocator totals. Time in a phase can include collection, and high water can include buffers allocated in an earlier phase. A phase such as slot output can start with most of its measured peak already live.

These results identify two different engineering outcomes. A smaller representation reduces the memory needed while building machine instructions. Faster serialization improves cold compile time on the measured board. Accessible compile capacity depends on the largest phase, which in the direct candidate includes two reactor buffers and all emitted code. The equivalent Linux experiment started with a larger assembly peak and therefore showed a larger whole-compile change when linking became dominant. QuickJS uses a different value representation on the host and the 32-bit board, and the allocator, lifetimes and collector also influence the result.

## Scope of the result

The deterministic generator reconstructs the two experimental changes against `6426798`. The reproduction scripts test the byte-array API used by tooling and all three production app-specific link wrappers. Host evidence covers Files, Agenda and Editor. The new physical evidence is for the native Editor on one PicoCalc, with one reactor and compiler revision.

The measured result supports further qualification of direct output for reducing Editor cold compilation time. Compact is the simpler candidate when the goal is to preserve the existing linker interface. A proposal to increase the supported application size should begin with the measured linking peak and a concrete new workload. Ownership transfer of a reactor or final ELF across C and QuickJS would need its own validation of input ownership, allocator limits, failure handling and output lifetime.

The source ticket is `/home/manuel/code/wesen/2026-10-20--ds-js-os/ttmp/2026/11/19/PICOCALC-RV32-OUTPUT--write-streamed-picocalc-rv32-output-into-compact-buffers`. Start with `scripts/01-prepare.py` and `scripts/05-cold.py` to rebuild the variants and measure the production cold entry. The ticket guide describes the exact host and firmware input contract. Earlier compiler representation and board measurement studies are recorded alongside this report. [[PROJECT REPORT - PicoCalc Compiler - Function Representations and Streaming]] · [[PROJECT REPORT - PicoCalc Compiler - Production Numeric Operands and Streaming]]

## Evidence in the source repository

The paths below are relative to the root of `2026-10-20--ds-js-os`.

- Identity and allocator receipts in `ttmp/2026/11/19/PICOCALC-RV32-OUTPUT--write-streamed-picocalc-rv32-output-into-compact-buffers/various/`. Open `identity.json`, `host-clean.json` and `host-profile.json`.
- Shared board receipt in `ttmp/2026/11/19/PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-first-boot.json`. The corresponding repeat is `p4-replicate.json` in that directory.
