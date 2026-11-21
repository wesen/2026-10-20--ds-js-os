---
Title: Independent examiner investigation diary
Ticket: PICOCALC-SIMD-LAB
Status: complete
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
Summary: A retained REPL session, a cross-check of frame scope, and a differential test under register pressure.
---

# Independent examiner investigation diary

## Step 1. Pair the original physical times and verify what a fixture varied

I opened a separate persistent REPL and rebuilt the comparison from physical rows. The clean-frame claim reproduced on every fixture. Reading the actual call arguments exposed two pairs of primary fixtures that vary only in fields unused by that entry.

### Prompt Context

**User prompt (verbatim)** appears in the linked [research commission](../sources/research-commission.txt). The director assigned this independent examiner to re-pair the original frame measurements, challenge the opt-in lowering, and preserve the result in a short research note and diary. I interpreted this as independent analysis of the original acquisition plus a new compiler test.

### What I did

Ran `python3 scripts/director/09-open-lab-session.py --keep` from the ticket context and submitted [my independent cell](../scripts/examiner/frame-pairs.js) to session `session-06049390-fff5-4399-927d-926addbe1fb1` at port 3794. The cell reads `lab.frames` directly. It checks row count, fixture count and arm identities before subtracting values within a block. It saves the source digest and six differences for every fixture/phase pair. I compared the fixture manifest with the C call and Typed entry signatures.

### Why

Each arm has a time in the same block. Pairing at that level preserves the scheduled repetition. The fixture name alone cannot establish which arguments the target computation reads.

### What worked

All 432 rows gave complete triples. Opening color-frame differences in microseconds were 595, 502, 465, 561, 515 and 467. The median was 508.5. The color and primary entries each had 72 of 72 wins over baseline. There were twelve distinct color inputs and ten distinct primary inputs.

### What didn't work

No failures occurred in the independent pairing cell.

### What I learned

Strides distinguish surface layouts. Lamp-only mutations distinguish shaded color frames while leaving the primary input identical. Treatment order was balanced, but each treatment ran at its own linked address.

### What was tricky to build

Two metrics use different operations. A median time difference uses six signed differences. A median percentage first divides each difference by its own baseline time. The cell computes each quantity directly.

### What warrants a second pair of eyes

Check which operations occur inside the two native calls and which occur after the board timer. Check fixed code placement before attributing the entire time change to one instruction.

### What should be done in the future

If the exact contribution of packet instructions is the question, rotate code placement in another board trial.

### Code review instructions

Run the opener, then pass the contents of `scripts/examiner/frame-pairs.js` as the `source` field to the retained session's `POST /eval`. Compare its value with [the saved receipt](../various/examiner/frame-pairs.json).

### Technical details

The cell groups by fixture, phase and block. Arm 0 denotes the existing packed producer, arm 1 the empty bypass, and arm 2 the full-packet experiment. Phase 0 calls `typedRayFrame`. Phase 1 calls `typedRayTrace`.

## Step 2. Force scalar spills and observable trap prefixes

I wrote an accepted Typed function with a nested hit guard, a deep arithmetic expression, division, a checked write and a dependent checked read. I compared stock and opt-in RV32 against compiled Wasm on five inputs. Return values, traps and every supplied byte agreed.

### Prompt Context

See Step 1. I took the requested counterexample search to include a test that proves the optimized body actually executes under register pressure.

### What I did

Built [probe.typed](../scripts/examiner/probe.typed) using both RV32 modes and a separate Wasm compilation. The host driver decodes the final machine bytes with Espressif binutils, interprets them, and counts packet minima plus spill writes inside inspected hit-continuation ranges. I used one fixture with a short output and one with a zero divisor to distinguish store-before-trap from trap-before-store.

### Why

Identical output on inputs that always dispatch to the original loop cannot test register liveness in the packed continuation. A return value also cannot show whether a store survived a later trap.

### What worked

The aligned mixed case executed three packet minima and 50 spill writes in the packed continuation. It agreed with Wasm on the result of 124,130 and all 400 supplied bytes. The short buffer trapped after changing exactly two bytes in both RV32 modes and Wasm. The zero-divisor case changed none. A misaligned start and tail, and a zero-trip loop, also agreed. [Machine-readable receipt](../various/examiner/probe.json)

### What didn't work

From the ticket directory, the initial command was `node scripts/examiner/probe.mjs /home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20260121/riscv32-esp-elf/bin/riscv32-esp-elf`. The sandbox returned `spawnSync .../riscv32-esp-elf-as EPERM`. With permission to invoke the toolchain, the decoder returned the register name `t5` where the interpreter expected a numeric register spelling. The diagnostic was `The input did not match the regular expression /^x\d+$/. Input: 't5'`. The lab's documented 20241119 toolchain produced numeric operands. The replay passed with that version.

### What I learned

The ordinary emitter can spill a deep expression while preserving live packet state, including on a trapping iteration of this fixture. The tested actual image and the vendor decoder's register naming both matter for replay.

### What was tricky to build

I counted executed `sw` instructions with stack-pointer base and offsets beyond the emitter's locals and packet scratch. Restricting the PCs to the copied hit continuation excludes prologue and induction-variable stores from the count.

### What warrants a second pair of eyes

Any future extension to accept calls or additional memory operations in the continuation should revisit the scratch-register and memory-effect contracts. This experiment examined one extra accepted loop and five inputs.

### What should be done in the future

Use the probe as a focused regression fixture if the packet continuation gains new instructions or changes its register allocation.

### Code review instructions

From the ticket directory run `node scripts/examiner/probe.mjs /home/manuel/.espressif/tools/riscv32-esp-elf/esp-14.2.0_20241119/riscv32-esp-elf/bin/riscv32-esp-elf`. Compare the resulting JSON to the saved receipt. The [research note](../analysis/06-independent-replication.md) describes the inference boundary for both experiments.

### Technical details

The input buffer begins at address 64 and the output at 256. The aligned case starts at input element six, placing the first payload read at address 80. Eight leading misses exercise the bypass before the function encounters mixed hit and miss groups containing upper-half unsigned values. Stock and packed images have independent SHA-256 identities in the receipt.
