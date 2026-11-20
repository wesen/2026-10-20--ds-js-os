---
title: "When the Compiler Emits Text as Instructions"
author: Opus High research lead
status: final
tags:
  - compilers
  - rv32
  - utf16
  - esp32-p4
  - typed
---

# When the Compiler Emits Text as Instructions

> [!info] Evidence scope
> Every measured value here comes from three artifacts, the design guide, the host receipt and the board receipt. The project owner authorized this scoped source and aggregate evidence for Anthropic. No raw logs were available while writing. Differences, ratios and percentages are computed from the reported values and are labeled as derived where it matters.

## The problem in one number

The Chess workload in this study is a Typed program that writes a 61022-byte JavaScript source into a UTF-16 buffer. That source embeds 16316 bytes of a painter whose inclusion the project owner authorized. Typed compiles to Wasm by default, and it also has a direct RV32 backend that emits machine words into an image itself. Through that backend, the Chess program's image held 256400 bytes of code and no data. After the change described here, the same program compiles to 54320 bytes of code and 33852 bytes of data.

Most of the removed code existed to place constant text in memory one 16-bit unit at a time. The text was being emitted as instructions. This article explains why the baseline backend produced that code, how the replacement works at the instruction level, how it was checked, and what the host and board measurements establish. It assumes you read C and JavaScript. It does not assume you know RV32.

## The operation being compiled

Typed has a checked operation, `writeLiteral`, that writes a string literal into a UTF-16 buffer at a start index. A buffer is a 32-bit capacity followed by that many 16-bit code units.

```c
struct u16buf {
    uint32_t capacity;  /* count of u16 units that follow */
    uint16_t units[];   /* first unit sits 4 bytes after the buffer address */
};
```

A UTF-16 code unit is one 16-bit value. Most characters take one unit. Characters outside the Basic Multilingual Plane take a surrogate pair of two units. The operation copies units, not characters, so a lone surrogate or a NUL is just another value to store.

The frontend fixes the semantics before any backend sees the operation. It evaluates the start expression exactly once. It then checks that the start position and the last position the literal will cover both fall inside the capacity. Nothing is written until both checks pass. An empty literal still evaluates the start expression and writes nothing. For a literal of n ≥ 1 units, the behavior matches this C sketch.

```c
uint32_t start = eval_start_once();
check_in_bounds(b, start);            /* traps before any write */
check_in_bounds(b, start + (n - 1));  /* traps before any write */
for (uint32_t i = 0; i < n; i++)
    b->units[start + i] = lit[i];
```

Two consequences matter later. A failed check leaves the whole buffer untouched. The backend's copy also needs no bounds checks of its own, because the checks already ran. After checking, the frontend keeps a saved address in a local, and the backend works from that saved address.

## What the baseline backend emits

RV32 instructions are 32 bits wide, so an instruction can carry only a small constant. `addi` (add immediate) carries a signed 12-bit value, which covers −2048 through 2047. Larger values need `lui` (load upper immediate), which sets the upper 20 bits of a register, followed by an `addi` for the rest.

The baseline numeric backend lowers a constant literal with three steps per code unit. It loads the saved address, materializes the unit as an immediate, and stores a halfword. The sketch below shows one unit. Register names and offsets are illustrative.

```asm
lw    t5, SAVED(sp)    # load the saved address
addi  t6, zero, 0x41   # 'A' fits in the 12-bit immediate
sh    t6, OFF(t5)      # store 16 bits
```

A unit such as 0x4E2D does not fit in 12 bits. Materializing it takes `lui` plus `addi`, which makes four instructions for that unit. The baseline never reuses an immediate already sitting in a register, even when a unit repeats. The floor is therefore three instructions, or 12 bytes, for every code unit of every literal. This is ordinary fixed-width RV32 code, and the floor is a property of this emitter.

That floor explains the Chess number. Text that occupies 2 bytes per unit in memory occupies at least 12 bytes per unit as code.

## Splitting a constant into upper and lower parts

