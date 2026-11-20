---
Title: What a compiler experiment on one handheld can establish
Ticket: PICOCALC-LAB2-METHODS
Status: active
Topics:
    - performance
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/19/PICOCALC-LAB2-METHODS--independent-validation-of-eight-picocalc-compiler-studies/scripts/01-audit-captures.py
      Note: Independent timing and image checks
    - Path: repo://ttmp/2026/11/19/PICOCALC-LAB2-METHODS--independent-validation-of-eight-picocalc-compiler-studies/scripts/02-check-editor.mjs
      Note: Independent layout, effects and source retention controls
    - Path: repo://ttmp/2026/11/19/PICOCALC-LAB2-METHODS--independent-validation-of-eight-picocalc-compiler-studies/scripts/04-check-selection.py
      Note: Independent held-out budget accounting
ExternalSources: []
Summary: ""
LastUpdated: 2026-11-19T22:20:43.347066544-05:00
WhatFor: ""
WhenToUse: ""
---

# What a compiler experiment on one handheld can establish

A programmer editing an application on the PicoCalc can wait for two different programs. First the compiler translates the source. Then the newly compiled application executes. The measurements favor different compiler changes depending on which wait matters. Replacing the scanner and reusing its token record saved about 307 milliseconds on a cold Editor build. Compiling a comparison directly to a branch added about 36 milliseconds to that build, while the resulting machine code completed the tested comparison routine faster.

This independent methods review covers all eight studies in the second wave. It incorporates the complete two-boot physical frontend, condition, typed-operation and incremental Editor captures. Register allocation, bounds, selection, integration and await are evaluated here with host evidence. Later measurements belong to the supervisor's final synthesis. All physical observations here came from saved serial logs on one ESP32-P4.

## Follow a source edit through both programs

The Editor contains a function that calculates where to store a preview row. Its original expression is `(row % 36) * 100`. Editing the multiplier to 99 changes the result for row 2 from 200 to 198. The compiler must translate the new expression, resolve calls from other functions and link the resulting RV32 machine instructions into an executable file. An emulator can execute those instructions on a workstation. The physical device loads the executable into memory and can call it directly.

Each result answers a specific question. A matching digest of the complete executable checks the bytes against an independently linked clean version. Inspecting the instruction payload gives the number of four-byte words the compiler produced. Timing a call on the physical processor measures the cycles spent on its inputs. The ELF container holds a reserved region for generated instructions, so the file can keep the same byte length after thousands of instruction words disappear.

A cold timing includes creating a QuickJS runtime, evaluating the compiler sources and producing the returned file. The runtime’s counting allocator reports a peak in bytes. C-side allocations, the ELF loader and application state have separate owners. A warm edit timing begins after the parent source and compiler session have been prepared. An edit experiment can therefore reach native return faster than a cold compile finishes without establishing that someone launching the app from storage will see the same saving.

## Attribute a frontend improvement to the changes that produced it

A token identifies a source element such as an identifier or an opening brace. The scanner can recognize the token using a regular expression or advance a cursor through the source characters. The compiler can also allocate a fresh record for each token or overwrite the current record. Changing these decisions independently requires four combinations.

The audit checked all 192 compilation rows across two physical boots, three applications and four choices, including the full ELF digest for every row. Every configuration occupied each position equally often within its boot. For each Editor block I subtracted the candidate time from the control time before summarizing across the 16 blocks.

| Editor comparison | Median time saved | Range across blocks | Faster blocks |
| --- | ---: | ---: | ---: |
| Reuse a token with regex scanning | 115.3 ms | 73.9–139.4 ms | 16/16 |
| Switch to cursor scanning with fresh tokens | 151.7 ms | 134.8–190.5 ms | 16/16 |
| Switch to cursor scanning with reused tokens | 187.4 ms | 157.7–263.7 ms | 16/16 |
| Change both decisions from the original | 306.8 ms | 269.3–346.5 ms | 16/16 |

