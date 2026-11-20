---
title: "PicoCalc RV32 Independent Examination"
Ticket: PICOCALC-RV32-STUDIES
DocType: reference
created: 2026-11-19
---

# PicoCalc RV32 Independent Examination

## Begin with a question a program can answer

You are examining a compiler that runs on a handheld computer. Its input is a small typed language written with familiar JavaScript syntax. Its output can be WebAssembly (Wasm) or native 32-bit RISC-V instructions (RV32). Suppose a new native backend turns `if (x < y)` into one fewer instruction. A successful compilation cannot tell you whether it used the right branch direction, skipped a required function call, or correctly preserved a value which was already live. You need to execute the output and observe several aspects of the program's state.

There is a different examination for a change in how the compiler stores the words it emits. If the change promises to preserve every machine instruction, compare every byte. Then check that the public application compiler selects the changed path and identify the exact allocation the change removes. This guide develops both examinations from frozen source through a physical board measurement. The accompanying article explains what the measured results mean for each study.

## 1. Trace the two execution paths

A function has parameter and result types, a local-variable count and a body. The common frontend parses source, checks types and emits structured operations with an implicit stack of operands. Its Wasm path encodes instructions for a Wasm engine. Its native path uses numeric operands and feeds a completed function to the native lowerer, which chooses concrete RV32 register or memory locations for the stack values. The first five live depths have temporary registers. Deeper values occupy words in the current function's stack frame. In particular, evaluating the right operand can leave the left operand live across a nested subexpression.

```text
typed source
    |
    +-- typedWasm.compile -------------> Wasm module --> Wasm engine
    |                                                      |
    |                                                return, memory, trap
    |
    +-- typedRv32.compile
           |
           +-- compileFunctions(..., numericOperands, onFunction)
           |       |
           |       +-- parsed function --> FunctionCode.lower
           |                                 |
           |                           emitted machine words
           |
           +-- resolve jumps --> raw image, entries, service relocations
                                      |
                      assembly driver + raw image --> RV32 emulator
                                      |
                                return, memory, trap
```

For application linking there is one more participant. The caller supplies a native *reactor*, an ELF file containing runtime code and a reserved executable slot. An entry stub connects a runtime function to a typed implementation at a known offset. A service trampoline connects a call in the typed code back to a native runtime service. The complete-world wrapper checks signature and record-layout requirements, then fills the copied slot. The candidate direct wrapper can pass the word slabs to this linker without materializing the standalone raw image.

Read these entry points in order:

- `picocalc-os/compiler/typed-wasm.js` defines `compileFunctions(source, functionBase, imported, maxSourceLength, numericOperands, onFunction)`. Look at `statement`, `expr` and `codeUnitAddress` before reading the numeric emitter. Those three functions determine the structured operations that a predicate may feed.
- `picocalc-os/compiler/typed-rv32.js` defines `typedRv32.compile(source, imports, maxSourceLength, options)`. Inspect `FunctionCode.pop`, `push`, `branch`, `begin` and `lower`. The public result contains `image`, `entries`, `relocations`, `records`, `importCount` and `signatures`.
- In the same file, `typedRv32.linkSlot(program, runtime, entries)` validates the ELF template, copies it and patches the typed entry instructions and service calls. The returned byte array owns a completed ELF.
- `picocalc-os/compiler/typed-world.js` defines `compileTypedWorldRv32(source, reactor, options)` for the shared world interface. Files and Agenda supply their own wrappers under `picocalc-os/worlds/{files,agenda}/compile.js`. The experimental direct variants select `compileForSlot` internally.

## 2. Generate a test whose observations can disagree

A useful pair of inputs exercises opposite paths. Start with `if (x === y) return 19; return -37;`. Two minimum signed integers should return 19. Minimum and maximum signed integers should return −37. Add a fixture that forces evaluation of a call with an effect. The `touch` function in our test increments a count and multiplies a sequence number by 17 before adding its argument. One additional call changes the count, and two calls made in reverse order can change the sequence even when the count agrees.

Here is language-neutral pseudocode for the success test:

```text
reference = execute Wasm(compiled by the frozen frontend)
candidate = assemble and link raw RV32(candidate source)
for each function and input:
    reset both memories to equivalent values
    call reference and read its return, trace fields and buffer
    call candidate with the guest pointers to its trace and buffer
    compare return, both trace fields and three UTF-16 units
    require the guest stack pointer to return to its original value
```

