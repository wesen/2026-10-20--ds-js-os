---
Title: When eight projected vertices may share an instruction
Ticket: PICOCALC-TYPED-PIE
DocType: analysis
Status: active
Topics: [compiler, picocalc, testing]
---

# When eight projected vertices may share an instruction

A projection function receives six buffers and a count. The first three buffers contain x, y and z. Three others receive horizontal position, vertical position and depth. A caller requesting sixteen vertices expects sixteen triples of results. If a buffer runs out partway, earlier writes remain visible. The change under review makes an ESP32-P4 instruction operate on eight coordinates at once. Its hardest obligations concern the order of observable writes, the range of the arithmetic and the lifetimes of registers.

In the independent host test, the revised compiler produced the correct result and final memory for all 145 input states. Forty-seven reached packed instructions and executed 510 packed stores in the instruction model. Forty-eight ended in a bounds exception. Two defects found during review, in the recognition of the index variable and in stack-frame growth, have executable regression cases. These results qualify a specific compiler revision and family of loops. [Independent receipt](../scripts/review/receipt.json)

## From an unsigned buffer to a signed lane

Typed reads each element as an unsigned 16-bit integer, performs signed 32-bit arithmetic and keeps the low 16 bits of the result on a store. Espressif's signed packed addition saturates when the result exceeds the signed 16-bit range. For example, 32767 + 1 produces 32767 on a saturating addition and 32768 in the language. A compiler can use the packed operation if it proves every possible intermediate stays in range. [Espressif's P4 instruction example](https://developer.espressif.com/blog/2024/12/pie-introduction/)

The scalar program supplies one such proof itself. It first takes each input modulo 256, an operation on the unsigned value returned by charCodeAt. A mask that keeps the low eight bits implements that reduction. Taking the raw triple (65535, 32768, 255) gives (255, 0, 255). The three expressions 384+x-z, 640+x+z-2*y and x+z+y then produce (384, 1150, 510). For every possible reduced input, the first output lies between 129 and 639, the second between 130 and 1150, and depth between 0 and 765. The intermediate 640+x+z has maximum 1150, and 2*y reaches at most 510. [Scalar Typed program](../scripts/review/projection.tjs)

The independent source variants exercised this distinction. A subtraction that reaches exactly −32768 and an addition that reaches exactly 32767 qualified. The expression 32767+x-x remained scalar because its first addition can saturate even though its final mathematical value is always 32767. Other holdouts kept raw unsigned loads, changed the modulus to 257, shifted a store index, carried a sum across iterations, invoked a helper or introduced an early exit. The 35 programs ran at six counts in each of two candidate modes, for 420 comparisons against WebAssembly. [Source variants](../scripts/review/variants.mjs)

## How lowering finds the loop

The application author writes ordinary Typed source. The frontend checks it and emits a sequence of integer operations. Lowering converts that sequence into the target processor's instructions. In this experiment, the RV32 lowerer recognizes a counted loop whose checks and element-index expressions follow the frontend's known form. It reads the modulus, inputs, expression trees and destinations from those operations. Renaming the buffers has no effect. The lowerer computes intervals for the expression trees and emits a guarded packed version only when it can prove the arithmetic fits, identify all accesses and allocate registers. The original loop then serves both as the fallback and as the implementation of the final one to seven elements.

This is bounded inference over one restricted loop. The checker has no proof for a shifted read, arbitrary division or an early exit, so such functions take the ordinary path. The caller can still pass the same storage for two separately declared buffer parameters. A compiler that proves the expression's range must additionally establish the independence of those concrete addresses at runtime. [Experimental lowerer](../scripts/02-pie-lowering.js)

## A trap is also a memory result

A Typed buffer starts with a four-byte capacity word. The compiler compares each requested index to that capacity as unsigned, then reads or writes a halfword four bytes beyond the header plus twice the index. With n = 17 and capacity 16 only in the last output, all three stores complete for indices 0 through 15. In iteration 16, the first two stores succeed before the last one traps. An incorrect implementation could produce the same exception while losing two stores or even the first sixteen triples.

The revised fast path preflights the largest complete group prefix. In this case it proves sixteen elements fit, computes those sixteen using packed instructions, then lets the original scalar iteration 16 perform two stores and trap. If a buffer holds only fifteen, it branches to the original scalar loop at index zero. If the count is negative or zero, the scalar loop returns before dereferencing any buffer. The test passed even when the six supplied pointer values were outside simulated memory for those two counts. [Memory cases and scalar model](../scripts/review/cases.mjs)

Grouping iterations can reorder reads across writes. Distinct parameter names supply no evidence that buffers occupy distinct storage. The tests overlap all fifteen pairs of six arguments exactly and at offsets of ±16 bytes, covering read/read, read/write and write/write pairs. Some overlaps place a capacity header inside an output payload. These views provide deliberately demanding ABI-level tests, including layouts the ordinary allocator need never produce. Each comparison checks all 896 bytes, which includes headers and untouched sentinels. The compiler checks both modular pointer distances for pairs involving a write and the end of each prefix for address wrap. Separate tests shift each pointer independently by four, eight or twelve bytes to verify its alignment check.

## Two programs that separated the first candidate from the corrected one

The original matcher recorded the destination local of a checked read without verifying that it was distinct from the loop index. This valid function illustrates why the distinction matters.

~~~javascript
for (let i = 0; i < n; i = i + 1) {
    i = src.charCodeAt(i) % 256;
    dst.setCharCodeAt(i, i);
}
~~~

When n is eight and the first input equals nine, its single iteration writes nine to output element nine. The update changes i to ten and the loop exits. The initial matcher reported eight-lane selection. The revised matcher requires a new local above the induction-variable slot. The independent test now checks scalar byte identity, the value at element nine and the complete final memory. [Mutable-induction regression](../scripts/review/variants.mjs)

The second defect changed which programs the compiler accepted. The stock backend permits a stack frame through 2032 bytes. Two extra temporary slots pushed an otherwise valid function with 499 post-loop scalar declarations above the limit. Ordinary RV32 produced 4236 bytes of machine code, while the candidate raised a frame-size error. The revised code can reuse two position temporaries created by the original bounds checks. Those positions are dead on entry and the scalar body assigns them before use. Functions with 499 and 500 such declarations now compile in both candidate modes. At 501 declarations, all three backends report the same original limit. [Frame boundary receipts](../scripts/review/receipt.json)

## What the hardware will execute

The test assembled an ELF wrapper that declares the ESP32-P4 instruction extension and includes the compiler's actual bytes without translating them. The installed Espressif objdump identified three packed loads, three 16-bit broadcasts, three register masks, six saturated additions, two saturated subtractions and three packed stores in one static loop body. The independent host interpreter executed the vendor-decoded instructions with eight signed 16-bit lanes, post-incremented addresses and saturation. It used distinct sentinels for preserved general registers and checked the stack pointer and return address through a nested call. The caller keeps 19 live across that call and adds it to the result. [Vendor decoder](../scripts/review/decode.mjs) · [Packed instruction interpreter](../scripts/review/packed.mjs)

The exact FreeRTOS assembly compiled into the playable ESP-IDF 5.4.2 build saves and restores q0, q1, q2, q4, q5, q6 and q7 during a PIE context change. It omits q3 even though the context structure declares storage for eight registers. Every reviewed packed instruction avoids q3. The tests enforce that restriction and avoid changing accumulator or shift-control state. The host model does not schedule interrupts or simulate an RTOS context switch. [ESP-IDF context assembly](https://github.com/espressif/esp-idf/blob/f5c3654a1c2d2a01f7f67def7a0dc48e691f63c0/components/freertos/FreeRTOS-Kernel/portable/riscv/portasm.S#L261-L327)

## Which work disappeared

A second generated function uses ordinary RV32 operations after the same prefix checks. This gives a control for the benefit of removing repeated bounds checks and reducing address calculations. Each row counts retired instructions in the host model, from entry into the nested caller through its return. The six buffer payloads are aligned to 16 bytes, capacities are 41, and the buffers are disjoint.

| Vertices | Stock RV32 | Guarded scalar RV32 | Eight-lane PIE |
| ---: | ---: | ---: | ---: |
| 1 | 189 | 193 | 193 |
| 7 | 975 | 979 | 979 |
| 8 | 1106 | 490 | 202 |
| 9 | 1237 | 621 | 333 |
| 16 | 2154 | 810 | 231 |
| 40 | 5298 | 1770 | 318 |
| 41 | 5429 | 1901 | 449 |

At sixteen vertices the guard and scalar rewrite alone remove 1344 retired instructions. The packed operations remove another 579. In the packed column the first complete group costs 202 instructions including entry and return. Adding a second complete group costs only 29 more because it reuses the initial alignment, bounds and overlap checks. At forty-one vertices the final scalar iteration adds 131 instructions to all three arms. The cost in executable storage is visible even when guards always fail. The fixture including its nested caller occupies 772 bytes stock, 1560 bytes with the guarded scalar version and 1528 bytes with the PIE version. [Nested-call measurements and image hashes](../scripts/review/receipt.json)

## What the physical P4 measured

The board operator ran the three freshly compiled functions from a standalone firmware image. The board passed six Typed buffer pointers and the vertex count directly to each function. On the independent host I regenerated the three raw machine images from the checked-in source and matched every SHA-256 in the operator's receipt. I also reconstructed every halfword in the expected output arrays, including the untouched input tail when the first output aliases the first input. All 72 independently calculated CRCs agreed with the recorded device results. This cross-check covers eight counts, three memory layouts and three compiled versions. The canary and partial-trap comparisons described earlier run on the host. [Operator receipt](../various/physical.json) · [Independent physical audit](../scripts/review/board-audit.json)

| Vertices | Stock cycles | Guarded scalar cycles | PIE cycles |
| ---: | ---: | ---: | ---: |
| 1 | 316 | 319 | 319 |
| 7 | 1353 | 1355 | 1355 |
| 8 | 1526 | 755 | 398 |
| 9 | 1699 | 932 | 578 |
| 17 | 3092 | 1340 | 617 |
| 64 | 11360 | 3561 | 678 |
| 256 | 45675 | 13161 | 1644 |
| 1024 | 184005 | 51561 | 5484 |

Each cell is the median of eleven batch averages for warm calls using aligned, disjoint payloads. Each batch repeated a function floor(16384 / vertices) times and used the CPU cycle counter around those calls. The order of the three variants rotated across trials. Counts one and seven cost two or three additional cycles with the guard. At eight vertices, the first complete group took 398 cycles, compared with 755 in the guarded scalar version. At 1024 vertices the same comparison is 5484 versus 51561 cycles, a 9.40-fold throughput increase for this kernel. The 33.55-fold comparison with stock includes the large benefit of cheaper scalar address generation and bounds checks. A batch mean cannot reveal the worst latency of an individual call. [Board harness](../scripts/board/main/main.c)

## Does the delivered three-dimensional Chess painter use PIE?

The finished painter projects one point at a time. Its function takes integer coordinates and a camera pitch and returns one packed screen position. Calls from board and piece construction pass those positions directly to triangle emitters. The public painter entry receives two buffers holding the normalized game state and the drawing commands. None of these loops loads coordinate columns at one index and stores independent result columns at that index. Turning the PIE option on produced exactly the same 9572 machine bytes as stock for source digest d6c2dc3a…. The review's instruction interpreter counted zero packed operations in these frames. [3D painter source](../../PICOCALC-CHESS-3D--render-a-three-dimensional-chess-position-with-a-delivered-typed-painter/scripts/scene/isometric.typed) · [Independent scene receipt](../scripts/review/scene-receipt.json)

I tested 15 independently constructed states, including the opening, e2–e4, two alternate camera pitches, a promotion prompt and each piece type at the same square. The Wasm return and all 8960 memory bytes agreed with generated RV32 for every state. A separate geometric calculation checked both triangles of every square in all fifteen outputs, for 1920 checked triangles. Removing the color and printed letter still left six distinct streams of piece coordinates. The opening returned 3281 command words and the empty board 1105. I also ran the 47 game replay inputs drawn from the scene author's fixture and compared every native result with the fixture's expected command stream, original input and untouched output tail. The replay contained 32 distinct command streams. [Scene driver](../scripts/review/scene.mjs)

Keep the compiler option experimental for users with demonstrably independent, bounded coordinate arrays. The measured throughput justifies evaluating batching in a renderer that spends enough time projecting vertices. For this particular painter, the next design question is where batches would live. The two-buffer entry currently supplies game state and command storage. A bounded scratch layout and explicit buffer lifetime, or a recognizer that can reason about nonoverlapping regions within a workspace, would be necessary for this form of lowering. The projection kernel results establish no end-to-end frame speedup for this experimental scene.

## Reproducing the independent test

Run this from the repository root. The final argument supplies the installed Espressif tool prefix when it differs from the script's local default.

~~~sh
node ttmp/2026/11/20/PICOCALC-TYPED-PIE--*/scripts/review/qualify.mjs \
  /home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf
~~~

The JSON output records both compiler script hashes and all three emitted image hashes. Its retired rows give count, stock RV32, guarded scalar RV32 and PIE in that order. The sibling audit-board.mjs script takes the operator’s physical.json. The scene.mjs script runs the fifteen standalone states with no arguments and accepts the scene experiment’s generated fixtures.bin to add the 47-state replay. Node runs the WebAssembly reference and the independent RV32 interpreter locally. [Executable driver](../scripts/review/qualify.mjs)