The cursor saving depends on token lifetime. Computing the difference of the two cursor savings *within each block* gives an interaction of 32.5 ms at the median, positive in every block. Subtracting two published medians generally gives a different value because their central observations can come from different blocks. At the combined setting the median peak increased by 9,194 bytes. The median savings for the two boots separately were 308.5 and 304.6 ms.

The fifth frontend stores offsets and constructs token text when the parser requests it. Its matched control already uses cursor scanning and a reusable token. The second experiment yielded 108 verified rows. Relative to its own matched control the lazy parser **added** 213.7 ms and 6,020 peak bytes on Editor at the median. All 12 paired time differences pointed in that direction. This result accounts for the costs of checking and consuming spans throughout the parser. Counting avoided string slices alone would miss those costs.

## Separate the cost of translating a branch from the cost of taking it

Consider testing `a && b` before entering a loop. A compiler can construct a Boolean result and then examine it. In a branch context it can instead exit as soon as the first operand fails. A stored or returned Boolean still needs a value, and a side effect in the second operand must only execute if evaluation reaches it. The host conditions checker reproduced 802 cases and 3,208 comparisons, including 112 trapping cases.

The physical conditions image reduced Editor from 16,541 to 15,954 words. Across eight matched cold Editor builds it added a median 35.9 ms (range 15.6–77.2 ms) and reduced median peak by 23,246 bytes. On the board a batch of 128 Files string comparisons saved a median 35,736.5 cycles. Those comparisons traverse equal prefixes of length 90 and differ at the last unit. The harness also computes a checksum and returns through the function call. Dividing by 128 gives a batch-average saving of about 279 cycles per invocation under that workload. It provides no timing for complete Editor interactions.

The typed-operation study goes one level earlier. It preserves a checked text or buffer read until native instruction selection. Its observation mode changes the intermediate representation while reproducing the original machine bytes. Direct consumption reduces Editor from 16,541 to 16,174 words. The host reproduced all 126 test inputs, including 46 traps, and checked return values and memory contents. Across 108 physical compilation rows the direct candidate added a median 106.6 ms on Editor and reduced the median peak by 15,700 bytes. The Files compare batch saved 117,748.5 cycles. The weekday batch showed a median difference of half a cycle and mixed signs. Fractions arise from averaging the two middle observations of an even-sized sample.

The comparison and weekday timings each used two warmups and 16 retained batches per boot. A serial log prints measurements sorted by lane after the run. The C loop rotates lanes during execution. Reading the printed order as the execution order would give the wrong account of a potential warmup bias.

One can make an explicitly conditional estimate within the same application. The direct-read Files compiler took an additional median 11,362.5 microseconds. At 360 MHz its measured comparison saving equals 117,748.5 / 128 / 360 = 2.56 microseconds per call. Dividing the cold penalty by that saving gives about **4,447 comparisons** per compile to break even. The conditions version gives about **11,842 comparisons** using the same calculation on its own image. These are ratios of separate medians. Actual file-name lengths, mismatch positions, calls per session and other changed instructions could put an application on either side of either estimate. An event trace counting real comparisons would turn the frequency assumption into a measurement.

## Test the native result of a bounded edit

The edit experiment retains the previous machine code of selected functions. Source text, signatures and record layouts help it decide when reuse is valid. It links every accepted edit into a complete file. I independently staged this compiler and reproduced the five clean executable digests and the byte-identical original host oracle. Under a 40 KiB budget the body edit rebuilt 49 of the 120 functions and reused 71. At 256 KiB it rebuilt just the changed function and reused 119.

Two new controls clarify the cache contract. Inserting 8,192 spaces into the body of a retained function left its machine code and complete ELF identical. The 40 KiB cache held 72 entries and 40,892 native payload bytes before and after the edit. An examiner-only getter summed the lengths of the source strings actually referenced by retained entries. That sum grew from 34,431 to 42,623 UTF-16 code units. Translating that number into heap bytes requires the runtime's string representation. The accounting algorithm also builds a temporary map of all fragments before selecting entries for the next revision. The byte cap applies after publication to native payload alone.