The 0x4E2D case is worth working through, because the same arithmetic reappears when code has to find the pool. `addi` sign-extends its immediate. When the low 12 bits of the target are 0x800 or larger, `addi` treats them as negative, so the upper part has to be rounded up by one to compensate.

```js
// Split a 32-bit value into a 20-bit upper part and a signed 12-bit lower part.
function splitHiLo(value) {
  const hi = (value + 0x800) >> 12;  // round so the remainder fits in [-2048, 2047]
  const lo = value - (hi << 12);
  return { hi: hi & 0xfffff, lo };
}
```

For 0x4E2D the low 12 bits are 0xE2D, which is above 0x7FF. The function returns hi = 0x5 and lo = −0x1D3. The pair `lui t6, 0x5` and `addi t6, t6, -0x1D3` produces 0x5000 − 0x1D3, which is 0x4E2D. Without the rounding, hi would be 0x4 and the sign-extended low part would subtract 0x1D3 from 0x4000. The result would land 4096 below the target.

## The pooled design

The change gives the backend a second way to lower a constant write. It applies only to a statically checked `writeLiteral` whose literal has at least 16 UTF-16 units. Shorter literals keep the baseline lowering. The existing 1022-unit limit on a literal is unchanged.

For a qualifying write, the frontend emits a private numeric op that carries two numbers. One is the index of the local holding the saved address. The other is the literal's ordinal. The backend appends the literal's exact code units, little-endian, to a literal pool in the direct RV32 image. The emitted site copies from the pool into the buffer at run time.

Before its loop, the site does three things. It loads the saved address and adds the four-byte payload offset, which skips the capacity field. It computes the pool entry's address with a PC-relative instruction pair. It computes where the source range ends. The loop then copies until the source cursor reaches that computed end.

Register discipline keeps the copy from disturbing the surrounding expression. The backend keeps live operand-stack values in t0 through t4 or in spill slots. The copy site uses only t5, t6, a0 and a1 as scratch, so whatever the enclosing expression has in flight survives the copy. The site makes no external calls and uses no instruction outside the native ISA.

## Finding the pool from code

The site cannot embed the pool's absolute address, because the code does not know where it will run. It uses `auipc`, which adds a 20-bit upper immediate, shifted left by 12, to the address of the `auipc` instruction itself. An `addi` supplies the low part. Once layout is final, the assembler patches both immediates by applying the same `splitHiLo` rounding to the distance.

```asm
auipc t6, HI(entry - pc_of_auipc)
addi  t6, t6, LO(entry - pc_of_auipc)
```

The subtle point is the reference address. Both immediates are relative to the address of the `auipc`, not the address of the `addi` after it. An implementation that measured the distance from the `addi` would compute an offset 4 bytes too small and produce an address 4 bytes before the entry. Every fixup in this design uses the `auipc` address.

These are module-local data offsets. As long as code and pool are placed together as laid out, the distance from a site to its entry is fixed at assembly time.

## The two copy loops

Both loops rely on halfword alignment of source and destination. The pool stores whole code units at even offsets, and the buffer payload sits at an even address.

The halfword variant loads 16 bits with `lhu`, stores 16 bits with `sh`, advances both cursors by 2, and branches back while the source cursor differs from the computed end.

```c
/* halfword variant, written as C */
const uint16_t *src = entry, *end = entry + n;
uint16_t *dst = payload_start;
do { *dst++ = *src++; } while (src != end);
```

The word variant moves 32 bits per iteration where it can, and it uses 32-bit accesses only at addresses that are multiples of 4. Source alignment is decided at compile time. The pool follows a code extent that the design assumes is aligned, so the emitter knows each entry's alignment when it appends the entry. Only entries at a naturally four-aligned offset get a fast arm. Other entries get just the halfword loop.

Destination alignment is decided at run time, because the start index is a run-time value. The fast arm tests the destination address. If it is four-aligned, the arm copies every complete word and then one trailing halfword when n is odd. Otherwise control falls into the halfword loop.

