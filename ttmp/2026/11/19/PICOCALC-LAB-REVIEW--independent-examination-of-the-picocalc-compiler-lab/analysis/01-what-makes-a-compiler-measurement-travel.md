---
Title: An independent examination of four PicoCalc compiler experiments
Ticket: PICOCALC-LAB-REVIEW
Status: active
Topics:
    - picocalc
DocType: analysis
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/11/19/PICOCALC-LAB-REVIEW--independent-examination-of-the-picocalc-compiler-lab/scripts/02-policy.mjs
      Note: Controlled source-order transfer counterexample
    - Path: repo://ttmp/2026/11/19/PICOCALC-LAB-REVIEW--independent-examination-of-the-picocalc-compiler-lab/scripts/03-native.py
      Note: Independent ELF decoding and forecast residuals
    - Path: repo://ttmp/2026/11/19/PICOCALC-LAB-REVIEW--independent-examination-of-the-picocalc-compiler-lab/scripts/04-board.py
      Note: Boot, block, position and artifact checks
    - Path: repo://ttmp/2026/11/19/PICOCALC-LAB-REVIEW--independent-examination-of-the-picocalc-compiler-lab/scripts/05-rebuild.mjs
      Note: Full Editor edits checked against clean images
ExternalSources: []
Summary: Independent examination of P4 timing, linked machine code, a bounded-analysis counterexample and 120-function Editor rebuilds.
LastUpdated: 2026-11-19T20:54:34.214877929-05:00
WhatFor: ""
WhenToUse: ""
---
# An independent examination of four PicoCalc compiler experiments

Changing one integer in PicoCalc Editor’s source caused one of its 120 functions to rebuild. Changing the signature of that same function and repairing its three callers caused four functions to rebuild, yet **42 functions had different bytes in the final executable**. Both results were correct. Building a function produces instructions. Linking a program gives those instructions their final addresses. An unchanged caller may need a different distance to its callee after a third function grows between them.

This distinction runs through the compiler lab’s results. A faster scanner can use more compiler memory. A slower native compiler can build a faster program that needs a smaller running world. A cheap arithmetic analysis can eliminate the same checks as an expensive one on Editor and lose every available saving on another arrangement of functions. I examined these claims using the raw physical measurements, separate host checks and the actual compiled programs. The device supervisor supplied the physical evidence. I had read-only access to the implementations and did not operate the board. [Examination design](../design-doc/01-examining-the-four-compiler-experiments.md) · [Investigation diary](../reference/01-independent-examination-diary.md)

## Four questions about the same build

A PicoCalc application, called a *world*, can be written in a typed JavaScript-like language. A QuickJS runtime on the ESP32-P4 reads the application’s source, checks it, and emits RISC-V machine instructions. The compiler normally releases each function’s intermediate operations after lowering them to machine code. It then collects the instructions into an image and links that image into a precompiled ELF module called a reactor. This reactor supplies entry points and services, including the running world’s interface to the OS.

| Question | Observation | What else can contribute |
| --- | --- | --- |
| How long does a fresh compile take? | Outer time from the normal compiler wrapper through result handoff and teardown | Script evaluation, parsing, lowering, assembly, linking, allocation, interrupts |
| How much space does compilation need? | Maximum simultaneous live usable bytes in the QuickJS allocator | Code and data surviving earlier phases. The C output buffer and loaded native world have separate accounting |
| How large is the compiled program? | Count of emitted 32-bit words, linked ELF length, and the loader’s reported world size | A compiler can eliminate instructions while the reserved ELF slot stays the same size |
| How fast does an edit become a usable artifact? | Time from a supplied edited string in a live session to a linked replacement ELF | Reuse validation, changed bodies, call relocation and copying the result. Actual launch or display requires its own endpoint |

