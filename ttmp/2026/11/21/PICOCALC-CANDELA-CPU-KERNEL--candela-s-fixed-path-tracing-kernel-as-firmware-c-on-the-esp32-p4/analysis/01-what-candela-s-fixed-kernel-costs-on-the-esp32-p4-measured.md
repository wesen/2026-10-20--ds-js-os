---
Title: What Candela's fixed kernel costs on the ESP32-P4, measured
Ticket: PICOCALC-CANDELA-CPU-KERNEL
Status: active
Topics:
    - picocalc
    - esp32-p4
    - rendering
    - performance
    - porting
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: ttmp/2026/11/21/PICOCALC-CANDELA-CPU-KERNEL--candela-s-fixed-path-tracing-kernel-as-firmware-c-on-the-esp32-p4/scripts/various/06-board-timing/score.txt
      Note: Device cycles per sample, CPI and substitution tables for 18 arms x 6 scenes
    - Path: ttmp/2026/11/21/PICOCALC-CANDELA-CPU-KERNEL--candela-s-fixed-path-tracing-kernel-as-firmware-c-on-the-esp32-p4/scripts/various/02-interpreter-counts.txt
      Note: Interpreter instructions per sample for the same libraries
    - Path: ttmp/2026/11/21/PICOCALC-CANDELA-CPU-KERNEL--candela-s-fixed-path-tracing-kernel-as-firmware-c-on-the-esp32-p4/scripts/various/07-cycle-model.txt
      Note: The parent's cycle model and a microbenchmark bracket against measurement
    - Path: ttmp/2026/11/21/PICOCALC-CANDELA-CPU-KERNEL--candela-s-fixed-path-tracing-kernel-as-firmware-c-on-the-esp32-p4/scripts/various/08-board-images/compare.json
      Note: Device 64 spp frames against the host build of the same C++
ExternalSources: []
Summary: "Device measurements of Candela's generated kernel on the ESP32-P4: 6,832 cycles per sample for B-01 with every CPU substitution (14,976 with WGSL semantics), CPI 1.28-1.72, fdiv.s and fsqrt.s at 19 cycles, L1 instruction-cache misses on up to 16% of fetches, about ±2% layout noise between images, and 64 spp frames equal to the host build's to floating-point rounding."
LastUpdated: 2026-11-22T01:30:00-05:00
WhatFor: "The measured cost of a camera sample on the P4, what each CPU substitution buys, and why the cycle count is what it is"
WhenToUse: "Before choosing render resolution, pass rate or further optimisations for Candela on the PicoCalc (FIRST-LIGHT, SECTIONS)"
---

# What Candela's fixed kernel costs on the ESP32-P4, measured

Candela's fixed path-tracing kernel now exists as C++ generated from its own `src/kernel.js` (design: `design-doc/01-design-stub.md`). This document reports what that code costs on the PicoCalc's ESP32-P4. It compares the measurement with the estimates of PICOCALC-CANDELA-P4 and explains the gap from the processor's measured instruction latencies and caches.

Every number below was measured on the device with `mcycle`, except where a row says "interpreter". In that case it was counted by `scripts/05-rv32imfc-count.c` running the same compiled libraries. The timing run is `scripts/various/06-board-timing/` (benchmark app SHA-256 `9913c612…f163`, built from the committed generator). The image run is `scripts/various/08-board-images/` (app `ea10ef88…9144`). After each run the board was restored to the playable firmware `b22a807d…f62c` and passed the health check.

## 1. The result

At 160 x 160 and one sample per pixel, on one 360 MHz core:

| Scene | WGSL semantics (`wgsl`) | All CPU substitutions (`cpu`) | Speed-up | `cpu`: samples per second | `cpu`: one 160 x 160 pass |
|---|---:|---:|---:|---:|---:|
| B-01 hello sphere | 14,976 | **6,832** | 2.19x | 52,700 | 0.49 s |
| R-01 Cornell box | 15,536 | 12,867 | 1.21x | 28,000 | 0.92 s |
| L-03 sun and sky | 13,570 | 5,358 | 2.53x | 67,200 | 0.38 s |
| G-01 primitives | 19,817 | 11,960 | 1.66x | 30,100 | 0.85 s |
| E-02 toon (custom integrator) | 5,736 | 4,918 | 1.17x | 73,200 | 0.35 s |
| W-02 lamp-lit table, fbm wood (80 x 80) | 102,659 | 19,413 | 5.29x | 18,500 | 1.38 s |

