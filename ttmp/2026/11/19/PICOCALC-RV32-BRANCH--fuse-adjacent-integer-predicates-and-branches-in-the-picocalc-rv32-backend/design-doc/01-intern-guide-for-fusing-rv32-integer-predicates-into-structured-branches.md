---
Title: Intern guide for fusing RV32 integer predicates into structured branches
Ticket: PICOCALC-RV32-BRANCH
Status: active
Topics:
    - picocalc
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://picocalc-os/compiler/typed-rv32.js
      Note: Current depth-indexed backend and long branch helper
    - Path: repo://picocalc-os/compiler/typed-wasm.js
      Note: Frontend comparison and structured-control opcode sources
    - Path: repo://ttmp/2026/11/19/PICOCALC-RV32-BRANCH--fuse-adjacent-integer-predicates-and-branches-in-the-picocalc-rv32-backend/scripts/02-predicate-fusion.patch
      Note: Experimental compiler diff against pinned baseline
    - Path: repo://ttmp/2026/11/19/PICOCALC-RV32-BRANCH--fuse-adjacent-integer-predicates-and-branches-in-the-picocalc-rv32-backend/various/guest.json
      Note: Paired linked-application guest steps
    - Path: repo://ttmp/2026/11/19/PICOCALC-RV32-BRANCH--fuse-adjacent-integer-predicates-and-branches-in-the-picocalc-rv32-backend/various/static.json
      Note: Image and per-function measurements
ExternalSources: []
Summary: Design and qualification guide for the PicoCalc RV32 adjacent predicate experiment.
LastUpdated: 2026-11-19T19:30:44.901982139-05:00
WhatFor: ""
WhenToUse: ""
---

# Intern guide for fusing RV32 integer predicates into structured branches

The PicoCalc RV32 compiler receives an array of structured integer operations from the typed frontend. A comparison normally writes a boolean to the current operand stack home. The conditional operation immediately after it reads that boolean and decides whether to transfer control. This experiment asks how much application code and execution the compiler can save by testing the original inputs directly.

## Starting point

Use revision `6426798f69c691f5c1979233ebdeb540f8ce7c61`. In `picocalc-os/compiler/typed-rv32.js`, `FunctionCode` assigns operand depths zero through four to `t0` through `t4`. Deeper values use 32-bit frame slots. `pop(T5)` or `pop(T6)` lowers the abstract height and loads a frame operand into the supplied scratch register if necessary. Arithmetic and comparisons consume operands, write their result in the next available depth, and push it onto the abstract stack. `begin(0x04)` consumes one condition before recording an `if` frame. The `0x0d` case consumes one condition and takes a branch to the loop start or block end when the condition is nonzero.

The previous depth-indexed register study reduced the three application images to 804 words for Files, 4,058 for Agenda, and 21,886 for Editor. It kept comparison results eager. The Scope A2 design proposes delayed comparison entries over a richer virtual stack. This experiment tests a narrower rule using the production depth-indexed implementation and adjacent frontend operations. The Scope A2 model includes lazy operand evaluation and has a different baseline. [Scope A tasks](../../PICOCALC-NATIVE-NEXT--a-smaller-rv32-backend-a-module-cache-safety-checks-and-await-for-typed-picocalc-worlds/design-doc/02-scope-a-an-rv32-backend-with-a-compile-time-operand-stack.md) · [Measured register baseline](../../PICOCALC-COMPILER-THESIS--cold-compilation-and-bounded-analyses-on-the-picocalc/various/reports/lowering.md).

## Follow the compiler call path

```text
typed source                  shared reactor ELF
     |                               |
     v                               |
typedWasm.compileFunctions           |
     |                               |
     v                               |
FunctionCode.lower                   |
     |                               |
     v                               |
image + entries + relocations        |
     |                               |
     +------> typedRv32.linkSlot <---+
                    |
                    v
            loadable native world
```

| Source file | Entry points and their result |
| --- | --- |
| `picocalc-os/compiler/typed-wasm.js` | `typedWasm.compileFunctions(source, functionBase, imported, maxSourceLength, numericOperands, onFunction)` emits validated function descriptors and record layouts. `typedWasm.compile(source)` produces an executable Wasm module for the focused fixtures. |
| `picocalc-os/compiler/typed-rv32.js` | `typedRv32.compile(source, imports, maxSourceLength, options)` emits an image with entry offsets, imports, relocation records and signatures. `typedRv32.linkSlot(program, reactor, entries)` returns a copy of the reactor ELF with entry stubs, call trampolines and generated code filled in. |
| `picocalc-os/worlds/files/compile.js` | `compileFilesRv32(source, reactor, options)` validates the four Files exports and fills their reactor slot. |
| `picocalc-os/worlds/agenda/compile.js` | `compileAgendaRv32(source, reactor, options)` validates the Task and EntryError layouts, checks the six Agenda exports and links the program. |
| `picocalc-os/compiler/typed-world.js` | `compileTypedWorldRv32(source, reactor, options)` supplies the 28 SDK imports and validates the typed world ABI. Editor uses this entry point. |