An artifact identity ties several of these observations together. SHA-256 of a full ELF produced from a source string by two different paths supplies a strong check that the paths built the same artifact. One equal hash does little to establish correctness for source changes, and two different hashes can both represent correct programs. For changes that intentionally generate different instructions the lab also ran independent expected outputs and application workflows. The compact audit records include the input and executable identities needed to reproduce these comparisons. [Physical audit](../scripts/04-board.py) · [Native audit](../scripts/03-native.py)

## How to read a 300 ms result

A *cold* compile starts a fresh QuickJS runtime. The researchers kept the normal source and reactor inputs and included the cost of evaluating the compiler. The physical board stayed up for multiple invocations. A balanced block ran every compiler arm on Files, Agenda and Editor, with variants rotating through the available positions. The three apps always appeared in that order. To compare the scanner against the control I subtracted within each block, took a median for that boot, then kept the next reboot as a separate observation. All observations came from one physical board.

The specialist’s runner evaluated the production regular-expression scanner, the cursor scanner and a phase-instrumented version of each. The supervisor separately built a two-arm firmware to replicate the two clean versions. The same input sources and the same compiler script hashes ran behind a different measurement harness. The two-boot specialist trial contained 96 measured application compiles and the two-boot replication contained 48. I checked all block positions and ELF identities and independently recomputed these numbers.

| Editor on the P4 | Median change in cold time, ms | Range of individual paired changes, ms | Median change in peak QuickJS bytes |
| --- | ---: | ---: | ---: |
| Specialist boot 1 | −289.8 | −314.1 to −284.8 | +9,036 |
| Specialist boot 2 | −297.9 | −302.6 to −284.6 | +9,020 |
| Supervisor boot 1 | −292.4 | −309.6 to −283.9 | +9,066 |
| Supervisor boot 2 | −315.4 | −328.1 to −288.4 | +9,070 |
| Separate identical-script calibration, one boot | +2.2 | −5.2 to +6.8 | −42 |

The calibration gives an empirical scale for small differences on this fixture. It is a single four-block realization, so its extrema are unsuitable as statistical confidence limits. The scanner difference for Editor was much larger in every pair. Every measured Editor median also shows higher heap use. The specialist’s stricter check of the maximum peak per boot found increases of 8,964 and 9,016 bytes. On these measurements the scanner failed both parts of the requested 500 ms and nonincreasing-heap target. A plausible explanation of that extra memory is that the new compiler retains both a cursor implementation and its regular-expression fallback. The experiment did not identify which object accounts for the extra live bytes at the peak. [Specialist board audit](../various/frontend-board.json) · [Supervisor replication](../various/independent.json) · [Calibration](../various/smoke.json)

The marked variants explain part of the time difference. Each Editor compile read 16,793 tokens or end markers and streamed 120 native functions. For every traced build I checked that exclusive phase times add to elapsed time and the maximum phase heap reproduces the outer peak. On the second boot, matching and token handling respectively occupied about 649 and 372 ms in the marked control, against 579 and 141 ms in the marked cursor. Probe costs were asymmetric. Marking added about 164 ms to control and 139 ms to cursor on that boot. The clean pair estimates the delivered speedup. The traced pair shows which code paths justify investigation. Holding the scanner algorithm fixed while varying token reuse on the board would distinguish costs that are bundled in this treatment.

I tested scanner behavior independently at its smallest interface. For each of the 65,536 UTF-16 code units I put that unit between two ASCII letters, then compared token kind, value, start position, next offset and final diagnostics. I added 4,096 three-piece combinations covering comments, CR, LF, quotation, escapes and operators. All 69,632 traces matched in Node, and replaying the same corpus through both scanners in host QuickJS produced the identical SHA-256 over their complete traces. Most inputs intentionally fail. This includes fallback behavior that could have been lost by accepting only the common fast path. The specialist and supervisor also exercised public compiler entry points and verified linked application outputs. These checks address different failure modes. [Lexer examination script](../scripts/01-lexer.mjs) · [Trace identities](../various/lexer.json)

## Predicting code size and inspecting the linked result

