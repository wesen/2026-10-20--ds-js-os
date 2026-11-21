---
Title: Compiler research investigation diary
Ticket: PICOCALC-SHADOW-CODEGEN
Status: active
Topics: [compiler, performance, picocalc]
DocType: reference
Intent: long-term
---
# Compiler research investigation diary

## Step 1: Measure work before choosing the native lowering

The opening pose launches a visibility test for each floor pixel. I reproduced its generated RV32 body together with the active packet compiler for the primary intersections. I counted fetched machine instructions rather than estimating loop trip counts from source. An authenticated Opus High researcher first explored the register-promotion alternative using the archive in an independent REPL session. The director and I selected a smaller optimization once the fresh call counts became available.

### Prompt Context

**User prompt (verbatim):** “we focus purely on the compiler, to write the same algorithm than the C version, and try to compile to as good as possible. 

so is the next topic to target how goo the shadow code is getting compiled?”

**Assistant interpretation:** Measure and improve lowering of the original Typed floor-shadow loop.
**Inferred user intent:** An improvement that a compiler developer can reproduce and explain on another program.

### What I did

- Ran `scripts/compile/01-opus.py design`; its isolated JS notebook is `various/compile/opus-design-repl.jsonl`. Stored the working scoring prototype and researcher's public investigation notes beside it.
- Ran `scripts/compile/02-profile.mjs baseline` on the complete 160×160 opening frame in the ABI-checking RV32/PIE emulator.
- Extracted production GCC optimized GIMPLE and RV32 assembly for `in_shadow` with `scripts/compile/03-gcc-reference.py`.
- Registered compiler toggles and a caller-only treatment with the director before board testing. Commissioned the same Opus High researcher sequentially to implement the guarded-return mechanism.

### Why

- The previous forecast included checked-address loads, temporary spills and ordinary locals. A stack load can become a move without reducing the retired instruction count. Every new callee-saved register also costs two instructions per invocation. The helper measurement offers a simpler treatment with a direct GCC comparison.

### What worked

- Image `9a4a2356…` retired 14,879,359 instructions in the full frame. The shadow body alone retired 5,528,397. Its two call sites entered the signed-magnitude helper 74,226 times. All calls into that helper throughout the frame retired 691,244 instructions inside it.
- Both the C GIMPLE and machine listing show absolute-value computation in the caller. GCC uses arithmetic shift, XOR and subtraction on the actual comparison path. The relocation table contains no internal helper calls in this function.

### What didn't work

- The first run passed a trailing hyphen in the binary prefix and tried `riscv32-esp-elf--as` (`ENOENT`). The Node vendor subprocess required sandbox approval (`EPERM`). Espressif's vendor PIE operand printer returned `t5` where the emulator expected `/^x\\d+$/`. Normalizing the 32 ABI register aliases for decoded PIE instructions resolved that discrepancy.

### What I learned

- Dynamic stack traffic in a caller and dynamic instructions inside its callee cover different addresses. The stress on shadow's stack is real; the estimated ceiling for removing memory traffic does not rank equally cheap implementations.

### What was tricky to build

- The primary-stage PIE path must execute unchanged even when measuring a scalar floor pixel. Measurements use a whole image hash and normalize only the vendor's register spelling.

### What warrants a second pair of eyes

- Verify that an earlier body has been proven before rewriting an internal call, that an import can never manufacture its own proof, and that a negative i32 still wraps at INT_MIN.
- Check both draws and observable side effects before a trap. Changing the number of instructions executed before a trap is expected.

### What should be done in the future

- Implement a guarded numeric return summary, then independently run the same full frame, blind Chess workload and P4 timings. Revisit register allocation once we know the remaining code shape.

### Code review instructions

- Reproduce the unchanged baseline and compare `various/compile/baseline.json` with the immutable prior scalar breakdown. Read `gcc-in-shadow.gimple` and `gcc-in-shadow.asm` side by side.

### Technical details

- The shadow caller's closure over its two helper calls excludes the helper PCs from the 5,528,397 count. Its 264,928 unsigned text-buffer checks all execute in the candidate specification. All arms keep `pieLoops: "pie-empty"`. The treatment uses `inlineGuardedReturns` with either `true` or a predicate selecting a single caller.