The test compiler embeds native bytes under assembler symbols at the offsets reported in `entries`. This rules out a test that computes an expected branch result by interpreting the same compiler data structure twice. `scripts/examiner/guest.mjs` emits the driver and calls the repository's CJI emulator. The assembly preserves expected data addresses in callee-saved registers so that ordinary clobbering of temporaries remains legal.

Add cases in three dimensions. First vary value representation: test signed extrema, equality, zero and nonzero values. Add an unsigned text access. Its generated guard checks whether the index, treated as unsigned, is greater than or equal to the buffer length. A position of −1 must trap. Second vary live depth: wrap `Math.max(x,y)` inside nested arithmetic until the comparison needs spill slots. Third vary the consumer: put comparisons in a returned boolean, a saved local, a short circuit, a loop guard and a far conditional with a large body. A peephole which examines adjacent operations should change only the eligible positions.

For each trap, run a fresh guest process. Verify the Wasm exception independently. On the RV32 path, check for `ebreak at` from the emulator, record a nonzero status and reject timeouts. This procedure distinguishes a generated trap from a program that crashes at an unrelated memory address.

## 3. Cross the physical buffer boundary with real source

Each fixed slab holds 1,024 32-bit words. A synthetic source can put a particular patch at the end of one slab without reaching into private lowerer data. Generate a function that adds 1 a variable number of times, compile it through the reference and observe how many words one repetition adds. Vary a handful of short prefix functions to adjust the remainder. Stop when the whole prefix ends at word 1,023.

At that point the next function's prologue is a suitable test. It reserves two words, emits the body, computes the frame size and writes the actual instructions back into the two reserved positions. The first lies at byte 4,092 and the second at byte 4,096.

```text
global word        1022     1023   |  1024     1025
slab / index       0/1022   0/1023 |  1/0      1/1
function                   entry  |  save RA  body ...
                            ^            ^
                      frame adjustments patched after lowering
```

Make a later function call both this function and an imported service. The raw image contains a resolved instruction for the local call and a zero at the service relocation. Verify every relocation, entry, metadata field and image byte against the frozen implementation. Preserve the successful raw result while you compile a failing program and a different valid one in the same realm. A shared buffer could otherwise let a later call mutate a result already returned to its caller.

For a public wrapper test, place a real ELF inside a larger byte array and pass a slice with nonzero offset. Check both the linked file and the sentinel bytes outside the slice. Use a second synthetic template with known slot dimensions to test the last word of legal capacity. Our two-entry test uses 20 header bytes, eight entry bytes, 112 import-jump bytes and 116 program bytes. A 256-byte slot fits. A 252-byte slot fails. The application hash from an ordinary real-world build cannot exercise both sides of this boundary.

## 4. Check the order of failure

Streaming gives the backend a chance to discover a native lowering failure before a later function has been parsed. The frozen compiler saves a native error and lets the source frontend finish. A later source type error therefore wins. Assembly range checks occur after lowering. If relocating an early jump now fails immediately, a caller may see the wrong error even when both versions reject the program.

```text
parse next function
    |--> lower, remembering first native error
    |--> parse subsequent source, propagating source errors
    |
end of source --> report remembered lowering error, if present
               --> resolve internal jumps
               --> validate world signatures and layouts
               --> validate template and write the slot
```

Generate the far-jump function and a nine-argument function in both source orders. The latter should fail first on a module with no parse error. Add a final return that has the wrong type and require the pinned line, column and message. Also combine a malformed template with invalid world metadata. The examining script compares exception type and diagnostic text from each candidate directly to those from the frozen compiler. These tests express a public contract between compiler stages. They require no arbitrary malformed internal operation stream.

## 5. Choose a cost measurement with the right denominator

| Quantity | Where to measure it | What the result answers |
|---|---|---|
| Occupied native bytes | Raw program image length | How much executable slot space the typed instructions need |
| Retired guest instructions | Difference between emulator counter reads around one call | How many modeled instructions the specified path executes, including the common driver window |
| P4 comparator cycles | Board counter around 128 real comparator calls with a result checksum | Cost of a warmed function on the tested core and strings |
| Cold compilation duration | Start before reading template/source, stop after freeing the QuickJS runtime | Elapsed time for the actual compiler path, including loading and teardown |
| Peak QuickJS bytes | High-water mark of live usable allocation sizes from the compiler allocator | Maximum accounted QuickJS heap in the run |
| Phase peak | Same allocator, while one labeled stage is active | Which stage reached the highest simultaneous charge in a profiled run |

Two probes can perturb each other. The supervisor uses uninstrumented trials for primary cold timing and separate profiled trials for phase attribution. Output buffers held by the firmware's ordinary C allocator fall outside the QuickJS counter. A fresh QuickJS runtime per invocation makes compilation cold at the runtime boundary even though multiple compiles execute in one board boot. A cycle count around repeated warm calls cannot supply a time for an interactive screen update.

