---
title: "What does a faster PicoCalc compiler change?"
aliases: [PicoCalc RV32 Independent Examination]
tags: [article, picocalc, compilers, riscv, measurements]
type: article
created: 2026-11-19
repo: /home/manuel/code/wesen/2026-10-20--ds-js-os
Ticket: PICOCALC-RV32-STUDIES
DocType: reference
---

# What does a faster PicoCalc compiler change?

Consider the typed PicoCalc expression `if (x === y) return 19;`. Changing how the compiler translates this line can save work every time the program executes it. Changing where the compiler stores the instructions it has just generated can save work while building the program. The second change can produce exactly the same executable file. The first can produce a different instruction stream inside a file of exactly the same length. Each needs a different test.

The PicoCalc system in this study runs on an ESP32-P4. An application author writes functions in a small typed JavaScript-like language. A frontend reads that source and emits structured operations, including arithmetic, comparisons and conditional blocks. One backend writes those operations into WebAssembly (Wasm), which we can execute on a development machine. Another translates them into native instructions for a 32-bit RISC-V processor (RV32). On the device the compiler itself runs in QuickJS, a JavaScript interpreter. Building a program and running it are separate workloads even when they occur on the same processor.

This independent examination starts from the frozen compiler at `6426798`. One proposed backend fuses an adjacent comparison and conditional branch. Two other variants move emitted instructions into 4 KiB buffers, with an additional direct-copy option for linking applications. The independent tests and receipts live in the repository's `PICOCALC-RV32-STUDIES` ticket. All candidates discussed here are experimental.

## Follow one comparison from source to result

For two equal inputs, including two copies of the most negative signed 32-bit integer, the example function must take the return-19 arm. For unequal inputs it must reach a second return, which our fixture sets to −37. The original backend evaluates equality into a register holding zero or one. It branches on that register. The candidate compares the two original operand registers in a branch instruction. Both use a short branch and a separate jump because the target block can be too far away for the short instruction to reach.

Here is the effect of the relevant instructions, with symbolic register names. The frontend first evaluates the operands into `left` and `right`. In the original lowering the temporary value can reuse an operand register once that operand has been consumed.

```text
Original                         Fused
different = left XOR right
equal = (unsigned different < 1)
if equal != 0, skip one word     if left == right, skip one word
jump to the alternate arm        jump to the alternate arm
return 19                        return 19
```

The short branch jumps over exactly one 4-byte instruction. That instruction is a longer-range unconditional jump which the compiler patches once it knows where the alternate arm begins. Equality saves two operations on each execution of this comparison. A signed less-than comparison can save just one. The lowerer must preserve operand order for `>` and `<=`, unsigned order for text bounds, and the meaning of an intervening boolean negation.

A boolean can survive a comparison. For `let flag = x === y;`, a later expression may return or compare that stored value. The fusion candidate looks only at an adjacent control consumer, optionally separated from the comparison by one negation. Short-circuit operators introduce a further constraint. For `x < y && touch(trace, 5)`, the call must execute once only on the true path, even when a larger expression later discards its result. If the call executes on a path that should skip it, a final return of −37 can still match. The extra record update makes the difference visible.

## Execute the new words

The guest test compiles one source through both backends. Its Wasm result runs in Node's Wasm engine. Its RV32 result becomes the text of an ELF executable, the file format that tells the test emulator where to start running instructions. An assembly driver calls the exported entry for each input, supplies equivalent data structures in the emulator's memory, and writes the results back to the host. The only code generation performed by GCC here is assembly and linking of the driver. The function bodies are the candidate's actual bytes.

Each normal call records the return, two integers that capture the number and order of calls to `touch`, a 32-bit word containing the first two UTF-16 code units, and a final 16-bit unit. The input is reset before each invocation. The driver also checks that the guest restores the stack pointer on return. Six further processes exercise access before the start or at the exclusive end of the buffer. On these, the harness expects a Wasm runtime exception and an emulator report that the generated breakpoint executed. A timeout or an accidental normal return fails the test.