*Cycles per camera sample, median of the warm frames of three blocks. Within a run, the frames of one arm and scene differ by at most 0.21%. The first frame costs the same as the later ones, because one frame of 25,600 samples amortises any cache warm-up. Between two board images the same machine code can differ by up to 2.3% (Section 3, "Layout").*

The parent ticket estimated 28,500-41,000 samples per second for B-01. With the prototype's own configuration (arm `proto`: lazy `select` only, one translation unit), the device delivers 26,600 samples per second (13,533 cycles per sample). With all CPU substitutions it delivers 52,700. B-01 at 80 x 80 takes 0.12 s per pass, so about eight interactive updates per second fit on one core.

The device ran the code that was counted. Each device frame's digest (FNV-1a over every pixel's 48-byte output) equals the counting interpreter's digest for the same arm and scene. All 108 arm-and-scene pairs agree, in both timing runs.

## 2. What each substitution buys

The table for B-01, the acceptance scene. "Ladder" adds the switches one at a time, in the order shown. "Without it" removes one switch from the shipping configuration `cpu`. The two disagree whenever substitutions overlap. For example, once the sky is a table, few `exp` calls remain for a polynomial `exp` to speed up.

| Switch | Ladder: cycles saved when added | `cpu` without it | Cost of leaving it out |
|---|---:|---:|---:|
| lazy `select` (evaluate only the chosen argument) | 1,334 | 8,464 | +1,632 |
| no zero-initialisation of structs and arrays | 507 | 7,355 | +523 |
| `floor` through `fcvt.w.s` | 47 | 6,954 | +122 |
| polynomial `sin`/`cos` | 1,061 | 7,479 | +647 |
| polynomial `exp` | 1,629 | 6,961 | +129 |
| integer hash instead of `fract(sin(x) * 43758.5453)` | −16 | 6,928 | +96 |
| direction-indexed sky table (64 x 64, rebuilt when the sun moves) | 3,583 | 10,415 | +3,583 |

*B-01, cycles per sample. WGSL semantics 14,976; all substitutions 6,832. Effects smaller than about 2% (140 cycles here) are within the layout noise of Section 3.*

Across the six scenes (all tables in `scripts/various/06-board-timing/score.txt`):

- **The sky table** is the largest single substitution wherever the sky is visible: −3,583 cycles in B-01, −3,676 in L-03, −3,329 in G-01. Preetham's Perez function needs two `acos` and six `exp` calls per direction. The lookup needs one division and twelve loads. Rebuilding the 64 x 64 table costs 7.56 million cycles (21 ms) each time the sun moves.
- **Lazy `select`** saves 970-1,770 cycles in every path-traced scene. WGSL's eager `select` makes the kernel compute an HDRI lookup it does not use, among other things.
- **Polynomial `sin`/`cos`** removes 76,488 of W-02's 102,659 cycles. W-02's wood grain hashes positions with `sin` of large arguments, and newlib reduces those exactly with Payne-Hanek reduction. Once `sin` is a polynomial, the integer hash saves another 2,920 cycles (13%).
- **No zero-initialisation** is worth 330-960 cycles per sample. On the host, frames rendered with the skipped initialisations filled with 0xA5 bytes are bit-identical to the zeroed frames for 18 of 18 scene and arm combinations. So no field is read before it is written.
- **The conversion-based `floor`**, the integer hash outside W-02, and the polynomial `exp` once the sky table is in each change B-01 by less than the layout noise. The remaining calls are rare.
- **The dispatch seam** (sections called through `struct Sections` rather than inlined) changes cycles by −2.5% (L-03) to +2.7% (E-02), measured against `mono`, one translation unit per scene. Apart from E-02, which calls back into the kernel from its custom integrator, that is within the layout noise. The seam costs no more than a few percent.
- **-O3** is 0.2-2.6% faster than -O2 (B-01: 6,656) and makes the kernel 17% larger (59,010 against 50,522 bytes of `.text`).