The native compiler can defer loading an operand until it sees how the operand is used. For `return x + 1`, a deferred constant can be encoded in an add-immediate instruction. The staged design also changes where locals are materialized, when return addresses need saving, and how branches reach their targets. These decisions consume compiler time. Their benefit may arrive later when the guest application executes.

The researcher first measured 593 words on Files against 738 for the older fusion candidate and 804 for production. Before running the Agenda candidate, the researcher committed a model-only computation over Agenda’s typed operations. The center was 2,789 words with a prespecified ±5% tolerance. The measured result was 2,793. Signed error was +4 words, or +0.143% of the prediction. The per-function accounting is more informative than this aggregate. Twenty-five of 34 predictions were exact. Six functions had positive errors totaling seven words, and three had negative errors totaling three words. The total absolute error was ten words. This tested transfer of a known lowering model to one additional program with known operations. Predicting this count provides no calibrated probability for the next app’s count or guest speed. [Per-function residuals](../various/native-elf.json)

Editor’s staged output contained 66,164 instruction bytes. I inspected the final ELFs for the 224 KiB and 80 KiB variants independently, found the slot header inside the executable load segment, and decoded the signed target displacement of every conditional branch and direct jump. Both images had the same payload hash and export offsets. Their 1,006 conditional branches and 747 internal unconditional jumps had aligned targets inside the payload, and 145 direct calls landed on an import trampoline. An import trampoline is a short entry the generated program can call to reach a supplied service. The 120 indirect transfer instructions require separate calling-convention and behavioral evidence. The lane’s emulator replay of a real edit-and-save workflow produced identical output and counted 2,157,263 instructions in each reactor. [Independent ELF and branch analysis](../various/native-elf.json) · [Workflow replay](../../PICOCALC-STAGED-RV32--a-staged-operand-stack-for-picocalc-rv32-compilation/various/slot-replay.json)

The small reactor’s 81,920-byte reservation pays 20 fixed header bytes, two four-byte exports and 28 four-byte imports. That leaves 81,780 bytes for executable instructions, with 15,616 remaining after this Editor build. Both the ELF on disk and its executable load segment shrink by 147,456 bytes. The writable segment still requests 487,880 memory bytes. In the standard-slot matched physical compiler trial, building staged Editor took an additional 445 and 444 ms and increased compiler peak by 28,950 and 28,936 bytes. On the same P4, the staged Files comparison and Agenda calendar kernels took about 25–26% fewer cycles per call. An Editor execution-time number cannot be inferred from those two kernels. [Matched native results](../various/native.json) · [Raw physical measurement](../../PICOCALC-COMPILER-LAB--measure-cold-compilation-and-test-bounded-compiler-designs-on-the-handheld/various/native-physical.json)

## Selection under a finite work budget

Signed division needs a zero-divisor guard and an overflow guard. The smallest 32-bit signed value divided by −1 traps under the typed language’s Wasm arithmetic. With a literal divisor 3, neither exceptional case can occur. The backend can remove two words for the first check and seven for the second. With a literal −1 the overflow guard must remain. My direct compilation of `x / -1` counted a fall from 21 to 19 words and from two trap instructions to one. A function with a conditional assignment of an unknown divisor retained its guards. Separately, the lane executed trapping and returning guests against Wasm semantics. [Arithmetic boundary checks](../various/policy.json)

Always analyzes every function up to a 2,048-cell intermediate-body limit. Select also checks an operation-presence flag and spends a fixed allowance in source order. Admitting one function debits twice its numeric body length, an upper bound on cells visited in two scans. Its five typed arrays hold 1,280 backing bytes together. Building the flag, allocating and initializing table objects, checking proofs during lowering and retaining compiler scripts cost time or memory outside that cell count. In particular, 7% of *charged work* does not imply 7% of whole-build time or peak heap.