| Question | Input that exposes it | Independent result |
|---|---|---|
| Does equality and signed order survive reversal? | All 25 pairs drawn from minimum i32, −1, 0, 1 and maximum i32 | Matching returns and side effects for all five scalar relations |
| Can a stored operand change when a comparison uses scratch registers? | A value-producing `Math.max(x,y)` beneath 0, 4, 5, 6 and 8 live operands | All 125 calls agree, including across the five-register boundary |
| Can a negative offset read an earlier memory word? | Indices −1 and minimum i32 on a three-unit buffer, plus index 3 | Both backends trap on the selected reads and writes |
| Can a far conditional skip or enter its complete body? | A block containing 475 record updates, entered once and skipped once | Both output records and returns match |

Across 637 returning cases and six trap cases, both RV32 versions agreed with Wasm. The raw instruction image fell from 16,140 to 15,828 bytes. Two counter reads around each returning call measured 41,051 instructions in total for the original and 39,026 for the candidate, a difference of 2,025. Each window includes the same argument loads, entry, result store and counter bookkeeping. This makes subtraction meaningful for the specified inputs. Processor cycle costs, display drawing and the population of real-world inputs require their own measurements. All three compilers share the frontend's understanding of source types. A shared frontend bug would need a separate language-level oracle.

## Follow a call through assembly and linking

A native function can call an earlier function or a runtime service provided by the application template. A call to an earlier function can acquire its final relative displacement after the compiler lays out the whole module. The template contains entry stubs through which its runtime calls typed functions, and service trampolines through which typed functions call back into the runtime. A call to a service requires a *relocation*, a record identifying the instruction to patch and the service index. The application linker patches it to jump to a service entry in the template.

The original backend accumulates a JavaScript array of 32-bit instruction words per function. It fills in jump targets, allocates one contiguous byte array of the final image length, and serializes words into it. The linker copies an existing application template and inserts the image into a reserved executable area called the slot. It patches entry and service jumps in the copy. The template includes runtime code and unused slot space, so occupying fewer slot bytes can leave the size of the ELF file unchanged.

The compact candidate emits to a single module-wide sequence of 1,024-word typed arrays called slabs. Each instruction has an absolute word index from the module's start. In a 4 KiB slab, word 1,023 is the final word in the first array and 1,024 is the first in the second. The raw compiler still returns one contiguous byte array. On the direct linking path, the public application wrapper passes the slab representation to the linker, which writes slabs into the copied template and patches imports there.

The difficult test is a structure that spans both coordinate systems. We padded a source until the function named `__proto__` started at word 1,023. The lowerer reserves two words at the start of a function, computes stack-frame size after emitting its body, and patches both words. This prologue straddles the array boundary. Later functions call it, call one another, and call services 0 and 131. A correct raw image has zero placeholders at import relocation offsets even though a correct linked image contains executable jumps at those same sites.

The 143-function module had 132 declared imports and 139 relocations. Both candidates produced the frozen compiler's 14,116 bytes and all its metadata, including the entry named `__proto__`. The test retained results during further failed and successful compilations in the same JavaScript realm. All retained results remained byte-identical. Default streaming, explicit streaming and buffered compilation agreed for this input.

## Output identity and temporary memory

A source-to-image test leaves the application wrappers unexamined. The Files, Agenda and Editor wrappers select the backend, check the required function signatures or record layout, then invoke the linker. We called each one with a real template as a byte-array view starting 13 bytes into its backing store. This exposed any assumption that a view always covers its whole buffer. Each complete output matched the original byte for byte and the surrounding sentinel bytes remained intact.

| Application | Raw image bytes | Slabs of 4,096 bytes | Unused tail bytes | Linked ELF bytes |
|---|---:|---:|---:|---:|
| Files | 3,216 | 1 | 880 | 24,424 |
| Agenda | 16,232 | 4 | 152 | 66,364 |
| Editor | 87,544 | 22 | 2,568 | 240,452 |

On the compact wrapper path, our constructor observer saw each of the exact raw image sizes in the table allocated as a numeric-length byte array. On the direct path those three allocations disappeared. Both paths allocated the listed slabs. For Editor, copying 22 slabs uses 22 views into their backing stores. Creating a view does not duplicate its underlying words. Both paths still need a writable result ELF, and the device's C caller later copies the returned result to its own buffer.