## 3. Why a sample costs what it costs

### The processor's latencies

`board/main/microbench.c` measures dependent chains of 256 instructions:

| Instruction | Cycles | Note |
|---|---:|---|
| `addi` | 1.0 | |
| `mul` | 2.0 | |
| `div` | about 11 | |
| `lw` (load to use) | 2.0 | |
| taken branch | 3.0 | |
| `fadd.s`, `fmul.s`, `fmin.s` | 4.0 | latency of every simple FP operation |
| `fmadd.s` | 5.0 | |
| `fcvt.w.s` then `fcvt.s.w` | 6.0 for the pair | |
| `fdiv.s` | 19.0 | 6.0 when both operands are 1.0: the divider finishes early on trivial operands |
| `fsqrt.s` | about 19 | |
| two interleaved `fdiv.s` chains | 17.0 per division | one divider, not pipelined |
| `fdiv.s` followed by 8 independent `addi` | 19.0 per group | integer work issues while the divider runs |

Integer instructions issue at one per cycle. Every FP result arrives four cycles later. Candela's shading and intersection code is mostly short dependent FP chains, such as a dot product feeding a square root feeding a division. That code therefore runs well below one instruction per cycle.

### Cycles per instruction

Measured cycles per sample divided by the interpreter's instructions per sample gives the CPI. It is 1.28-1.72 across all 108 arm-and-scene pairs (`score.txt`). The parent's cycle model assumed 1.13 per integer instruction, 10-30 per division and square root, and 1-2 per other FP instruction. Its range contains every measurement, but the device sits at 0.79-0.98 of the model's pessimistic end (`scripts/various/07-cycle-model.txt`). A bracket built from the microbenchmarks also contains every measurement. Its lower edge assumes every instruction issues without waiting; its upper edge assumes every instruction waits for its predecessor's result. For B-01 `cpu` the bracket is 5,633-10,069 cycles, and the measurement is 6,832.

A non-negative least-squares fit of the 108 measured cycle counts reproduces every measurement within 5.1% (median 1.0%). Its inputs are the interpreter's instructions by class and the measured L1 cache misses. Its coefficients are correlated and are not latencies. Read as a budget for B-01 `cpu`: integer and memory instructions take about 45% of the cycles, FP arithmetic and fused multiply-adds 38%, `fdiv.s`/`fsqrt.s` 9%, and L1 instruction-cache misses about 13%.

### The instruction cache

The kernel instance (`.text` 50.5 KB) is larger than the core's L1 instruction cache. The cache counters (`CACHE_L1_IBUS0_ACS_*`) report L1 instruction misses on 0.6% (E-02) to 15.8% (B-01) of fetches for the `cpu` arm. For B-01 that is 851 misses per sample out of 5,380 fetches. E-02's custom integrator runs a small loop that stays in L1. The L2 cache (128 KB, as in the playable firmware) serves almost all of the misses: 4-9 L2 misses per sample, and 43 for W-02. Placing the whole kernel in internal RAM (`cpu-iram`, code at `0x4ff0…` instead of flash at `0x4007…`) removes the L2 misses. It is still 0.5-1.5% *slower* than running from flash, because its L1 misses do not fall (920 per sample for B-01). The cost is the L1 refill wherever the code lives, so internal RAM is not worth spending on the kernel.

The `minstret` probe ran 1,000 never-executed `addi` from flash: 43,186 cycles for 63 cache lines, about 680 cycles per line. That is the cost of code that is in neither cache, which a frame pays only in its first few samples.

### Layout

The timing run was made twice with two builds of the board image. Between the builds, translation rule 5 changed one line of the generated kernel (diary Step 5). Thirteen of the 18 kernel objects compiled to identical machine code. Their code, the scenes' section code and the libm functions they call nevertheless sit at different addresses, because the other arms changed size. For those 78 arm-and-scene cells, cycles per sample changed by a median of 0.36% and at most 2.27% (`cpu-floor` on L-03: +123 cycles, with 100 more L1 instruction misses per sample). Cycle changes and L1 instruction-miss changes correlate (r = 0.60, about 1.5 cycles per additional miss; `scripts/16-layout-noise.py`, `06-board-timing/layout-noise.txt`). So the precision of a comparison between arms is set by code placement, about ±2%, not by the 0.2% spread within a run. Substitution effects smaller than that are not resolved. The scale of the effect also says that a hot-path code layout could gain a few percent.