The physical probe calls `editorPreviewFinish` in the relocated image with an initialized state and a 256-unit buffer. In an independent RV32 interpreter the original stored values 5 and 4 at offsets 200 and 201. All four edited programs stored them at 198 and 199 and changed the three state values to 3, 0 and 0. Giving the final layout to the preceding image caused a trap before either store. Giving the correct image a buffer of length 199 allowed the first store at 198, then trapped on the second, before updating state. Thus returned values, memory after a partial operation and the selected state layout supply different evidence.

The body edit has a direct behavioral witness. The signature edit changes how the stride is passed but preserves its value. The handle-field swap changes fields outside this probe. Their clean ELF digests cover changes that this particular execution cannot distinguish. The fourth edit swaps the two state fields the probe does use. The timed interval starts with the already constructed changed source and ends immediately after the native call returns. Parent compilation, explicit garbage collection, later hashing and final teardown are outside it. A complete keystroke-to-display measurement would have to cross the actual Editor event and rendering paths.

The 72 physical edit rows crossed four edits, three policies and three timing rounds on each of two boots. Every file digest, stored cell and state update agreed with the independently regenerated oracle. Each table entry is the median of three within-round differences in milliseconds. A negative saving means the edited-source path took longer than warm clean.

| Edit | 256 KiB, boot 1 | 256 KiB, boot 2 | 40 KiB, boot 1 | 40 KiB, boot 2 |
| --- | ---: | ---: | ---: | ---: |
| Body multiplier | 1,815.5 | 1,795.8 | 735.1 | 728.9 |
| Signature and callers | 1,734.7 | 1,719.6 | 629.4 | 637.1 |
| File-handle layout | 165.8 | 172.7 | -57.2 | -54.9 |
| Preview-row layout | 134.4 | 144.6 | -52.4 | -39.5 |

The 40 KiB policy reused 71 functions on the body edit and only 30 on each layout edit. On the latter it still paid for checking dependencies, assembling the program and maintaining the cache while rebuilding 90 functions. Both layout edits cost time on both boots. The larger budget reused 43 functions even in those cases and saved time on both boots. These are measurements of four specified transitions starting from independently prepared parent sessions. They do not estimate how often users make any one kind of edit.

## Decide which optimizations fit together

Giving a frequently used local variable a register can eliminate repeated stack loads in generated code. Saving and restoring a callee-saved register adds instructions, so the policy selecting homes matters. With the condition compiler as control, Editor produced 15,954 words, the use-count policy produced 12,725 and the loop-weighted policy produced 12,748. The register-home checker reproduced its 29 test inputs across four variants, including the two trap cases. Those static counts alone cannot determine which image completes an interactive workload first.

The host composition joined cursor scanning and record reuse with condition branches, direct typed reads and use-count register homes. The complete integration passed all 24 historical scripts in an independent checkout, including 64 KiB Editor behavior. Some tests exercise shared Wasm or helper paths, so this count describes the historical suite. The matched Editor images occupied 240,452 bytes each. Production emitted 21,886 words, the staged control emitted 16,541, and the integrated candidate emitted 12,444. The latter saves 4,097 words against its staged parent and 9,442 against production. Which comparison one chooses changes both the denominator and the engineering attribution. Adding separately measured time savings would ignore their shared lowering paths.

Bounds proofs offer a different example. An index is safe to read when it is nonnegative and below the string length. From `0 <= i`, `i < end` and `end <= text.length` a compiler can prove all three relationships remain valid at one read in a guarded copy. The test deliberately added the guard and retained a fallback copy. On that common source, checked and directly proved compilers both emitted 16,214 Editor words. Bounded search emitted 16,210. The unmodified direct-read Editor emitted 16,174. Thus four words were saved within the guarded source comparison, while the whole intervention grew by 36 words against the unmodified source. The independent replay matched all 357 fixture cases, including 94 traps. It checked effects that invalidate a previous proof and the distinction between source and destination bounds.