```c
/* word variant fast arm, emitted only when the entry is four-aligned */
if (((uintptr_t)dst & 3) == 0) {
    const uint32_t *ws = (const uint32_t *)entry;
    uint32_t *wd = (uint32_t *)dst;
    const uint32_t *wend = ws + n / 2;
    do { *wd++ = *ws++; } while (ws != wend);
    if (n & 1) *(uint16_t *)wd = *(const uint16_t *)ws;
} else {
    /* halfword loop */
}
```

Little-endian order is what makes the word copy correct. Two adjacent units stored little-endian in the pool form a 32-bit word. Storing that word little-endian into the buffer puts each unit back at the same position.

The word variant inserts no padding to align entries. It only adds code at sites whose entries happen to be aligned. The measurements show this directly, because data bytes match across the two variants and only code differs.

## Where the pool lives in the pipeline

The direct backend lowers functions as a stream, one at a time. After each function, its old numeric code and its literal string array are cleared. The emitted instruction words, the fixups still awaiting final addresses, and the pool are retained until layout. At layout the assembler places the pool, patches the `auipc`/`addi` fixups, and runs the existing import patching as before. The default Wasm backend and the closed slot entry are unchanged.

Exact deduplication is an option on the pool. When two qualifying writes use identical literals, both sites point at one shared entry.

The design guide states three assumptions. The code extent is aligned. Destination buffers are valid and disjoint from the pool. Typed has no capability to write to the executable segment, so pool contents cannot change.

## The size argument

Let n be the number of code units in a qualifying literal. Write B(n) for the baseline code and P(n) for a word-variant site plus its data. The design guide gives a maximum of 88 instruction bytes for a word-variant site before its data, and the pool needs at most 2 trailing padding bytes.

$$B(n) \ge 12n \qquad P(n) \le 88 + 2n + 2$$

At the threshold of 16 units, P(16) ≤ 88 + 32 + 2 = 122, which is below the baseline floor B(16) ≥ 192. The slopes differ, with at least 12 bytes per unit for the baseline and 2 for the pool, so the gap widens with length.

$$B(n) - P(n) \ge 10n - 90$$

At n = 16 the saving is at least 70 bytes, and each further unit adds at least 10. A deduplicated repeat pays no data at all, only its site. This bound describes this emitter. It does not transfer to a backend with different per-unit code.

The threshold of 16 was not tuned. No threshold sweep was run, and no baseline with immediate reuse was implemented. Every comparison below is against the baseline as it exists.

## Host size results

| Workload | Arm | Code | Data | Pad | Total |
|---|---|---:|---:|---:|---:|
| Chess | Stock | 256400 | 0 | 0 | 256400 |
| Chess | Halfword, occurrence pool | 54320 | 33852 | 0 | 88172 |
| Chess | Halfword, exact dedupe | 54320 | 33852 | 0 | 88172 |
| Chess | Word, exact dedupe | 55232 | 33852 | 0 | 89084 |
| Editor | Stock | 89168 | 0 | 0 | 89168 |
| Editor | Halfword, occurrence pool | 75268 | 2530 | 2 | 77800 |
| Editor | Halfword, exact dedupe | 75268 | 2464 | 0 | 77732 |
| Editor | Word, exact dedupe | 76124 | 2464 | 0 | 78588 |
| Synthetic | Stock | — | — | — | 1600 |
| Synthetic | Halfword, occurrence pool | 368 | 208 | — | 576 |
| Synthetic | Halfword, exact dedupe | 368 | 104 | — | 472 |
| Synthetic | Word, exact dedupe | 448 | 104 | — | 552 |

*From the host receipt. Values in bytes. Dashes mark values the receipt does not report separately.*

Chess has 33 pool references, all unique, so dedupe changes nothing. The halfword arm cuts the total from 256400 to 88172 bytes, a derived reduction of 168228 bytes or 65.6 percent. The 33852 data bytes hold 16926 code units. At the baseline floor those units alone would have cost 12 × 16926 = 203112 bytes of code. The measured code reduction is 202080 bytes, close to that floor. That closeness is what the size argument predicts when most of a program's code was long constant text.