A 2,568-byte unused tail and the absence of an 87,544-byte temporary are facts about a particular compilation. Peak memory is the maximum simultaneous live allocation during the full run. An earlier phase can set this maximum before the eliminated buffer would have existed. Counting constructor calls alone cannot tell where the maximum occurred. A byte-identical executable from the output study also has no reason to execute different instructions when loaded at the same address with the same state.

## What should fail first?

A compiler communicates its contracts through errors as well as through returned bytes. The frozen whole-module compiler lets the frontend finish checking source before reporting any backend failure it saved while processing earlier functions. After successful lowering, it resolves jumps. The public typed-world wrapper then validates the required interface before inspecting the runtime slot. Changing when an error is thrown can change what a developer learns from one invocation.

We built one 67,847-code-unit source function whose ordinary UTF-16 literal stores expand a conditional beyond the native jump range. The test used the public compiler's explicit 128 Ki-code-unit limit. We also constructed a function taking nine arguments, one more than the backend's register argument limit, and a function declared to return an integer that actually returns a boolean. The combination distinguishes three stages even though each stage can raise the same JavaScript exception class.

| Presented errors | Error reported by all three output variants |
|---|---|
| A jump beyond range by itself | RV32 jump exceeds the instruction range |
| Far jump and nine arguments in either source order | RV32 supports up to eight register arguments |
| Either preceding pair and a trailing return type error | SyntaxError at 1:67973, expected i32, got bool |
| Invalid typed-world entry signature and undersized slot | Typed world requires its correctly typed event entry |

A second fixture used a 116-byte native program. Its slot also required a 20-byte header, two 4-byte entry instructions and 28 service jumps of 4 bytes each. The sum is 256 bytes. The direct and compact paths both linked that exact-fit case. Reducing capacity to 252 bytes produced the expected fit diagnostic. Eleven failure combinations were checked against the frozen compiler, including an invalid final service trampoline and an invalid runtime supplied with bad source metadata.

## Find the phase that owns the high-water mark

The supervisor ran four fresh Editor compilations of each uninstrumented implementation in one ESP32-P4 boot. Every implementation appeared once in each schedule position. Each started before reading the source and reactor and ended after destroying the QuickJS runtime. The allocator recorded the usable sizes of its live blocks. It excluded the ordinary C buffers that held the original template, source and returned file. The experimental fixture used a four-MiB QuickJS heap budget and a six-second deadline.

I independently parsed the UART log, checked every recorded Editor result against its ELF hash, and recomputed the medians within matched four-way blocks. The differences below are medians of four candidate-minus-baseline observations. Separately taking the median of each implementation's measurements and subtracting can produce a different number.

| Candidate | Cold compile time difference | QuickJS peak difference |
|---|---:|---:|
| Branch fusion | −32.96 ms | −16,150 bytes |
| Compact output, then raw image | −78.95 ms | −7,720 bytes |
| Compact output directly into template | −150.66 ms | +3,218 bytes |

The direct route removed the raw Editor byte array and nevertheless had the largest uninstrumented QuickJS peak of the four. Two instrumented runs each for the original and direct variants help locate the reason. At assembly, the original median phase high-water was 1,415,086 bytes and the direct candidate's was 1,208,626 bytes. Time in that phase fell from 149.79 to 45.15 ms. Later, while the direct linker allocated and filled the copied template, accounted memory reached 1,414,468 bytes. On entry, the phase observer charges already-live bytes to the new phase. Phase 6 therefore reports the same high-water without requiring another large allocation. The original's copy phase instead reached 1,394,058 bytes. The copying phase sets the direct peak even though the rewrite substantially reduces the cost of preparing the code.

Subtracting a baseline phase peak from a direct phase peak describes one stage. Subtracting whole-run peaks from the uninstrumented trials answers the separate footprint question. The extra code and callbacks in the instrumented run change the absolute heap numbers.

## What the board executes in the Files comparison