### Data placement

The scene buffers are 1-3 KB and stay in the L1 data cache: fewer than 6 L1 data misses per sample. B-01 and R-01 take the same number of cycles with their buffers in PSRAM as in internal RAM (B-01: 6,809 against 6,816 cycles per sample).

## 4. The post pass

Measured on a B-01 frame with its accumulation, albedo and normal buffers in PSRAM:

| Pass | WGSL semantics | `cpu` |
|---|---:|---:|
| display: exposure, AgX tone map, sRGB | 4,341 cycles per pixel | 4,315 |
| one à-trous iteration (25 taps) | 23,004 cycles per pixel | 11,842 |

The polynomial `exp` takes the iteration from 23,044 to 17,340 cycles per pixel. `pow(x, 32)` as five squarings (`CDL_POW32`) takes it to 11,842. Candela's denoiser runs four iterations, about 47,400 cycles per pixel, or seven B-01 samples per pixel. Its cost is therefore that of a few extra passes, paid once when accumulation pauses (design of PICOCALC-CANDELA-P4, Section 8). The display pass costs 0.63 of a B-01 sample per pixel: 110 million cycles, 0.31 s, for a 160 x 160 frame on one core, and 0.08 s at 80 x 80. Refreshing after every 160 x 160 pass would add 63% to B-01's pass time. Per pixel, the display pass calls `log2f` three times (AgX's log encoding) and `powf` six times (AgX's 2.2 power and the sRGB encoding).

## 5. Agreement with the host build

The acceptance test compares 64 spp frames rendered on the device with frames from the host build of the same C++ (same arm, `cpu`), at frame indices 0-63.

| Scene | Device mean luminance | Host mean luminance | Ratio | Pixels within 1% | Acceptance |
|---|---:|---:|---:|---:|---|
| B-01 | 8,464.8307 | 8,464.8342 | 0.9999996 | 99.996% | mean within 1%: pass |
| R-01 | 62.172685 | 62.172685 | 1.0000000 | 99.996% | mean within 1%: pass |
| L-03 | 9,462.1294 | 9,462.1295 | 1.0000000 | 100% | mean within 1%: pass |
| G-01 | 11,584.481 | 11,585.048 | 0.99995 | 99.1% | mean within 1%: pass |
| E-02 | 0.44502534 | 0.44502530 | 1.0000001 | 99.996% | ≥99% of pixels within 1%: pass |

*`scripts/various/08-board-images/compare.json`. The device frames are `08-board-images/*-device.png`.*

The device frames and the host frames are the same image to within floating-point rounding, not merely images with the same mean. This took one fix. The first comparison, against host frames rendered before translation rule 5 existed (`compare-against-unsequenced-host.json`), passed the mean-luminance criterion: ratios 1.00021-1.00046. But only 42-59% of the path-traced scenes' pixels agreed within 1%. The cause was evaluation order. One statement in `tracePath` calls `sampleLobe(L, woL, rnd2(), rnd())`. WGSL evaluates the arguments left to right; C++ does not specify the order, and GCC chose different orders on x86-64 and RV32. The host therefore drew the same random numbers in a different order and rendered different samples. RV32 had used WGSL's order all along: after the fix, all 108 RV32 digests are unchanged, and the `cpu` kernel's machine code is identical. The fix therefore changed only the host reference, and the image run did not need repeating.

The remaining per-pixel differences are FMA contraction. RV32 GCC contracts `a * b + c` into `fmadd.s` under `-ffp-contract=fast`, and the host reference build has no FMA. A host build with `-mfma -ffp-contract=fast` reproduces the device frames to within 1.8e-6 relative on every pixel of B-01, R-01, L-03 and E-02 (`scripts/15-device-vs-frames.py`). In G-01, 99.8% of pixels agree within 1e-6. G-01 is the only test scene with sphere-traced shapes. There a rounding difference can change the step on which a ray is declared to hit, which is the likely source of the rest. That has not been verified, and GCC may also place contractions differently on the two targets.

