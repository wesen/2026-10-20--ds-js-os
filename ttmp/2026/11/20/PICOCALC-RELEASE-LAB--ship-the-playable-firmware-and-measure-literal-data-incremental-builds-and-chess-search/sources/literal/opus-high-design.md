# Literal Data Pool with Bounded Native Copy for the RV32 Typed Backend: Design and Preregistered Evaluation

This document is written for you as the implementer. It contains a design, a set of checks to pass before measuring, and an evaluation plan whose hypotheses, thresholds and decision rules are fixed now, before any results exist.

All numbers here fall into one of two kinds:

- **Given:** taken from the project brief.
- **Predicted:** derived from a stated assumption and labeled as a prediction. A prediction is something your measurements can contradict.

No result in this document has been measured.

---

## 0. Scope

**In scope:**
- An opt-in compiler option that changes how `buffer.writeLiteral(start, "text")` is lowered by the direct RV32 backend.
- The option does not change the source language, the source text, the Wasm output, or the default compile path.

**Out of scope:**
- Changes to the Typed language.
- Wasm bulk memory (`memory.init` / `memory.copy`).
- Substring or suffix sharing.
- Any change to the source the game SDK sends.

The SDK must still send the exact authorized 61,022-byte Chess source. The option is enabled through compiler configuration, never through a source edit or pragma. Record the SHA-256 of the source in every run so a reviewer can confirm that all arms compiled identical input.

---

## 1. Quantities and notation

For a compiled image, define:

```
C = instruction bytes (all functions + entry stub + import stubs)
D = literal pool bytes
P = alignment padding bytes
I = C + D + P                    (image bytes placed in the slot)
K = slot capacity = 262,144      (256 KiB)
H = K − I                        (headroom)
```

For one `writeLiteral` site j, the literal has n_j UTF-16 code units u_{j,0} … u_{j,n_j−1}, with each u in [0, 65535].

```
S_scalar,j = exact bytes the current scalar path emits for the unit stores at site j
F_j        = exact bytes of the pool-path copy sequence at site j
S_pool,j   = F_j + 2·n_j·first_j
first_j    = 1 if site j is the first pooled site with this exact unit sequence, else 0
```

Instructions that both paths share are excluded from both terms:
- the buffer and start evaluation,
- the range check and its trap branch,
- materializing the return value n.

**Given baseline for Chess:**
- I_A0 ≤ 256,400 machine-code bytes. You must report whether this figure includes the stubs.
- Headroom: H_A0 = 262,144 − 256,400 = **5,744 bytes**, if 256,400 is the whole image.
- Literal units: 16,316, across 16 sites, with n_j ≤ 1,022.

---

## 2. Design

### 2.1 Where the change enters the pipeline

The expansion happens today in `NumericFunctionEmitter`, which is shared by both backends. Add one structured opcode and one side table.

**Literal table.** It is built after parse/check and before emission. Each distinct literal content gets one entry:
- `id`
- `units`: the decoded code-unit array, the same array the scalar path consumes today
- `n`
- `poolOffset`: assigned at layout time, or "not pooled"

Two rules govern the table:

- **Deduplication key.** The key is the decoded unit sequence, not the source spelling. So `"\u0041"` and `"A"` map to one entry.
- **Map key.** Use a JS `Map` keyed by the JS string built from those units. JS strings are code-unit sequences, so `Map` equality is exact code-unit equality, including lone surrogates. There is no hashing collision risk and no normalization.

**New opcode `LIT_COPY(litId, n)`.** It is emitted immediately after the existing range-check opcodes, at exactly the point where the per-unit store sequence begins today.

**Lowering of `LIT_COPY` per backend:**

| Backend | Lowering |
|---|---|
| Wasm | Re-expands to the existing scalar `i32.const` + `i32.store16` sequence. Wasm output must be byte-identical with the option on and off. |
| RV32, site not pooled | The existing scalar sequence, byte-identical to today. |
| RV32, site pooled | The PC-relative copy sequence in 2.4. |