The Files application compares directory entries by directory flag first and then by their UTF-16 names. A long shared prefix sends the comparison repeatedly through the character loop. Different directory flags can resolve the ordering before it reads any characters. The supervisor embedded the actual compiled leaf function in two versions in the same native firmware. A leaf here means that every control transfer inside the extracted function stayed inside its own body except the return. This allowed either version to be called directly against the same arguments.

I read the linked firmware's executable segment at each symbol address and checked its size, SHA-256 and runtime-reported checksum. The baseline body was 428 bytes at `0x400bb2b8`. The candidate was 392 bytes at `0x400bb478`. Both occupied the same offset within a 64-byte alignment interval. The function arguments, initialization and returned checksums were identical. The program ran on core 1 at 360 MHz.

Each measurement times a batch of 128 calls and its common checksum loop. Sixteen paired blocks per input alternated which implementation ran first. All 80 block and fixture identities, their return checksums and run order verified against the serial log. The cycles column gives the median of each paired difference divided by 128. The percent column gives the median fraction saved relative to that pair’s original count.

| Name inputs or early decision | Median cycles saved per call | Paired saving | Blocks with a lower candidate count |
|---|---:|---:|---:|
| 91 identical code units | 912.36 | 13.95% | 16 of 16 |
| Mismatch at unit 91 | 910.11 | 13.96% | 16 of 16 |
| 71-unit shared prefix with different lengths | 712.12 | 13.90% | 16 of 16 |
| Mismatch at the first unit | 9.96 | 9.48% | 14 of 16 |
| Directory flag decides | 0.01 | 0.04% | 9 of 16 |

The long-path direction held in both sets of eight first-position orders. On the directory path, separating the orders produced opposite signs, −0.031 and +0.023 cycles per call. This input supports no measurable directory-path speedup in this run. Repeated long names provide a physical example where fusion improves execution. A directory listing's total latency also depends on its contents, the number of comparisons and drawing, none measured in this loop.

## Engineering disposition

Branch fusion preserved the sampled source semantics, reduced dynamically executed work, and sped up the leaf function on the paths that repeatedly use comparisons. Its operand order, unsigned bounds checks, spilled comparisons and materialized-value controls deserve permanent functional tests if adopted. The evidence supports qualifying the candidate for a separate integration. It does not establish a general percentage for whole applications.

Both output implementations met the stronger byte-identity contract. Compact storage improved both uninstrumented measures on this Editor build. Direct linking improved cold time further while increasing the peak slightly above baseline. A project choosing between them should use the hard memory budget and the importance of cold time for its target workload. The 87,544 bytes of removed intermediate storage cannot be claimed as a whole-process saving. Neither experiment was combined with the other, so these measurements do not predict the time or memory of a combined backend.

## Reproduce the examination

The repository is `/home/manuel/code/wesen/2026-10-20--ds-js-os`. From its root, find the supervisor ticket under `ttmp/2026/11/19/PICOCALC-RV32-STUDIES--*`. The examination scripts are in `scripts/examiner/`. Complete JSON receipts are in `various/examiner/`. The implementation of the independent tests was committed as `d433cce`. The scripts load production compiler files from the frozen Git object. A candidate directory overlays the files selected by the study. Each receipt records the backend digest actually evaluated.

Generate the branch pair with the branch ticket's `scripts/01-construct.sh` and each output mode with the output ticket's `scripts/01-prepare.py`. Run the guest script with the ESP GCC cross-compiler and the repository's CJI RV32 emulator. The output script takes a directory containing the Files, Agenda and typed-world native reactor templates. The JSON receipt records the three template digests, which distinguish linker differences introduced by building a different template.

```sh
node "$exam/guest.mjs" "$gcc" "$emulator" baseline
node "$exam/guest.mjs" "$gcc" "$emulator" branch "$pair/candidate"
node "$exam/output.mjs" compact "$compact" "$reactors"
node "$exam/output.mjs" direct "$direct" "$reactors"
```

The first pair answers a behavioral and instruction-count question with two executable engines. The second answers a storage and public linking question with byte and metadata identity, and shows exactly which raw allocation disappears. The accompanying board evidence places those results in the cost of a full cold compile and a heavily repeated comparator call.