On held-out Editor the preregistered rule chose seven of 120 functions. Always charged 60,740 cells and Select charged 4,278, or 7.04% as many. Both removed 17 zero guards and seven overflow guards. The measured reduction is therefore 2 × 17 + 7 × 7 = 83 words. None of the app’s removed guards needed a proven local variable. The local-variable machinery is a tested feature whose additional value on this app is unestablished. On the two physical boots Select saved about 403 and 398 ms relative to Always, yet added about 50 and 54 ms and roughly 15 KB of compiler peak relative to production. The exact same static facts can be profitable against one baseline and expensive against another. Agenda’s eight-date kernel used about 11.7% fewer cycles, which makes workload frequency relevant to an engineering decision. [Bounded board audit](../various/bounded.json) · [Held-out Editor host receipt](../../PICOCALC-BOUNDED-FACTS--budget-per-function-facts-in-the-picocalc-streaming-compiler/various/host-editor.json)

I constructed a case where the budget must choose. Thirty-six functions each perform 80 divisions using a runtime divisor. One function performs 80 divisions by 3. All 37 have the same numeric body size and do not call one another. Every function passes the operation-presence screen. Changing the source order moves the sole productive function without changing its contents or the total work available.

| Position of the literal-divisor function | Always savings | Select charge | Select savings | Recovery |
| --- | ---: | ---: | ---: | ---: |
| First | 720 words | 31,752 cells | 720 words | 100% |
| Last | 720 words | 31,752 cells | 0 words | 0% |

Select’s 32,768-cell allowance admitted 28 of the 37 equal-cost functions. In one ordering the productive function was in that prefix. In the other ordering the compiler spent its allowance on runtime divisors that yielded no proofs. This is a post-result stress test of the frozen policy. The successful Editor forecast remains intact. Its budget had admitted every candidate function. That environment tests whether an opcode filter preserves opportunity on sparse real code. The new fixture tests whether the compiler chooses profitable analyses when demand exceeds supply. A good next transfer experiment would freeze a ranking using only information available before proof construction and reserve unseen programs with enough competing candidates. [Stress-test generator](../scripts/02-policy.mjs) · [Both source orders](../various/policy.json)

## What a cold control can conceal in a live boot

A firmware backup identifies precisely what was installed, but the installed image can predate the lab’s frozen compiler. I searched the factory backup for the exact frontend, backend, Editor source and reactor bytes. The source and reactor matched. Both compiler scripts matched repository revision `08fbae85985b`, with earlier instruction decoding. Neither script from the experiment’s frozen `40bcf850a580` control was present. The generic physical trial images contained the frozen scripts and their declared candidates. [Firmware identity checks](../scripts/07-firmware.py) · [Hashes and bundle offsets](../various/firmware.json)

This matters when booting a normal small-slot world. Subject to independent validation, the normal boot can establish that a specific ELF ran and that the world occupied a measured amount of memory. Comparing its compiler time and heap with the older installed image changes more than the reservation. The supervisor therefore arranged a normal boot of the same staged lowerer in the standard reservation as a matched reference for the slot change. For the half-second target the same frozen production compiler must serve as the reference, in a comparable measurement configuration.

## A real edit changes dependencies and addresses

A persistent session keeps the previous source and compiled fragments. A *fragment* contains a function’s instructions and the information needed to finish external calls after final addresses are known. On a new request the compiler reads headers, identifies exact previous function source, checks the signatures of functions it called and the layouts of records it used. It rebuilds affected fragments. It assigns addresses to every function, patches relative calls, validates the world ABI and links an entire replacement ELF. A failed edit must leave the last successful revision usable. An *ABI* specifies the externally required functions and record layouts that the native reactor understands.

For an independent test I started with the full 70,859-byte Editor and a stock shared-world reactor. After every edit I compiled the entire edited source again with a fresh frozen stock compiler. For successful edits I compared all 240,452 ELF bytes, then identified the byte span of each function in the final linked artifact. For rejected edits I compared the error’s name and message and checked the session still held its most recent valid revision.

