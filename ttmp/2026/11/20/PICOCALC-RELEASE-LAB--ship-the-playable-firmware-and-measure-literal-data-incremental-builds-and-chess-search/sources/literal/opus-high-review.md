# Independent review: literal-pool experiment, host-evidence stage

**Scope.** I reviewed only your implementation summary and reported numbers. I did not inspect the source, test harness, or artifacts. Every point below is either arithmetic on your figures or a claim that still needs evidence. I make no physical predictions.

## 1. Arithmetic check of reported figures

All sums are consistent.

| Case | Variant | Total | vs stock |
|---|---|---|---|
| Chess | halfword | 54320+33852 = 88172 | −65.6% |
| Chess | word | 55232+33852 = 89084 | −65.3% (word code costs +912 B) |
| Editor | halfword | 75268+2530+2 = 77800 | −12.7% |
| Editor | dedupe | 75268+2464 = 77732 | −12.8% (dedupe saves 66 data + 2 pad = 68 B) |
| Editor | word | 76124+2464 = 78588 | −11.9% (word code costs +856 B) |
| Held-out | pool / dedupe / word | 576 / 472 / 552 | −64% / −70.5% / −65.5% |
| Chess writer model | halfword / word | 82066 / 41324 | **+66.3%** / −16.3% dynamic instructions |

Things these numbers say that the write-up must not blur:
- The **halfword path executes 66% more instructions than stock** in the model. Any speed claim for halfword is unsupported, and the model currently argues against it.
- The word path's speed benefit is model-only. It costs about 900 bytes of code on both large programs.
- Dedupe has zero effect on Chess and saves 68 bytes on Editor. The only material dedupe result is a single held-out case.
- The held-out "word 552" figure needs a label: is it word with or without dedupe? 552 = 472 + 80 suggests it includes dedupe. State it.
- Word pool data is byte-identical to halfword pool data (33852, 2464). That means no alignment padding was inserted, and the word path is applied only to entries that happen to be 4-aligned. Report how many sites qualified at compile time and how many runtime executions took the aligned path versus the fallback.

## 2. Audit by requested area

**Implicit address / offset**
- The address local is `header-base + 2*start`, and native adds the +4 header offset. Confirm that `2*start` is formed only from the post-check value, and that the bounds check cannot wrap. For example, `start + n > len` fails for `start` near `INT_MAX`.
- The word path assumes pool entries are 4-aligned. Aligned relative to what? Offset within the extent only guarantees aligned addresses if the **runtime load base of the instruction extent is ≥4-aligned**. That is a loader invariant, and nothing in the evidence shows it holds.
- AUIPC/ADDI patching: hi20 must use `(delta + 0x800) >> 12` rounding. Your test corpus may never place a delta whose low 12 bits fall at 0x7FF, 0x800, or 0xFFF. Arena equality on 180 cases does not prove this was exercised.
- The 2044-byte limit (1022 code units) fits an ADDI immediate. Specify what happens above it (split, or stock fallback?) and test at 1021, 1022, 1023, 1024 and ≥2048 units.

**Overlap**
- "Cannot alias a valid heap buffer" is a property of where the loader places the text versus the heap arena. It is not a property of the compiler. On a host emulator with separate arenas it holds by construction, so the host tests cannot falsify it.
- Publish it as conditional: "under loader invariant X (text and heap disjoint); device placement unverified."

**Over-read**
- Confirm that the word path never reads past `[src, src+2n)`. A `lw` covering the final odd halfword of the last entry could cross the extent end. Value-harmless on the host, possibly faulting on a device if it hits a region boundary.

**Clobber**
- The t5/t6/a0/a1 claim needs a site-level proof, not end-to-end arena equality. Arena equality only catches clobbers that change observable output.
- Specific risks:
  - spill/reload sequences that use t5/t6 as scratch while operands overflow t0–t4 into stack slots;
  - any convention where a0/a1 hold incoming arguments, return values, or a trap code across the expression;
  - the trap path's register expectations, which matter if the check fails after any literal register is set.

**Streaming release**
- "Streaming and buffering output the same bytes" proves final-byte equality only. It does not prove incremental release.
- AUIPC fixups target the pool, which is placed after the instruction extent whose length is unknown until the end. Either there is a pre-pass, or patched bytes are held back.
- Show a release trace: for each released chunk, its offset and the fact that it contains no unpatched fixup. Also show peak retained bytes versus stock streaming. On the device's QuickJS, the pool contents and the dedupe map are retained until the end, which may raise peak memory. That has not been measured.

**Method dispatch**
- State the exact selection rule for the private numeric operation. Is it only when the receiver is statically the Typed UTF-16 buffer and the method is statically resolved?
- Show that it cannot be selected for dynamic, union, or shadowed receivers.
- Show that it cannot be produced from source (no user-reachable op id).
- Show that it never reaches Wasm lowering. Strongest evidence: **Wasm output byte-identical with the flag on and off**.
- If modules can be linked, ordinals must be module-local and pools must not collide. "Linker keeps all import and entry indices" should be demonstrated by a byte diff of those tables between variants.

**Size guarantee**
- You have aggregates only. A per-site guarantee ("pool never larger than stock at threshold 16") is not shown.
- Stock can be unusually cheap for some 16-unit literals:
  - all-NUL strings (store from `x0`, no materialization);
  - runs of one repeated code unit, if stock reuses the materialized register;
  - small values eligible for compressed encodings.

  Compute pool cost from the actual emitter, including setup, end computation, loop, data, and amortized pad, and compare per site.
- "Fixed-slot ELF envelopes stayed constant" means **file or slot size did not change**. The savings are in instruction-extent plus pool bytes. If the loader loads the full slot, RAM use is also unchanged. Say so explicitly.

