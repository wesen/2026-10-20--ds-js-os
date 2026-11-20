---
Title: Proving a packed vertex loop preserves Typed behavior
Ticket: PICOCALC-TYPED-PIE
DocType: design-doc
Status: active
Topics: [compiler, picocalc, testing]
---

# Proving a packed vertex loop preserves Typed behavior

A Typed buffer begins with a four-byte capacity followed by two bytes per element. The machine address of element zero is four bytes past the buffer pointer. Reading that element yields an integer from 0 to 65535. Each operation in the expression then uses 32-bit integer arithmetic until the final store keeps its low 16 bits. The candidate compiler seeks to evaluate eight iterations per group on the ESP32-P4. The comparison is against those same iterations run in their original order.

Consider a vertex with raw coordinates (65535, 32768, 255). The source reduces each coordinate modulo 256, yielding (255, 0, 255). Its three formulas yield (384, 1150, 510). Treating 65535 as signed −1 before taking its remainder changes the first coordinate. Removing the three reductions as redundant changes it again. Each test packs eight deliberately different triples into a group, so broadcasting the wrong lane or reversing the operand order becomes observable.

## What the compiler must establish

1. **Lane arithmetic.** The reductions place x, y, z in [0,255]. The source expression 384+x-z stays within [129,639]. For 640+x+z-y*2 the addition reaches 1150, the product reaches 510 and the final subtraction stays within [130,1150]. x+z+y is in [0,765]. Each intermediate fits in a signed 16-bit lane, so a signed saturating instruction with the same operation has the same result. A change that allows raw 65535 or moves saturation ahead of the reduction needs a new proof.
2. **Ordering.** Each iteration reads x, y and z before writing three results. A later iteration can observe an earlier write when pointers overlap. A write can also touch a capacity header if two buffer views overlap. Entry must separately establish independence of every reordered read/write or write/write pair, including headers still read by the scalar loop. Two input buffers sharing storage involve only reads. Conservative rejection is acceptable.
3. **Counting and address arithmetic.** The loop compares signed i32 indices to the count. Negative or zero count must return without even reading a header. For n positive, each candidate group has eight complete accesses in each participating buffer. Guard 32-bit endpoint calculations against wrap or use a bounded comparison independent of the computed endpoint. A last incomplete group executes the scalar body. An aligned buffer header produces a payload four bytes off vector alignment. Test the address of each buffer's first element.
4. **Exceptions.** A capacity check uses an unsigned comparison. If the third output holds nine elements while the function requests seventeen, iteration nine may write both preceding outputs before it traps. A vector preflight failure must preserve those writes. Compare the entire memory arena on failure, including unmodified byte sentinels and capacity words.
5. **Machine state.** Use saved-register sentinels and a nested caller keeping a value live across the call. Check vendor disassembly of the emitted bytes, count actual packed operations in the instruction interpreter, and obtain a board result through the project operator. A matching result on a path that always rejects cannot qualify the lowering.

The ESP-IDF 5.4.2 FreeRTOS port used by the playable build visits q0, q1, q2, q4, q5, q6 and q7 in both its PIE save and restore routines. Keep live packed values out of q3 across possible task switches. This is a source finding for this SDK revision. Direct inspection of interrupt-driven execution belongs to physical validation. [ESP-IDF task context assembly](https://github.com/espressif/esp-idf/blob/f5c3654a1c2d2a01f7f67def7a0dc48e691f63c0/components/freertos/FreeRTOS-Kernel/portable/riscv/portasm.S#L261-L327)

## Falsification procedure

Compile one test function to WebAssembly and ordinary RV32. Instantiate it over fresh, identical arenas, then compare its return or trap and the complete arena. Compare those with an independently written scalar model. Run the candidate on the same inputs, using vendor-decoded packed operations in a host instruction interpreter. Reject a positive test unless an aligned, independent group reaches a packed store. Reject a steady-state speed claim unless the board operator measures the generated path and gives the timing endpoints.

Vary the count across zero and boundaries around eight and sixteen, each input's high bits and each buffer's alignment separately. Shorten each of the six capacities in turn. Include output/output aliases, exact input/output aliases, shifted aliases in either direction and a mutable capacity header. Modify the source to create a carry between iterations, wider input ranges, a different index, a different constant and early exit. Confirm each recognized variant has its own range and dependence proof. Ordinary unrecognized programs remain eligible for the scalar compiler.

For the finished painter, compare each complete projected coordinate array and each complete image against the scalar source. Record vertex counts and memory alignment *inside the actual painter*. Measure cold compilation and emitted sizes separately from repeated calls to the projection kernel and from display completion. Report absolute costs and the comparison order for each. A faster vertex loop can account only for the time formerly spent in that loop.