| Sequential edit | Fragments rebuilt | Fragments reused | Functions with changed linked bytes |
| --- | ---: | ---: | ---: |
| Change the preview helper’s multiplier from 100 to 99 | 1 | 119 | 1 |
| Add a stride parameter and repair all three callers | 4 | 116 | 42 |
| Swap adjacent same-typed fields in WorldState | 77 | 43 | 7 |
| Insert a comment between declarations after a rejected ABI edit | 0 | 120 | 0 |
| Undo to the initial Editor source | 78 | 42 | 42 |

The first version of the new signature left the old one-argument calls in place. Both implementations reported the same diagnostic at line 723, column 53. Repairing the source grew the generated program by 28 bytes. New call displacements changed additional linked bodies even though those callers reused their compiled fragments. The state-layout edit preserved each field’s type, so it remained valid source, but two offsets changed. Whole-record dependency checks caused 77 functions to rebuild. Seventy of those produced the same bytes they had before the edit. A finer dependency representation might record individual accessed fields. Its extra storage and validation cost would have to be measured.

As a final check I changed the order of two required fields in the externally specified WorldEvent record. Both compilers rejected the ABI. Inserting the comment into the previous *valid* revision reused every fragment and reproduced the previous hash. Undo reproduced the original ELF. This audit establishes artifact and diagnostic agreement for these concrete edits. The edits include artificial changes to Editor policy and its internal layout. These results do not assert compatibility with previously saved application state, user interaction latency, or measured execution of these modified Editors. [Independent edit sequence](../scripts/05-rebuild.mjs) · [Images, diagnostics and fragment counts](../various/rebuild.json)

## Grading a forecast in the right units

The lab also gave two researchers the same numerical packet from a prior compiler study. It showed first-boot measurements of two changes in isolation. The respondents predicted their combined effect on a second boot whose results the supervisor already knew. Their answers were committed before grading. This was a masked retrospective test for the respondents. The scoring rule assigned equal weight to cold time and peak heap on three apps.

For a baseline of 100 ms and an observed 97 ms, the actual effect is −3%. Predicting −5% gives two *percentage points* of absolute error. In the real experiment the truth for each app/metric was the median of four percentage changes formed inside matched blocks. Recomputing from the original rows gave mean errors of 1.003 percentage points for Opus, 1.126 for Sol and 1.172 for the additive benchmark. Both models predicted all six directions. Leaving out Editor in a post hoc sensitivity analysis reverses the ranking between models, to 1.133 and 1.055. That fragility is consistent with having six correlated outcomes from one interaction on one device. The prespecified all-app score stands. [Independent scoring and sensitivity](../various/forecast.json) · [Original masked protocol](../../PICOCALC-COMPILER-LAB--measure-cold-compilation-and-test-bounded-compiler-designs-on-the-handheld/various/paired-review/01-protocol.md)

A point prediction and a causal explanation have different tests. The number of 1,024-word output chunks falls from 22 to 21 on Editor when fusion reduces the instruction count. That accounts for one 4,096-byte backing allocation. The whole-compiler peak also includes the existing objects still live when each allocation is made. A peak after emission can include objects allocated during emission. Distinguishing the models’ proposed mechanisms requires allocation-site and lifetime measurements at the peak.

## What the experiments identify

The cursor scanner gave the most reproducible clean time gain in the configurations tested. Its largest Editor boot median saved 315 ms and its peak grew on all four measured boots. Staged lowering demonstrated that Editor’s instructions and entry table fit inside 80 KiB, with a substantial standard-slot cold-time penalty. The bounded selector preserved the arithmetic opportunity on one unseen real app at a fraction of the charged work. It needed roughly 15 KB more peak heap than the production policy and lost all opportunity when an equally expensive but unproductive prefix exhausted its allowance. Incremental reuse reproduced the entire executable across real edits and showed where relocation and record-wide invalidation consume work even after parsing can be skipped.

Each statement has a defined comparison, an artifact, a unit and an observation that could overturn it. Evaluating a new combination of these changes requires implementing and measuring that combination on the same pinned control. Effects from independent builds include different setup and overlapping live allocations. Adding their stopwatch savings or their peak deltas cannot qualify a joint cold-build target.