## 3. Biggest gaps in actual evidence

1. **No execution of a live-loaded ELF with a pool on the device.** Nothing yet shows that:
   - the loader copies the appended pool;
   - the extent base satisfies the alignment assumption;
   - the memory holding loaded text is data-readable with `lhu`/`lw` at the AUIPC-derived address on your chip.

   The planned native timing deliberately avoids this path.
2. **The planned native harness may not run the "exactly generated" code.** If routines live in flash-mapped code and the pool is reached PC-relatively, data loads go through the instruction-side mapping. Confirm on your target that this is permitted.
   - If the harness relocates the pool to make it readable, the AUIPC/ADDI immediates differ from compiler output.
   - Hash the embedded blob, instructions plus pool contiguous, against compiler output, and record the result.
3. **It is unclear what executes native code in the Node tests.** If it is a RISC-V emulator, state whether it traps on misaligned access and enforces region permissions. If it is a JS model of the expansion, the encoder, patcher, and register usage are untested.
4. **The instruction counts are a model.** Cycles depend on cache misses, PSRAM write latency, and pool-load latency. Neither direction of physical timing follows from these counts.
5. **Coverage is shallow in places.** The held-out sample is n=1, and 180 hand-chosen cases are reported without evidence of their fault-detecting power.

## 4. Separating physical-copy conclusions from compiler claims

Keep two tables with distinct headings, and never merge rows.

- **Compiler claims.** Deterministic and host-verifiable: byte sizes, per-site sizes, Wasm identity, host-executed semantic equivalence, model instruction counts. Label the model with its source (emulator retired-instruction count versus static estimate).
- **Physical observations.** Device-only, valid for one configuration: chip, clock, flash mode/speed, PSRAM speed, cache configuration, firmware hash, compiler build hash, input source hash.
  - Compile timing label: "fresh QuickJS runtime per call, warm boot, interleaved".
  - Native timing label: "firmware-embedded generated routines, flash-mapped execution, PSRAM destination, not loaded-ELF execution".
  - Report per-run distributions and ordering (ABBA), not only means.
  - Record cycle-counter method and overhead.
  - Every reported timing row must have a passing full output-code-unit check from the same run.

Rule for the article: no sentence may justify a physical conclusion with a compiler number, or the reverse.

## 5. Focused publication corrections

- Replace "smaller binary" with "smaller instruction-extent + pool bytes; fixed ELF slot size unchanged".
- State that halfword increases modelled dynamic instructions by 66.3% on the Chess writer.
- Report dedupe impact as 0 B (Chess), 68 B (Editor), 104 B (one held-out case). Do not generalize.
- Report word-path code cost (+912 / +856 / +80 B) next to its model-only benefit.
- Make the aliasing claim conditional on the loader invariant.
- Describe the 180 cases: who generated them, how, and what executed the native side.
- Mark threshold 16 as fixed a priori, not tuned.
- State that the word path applies only to naturally 4-aligned entries (no padding), with qualification counts.

## 6. Highest-value local falsifiers (host-achievable)

1. **Per-site write/read/register audit in the emulator.** For each literal site (from a compiler site map), assert:
   - stores fall only in `[dest, dest+2n)`;
   - loads fall only in `[src, src+2n)`;
   - only t5/t6/a0/a1 and pc change.

   Run at operand-stack depths 0–8 with canaries in all live registers and spill slots.
2. **Strict emulator mode.** Trap on misaligned access, and load the extent at bases ≡ 0, 2 mod 4. This falsifies the source-alignment assumption if the loader guarantees only 2-byte alignment.
3. **Delta sweep.** Insert N filler instructions before a site so that the pool delta's low 12 bits sweep 0x7F0–0x810 and 0xFF0–0x010.
4. **Bounds edges.**
   - `start` ∈ {−1, INT_MIN, INT_MAX, len−n, len−n+1, len, len+1};
   - n ∈ {0, 15, 16, 17, 1022, 1023, 1024, 2048};
   - empty literal with out-of-range `start` must match Wasm trap/no-trap.
5. **Word-path residue matrix.** n mod 4 ∈ {0,1,2,3} × destination aligned/misaligned × entry aligned/misaligned.
6. **Per-site size table** with adversarial literals: 16 NULs, 16 identical units, 16 units < 32, 16 units ≥ 0x800. Flag any site where pool > stock.
7. **Dedupe key integrity.**
   - distinct lone surrogates (`\uD800` vs `\uDBFF`) must not share;
   - strings differing only in the last unit must not share;
   - confirm the key is code-unit-exact, not via a lossy encoding.
8. **Identity checks.**
   - Wasm bytes identical with the flag on and off;
   - import/entry tables byte-identical across variants;
   - repeated compiles deterministic;
   - an independent ELF parser (readelf/llvm-objdump) confirms section sizes include the pool.
9. **Streaming trace.** Assert no released chunk contains a sentinel (unpatched) immediate, and report peak retained bytes. On a host QuickJS build, measure peak heap for stock versus pool versus dedupe.
10. **Dispatch negatives.** Non-static receivers, shadowed methods, and multi-module ordinals. Use IR dumps to confirm the private op is absent.
11. **Mutation testing of the suite.** Inject these faults and confirm the existing 180 cases catch each:
    - off-by-one loop end;
    - dropped odd tail;
    - lo12 without rounding;
    - a literal temp moved to t4;
    - word path ignoring the destination alignment check.

    Any surviving mutant is a direct, publishable gap.

The device-side counterpart that should come before any timing claim: one run of the **live-loaded ELF** executing the Chess writer with the pool, with full output-code-unit verification and hashes recorded.