Editor has 32 pooled uses, 31 of them unique. Halfword with exact dedupe cuts its total from 89168 to 77732 bytes, a derived 12.8 percent. Its occurrence pool holds 1265 units. At the floor those would cost at least 15180 bytes, which is about 17 percent of its stock code. The saving is bounded by how much of a program is long constant text, and Editor simply has less of it. Dedupe removes 66 data bytes, which is one repeated 33-unit literal. The remaining unit count becomes even, so the 2 bytes of padding disappear too, for 68 bytes in all.

The held-out synthetic workload repeats its literals. Dedupe halves its pool data and saves 104 bytes. In Chess dedupe saves 0 bytes. It never increased size in any measured case.

The word variant costs code and nothing else. It adds 912 bytes in Chess, 856 in Editor and 80 in the synthetic case, with data unchanged.

## Correctness evidence

The host receipt compares the bytes produced by the generated source writers exactly, together with whole arenas, against Wasm. The matrix covers 180 success, trap, alias and single-evaluation cases. It also covers 48 cases that vary surrounding operand depth and alignment, plus three overlength rejections. Some inputs contain non-ASCII text, NUL, a lone surrogate and a surrogate pair.

Each category targets a specific risk. Whole-arena comparison catches writes outside the buffer and partial writes before a trap. Single-evaluation cases confirm that the start expression runs once. Operand-depth cases put live values in t0 through t4 and in spill slots around the write, which tests the scratch-register discipline. Alignment cases drive both the fast arm and the halfword fallback of the word variant.

The host also runs the generated RV32 instructions in an interpreter model. That model executes the emitted instructions themselves, not the source program, and it checks access alignment. Streaming and buffered emission produced byte-equal output. The existing emitter input was validated by Typed, and the Wasm backend's byte output was identical to before.

The evidence is payload equality. The RV32 images of different arms differ by design, and this study makes no claim of bit-identical binaries. No source breakage tests were run beyond the stated matrices.

## Board results for whole calls

The board was a revision 1.3 ESP32-P4 running CPU1 at 360 MHz with PSRAM at 200 MHz. The source text lived in PSRAM and went through the real on-device direct emitter and linker. Each call created a fresh QuickJS runtime on one firmware that was already running. Each workload ran five interleaved samples per arm, for 30 successful calls in total. The board receipt labels the arms stock, half and word.

| Workload | Arm | Median time (µs) | Median tracked heap (bytes) |
|---|---|---:|---:|
| Chess | stock | 5254907 | 3181936 |
| Chess | half | 2659192 | 1681944 |
| Chess | word | 2677218 | 1692172 |
| Editor | stock | 4531573 | 2567084 |
| Editor | half | 4332638 | 2536560 |
| Editor | word | 4350644 | 2541996 |

*From the board receipt.*

For Chess, half lowers the median call time by a derived 2595715 µs, or 49.4 percent, and the median tracked heap by 1499992 bytes, or 47.1 percent. For Editor, the reductions are 198935 µs, or 4.4 percent, and 30524 bytes, or 1.2 percent.

The stock and half ranges do not overlap in either workload. Chess stock ran 5246914–5282555 µs against 2638087–2694533 µs for half. Editor stock ran 4501686–4578615 µs against 4325532–4366012 µs. If the ten samples in a comparison were exchangeable, complete separation of two groups of five would occur by chance with a two-sided probability of 2/252, under 1 percent. Interleaving supports that assumption. All samples still came from one running firmware, so exchangeability remains an assumption.

The word medians sit about 18 ms above half in both workloads, with heap 10228 and 5436 bytes higher. The receipt gives no word ranges for these runs, so this article claims no separation between word and half.

Tracked heap fell by much more than the image. In Chess the heap reduction is about 8.9 times the image reduction, and in Editor about 2.7 times. The tracked heap therefore measures more than image bytes. The receipt does not break time or heap down by phase, so these reductions are not attributed to any part of the call.

## The isolated writer

A separate board experiment measured the copy itself. It executed the exactly generated standalone Chess writer blobs from flash-mapped code with a PSRAM destination. Each arm ran 11 samples after warmup, with 8 calls per sample. Each run compared all 16316 written units plus the unwritten tail, and all matched.