Read `FunctionCode.step` first to see the decoded instruction dispatch. Follow `begin`, `end`, and `branchTarget` for structured labels, then `pop` and `push` for layout. The candidate adds `fuseBranch` immediately before ordinary lowering of predicates.

## The equivalence to implement

A comparison over two integers consumes both and produces one integer with value zero or one. The following conditional consumes that integer. When the two operations are adjacent, a direct RV32 comparison and branch has the same net effect on the operand stack and selects the same successor. For `if` the explicit jump takes the alternate path when the condition is false. For `br_if` it takes the label path when the condition is true. The branch emitter accepts the predicate for taking the jump. It emits the inverse as a local branch over an unconditional `jal zero,target`. This distinction matters because the opcode seen in the image is the inverse of the logical jump predicate. [WebAssembly execution semantics](https://www.w3.org/TR/wasm-core-2/#exec) · [RV32I control transfer](https://docs.riscv.org/reference/isa/unpriv/rv32.html#conditional-branches).

| Frontend operation | True predicate for `br_if` | False predicate for `if` |
| --- | --- | --- |
| `i32.eqz a` | `beq a,zero` | `bne a,zero` |
| `i32.eq a,b` | `beq a,b` | `bne a,b` |
| `i32.lt_s a,b` | `blt a,b` | `bge a,b` |
| `i32.gt_s a,b` | `blt b,a` | `bge b,a` |
| `i32.le_s a,b` | `bge b,a` | `blt b,a` |
| `i32.ge_s a,b` | `bge a,b` | `blt a,b` |
| `i32.ge_u a,b` | `bgeu a,b` | `bltu a,b` |

The funct3 values are 0 and 1 for equality, 4 and 5 for signed ordering, and 6 and 7 for unsigned ordering. In each pair, XOR with one complements the test. The original operand order still determines the relation. For `x <= y`, reversing the operands changes the test to `y >= x`, which includes equality. The unsigned check matters for the frontend's buffer operations. An index of `-1` has the bit pattern `0xffffffff`, which is greater than any supported buffer length under unsigned ordering and must select the trap arm.

Accept one optional adjacent `i32.eqz` between the predicate and branch to cover negated comparisons and loop exit tests. That extra opcode flips the true predicate. The lookahead is limited to two cells after the current opcode. The array is the frontend's structured representation, where operands and numeric immediates occupy separate cells. The lookahead starts after an opcode whose arity as an instruction is known and whose encoding has no immediate cells. Advance the reader only once a supported consumer has been found. A comparison that feeds assignment, return, a call, or a longer expression still computes its ordinary zero-or-one value.

## Preserve the operand and control invariants

Read the right operand first into `t6` when spilled. Then read the left operand into `t5` when spilled. The predicate uses the two resulting locations, in the selected order. A unary `eqz` uses `zero` for its right operand. Neither operand is written by the RISC-V branch. The number of popped operands is identical to the baseline's net change after materializing and consuming the boolean. `begin` records the post-pop height so both arms still begin above the same live operand prefix. `br_if` must interpret the label index with the same current control stack as `br` and the ordinary `br_if` path.

```text
look up predicate encoding for the current opcode
look ahead for if or br_if, allowing one optional eqz
if the lookahead matches:
    consume only the matched opcode cells
    read predicate operands from their existing homes
    complement the predicate if an additional eqz was consumed
    if consumer is if:
        reuse the ordinary block opening with the supplied operand registers
        jump to alternate on false
    else:
        read the usual branch label index
        jump to that label on true
```

The baseline for `if (a > 0)`, after its two inputs have been read, emits `slt t0,t1,t0`, `bne t0,zero,+8`, and `j alternate`. The candidate emits `blt t1,t0,+8` and `j alternate`. The condition's constant still occupies its ordinary home because operand production is eager. The B-type predicate always branches by eight bytes. The target is reached by the current J-type relocation, so the rule applies equally to a short arm and one longer than 4,096 bytes. Identical control flow preserves the number of taken unconditional jumps on a fixed execution.

A shallow signed comparison should save one or two words according to its baseline boolean sequence. An optional `eqz` can save another word. A spilled boolean result can also save the store and subsequent load, although reads of the original operands are still required. Distinguish these savings from branch shortening. A separate experiment could change relocation layout and measure the effect of eliminating the unconditional jump.

## Implementation and measurement sequence

1. Save a patch against the pinned baseline in this ticket. Build an isolated compiler pair from the same tracked commit and apply the patch only to the candidate directory. Confirm that the two compiler trees differ only in the backend.
2. Compare all three application images through `typedRv32.compile`. Compute their SHA-256 digests, words per function, and opcode mix. Compare buffered and streaming code, signatures, record layouts, entry offsets, and relocation records within each compiler. Run app packaging through the normal Files, Agenda, and typed SDK entry points.
3. Compare WebAssembly with both RV32 images on signed extrema, equality, reversed arguments, and zero. Exercise `if` with two arms, result-producing joins, `while`/forward exits, late materialization, spilled operands, and names obtained from calls. Assert buffer bounds with an index below zero, at zero, at the last valid index, and at the length. Include one large arm to verify the long jump. Record linked emulator output identities for normal app paths.
4. Measure complete driver steps under the RV32 emulator for fixed app workflows. Use the same executable, inputs and module pathname for each pair. Capture full stdout hashes and each raw guest count. Count instructions as guest work. Physical hardware timing requires the same board, compiler build conditions, data layout and workflow on both runs.
5. Record node, cross-GCC, and emulator versions and binary provenance. Keep benchmark scripts, the exact patch and raw outputs together. Report which outcomes came from the isolated source comparison, emulator, or board.

The patch remains experimental in this ticket while the supervisor evaluates the paired hardware result.

## Measured code shape

These counts come from compiler output at `6426798` and the ticket patch. Each word occupies four bytes. One imported call occupies a four-byte relocation placeholder until link time.

| Application | Baseline words | Candidate words | Reduction | Bytes reclaimed inside the slot |
| --- | ---: | ---: | ---: | ---: |
| Files | 804 | 738 | 8.21% | 264 |
| Agenda | 4,058 | 3,784 | 6.75% | 1,096 |
| Editor | 21,886 | 20,507 | 6.30% | 5,516 |

Conditional branch counts are 75, 323 and 1,037 in both lanes. The candidate emits 25, 100 and 582 signed or unsigned conditional branches respectively. The baseline uses equality conditional opcodes for boolean branches and local trap sequences. The unchanged totals include internal calls, ordinary conditional jumps and import relocations. The shared reactor reserves a fixed code area. Linked ELF sizes remain 24,424 bytes for Files, 66,364 for the locally built Agenda reactor, and 240,452 for Editor. The source bytes, image digests, per-function counts and 31 alternating warm host timing samples are in [static.json](../various/static.json).

The disassembly verifies the example on a real cross-toolchain. The baseline is 22 words with a local branch target at `0x34` and an alternate at `0x44`. The candidate is 21 words with target offsets recomputed at `0x30` and `0x40`.

```text
baseline  0x28  slt t0,t1,t0
          0x2c  bne t0,zero,0x34
          0x30  jal zero,0x44

candidate 0x28  blt t1,t0,0x30
          0x2c  jal zero,0x40
```

`t0` is the original signed variable `a`. `t1` holds zero. The candidate reads both operands at the comparison. An `a` greater than zero takes the local branch into the body. Zero and negative `a` fall through to the jump to the alternate. The candidate executes one fewer instruction on either path. [Full bump disassembly](../various/bump-disassembly.txt).

## Host qualification

The focused suite compared 1,343 vectors with an actual WebAssembly instance and both RV32 images, including 24 expected traps. It tested signed i32 extrema, equality, zero as either operand, early return, loop exits, several operand depths through 8, the same memory sentinels after successful and trapping accesses, and the order of side-effecting calls through a short-circuit expression. Its large-arm fixture produced a 12,004-byte `jal` displacement. The 37,445 → 34,526 interpreted steps characterize the selected vectors. Whole linked applications were also run in a separate RV32 emulator. [Differential receipt](../various/differential.json).

| Local guest workflow | Baseline guest steps | Candidate guest steps | Reduction |
| --- | ---: | ---: | ---: |
| Files startup, sorting, rounding and directory creation | 88,823 | 88,750 | 0.08% |
| Agenda persistence, mutations, grouped navigation and refresh | 2,193,310 | 2,132,824 | 2.76% |
| Editor edit and save | 2,543,239 | 2,376,228 | 6.57% |
| Editor large open | 7,621,786 | 7,081,589 | 7.09% |
| Editor dense inline preview | 22,853,317 | 21,519,713 | 5.84% |
| Editor late navigation | 42,316,056 | 38,662,647 | 8.63% |

Each series used baseline, candidate, candidate, baseline. Every workflow produced the same stdout digest over all four runs. The absolute count includes the driver, reactor and application from entry to completion. Hostcalls run outside the guest and the counter records the guest instructions that reach them. The Files workflow spends relatively little of its 88,823 guest steps in comparisons the compiler can fuse. Editor frequently executes the affected code in rendering and navigation. Different path weights account for different percentage changes. [Paired whole-driver receipt](../various/guest.json).

All 24 existing PicoCalc host replays passed with each compiler bundle. They cover typed Files, Agenda calendar calculations and entry prompts, and complete Editor workflows including editing, search and large previews. [Baseline receipt](../various/baseline-replays.txt) · [Candidate receipt](../various/candidate-replays.txt).

## Reproduce the experiment

From the project root, use the code and app sources from `6426798` and keep the compiled host simulator and typed Wasm reactors available. The application scripts use the RISC-V GCC that built the fixtures and CJI's `rv32emu` with its adjacent support objects. Pass those local paths explicitly. The constructor creates new output directories containing the pinned `wasm.js`, `rv32.js` and `world.js` for each lane. Loading these as the corresponding typed compiler bundle selects the lane through the ordinary runtime entry points.

```bash
ticket=(ttmp/2026/11/19/PICOCALC-RV32-BRANCH--*)
work=$(mktemp -d)
bash "$ticket/scripts/01-construct.sh" "$work/pair"
node "$ticket/scripts/03-apps.mjs" count "$work/pair"
node "$ticket/scripts/04-differential.mjs" "$work/pair"
python3 "$ticket/scripts/05-guest.py" "$P4_GCC" "$RV32EMU" "$work/pair"
node "$ticket/scripts/08-worked-example.mjs" "$work/pair" "$P4_OBJDUMP"
```

The constructor's expected baseline and candidate lowerer hashes begin `64d5c155` and `8cdf92a2`. Confirm the full [compiler hashes](../various/compiler-sha256.txt) and take a fresh matched measurement if any application source, SDK, reactor, VM support object, or compiler file differs. These checks establish mechanical fusion and application behavior over the captured workloads. A physical run can measure target compile time, peak runtime heap, and cycles separately.


## Physical ESP32-P4 result

The supervisor built one temporary firmware with the exact baseline and branch compiler bundles, the same Editor source bundle and reactor, and one fresh QuickJS runtime per cold invocation. Each treatment ran once in each position across four balanced blocks. The first boot produced these medians.

| Measure | Baseline | Candidate | Candidate difference |
| --- | ---: | ---: | ---: |
| Cold Editor compile | 2,483,993 µs | 2,450,901.5 µs | −33,091.5 µs |
| Peak accounted QuickJS heap | 1,410,878 B | 1,394,718 B | −16,160 B |
| Linked Editor ELF | 240,452 B | 240,452 B | 0 B |

The candidate completed faster in three of four paired blocks. The three winning differences were 31.421, 60.010 and 34.501 ms. The fourth was 12.148 ms slower. The colder compile effect is small relative to the variation in this sample. Timing includes reading the source and reactor, creating the compiler runtime and compiling, linking, and tearing down QuickJS. The allocator peak is the highest sum of accounted live QuickJS allocation sizes. The baseline and candidate hashes match separate host oracles built with the actual board reactor. [First boot receipt](../../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/p4-first-boot.json).

The same firmware also executed the two directly linked versions of `filesCompare` on core 1 at 360 MHz. Both returned expected values and identical batch checksums. The exact symbol bytes were independently verified before the run. Each fixture used two warmup blocks followed by 16 alternating pairs of batches. A batch made 128 calls. The emitted function was 428 bytes in the baseline and 392 in the candidate.

| Inputs | Median paired cycle reduction | Faster candidate blocks |
| --- | ---: | ---: |
| Two equal 91-unit names | 13.95% | 16/16 |
| First mismatch at unit 91 | 13.96% | 16/16 |
| Equal prefix of 71 units | 13.90% | 16/16 |
| First-unit mismatch | 9.48% | 14/16 |
| Directory ordering shortcut | 0.04% | 9/16 |

The directory shortcut measured about 30 cycles per call and the baseline-versus-candidate order splits differ in sign. The first and last mismatch patterns exercise different iteration counts. These warm paired calls measure the native comparator on the specified inputs. The Files linked guest workflow has a different denominator that includes startup, other app operations and the reactor. [Independent board audit](../../PICOCALC-RV32-STUDIES--independent-picocalc-compiler-studies-of-branch-lowering-and-output-lifetime/various/examiner/board-first.json).


An independent boot repeated the same four clean blocks and comparator batches. The repeat's cold medians were 2,463,364.5 → 2,461,632.5 µs. The median of within-pair savings fell from 32,961 µs on the first boot to 2,977.5 µs on the repeat. The candidate finished sooner in three of four pairs on each boot. Peak accounted QuickJS heap fell by 16,144 B at the median in the repeat. The long comparator reductions repeated at 13.96%, 13.96%, and 13.90% for equal, late mismatch, and equal prefix. The cold runtime effect varies substantially by boot. The roughly 16 KiB accounted peak reduction and approximately 13.9% cycle savings for the long comparator inputs persisted.
