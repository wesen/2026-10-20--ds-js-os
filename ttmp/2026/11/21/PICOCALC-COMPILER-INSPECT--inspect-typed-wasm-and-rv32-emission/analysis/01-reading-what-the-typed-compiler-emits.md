---
Title: Reading what the Typed compiler emits
Ticket: PICOCALC-COMPILER-INSPECT
Status: complete
Topics: [picocalc, compiler, performance]
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: A worked source-to-instruction analysis of the PicoCalc ray tracer on both compiler targets.
LastUpdated: 2026-11-21
---

# Reading what the Typed compiler emits

One pixel of the PicoCalc ray tracer ends its computation in a small function called `typedRayPack`. The function takes color and intensity values, rescales them, and packs the result into the 16-bit format the display uses. On one default 160 × 160 frame, the ordinary native compiler's version of this one function executed 1,740,800 instructions. A research compiler produced the same pixels in 1,126,400 packer instructions. We can account for all 614,400 instructions of the difference at six source-associated divisions. This chapter shows how to reproduce that explanation and apply the same method to another function. [Reproduction script](../scripts/02-replay-inspection.sh)

## What the compiler knows before it chooses a target instruction

A Typed function declares parameters and results. The frontend resolves locals and emits operations such as reading a local, pushing a constant or performing signed division. A frontend operation can refer to more than one storage cell in its numeric representation. In a native compile, for example, an operation followed by its immediate argument occupies two cells. The inspector records the operation's ordinal within the function, its starting offset, its operands and the source token active during emission. The ordinal identifies the operation. The offset identifies its location in that particular representation.

The source anchor gives a reader a line and column. Several operations can acquire the same anchor when an expression finishes parsing. An async function may acquire a generated helper or a rewritten body with its own coordinate system. In that case the function record includes the relevant generated text. This distinction matters when a line number appears to point at a closing delimiter. The instruction can implement the preceding computation. A developer interested in exact syntax-tree spans would need additional parser metadata. [Frontend design](../design-doc/02-frontend-operations-and-final-wasm-offsets.md)

## Where to read the bytes that will execute

The Wasm compiler produces a module with typed signatures and a code section. Within that section, each function body has a length, a local-declaration prefix and an instruction sequence. An integer operand of larger magnitude can require more encoded bytes. Counting source operations cannot recover byte positions. The observer locates the body in the finished module and relates operation intervals to their actual bytes. For the packing example the body occupies 61 bytes in both runs.

The native compiler instead produces a contiguous image of four-byte RV32 instructions, with function entries and a relocation list. It decides whether to allocate a stack frame, lower comparisons directly into branches, spill an operand across a call, or fuse several input operations. Code size changes affect later functions' positions. A local jump can be patched only after its destination is known. The inspector retains the intervals consumed by each real lowering step, applies the final function position, and reads the delivered words. It preserves synthetic prologues and zero-length operations. Calls to imported functions carry relocation indices until linking. [Implementation guide](../design-doc/01-experimental-design-and-implementation-guide.md)

## Why six divisions account for the entire difference

The general signed division path handles a zero divisor and the signed integer overflow case. The candidate sees a positive literal at the point of lowering. Each of 255, 8 and 4 is nonzero, and none can form the overflowing signed division by negative one. Across all six sites in the packer, the ordinary constant and division together occupy 44 bytes per site. The candidate emits eight bytes. Six times 36 bytes accounts for the function shrinking from 392 to 176 bytes. This is a static saving, counted once for each instruction that occupies space.

The default frame calls the function for every pixel. Each of the six operation groups executes 153,600 ordinary instructions across the frame and 51,200 with the candidate. The difference is 102,400 per group, or four instructions per pixel. Multiplying by six groups yields exactly the measured 614,400. Some of the removed words belonged to exceptional paths and were never executed in this render. This explains why subtracting static words and multiplying by pixel count gives an incorrect runtime estimate. The empirical reduction is 35.3% of packer instructions. A whole-frame percentage needs the whole-frame denominator. [Machine comparison](../various/director/pack.diff.txt)

## Which memory traffic deserves an experiment

Scope the exact same frame to `typedRayInShadow`. Its two most frequent stack accesses are at 0x10b4 and 0x10b8. Each instruction ran 67,601 times. The first loads the sphere-loop index from displacement 52 off the stack pointer; the second loads its bound from displacement 40. Their source anchors both fall on line 134 of the ordinary Typed ray tracer. The next group of accesses executed 52,917 times. It contains named locals and a compiler temporary. This gives a researcher a concrete distinction. Keeping a named loop variable in a register requires reasoning about assignments and calls. A temporary introduced by lowering may disappear through a different rule. [Ranked stack accesses](../various/director/shadow-hot.txt)

Instruction fetch counts come from a reproducible execution of one exact image in the host interpreter. The join rejects a different image digest and records unvisited locations with count zero. That makes instruction-count predictions testable. Physical time also depends on the processor, memory and dynamic instruction sequence. The companion scalar experiment therefore measures the same changes on the ESP32-P4. In that experiment two transformations had additive instruction savings and overlapping timing savings. Pairing each workload with final emitted bytes and an independent device clock lets the lab distinguish an explanation of code generation from an explanation of elapsed time.