## Evaluate a selection policy on an input it has never seen

A compiler with a fixed allowance of analysis visits must decide which functions deserve the work. The selector experiments charge two visits per eligible intermediate-code cell for the proof pass. They value an outcome by instruction words eliminated. These units correspond to different resources. A policy that scans the module once to rank candidates also consumes work before the proof pass.

The supervisor held out a separate family of 72 raster arithmetic functions. I reran the frozen evaluator on three source orders and independently reconstructed the choices from its function rows. Exactly 18 functions contributed all 1,386 removable words, with a combined proof charge of 7,596. That charge fits the allowance of 32,768, so choosing all 18 gives a direct proof of the optimum. Both a literal filter and a density ranking selected those functions in every order. Source order saved 1,386 words for the clustered order, 407 for the reverse order and 1,232 for the shuffled order. Three arrangements of the same functions establish sensitivity to order. They contribute one independently constructed workload family.

The selection study's own distributed held-out family shows a different tradeoff. The reported median density result achieved 99.9% of the full-budget optimum when ranking work was charged separately. Debiting the planner's cell visits from the shared allowance reduced that median to 32.4%. Source order achieved 75.1% under either accounting method. The ratios in both cases use the full-budget optimum as denominator. A second parse, sorting and object allocation also affect elapsed time. On the real Editor, all eligible functions together cost 4,278 visits and all policies saved the same 83 words. For this program the benchmark's nominal 32,768-visit budget never forced a choice.

## Follow one suspended file operation through completion

The async candidate splits a typed Editor Open into a function that issues the read and another that accepts its completion. An outstanding positive token distinguishes an active read. The generated frame keeps that token, the handle and the file-name size in three 32-bit fields. The state record grows from 71 to 74 fields. The handle permits cancellation cleanup. The size is needed when the operation resumes. The current event's output buffer is supplied afresh.

I independently regenerated the lowered Editor source and both complete target images from it. The focused examiner fixture executes a smaller generated program in WebAssembly. It canceled token 21, opened token 22, rejected the delayed completion for 21 and accepted 22 exactly once. Only the new output buffer received value 7. A wrong event kind and a duplicate completion were also ignored. Adding an actual use of the old scratch-buffer alias after the await in the real Editor source produced a compiler diagnostic. Those checks distinguish scalar frame contents from the lifetime of an external buffer. The small fixture stubs the file operation. The design’s physical cancellation event is injected into a loaded handler because normal mailbox scheduling queues a second message behind the active turn. Claims about concurrent user cancellation require a separate delivery experiment.

## What the experiments add

The local technical contributions are specific enough to reproduce. The factorial design separates token lifetime from scanner implementation on the actual compiler. The guarded Editor experiment locates one proof in a named function and quantifies the source intervention that enabled it. The retention experiment proves by construction that the same native byte budget and image can coexist with different amounts of retained spelling. The selector experiment identifies when charging for discovery reverses the ranking of policies. These contributions establish behavior of this compiler, corpus and board. Establishing priority for an algorithm in the research literature would require a separate comparison with prior work.

## Reproduce the measurements

The source repository is `/home/manuel/code/wesen/2026-10-20--ds-js-os`. The dated ticket `PICOCALC-LAB2-METHODS` contains the prospective guide, scripts and outcome receipts. The supervisor ticket `PICOCALC-COMPILER-LAB2` links each treatment's implementation, physical oracle and runtime controls. The capture parser checks matching application and reactor identities, complete blocks, counterbalancing, successful compilation and every reported ELF digest. The edit and await probes use deterministic values whose expected behavior is independent of timing.

A production decision depends on the wait the application needs to shorten. The cursor and reused token have a directly observed Editor cold-build benefit. The condition and typed-operation studies offer measured guest improvements at additional cold compile cost. The cache and selector studies establish narrower resource contracts that can be tested directly. Turning these findings into a default for the installed editor requires measuring the chosen combination on its actual edit, load and interaction paths.
