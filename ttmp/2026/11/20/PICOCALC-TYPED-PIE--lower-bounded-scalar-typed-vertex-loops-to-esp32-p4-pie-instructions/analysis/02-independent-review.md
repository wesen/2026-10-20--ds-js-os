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

Keep this opt-in for bounded, measured workloads. A real painter needs a source loop that matches, six properly aligned payloads and enough repeated vertices to qualify at runtime. A complete scene also performs face construction, rasterization, compositing and display transfer. Qualification of its projection time needs actual path evidence inside the receiving painter and comparison of complete rendered frames. A host instruction count alone cannot establish cycles, frame time or input latency.

## Reproducing the independent test

Run this from the repository root. The final argument supplies the installed Espressif tool prefix when it differs from the script's local default.

~~~sh
node ttmp/2026/11/20/PICOCALC-TYPED-PIE--*/scripts/review/qualify.mjs \
  /home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf
~~~

The JSON output records both compiler script hashes and all three emitted image hashes. Its retired rows give count, stock RV32, guarded scalar RV32 and PIE in that order. Node runs the WebAssembly reference and the independent RV32 interpreter locally. [Executable driver](../scripts/review/qualify.mjs)
