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

## Step 2: Emit a certified guarded return at its call site

The parent and I chose a typed-tape summary for one bounded class of unary scalar functions. The actual integration, testing and host profiling were performed by the compiler coordinator. The Opus High researcher's second commission returned no implementation: its public response explicitly stated that none of its tool calls ran. I continued the approved compiler experiment locally. Credit for the executable register-home scorer, its private REPL tests and its public research notes remains with the Opus High researcher.

### Prompt Context

**User prompt:** See Step 1. The director requested one mechanism with the primary-stage compiler held fixed, and independent hardware validation.
**Assistant interpretation:** Recompile the same application under three policies, using a predictor cheap enough for streaming.
**Inferred user intent:** Determine the execution cost attributable to general scalar code generation.
**Commit (baseline):** `36adac5` — “research(shadow): reproduce dynamic caller costs and native GCC control”.

### What I did

- Added `guardedReturnSummary` and `GuardedReturnCode.call` in `picocalc-os/compiler/typed-rv32.js` plus an inspection decision on the exact call operation. Internal definition targets carry summaries. External import descriptors cannot set them.
- Added a normal compiler-entry test and `scripts/compile/04-correctness.mjs` for RV32 versus Wasm, including six predicate relations, i32 minimum, immediate encodings, live stack spills, effects of argument evaluation, bounds/division traps and short-circuiting.
- Replayed the three exact images using `scripts/compile/02-profile.mjs`. Ran `scripts/compile/05-host-cost.mjs` for 30 rotated host compile triplets.
- Sent the image-generation interface and full-frame count deltas to the director for independent board measurements.

### Why

- Keeping the callee's typed tape after function emission violates the compiler's existing memory discipline. Its summary fits a handful of scalar fields; an unresolved target simply takes the ordinary call path.
- Explicitly checking every operation in the body lets us move the result computation into the caller without duplicating side effects or skipping traps.

### What worked

- Candidate and baseline match Wasm return/trap and byte effects in the covered cases. The shadow-only image removes all 74,226 opening-frame calls at the two rewritten sites, accounting for 790,948 fewer guest instructions. The 264,928 executed bounds checks remain.
- The same option enabled for every caller admits other matching call sites and saves a further 102 dynamic instructions. Module size drops from 10,332 to 10,268 bytes; full observable-memory SHA-256 matches across all three images.
- On Node the median *paired* compile-time change of the general arm was −0.032 ms over 30 triplets. The active compiler is V8 on this host; this is not a P4 compile-cost measurement.

### What didn't work

- The Opus High implementation commission did not generate the requested code or run the proposed truth table. The coordinator implemented and verified the change and requested a separate authoring contribution.
- An informal ceiling from the register scorer used the old scalar-primary full-frame denominator. All implementation percentages use the current pie-empty control's 14,879,359 retired instructions.

### What I learned

- The helper disappears from the shadow path even though bounds checks and its two measured stack traffic counts remain exactly the same. The reduction comes from the caller's call sequence and the instructions inside the callee.

### What was tricky to build

- Branch operand order matters. For example the false condition of `x > K` is `bge K,x`, while the false condition of `x < K` is `bge x,K`. An action materializing a large literal may use two words, so patch the branch after emitting the action.
- Rejected forward calls must stay ordinary even in buffered mode. Summarizing in source emission order for both entry modes makes their output identical.

### What warrants a second pair of eyes

- Target selection, the end of the signed literal action, input argument identity in the spill case, and inspection ranges.
- A future proposed default should measure P4 compilation time; the firmware running precompiled test images measures execution.

### What should be done in the future

- Compare physical stage and full-frame time, adverse scenes and the Chess transfer selected before implementation.

### Code review instructions

- Run `node picocalc-os/tests/typed-rv32.test.mjs` and `node scripts/compile/04-correctness.mjs` (prefix the ticket path from the repository root).
- Compare the complete image hashes in the three `various/compile/*.json` captures to the board experiment's manifest.

### Technical details

- Six guard operators use equality, signed less-than and signed greater-or-equal branch encodings. The compare constant can use x0 or temporary t6. Only a constant return or wrapping negation is admitted. The argument already resides in its expression slot on function entry to the lowering rule.

## Step 3: Verify the two machine paths and finish the researcher chapter

The compiler implementation is in `3d18ebf`. The newcomer's guide and actual instruction words are in `33a7a42`. I profiled the individual branches that replaced the original two helper calls, supervised the sole Opus High author in a private REPL and incorporated the director's physical results into the researcher's chapter.

### Prompt Context

**User prompt:** See Step 1; the same user requested a pedagogical report and a detailed diary.
**Assistant interpretation:** Deliver a reproducible explanation with exact distinctions among guest instructions, guest cycles and compiler cost.
**Inferred user intent:** A reader can retrace why this particular mechanism was chosen, including the opportunity we deferred.

### What I did

- Matched the two sites by numeric-operation tape position and recorded disassembled words and executed word counts per linked binary.
- Recovered the second part of the researcher's chapter and its public diary from a partially returned CLI result; commissioned the same Opus High researcher for the introduction. Both private JS session transcripts are archived. The director seeded the same input data in the public-workbook design.
- Corrected technical terminology and attribution in the edited manuscript and added the independently reported P4 and Chess results. The researcher drafted the introduction, discussion of its own prototype, and host evidence section. The coordinator wrote the integration, tests, guide and physical follow-up.

### Why

- A machine opcode can appear in the candidate without ever executing. Dynamic counts distinguish the horizontal and vertical tests and the negative and nonnegative paths.
- The host wide-interval instruction estimate cannot predict the exact cost of a P4 branch. The natural-predicate and full-frame device measurements answer those separately.

### What worked

- Exact first site: offset 113 on the tape, 52,917 dynamic comparisons and 35,366 negations; second site: offset 147, 21,309 comparisons and 13,322 negations. Their total of 74,226 comparisons matches the removed calls.
- The director measured 4.73% median paired complete-frame improvement for general mode at the opening pose, with a 0.93% cold-build slowdown. All 72 full-frame pairs across twelve scenes favored general. The advanced Chess opening improved 10.22%.

### What didn't work

- The Opus CLI returned the second half of its JSON article in isolation, starting inside a string. The complete results section and diary were recovered, and a separate bounded authoring call supplied the missing introduction. Raw outputs preserve the author's original prose. The coordinator corrected an archive claim about the earlier entry-guard study and replaced two unsupported inferences about register promotion.

### What I learned

- The compiler removed a source helper that GCC already turned into local arithmetic. The current compiled Typed frame still takes approximately 6.87 times the C frame duration. Any next optimization has a substantial residual to explain.

### What was tricky to build

- The researcher's cell originally used both current and historical denominators. Keeping `opening` and `measured` distinct prevents an earlier, slower build being used as the current comparison.

### What warrants a second pair of eyes

- The paired percent and absolute medians are separate statistics. Read the director's board workbook when recomputing either.

### What should be done in the future

- Evaluate register homes with load-role attribution, a fixed scoring policy and four treatment arms to test interaction.

### Code review instructions

- Run `scripts/compile/07-chapter.py` to assemble the edited manuscript from the archived researcher prose and coordinator addendum. The matching JS and diary are in `various/compile/opus-article-*` and `opus-introduction-*`.

### Technical details

- The cold build trades about 2.6 ms extra compiler time for about 2.6 ms per opening frame. Both measurements refer to the P4, though their sampling and timing boundaries differ.