**Option flags:**
- `literalPool: off | on`, default `off`
- `literalPoolDedup: on | off`
- `literalPoolMinUnits: T`

With `literalPool: off`, the emitter must produce byte-identical IR and output to the current compiler. This is a regression gate in section 4.

### 2.2 Image layout and PC-relative addressing

The recommended layout puts the pool before the functions:

```
[ entry stub | import stubs | pool (D bytes) | pad (P ∈ {0,2}) | functions ... ]
  offset 0                    P0
```

**Why the pool goes first.** Parse/check completes before any function is emitted. All pooled literals, their offsets and D are therefore known before the first function byte exists.

- The pool can be written into the slot first and then forgotten. Only the table of offsets stays in memory (see 2.6).
- Every pool address is final when each function is emitted.

All instructions are 4 bytes (RV32IM, no C extension in this backend). Therefore:
- stub ends are 4-aligned, so P0 is 4-aligned with no padding;
- the pool ends 2-aligned;
- padding to the next 4-byte boundary is P = 2·(Σn mod 2) ∈ {0, 2}.

Control flow must never fall into the pool. The instruction immediately before P0 must be an unconditional transfer (`jal x0`, `jalr x0`, or the stub's tail jump). The review step in section 6 checks this by disassembly.

**Prerequisite: dead code.** This layout requires that the set of emitted functions is known before emission. If dead-function elimination happens during emission, a literal referenced only by a dropped function would waste pool bytes. In that case use the alternative described at the end of 2.6. Report which variant you built.

**PC-relative address computation.** For the `auipc` at absolute image offset `pc` that addresses entry k:

```
Δ  = (P0 + off_k) − pc                       (signed 32-bit)
hi = (Δ + 0x800) >> 12                       (arithmetic shift)
lo = Δ − (hi << 12)                          (−2048 ≤ lo ≤ 2047)
auipc rd, imm20   with imm20 = hi mod 2^20
addi  rd, rd, imm12 with imm12 = lo mod 2^12
Invariant: (hi << 12) + sext12(lo) = Δ
```

The `addi` uses the `auipc` result. The pc in the formula is the `auipc`'s own address, not the `addi`'s.

**When to patch.** Do not assume the emitter knows a function's absolute base while it encodes the body. Record a local fixup `(insnOffset, litId)` per site. Patch both instructions when the completed function is appended and its base is known. This uses the same patch-in-slot mechanism that import JALs already use.

**Why no ELF relocations are needed.** Pool and code sit in the same contiguous slot, so the reference is position-independent within the slot. No new ELF relocation entries are needed for the Espressif loader.

### 2.3 Pool format: alignment, endianness, UTF-16

- **Format.** The pool is a concatenation of entries with no headers. Lengths are compile-time constants placed in the code.
- **Alignment.** Each entry starts at a 2-byte boundary. The pool starts at a 4-byte boundary. Word-alignment of individual entries is used only in the optional variant A6.
- **Byte encoding.** RISC-V is little-endian and the buffer stores u16 little-endian:

  ```
  byte[P0 + off_k + 2i]     = u_i mod 256
  byte[P0 + off_k + 2i + 1] = floor(u_i / 256)
  ```

- **Store units, not characters.** The pool stores code units, not code points or characters. The copy moves bytes and never interprets them. As a result:
  - surrogate pairs (`\u{1F600}` → `D83D DE00`, n = 2),
  - lone high or low surrogates,
  - reversed pairs,
  - `0x0000` and `0xFFFF`

  are all reproduced exactly.

- **Pitfall to avoid.** Never build pool bytes through `TextEncoder`, UTF-8, `codePointAt`, `String.prototype.normalize`, or any API that treats the string as text. `TextEncoder` replaces lone surrogates with U+FFFD.
- **Source of truth.** Build bytes from the same decoded unit array the scalar path uses, via `charCodeAt` per unit. Treat that array as the single source of truth for both paths.

### 2.4 Call-site lowering and trap ordering

The existing semantics of a `writeLiteral` site are, in this order:

1. Evaluate the buffer expression.
2. Evaluate `start`, with its side effects.
3. Check the full range. Trap before any write if `start < 0` or `start > cap − n`, using the u32 capacity.
4. Write n units.
5. Yield n.

The pool path keeps steps 1–3 and 5 byte-identical to the scalar path. It replaces only step 4:

```
    ; steps 1–3: existing code, unchanged; failure branches to the existing trap
    ; rD = buf + 4 + 2*start  (existing destination computation)
    [addi  rD2, rD, 0]          ; only if rD must survive the site; otherwise use rD
    auipc rS, imm20             ; rS = pool entry address (patched, 2.2)
    addi  rS, rS, imm12
    addi  rE, rS, 2n            ; 2n ≤ 2044 fits signed 12-bit for n ≤ 1022
L:  lhu   rV, 0(rS)
    sh    rV, 0(rD)             ; (or rD2)
    addi  rS, rS, 2
    addi  rD, rD, 2
    bne   rS, rE, L             ; B-type offset −16
    ; step 5: existing result materialization, unchanged
```

This gives F = 32 bytes, or 36 bytes with the `mv`. The loop is do-while, which is correct because the threshold guarantees n ≥ T ≥ 2.

If n could ever exceed 1,023, replace the `addi rE` with `lui` + `addi` + `add`. Under the current 1,022 cap this never happens.

Please record why the cap is 1,022. If it exists because the scalar path's `sh` offsets 2i must fit in 12 bits (2·1021 = 2042 ≤ 2047), say so in the article.

**Why ordering is preserved:**
- The copy executes only on the fall-through path of an unchanged check, so no unit is written before the check passes.
- The copy cannot fault:
  - the source range lies inside the slot;
  - the destination range was just checked;
  - the destination is 2-aligned if the buffer base is 2-aligned (Gate 0b);
  - the source is 2-aligned by construction.
- The copy performs no calls, raises no trap, and has no side effects beyond the n checked units.
- The pool is not writable from Typed programs, because buffers are heap-allocated and never point into the slot. Therefore source and destination cannot overlap. State this invariant in the code.

A trap therefore leaves the buffer byte-identical to its pre-call state, exactly as today.

### 2.5 Registers, C ABI, leaf property

The inline loop uses four registers: rS, rE, rV, and rD or rD2. All four must be caller-saved temporaries (t0–t6 in the psABI) that are not live across the site.

**The risk of nested expressions.** `writeLiteral` is an expression, so it can appear inside a larger expression such as `x + buf.writeLiteral(...)`. If your backend holds the outer operand in a t-register at that point, the loop must not use that register. Do one of the following and document which:
- request the four registers from the backend's allocator, or
- treat the site as clobbering a declared set and spill live values out of it, the same way the backend treats a call.

**Properties of the inline loop:**
- It touches no s-registers, `sp`, `gp`, `tp`, `ra`, or stack memory.
- A generated function that was a leaf remains a leaf.
- Callee-saved state required by the C ABI at the entry stub is unaffected.
- Interrupts save the full register context under ESP-IDF, so mid-loop interruption is safe.

**Shared-helper variant (arm A3h, code folding of the loop).**
- Call sites use `jal t0, __litcopy` and the helper returns with `jalr x0, 0(t0)`. t0 is the psABI alternate link register, so `ra` is not disturbed.
- The helper's clobber set is exactly {t0, rS, rE, rV, rD} and must be declared to the allocator.
- Predicted saving: about (F_inline − F_call)·sites − helper size ≈ 16·16 − 24 ≈ 230 bytes on Chess. This is small, which is why it is a separate arm and not the default.

### 2.6 Streaming memory

With the front pool, the compile-time state you add is:
- the literal `Map` (references to strings the AST already holds, plus one record per distinct literal), and
- one fixup record per pooled site, discarded when its function is appended.

Pool bytes are written to the slot once, before functions, and are not retained.

Predicted extra peak heap: O(distinct literals + pooled sites in the largest single function). For Chess this is tens of records, not kilobytes.

**Alternative (tail pool).** Use this if the emitted function set is not known up front. Place the pool after the last function. Hold the pool bytes in memory until the end (D bytes, about 32.6 KB for Chess). Record every pooled site's `(absolute insn offset, litId)` and patch in-slot at link time. Report the extra D bytes against the 4 MiB limit.

### 2.7 Linker: entry and import relocations

The front pool shifts every function by D + P bytes. Requirements:

- **Entry stub.** Any reference from the entry stub to a function must be computed after layout.
- **Import JALs.** Patching is unchanged in mechanism, because its site and target offsets come from the final layout. JAL range is ±1 MiB and the slot is 256 KiB, so range cannot be exceeded.
- **Self-check.** Add a linker self-check that runs after all patching:
  - decode every patched JAL and every `auipc`/`addi` pair;
  - recompute its target;
  - assert that the target equals the intended function, stub or pool entry.

  The check costs one pass over the fixup list and turns a silent misrelocation into a compile error.

### 2.8 Per-site decision rule, threshold, and the size guarantee

**Do not model scalar cost; count it.** For each candidate site, run the scalar emission for that literal into a byte counter (a dry run) to obtain S_scalar,j exactly.

Exactness matters because the scalar cost depends on details you might model wrongly:
- a unit u ≤ 2047 is presumably one `addi` + `sh` (8 bytes);
- larger units presumably need `lui` + `addi` + `sh` (12 bytes);
- the emitter may or may not use the negative 12-bit immediate for u ≥ 0xF800, since `sh` keeps only the low 16 bits.

The dry run makes your answer match whatever the emitter actually does.

**Decision.** Process sites in deterministic source order. Pool site j if and only if both conditions hold:

```
n_j ≥ T     and     S_scalar,j > F_j + 2·n_j·[entry not yet in pool]
```

**Fallback argument (checkable).**

1. S_scalar,j and F_j are multiples of 4, and 2n_j is even, so every pooled site saves s_j = S_scalar,j − S_pool,j ≥ 2 bytes.
2. Padding is P ≤ 2, and it is nonzero only if at least one site is pooled.
3. If no site qualifies, no pool and no padding are emitted, and the image must be byte-identical to A0.
4. Otherwise:

   ```
   I_pool = I_A0 − Σ s_j + P ≤ I_A0 − 2 + 2 = I_A0
   ```

**The assumption behind step 4.** Changing a site does not change any other instruction. Branch relaxation is the only plausible violator, and shrinking distances can only shrink relaxed branches. Assert per function:

```
bytes_A0(f) − bytes_pool(f) = Σ_{j∈f} (S_scalar,j − F_j)
```

Report any deviation.

**Consequence:** enabling the option can never make a fitting program stop fitting. Gate G5 checks this on every workload.

**Practical threshold.**
- Size breakeven for ASCII with F = 36 and 8 bytes per unit: 8n > 36 + 2n, so n ≥ 7 for a first occurrence, and 8n > 36, so n ≥ 5 for a repeat.
- Runtime breakeven is unknown. For short n, the loop's per-unit branch and pointer updates may cost more than straight-line stores.
- Preregistered default: **T = 16**.
- Sweep T ∈ {2, 4, 8, 16, 32, 64, ∞}. T = ∞ is identical to A0.
- Chess sites are likely well above 16, so its result should be insensitive to T. The sweep matters for the heterogeneous programs.

### 2.9 Separating deduplication from code folding

The two terms mean different things here:

- **Deduplication:** data-level sharing. Identical unit sequences occupy one pool entry. It changes only D.
- **Code folding:** instruction-level sharing or shrinking. It changes only C. Examples are the shared copy helper (A3h) and reusing an immediate register when consecutive units are equal (A1).

A1 matters for honesty. ASCII art likely contains long runs of identical units such as spaces. A scalar emitter that skips the `li` when the value is unchanged would cut those units to 4 bytes. Without A1, the pool's gain over A0 would include savings that a much simpler scalar change could also capture.

**Arms:**

| Arm | Description | What it isolates |
|---|---|---|
| A0 | Current scalar | Baseline |
| A1 | Scalar + immediate reuse for equal consecutive units | Scalar-side code folding |
| A2 | Pool, inline loop, **no** dedup | Pool layout + copy |
| A3 | Pool, inline loop, exact dedup | A3 − A2 = dedup (D only) |
| A3h | A3 + shared helper via `jal t0` | A3h − A3 = loop folding (C only) |
| A5 (optional) | A3 + narrow entries (1 byte/unit, `lbu`/`sh`) for literals with all u ≤ 0xFF | Data encoding; not dedup and not folding |
| A6 (optional) | A3 + word copy (`lw`/`sw`) when start is even and the entry is 4-aligned, else halfword | Runtime only; the extra C is reported |

Do not rely on misaligned access in A6. Branch on the parity of `start` at runtime.

---

## 3. Gates (pass before measuring anything)

- **G0 — Data-readability of the slot.**
  - Emit a test function that loads a known 32-bit pool word via `auipc`/`addi`/`lw` and returns it.
  - Run it on the device with the slot exactly where production places it.
  - Record the slot's memory type (L2MEM or PSRAM) and address.
  - **Fail condition:** if the executable mapping is not data-readable at the same address (execute-only protection, or split I/D address spaces), the design as written is infeasible. Stop and report. That is a valid negative result.
- **G0b — Buffer base alignment.** Assert that `buf & 1 == 0` for every buffer the runtime allocates. Report the allocator's actual alignment.
- **G1 — Option-off identity.** With `literalPool: off`, IR and native output are byte-identical to the current compiler on all workloads. Compare SHA-256.
- **G2 — Wasm identity.** With `literalPool: on`, Wasm output is byte-identical to option-off on all workloads.
- **G3 — hi/lo split.** Exhaustively test Δ over [−2^20, 2^20], plus the boundaries Δ ∈ {±0x7FF, ±0x800, ±0x801, 0x7FFFF7FF, −0x80000000}. Check the invariant from 2.2.
- **G4 — Determinism.** Two compiles of the same source with the same options produce identical image bytes.
- **G5 — Size guarantee.** For every workload, arm and T: I_pool ≤ I_A0. Also check the per-function equality from 2.8.

---

## 4. Preregistered evaluation

### 4.1 Workloads

| Workload | Description |
|---|---|
| Chess | 61,022 source bytes; 16 sites; 16,316 ASCII units |
| Editor | Real workload |
| Non-ASCII | BMP units above 2047, values ≥ 0xF800, valid pairs, lone and reversed surrogates, 0x0000, 0xFFFF |
| Repeated | Identical literals at many sites, and identical content with different escape spellings |
| Boundary/trap | See 4.3 |
| Small | At least one program with no literals and one with only literals shorter than T |
| Heterogeneous | Many literals with n spread across [1, 1022] |
| Held-out | Programs written by someone who has not seen this design's results |

For the held-out set, record its SHA-256 in this preregistration before any arm is run on it. Do not modify the set afterward.

### 4.2 Size accounting

Sizes are deterministic, so no statistics are needed. Report exact integers.

For each workload × arm (and × T for the sweep), report one row:

| workload | arm | T | sites total / pooled / scalar | distinct entries | C | D | P | I | K | H | ΔI vs A0 | ΔI vs A1 | dedup bytes (A2−A3) | folding bytes (A3−A3h) | source SHA-256 | image SHA-256 |

**Definitions:**
- K is the linked slot section size taken from the ELF.
- Also report the smallest standard slot size the image would fit in, for example 128, 192 or 256 KiB.
- State whether the given 256,400 figure equals C or I for A0.

**Predicted values for Chess.** These assume c_s = 8 bytes per ASCII unit and F = 32, no dedup, and that the brief's 256,400 equals I_A0:

```
S_scalar,lit = 16,316 × 8      = 130,528   (≈ 50.9% of 256,400)
S_pool,lit   = 32,632 + 16×32  =  33,144
I_A3 (pred)  = 256,400 − 130,528 + 33,144 = 159,016   (≈ 62.0% of I_A0)
H    (pred)  = 262,144 − 159,016 = 103,128
I_A5 (pred)  = 159,016 − 16,316 = 142,700
```

If your measured S_scalar,lit for Chess is not 130,528, the assumption is wrong. Recompute from the measured value and report both. Do not adjust the hypotheses in 4.6.

### 4.3 Equivalence

**Oracles:**
1. A0 native on the device.
2. The Wasm build of the same source.
3. A small host reference implementation of the `writeLiteral` semantics.

All three must agree before you compare against the pool arms.

**What is compared, for every test case:**
- the full buffer bytes, including the capacity header and the units outside the written range;
- the return value;
- whether a trap occurred, and its kind;
- the ordered log of observable side effects (import calls, including those inside the `start` expression) up to the trap or the end.

Pre-fill buffers with a sentinel pattern (`0xA5A5` units). Where the harness allows it, place canary units beyond `cap` in the backing allocation to detect overruns.

**Boundary cases:**
- start = cap − n (succeeds)
- start = cap − n + 1 (traps)
- start = −1
- start = INT32_MAX
- start = INT32_MIN
- cap = 0
- cap = n
- n ∈ {T−1, T, T+1, 1022}
- odd and even start
- a `start` expression with a visible side effect, which must occur exactly once and before the trap
- `writeLiteral` nested inside a larger expression, to exercise the live-register rule in 2.5

**Pass criterion:** zero mismatches across all arms, all T values and all workloads.

### 4.4 Cold compile timing

**Definition of cold:** the first compile after a device reset, in a fresh QuickJS runtime under the 4 MiB limit. Warm compiles (the same process, repeated) are reported separately and labeled.

**Clock:**
- Use `esp_timer_get_time()` or `mcycle` (360 MHz) via a native binding.
- `Date.now()` is too coarse.
- If no binding exists, time the whole compile from C around the compile call, and report only totals.

**Stages:**
1. Parse/check.
2. Literal table and dedup.
3. Emission.
4. Link and patch.
5. Cache sync.
6. Total, from source received to slot ready.

**Protocol:**
- N = 30 cold runs per workload × arm.
- Interleave arms in a randomized order fixed by a recorded seed.
- Record peak QuickJS heap (`JS_ComputeMemoryUsage` at stage boundaries) and GC counts per run.

**Report:** median, IQR, min and max per stage, and the median ratio arm/A0 with a 95% bootstrap CI (10,000 resamples).

### 4.5 Runtime copy timing

**Microbenchmark.**
- One site per n ∈ {T−1, T, 16, 64, 256, 1022} × content class (ASCII; BMP > 2047; mixed surrogates).
- Call it 1,000 times inside a timed region.
- Subtract an empty-loop baseline.
- Report cycles per unit.

**Two cache states:**
- **Steady state:** median of 200 repetitions.
- **First call after cache invalidation:** median of 30, with an invalidation between each run.

Report where the slot resides (L2MEM or PSRAM). The two paths stress different caches:
- the scalar path fetches 8+ bytes of instructions per unit;
- the pool path fetches 2 bytes of data per unit from a 20-byte loop.

**Chess.**
- Time the frame-paint function: median of 200 frames, plus the first frame after load.
- Time end-to-end from source receipt to first frame (30 cold runs).

Use the same statistics as 4.4.

### 4.6 Hypotheses and decision rules

Each hypothesis, with the evidence that would refute it:

- **H1 (size, primary).** Chess I_A3 ≤ 0.75 · I_A0.
  - Refuted if I_A3 > 0.75 · I_A0.
- **H2 (size versus the simpler alternative).** Chess I_A3 ≤ 0.85 · I_A1.
  - Refuted if not. In that case, report that scalar immediate reuse captures most of the benefit.
- **H3 (guarantee).** I_pool ≤ I_A0 for every workload, arm and T.
  - A single violation refutes the fallback argument in 2.8.
- **H4 (memory).** Peak compile heap for the pool arms ≤ A0 peak + 16 KiB (front pool). For the tail pool the bound is A0 peak + D + 16 KiB.
- **H5 (compile time).** For Chess, the median total compile-time ratio A3/A0 < 1.0, with the CI excluding 1.0.
  - The prediction rests on emitting about 32,000 fewer instructions.
- **H6 (runtime, two-sided).** No direction is predicted for Chess frame paint. A difference is claimed only if the 95% CI of the median ratio excludes 1.0 **and** |ratio − 1| ≥ 0.02. Otherwise report "no practical difference."
- **H7 (null for small programs).** Programs with no site at or above T produce images byte-identical to A0. Any difference is a bug.

**Dedup on Chess:** no prediction. Exact duplicates may not exist, in which case A2 = A3. Report the observed value.

### 4.7 Negative results to expect and report as findings

- **Gate 0 failure.** The P4 mapping may not allow data reads at code addresses. The design then requires a separate data region outside "one image."
- **Small programs.** Zero change by construction (H7).
- **Heterogeneous programs.** Few sites qualify, so savings are small. Literals just above T may run slower per call than straight-line stores.
- **Compile time.** The extra pass and the `Map` may cost more than they save on programs with many distinct short literals.
- **Chess dedup.** Dedup may save 0 bytes.
- **Scalar alternative.** A1 may capture a large fraction of the saving if the art contains long runs.
- **Runtime with code in internal SRAM.** If the slot is in L2MEM with few instruction-cache misses, the loop may be slower than A0.

---

## 5. Falsification summary

The design is refuted as implemented if any of the following occurs:

- Any equivalence mismatch (4.3). Stop. No size or speed claims may be published from that build.
- Any gate G0–G5 fails.
- Any of H1–H4 or H7 fails as defined in 4.6.

H5 and H6 are performance claims. Their failure is reported, but it does not invalidate correctness.

---

## 6. Review steps

1. **Recompute from the dump.** Dump the literal table (id, n, offset, first site) and the per-site decisions with S_scalar,j and F_j. A reviewer recomputes D, P and Σ s_j by hand from the dump and checks them against the image.
2. **Disassembly.** Disassemble the Chess image with the pool range marked as data. Confirm three things:
   - the instruction before P0 is an unconditional transfer;
   - every pooled site matches the sequence in 2.4 exactly;
   - no pooled site's registers are live across it.
3. **Relocation audit.** Verify the linker self-check output (2.7) for every entry, import and pool reference.
4. **Byte-level pool check.** Compare the pool bytes against `units` with an independent script written by the reviewer, not the implementer. Check both byte order and lone surrogates.
5. **Diff the default path.** The reviewer reads the diff of `NumericFunctionEmitter` and the Wasm encoder to confirm the off path is untouched. The confirmation is G1 and G2 hashes, not visual inspection.
6. **Confirm the held-out set.** The held-out set's SHA-256 must match the preregistered value.

---

## 7. What to bring back

- Gate results G0–G5 with the evidence for each.
- The full size table from 4.2 for every workload, arm and T.
- Timing tables (4.4 and 4.5) with run counts, seeds, slot memory type and clock source.
- Heap peaks.
- Equivalence results: test counts and any mismatch with its reproducing case.
- Every deviation from this plan, stated as a deviation.

I will critique the results against the hypotheses as written here, including the ones that fail.