| Arm | Median cycles per call | Range | Modeled instructions | Cycles per modeled instruction (derived) |
|---|---:|---|---:|---:|
| Stock | 6465714 | 6063842–9593023 | 49354 | 131.0 |
| Half | 94909 | 82889–496456 | 82066 | 1.16 |
| Word | 42300 | 41920–64853 | 41324 | 1.02 |

*Cycles from the board receipt. Modeled instructions from the host interpreter model.*

The halfword writer executes about 1.66 times as many modeled instructions as stock, yet its median cycle count is about 68 times lower. The stock writer is long straight-line code executed from flash-mapped memory, while the loop runs a few instructions repeatedly. Placement is a plausible reason for the gap. It is not a proof, because no cache instrumentation was run. The halfword range also includes a sample about 5.2 times its median, which the receipt does not explain. The word writer's median is about 2.2 times lower than the halfword writer's, and its range is narrow.

These ratios depend on flash placement and come from an isolated writer that covers the painter only. They cannot be extrapolated to game code loaded into PSRAM. If the counter ticks at the 360 MHz core clock, the stock median is about 18 ms per call. The setups differ in placement, scope and harness, so that figure neither explains nor bounds the 2.6-second whole-call difference.

## Limitations

- Each board comparison rests on five samples per arm per workload, all on one running firmware. Nothing here covers a power-cycle cold boot, render FPS or end-to-end input latency.
- The linked ELF envelopes stayed at 274892 bytes for Chess and 242124 bytes for Editor in every arm. Neither a change in ELF payload placement nor a smaller load reservation was tested. The image savings are not yet savings in a loaded artifact.
- Time and heap are reported per call with no phase breakdown.
- The isolated writer ran from flash, not PSRAM, without cache instrumentation.
- The baseline has no immediate reuse, and no threshold sweep was run.
- No source breakage tests were run beyond the stated matrices.
- The pool depends on an aligned code extent, valid buffers disjoint from the pool, and the absence of any executable-segment write capability in Typed.
- Every result describes this backend and these workloads.

## What was qualified, and what remains before a release policy

Within its scope, the host receipt qualifies the semantics of the pooled lowering. Writer output and whole arenas matched Wasm across the semantic matrix, the operand-depth and alignment matrix and the overlength rejections, including non-ASCII, NUL and surrogate inputs. It also qualifies the image arithmetic. Chess falls from 256400 to 88172 bytes and Editor from 89168 to 77732 bytes with the halfword arm and exact dedupe. The size bound guarantees a saving at every qualifying length in this emitter. For these two workloads on one running firmware, the board receipt qualifies lower median call time and tracked heap for both pooled arms, with non-overlapping stock and half ranges. It also qualifies that the isolated Chess writer blobs produce exact output from flash-mapped code into PSRAM.

What a release would actually ship is not yet qualified. A live-loaded ELF that carries the pool in its payload would need to establish four things.

1. The loader keeps code and pool at the distances the assembler patched, so every `auipc`/`addi` pair reaches its entry, and it preserves the code-extent alignment the emitter assumed when it chose which entries get a fast arm.
2. The region holding the pool stays outside anything a Typed program can write, so the no-write assumption holds in the loaded image as well as in the language.
3. Written payloads and whole arenas still match across the existing matrices under that placement. This remains a payload claim, not a binary-identity claim.
4. Call time and tracked heap, measured again under that placement, show whether the reductions seen here survive when the pool comes from the loaded ELF.

A compact reservation would need to show that a reservation sized from the pooled image holds the largest qualifying image, including code, pool and final padding, with whatever alignment the loader requires. It would also need to report how much device memory that reservation actually frees. Until then, the 168228-byte Chess reduction is an image figure and not a reservation figure.

The choice between arms depends on the same measurements. The word arm costs 912 bytes in Chess and 856 in Editor. It was about 2.2 times faster than half in the isolated flash-mapped writer, while its whole-call medians were about 18 ms slower in both workloads, with no ranges reported. Dedupe cost nothing measurable and saved 0, 68 and 104 bytes in the three workloads. None of these numbers was measured with the pool inside a live-loaded ELF, and a release policy for the arms and for dedupe should be chosen from that measurement.