For the physical branch test, inspect the linked symbols against the generator's manifest, then the runtime code hashes, five fixtures and 16 unique old/new pairs per fixture. The five inputs make the comparator exit at a directory flag, the first character, an unequal-length prefix, the last character, or after scanning all 91 equal units. The code hashes and each fixture's expected return checksum identify what was timed. Splitting the pairs by which implementation ran first checks for an obvious position effect. In small fast paths, the warm loop, call and hash account for a larger fraction of each batch.

### Compare your forecast to the first physical boot

If the only effect of a change were to eliminate a temporary 87,544-byte Editor image, would the heap peak move by 87,544 bytes? Calculate the maximum of the two stages in this table before reading the result. It contains the median phase high-water across two separately instrumented baseline and direct compilations.

| Live QuickJS bytes at each stage | Frozen compiler | Direct output |
|---|---:|---:|
| Assemble native words and resolve jumps | 1,415,086 | 1,208,626 |
| Copy and patch the ELF template | 1,394,058 | 1,414,468 |

The original reaches its maximum at assembly. Direct reaches it during the template copy. In four *uninstrumented* position-balanced blocks, the median paired direct-minus-original difference was **+3,218 peak bytes** while cold time fell **150.66 ms**. The instrumented medians locate the peak. The uninstrumented block pairs quantify the footprint change. Their absolute numbers differ because the measurement hooks themselves use time and memory.

The other two candidates give different tradeoffs on the same first boot. Compact output with the ordinary raw-image handoff used 7,720 fewer peak bytes and saved 78.95 ms per paired median. Branch fusion used 16,150 fewer peak bytes and saved 32.96 ms. All compared the 240,452-byte Editor ELF for each mode to its own expected digest. The output modes reproduced the frozen digest. Fusion changed the instructions in the fixed slot.

For the comparator, the 91-unit equality fixture saved 912.36 cycles per call in the median matched block. The directory-only case saved 0.01 cycles per call, and the two ordering groups disagreed on the sign. Treat the latter as unresolved at this scale. Read `various/examiner/board-first.json` for order splits, hashes and every stage median.

## 6. Run the same examination

From the repository root, prepare one branch pair, two output lanes and a directory holding three native reactor files. Use `scripts/01-construct.sh` from `PICOCALC-RV32-BRANCH` with a new path for its output. Use `scripts/01-prepare.py --mode compact --out DIR` and `--mode direct` from `PICOCALC-RV32-OUTPUT`. The reactor files are `files-reactor.elf`, `agenda-reactor.elf` and `typed-world-reactor.elf`. The test operation is read-only for these inputs.

Put the SDK’s `riscv32-esp-elf-gcc` on PATH (the study used GCC 14.2.0). Set `pair`, `compact`, `direct` and `reactors` to the directories just described.

```sh
exam=$(ls -d ttmp/2026/11/19/PICOCALC-RV32-STUDIES--*)/scripts/examiner
gcc=$(command -v riscv32-esp-elf-gcc)
cji=$(ls -d ttmp/2026/11/17/PICOCALC-CJI--*)
emu="$cji/sources/cji/build/rv32/rv32emu"
node "$exam/guest.mjs" "$gcc" "$emu" baseline
node "$exam/guest.mjs" "$gcc" "$emu" branch "$pair/candidate"
node "$exam/output.mjs" compact "$compact" "$reactors"
node "$exam/output.mjs" direct "$direct" "$reactors"
```

Look in the supervisor ticket's `various/examiner` directory for the recorded JSON. For the board audit, run `board.py UART FIRMWARE_ELF MANIFEST SUMMARY` from the examiner script directory. Pass the capture for one boot, the linked `picocalc-os-p4.elf` containing both comparator symbols, the generator’s `lab/manifest.json` and that boot’s supervisor JSON. The three native reactor templates used above are different ELF files with a different role.

The two `guest` files contain the same five-field result digest over 637 successful calls and six independently verified trap inputs. One comparison changes from 26 timed instructions to 24. The output files show all three public wrappers, their selected method, the exact image sizes and their constructor observations. The `diagnostics` object captures the competing errors described above.

To extend this study with a new optimization, first pick an input on which two plausible implementations could disagree. State the exact value, state transition or error order that would identify the wrong one. Then choose the measure that answers the proposed performance claim and preserve the raw results needed to recompute it. For these two changes the same application source supports both examinations, but the observables and cost models remain distinct.