On the host, the substitutions change the 64 spp mean luminance against the exact-math arm `lazy` by +0.021% (B-01; all of it from the sky table), −0.005% (L-03), −0.003% (G-01), −0.017% (W-02; all of it from the integer hash, which changes the wood's noise values), and 0 (R-01, E-02). They leave the random stream unchanged, so these differences are rounding effects, not Monte Carlo noise. The sky table's luminance error at 64 x 64 texels is 0.057% mean and 0.44% at the 99th percentile over the upper hemisphere (400,000 directions, `scripts/various/03-sky-error.jsonl`).

## 6. Size

| Part | `.text` | `.rodata` |
|---|---:|---:|
| kernel (`cpu`, -O2) | 50,522 B | 1,724 B |
| post pass | 5,658 B | 464 B |
| one scene's compiled sections (stand-in for SECTIONS' bytecode) | 554-2,418 B | 60-220 B |
| newlib single-precision libm used by the kernel | 8,308 B | |

The kernel and post pass of one instance, with the libm they use, come to about 67 KB: 1.45% of the playable firmware image (4,626,128 B). The WGSL-semantics kernel is smaller (37,718 B), because it calls libm instead of inlining polynomials. The sky table needs 49 KB of RAM at 64 x 64 texels, or 12 KB at 32 x 32 (0.23% mean error).

## 7. What follows for the other tickets

- **FIRST-LIGHT.** Use the `cpu` configuration. At one core, 160 x 160 passes take 0.35-0.92 s for the T0 scenes measured, and 80 x 80 passes 0.09-0.23 s. Keep the sky table and rebuild it in `NS_bind` (21 ms) whenever `pack` moves the sun. Run the display pass at the lower resolution while interacting, because it costs 4,315 cycles per pixel. A table-driven display pass (two one-dimensional tables replace its three `log2f` and six `powf` calls) is the cheapest way to refresh after every pass. Before using the second core, move the kernel's private globals (`rngS`, `gTime`, `gLam`, `gTau`, `gTri`, `gBary`) into a per-core context.
- **SECTIONS.** Natively compiled sections behind the table cost no more than a few percent, so the bytecode interpreter's own speed decides the cost. The 15 section-API functions in `generated/manifest.json` are its `CALL` targets. The bytecode compiler must evaluate operands left to right; `manifest.json` lists under `sideEffects` the 13 kernel functions whose calls it must not reorder. The interpreter's per-function profile (`05-rv32imfc-count ELF /dev/null PROFILE`) puts the section code itself (`sec_evalMaterial`) at 1.2% of B-01's instructions in the `cpu` arm (55 per sample), 1.0% of R-01's and 0.8% of G-01's. The kernel functions it calls stay native. The survey's kernel-fragment benchmarks found a bytecode interpreter 7-20 times slower than native code; at that rate these scenes become 5-23% slower. Scenes with user SDFs, which call `sdUser` at every sphere-tracing step, are the case to measure first.
- **Further CPU work.** In B-01 `cpu`, the remaining cost is about half integer and memory instructions, about 40% FP chains, and 13% L1 instruction-cache misses. The layout measurement (Section 3) shows that placement alone moves cycles by up to 2%. An `-Os` kernel, or a hand-placed hot path, is the next experiment. The FP latency of four cycles favours more independent work per sample (for example two samples' rays interleaved) over shorter chains.

## 8. Reproduction

```text
node scripts/02-gen-kernel.mjs <candela> scripts/various/01-section-api.json scripts/generated
node scripts/03-gen-scene.mjs <candela> scripts/generated B-01 160 160 scripts/generated/scenes   (and the other scenes)
python3 -I scripts/04-build.py <build> rv32 && python3 -I scripts/04-build.py <build> count && python3 -I scripts/04-build.py <build> board
source ~/esp/esp-idf-5.4.2/export.sh && bash scripts/07-stage-board.sh <build> 1 <new-dir>
python3 scripts/09-run-board.py --app <new-dir>/build/candela-bench.bin --out <run-dir>
python3 -I scripts/10-score-board.py <run-dir>/bench.log <build>/counts.jsonl score.json --md score.txt
python3 -I scripts/11-compare-images.py <image-run>/bench.log <build>/host-frames <out-dir>
```
